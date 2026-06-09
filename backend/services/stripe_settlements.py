"""
Stripe Connect Transfer Service — Fase C de Liquidaciones.

Once `generate_settlements_day20()` has created a `settlement` doc in MongoDB,
this service takes that settlement and actually MOVES the money on Stripe:

    Bookvia Stripe Balance  ───stripe.Transfer.create()───►  Connect Acct
                                                                  │
                                                                  ▼
                                                          (daily payout)
                                                                  │
                                                                  ▼
                                                       Business' bank CLABE

Why a separate step (not inside generate_settlements_day20):
  * Admin can preview the settlement amounts BEFORE moving money.
  * Idempotency: each Transfer uses `idempotency_key=settlement-{id}` so
    retries do not double-spend.
  * Partial recovery: if 7 of 10 transfers succeed and 3 fail (e.g., a
    Connect account is restricted), the settlement records WHICH ones
    succeeded so the admin can retry just the failed ones.
  * Some businesses may not have Connect yet — those keep
    `status=pending` and fall back to manual SPEI (CSV export).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import stripe as stripe_lib

from core.database import db
from core.stripe_config import STRIPE_API_KEY
from models.enums import SettlementStatus

logger = logging.getLogger(__name__)

stripe_lib.api_key = STRIPE_API_KEY


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def execute_stripe_transfers_for_settlement(
    settlement_id: str,
    *,
    actor_id: Optional[str] = None,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """Execute the Stripe Transfer for a single settlement.

    Steps:
      1. Load the settlement; bail if not found or already paid via Stripe.
      2. Load the business and confirm it has stripe_connect_account_id with
         charges_enabled & payouts_enabled.
      3. Convert net_payout to cents (MXN).
      4. Call stripe.Transfer.create() with idempotency_key.
      5. Persist stripe_transfer_id + status=PAID + paid_via=stripe.
      6. Mark each transaction with funds_state=PAID_OUT.

    If business is NOT on Stripe Connect → returns reason="no_connect" and
    leaves the settlement as PENDING for manual SPEI processing.
    """
    settlement = await db.settlements.find_one({"id": settlement_id}, {"_id": 0})
    if not settlement:
        return {"ok": False, "reason": "settlement_not_found"}

    if settlement.get("status") == SettlementStatus.PAID and settlement.get("stripe_transfer_id"):
        return {
            "ok": True,
            "already_paid": True,
            "stripe_transfer_id": settlement["stripe_transfer_id"],
            "amount": settlement.get("net_payout"),
        }

    business = await db.businesses.find_one(
        {"id": settlement["business_id"]},
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "stripe_connect_account_id": 1,
            "stripe_connect_charges_enabled": 1,
            "stripe_connect_payouts_enabled": 1,
            "stripe_connect_details_submitted": 1,
            "payout_hold": 1,
        },
    )
    if not business:
        return {"ok": False, "reason": "business_not_found"}
    if business.get("payout_hold"):
        return {"ok": False, "reason": "payout_hold"}

    acct_id = business.get("stripe_connect_account_id")
    if not acct_id:
        return {"ok": False, "reason": "no_connect", "fallback": "manual_spei"}

    if not (
        business.get("stripe_connect_payouts_enabled")
        and business.get("stripe_connect_charges_enabled")
    ):
        return {"ok": False, "reason": "connect_not_ready", "fallback": "manual_spei"}

    amount_mxn = float(settlement.get("net_payout") or 0)
    if amount_mxn <= 0:
        return {"ok": False, "reason": "zero_amount"}

    amount_cents = int(round(amount_mxn * 100))
    idempotency_key = f"settlement-{settlement_id}"

    if dry_run:
        return {
            "ok": True,
            "dry_run": True,
            "would_transfer_cents": amount_cents,
            "destination": acct_id,
            "idempotency_key": idempotency_key,
        }

    try:
        transfer = stripe_lib.Transfer.create(
            amount=amount_cents,
            currency="mxn",
            destination=acct_id,
            transfer_group=f"settlement_{settlement_id}",
            description=f"Liquidacion Bookvia periodo {settlement.get('period_key','')}",
            metadata={
                "settlement_id": settlement_id,
                "business_id": business["id"],
                "period_key": settlement.get("period_key", ""),
                "booking_count": str(settlement.get("booking_count", 0)),
            },
            idempotency_key=idempotency_key,
        )
    except stripe_lib.error.StripeError as e:
        logger.error(f"Stripe Transfer failed for settlement {settlement_id}: {e}")
        await db.settlements.update_one(
            {"id": settlement_id},
            {"$set": {
                "status": SettlementStatus.FAILED,
                "last_error": str(e),
                "last_error_at": _now_iso(),
            }},
        )
        return {"ok": False, "reason": "stripe_error", "detail": str(e)}

    # Persist success and flip transactions to PAID_OUT
    await db.settlements.update_one(
        {"id": settlement_id},
        {"$set": {
            "status": SettlementStatus.PAID,
            "paid_via": "stripe_connect",
            "stripe_transfer_id": transfer.id,
            "stripe_destination_payment": getattr(transfer, "destination_payment", None),
            "paid_at": _now_iso(),
            "paid_by": actor_id or "system",
        }},
    )

    tx_ids = settlement.get("transaction_ids") or []
    if tx_ids:
        await db.transactions.update_many(
            {"id": {"$in": tx_ids}},
            {"$set": {
                "funds_state": "paid_out",
                "funds_state_updated_at": _now_iso(),
                "stripe_transfer_id": transfer.id,
            }},
        )

    logger.info(
        f"Stripe Transfer OK settlement={settlement_id} biz={business['id']} "
        f"amount=${amount_mxn:.2f} transfer={transfer.id}"
    )

    # Email negocio: "liquidamos $X via Stripe — llegará a tu CLABE en 1-2 días"
    try:
        biz_full = await db.businesses.find_one(
            {"id": business["id"]},
            {"_id": 0, "email": 1, "owner_user_id": 1, "name": 1},
        )
        owner_email = biz_full.get("email") if biz_full else None
        if not owner_email and biz_full and biz_full.get("owner_user_id"):
            owner = await db.users.find_one(
                {"id": biz_full["owner_user_id"]}, {"_id": 0, "email": 1}
            )
            owner_email = owner.get("email") if owner else None
        if owner_email:
            from services.email import send_settlement_notification
            await send_settlement_notification(
                business_email=owner_email,
                business_name=business.get("name", "Negocio"),
                amount_mxn=amount_mxn,
                period_key=settlement.get("period_key", ""),
                settlement_id=settlement_id,
                booking_count=settlement.get("booking_count", 0),
                transactions_count=len(settlement.get("transaction_ids") or []),
            )
    except Exception as email_err:
        # Email failures must NOT block the transfer success
        logger.warning(f"Settlement email failed for {settlement_id}: {email_err}")

    return {
        "ok": True,
        "settlement_id": settlement_id,
        "stripe_transfer_id": transfer.id,
        "amount": amount_mxn,
        "destination": acct_id,
    }


async def execute_stripe_transfers_batch(
    period_key: str,
    *,
    actor_id: Optional[str] = None,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """Process every PENDING settlement in a period and execute Transfers.

    Returns a per-settlement breakdown so the admin UI can show what
    succeeded, what failed, and what fell back to manual SPEI.
    """
    settlements = await db.settlements.find(
        {"period_key": period_key, "status": SettlementStatus.PENDING},
        {"_id": 0, "id": 1, "business_id": 1, "net_payout": 1},
    ).to_list(2000)

    results: List[Dict[str, Any]] = []
    counts = {"succeeded": 0, "failed": 0, "no_connect": 0, "skipped": 0}

    for s in settlements:
        res = await execute_stripe_transfers_for_settlement(
            s["id"], actor_id=actor_id, dry_run=dry_run
        )
        results.append({"settlement_id": s["id"], "business_id": s.get("business_id"), **res})
        if res.get("ok") and not res.get("already_paid"):
            counts["succeeded"] += 1
        elif res.get("already_paid"):
            counts["skipped"] += 1
        elif res.get("reason") in ("no_connect", "connect_not_ready"):
            counts["no_connect"] += 1
        else:
            counts["failed"] += 1

    return {
        "period_key": period_key,
        "total": len(settlements),
        "counts": counts,
        "results": results,
        "dry_run": dry_run,
    }
