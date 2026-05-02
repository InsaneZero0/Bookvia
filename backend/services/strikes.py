"""
Business strikes service - progressive penalty system for misbehavior.

Escalation rules (within a 30-day rolling window unless noted):
  Strike 1 with reason LATE_CANCELLATION/NO_SHOW_BUSINESS  -> MINOR     ($100 deduct)
  Strike 1 with reason REGULAR_CANCELLATION                -> WARNING   (no penalty)
  Strike 2                                                  -> MINOR     ($100 deduct)
  Strike 3                                                  -> SUSPENSION_7D
  Strike 4                                                  -> SUSPENSION_30D + admin review
  Strike 5 within 90 days                                  -> PERMANENT_BAN

Storage:
  business_strikes: each strike doc {id, business_id, reason, severity, financial_penalty,
                                     suspension_until, created_at, created_by, expires_at,
                                     metadata, audit_id}
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Literal

from core.database import db
from core.helpers import generate_id
from models.enums import (
    StrikeReason, StrikeSeverity, BusinessStatus,
    STRIKE_PENALTY_AMOUNT, STRIKE_WINDOW_30_DAYS, STRIKE_WINDOW_90_DAYS,
)

logger = logging.getLogger(__name__)

SEVERE_REASONS = {
    StrikeReason.LATE_CANCELLATION.value,
    StrikeReason.NO_SHOW_BUSINESS.value,
    StrikeReason.DISPUTE_LOST.value,
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _count_recent_strikes(business_id: str, days: int) -> int:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    return await db.business_strikes.count_documents({
        "business_id": business_id,
        "created_at": {"$gte": cutoff},
    })


def _determine_severity(total_30d: int, total_90d: int, reason: str) -> str:
    """
    Decide severity based on strike count + reason.
    `total_30d` and `total_90d` already INCLUDE the new strike being applied.
    """
    if total_90d >= 5:
        return StrikeSeverity.PERMANENT_BAN.value
    if total_30d >= 4:
        return StrikeSeverity.SUSPENSION_30D.value
    if total_30d >= 3:
        return StrikeSeverity.SUSPENSION_7D.value
    if total_30d >= 2:
        return StrikeSeverity.MINOR.value
    # First strike - severity depends on reason
    if reason in SEVERE_REASONS:
        return StrikeSeverity.MINOR.value
    return StrikeSeverity.WARNING.value


async def issue_strike(
    business_id: str,
    *,
    reason: str,
    description: Optional[str] = None,
    booking_id: Optional[str] = None,
    issued_by: str = "system",
    metadata: Optional[dict] = None,
) -> dict:
    """
    Apply a progressive strike to a business. Computes severity, records the strike,
    and applies side effects (suspension, financial penalty marker).
    
    Returns the created strike document.
    """
    # Validate
    if reason not in {r.value for r in StrikeReason}:
        raise ValueError(f"Invalid strike reason: {reason}")
    
    business = await db.businesses.find_one({"id": business_id}, {"_id": 0})
    if not business:
        raise ValueError(f"Business not found: {business_id}")
    
    # Count strikes BEFORE adding this one
    prior_30d = await _count_recent_strikes(business_id, STRIKE_WINDOW_30_DAYS)
    prior_90d = await _count_recent_strikes(business_id, STRIKE_WINDOW_90_DAYS)
    
    new_total_30d = prior_30d + 1
    new_total_90d = prior_90d + 1
    severity = _determine_severity(new_total_30d, new_total_90d, reason)
    
    # Compute side-effect timestamps
    now = datetime.now(timezone.utc)
    suspension_until = None
    financial_penalty = 0.0
    if severity == StrikeSeverity.MINOR.value:
        financial_penalty = STRIKE_PENALTY_AMOUNT
    elif severity == StrikeSeverity.SUSPENSION_7D.value:
        suspension_until = (now + timedelta(days=7)).isoformat()
    elif severity == StrikeSeverity.SUSPENSION_30D.value:
        suspension_until = (now + timedelta(days=30)).isoformat()
    elif severity == StrikeSeverity.PERMANENT_BAN.value:
        suspension_until = "permanent"
    
    # Create strike document
    strike = {
        "id": generate_id(),
        "business_id": business_id,
        "reason": reason,
        "severity": severity,
        "description": description,
        "booking_id": booking_id,
        "issued_by": issued_by,
        "financial_penalty_mxn": financial_penalty,
        "penalty_settled": False,  # True once deducted from a payout
        "suspension_until": suspension_until,
        "created_at": _now_iso(),
        # Strike rolls off automatically: 90 days after creation it no longer counts
        "expires_at": (now + timedelta(days=STRIKE_WINDOW_90_DAYS)).isoformat(),
        "metadata": metadata or {},
        "strike_number_30d": new_total_30d,
    }
    await db.business_strikes.insert_one(dict(strike))
    
    # Apply side effects to business document
    update_fields = {
        "strike_count_30d": new_total_30d,
        "strike_count_90d": new_total_90d,
        "last_strike_at": strike["created_at"],
        "last_strike_severity": severity,
    }
    
    if suspension_until:
        update_fields["suspended_until"] = suspension_until
        update_fields["suspended_reason"] = f"Strike: {reason}"
        if severity == StrikeSeverity.PERMANENT_BAN.value:
            update_fields["status"] = BusinessStatus.REJECTED  # blocks login + visibility
            update_fields["banned"] = True
    
    if financial_penalty > 0:
        # Track total pending penalty so it can be deducted at next settlement
        update_fields = {**update_fields}
        await db.businesses.update_one(
            {"id": business_id},
            {
                "$set": update_fields,
                "$inc": {"pending_strike_penalty_mxn": financial_penalty},
            }
        )
    else:
        await db.businesses.update_one({"id": business_id}, {"$set": update_fields})
    
    logger.info(
        f"[Strike] biz={business_id} reason={reason} severity={severity} "
        f"30d_count={new_total_30d} 90d_count={new_total_90d} penalty=${financial_penalty} "
        f"suspended_until={suspension_until}"
    )
    return strike


async def list_business_strikes(business_id: str, limit: int = 50) -> list:
    """List strike history for a business, newest first."""
    return await db.business_strikes.find(
        {"business_id": business_id}, {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)


async def get_active_suspension(business_id: str) -> Optional[dict]:
    """Return active suspension info if business is currently suspended/banned, else None."""
    business = await db.businesses.find_one(
        {"id": business_id},
        {"_id": 0, "suspended_until": 1, "suspended_reason": 1, "banned": 1, "status": 1}
    )
    if not business:
        return None
    
    if business.get("banned"):
        return {"active": True, "permanent": True, "reason": business.get("suspended_reason")}
    
    suspended_until = business.get("suspended_until")
    if not suspended_until or suspended_until == "permanent":
        if suspended_until == "permanent":
            return {"active": True, "permanent": True, "reason": business.get("suspended_reason")}
        return None
    
    try:
        end = datetime.fromisoformat(suspended_until.replace("Z", "+00:00"))
        if end > datetime.now(timezone.utc):
            return {
                "active": True,
                "permanent": False,
                "until": suspended_until,
                "reason": business.get("suspended_reason"),
            }
    except Exception:
        pass
    return None


async def lift_expired_suspensions() -> int:
    """Cron task: clear suspended_until on businesses whose suspension period elapsed."""
    now_iso = _now_iso()
    candidates = await db.businesses.find(
        {
            "suspended_until": {"$ne": None, "$lt": now_iso},
            "banned": {"$ne": True},
        },
        {"_id": 0, "id": 1, "suspended_until": 1}
    ).to_list(500)
    
    cleared = 0
    for biz in candidates:
        # Skip "permanent" suspensions (string)
        if biz.get("suspended_until") == "permanent":
            continue
        await db.businesses.update_one(
            {"id": biz["id"]},
            {"$set": {"suspended_until": None, "suspended_reason": None}}
        )
        cleared += 1
    
    if cleared > 0:
        logger.info(f"Lifted {cleared} expired suspensions")
    return cleared


async def admin_clear_strike(strike_id: str, admin_email: str, reason: str = "") -> dict:
    """Admin override: cancel/clear a strike. Adjusts business counters and may lift suspension."""
    strike = await db.business_strikes.find_one({"id": strike_id}, {"_id": 0})
    if not strike:
        raise ValueError(f"Strike not found: {strike_id}")
    if strike.get("cleared"):
        return strike
    
    now = _now_iso()
    await db.business_strikes.update_one(
        {"id": strike_id},
        {"$set": {
            "cleared": True,
            "cleared_at": now,
            "cleared_by": admin_email,
            "cleared_reason": reason or "Admin override",
        }}
    )
    
    # Recompute counters and lift suspension if this was the active one
    biz_id = strike["business_id"]
    cutoff_30d = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    cutoff_90d = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    new_30d = await db.business_strikes.count_documents(
        {"business_id": biz_id, "created_at": {"$gte": cutoff_30d}, "cleared": {"$ne": True}}
    )
    new_90d = await db.business_strikes.count_documents(
        {"business_id": biz_id, "created_at": {"$gte": cutoff_90d}, "cleared": {"$ne": True}}
    )
    
    update_fields = {
        "strike_count_30d": new_30d,
        "strike_count_90d": new_90d,
    }
    
    # If MINOR strike with pending penalty, decrement
    if (
        strike.get("severity") == StrikeSeverity.MINOR.value
        and not strike.get("penalty_settled")
        and strike.get("financial_penalty_mxn", 0) > 0
    ):
        await db.businesses.update_one(
            {"id": biz_id},
            {"$set": update_fields, "$inc": {"pending_strike_penalty_mxn": -strike["financial_penalty_mxn"]}}
        )
    else:
        await db.businesses.update_one({"id": biz_id}, {"$set": update_fields})
    
    # If this was the cause of an active suspension, lift it
    biz = await db.businesses.find_one({"id": biz_id}, {"_id": 0})
    if biz and biz.get("suspended_until") == strike.get("suspension_until") and not biz.get("banned"):
        await db.businesses.update_one(
            {"id": biz_id},
            {"$set": {"suspended_until": None, "suspended_reason": None}}
        )
    
    logger.info(f"[Strike] cleared by {admin_email}: strike={strike_id} biz={biz_id}")
    return await db.business_strikes.find_one({"id": strike_id}, {"_id": 0})


# --------------------- TRUST SCORE ---------------------
def compute_trust_score(business: dict) -> dict:
    """
    Compose a 0-100 trust score from:
      - rating (avg user rating)               weight 50%
      - completion_rate (completed / booked)   weight 30%
      - strike-free factor                     weight 20%
    Also returns a friendly label and key supporting metrics.
    """
    rating = float(business.get("rating") or 0)
    review_count = int(business.get("review_count") or 0)
    completed = int(business.get("completed_appointments") or 0)
    cancelled_by_biz = int(business.get("business_cancellation_count") or 0)
    strikes_30d = int(business.get("strike_count_30d") or 0)
    
    total_bookings = completed + cancelled_by_biz
    completion_rate = (completed / total_bookings) if total_bookings > 0 else 1.0
    
    # Score components (each 0..1)
    rating_score = (rating / 5.0) if rating > 0 else 0.85  # No rating yet -> assume neutral 0.85
    completion_score = max(0.0, completion_rate)
    strike_factor = max(0.0, 1.0 - (strikes_30d * 0.2))  # Each strike removes 20%
    
    # Confidence-adjusted: low review_count/completed dilutes
    confidence = min(1.0, (review_count + completed) / 10.0) if (review_count + completed) > 0 else 0.0
    
    # Weighted blend (0..1)
    raw = (rating_score * 0.5) + (completion_score * 0.3) + (strike_factor * 0.2)
    
    # Apply confidence: new businesses get a softer score (don't punish lack of data)
    score = (raw * confidence) + (0.85 * (1 - confidence))
    score_pct = round(score * 100, 1)
    
    if score_pct >= 90:
        label = "excellent"
    elif score_pct >= 75:
        label = "good"
    elif score_pct >= 60:
        label = "fair"
    else:
        label = "poor"
    
    return {
        "score": score_pct,
        "label": label,
        "rating": round(rating, 2),
        "review_count": review_count,
        "completion_rate_pct": round(completion_rate * 100, 1),
        "strikes_30d": strikes_30d,
        "completed_appointments": completed,
        "is_provisional": confidence < 0.5,  # Less than ~5 events
    }
