"""Push notifications service (Firebase Cloud Messaging).

Centralizes all push-notification fan-out for Bookvia. Each "event" the
business cares about (new booking, booking canceled, settlement sent, etc.)
calls one helper here, and we handle:

- Token storage (`push_tokens` collection, multi-device per user).
- Idempotent token registration.
- Sending via Firebase Admin SDK.
- Dropping invalid / unregistered tokens automatically.
- Deep links: every notification carries a `data.url` payload the Capacitor
  app uses to navigate when the user taps it.
- User-level preferences (`notification_preferences` on the user doc) so
  each client can opt out of any individual notification type.

`init_firebase()` is lazy and safe to call from any code path; it
initializes the Firebase Admin SDK exactly once.

Two credential sources are supported (in priority order):
1. `FIREBASE_ADMIN_SDK_JSON` env var containing the entire service account
   JSON as a string. Use this on Railway/Vercel/production where you can't
   ship a file on disk.
2. `secrets/firebase-admin.json` on disk (default for local dev).
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

import firebase_admin
from firebase_admin import credentials as fb_credentials
from firebase_admin import messaging as fb_messaging

logger = logging.getLogger(__name__)

# Module-level cache so we never double-init Firebase
_firebase_initialized = False


def init_firebase() -> bool:
    """Initialize Firebase Admin SDK once. Returns True if FCM is usable."""
    global _firebase_initialized
    if _firebase_initialized:
        return True
    if firebase_admin._apps:
        _firebase_initialized = True
        return True

    cred = None
    raw_json = os.environ.get("FIREBASE_ADMIN_SDK_JSON")
    if raw_json:
        try:
            cred = fb_credentials.Certificate(json.loads(raw_json))
        except Exception as e:
            logger.error("FIREBASE_ADMIN_SDK_JSON env is set but invalid JSON: %s", e)
            return False
    else:
        secrets_path = os.environ.get(
            "FIREBASE_ADMIN_SDK_PATH",
            os.path.join(os.path.dirname(os.path.dirname(__file__)), "secrets", "firebase-admin.json"),
        )
        if os.path.isfile(secrets_path):
            cred = fb_credentials.Certificate(secrets_path)
        else:
            logger.warning(
                "Firebase not configured: neither FIREBASE_ADMIN_SDK_JSON env nor %s found. "
                "Push notifications will be no-ops.",
                secrets_path,
            )
            return False

    try:
        firebase_admin.initialize_app(cred)
        _firebase_initialized = True
        logger.info("Firebase Admin SDK initialized for push notifications")
        return True
    except Exception as e:
        logger.error("Failed to initialize Firebase Admin SDK: %s", e)
        return False


# -----------------------------------------------------------------------------
# Notification preferences
# -----------------------------------------------------------------------------

# Every notification type maps to a flag inside user.notification_preferences.
# If a flag is missing, defaults to True (opt-in by default for all events).
NOTIFICATION_TYPES = {
    # Customer-facing
    "booking_confirmed": "Reserva confirmada",
    "booking_reminder_24h": "Recordatorio 24h antes",
    "booking_reminder_1h": "Recordatorio 1h antes",
    "booking_canceled_by_business": "Negocio cancela tu cita",
    "refund_processed": "Reembolso procesado",
    "review_request": "Pedir reseña post-servicio",
    # Business-facing
    "new_booking": "Nueva reserva recibida",
    "booking_canceled_by_customer": "Cliente cancela cita",
    "settlement_sent": "Liquidación enviada",
    "business_approved": "Negocio aprobado",
    "subscription_expired": "Suscripción vencida",
    "trial_ending": "Trial por terminar",
}


def default_preferences() -> Dict[str, bool]:
    """All notifications enabled by default."""
    return {key: True for key in NOTIFICATION_TYPES}


# -----------------------------------------------------------------------------
# Token storage
# -----------------------------------------------------------------------------

async def register_token(db, user_id: str, token: str, platform: str = "android") -> None:
    """Upsert an FCM device token for the given user.

    Tokens are unique per device. A user may have multiple (phone+tablet+web).
    `last_seen_at` is bumped on every (re-)register so we can prune stale ones.
    """
    if not user_id or not token:
        return
    now = datetime.now(timezone.utc).isoformat()
    await db.push_tokens.update_one(
        {"token": token},
        {
            "$set": {
                "token": token,
                "user_id": user_id,
                "platform": platform,
                "last_seen_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )


async def unregister_token(db, token: str) -> None:
    await db.push_tokens.delete_one({"token": token})


async def _tokens_for_user(db, user_id: str) -> List[str]:
    docs = await db.push_tokens.find({"user_id": user_id}, {"_id": 0, "token": 1}).to_list(50)
    return [d["token"] for d in docs if d.get("token")]


async def _drop_invalid_tokens(db, tokens: Iterable[str]) -> None:
    bad = [t for t in tokens if t]
    if bad:
        await db.push_tokens.delete_many({"token": {"$in": bad}})


async def _is_enabled(db, user_id: str, notif_type: str) -> bool:
    """Check the per-user preference flag."""
    user = await db.users.find_one(
        {"id": user_id},
        {"_id": 0, "notification_preferences": 1},
    )
    if not user:
        return True  # If we can't find the user, fail open
    prefs = (user.get("notification_preferences") or {})
    return bool(prefs.get(notif_type, True))


# -----------------------------------------------------------------------------
# Send
# -----------------------------------------------------------------------------

async def send_to_user(
    db,
    user_id: str,
    notif_type: str,
    title: str,
    body: str,
    *,
    deep_link: Optional[str] = None,
    extra_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Send a push notification to all devices of `user_id`.

    Honors user preferences and silently no-ops if Firebase isn't configured.
    Returns a summary dict (sent / failed / skipped).
    """
    if not init_firebase():
        return {"sent": 0, "failed": 0, "skipped_no_firebase": True}

    if not await _is_enabled(db, user_id, notif_type):
        return {"sent": 0, "failed": 0, "skipped_pref": True}

    tokens = await _tokens_for_user(db, user_id)
    if not tokens:
        return {"sent": 0, "failed": 0, "skipped_no_tokens": True}

    # Build the data payload. All values must be strings for FCM.
    data: Dict[str, str] = {"notif_type": notif_type}
    if deep_link:
        data["url"] = deep_link
    for k, v in (extra_data or {}).items():
        if v is None:
            continue
        data[str(k)] = str(v)

    notification = fb_messaging.Notification(title=title, body=body)
    android_config = fb_messaging.AndroidConfig(
        priority="high",
        notification=fb_messaging.AndroidNotification(
            channel_id="bookvia_default",
            sound="default",
            click_action="FLUTTER_NOTIFICATION_CLICK",  # standard for tap-to-open
        ),
    )

    success = 0
    failed: List[str] = []
    for token in tokens:
        try:
            msg = fb_messaging.Message(
                token=token,
                notification=notification,
                data=data,
                android=android_config,
            )
            fb_messaging.send(msg)
            success += 1
        except fb_messaging.UnregisteredError:
            # Stale token; remove from DB
            failed.append(token)
        except fb_messaging.SenderIdMismatchError:
            failed.append(token)
        except Exception as e:
            logger.warning("FCM send failed for token %s...: %s", token[:12], e)

    if failed:
        await _drop_invalid_tokens(db, failed)

    return {"sent": success, "failed": len(failed)}


# -----------------------------------------------------------------------------
# High-level event helpers (used from routers)
# -----------------------------------------------------------------------------

async def notify_new_booking(db, *, business_owner_user_id: str, booking_id: str,
                              customer_name: str, service_name: str,
                              starts_at_human: str) -> Dict[str, Any]:
    """Tell the business owner a customer just booked."""
    return await send_to_user(
        db,
        business_owner_user_id,
        "new_booking",
        title="Nueva reserva",
        body=f"{customer_name} reservó {service_name} - {starts_at_human}",
        deep_link=f"/business/bookings/{booking_id}",
        extra_data={"booking_id": booking_id},
    )


async def notify_booking_confirmed(db, *, customer_user_id: str, booking_id: str,
                                    business_name: str, starts_at_human: str) -> Dict[str, Any]:
    """Confirmation push to the customer right after they pay/book."""
    return await send_to_user(
        db,
        customer_user_id,
        "booking_confirmed",
        title="Reserva confirmada",
        body=f"Tu cita en {business_name} es {starts_at_human}",
        deep_link=f"/bookings/{booking_id}",
        extra_data={"booking_id": booking_id},
    )


async def notify_booking_canceled_by_business(db, *, customer_user_id: str, booking_id: str,
                                                business_name: str) -> Dict[str, Any]:
    return await send_to_user(
        db,
        customer_user_id,
        "booking_canceled_by_business",
        title="Cita cancelada",
        body=f"{business_name} canceló tu cita. Recibirás reembolso completo.",
        deep_link=f"/bookings/{booking_id}",
        extra_data={"booking_id": booking_id},
    )


async def notify_booking_canceled_by_customer(db, *, business_owner_user_id: str, booking_id: str,
                                                customer_name: str, starts_at_human: str) -> Dict[str, Any]:
    return await send_to_user(
        db,
        business_owner_user_id,
        "booking_canceled_by_customer",
        title="Cita cancelada",
        body=f"{customer_name} canceló su cita de {starts_at_human}",
        deep_link=f"/business/bookings/{booking_id}",
        extra_data={"booking_id": booking_id},
    )


async def notify_booking_reminder(db, *, customer_user_id: str, booking_id: str,
                                    business_name: str, starts_at_human: str,
                                    hours_before: int) -> Dict[str, Any]:
    notif_type = "booking_reminder_24h" if hours_before >= 12 else "booking_reminder_1h"
    when = "Mañana" if hours_before >= 12 else "En 1 hora"
    return await send_to_user(
        db,
        customer_user_id,
        notif_type,
        title=f"{when}: cita en {business_name}",
        body=f"Tu cita es {starts_at_human}",
        deep_link=f"/bookings/{booking_id}",
        extra_data={"booking_id": booking_id, "hours_before": hours_before},
    )


async def notify_refund_processed(db, *, customer_user_id: str, booking_id: str,
                                    amount_mxn: float) -> Dict[str, Any]:
    return await send_to_user(
        db,
        customer_user_id,
        "refund_processed",
        title="Reembolso procesado",
        body=f"Tu reembolso de ${amount_mxn:.2f} MXN está en camino (2-5 días hábiles)",
        deep_link=f"/bookings/{booking_id}",
        extra_data={"booking_id": booking_id, "amount": amount_mxn},
    )


async def notify_review_request(db, *, customer_user_id: str, booking_id: str,
                                  business_name: str) -> Dict[str, Any]:
    return await send_to_user(
        db,
        customer_user_id,
        "review_request",
        title=f"¿Cómo te fue en {business_name}?",
        body="Califica tu experiencia y ayuda a otros usuarios",
        deep_link=f"/bookings/{booking_id}/review",
        extra_data={"booking_id": booking_id},
    )


async def notify_settlement_sent(db, *, business_owner_user_id: str, amount_mxn: float,
                                   period_label: str) -> Dict[str, Any]:
    return await send_to_user(
        db,
        business_owner_user_id,
        "settlement_sent",
        title="Liquidación enviada",
        body=f"Tu liquidación de {period_label} (${amount_mxn:.2f} MXN) fue enviada a tu cuenta",
        deep_link="/business/settlements",
        extra_data={"amount": amount_mxn},
    )


async def notify_business_approved(db, *, business_owner_user_id: str, business_id: str) -> Dict[str, Any]:
    return await send_to_user(
        db,
        business_owner_user_id,
        "business_approved",
        title="¡Tu negocio fue aprobado!",
        body="Ya apareces en Bookvia. Empieza a recibir reservas.",
        deep_link="/business/dashboard",
        extra_data={"business_id": business_id},
    )


async def notify_subscription_expired(db, *, business_owner_user_id: str) -> Dict[str, Any]:
    return await send_to_user(
        db,
        business_owner_user_id,
        "subscription_expired",
        title="Suscripción vencida",
        body="Renueva para que tu negocio siga apareciendo en Bookvia",
        deep_link="/business/subscription",
    )


async def notify_trial_ending(db, *, business_owner_user_id: str, days_left: int) -> Dict[str, Any]:
    return await send_to_user(
        db,
        business_owner_user_id,
        "trial_ending",
        title=f"Tu prueba gratis termina en {days_left} días",
        body="Suscríbete para no perder visibilidad",
        deep_link="/business/subscription",
        extra_data={"days_left": days_left},
    )
