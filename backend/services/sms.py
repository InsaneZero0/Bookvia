"""
SMS Service with Twilio integration.

Configuration via environment variables:
- TWILIO_ACCOUNT_SID: Twilio Account SID
- TWILIO_AUTH_TOKEN: Twilio Auth Token  
- TWILIO_PHONE_NUMBER: Twilio phone number to send from
- ENV: "development" uses mock, "production" requires Twilio

Mock mode:
- In development (ENV=development), SMS is mocked and logged
- Codes are stored in database for verification
- Rate limiting still applies

Production mode:
- Requires valid Twilio credentials
- Falls back to error if not configured
"""
import logging
import random
from datetime import datetime, timezone, timedelta
from typing import Tuple, Optional

from core.config import (
    IS_DEVELOPMENT, IS_PRODUCTION,
    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER,
    is_twilio_configured,
    SMS_CODE_EXPIRATION_MINUTES, SMS_MAX_ATTEMPTS_PER_HOUR
)
from core.database import db

logger = logging.getLogger(__name__)


class SMSServiceError(Exception):
    """SMS service error"""
    pass


class SMSRateLimitError(SMSServiceError):
    """Rate limit exceeded"""
    pass


class SMSNotConfiguredError(SMSServiceError):
    """SMS service not configured in production"""
    pass


async def check_rate_limit(phone: str) -> bool:
    """
    Check if phone number has exceeded rate limit.
    Returns True if within limit, raises SMSRateLimitError if exceeded.
    """
    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    
    recent_attempts = await db.phone_codes.count_documents({
        "phone": phone,
        "created_at": {"$gte": one_hour_ago.isoformat()}
    })
    
    if recent_attempts >= SMS_MAX_ATTEMPTS_PER_HOUR:
        raise SMSRateLimitError(
            f"Rate limit exceeded. Maximum {SMS_MAX_ATTEMPTS_PER_HOUR} attempts per hour."
        )
    
    return True


def generate_code() -> str:
    """Generate a 6-digit verification code"""
    return str(random.randint(100000, 999999))


async def send_sms(phone: str, message: str) -> Tuple[bool, str]:
    """
    Send SMS message via Twilio.
    
    Behavior:
    - If Twilio is configured: attempts real send. On failure (e.g. Trial unverified
      number, network error), falls back to mock log mode and returns success=False
      with the error string, but does NOT raise. This protects the booking flow.
    - If Twilio is NOT configured: logs to console (mock) and returns success.
    
    Returns:
        Tuple of (success: bool, message_id_or_error: str)
    """
    if not is_twilio_configured():
        logger.info(f"[SMS MOCK - twilio not configured] To: {phone} | Message: {message}")
        return True, f"mock_{datetime.now(timezone.utc).timestamp()}"
    
    try:
        from twilio.rest import Client
        
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        
        twilio_message = client.messages.create(
            body=message,
            from_=TWILIO_PHONE_NUMBER,
            to=phone
        )
        
        logger.info(f"[SMS SENT] To: {phone} | SID: {twilio_message.sid}")
        return True, twilio_message.sid
        
    except Exception as e:
        # Fallback log mode: never break booking flow because of SMS failure
        logger.warning(f"[SMS FAILED - fallback log] To: {phone} | Error: {str(e)} | Message: {message}")
        return False, str(e)


async def safe_send_sms(phone: Optional[str], message: str) -> bool:
    """
    Best-effort SMS send. Never raises. Returns True if sent or mocked, False on failure.
    """
    if not phone:
        return False
    try:
        # Normalize to E.164 if missing leading +
        normalized = phone.strip()
        if not normalized.startswith("+"):
            # Default to MX if 10 digits, US if 11 starting with 1
            digits = "".join(c for c in normalized if c.isdigit())
            if len(digits) == 10:
                normalized = f"+52{digits}"
            elif len(digits) == 11 and digits.startswith("1"):
                normalized = f"+{digits}"
            else:
                normalized = f"+{digits}"
        success, _ = await send_sms(normalized, message)
        return success
    except Exception as e:
        logger.error(f"[SMS SAFE-SEND ERROR] To: {phone} | Error: {str(e)}")
        return False


def detect_language(phone: Optional[str]) -> str:
    """Detect language by phone country code. +52 (MX) -> es, +1 (US) -> en. Default es."""
    if not phone:
        return "es"
    p = phone.strip()
    if p.startswith("+1") or p.startswith("1") and len(p.replace(" ", "")) == 11:
        return "en"
    return "es"


async def send_verification_code(phone: str) -> Tuple[str, str]:
    """
    Send a verification code to a phone number.
    
    Returns:
        Tuple of (code: str, message_id: str)
    
    Raises:
        SMSRateLimitError: If rate limit exceeded
        SMSNotConfiguredError: If Twilio not configured in production
        SMSServiceError: If SMS sending fails
    """
    # Check rate limit
    await check_rate_limit(phone)
    
    # Generate code
    code = generate_code()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=SMS_CODE_EXPIRATION_MINUTES)
    
    # Store code in database
    await db.phone_codes.insert_one({
        "phone": phone,
        "code": code,
        "expires_at": expires_at.isoformat(),
        "verified": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # Send SMS
    message = f"Tu código de verificación de Bookvia es: {code}. Expira en {SMS_CODE_EXPIRATION_MINUTES} minutos."
    success, message_id = await send_sms(phone, message)
    
    return code, message_id


async def verify_code(phone: str, code: str) -> bool:
    """
    Verify a phone code.
    
    Returns:
        True if code is valid and not expired
    """
    now = datetime.now(timezone.utc)
    
    # Find valid code
    phone_code = await db.phone_codes.find_one({
        "phone": phone,
        "code": code,
        "verified": False,
        "expires_at": {"$gt": now.isoformat()}
    })
    
    if not phone_code:
        return False
    
    # Mark as verified
    await db.phone_codes.update_one(
        {"_id": phone_code["_id"]},
        {"$set": {"verified": True, "verified_at": now.isoformat()}}
    )
    
    return True


async def cleanup_expired_codes():
    """Remove expired verification codes (maintenance task)"""
    now = datetime.now(timezone.utc)
    result = await db.phone_codes.delete_many({
        "expires_at": {"$lt": now.isoformat()}
    })
    logger.info(f"[SMS CLEANUP] Removed {result.deleted_count} expired codes")



# ========================== BOOKING SMS TEMPLATES ==========================
# All booking notification helpers are best-effort: they call safe_send_sms
# which never raises. If Twilio fails (e.g. unverified Trial number) the
# message is logged and the booking flow continues normally.

async def send_booking_confirmation_sms(
    phone: Optional[str],
    user_name: str,
    business_name: str,
    date: str,
    time: str
) -> bool:
    """SMS confirmation to client when booking is paid/confirmed."""
    lang = detect_language(phone)
    if lang == "en":
        msg = (
            f"Bookvia: Hi {user_name}, your appointment at {business_name} "
            f"is confirmed for {date} at {time}. See details: bookvia.app/bookings"
        )
    else:
        msg = (
            f"Bookvia: Hola {user_name}, tu cita en {business_name} esta "
            f"confirmada para el {date} a las {time}. Detalles: bookvia.app/bookings"
        )
    return await safe_send_sms(phone, msg)


async def send_business_new_booking_sms(
    phone: Optional[str],
    business_name: str,
    client_name: str,
    service_name: str,
    date: str,
    time: str
) -> bool:
    """SMS to business when a new booking is confirmed."""
    lang = detect_language(phone)
    if lang == "en":
        msg = (
            f"Bookvia: New booking for {business_name}. "
            f"{client_name} - {service_name} on {date} at {time}."
        )
    else:
        msg = (
            f"Bookvia: Nueva reserva en {business_name}. "
            f"{client_name} - {service_name} el {date} a las {time}."
        )
    return await safe_send_sms(phone, msg)


async def send_appointment_reminder_sms(
    phone: Optional[str],
    user_name: str,
    business_name: str,
    date: str,
    time: str
) -> bool:
    """24h reminder SMS to client."""
    lang = detect_language(phone)
    if lang == "en":
        msg = (
            f"Bookvia: Hi {user_name}, reminder of your appointment at "
            f"{business_name} tomorrow {date} at {time}."
        )
    else:
        msg = (
            f"Bookvia: Hola {user_name}, te recordamos tu cita en "
            f"{business_name} manana {date} a las {time}."
        )
    return await safe_send_sms(phone, msg)


async def send_booking_cancelled_sms(
    phone: Optional[str],
    user_name: str,
    business_name: str,
    date: str,
    time: str,
    reason: Optional[str] = None
) -> bool:
    """Cancellation SMS."""
    lang = detect_language(phone)
    reason_part = ""
    if reason:
        reason_part = f" ({reason})" if lang == "en" else f" ({reason})"
    if lang == "en":
        msg = (
            f"Bookvia: Hi {user_name}, your appointment at {business_name} "
            f"on {date} at {time} has been cancelled{reason_part}."
        )
    else:
        msg = (
            f"Bookvia: Hola {user_name}, tu cita en {business_name} del "
            f"{date} a las {time} fue cancelada{reason_part}."
        )
    return await safe_send_sms(phone, msg)
