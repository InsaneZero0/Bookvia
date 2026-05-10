"""
Winback service — Phase G: User reactivation campaigns.

Provides functions to:
  - Detect inactive users (never booked / stale)
  - Send winback emails via Resend with $50 wallet credit incentive
  - Enforce anti-spam: max 1 winback email per user every 15 days
  - LFPDPPP compliance: unsubscribe link in every email + opt-out registry
"""
from datetime import datetime, timezone, timedelta
from typing import Literal, Optional
import logging
import os
import secrets
import uuid

from core.database import db
from services.email import send_email
from services.wallet import credit_wallet, CREDIT_ADMIN_ADJUSTMENT

logger = logging.getLogger(__name__)

WINBACK_COOLDOWN_DAYS = 15
INCENTIVE_AMOUNT_MXN = 50.0
INCENTIVE_EXPIRY_DAYS = 7

SegmentType = Literal["never_booked", "stale_user", "all"]
TemplateType = Literal["miss_you", "first_booking", "new_businesses"]


def _frontend_url() -> str:
    return (os.environ.get("FRONTEND_URL") or "https://bookvia.app").rstrip("/")


async def _user_is_unsubscribed(user_id: str) -> bool:
    doc = await db.email_unsubscribes.find_one({"user_id": user_id}, {"_id": 0})
    return bool(doc)


async def find_inactive_users(
    segment: SegmentType = "all",
    days: int = 30,
    limit: int = 1000,
) -> list[dict]:
    """Return list of inactive users (excluding those unsubscribed or recently
    contacted). Each item has: id, name, email, days_since_signup,
    days_since_last_booking, total_bookings, total_spent_mxn."""
    cooldown_cutoff = (datetime.now(timezone.utc) - timedelta(days=WINBACK_COOLDOWN_DAYS)).isoformat()

    # Build user filter — exclude business/admin accounts, banned, unsubscribed, recently contacted
    user_filter = {
        "role": "user",
        "banned": {"$ne": True},
        "is_deleted": {"$ne": True},
    }

    users = await db.users.find(user_filter, {"_id": 0}).limit(limit * 3).to_list(limit * 3)
    results: list[dict] = []
    for u in users:
        # Skip unsubscribed
        if await db.email_unsubscribes.find_one({"user_id": u["id"]}):
            continue
        # Skip if contacted in last 15 days
        recent = await db.winback_emails.find_one({
            "user_id": u["id"],
            "sent_at": {"$gte": cooldown_cutoff},
        })
        if recent:
            continue

        # Compute booking aggregates
        bookings = await db.bookings.find(
            {"user_id": u["id"]},
            {"_id": 0, "id": 1, "date": 1, "status": 1, "total_amount": 1, "deposit_amount": 1, "created_at": 1}
        ).to_list(500)
        total_bookings = len(bookings)
        completed = [b for b in bookings if b.get("status") == "completed"]
        total_spent = sum(b.get("total_amount") or b.get("deposit_amount") or 0 for b in completed)

        last_booking_iso = None
        if bookings:
            last_booking_iso = max((b.get("created_at") or "" for b in bookings), default=None)

        days_since_signup = None
        if u.get("created_at"):
            try:
                signup = datetime.fromisoformat(u["created_at"].replace("Z", "+00:00"))
                days_since_signup = (datetime.now(timezone.utc) - signup).days
            except Exception:
                pass

        days_since_last_booking = None
        if last_booking_iso:
            try:
                last = datetime.fromisoformat(last_booking_iso.replace("Z", "+00:00"))
                days_since_last_booking = (datetime.now(timezone.utc) - last).days
            except Exception:
                pass

        # Segment classification
        if total_bookings == 0:
            user_segment = "never_booked"
            inactive_days = days_since_signup or 0
        else:
            user_segment = "stale_user"
            inactive_days = days_since_last_booking or 0

        # Apply segment filter
        if segment == "never_booked" and user_segment != "never_booked":
            continue
        if segment == "stale_user" and user_segment != "stale_user":
            continue
        # Apply days filter
        if inactive_days < days:
            continue

        results.append({
            "id": u["id"],
            "name": u.get("name") or "",
            "email": u.get("email") or "",
            "segment": user_segment,
            "days_since_signup": days_since_signup,
            "days_since_last_booking": days_since_last_booking,
            "total_bookings": total_bookings,
            "completed_bookings": len(completed),
            "total_spent_mxn": round(total_spent, 2),
            "city": u.get("city") or "",
        })

        if len(results) >= limit:
            break

    return results


def _build_unsubscribe_link(token: str) -> str:
    return f"{_frontend_url()}/unsubscribe?token={token}"


async def _ensure_unsubscribe_token(user_id: str) -> str:
    existing = await db.email_unsubscribe_tokens.find_one({"user_id": user_id}, {"_id": 0, "token": 1})
    if existing:
        return existing["token"]
    token = secrets.token_urlsafe(32)
    await db.email_unsubscribe_tokens.insert_one({
        "user_id": user_id,
        "token": token,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return token


def _render_template(template: TemplateType, ctx: dict) -> tuple[str, str, str]:
    """Returns (subject, plain_text, html)."""
    name = ctx.get("name") or "amig@"
    incentive = ctx.get("incentive_code")
    incentive_amount = ctx.get("incentive_amount", INCENTIVE_AMOUNT_MXN)
    days = ctx.get("days_inactive", 30)
    unsub_link = ctx.get("unsubscribe_link", "")
    base_url = _frontend_url()

    if template == "miss_you":
        subject = f"Te extranamos en Bookvia, {name} 💛"
        body = (
            f"Hola {name},\n\n"
            f"Notamos que no has reservado en Bookvia en los ultimos {days} dias. "
            f"Cuando estes listo para tu proxima cita, hazla en menos de 60 segundos desde tu celular.\n\n"
        )
        if incentive:
            body += (
                f"De regalo: ${incentive_amount:.0f} MXN de saldo Bookvia para tu proxima reserva. "
                f"Codigo: {incentive} (vence en {INCENTIVE_EXPIRY_DAYS} dias).\n\n"
            )
        body += f"Reserva ahora: {base_url}\n\nBookvia - Reservas en 60 segundos\n\n---\n"
        body += f"Si ya no quieres recibir nuestros correos: {unsub_link}\n"
    elif template == "first_booking":
        subject = f"{name}, tu primera reserva esta a 1 click 🎯"
        body = (
            f"Hola {name},\n\n"
            f"Te registraste en Bookvia hace {days} dias pero aun no has hecho tu primera reserva. "
            f"Te ayudamos a empezar:\n\n"
            f"- Reserva en 60 segundos sin llamadas\n"
            f"- Cancelaciones sin complicaciones\n"
            f"- Solo $8 MXN de cuota fija por reserva\n\n"
        )
        if incentive:
            body += (
                f"Tu primera reserva con ${incentive_amount:.0f} MXN de descuento Bookvia. "
                f"Codigo: {incentive} (vence en {INCENTIVE_EXPIRY_DAYS} dias).\n\n"
            )
        body += f"Explorar negocios: {base_url}\n\nBookvia\n\n---\n"
        body += f"Si ya no quieres recibir nuestros correos: {unsub_link}\n"
    else:  # new_businesses
        subject = "Nuevos negocios en Bookvia esta semana 📍"
        body = (
            f"Hola {name},\n\n"
            f"Tenemos nuevos negocios verificados disponibles en Bookvia.\n\n"
            f"Ver novedades: {base_url}\n\nBookvia\n\n---\n"
            f"Si ya no quieres recibir nuestros correos: {unsub_link}\n"
        )

    # Simple branded HTML version
    html = f"""<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F8F4ED; padding: 24px;">
  <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden;">
    <div style="background: #F05D5E; color: #fff; padding: 24px; text-align: center;">
      <div style="font-size: 28px; font-weight: bold;">Bookvia</div>
    </div>
    <div style="padding: 24px; color: #0F172A; line-height: 1.6;">
      <pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">{body[:body.rfind('---')]}</pre>
      <a href="{base_url}" style="display: inline-block; background: #F05D5E; color: #fff; padding: 12px 24px; border-radius: 24px; text-decoration: none; font-weight: bold; margin-top: 16px;">Abrir Bookvia</a>
    </div>
    <div style="padding: 16px 24px; background: #F8F4ED; font-size: 12px; color: #64748B; text-align: center;">
      <p style="margin: 0;">Recibes este correo porque te registraste en Bookvia.</p>
      <p style="margin: 6px 0 0 0;"><a href="{unsub_link}" style="color: #64748B;">Cancelar suscripcion</a></p>
    </div>
  </div>
</body></html>"""

    return subject, body, html


async def run_winback_campaign(
    segment: SegmentType,
    template: TemplateType,
    days: int,
    *,
    incentive: bool = True,
    actor_admin_id: Optional[str] = None,
    dry_run: bool = False,
) -> dict:
    """Execute a winback campaign and return aggregated results."""
    campaign_id = str(uuid.uuid4())
    started_at = datetime.now(timezone.utc).isoformat()

    targets = await find_inactive_users(segment=segment, days=days, limit=2000)
    sent = 0
    failed = 0
    skipped = 0

    for u in targets:
        if not u.get("email"):
            skipped += 1
            continue
        try:
            # Generate per-user incentive code (wallet credit on first redeem)
            incentive_code = None
            if incentive:
                incentive_code = f"BV{secrets.token_hex(3).upper()}"
                if not dry_run:
                    await db.winback_incentives.insert_one({
                        "code": incentive_code,
                        "user_id": u["id"],
                        "amount_mxn": INCENTIVE_AMOUNT_MXN,
                        "expires_at": (datetime.now(timezone.utc) + timedelta(days=INCENTIVE_EXPIRY_DAYS)).isoformat(),
                        "redeemed": False,
                        "campaign_id": campaign_id,
                        "created_at": started_at,
                    })

            unsub_token = await _ensure_unsubscribe_token(u["id"])
            unsub_link = _build_unsubscribe_link(unsub_token)
            inactive_days = u.get("days_since_last_booking") or u.get("days_since_signup") or days

            subject, body, html = _render_template(template, {
                "name": u["name"],
                "incentive_code": incentive_code,
                "incentive_amount": INCENTIVE_AMOUNT_MXN,
                "days_inactive": inactive_days,
                "unsubscribe_link": unsub_link,
            })

            if dry_run:
                sent += 1
                continue

            await send_email(
                to=u["email"],
                subject=subject,
                body=body,
                html=html,
                template=f"winback_{template}",
                data={"campaign_id": campaign_id, "user_id": u["id"]},
            )
            await db.winback_emails.insert_one({
                "id": str(uuid.uuid4()),
                "campaign_id": campaign_id,
                "user_id": u["id"],
                "email": u["email"],
                "template": template,
                "segment": u["segment"],
                "incentive_code": incentive_code,
                "sent_at": datetime.now(timezone.utc).isoformat(),
            })
            sent += 1
        except Exception as e:
            logger.error(f"Winback email failed for user {u['id']}: {e}")
            failed += 1

    finished_at = datetime.now(timezone.utc).isoformat()
    summary = {
        "id": campaign_id,
        "segment": segment,
        "template": template,
        "days_filter": days,
        "total_targets": len(targets),
        "sent": sent,
        "failed": failed,
        "skipped": skipped,
        "incentive": incentive,
        "dry_run": dry_run,
        "actor_admin_id": actor_admin_id,
        "started_at": started_at,
        "finished_at": finished_at,
    }
    if not dry_run:
        await db.winback_campaigns.insert_one(dict(summary))
    return summary


async def redeem_winback_incentive(code: str, user_id: str) -> Optional[float]:
    """Apply a winback incentive code as wallet credit. Returns the amount
    credited or None if invalid/expired/already redeemed."""
    doc = await db.winback_incentives.find_one({"code": code, "user_id": user_id})
    if not doc or doc.get("redeemed"):
        return None
    expires = doc.get("expires_at")
    if expires and expires < datetime.now(timezone.utc).isoformat():
        return None
    amount = float(doc.get("amount_mxn") or 0)
    if amount <= 0:
        return None
    await credit_wallet(user_id, amount, CREDIT_ADMIN_ADJUSTMENT, description=f"Winback incentive {code}")
    await db.winback_incentives.update_one(
        {"code": code, "user_id": user_id},
        {"$set": {"redeemed": True, "redeemed_at": datetime.now(timezone.utc).isoformat()}},
    )
    return amount
