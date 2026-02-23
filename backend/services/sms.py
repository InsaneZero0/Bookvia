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
from typing import Tuple

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
    Send SMS message.
    
    Returns:
        Tuple of (success: bool, message_id_or_error: str)
    """
    if IS_DEVELOPMENT:
        # Mock mode - log and return success
        logger.info(f"[SMS MOCK] To: {phone} | Message: {message}")
        return True, f"mock_{datetime.now(timezone.utc).timestamp()}"
    
    if IS_PRODUCTION and not is_twilio_configured():
        raise SMSNotConfiguredError(
            "Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER."
        )
    
    try:
        # Import Twilio only when needed
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
        logger.error(f"[SMS ERROR] To: {phone} | Error: {str(e)}")
        raise SMSServiceError(f"Failed to send SMS: {str(e)}")


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
