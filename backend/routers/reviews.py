"""
Auto-extracted router from server.py refactoring.
"""
from fastapi import APIRouter, HTTPException, Depends, Request, BackgroundTasks, status, File, UploadFile
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.responses import Response
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, ConfigDict, EmailStr
import logging
import os
import re
import random
import uuid
import json
import math
import pytz
from bson import ObjectId

from core.database import db
from core.security import (
    TokenData, create_token, decode_token,
    hash_password, verify_password,
    generate_totp_secret, verify_totp, generate_totp_qr
)
from core.dependencies import (
    security, get_current_user, require_auth, require_business, require_admin
)
from core.helpers import (
    generate_id, generate_slug, calculate_bayesian_rating,
    is_user_blacklisted, send_sms, create_notification,
    create_audit_log, create_business_activity,
    amount_to_cents, cents_to_amount,
    create_ledger_entry, create_transaction_ledger_entries,
    calculate_business_ledger_summary
)
from models.enums import (
    UserRole, AppointmentStatus, BusinessStatus, PaymentStatus,
    TransactionStatus, LedgerDirection, LedgerAccount, LedgerEntryStatus,
    SettlementStatus, AuditAction,
    PLATFORM_FEE_PERCENT, HOLD_EXPIRATION_MINUTES, MIN_DEPOSIT_AMOUNT,
    SUBSCRIPTION_PRICE_MXN, SUBSCRIPTION_TRIAL_DAYS,
    VISIBLE_BUSINESS_FILTER, DEFAULT_MANAGER_PERMISSIONS
)
from models.schemas import *

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reviews", tags=["Reviews"])

@router.post("/", response_model=ReviewResponse)
async def create_review(review: ReviewCreate, token_data: TokenData = Depends(require_auth)):
    # Verify booking was completed (or confirmed with past date)
    booking = await db.bookings.find_one({
        "id": review.booking_id,
        "user_id": token_data.user_id,
    })
    
    if not booking:
        raise HTTPException(status_code=400, detail="Booking not found")
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    is_past = booking.get("date", "") <= today
    allowed_statuses = [AppointmentStatus.COMPLETED]
    if is_past:
        allowed_statuses.append(AppointmentStatus.CONFIRMED)
    
    if booking["status"] not in allowed_statuses:
        raise HTTPException(status_code=400, detail="Solo puedes calificar citas completadas o pasadas")
    
    # Check if already reviewed
    existing = await db.reviews.find_one({"booking_id": review.booking_id})
    if existing:
        raise HTTPException(status_code=400, detail="Already reviewed this booking")
    
    user = await db.users.find_one({"id": token_data.user_id})
    
    review_doc = {
        "id": generate_id(),
        "user_id": token_data.user_id,
        "business_id": review.business_id,
        "booking_id": review.booking_id,
        "rating": min(max(review.rating, 1), 5),
        "comment": review.comment,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_name": user["full_name"],
        "user_photo": user.get("photo_url")
    }
    
    await db.reviews.insert_one(review_doc)
    
    # Update business rating (Bayesian)
    business = await db.businesses.find_one({"id": review.business_id})
    new_rating_sum = business.get("rating_sum", 0) + review.rating
    new_review_count = business.get("review_count", 0) + 1
    new_rating = calculate_bayesian_rating(new_rating_sum, new_review_count)
    
    await db.businesses.update_one(
        {"id": review.business_id},
        {"$set": {"rating": round(new_rating, 2), "rating_sum": new_rating_sum, "review_count": new_review_count}}
    )
    
    return ReviewResponse(**review_doc)



@router.get("/business/{business_id}", response_model=List[ReviewResponse])
async def get_business_reviews(business_id: str, page: int = 1, limit: int = 20):
    skip = (page - 1) * limit
    reviews = await db.reviews.find(
        {"business_id": business_id, "hidden": {"$ne": True}},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return [ReviewResponse(**r) for r in reviews]


# ========================== PHASE 17: REVIEW REPORTING ==========================


class ReportReviewRequest(BaseModel):
    reason: str  # "fake" | "offensive" | "off_topic" | "spam" | "other"
    detail: Optional[str] = None


@router.post("/{review_id}/report")
async def report_review(
    review_id: str,
    payload: ReportReviewRequest,
    request: Request,
    token_data: TokenData = Depends(require_auth),
):
    """Flag a review for admin moderation. Anyone authenticated can
    report; each reviewer can only report a review once (no-op on retry).
    The review itself is NOT hidden automatically — moderation is manual.
    """
    review = await db.reviews.find_one({"id": review_id}, {"_id": 0, "id": 1})
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    valid_reasons = {"fake", "offensive", "off_topic", "spam", "other"}
    reason = payload.reason.strip().lower()
    if reason not in valid_reasons:
        raise HTTPException(status_code=400, detail="Invalid reason")

    now_iso = datetime.now(timezone.utc).isoformat()
    res = await db.review_reports.update_one(
        {"review_id": review_id, "reporter_id": token_data.user_id},
        {"$setOnInsert": {
            "id": generate_id(),
            "review_id": review_id,
            "reporter_id": token_data.user_id,
            "reporter_role": getattr(token_data, "role", "user"),
            "reason": reason,
            "detail": (payload.detail or "")[:500],
            "status": "pending",  # pending | dismissed | removed
            "created_at": now_iso,
        }},
        upsert=True,
    )
    created = bool(res.upserted_id)

    # Bump counters on the review itself so public queries can show them
    if created:
        await db.reviews.update_one(
            {"id": review_id},
            {"$inc": {"report_count": 1}, "$set": {"last_reported_at": now_iso}},
        )
    return {"ok": True, "already_reported": not created}


# ========================== ADMIN: MODERATION QUEUE ==========================


@router.get("/admin/reported")
async def admin_list_reported_reviews(
    status_filter: str = "pending",  # pending | all | dismissed | removed
    limit: int = 50,
    token_data: TokenData = Depends(require_admin),
):
    """List reviews that have at least one unresolved report, newest
    report first. Each item embeds the full review text, business name,
    author name and the list of individual reports for context."""
    match = {}
    if status_filter == "pending":
        match["status"] = "pending"
    elif status_filter in ("dismissed", "removed"):
        match["status"] = status_filter

    # Group reports by review_id to collapse duplicates
    pipeline = [
        {"$match": match} if match else {"$match": {}},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$review_id",
            "report_count": {"$sum": 1},
            "reports": {"$push": {
                "id": "$id", "reason": "$reason", "detail": "$detail",
                "reporter_id": "$reporter_id", "reporter_role": "$reporter_role",
                "status": "$status", "created_at": "$created_at",
            }},
            "last_reported_at": {"$max": "$created_at"},
            "has_pending": {"$max": {"$cond": [{"$eq": ["$status", "pending"]}, 1, 0]}},
        }},
        {"$sort": {"last_reported_at": -1}},
        {"$limit": max(1, min(limit, 200))},
    ]
    if status_filter == "pending":
        # Keep only rows where at least one report is still pending
        pipeline.append({"$match": {"has_pending": 1}})

    groups = await db.review_reports.aggregate(pipeline).to_list(limit)

    out = []
    for g in groups:
        review = await db.reviews.find_one({"id": g["_id"]}, {"_id": 0})
        if not review:
            continue
        business = await db.businesses.find_one(
            {"id": review.get("business_id")}, {"_id": 0, "name": 1, "slug": 1, "id": 1}
        ) or {}
        user = await db.users.find_one(
            {"id": review.get("user_id")}, {"_id": 0, "full_name": 1, "email": 1}
        ) or {}
        out.append({
            "review": {
                **review,
                "business_name": business.get("name"),
                "business_slug": business.get("slug"),
                "business_id": review.get("business_id"),
                "author_name": user.get("full_name"),
                "author_email": user.get("email"),
            },
            "report_count": g["report_count"],
            "last_reported_at": g["last_reported_at"],
            "reports": g["reports"],
        })
    return {"count": len(out), "items": out}


class ResolveReportRequest(BaseModel):
    action: str  # "dismiss" | "remove"
    note: Optional[str] = None


@router.post("/admin/{review_id}/resolve")
async def admin_resolve_review(
    review_id: str,
    payload: ResolveReportRequest,
    request: Request,
    token_data: TokenData = Depends(require_admin),
):
    """Resolve all pending reports on a review.

      * `dismiss` → reports closed as unfounded; review stays public
      * `remove`  → review is hidden from public queries; reports marked removed
    """
    if payload.action not in ("dismiss", "remove"):
        raise HTTPException(status_code=400, detail="Invalid action")

    review = await db.reviews.find_one({"id": review_id}, {"_id": 0})
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    new_status = "dismissed" if payload.action == "dismiss" else "removed"
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.review_reports.update_many(
        {"review_id": review_id, "status": "pending"},
        {"$set": {
            "status": new_status, "resolved_at": now_iso,
            "resolved_by": token_data.user_id,
            "resolution_note": (payload.note or "")[:500],
        }},
    )

    # Hide or re-expose the review itself
    if payload.action == "remove":
        await db.reviews.update_one(
            {"id": review_id},
            {"$set": {"hidden": True, "hidden_at": now_iso,
                      "hidden_by_admin_id": token_data.user_id,
                      "hidden_reason": (payload.note or "")[:200]}},
        )
        # Recompute business rating (excluding hidden reviews)
        await _recompute_business_rating(review["business_id"])
    else:
        # Dismiss: ensure review is visible (in case it was hidden by a prior action)
        await db.reviews.update_one(
            {"id": review_id},
            {"$set": {"hidden": False, "dismissed_at": now_iso}},
        )
        await _recompute_business_rating(review["business_id"])

    await create_audit_log(
        admin_id=token_data.user_id, admin_email=token_data.email,
        action="review_moderation", target_type="review", target_id=review_id,
        details={"action": payload.action, "business_id": review.get("business_id"),
                 "note": payload.note or ""},
        request=request,
    )

    return {"ok": True, "action": payload.action, "new_status": new_status}


async def _recompute_business_rating(business_id: str) -> None:
    """Refresh `rating` and `review_count` on a business after a
    moderation change so public search / profile pages stay accurate."""
    pipe = [
        {"$match": {"business_id": business_id, "hidden": {"$ne": True}}},
        {"$group": {"_id": None, "avg": {"$avg": "$rating"}, "n": {"$sum": 1}}},
    ]
    res = await db.reviews.aggregate(pipe).to_list(1)
    if res:
        avg = round(float(res[0].get("avg") or 0), 2)
        n = int(res[0].get("n") or 0)
    else:
        avg, n = 0.0, 0
    await db.businesses.update_one(
        {"id": business_id},
        {"$set": {"rating": avg, "review_count": n}},
    )



