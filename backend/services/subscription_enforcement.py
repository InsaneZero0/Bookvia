"""
Phase D — Subscription enforcement service.

Cron logic that escalates the subscription state of businesses with
failed payments:
  - Day 0-6 of `subscription_failed_at`: status='past_due' (warning emails)
  - Day 7+: suspend (banned=True, banned_reason='subscription_unpaid')
  - Day 30+: cancel definitely (`subscription_status='canceled'`)

Runs daily from the existing scheduler in services.scheduler.
"""
from datetime import datetime, timezone, timedelta
import logging

from core.database import db
from services.email import send_email

logger = logging.getLogger(__name__)

GRACE_DAYS_BEFORE_SUSPENSION = 7
GRACE_DAYS_BEFORE_CANCELLATION = 30


async def run_subscription_enforcement():
    """Daily cron — suspend or cancel businesses with stale unpaid subscriptions."""
    now = datetime.now(timezone.utc)
    suspend_cutoff = (now - timedelta(days=GRACE_DAYS_BEFORE_SUSPENSION)).isoformat()
    cancel_cutoff = (now - timedelta(days=GRACE_DAYS_BEFORE_CANCELLATION)).isoformat()

    # 1) Suspend (>=7 days unpaid, not yet suspended)
    to_suspend = await db.businesses.find({
        "subscription_status": "past_due",
        "subscription_failed_at": {"$lte": suspend_cutoff},
        "banned_reason": {"$ne": "subscription_unpaid"},
    }, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(500)

    suspended = 0
    for biz in to_suspend:
        await db.businesses.update_one(
            {"id": biz["id"]},
            {"$set": {
                "banned": True,
                "banned_reason": "subscription_unpaid",
                "suspended_at": now.isoformat(),
            }},
        )
        suspended += 1
        try:
            await send_email(
                to=biz.get("email"),
                subject="Tu cuenta Bookvia ha sido suspendida por pago pendiente",
                body=(
                    f"Hola {biz.get('name', 'negocio')},\n\n"
                    f"Tu suscripcion mensual de Bookvia lleva 7 dias sin pagarse. "
                    f"Tu negocio ha sido SUSPENDIDO temporalmente:\n"
                    f"  - No apareces en busquedas\n"
                    f"  - No puedes recibir nuevas reservas\n\n"
                    f"Para reactivarte, actualiza tu tarjeta en: https://bookvia.app/business/finance\n\n"
                    f"Si no actualizas en los proximos 23 dias, la cuenta sera cancelada definitivamente.\n\n"
                    f"Bookvia"
                ),
                template="subscription_suspended",
                data={"business_id": biz["id"]},
            )
        except Exception as e:
            logger.warning(f"Could not send suspension email to biz {biz['id']}: {e}")

    # 2) Cancel definitely (>=30 days unpaid)
    to_cancel = await db.businesses.find({
        "subscription_status": "past_due",
        "subscription_failed_at": {"$lte": cancel_cutoff},
    }, {"_id": 0, "id": 1, "name": 1, "email": 1, "stripe_subscription_id": 1}).to_list(500)

    canceled = 0
    for biz in to_cancel:
        # Cancel Stripe subscription if present
        if biz.get("stripe_subscription_id"):
            try:
                import stripe as stripe_lib
                from core.stripe_config import STRIPE_API_KEY
                stripe_lib.api_key = STRIPE_API_KEY
                stripe_lib.Subscription.delete(biz["stripe_subscription_id"])
            except Exception as e:
                logger.warning(f"Could not cancel Stripe subscription {biz.get('stripe_subscription_id')}: {e}")
        await db.businesses.update_one(
            {"id": biz["id"]},
            {"$set": {
                "subscription_status": "canceled",
                "subscription_canceled_at": now.isoformat(),
                "banned": True,
                "banned_reason": "subscription_canceled",
            }},
        )
        canceled += 1
        try:
            await send_email(
                to=biz.get("email"),
                subject="Cuenta Bookvia cancelada por falta de pago",
                body=(
                    f"Hola {biz.get('name', 'negocio')},\n\n"
                    f"Tu suscripcion mensual lleva 30 dias sin pagarse. "
                    f"Tu cuenta de Bookvia ha sido CANCELADA definitivamente.\n\n"
                    f"Para reactivar el servicio tendras que registrarte de nuevo.\n\n"
                    f"Bookvia"
                ),
                template="subscription_canceled",
                data={"business_id": biz["id"]},
            )
        except Exception as e:
            logger.warning(f"Could not send cancel email to biz {biz['id']}: {e}")

    logger.info(f"Subscription enforcement: {suspended} suspended, {canceled} canceled")
    return {"suspended": suspended, "canceled": canceled}
