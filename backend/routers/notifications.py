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

router = APIRouter(prefix="/notifications", tags=["Notifications"])

@router.get("", response_model=List[NotificationResponse])
async def get_notifications(
    unread_only: bool = False,
    token_data: TokenData = Depends(require_auth)
):
    filters = {"user_id": token_data.user_id}
    if unread_only:
        filters["read"] = False
    
    notifications = await db.notifications.find(filters, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    return [NotificationResponse(**n) for n in notifications]



@router.put("/{notification_id}/read")
async def mark_notification_read(notification_id: str, token_data: TokenData = Depends(require_auth)):
    await db.notifications.update_one(
        {"id": notification_id, "user_id": token_data.user_id},
        {"$set": {"read": True}}
    )
    return {"message": "Marked as read"}



@router.put("/read-all")
async def mark_all_read(token_data: TokenData = Depends(require_auth)):
    await db.notifications.update_many(
        {"user_id": token_data.user_id},
        {"$set": {"read": True}}
    )
    return {"message": "All marked as read"}



@router.get("/unread-count")
async def get_unread_count(token_data: TokenData = Depends(require_auth)):
    count = await db.notifications.count_documents({"user_id": token_data.user_id, "read": False})
    return {"count": count}




