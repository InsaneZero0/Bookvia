"""
Funds State Machine for Bookvia transactions.

Tracks the lifecycle of money owed to a business per booking:

  PENDING_HOLD -> AVAILABLE (appointment completed, grace window starts)
              \-> REFUNDED  (cancellation refund)

  AVAILABLE   -> CLEARED   (grace passed, no disputes)
              \-> DISPUTED (client filed complaint)
              \-> REFUNDED (admin/business resolved against business)

  DISPUTED    -> CLEARED   (admin rules in business's favor)
              \-> REFUNDED (admin rules against business)

  CLEARED     -> PAID_OUT  (included in a monthly settlement)

Only CLEARED transactions can enter a payout/settlement.

Storage:
  We store the current state on each transaction document under `funds_state`,
  along with `funds_state_history` (append-only trail).
  We DO NOT create new ledger collections; ledger_entries already exist for
  accounting and we leave them untouched.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from core.database import db
from core.helpers import generate_id
from models.enums import (
    FundsState,
    GRACE_PERIOD_HOURS,
    AUTO_COMPLETE_HOURS,
    AppointmentStatus,
    TransactionStatus,
)

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


# Allowed state transitions
_ALLOWED_TRANSITIONS = {
    None: {FundsState.PENDING_HOLD},  # Initial state
    FundsState.PENDING_HOLD: {FundsState.AVAILABLE, FundsState.REFUNDED, FundsState.DISPUTED},
    FundsState.AVAILABLE: {FundsState.CLEARED, FundsState.DISPUTED, FundsState.REFUNDED},
    FundsState.CLEARED: {FundsState.PAID_OUT, FundsState.DISPUTED, FundsState.REFUNDED},
    FundsState.DISPUTED: {FundsState.CLEARED, FundsState.REFUNDED, FundsState.AVAILABLE},
    FundsState.REFUNDED: set(),  # Terminal
    FundsState.PAID_OUT: set(),  # Terminal
}


async def transition(
    transaction_id: str,
    new_state: str,
    *,
    actor: str = "system",
    reason: Optional[str] = None,
) -> dict:
    """
    Change a transaction's funds_state. Validates allowed transitions and
    appends to history. Returns the updated transaction doc.
    """
    tx = await db.transactions.find_one({"id": transaction_id}, {"_id": 0})
    if not tx:
        raise ValueError(f"Transaction not found: {transaction_id}")
    
    current = tx.get("funds_state")
    current_enum = FundsState(current) if current in {s.value for s in FundsState} else None
    new_enum = FundsState(new_state)
    
    allowed = _ALLOWED_TRANSITIONS.get(current_enum, set())
    if new_enum not in allowed:
        raise ValueError(
            f"Invalid funds_state transition: {current} -> {new_enum.value} "
            f"for transaction {transaction_id}"
        )
    
    now = _now_iso()
    history_entry = {
        "id": generate_id(),
        "from": current,
        "to": new_enum.value,
        "actor": actor,
        "reason": reason,
        "at": now,
    }
    
    # Compute side-effect timestamps based on target state
    set_doc = {
        "funds_state": new_enum.value,
        "funds_state_updated_at": now,
        "updated_at": now,
    }
    if new_enum == FundsState.AVAILABLE and not tx.get("funds_available_at"):
        set_doc["funds_available_at"] = now
        # When we enter AVAILABLE, the cleared_at is grace hours later.
        cleared_at = (datetime.now(timezone.utc) + timedelta(hours=GRACE_PERIOD_HOURS)).isoformat()
        set_doc["funds_clears_at"] = cleared_at
    elif new_enum == FundsState.CLEARED and not tx.get("funds_cleared_at"):
        set_doc["funds_cleared_at"] = now
    elif new_enum == FundsState.PAID_OUT and not tx.get("funds_paid_out_at"):
        set_doc["funds_paid_out_at"] = now
    elif new_enum == FundsState.REFUNDED and not tx.get("funds_refunded_at"):
        set_doc["funds_refunded_at"] = now
    elif new_enum == FundsState.DISPUTED and not tx.get("funds_disputed_at"):
        set_doc["funds_disputed_at"] = now
    
    res = await db.transactions.find_one_and_update(
        {"id": transaction_id, "funds_state": current},  # Optimistic lock
        {
            "$set": set_doc,
            "$push": {"funds_state_history": history_entry},
        },
        return_document=True,
        projection={"_id": 0},
    )
    if not res:
        raise ValueError(f"Concurrent state change detected for {transaction_id}")
    
    logger.info(
        f"[FundsState] tx={transaction_id} {current} -> {new_enum.value} "
        f"by {actor} reason={reason or 'n/a'}"
    )
    return res


async def initialize(transaction_id: str, actor: str = "system") -> dict:
    """Set initial funds_state to PENDING_HOLD if not already set."""
    return await transition(transaction_id, FundsState.PENDING_HOLD.value, actor=actor, reason="Payment received")


async def mark_appointment_completed(transaction_id: str, actor: str = "business", reason: Optional[str] = None) -> dict:
    """Move PENDING_HOLD -> AVAILABLE (start of 24h grace window)."""
    return await transition(transaction_id, FundsState.AVAILABLE.value, actor=actor, reason=reason or "Appointment completed")


async def mark_disputed(transaction_id: str, actor: str = "client", reason: Optional[str] = None) -> dict:
    """Mark a transaction as disputed (admin must resolve)."""
    return await transition(transaction_id, FundsState.DISPUTED.value, actor=actor, reason=reason or "Client raised dispute")


async def mark_refunded(transaction_id: str, actor: str = "system", reason: Optional[str] = None) -> dict:
    """Mark a transaction as refunded (terminal state)."""
    return await transition(transaction_id, FundsState.REFUNDED.value, actor=actor, reason=reason or "Refund issued")


async def clear_now(transaction_id: str, actor: str = "system", reason: Optional[str] = None) -> dict:
    """Force immediate clearing of an AVAILABLE transaction (used by admin or auto-cleared cron)."""
    return await transition(transaction_id, FundsState.CLEARED.value, actor=actor, reason=reason or "Grace period passed")


async def auto_clear_after_grace() -> int:
    """
    Cron task: any transaction in AVAILABLE state where funds_clears_at <= now
    should be moved to CLEARED. Returns count of transactions cleared.
    """
    now_iso = _now_iso()
    candidates = await db.transactions.find(
        {
            "funds_state": FundsState.AVAILABLE.value,
            "funds_clears_at": {"$ne": None, "$lte": now_iso},
            "status": TransactionStatus.PAID,
        },
        {"_id": 0, "id": 1}
    ).to_list(2000)
    
    cleared = 0
    for tx in candidates:
        try:
            await clear_now(tx["id"], actor="system_cron", reason="Grace period of 24h elapsed")
            cleared += 1
        except Exception as e:
            logger.error(f"Auto-clear failed for tx {tx['id']}: {e}")
    
    if cleared > 0:
        logger.info(f"Auto-clear: {cleared} transactions moved AVAILABLE -> CLEARED")
    return cleared


async def auto_complete_appointments() -> int:
    """
    Cron task: any booking past its scheduled end time by AUTO_COMPLETE_HOURS that
    has NOT been marked completed/cancelled gets auto-completed AND its transaction
    moves PENDING_HOLD -> AVAILABLE.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=AUTO_COMPLETE_HOURS)).isoformat()
    
    # Find confirmed bookings whose appointment_date is older than AUTO_COMPLETE_HOURS
    candidates = await db.bookings.find(
        {
            "status": AppointmentStatus.CONFIRMED,
            "appointment_date": {"$lt": cutoff},
            "deposit_paid": True,
        },
        {"_id": 0}
    ).to_list(1000)
    
    completed_count = 0
    for booking in candidates:
        try:
            now = _now_iso()
            await db.bookings.update_one(
                {"id": booking["id"]},
                {
                    "$set": {
                        "status": AppointmentStatus.COMPLETED,
                        "completed_at": now,
                        "completed_by": "system_auto",
                        "updated_at": now,
                    }
                },
            )
            
            # Move associated transaction to AVAILABLE
            tx = await db.transactions.find_one({"booking_id": booking["id"], "status": TransactionStatus.PAID}, {"_id": 0})
            if tx and tx.get("funds_state") == FundsState.PENDING_HOLD.value:
                await mark_appointment_completed(
                    tx["id"], actor="system_auto",
                    reason=f"Auto-completed after {AUTO_COMPLETE_HOURS}h without business action"
                )
            completed_count += 1
        except Exception as e:
            logger.error(f"Auto-complete failed for booking {booking['id']}: {e}")
    
    if completed_count > 0:
        logger.info(f"Auto-complete: {completed_count} bookings auto-completed")
    return completed_count


async def get_state_summary(business_id: str) -> dict:
    """Summary of funds owed to a business broken down by state."""
    pipeline = [
        {"$match": {"business_id": business_id, "status": TransactionStatus.PAID}},
        {"$group": {
            "_id": "$funds_state",
            "count": {"$sum": 1},
            "total": {"$sum": "$business_amount"},
        }},
    ]
    rows = await db.transactions.aggregate(pipeline).to_list(20)
    
    summary = {state.value: {"count": 0, "total": 0.0} for state in FundsState}
    for row in rows:
        key = row.get("_id") or "unknown"
        summary.setdefault(key, {"count": 0, "total": 0.0})
        summary[key]["count"] = int(row.get("count") or 0)
        summary[key]["total"] = round(float(row.get("total") or 0), 2)
    
    return {
        "business_id": business_id,
        "by_state": summary,
        "pending_payout": summary.get(FundsState.CLEARED.value, {}).get("total", 0),
        "in_grace": summary.get(FundsState.AVAILABLE.value, {}).get("total", 0),
        "in_hold": summary.get(FundsState.PENDING_HOLD.value, {}).get("total", 0),
        "disputed": summary.get(FundsState.DISPUTED.value, {}).get("total", 0),
    }
