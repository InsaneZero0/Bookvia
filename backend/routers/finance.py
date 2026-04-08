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

router = APIRouter(prefix="/business/finance", tags=["Finance"])

@router.get("/summary", response_model=BusinessFinanceSummary)
async def get_finance_summary(token_data: TokenData = Depends(require_business)):
    """Get financial summary for the business"""
    user = await db.users.find_one({"id": token_data.user_id})
    if not user or not user.get("business_id"):
        raise HTTPException(status_code=404, detail="Business not found")
    
    business_id = user["business_id"]
    
    # Calculate from ledger
    summary = await calculate_business_ledger_summary(business_id)
    
    # Get settlement totals
    paid_settlements = await db.settlements.find({
        "business_id": business_id,
        "status": SettlementStatus.PAID
    }).to_list(1000)
    paid_payout = sum(s.get("net_payout", 0) for s in paid_settlements)
    
    held_settlements = await db.settlements.find({
        "business_id": business_id,
        "status": SettlementStatus.HELD
    }).to_list(100)
    held_payout = sum(s.get("net_payout", 0) for s in held_settlements)
    
    # Calculate next settlement date (1st of next month)
    now = datetime.now(timezone.utc)
    if now.month == 12:
        next_settlement = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        next_settlement = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)
    
    return BusinessFinanceSummary(
        gross_revenue=summary["gross_revenue"],
        total_fees=summary["total_fees"],
        total_refunds=summary["total_refunds"],
        total_penalties=summary["total_penalties"],
        net_earnings=summary["net_earnings"],
        pending_payout=summary["pending_payout"],
        paid_payout=round(paid_payout, 2),
        held_payout=round(held_payout, 2),
        next_settlement_date=next_settlement.isoformat()
    )



@router.get("/transactions", response_model=List[TransactionResponse])
async def get_finance_transactions(
    status: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    token_data: TokenData = Depends(require_business)
):
    """Get business transactions with filters"""
    user = await db.users.find_one({"id": token_data.user_id})
    if not user or not user.get("business_id"):
        raise HTTPException(status_code=404, detail="Business not found")
    
    filters = {"business_id": user["business_id"]}
    
    if status:
        filters["status"] = status
    if start_date and end_date:
        filters["created_at"] = {"$gte": start_date, "$lte": end_date}
    
    skip = (page - 1) * limit
    transactions = await db.transactions.find(filters, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return [TransactionResponse(**t) for t in transactions]



@router.get("/ledger", response_model=List[LedgerEntryResponse])
async def get_finance_ledger(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    account: Optional[str] = None,
    page: int = 1,
    limit: int = 100,
    token_data: TokenData = Depends(require_business)
):
    """Get ledger entries for the business"""
    user = await db.users.find_one({"id": token_data.user_id})
    if not user or not user.get("business_id"):
        raise HTTPException(status_code=404, detail="Business not found")
    
    filters = {"business_id": user["business_id"]}
    
    if account:
        filters["account"] = account
    if start_date and end_date:
        filters["created_at"] = {"$gte": start_date, "$lte": end_date}
    
    skip = (page - 1) * limit
    entries = await db.ledger_entries.find(filters, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return [LedgerEntryResponse(**e) for e in entries]



@router.get("/settlements", response_model=List[SettlementResponse])
async def get_finance_settlements(
    status: Optional[str] = None,
    token_data: TokenData = Depends(require_business)
):
    """Get settlement history for the business"""
    user = await db.users.find_one({"id": token_data.user_id})
    if not user or not user.get("business_id"):
        raise HTTPException(status_code=404, detail="Business not found")
    
    filters = {"business_id": user["business_id"]}
    if status:
        filters["status"] = status
    
    settlements = await db.settlements.find(filters, {"_id": 0}).sort("period_start", -1).to_list(100)
    
    # Add business name
    business = await db.businesses.find_one({"id": user["business_id"]})
    for s in settlements:
        s["business_name"] = business["name"] if business else None
    
    return [SettlementResponse(**s) for s in settlements]



