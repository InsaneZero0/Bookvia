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
        {"business_id": business_id},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return [ReviewResponse(**r) for r in reviews]



