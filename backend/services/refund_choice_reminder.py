"""Refund-choice reminder scheduler.

Two responsibilities, both targeting transactions in
`refund_destination_choice = 'pending'` (i.e. the business cancelled but the
client hasn't picked wallet vs card yet).

  1. Every 48 hours, ping the client (email + push) reminding them to pick.
  2. After 7 days without a pick, default to "wallet" automatically — the
     client receives the credit instantly and the queue stays clean.

The actual wallet credit is delegated to `services.wallet.credit_wallet` and
the transaction is finalised the same way as the explicit `wallet` choice in
`bookings.refund_choice`.
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta

from core.database import db

logger = logging.getLogger(__name__)

REMINDER_INTERVAL_HOURS = 48  # Send reminder every 48h after cancellation
AUTO_WALLET_AFTER_HOURS = 24 * 7  # Fall back to wallet after 7 days
TICK_SECONDS = 3600  # Run the scan once an hour


async def refund_choice_reminder_scheduler():
    """Background task: scan awaiting-choice tx, send reminders, auto-fallback."""
    logger.info("Refund-choice reminder scheduler started")
    await asyncio.sleep(120)  # Give the rest of the app time to boot
    while True:
        try:
            await _scan_once()
        except Exception as e:
            logger.error(f"Refund-choice reminder error: {e}")
        await asyncio.sleep(TICK_SECONDS)


async def _scan_once():
    """One pass over the awaiting-choice queue."""
    now = datetime.now(timezone.utc)
    cursor = db.transactions.find(
        {"refund_pending": True, "refund_destination_choice": "pending"},
        {"_id": 0},
    )
    rows = await cursor.to_list(2000)
    if not rows:
        return

    reminded = 0
    auto_fallbacked = 0
    for tx in rows:
        since_iso = tx.get("refund_pending_since") or tx.get("updated_at")
        if not since_iso:
            continue
        try:
            since = datetime.fromisoformat(since_iso.replace("Z", "+00:00"))
        except Exception:
            continue
        age_hours = (now - since).total_seconds() / 3600

        # Auto-fallback after 7 days
        if age_hours >= AUTO_WALLET_AFTER_HOURS:
            try:
                await _auto_fallback_to_wallet(tx)
                auto_fallbacked += 1
            except Exception as e:
                logger.error(f"Auto-fallback wallet failed for tx {tx.get('id')}: {e}")
            continue

        # 48h reminder cadence
        last_reminded_at = tx.get("refund_choice_last_reminded_at")
        send_now = False
        if not last_reminded_at:
            # Only send the first reminder once 48h have passed (not immediately)
            send_now = age_hours >= REMINDER_INTERVAL_HOURS
        else:
            try:
                last_dt = datetime.fromisoformat(last_reminded_at.replace("Z", "+00:00"))
                send_now = (now - last_dt).total_seconds() / 3600 >= REMINDER_INTERVAL_HOURS
            except Exception:
                send_now = True

        if send_now:
            try:
                await _send_reminder(tx)
                await db.transactions.update_one(
                    {"id": tx["id"]},
                    {"$set": {"refund_choice_last_reminded_at": now.isoformat()}, "$inc": {"refund_choice_reminders_sent": 1}},
                )
                reminded += 1
            except Exception as e:
                logger.error(f"Reminder failed for tx {tx.get('id')}: {e}")

    if reminded or auto_fallbacked:
        logger.info(f"Refund-choice scan: reminded={reminded} auto_wallet_fallback={auto_fallbacked}")


async def _send_reminder(tx: dict):
    """Send email + push reminding client to pick refund destination."""
    user_id = tx.get("user_id")
    booking_id = tx.get("booking_id")
    amount = float(tx.get("refund_amount") or tx.get("amount_total") or 0)
    if not user_id or amount <= 0:
        return

    # Push notification (in-app)
    try:
        from core.helpers import create_notification
        await create_notification(
            user_id,
            "Recuerda elegir tu reembolso",
            f"Aun tienes ${amount:.2f} MXN esperando. Elige saldo Bookvia (instantaneo) o tarjeta (5-10 dias).",
            "refund_choice_needed",
            {"booking_id": booking_id, "transaction_id": tx.get("id"), "amount": amount},
        )
    except Exception as e:
        logger.warning(f"Push reminder failed: {e}")

    # Email reminder
    try:
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1, "full_name": 1, "notify_email": 1})
        if not user or not user.get("email") or not user.get("notify_email", True):
            return
        from services.email import send_email, email_html, NOREPLY_EMAIL
        link = "https://www.bookvia.app/bookings"
        subject = f"Recuerda elegir tu reembolso de ${amount:.2f} MXN"
        content = (
            f'<p style="color:#334155;font-size:15px;line-height:1.6;">Hola <strong>{user.get("full_name", "Cliente")}</strong>,</p>'
            f'<p style="color:#334155;font-size:15px;line-height:1.6;">'
            f'Tu reembolso de <strong>${amount:.2f} MXN</strong> sigue esperando que elijas como recibirlo.</p>'
            f'<div style="margin:18px 0;padding:14px 16px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px;">'
            f'<p style="margin:0 0 8px;color:#14532d;font-size:13px;font-weight:bold;">Tus opciones:</p>'
            f'<ul style="margin:0;padding-left:20px;color:#166534;font-size:13px;line-height:1.7;">'
            f'<li><strong>Saldo Bookvia:</strong> Instantaneo, lo usas en tu proxima reserva.</li>'
            f'<li><strong>Tarjeta:</strong> El admin lo procesa, ves el monto en 5-10 dias habiles.</li>'
            f'</ul></div>'
            f'<table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr>'
            f'<td style="background:#16a34a;border-radius:8px;padding:14px 28px;">'
            f'<a href="{link}" style="color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">Elegir ahora</a>'
            f'</td></tr></table>'
            f'<p style="color:#94a3b8;font-size:12px;">Si no eliges en los proximos dias, depositaremos el monto a tu saldo Bookvia automaticamente para que no quede atorado.</p>'
        )
        await send_email(
            to=user["email"],
            subject=subject,
            body=f"Tu reembolso de ${amount:.2f} sigue esperando. Elige en {link}",
            html=email_html(subject, content),
            template="refund_choice_reminder",
            data={"amount": amount, "booking_id": booking_id},
            from_email=NOREPLY_EMAIL,
        )
    except Exception as e:
        logger.warning(f"Email reminder failed: {e}")


async def _auto_fallback_to_wallet(tx: dict):
    """7d+ without choice -> auto-credit the wallet.

    Mirrors the wallet branch of `bookings.refund_choice`.
    """
    user_id = tx.get("user_id")
    booking_id = tx.get("booking_id")
    amount = float(tx.get("refund_amount") or tx.get("amount_total") or 0)
    if not user_id or amount <= 0:
        return
    now = datetime.now(timezone.utc)

    from services.wallet import credit_wallet, CREDIT_CANCELLATION
    await credit_wallet(
        user_id=user_id,
        amount=amount,
        tx_type=CREDIT_CANCELLATION,
        booking_id=booking_id,
        description="Reembolso por cancelacion del negocio (saldo Bookvia - fallback automatico tras 7 dias sin eleccion)",
    )

    from models.enums import TransactionStatus
    await db.transactions.update_one(
        {"id": tx["id"]},
        {"$set": {
            "status": TransactionStatus.REFUND_FULL,
            "refund_destination_choice": "wallet",
            "refund_destination": "wallet",
            "refund_pending": False,
            "refund_issued_at": now.isoformat(),
            "refund_issued_by": "auto_wallet_fallback_7d",
            "auto_fallback": True,
            "updated_at": now.isoformat(),
        }},
    )

    try:
        from core.helpers import create_transaction_ledger_entries
        await create_transaction_ledger_entries({**tx, "refund_amount": amount}, TransactionStatus.REFUND_FULL)
    except Exception as e:
        logger.error(f"Ledger on auto wallet fallback failed: {e}")
    try:
        from services.funds_state import mark_refunded
        await mark_refunded(tx["id"], actor="auto_wallet_fallback", reason="7d without client choice")
    except Exception as e:
        logger.error(f"Funds state on auto fallback failed: {e}")

    # Notify the user that the fallback ran
    try:
        from core.helpers import create_notification
        await create_notification(
            user_id,
            "Reembolso acreditado a tu saldo",
            f"Depositamos ${amount:.2f} MXN a tu saldo Bookvia. Usalo en tu proxima reserva.",
            "refund_auto_wallet",
            {"booking_id": booking_id, "transaction_id": tx.get("id"), "amount": amount},
        )
    except Exception as e:
        logger.warning(f"Auto-fallback push failed: {e}")
