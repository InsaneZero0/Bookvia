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

router = APIRouter(prefix="/users", tags=["Users"])

@router.put("/me", response_model=UserResponse)
async def update_user_profile(update: UserUpdate, token_data: TokenData = Depends(require_auth)):
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    await db.users.update_one({"id": token_data.user_id}, {"$set": update_data})
    user = await db.users.find_one({"id": token_data.user_id}, {"_id": 0, "password_hash": 0})
    return UserResponse(**user)



@router.post("/favorites/{business_id}")
async def add_favorite(business_id: str, token_data: TokenData = Depends(require_auth)):
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    await db.users.update_one(
        {"id": token_data.user_id},
        {"$addToSet": {"favorites": business_id}}
    )
    return {"message": "Added to favorites"}



@router.delete("/favorites/{business_id}")
async def remove_favorite(business_id: str, token_data: TokenData = Depends(require_auth)):
    await db.users.update_one(
        {"id": token_data.user_id},
        {"$pull": {"favorites": business_id}}
    )
    return {"message": "Removed from favorites"}



@router.get("/favorites", response_model=List[BusinessResponse])
async def get_favorites(token_data: TokenData = Depends(require_auth)):
    user = await db.users.find_one({"id": token_data.user_id})
    if not user or not user.get("favorites"):
        return []
    
    businesses = await db.businesses.find(
        {"id": {"$in": user["favorites"]}, **VISIBLE_BUSINESS_FILTER},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    
    # Add category names
    for b in businesses:
        if b.get("category_id"):
            cat = await db.categories.find_one({"id": b["category_id"]})
            if cat:
                b["category_name"] = cat.get("name_es", "")
    
    # Compute is_open_now and next_available_text
    biz_ids = [b["id"] for b in businesses]
    if biz_ids:
        all_workers = await db.workers.find(
            {"business_id": {"$in": biz_ids}, "active": True},
            {"_id": 0, "business_id": 1, "schedule": 1}
        ).to_list(500)
        biz_workers_map = {}
        for w in all_workers:
            biz_workers_map.setdefault(w["business_id"], []).append(w)
        day_names_es = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"]
        try:
            now_fav = datetime.now(pytz.timezone("America/Mexico_City"))
        except Exception:
            now_fav = datetime.now(timezone.utc)
        cwd = now_fav.weekday()
        ctm = now_fav.strftime("%H:%M")
        for b in businesses:
            wl = biz_workers_map.get(b["id"], [])
            if not wl:
                continue
            # is_open_now
            is_open = False
            for wk in wl:
                ds = wk.get("schedule", {}).get(str(cwd), {})
                if ds.get("is_available") and ds.get("blocks"):
                    for blk in ds["blocks"]:
                        if blk["start_time"] <= ctm < blk["end_time"]:
                            is_open = True
                            break
                if is_open:
                    break
            b["is_open_now"] = is_open
            # next_available_text
            found = False
            for doff in range(7):
                cd = (cwd + doff) % 7
                for wk in wl:
                    ds = wk.get("schedule", {}).get(str(cd), {})
                    if ds.get("is_available") and ds.get("blocks"):
                        for blk in ds["blocks"]:
                            if doff == 0 and blk["end_time"] > ctm:
                                b["next_available_text"] = "Hoy disponible"
                                found = True
                                break
                            elif doff > 0:
                                b["next_available_text"] = f"{'Manana' if doff == 1 else day_names_es[(cwd + doff) % 7]} {blk['start_time']}"
                                found = True
                                break
                        if found:
                            break
                    if found:
                        break
                if found:
                    break
    
    return [BusinessResponse(**b) for b in businesses]





@router.get("/my-stats")
async def get_user_stats(token_data: TokenData = Depends(require_auth)):
    """Get user statistics for dashboard."""
    user_id = token_data.user_id
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "created_at": 1})

    total_bookings = await db.bookings.count_documents({"user_id": user_id})
    completed = await db.bookings.count_documents({"user_id": user_id, "status": "completed"})
    upcoming = await db.bookings.count_documents({"user_id": user_id, "status": {"$in": ["confirmed", "hold"]}})

    # Total spent
    pipeline = [
        {"$match": {"user_id": user_id, "deposit_paid": True}},
        {"$group": {"_id": None, "total": {"$sum": "$deposit_amount"}}}
    ]
    spent_res = await db.bookings.aggregate(pipeline).to_list(1)
    total_spent = spent_res[0]["total"] if spent_res else 0

    # Reviews given
    reviews_given = await db.reviews.count_documents({"user_id": user_id})

    # Avg rating given
    avg_pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": None, "avg": {"$avg": "$rating"}}}
    ]
    avg_res = await db.reviews.aggregate(avg_pipeline).to_list(1)
    avg_rating = round(avg_res[0]["avg"], 1) if avg_res else 0

    # Favorite category
    cat_pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": "$service_name", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 1}
    ]
    cat_res = await db.bookings.aggregate(cat_pipeline).to_list(1)
    fav_service = cat_res[0]["_id"] if cat_res else None

    # Last 3 completed bookings (for rebook)
    recent = await db.bookings.find(
        {"user_id": user_id, "status": "completed"},
        {"_id": 0, "id": 1, "business_id": 1, "business_name": 1, "service_id": 1, "service_name": 1, "worker_id": 1, "worker_name": 1}
    ).sort("date", -1).limit(3).to_list(3)

    return {
        "total_bookings": total_bookings,
        "completed": completed,
        "upcoming": upcoming,
        "total_spent": round(total_spent, 2),
        "reviews_given": reviews_given,
        "avg_rating_given": avg_rating,
        "favorite_service": fav_service,
        "member_since": user.get("created_at") if user else None,
        "recent_completed": recent,
    }
