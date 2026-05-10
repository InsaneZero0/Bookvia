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

router = APIRouter(prefix="/categories", tags=["Categories"])

@router.get("", response_model=List[CategoryResponse])
async def get_categories(
    city: Optional[str] = None,
    country_code: Optional[str] = None,
    include_subcategories: bool = False,
    parent_id: Optional[str] = None,
):
    """List categories. By default returns only parent categories (level 1).
    Use `?include_subcategories=true` to get all, or `?parent_id=<id>` to
    fetch the children of a single parent."""
    if parent_id:
        query = {"parent_id": parent_id}
    elif include_subcategories:
        query = {}
    else:
        query = {"parent_id": None}
    categories = await db.categories.find(query, {"_id": 0}).to_list(500)

    # Build business filter - optionally scoped to city+country
    biz_filter = {**VISIBLE_BUSINESS_FILTER}
    if city:
        biz_filter["city"] = city
    if country_code:
        biz_filter["country_code"] = country_code.upper()

    # Add business count for each category. For parents, count all businesses
    # whose category_id == parent_id (since businesses are stored at parent level).
    for cat in categories:
        count = await db.businesses.count_documents({"category_id": cat["id"], **biz_filter})
        cat["business_count"] = count

    # If filtering by city, only return categories that actually have businesses
    if city:
        categories = [c for c in categories if c["business_count"] > 0]

    return [CategoryResponse(**c) for c in categories]


@router.get("/{slug_or_id}/subcategories", response_model=List[CategoryResponse])
async def get_subcategories(slug_or_id: str):
    """Return subcategories for a parent category (looked up by slug or id)."""
    parent = await db.categories.find_one(
        {"$or": [{"slug": slug_or_id}, {"id": slug_or_id}], "parent_id": None},
        {"_id": 0, "id": 1}
    )
    if not parent:
        raise HTTPException(status_code=404, detail="Parent category not found")
    subs = await db.categories.find({"parent_id": parent["id"]}, {"_id": 0}).to_list(200)
    for s in subs:
        s["business_count"] = 0
    return [CategoryResponse(**s) for s in subs]



@router.get("/{slug}", response_model=CategoryResponse)
async def get_category_by_slug(slug: str):
    category = await db.categories.find_one({"slug": slug}, {"_id": 0})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    count = await db.businesses.count_documents({"category_id": category["id"], **VISIBLE_BUSINESS_FILTER})
    category["business_count"] = count
    
    return CategoryResponse(**category)



@router.post("/", response_model=CategoryResponse)
async def create_category(category: CategoryCreate, token_data: TokenData = Depends(require_admin)):
    category_doc = {
        "id": generate_id(),
        **category.model_dump()
    }
    await db.categories.insert_one(category_doc)
    return CategoryResponse(**category_doc)



