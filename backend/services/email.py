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
    if not is_resend_configured():
        # Mock mode - log and store
        logger.info(f"[EMAIL MOCK] To: {to} | Subject: {subject}")
        
        email_id = await store_email(
            to=to,
            subject=subject,
            body=body,
            template=template,
            data=data,
            status="sent",
            provider="mock"
        )
        
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


# ========================== HTML EMAIL WRAPPER ==========================

def email_html(title: str, content: str) -> str:
    """Wrap email content in a professional HTML template"""
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
<tr><td style="background:#1e293b;padding:24px 32px;text-align:center;">
<span style="color:#ffffff;font-size:22px;font-weight:bold;">Book</span><span style="color:#F05D5E;font-size:22px;font-weight:bold;">via</span>
</td></tr>
<tr><td style="padding:32px;">
<h2 style="margin:0 0 16px;color:#1e293b;font-size:20px;">{title}</h2>
{content}
</td></tr>
<tr><td style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
<p style="margin:0;color:#94a3b8;font-size:12px;">Este es un correo automatico de Bookvia. No responder a este mensaje.</p>
<p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">bookvia.app</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>"""


# ========================== EMAIL TEMPLATES ==========================

async def send_welcome_email(user_email: str, user_name: str) -> str:
    """Send welcome email to new user"""
    subject = "Bienvenido a Bookvia"
    content = f"""<p style="color:#334155;font-size:15px;line-height:1.6;">Hola <strong>{user_name}</strong>,</p>
<p style="color:#334155;font-size:15px;line-height:1.6;">Tu cuenta ha sido creada exitosamente. Ya puedes explorar negocios, reservar citas y gestionar tus servicios favoritos.</p>
<table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:#F05D5E;border-radius:8px;padding:12px 28px;">
<a href="https://bookvia.app" style="color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">Explorar servicios</a>
</td></tr></table>
<p style="color:#64748b;font-size:14px;">Gracias por unirte a Bookvia.</p>"""
    
    return await send_email(
        to=user_email, subject=subject, body=f"Hola {user_name}, bienvenido a Bookvia.",
        html=email_html(subject, content), template="welcome", data={"user_name": user_name}
    )


async def send_welcome_business(email: str, business_name: str) -> str:
    """Send welcome email to new business"""
    subject = f"Bienvenido a Bookvia, {business_name}"
    content = f"""<p style="color:#334155;font-size:15px;line-height:1.6;">Hola <strong>{business_name}</strong>,</p>
<p style="color:#334155;font-size:15px;line-height:1.6;">Tu negocio ha sido registrado exitosamente. Para comenzar a recibir reservas, activa tu suscripcion y completa tu perfil.</p>
<table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:#F05D5E;border-radius:8px;padding:12px 28px;">
<a href="https://bookvia.app/business/login" style="color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">Ir a mi panel</a>
</td></tr></table>
<p style="color:#64748b;font-size:14px;">Estamos aqui para ayudarte a crecer.</p>"""
    
    return await send_email(
        to=email, subject=subject, body=f"Bienvenido a Bookvia, {business_name}.",
        html=email_html(subject, content), template="welcome_business", data={"business_name": business_name}
    )

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
    subject = f"Cita confirmada - {business_name}"
    content = f"""<p style="color:#334155;font-size:15px;line-height:1.6;">Hola <strong>{user_name}</strong>,</p>
<p style="color:#334155;font-size:15px;line-height:1.6;">Tu cita ha sido confirmada:</p>
<table width="100%" style="margin:16px 0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;" cellpadding="0" cellspacing="0">
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;width:120px;">Negocio</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;font-weight:600;">{business_name}</td></tr>
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Servicio</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;border-top:1px solid #e2e8f0;">{service_name}</td></tr>
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Fecha</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;border-top:1px solid #e2e8f0;">{date}</td></tr>
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Hora</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;border-top:1px solid #e2e8f0;">{time}</td></tr>
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Profesional</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;border-top:1px solid #e2e8f0;">{worker_name}</td></tr>
</table>
<p style="color:#64748b;font-size:14px;">Gracias por reservar con Bookvia.</p>"""
    
    return await send_email(
        to=user_email, subject=subject,
        body=f"Hola {user_name}, tu cita en {business_name} esta confirmada para el {date} a las {time}.",
        html=email_html("Cita Confirmada", content), template="booking_confirmation",
        data={"user_name": user_name, "business_name": business_name, "service_name": service_name, "date": date, "time": time, "worker_name": worker_name}
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
    reason_row = f'<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Motivo</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;border-top:1px solid #e2e8f0;">{reason}</td></tr>' if reason else ""
    refund_text = f'<p style="color:#334155;font-size:14px;margin-top:16px;padding:12px;background:#fef3c7;border-radius:8px;">{refund_info}</p>' if refund_info else ""
    
    content = f"""<p style="color:#334155;font-size:15px;line-height:1.6;">Hola <strong>{user_name}</strong>,</p>
<p style="color:#334155;font-size:15px;line-height:1.6;">Tu cita ha sido cancelada:</p>
<table width="100%" style="margin:16px 0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;" cellpadding="0" cellspacing="0">
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;width:120px;">Negocio</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;">{business_name}</td></tr>
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Servicio</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;border-top:1px solid #e2e8f0;">{service_name}</td></tr>
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Fecha</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;border-top:1px solid #e2e8f0;">{date}</td></tr>
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Hora</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;border-top:1px solid #e2e8f0;">{time}</td></tr>
{reason_row}
</table>
{refund_text}
<p style="color:#64748b;font-size:14px;">Puedes reservar otra cita en cualquier momento en bookvia.app</p>"""

    return await send_email(
        to=user_email, subject=subject,
        body=f"Hola {user_name}, tu cita en {business_name} del {date} a las {time} ha sido cancelada.",
        html=email_html("Cita Cancelada", content), template="booking_cancelled",
        data={"user_name": user_name, "business_name": business_name, "date": date, "time": time, "reason": reason}
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
