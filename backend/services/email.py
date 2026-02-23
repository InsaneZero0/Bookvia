"""
Email Service with Resend integration.

Configuration via environment variables:
- RESEND_API_KEY: Resend API key
- FROM_EMAIL: Sender email address
- ENV: "development" uses mock, "production" requires Resend

Mock mode:
- In development (ENV=development), emails are mocked
- Emails are logged and stored in database (sent_emails collection)
- Admin can view sent emails in dashboard

Production mode:
- Requires valid Resend API key
- Falls back to mock with warning if not configured
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from core.config import (
    IS_DEVELOPMENT, IS_PRODUCTION,
    RESEND_API_KEY, FROM_EMAIL,
    is_resend_configured
)
from core.database import db

logger = logging.getLogger(__name__)


class EmailServiceError(Exception):
    """Email service error"""
    pass


async def store_email(
    to: str,
    subject: str,
    body: str,
    template: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None,
    status: str = "sent",
    provider: str = "mock",
    provider_id: Optional[str] = None,
    error: Optional[str] = None
) -> str:
    """
    Store email record in database.
    
    Returns:
        Email record ID
    """
    email_doc = {
        "id": f"email_{datetime.now(timezone.utc).timestamp()}",
        "to": to,
        "from": FROM_EMAIL,
        "subject": subject,
        "body": body,
        "template": template,
        "data": data or {},
        "status": status,
        "provider": provider,
        "provider_id": provider_id,
        "error": error,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.sent_emails.insert_one(email_doc)
    return email_doc["id"]


async def send_email(
    to: str,
    subject: str,
    body: str,
    html: Optional[str] = None,
    template: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None
) -> str:
    """
    Send an email.
    
    Args:
        to: Recipient email address
        subject: Email subject
        body: Plain text body
        html: Optional HTML body
        template: Optional template name (for logging)
        data: Optional template data (for logging)
    
    Returns:
        Email ID or provider message ID
    """
    if IS_DEVELOPMENT or not is_resend_configured():
        # Mock mode - log and store
        logger.info(f"[EMAIL MOCK] To: {to} | Subject: {subject}")
        logger.debug(f"[EMAIL MOCK] Body: {body[:200]}...")
        
        email_id = await store_email(
            to=to,
            subject=subject,
            body=body,
            template=template,
            data=data,
            status="sent",
            provider="mock"
        )
        
        if IS_PRODUCTION and not is_resend_configured():
            logger.warning("[EMAIL] Resend not configured. Email stored but not sent.")
        
        return email_id
    
    try:
        # Import Resend only when needed
        import resend
        
        resend.api_key = RESEND_API_KEY
        
        email_params = {
            "from": FROM_EMAIL,
            "to": [to],
            "subject": subject,
            "text": body,
        }
        
        if html:
            email_params["html"] = html
        
        response = resend.Emails.send(email_params)
        
        logger.info(f"[EMAIL SENT] To: {to} | ID: {response['id']}")
        
        await store_email(
            to=to,
            subject=subject,
            body=body,
            template=template,
            data=data,
            status="sent",
            provider="resend",
            provider_id=response["id"]
        )
        
        return response["id"]
        
    except Exception as e:
        logger.error(f"[EMAIL ERROR] To: {to} | Error: {str(e)}")
        
        await store_email(
            to=to,
            subject=subject,
            body=body,
            template=template,
            data=data,
            status="failed",
            provider="resend",
            error=str(e)
        )
        
        raise EmailServiceError(f"Failed to send email: {str(e)}")


# ========================== EMAIL TEMPLATES ==========================

async def send_booking_confirmation(
    user_email: str,
    user_name: str,
    business_name: str,
    service_name: str,
    date: str,
    time: str,
    worker_name: str
) -> str:
    """Send booking confirmation to user"""
    subject = f"Confirmación de cita - {business_name}"
    body = f"""Hola {user_name},

Tu cita ha sido confirmada:

Negocio: {business_name}
Servicio: {service_name}
Fecha: {date}
Hora: {time}
Profesional: {worker_name}

Gracias por usar Bookvia.

---
Este es un correo automático, no responder.
"""
    
    return await send_email(
        to=user_email,
        subject=subject,
        body=body,
        template="booking_confirmation",
        data={
            "user_name": user_name,
            "business_name": business_name,
            "service_name": service_name,
            "date": date,
            "time": time,
            "worker_name": worker_name
        }
    )


async def send_worker_assignment(
    worker_email: str,
    worker_name: str,
    business_name: str,
    service_name: str,
    client_name: str,
    date: str,
    time: str,
    notes: Optional[str] = None
) -> str:
    """Send assignment notification to worker"""
    subject = f"Nueva cita asignada - {date} {time}"
    
    notes_section = f"\nNotas del cliente: {notes}" if notes else ""
    
    body = f"""Hola {worker_name},

Se te ha asignado una nueva cita:

Negocio: {business_name}
Servicio: {service_name}
Cliente: {client_name}
Fecha: {date}
Hora: {time}{notes_section}

Revisa tu agenda en el panel de Bookvia.

---
Este es un correo automático, no responder.
"""
    
    return await send_email(
        to=worker_email,
        subject=subject,
        body=body,
        template="worker_assignment",
        data={
            "worker_name": worker_name,
            "business_name": business_name,
            "service_name": service_name,
            "client_name": client_name,
            "date": date,
            "time": time,
            "notes": notes
        }
    )


async def send_booking_cancelled(
    user_email: str,
    user_name: str,
    business_name: str,
    service_name: str,
    date: str,
    time: str,
    reason: Optional[str] = None,
    refund_info: Optional[str] = None
) -> str:
    """Send cancellation notification to user"""
    subject = f"Cita cancelada - {business_name}"
    
    reason_section = f"\nMotivo: {reason}" if reason else ""
    refund_section = f"\n{refund_info}" if refund_info else ""
    
    body = f"""Hola {user_name},

Tu cita ha sido cancelada:

Negocio: {business_name}
Servicio: {service_name}
Fecha: {date}
Hora: {time}{reason_section}{refund_section}

Puedes reservar otra cita en cualquier momento.

---
Este es un correo automático, no responder.
"""
    
    return await send_email(
        to=user_email,
        subject=subject,
        body=body,
        template="booking_cancelled",
        data={
            "user_name": user_name,
            "business_name": business_name,
            "service_name": service_name,
            "date": date,
            "time": time,
            "reason": reason,
            "refund_info": refund_info
        }
    )


async def get_sent_emails(
    limit: int = 50,
    status: Optional[str] = None,
    to: Optional[str] = None
) -> list:
    """Get sent emails for admin dashboard"""
    filters = {}
    if status:
        filters["status"] = status
    if to:
        filters["to"] = {"$regex": to, "$options": "i"}
    
    emails = await db.sent_emails.find(
        filters,
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return emails
