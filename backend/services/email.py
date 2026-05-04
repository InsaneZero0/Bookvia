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
    data: Optional[Dict[str, Any]] = None,
    from_email: Optional[str] = None
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
        from_email: Optional custom sender (defaults to FROM_EMAIL)
    
    Returns:
        Email ID or provider message ID
    """
    sender = from_email or FROM_EMAIL
    
    if not is_resend_configured():
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
        import resend
        
        resend.api_key = RESEND_API_KEY
        
        email_params = {
            "from": sender,
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
<span style="color:#ffffff;font-size:22px;font-weight:bold;">Book</span><span style="color:#F05D5E;font-size:22px;font-weight:bold;">via</span><span style="color:#F05D5E;font-size:11px;font-weight:bold;position:relative;top:-8px;margin-left:1px;">&#10022;</span>
</td></tr>
<tr><td style="padding:32px;">
<h2 style="margin:0 0 16px;color:#1e293b;font-size:20px;">{title}</h2>
{content}
</td></tr>
<tr><td style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
<p style="margin:0;color:#94a3b8;font-size:12px;">Este es un correo automatico de Bookvia. No responder a este mensaje.</p>
<p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">bookvia.vercel.app</p>
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
<a href="https://bookvia.vercel.app" style="color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">Explorar servicios</a>
</td></tr></table>
<p style="color:#64748b;font-size:14px;">Gracias por unirte a Bookvia.</p>"""
    
    return await send_email(
        to=user_email, subject=subject, body=f"Hola {user_name}, bienvenido a Bookvia.",
        html=email_html(subject, content), template="welcome", data={"user_name": user_name}
    )


NOREPLY_EMAIL = "Bookvia <noreply@bookvia.app>"


async def send_verification_email(user_email: str, user_name: str, token: str) -> str:
    """Send email verification link to new user"""
    verify_url = f"https://bookvia.vercel.app/verify-email?token={token}"
    subject = "Verifica tu cuenta en Bookvia"
    content = f"""<p style="color:#334155;font-size:15px;line-height:1.6;">Hola <strong>{user_name}</strong>,</p>
<p style="color:#334155;font-size:15px;line-height:1.6;">Gracias por registrarte en Bookvia. Para completar tu registro y activar tu cuenta, haz clic en el siguiente boton:</p>
<table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:#F05D5E;border-radius:8px;padding:14px 32px;">
<a href="{verify_url}" style="color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">Verificar mi cuenta</a>
</td></tr></table>
<p style="color:#64748b;font-size:13px;">Si no creaste esta cuenta, puedes ignorar este correo.</p>
<p style="color:#94a3b8;font-size:12px;margin-top:16px;">Si el boton no funciona, copia y pega este enlace en tu navegador:<br><a href="{verify_url}" style="color:#F05D5E;font-size:12px;word-break:break-all;">{verify_url}</a></p>"""
    
    return await send_email(
        to=user_email, subject=subject, body=f"Hola {user_name}, verifica tu cuenta en Bookvia: {verify_url}",
        html=email_html(subject, content), template="verification", data={"user_name": user_name},
        from_email=NOREPLY_EMAIL
    )


async def send_password_reset_email(user_email: str, user_name: str, token: str) -> str:
    """Send password reset link"""
    reset_url = f"https://bookvia.vercel.app/reset-password?token={token}"
    subject = "Restablecer contraseña - Bookvia"
    content = f"""<p style="color:#334155;font-size:15px;line-height:1.6;">Hola <strong>{user_name}</strong>,</p>
<p style="color:#334155;font-size:15px;line-height:1.6;">Recibimos una solicitud para restablecer la contraseña de tu cuenta en Bookvia. Haz clic en el siguiente boton para crear una nueva contraseña:</p>
<table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:#F05D5E;border-radius:8px;padding:14px 32px;">
<a href="{reset_url}" style="color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">Restablecer mi contraseña</a>
</td></tr></table>
<p style="color:#64748b;font-size:13px;">Este enlace expira en 1 hora. Si no solicitaste este cambio, puedes ignorar este correo y tu contraseña seguira siendo la misma.</p>
<p style="color:#94a3b8;font-size:12px;margin-top:16px;">Si el boton no funciona, copia y pega este enlace en tu navegador:<br><a href="{reset_url}" style="color:#F05D5E;font-size:12px;word-break:break-all;">{reset_url}</a></p>"""
    
    return await send_email(
        to=user_email, subject=subject, body=f"Hola {user_name}, restablece tu contraseña: {reset_url}",
        html=email_html(subject, content), template="password_reset", data={"user_name": user_name},
        from_email=NOREPLY_EMAIL
    )


async def send_welcome_business(email: str, business_name: str) -> str:
    """Send welcome email to new business"""
    subject = f"Bienvenido a Bookvia, {business_name}"
    content = f"""<p style="color:#334155;font-size:15px;line-height:1.6;">Hola <strong>{business_name}</strong>,</p>
<p style="color:#334155;font-size:15px;line-height:1.6;">Tu negocio ha sido registrado exitosamente. Para comenzar a recibir reservas, activa tu suscripcion y completa tu perfil.</p>
<table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="background:#F05D5E;border-radius:8px;padding:12px 28px;">
<a href="https://bookvia.vercel.app/business/login" style="color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">Comenzar ahora</a>
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
    worker_name: str,
    business_public_code: Optional[str] = None
) -> str:
    """Send booking confirmation to user"""
    subject = f"Cita confirmada - {business_name}"
    code_footer = ""
    if business_public_code:
        code_footer = f'<p style="color:#94a3b8;font-size:12px;margin-top:8px;">Codigo Bookvia del negocio: <strong style="color:#475569;font-family:monospace;letter-spacing:0.5px;">{business_public_code}</strong></p>'
    content = f"""<p style="color:#334155;font-size:15px;line-height:1.6;">Hola <strong>{user_name}</strong>,</p>
<p style="color:#334155;font-size:15px;line-height:1.6;">Tu cita ha sido confirmada:</p>
<table width="100%" style="margin:16px 0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;" cellpadding="0" cellspacing="0">
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;width:120px;">Negocio</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;font-weight:600;">{business_name}</td></tr>
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Servicio</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;border-top:1px solid #e2e8f0;">{service_name}</td></tr>
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Fecha</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;border-top:1px solid #e2e8f0;">{date}</td></tr>
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Hora</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;border-top:1px solid #e2e8f0;">{time}</td></tr>
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Profesional</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;border-top:1px solid #e2e8f0;">{worker_name}</td></tr>
</table>
<p style="color:#64748b;font-size:14px;">Gracias por reservar con Bookvia.</p>
{code_footer}"""
    
    return await send_email(
        to=user_email, subject=subject,
        body=f"Hola {user_name}, tu cita en {business_name} esta confirmada para el {date} a las {time}." + (f" Codigo: {business_public_code}" if business_public_code else ""),
        html=email_html("Cita Confirmada", content), template="booking_confirmation",
        data={"user_name": user_name, "business_name": business_name, "service_name": service_name, "date": date, "time": time, "worker_name": worker_name, "business_public_code": business_public_code or ""}
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



async def send_appointment_reminder(
    user_email: str,
    user_name: str,
    business_name: str,
    service_name: str,
    date: str,
    time: str,
    worker_name: str,
    business_address: str = "",
    booking_id: Optional[str] = None,
    cancel_free_until_text: Optional[str] = None,
    reschedule_until_text: Optional[str] = None,
    reschedule_remaining: Optional[int] = None,
    calendar_url: Optional[str] = None,
    google_calendar_url: Optional[str] = None,
) -> str:
    """Send smart appointment reminder with dynamic cancel/reschedule windows and action buttons.

    The reminder is built around the *current state* of the booking so the
    client always sees the real cutoff for each action (free cancellation,
    reschedule cutoff, remaining reschedules) instead of a generic message.
    """
    subject = f"Recordatorio: tu cita en {business_name} es pronto"

    address_row = (
        f'<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Direccion</td>'
        f'<td style="padding:12px 16px;font-size:14px;color:#1e293b;border-top:1px solid #e2e8f0;">{business_address}</td></tr>'
        if business_address else ""
    )

    base_url = "https://bookvia.vercel.app"
    bid = booking_id or ""
    cancel_url = f"{base_url}/bookings?action=cancel&id={bid}" if bid else f"{base_url}/bookings"
    reschedule_url = f"{base_url}/bookings?action=reschedule&id={bid}" if bid else f"{base_url}/bookings"
    ics_url = calendar_url or (f"{base_url}/bookings?action=calendar&id={bid}" if bid else f"{base_url}/bookings")
    gcal_url = google_calendar_url or ""

    # Dynamic policy panel
    policy_lines = []
    if cancel_free_until_text:
        policy_lines.append(
            f"Cancelacion con reembolso (menos 8.5%): hasta el <strong>{cancel_free_until_text}</strong>."
        )
    else:
        policy_lines.append("Cancelacion con reembolso: solo si lo haces con mas de 24h de anticipacion.")

    if reschedule_until_text:
        rem = reschedule_remaining if reschedule_remaining is not None else 2
        rem_txt = (
            "ya no puedes reagendar"
            if rem <= 0
            else f"te {'queda' if rem == 1 else 'quedan'} {rem} reagendamiento{'' if rem == 1 else 's'} sin costo"
        )
        policy_lines.append(
            f"Reagendar gratis: hasta el <strong>{reschedule_until_text}</strong> ({rem_txt})."
        )
    else:
        policy_lines.append("Reagendar gratis: hasta 2h antes de la cita (maximo 2 veces).")

    policy_html = "".join(
        f'<li style="margin-bottom:6px;">{line}</li>' for line in policy_lines
    )

    # Disable reschedule button visually if no reschedules remain
    reschedule_disabled = reschedule_remaining is not None and reschedule_remaining <= 0
    reschedule_btn_bg = "#cbd5e1" if reschedule_disabled else "#ffffff"
    reschedule_btn_color = "#64748b" if reschedule_disabled else "#1e293b"
    reschedule_btn_border = "#cbd5e1" if reschedule_disabled else "#1e293b"
    reschedule_btn_label = "Reagendar (no disponible)" if reschedule_disabled else "Reagendar"

    content = f"""<p style="color:#334155;font-size:15px;line-height:1.6;">Hola <strong>{user_name}</strong>,</p>
<p style="color:#334155;font-size:15px;line-height:1.6;">Te recordamos que tienes una cita proxima:</p>
<table width="100%" style="margin:16px 0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;" cellpadding="0" cellspacing="0">
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;width:120px;">Negocio</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;font-weight:600;">{business_name}</td></tr>
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Servicio</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;border-top:1px solid #e2e8f0;">{service_name}</td></tr>
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Fecha</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;border-top:1px solid #e2e8f0;">{date}</td></tr>
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Hora</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;border-top:1px solid #e2e8f0;">{time}</td></tr>
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Profesional</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;border-top:1px solid #e2e8f0;">{worker_name}</td></tr>
{address_row}
</table>
<div style="margin:20px 0;padding:14px 16px;background:#fff7ed;border-left:4px solid #F05D5E;border-radius:6px;">
<p style="margin:0 0 8px;color:#9a3412;font-size:13px;font-weight:700;">Tu ventana de cambios</p>
<ul style="margin:0;padding-left:18px;color:#7c2d12;font-size:13px;line-height:1.55;">{policy_html}</ul>
</div>
<table cellpadding="0" cellspacing="0" style="margin:24px 0;width:100%;"><tr>
<td align="center" style="padding:4px 4px;">
<a href="{ics_url}" style="display:inline-block;background:#1e293b;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;font-size:13px;">Apple / Outlook (.ics)</a>
</td>
<td align="center" style="padding:4px 4px;">
<a href="{gcal_url or ics_url}" style="display:inline-block;background:#4285F4;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;font-size:13px;">Google Calendar</a>
</td>
</tr><tr>
<td align="center" style="padding:4px 4px;">
<a href="{reschedule_url}" style="display:inline-block;background:{reschedule_btn_bg};color:{reschedule_btn_color};text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:13px;border:1px solid {reschedule_btn_border};">{reschedule_btn_label}</a>
</td>
<td align="center" style="padding:4px 4px;">
<a href="{cancel_url}" style="display:inline-block;background:#ffffff;color:#dc2626;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:13px;border:1px solid #dc2626;">Cancelar</a>
</td>
</tr></table>
<p style="color:#94a3b8;font-size:12px;margin-top:12px;">Si los botones no funcionan, abre <a href="{base_url}/bookings" style="color:#F05D5E;">Mis citas</a> en Bookvia.</p>"""

    text_body = (
        f"Hola {user_name}, te recordamos tu cita en {business_name} el {date} a las {time}.\n"
        f"Servicio: {service_name}.\n"
    )
    if cancel_free_until_text:
        text_body += f"Cancelacion gratis hasta: {cancel_free_until_text}.\n"
    if reschedule_until_text:
        text_body += f"Reagendar gratis hasta: {reschedule_until_text}.\n"
    text_body += f"Mis citas: {base_url}/bookings"

    return await send_email(
        to=user_email,
        subject=subject,
        body=text_body,
        html=email_html("Recordatorio de Cita", content),
        template="appointment_reminder",
        data={
            "user_name": user_name,
            "business_name": business_name,
            "service_name": service_name,
            "date": date,
            "time": time,
            "booking_id": booking_id,
            "cancel_free_until": cancel_free_until_text,
            "reschedule_until": reschedule_until_text,
            "reschedule_remaining": reschedule_remaining,
        },
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
<p style="color:#64748b;font-size:14px;">Puedes reservar otra cita en cualquier momento en bookvia.vercel.app</p>"""

    return await send_email(
        to=user_email, subject=subject,
        body=f"Hola {user_name}, tu cita en {business_name} del {date} a las {time} ha sido cancelada.",
        html=email_html("Cita Cancelada", content), template="booking_cancelled",
        data={"user_name": user_name, "business_name": business_name, "date": date, "time": time, "reason": reason}
    )


async def send_subscription_reminder(
    business_email: str,
    business_name: str,
    login_url: str
) -> str:
    """Send reminder to business that hasn't completed subscription payment"""
    subject = "Completa tu registro en Bookvia"
    content = f"""<p style="color:#334155;font-size:15px;line-height:1.6;">Hola <strong>{business_name}</strong>,</p>
<p style="color:#334155;font-size:15px;line-height:1.6;">Notamos que iniciaste el registro de tu negocio en Bookvia pero aun no has completado el pago de tu suscripcion.</p>
<div style="margin:20px 0;padding:16px;background:#fef3c7;border-radius:8px;border:1px solid #fbbf24;">
<p style="margin:0;color:#92400e;font-size:14px;font-weight:600;">Tu cuenta esta lista, solo falta el pago</p>
<p style="margin:8px 0 0;color:#92400e;font-size:13px;">Recuerda que el primer mes es GRATIS. Despues solo pagas $49.99 MXN/mes ($4.99 USD en EE. UU.).</p>
</div>
<p style="color:#334155;font-size:15px;line-height:1.6;">Para completar tu registro:</p>
<ol style="color:#334155;font-size:14px;line-height:1.8;">
<li>Ve a <a href="{login_url}" style="color:#F05D5E;font-weight:600;">iniciar sesion</a></li>
<li>Ingresa con tu email y contrasena</li>
<li>Sigue las instrucciones para completar el pago</li>
</ol>
<div style="text-align:center;margin:24px 0;">
<a href="{login_url}" style="display:inline-block;background:#F05D5E;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">Completar mi registro</a>
</div>
<p style="color:#64748b;font-size:13px;">Si tienes alguna duda, no dudes en contactarnos.</p>"""

    return await send_email(
        to=business_email, subject=subject,
        body=f"Hola {business_name}, completa tu registro en Bookvia. Tu primer mes es GRATIS. Inicia sesion en {login_url} para completar el pago.",
        html=email_html("Completa tu Registro", content), template="subscription_reminder",
        data={"business_name": business_name, "login_url": login_url}
    )

async def send_settlement_notification(
    business_email: str,
    business_name: str,
    amount_mxn: float,
    period_key: str,
    settlement_id: str,
    booking_count: int,
    transactions_count: int,
) -> str:
    """Email business with the details of a newly-generated day-20 settlement.

    The email explains exactly what the business will receive, why some money
    might still be retained (disputes / not yet cleared), and the expected
    SPEI transfer window (1-3 business days after the 20th).
    """
    subject = f"Liquidacion Bookvia lista: ${amount_mxn:,.2f} MXN - {period_key}"

    dashboard_url = "https://bookvia.vercel.app/business/finance"
    statement_url = f"https://bookvia.vercel.app/business/finance?statement={settlement_id}"

    content = f"""<p style="color:#334155;font-size:15px;line-height:1.6;">Hola <strong>{business_name}</strong>,</p>
<p style="color:#334155;font-size:15px;line-height:1.6;">Tu liquidacion mensual de Bookvia ya esta preparada. Aqui estan los detalles:</p>
<table width="100%" style="margin:16px 0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;" cellpadding="0" cellspacing="0">
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;width:180px;">Periodo</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;font-weight:600;">{period_key}</td></tr>
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Monto a depositar</td><td style="padding:12px 16px;font-size:16px;color:#059669;border-top:1px solid #e2e8f0;font-weight:700;">${amount_mxn:,.2f} MXN</td></tr>
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Citas incluidas</td><td style="padding:12px 16px;font-size:14px;color:#1e293b;border-top:1px solid #e2e8f0;">{booking_count} cita{'s' if booking_count != 1 else ''} / {transactions_count} transaccion{'es' if transactions_count != 1 else ''}</td></tr>
<tr><td style="padding:12px 16px;background:#f8fafc;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;">Folio</td><td style="padding:12px 16px;font-size:13px;color:#1e293b;font-family:monospace;border-top:1px solid #e2e8f0;">{settlement_id}</td></tr>
</table>
<div style="margin:20px 0;padding:14px 16px;background:#ecfdf5;border-left:4px solid #059669;border-radius:6px;">
<p style="margin:0 0 6px;color:#064e3b;font-size:13px;font-weight:700;">Como se calculo</p>
<p style="margin:0;color:#065f46;font-size:13px;line-height:1.55;">
El monto incluye el total que tus clientes pagaron como anticipo, menos el 8.5% (procesamiento Stripe estimado) y sin la cuota fija de Bookvia (la pagaron los clientes). Solo se liquido el dinero que paso el periodo de gracia de 24h sin disputas.
</p>
</div>
<p style="color:#334155;font-size:14px;">La transferencia SPEI llegara a la CLABE que tienes registrada en Bookvia en un plazo de <strong>1 a 3 dias habiles</strong> despues del dia 1° del mes siguiente.</p>
<p style="color:#334155;font-size:14px;">Puedes descargar el <strong>estado de cuenta detallado en PDF</strong> (con el desglose de cada transaccion, fees y hash de verificacion) desde tu panel. Util para tu contabilidad o para conciliar con tu contador.</p>
<table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr>
<td style="background:#F05D5E;border-radius:8px;padding:12px 28px;">
<a href="{statement_url}" style="color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">Descargar estado de cuenta</a>
</td>
<td style="width:12px;"></td>
<td style="background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;padding:12px 24px;">
<a href="{dashboard_url}" style="color:#0f172a;text-decoration:none;font-weight:600;font-size:14px;">Ver panel</a>
</td>
</tr></table>
<p style="color:#94a3b8;font-size:12px;margin-top:16px;">Si tienes alguna duda sobre la liquidacion, contactanos y menciona el folio {settlement_id}.</p>"""

    text_body = (
        f"Hola {business_name}, tu liquidacion Bookvia {period_key} esta lista.\n"
        f"Monto: ${amount_mxn:,.2f} MXN ({booking_count} citas).\n"
        f"Folio: {settlement_id}.\n"
        f"La transferencia SPEI llegara en 1-3 dias habiles.\n"
        f"Panel: {dashboard_url}"
    )

    return await send_email(
        to=business_email,
        subject=subject,
        body=text_body,
        html=email_html("Liquidacion Bookvia lista", content),
        template="settlement_notification",
        data={
            "business_name": business_name,
            "amount_mxn": amount_mxn,
            "period_key": period_key,
            "settlement_id": settlement_id,
            "booking_count": booking_count,
            "transactions_count": transactions_count,
        },
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
