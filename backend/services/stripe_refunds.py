"""
Fase 11: Real Stripe refund issuance + chargeback / dispute handling.

This module centralizes every money-movement call to Stripe (refunds,
dispute sync) with strong idempotency and audit trails so the cancel
flow in bookings.py and the admin-refund endpoint both converge on the
same implementation.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

import stripe as stripe_lib

from core.database import db
from core.helpers import generate_id

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def issue_stripe_refund(
    transaction: dict,
    amount_mxn: float,
    reason: str = "requested_by_customer",
    metadata: Optional[dict] = None,
    actor: str = "system",
) -> dict:
    """Emit a real Stripe refund for a paid transaction.

    Behaviour:
      * Only refunds up to `stripe_charge_amount` (the portion actually
        charged to card). Any surplus must be refunded separately to the
        wallet by the caller.
      * Uses an idempotency key tied to the transaction + amount so
        retries never double-refund.
      * Stores the Stripe refund id on the transaction and inserts an
        audit row in `refund_events`.
    """
    payment_intent_id = transaction.get("stripe_payment_intent_id")
    if not payment_intent_id:
        raise ValueError("transaction has no payment_intent - cannot refund to card")

    card_portion = float(
        transaction.get("stripe_charge_amount")
        or (transaction.get("client_paid") or 0) - float(transaction.get("wallet_applied") or 0)
    )
    card_portion = max(0.0, round(card_portion, 2))
    refund_on_card = min(round(float(amount_mxn), 2), card_portion)
    if refund_on_card <= 0.0:
        raise ValueError("No card portion left to refund")

    stripe_amount_cents = int(round(refund_on_card * 100))
    idem_key = f"refund-{transaction['id']}-{stripe_amount_cents}"

    meta = {
        "bookvia_transaction_id": transaction["id"],
        "bookvia_booking_id": transaction.get("booking_id", ""),
        "bookvia_reason": reason,
        "actor": actor,
    }
    if metadata:
        meta.update({str(k): str(v) for k, v in metadata.items()})

    try:
        refund = stripe_lib.Refund.create(
            payment_intent=payment_intent_id,
            amount=stripe_amount_cents,
            reason="requested_by_customer",
            metadata=meta,
            idempotency_key=idem_key,
        )
    except stripe_lib.error.IdempotencyError:
        # Same key was used before; fetch the existing refund.
        existing = stripe_lib.Refund.list(payment_intent=payment_intent_id, limit=10)
        refund = next((r for r in existing.data if r.metadata.get("bookvia_transaction_id") == transaction["id"] and r.amount == stripe_amount_cents), None)
        if not refund:
            raise

    # Persist on the transaction
    refund_id = getattr(refund, "id", None)
    refunds_list = transaction.get("stripe_refunds") or []
    refunds_list.append({
        "stripe_refund_id": refund_id,
        "amount_mxn": refund_on_card,
        "status": getattr(refund, "status", "pending"),
        "created_at": _now_iso(),
        "actor": actor,
        "reason": reason,
    })
    await db.transactions.update_one(
        {"id": transaction["id"]},
        {"$set": {
            "stripe_refunds": refunds_list,
            "last_stripe_refund_id": refund_id,
            "refund_issued_at": _now_iso(),
        }},
    )

    # Audit row
    await db.refund_events.insert_one({
        "id": generate_id(),
        "transaction_id": transaction["id"],
        "booking_id": transaction.get("booking_id"),
        "user_id": transaction.get("user_id"),
        "business_id": transaction.get("business_id"),
        "stripe_refund_id": refund_id,
        "amount_mxn": refund_on_card,
        "reason": reason,
        "actor": actor,
        "created_at": _now_iso(),
    })

    logger.info(
        f"Stripe refund issued: tx={transaction['id']} amount=${refund_on_card} "
        f"stripe_id={refund_id} actor={actor}"
    )
    return {
        "stripe_refund_id": refund_id,
        "amount_refunded_on_card": refund_on_card,
        "surplus_to_wallet": round(float(amount_mxn) - refund_on_card, 2),
    }


async def record_stripe_event(event_id: str, event_type: str) -> bool:
    """Atomically register a Stripe event as processed.

    Returns True if this is the first time we see it, False if it has
    already been handled. Used by the webhook to guarantee idempotency
    even across Stripe retries (up to 3 days).
    """
    try:
        await db.stripe_events.insert_one({
            "_id": event_id,
            "event_type": event_type,
            "received_at": _now_iso(),
        })
        return True
    except Exception as e:
        # Duplicate key -> already processed
        msg = str(e).lower()
        if "duplicate" in msg or "e11000" in msg:
            return False
        raise
