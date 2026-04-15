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
    security, get_current_user, require_auth, require_business, require_admin,
    require_super_admin, check_staff_permission
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

router = APIRouter(prefix="/admin", tags=["Admin"])


async def generate_monthly_settlements(year: int, month: int, idempotency_key: str, admin_id: str = None, request=None):
    """Generate monthly settlements for all businesses with completed bookings."""
    period_key = f"{year}-{str(month).zfill(2)}"
    
    # Check if already generated
    existing = await db.settlements.find_one({"period_key": period_key, "idempotency_key": idempotency_key}, {"_id": 0})
    if existing:
        return {"message": "Settlements already generated", "period": period_key}
    
    # Find all completed bookings in the period
    start_date = f"{year}-{str(month).zfill(2)}-01"
    if month == 12:
        end_date = f"{year + 1}-01-01"
    else:
        end_date = f"{year}-{str(month + 1).zfill(2)}-01"
    
    pipeline = [
        {"$match": {"status": "completed", "date": {"$gte": start_date, "$lt": end_date}, "deposit_paid": True}},
        {"$group": {
            "_id": "$business_id",
            "total_amount": {"$sum": "$deposit_amount"},
            "booking_count": {"$sum": 1},
            "booking_ids": {"$push": "$id"}
        }}
    ]
    results = await db.bookings.aggregate(pipeline).to_list(1000)
    
    settlements_created = 0
    for r in results:
        fee = round(r["total_amount"] * PLATFORM_FEE_PERCENT, 2)
        payout = round(r["total_amount"] - fee, 2)
        settlement = {
            "id": generate_id(),
            "business_id": r["_id"],
            "period_key": period_key,
            "idempotency_key": idempotency_key,
            "total_amount": r["total_amount"],
            "fee_amount": fee,
            "payout_amount": payout,
            "booking_count": r["booking_count"],
            "booking_ids": r["booking_ids"],
            "status": SettlementStatus.PENDING,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": admin_id,
        }
        await db.settlements.insert_one(settlement)
        settlements_created += 1
    
    return {"message": f"Generated {settlements_created} settlements", "period": period_key, "count": settlements_created}


@router.post("/settlements/generate")
async def admin_generate_settlements(
    request: Request,
    year: int,
    month: int,
    token_data: TokenData = Depends(require_admin)
):
    """Admin endpoint to generate monthly settlements"""
    # Generate idempotency key based on job run
    idempotency_key = f"job-{year}-{month}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M')}"
    
    results = await generate_monthly_settlements(
        year, month, idempotency_key,
        admin_id=token_data.user_id,
        request=request
    )
    
    return results



@router.get("/settlements", response_model=List[SettlementResponse])
async def admin_get_settlements(
    status: Optional[str] = None,
    period_key: Optional[str] = None,
    business_id: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    token_data: TokenData = Depends(require_admin)
):
    """Admin: Get all settlements with filters"""
    filters = {}
    if status:
        filters["status"] = status
    if period_key:
        filters["period_key"] = period_key
    if business_id:
        filters["business_id"] = business_id
    
    skip = (page - 1) * limit
    settlements = await db.settlements.find(filters, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Add business names
    for s in settlements:
        business = await db.businesses.find_one({"id": s["business_id"]})
        s["business_name"] = business["name"] if business else None
    
    return [SettlementResponse(**s) for s in settlements]



@router.put("/settlements/{settlement_id}/pay")
async def admin_mark_settlement_paid(
    settlement_id: str,
    request: Request,
    pay_req: SettlementMarkPaidRequest,
    token_data: TokenData = Depends(require_admin)
):
    """Admin: Mark settlement as paid (manual)"""
    settlement = await db.settlements.find_one({"id": settlement_id})
    if not settlement:
        raise HTTPException(status_code=404, detail="Settlement not found")
    
    if settlement["status"] not in [SettlementStatus.PENDING, SettlementStatus.HELD]:
        raise HTTPException(status_code=400, detail=f"Cannot mark settlement with status {settlement['status']} as paid")
    
    now = datetime.now(timezone.utc)
    
    await db.settlements.update_one(
        {"id": settlement_id},
        {"$set": {
            "status": SettlementStatus.PAID,
            "payout_reference": pay_req.payout_reference,
            "paid_at": now.isoformat(),
            "updated_at": now.isoformat()
        }}
    )
    
    # Create payout ledger entry
    await create_ledger_entry(
        transaction_id=settlement_id,
        business_id=settlement["business_id"],
        direction=LedgerDirection.CREDIT,
        account=LedgerAccount.PAYOUT,
        amount=settlement["net_payout"],
        description=f"Payout {settlement['period_key']} - {pay_req.payout_reference}",
        created_by="admin"
    )
    
    # Create audit log
    await create_audit_log(
        admin_id=token_data.user_id,
        admin_email=token_data.email,
        action=AuditAction.SETTLEMENT_MARK_PAID,
        target_type="settlement",
        target_id=settlement_id,
        details={
            "business_id": settlement["business_id"],
            "net_payout": settlement["net_payout"],
            "payout_reference": pay_req.payout_reference
        },
        request=request
    )
    
    return {"message": "Settlement marked as paid", "payout_reference": pay_req.payout_reference}



@router.put("/businesses/{business_id}/payout-hold")
async def admin_toggle_payout_hold(
    business_id: str,
    request: Request,
    hold_req: PayoutHoldRequest,
    token_data: TokenData = Depends(require_admin)
):
    """Admin: Toggle payout hold for a business"""
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    await db.businesses.update_one(
        {"id": business_id},
        {"$set": {
            "payout_hold": hold_req.hold,
            "payout_hold_reason": hold_req.reason if hold_req.hold else None
        }}
    )
    
    # If releasing hold, update any HELD settlements to PENDING
    if not hold_req.hold:
        await db.settlements.update_many(
            {"business_id": business_id, "status": SettlementStatus.HELD},
            {"$set": {"status": SettlementStatus.PENDING, "held_reason": None}}
        )
    
    # Create audit log
    await create_audit_log(
        admin_id=token_data.user_id,
        admin_email=token_data.email,
        action=AuditAction.PAYOUT_HOLD if hold_req.hold else AuditAction.PAYOUT_RELEASE,
        target_type="business",
        target_id=business_id,
        details={"hold": hold_req.hold, "reason": hold_req.reason},
        request=request
    )
    
    return {"message": f"Payout {'held' if hold_req.hold else 'released'} for business {business_id}"}



@router.get("/export/transactions")
async def admin_export_transactions(
    year: int,
    month: int,
    token_data: TokenData = Depends(require_admin)
):
    """Admin: Export transactions as CSV"""
    import csv
    import io
    from fastapi.responses import StreamingResponse
    
    period_start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        period_end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        period_end = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    
    transactions = await db.transactions.find({
        "created_at": {"$gte": period_start.isoformat(), "$lt": period_end.isoformat()}
    }, {"_id": 0}).to_list(10000)
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        "ID", "Booking ID", "User ID", "Business ID",
        "Amount Total", "Fee Amount", "Payout Amount", "Currency",
        "Status", "Refund Amount", "Refund Reason", "Cancelled By",
        "Created At", "Paid At"
    ])
    
    # Data
    for t in transactions:
        writer.writerow([
            t.get("id"), t.get("booking_id"), t.get("user_id"), t.get("business_id"),
            t.get("amount_total"), t.get("fee_amount"), t.get("payout_amount"), t.get("currency"),
            t.get("status"), t.get("refund_amount"), t.get("refund_reason"), t.get("cancelled_by"),
            t.get("created_at"), t.get("paid_at")
        ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=transactions_{year}_{month:02d}.csv"}
    )



@router.get("/export/settlements")
async def admin_export_settlements(
    year: int,
    month: int,
    token_data: TokenData = Depends(require_admin)
):
    """Admin: Export settlements as CSV"""
    import csv
    import io
    from fastapi.responses import StreamingResponse
    
    period_key = f"MX-{year}-{str(month).zfill(2)}"
    
    settlements = await db.settlements.find({
        "period_key": period_key
    }, {"_id": 0}).to_list(10000)
    
    # Add business names
    for s in settlements:
        business = await db.businesses.find_one({"id": s["business_id"]})
        s["business_name"] = business["name"] if business else "Unknown"
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        "ID", "Business ID", "Business Name", "Period Key",
        "Gross Paid", "Total Fees", "Total Refunds", "Total Penalties", "Net Payout",
        "Currency", "Status", "Held Reason", "Payout Reference", "Paid At", "Created At"
    ])
    
    # Data
    for s in settlements:
        writer.writerow([
            s.get("id"), s.get("business_id"), s.get("business_name"), s.get("period_key"),
            s.get("gross_paid"), s.get("total_fees"), s.get("total_refunds"), s.get("total_penalties"), s.get("net_payout"),
            s.get("currency"), s.get("status"), s.get("held_reason"), s.get("payout_reference"), s.get("paid_at"), s.get("created_at")
        ])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=settlements_{year}_{month:02d}.csv"}
    )



@router.get("/stats")
async def get_admin_stats(token_data: TokenData = Depends(require_admin)):
    total_users = await db.users.count_documents({"role": UserRole.USER})
    total_businesses = await db.businesses.count_documents({})
    approved_businesses = await db.businesses.count_documents({"status": BusinessStatus.APPROVED})
    pending_businesses = await db.businesses.count_documents({"status": BusinessStatus.PENDING})
    
    total_bookings = await db.bookings.count_documents({})
    completed_bookings = await db.bookings.count_documents({"status": AppointmentStatus.COMPLETED})
    
    # This month stats
    first_of_month = datetime.now(timezone.utc).replace(day=1).strftime("%Y-%m-%d")
    month_bookings = await db.bookings.count_documents({"date": {"$gte": first_of_month}})
    month_revenue = 0
    
    payments = await db.payment_transactions.find({
        "status": PaymentStatus.COMPLETED,
        "created_at": {"$gte": first_of_month}
    }).to_list(10000)
    month_revenue = sum(p.get("amount", 0) for p in payments)
    
    return {
        "users": {
            "total": total_users
        },
        "businesses": {
            "total": total_businesses,
            "approved": approved_businesses,
            "pending": pending_businesses
        },
        "bookings": {
            "total": total_bookings,
            "completed": completed_bookings,
            "this_month": month_bookings
        },
        "revenue": {
            "this_month": month_revenue
        }
    }



@router.get("/growth")
async def get_growth_stats(months: int = 12, token_data: TokenData = Depends(require_admin)):
    """Get monthly growth stats for businesses, bookings and revenue."""
    now = datetime.now(timezone.utc)
    results = []

    for i in range(months - 1, -1, -1):
        # Calculate month boundaries
        d = now.replace(day=1) - timedelta(days=i * 28)
        y, m = d.year, d.month
        start = f"{y}-{m:02d}-01"
        if m == 12:
            end = f"{y + 1}-01-01"
        else:
            end = f"{y}-{m + 1:02d}-01"
        start_iso = f"{y}-{m:02d}-01T00:00:00"
        end_iso = end + "T00:00:00"

        biz_count = await db.businesses.count_documents({
            "created_at": {"$gte": start_iso, "$lt": end_iso}
        })
        booking_count = await db.bookings.count_documents({
            "date": {"$gte": start, "$lt": end}
        })
        user_count = await db.users.count_documents({
            "role": UserRole.USER,
            "created_at": {"$gte": start_iso, "$lt": end_iso}
        })
        payments = await db.payment_transactions.find({
            "status": PaymentStatus.COMPLETED,
            "created_at": {"$gte": start_iso, "$lt": end_iso}
        }, {"_id": 0, "amount": 1}).to_list(10000)
        revenue = sum(p.get("amount", 0) for p in payments)

        label = f"{y}-{m:02d}"
        results.append({
            "month": label,
            "businesses": biz_count,
            "bookings": booking_count,
            "users": user_count,
            "revenue": round(revenue, 2),
        })

    return results


@router.get("/businesses/all")
async def get_all_businesses(
    search: str = "", status: str = "", city: str = "",
    page: int = 1, limit: int = 50,
    token_data: TokenData = Depends(require_admin)
):
    """List all businesses with search and filters."""
    query = {}
    if status:
        query["status"] = status
    if city:
        query["city"] = {"$regex": city, "$options": "i"}
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
        ]
    total = await db.businesses.count_documents(query)
    businesses = await db.businesses.find(
        query, {"_id": 0, "password_hash": 0}
    ).sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(limit)

    # Get owner info and booking counts for each business
    results = []
    for b in businesses:
        owner = await db.users.find_one({"business_id": b["id"]}, {"_id": 0, "email": 1, "full_name": 1})
        booking_count = await db.bookings.count_documents({"business_id": b["id"]})
        review_count = await db.reviews.count_documents({"business_id": b["id"]})
        b["owner_email"] = owner.get("email", "") if owner else ""
        b["owner_name"] = owner.get("full_name", "") if owner else ""
        b["booking_count"] = booking_count
        b["review_count"] = review_count
        results.append(b)

    return {"businesses": results, "total": total, "page": page, "pages": (total + limit - 1) // limit}


@router.get("/users/all")
async def get_all_users(
    search: str = "", page: int = 1, limit: int = 50,
    token_data: TokenData = Depends(require_admin)
):
    """List all users with search."""
    query = {"role": {"$ne": "admin"}}
    if search:
        query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
        ]
    total = await db.users.count_documents(query)
    users = await db.users.find(
        query, {"_id": 0, "password_hash": 0, "totp_secret": 0}
    ).sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(limit)

    results = []
    for u in users:
        booking_count = await db.bookings.count_documents({"user_id": u["id"]})
        u["booking_count"] = booking_count
        results.append(u)

    return {"users": results, "total": total, "page": page, "pages": (total + limit - 1) // limit}



@router.get("/businesses/{business_id}/detail")
async def get_business_detail(business_id: str, token_data: TokenData = Depends(require_admin)):
    """Get complete business detail for admin review including legal documents."""
    business = await db.businesses.find_one({"id": business_id}, {"_id": 0, "password_hash": 0})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    # Get owner info
    owner = await db.users.find_one({"business_id": business_id}, {"_id": 0, "password_hash": 0, "totp_secret": 0})

    # Get booking stats
    total_bookings = await db.bookings.count_documents({"business_id": business_id})
    completed_bookings = await db.bookings.count_documents({"business_id": business_id, "status": "completed"})
    cancelled_bookings = await db.bookings.count_documents({"business_id": business_id, "status": "cancelled"})

    # Get revenue
    pipeline = [
        {"$match": {"business_id": business_id, "status": "completed", "deposit_paid": True}},
        {"$group": {"_id": None, "total": {"$sum": "$deposit_amount"}}}
    ]
    revenue_result = await db.bookings.aggregate(pipeline).to_list(1)
    total_revenue = revenue_result[0]["total"] if revenue_result else 0

    # Get reviews
    reviews = await db.reviews.find({"business_id": business_id}, {"_id": 0}).sort("created_at", -1).to_list(20)
    avg_rating = sum(r.get("rating", 0) for r in reviews) / len(reviews) if reviews else 0

    # Get workers
    workers = await db.workers.find({"business_id": business_id, "active": True}, {"_id": 0, "id": 1, "name": 1}).to_list(50)

    # Get services
    services = await db.services.find({"business_id": business_id, "active": True}, {"_id": 0, "id": 1, "name": 1, "price": 1, "duration": 1}).to_list(50)

    return {
        "business": business,
        "owner": owner,
        "stats": {
            "total_bookings": total_bookings,
            "completed_bookings": completed_bookings,
            "cancelled_bookings": cancelled_bookings,
            "total_revenue": total_revenue,
            "avg_rating": round(avg_rating, 1),
            "review_count": len(reviews),
        },
        "workers": workers,
        "services": services,
        "reviews": reviews,
    }


@router.get("/reviews/all")
async def get_all_reviews(
    search: str = "", page: int = 1, limit: int = 30,
    token_data: TokenData = Depends(require_admin)
):
    """List all reviews for moderation."""
    query = {}
    if search:
        query["$or"] = [
            {"comment": {"$regex": search, "$options": "i"}},
            {"user_name": {"$regex": search, "$options": "i"}},
        ]
    total = await db.reviews.count_documents(query)
    reviews = await db.reviews.find(query, {"_id": 0}).sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(limit)

    # Enrich with business name
    for r in reviews:
        biz = await db.businesses.find_one({"id": r.get("business_id")}, {"_id": 0, "name": 1})
        r["business_name"] = biz.get("name", "?") if biz else "?"

    return {"reviews": reviews, "total": total, "page": page, "pages": (total + limit - 1) // limit}


@router.get("/subscriptions")
async def get_subscription_overview(token_data: TokenData = Depends(require_admin)):
    """Get subscription overview for all businesses."""
    pipeline = [
        {"$group": {
            "_id": "$subscription_status",
            "count": {"$sum": 1}
        }}
    ]
    status_counts = await db.businesses.aggregate(pipeline).to_list(10)
    summary = {item["_id"]: item["count"] for item in status_counts if item["_id"]}

    # Get businesses with subscription details
    businesses = await db.businesses.find(
        {"subscription_status": {"$exists": True, "$ne": None}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "city": 1, "subscription_status": 1,
         "subscription_id": 1, "subscription_started_at": 1, "created_at": 1}
    ).sort("created_at", -1).to_list(500)

    return {"summary": summary, "businesses": businesses}



@router.get("/businesses/pending", response_model=List[BusinessResponse])
async def get_pending_businesses(token_data: TokenData = Depends(require_admin)):
    # Only show businesses whose owner has verified their email
    businesses = await db.businesses.find(
        {"status": BusinessStatus.PENDING},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    
    verified_businesses = []
    for b in businesses:
        user = await db.users.find_one({"business_id": b["id"]}, {"_id": 0, "email_verified": 1})
        if user and user.get("email_verified", False):
            verified_businesses.append(b)
    
    return [BusinessResponse(**b) for b in verified_businesses]



@router.put("/businesses/{business_id}/approve")
async def approve_business(business_id: str, request: Request, token_data: TokenData = Depends(require_admin)):
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    result = await db.businesses.update_one(
        {"id": business_id},
        {"$set": {"status": BusinessStatus.APPROVED}}
    )
    
    # Create audit log
    await create_audit_log(
        admin_id=token_data.user_id,
        admin_email=token_data.email,
        action=AuditAction.BUSINESS_APPROVE,
        target_type="business",
        target_id=business_id,
        details={"business_name": business.get("name")},
        request=request
    )
    
    # Notify business owner
    if business.get("user_id"):
        await create_notification(
            business["user_id"],
            "Negocio Aprobado",
            f"¡Tu negocio {business['name']} ha sido aprobado! Ya puedes recibir reservas.",
            "system",
            {"business_id": business_id}
        )
    
    return {"message": "Business approved"}



@router.put("/businesses/{business_id}/reject")
async def reject_business(business_id: str, request: Request, reason: str = "", token_data: TokenData = Depends(require_admin)):
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    result = await db.businesses.update_one(
        {"id": business_id},
        {"$set": {"status": BusinessStatus.REJECTED, "rejection_reason": reason}}
    )
    
    # Create audit log
    await create_audit_log(
        admin_id=token_data.user_id,
        admin_email=token_data.email,
        action=AuditAction.BUSINESS_REJECT,
        target_type="business",
        target_id=business_id,
        details={"business_name": business.get("name"), "reason": reason},
        request=request
    )
    
    # Notify business owner
    if business.get("user_id"):
        await create_notification(
            business["user_id"],
            "Negocio Rechazado",
            f"Tu solicitud de negocio ha sido rechazada. Razón: {reason or 'No especificada'}",
            "system",
            {"business_id": business_id}
        )
    
    return {"message": "Business rejected"}



@router.put("/businesses/{business_id}/suspend")
async def suspend_business(business_id: str, request: Request, reason: str = "", token_data: TokenData = Depends(require_admin)):
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    result = await db.businesses.update_one(
        {"id": business_id},
        {"$set": {"status": BusinessStatus.SUSPENDED, "suspension_reason": reason}}
    )
    
    # Create audit log
    await create_audit_log(
        admin_id=token_data.user_id,
        admin_email=token_data.email,
        action=AuditAction.BUSINESS_SUSPEND,
        target_type="business",
        target_id=business_id,
        details={"business_name": business.get("name"), "reason": reason},
        request=request
    )
    
    # Notify business owner
    if business.get("user_id"):
        await create_notification(
            business["user_id"],
            "Negocio Suspendido",
            f"Tu negocio ha sido suspendido. Razón: {reason or 'No especificada'}",
            "system",
            {"business_id": business_id}
        )
    
    return {"message": "Business suspended"}



@router.put("/users/{user_id}/suspend")
async def suspend_user(user_id: str, request: Request, days: int = 15, reason: str = "", token_data: TokenData = Depends(require_admin)):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    suspended_until = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
    
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"suspended_until": suspended_until, "suspension_reason": reason}}
    )
    
    # Create audit log
    await create_audit_log(
        admin_id=token_data.user_id,
        admin_email=token_data.email,
        action=AuditAction.USER_SUSPEND,
        target_type="user",
        target_id=user_id,
        details={"user_email": user.get("email"), "days": days, "reason": reason},
        request=request
    )
    
    return {"message": f"User suspended for {days} days"}



@router.delete("/reviews/{review_id}")
async def delete_review(review_id: str, request: Request, reason: str = "", token_data: TokenData = Depends(require_admin)):
    review = await db.reviews.find_one({"id": review_id})
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    
    # Update business rating
    business = await db.businesses.find_one({"id": review["business_id"]})
    if business:
        new_rating_sum = business.get("rating_sum", 0) - review["rating"]
        new_review_count = max(business.get("review_count", 0) - 1, 0)
        new_rating = calculate_bayesian_rating(new_rating_sum, new_review_count) if new_review_count > 0 else 0
        
        await db.businesses.update_one(
            {"id": review["business_id"]},
            {"$set": {"rating": round(new_rating, 2), "rating_sum": new_rating_sum, "review_count": new_review_count}}
        )
    
    await db.reviews.delete_one({"id": review_id})
    
    # Create audit log
    await create_audit_log(
        admin_id=token_data.user_id,
        admin_email=token_data.email,
        action=AuditAction.REVIEW_DELETE,
        target_type="review",
        target_id=review_id,
        details={
            "business_id": review.get("business_id"),
            "user_id": review.get("user_id"),
            "rating": review.get("rating"),
            "reason": reason
        },
        request=request
    )
    
    return {"message": "Review deleted"}



@router.get("/audit-logs", response_model=List[AuditLogResponse])
async def get_audit_logs(
    page: int = 1,
    limit: int = 50,
    action: Optional[str] = None,
    admin_id: Optional[str] = None,
    token_data: TokenData = Depends(require_admin)
):
    filters = {}
    if action:
        filters["action"] = action
    if admin_id:
        filters["admin_id"] = admin_id
    
    skip = (page - 1) * limit
    logs = await db.audit_logs.find(filters, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return [AuditLogResponse(**log) for log in logs]



@router.put("/businesses/{business_id}/feature")
async def toggle_featured(business_id: str, request: Request, featured: bool = True, token_data: TokenData = Depends(require_admin)):
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    await db.businesses.update_one(
        {"id": business_id},
        {"$set": {"is_featured": featured}}
    )
    
    # Create audit log
    await create_audit_log(
        admin_id=token_data.user_id,
        admin_email=token_data.email,
        action=AuditAction.BUSINESS_FEATURE,
        target_type="business",
        target_id=business_id,
        details={"business_name": business.get("name"), "featured": featured},
        request=request
    )
    
    return {"message": f"Business {'featured' if featured else 'unfeatured'}"}



@router.get("/emails")
async def get_sent_emails(
    limit: int = 50,
    status: Optional[str] = None,
    to: Optional[str] = None,
    token_data: TokenData = Depends(require_admin)
):
    """Admin: Get sent emails from the system"""
    from services.email import get_sent_emails as fetch_emails
    emails = await fetch_emails(limit=limit, status=status, to=to)
    return emails



@router.put("/payments/{payment_id}/hold")
async def hold_payment(payment_id: str, request: Request, reason: str = "", token_data: TokenData = Depends(require_admin)):
    """Put a payment on hold - prevents payout to business"""
    payment = await db.payment_transactions.find_one({"id": payment_id})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    await db.payment_transactions.update_one(
        {"id": payment_id},
        {"$set": {"on_hold": True, "hold_reason": reason, "held_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Create audit log
    await create_audit_log(
        admin_id=token_data.user_id,
        admin_email=token_data.email,
        action=AuditAction.PAYMENT_HOLD,
        target_type="payment",
        target_id=payment_id,
        details={"amount": payment.get("amount"), "reason": reason},
        request=request
    )
    
    return {"message": "Payment put on hold"}



@router.put("/payments/{payment_id}/release")
async def release_payment(payment_id: str, request: Request, token_data: TokenData = Depends(require_admin)):
    """Release a payment from hold"""
    payment = await db.payment_transactions.find_one({"id": payment_id})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    await db.payment_transactions.update_one(
        {"id": payment_id},
        {"$set": {"on_hold": False, "released_at": datetime.now(timezone.utc).isoformat()},
         "$unset": {"hold_reason": ""}}
    )
    
    # Create audit log
    await create_audit_log(
        admin_id=token_data.user_id,
        admin_email=token_data.email,
        action=AuditAction.PAYMENT_RELEASE,
        target_type="payment",
        target_id=payment_id,
        details={"amount": payment.get("amount")},
        request=request
    )
    
    return {"message": "Payment released"}



@router.get("/payments/held")
async def get_held_payments(page: int = 1, limit: int = 50, token_data: TokenData = Depends(require_admin)):
    """Get all payments currently on hold"""
    skip = (page - 1) * limit
    payments = await db.payment_transactions.find(
        {"on_hold": True},
        {"_id": 0}
    ).sort("held_at", -1).skip(skip).limit(limit).to_list(limit)
    return payments





# ============ CATEGORY MANAGEMENT ============

@router.get("/categories")
async def admin_get_categories(token_data: TokenData = Depends(require_admin)):
    """Get all categories with business counts."""
    cats = await db.categories.find({}, {"_id": 0}).to_list(100)
    for c in cats:
        count = await db.businesses.count_documents({"category_id": c["id"]})
        c["business_count"] = count
    return cats


@router.post("/categories")
async def admin_create_category(category: CategoryCreate, request: Request, token_data: TokenData = Depends(require_admin)):
    """Create a new category."""
    existing = await db.categories.find_one({"slug": category.slug}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Category with this slug already exists")
    doc = {"id": generate_id(), "active": True, **category.model_dump()}
    await db.categories.insert_one(doc)
    await create_audit_log(
        admin_id=token_data.user_id, admin_email=token_data.email,
        action=AuditAction.CATEGORY_CREATE, target_type="category",
        target_id=doc["id"], details={"name_es": category.name_es}, request=request
    )
    doc.pop("_id", None)
    return doc


@router.put("/categories/{category_id}")
async def admin_update_category(category_id: str, update: CategoryUpdate, request: Request, token_data: TokenData = Depends(require_admin)):
    """Update a category."""
    cat = await db.categories.find_one({"id": category_id})
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    changes = {k: v for k, v in update.model_dump().items() if v is not None}
    if not changes:
        raise HTTPException(status_code=400, detail="No changes provided")
    if "slug" in changes:
        dup = await db.categories.find_one({"slug": changes["slug"], "id": {"$ne": category_id}})
        if dup:
            raise HTTPException(status_code=400, detail="Slug already in use")
    await db.categories.update_one({"id": category_id}, {"$set": changes})
    await create_audit_log(
        admin_id=token_data.user_id, admin_email=token_data.email,
        action=AuditAction.CATEGORY_UPDATE, target_type="category",
        target_id=category_id, details=changes, request=request
    )
    updated = await db.categories.find_one({"id": category_id}, {"_id": 0})
    return updated


@router.delete("/categories/{category_id}")
async def admin_delete_category(category_id: str, request: Request, token_data: TokenData = Depends(require_admin)):
    """Delete a category (only if no businesses use it)."""
    cat = await db.categories.find_one({"id": category_id})
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    biz_count = await db.businesses.count_documents({"category_id": category_id})
    if biz_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete: {biz_count} businesses use this category")
    await db.categories.delete_one({"id": category_id})
    await create_audit_log(
        admin_id=token_data.user_id, admin_email=token_data.email,
        action=AuditAction.CATEGORY_DELETE, target_type="category",
        target_id=category_id, details={"name_es": cat.get("name_es")}, request=request
    )
    return {"message": "Category deleted"}


# ============ PLATFORM CONFIG ============

@router.get("/config")
async def get_platform_config(token_data: TokenData = Depends(require_admin)):
    """Get current platform configuration."""
    config = await db.platform_config.find_one({"_id": "main"})
    if not config:
        return {
            "platform_fee_percent": PLATFORM_FEE_PERCENT,
            "subscription_price_mxn": SUBSCRIPTION_PRICE_MXN,
            "subscription_trial_days": SUBSCRIPTION_TRIAL_DAYS,
            "min_deposit_amount": MIN_DEPOSIT_AMOUNT,
            "updated_at": None,
            "updated_by": None,
        }
    config.pop("_id", None)
    return config


@router.put("/config")
async def update_platform_config(update: PlatformConfigUpdate, request: Request, token_data: TokenData = Depends(require_admin)):
    """Update platform configuration."""
    changes = {k: v for k, v in update.model_dump().items() if v is not None}
    if not changes:
        raise HTTPException(status_code=400, detail="No changes provided")
    # Validate ranges
    if "platform_fee_percent" in changes and not (0 <= changes["platform_fee_percent"] <= 0.5):
        raise HTTPException(status_code=400, detail="Fee must be between 0% and 50%")
    if "subscription_price_mxn" in changes and changes["subscription_price_mxn"] < 0:
        raise HTTPException(status_code=400, detail="Price cannot be negative")
    if "subscription_trial_days" in changes and changes["subscription_trial_days"] < 0:
        raise HTTPException(status_code=400, detail="Trial days cannot be negative")
    if "min_deposit_amount" in changes and changes["min_deposit_amount"] < 0:
        raise HTTPException(status_code=400, detail="Min deposit cannot be negative")

    changes["updated_at"] = datetime.now(timezone.utc).isoformat()
    changes["updated_by"] = token_data.email

    await db.platform_config.update_one(
        {"_id": "main"},
        {"$set": changes},
        upsert=True
    )
    await create_audit_log(
        admin_id=token_data.user_id, admin_email=token_data.email,
        action=AuditAction.CONFIG_UPDATE, target_type="platform_config",
        target_id="main", details=changes, request=request
    )
    config = await db.platform_config.find_one({"_id": "main"})
    config.pop("_id", None)
    return config


# ============ SUPPORT TICKETS ============

@router.get("/tickets")
async def get_all_tickets(
    status: str = "", search: str = "", page: int = 1, limit: int = 20,
    token_data: TokenData = Depends(require_admin)
):
    """Get all support tickets with filters."""
    query = {}
    if status:
        query["status"] = status
    if search:
        query["$or"] = [
            {"subject": {"$regex": search, "$options": "i"}},
            {"user_email": {"$regex": search, "$options": "i"}},
        ]
    total = await db.support_tickets.count_documents(query)
    tickets = await db.support_tickets.find(query, {"_id": 0}).sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(limit)
    return {"tickets": tickets, "total": total, "page": page, "pages": max(1, (total + limit - 1) // limit)}


@router.get("/tickets/stats")
async def get_ticket_stats(token_data: TokenData = Depends(require_admin)):
    """Get ticket statistics."""
    open_count = await db.support_tickets.count_documents({"status": "open"})
    in_progress = await db.support_tickets.count_documents({"status": "in_progress"})
    closed = await db.support_tickets.count_documents({"status": "closed"})
    total = open_count + in_progress + closed
    return {"open": open_count, "in_progress": in_progress, "closed": closed, "total": total}


@router.get("/tickets/{ticket_id}")
async def get_ticket_detail(ticket_id: str, token_data: TokenData = Depends(require_admin)):
    """Get a single ticket with all messages."""
    ticket = await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


@router.post("/tickets/{ticket_id}/respond")
async def respond_to_ticket(ticket_id: str, body: TicketMessageCreate, request: Request, token_data: TokenData = Depends(require_admin)):
    """Admin responds to a ticket."""
    ticket = await db.support_tickets.find_one({"id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    now = datetime.now(timezone.utc).isoformat()
    msg = {"sender": "admin", "sender_name": token_data.email, "message": body.message, "created_at": now}
    await db.support_tickets.update_one(
        {"id": ticket_id},
        {"$push": {"messages": msg}, "$set": {"status": "in_progress", "updated_at": now}}
    )
    # Notify user
    if ticket.get("user_id"):
        await create_notification(
            ticket["user_id"], "Respuesta a tu ticket",
            f"Tu ticket '{ticket['subject']}' tiene una nueva respuesta.",
            "system", {"ticket_id": ticket_id}
        )
    await create_audit_log(
        admin_id=token_data.user_id, admin_email=token_data.email,
        action=AuditAction.TICKET_RESPOND, target_type="ticket",
        target_id=ticket_id, details={"subject": ticket.get("subject")}, request=request
    )
    return {"message": "Response sent"}


@router.put("/tickets/{ticket_id}/close")
async def close_ticket(ticket_id: str, request: Request, token_data: TokenData = Depends(require_admin)):
    """Close a ticket."""
    ticket = await db.support_tickets.find_one({"id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    now = datetime.now(timezone.utc).isoformat()
    await db.support_tickets.update_one(
        {"id": ticket_id},
        {"$set": {"status": "closed", "closed_at": now, "updated_at": now}}
    )
    await create_audit_log(
        admin_id=token_data.user_id, admin_email=token_data.email,
        action=AuditAction.TICKET_CLOSE, target_type="ticket",
        target_id=ticket_id, details={"subject": ticket.get("subject")}, request=request
    )
    return {"message": "Ticket closed"}



# ============ RANKINGS / TOP ============

@router.get("/rankings")
async def get_rankings(token_data: TokenData = Depends(require_admin)):
    """Get top businesses and cities rankings."""
    # Top businesses by bookings
    all_biz = await db.businesses.find(
        {"status": BusinessStatus.APPROVED},
        {"_id": 0, "id": 1, "name": 1, "city": 1, "rating": 1, "review_count": 1, "category": 1}
    ).to_list(500)

    for b in all_biz:
        b["booking_count"] = await db.bookings.count_documents({"business_id": b["id"]})

    top_by_bookings = sorted(all_biz, key=lambda x: x.get("booking_count", 0), reverse=True)[:10]
    top_by_rating = sorted(
        [b for b in all_biz if b.get("review_count", 0) >= 1],
        key=lambda x: x.get("rating", 0), reverse=True
    )[:10]

    # Top cities
    city_map = {}
    for b in all_biz:
        city = b.get("city", "?")
        if city not in city_map:
            city_map[city] = {"city": city, "businesses": 0, "bookings": 0}
        city_map[city]["businesses"] += 1
        city_map[city]["bookings"] += b.get("booking_count", 0)

    top_cities = sorted(city_map.values(), key=lambda x: x["businesses"], reverse=True)[:10]

    # Top categories
    cat_map = {}
    for b in all_biz:
        cat = b.get("category", "Sin categoria")
        if cat not in cat_map:
            cat_map[cat] = {"category": cat, "businesses": 0, "bookings": 0}
        cat_map[cat]["businesses"] += 1
        cat_map[cat]["bookings"] += b.get("booking_count", 0)

    top_categories = sorted(cat_map.values(), key=lambda x: x["businesses"], reverse=True)[:10]

    return {
        "top_by_bookings": top_by_bookings,
        "top_by_rating": top_by_rating,
        "top_cities": top_cities,
        "top_categories": top_categories,
    }


# ============ ADMIN ALERTS ============

@router.get("/alerts")
async def get_admin_alerts(token_data: TokenData = Depends(require_admin)):
    """Get important admin alerts: pending businesses, low ratings, open tickets, etc."""
    alerts = []

    # Pending businesses
    pending_count = await db.businesses.count_documents({"status": BusinessStatus.PENDING})
    if pending_count > 0:
        alerts.append({
            "type": "pending_business",
            "severity": "warning",
            "title": f"{pending_count} negocio(s) pendiente(s) de aprobacion",
            "detail": "Hay negocios esperando revision.",
            "count": pending_count,
        })

    # Open support tickets
    open_tickets = await db.support_tickets.count_documents({"status": "open"})
    if open_tickets > 0:
        alerts.append({
            "type": "open_tickets",
            "severity": "warning" if open_tickets < 5 else "critical",
            "title": f"{open_tickets} ticket(s) de soporte abierto(s)",
            "detail": "Tickets pendientes de respuesta.",
            "count": open_tickets,
        })

    # 1-star reviews (last 7 days)
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    bad_reviews = await db.reviews.count_documents({"rating": {"$lte": 2}, "created_at": {"$gte": week_ago}})
    if bad_reviews > 0:
        alerts.append({
            "type": "bad_reviews",
            "severity": "info",
            "title": f"{bad_reviews} resena(s) negativa(s) esta semana",
            "detail": "Resenas con 1-2 estrellas en los ultimos 7 dias.",
            "count": bad_reviews,
        })

    # Subscriptions past_due
    past_due = await db.businesses.count_documents({"subscription_status": "past_due"})
    if past_due > 0:
        alerts.append({
            "type": "past_due_subs",
            "severity": "critical",
            "title": f"{past_due} suscripcion(es) vencida(s)",
            "detail": "Negocios con pago de suscripcion atrasado.",
            "count": past_due,
        })

    # Businesses without subscription (>7 days old)
    week_old = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    no_sub = await db.businesses.count_documents({
        "subscription_status": "none",
        "created_at": {"$lte": week_old}
    })
    if no_sub > 0:
        alerts.append({
            "type": "no_subscription",
            "severity": "info",
            "title": f"{no_sub} negocio(s) sin suscripcion activa (>7 dias)",
            "detail": "Negocios registrados hace mas de 7 dias sin pagar suscripcion.",
            "count": no_sub,
        })

    # Held payments
    held_count = await db.payment_transactions.count_documents({"on_hold": True})
    if held_count > 0:
        alerts.append({
            "type": "held_payments",
            "severity": "warning",
            "title": f"{held_count} pago(s) retenido(s)",
            "detail": "Pagos en espera de liberacion.",
            "count": held_count,
        })

    return {"alerts": alerts, "total": len(alerts)}


# ============ CITY MANAGEMENT ============

@router.get("/cities")
async def admin_get_cities(
    search: str = "", country_code: str = "", active_only: str = "",
    page: int = 1, limit: int = 50,
    token_data: TokenData = Depends(require_admin)
):
    """Get all cities with business counts and management info."""
    query = {}
    if country_code:
        query["country_code"] = country_code.upper()
    if active_only == "true":
        query["active"] = True
    elif active_only == "false":
        query["active"] = False
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"state": {"$regex": search, "$options": "i"}},
        ]
    total = await db.cities.count_documents(query)
    cities = await db.cities.find(query, {"_id": 0}).sort("name", 1).skip((page - 1) * limit).limit(limit).to_list(limit)

    # Enrich with business count
    for c in cities:
        biz_count = await db.businesses.count_documents({"city": c.get("name")})
        c["business_count"] = biz_count

    return {"cities": cities, "total": total, "page": page, "pages": max(1, (total + limit - 1) // limit)}


@router.put("/cities/{city_slug}/toggle")
async def toggle_city_active(city_slug: str, request: Request, active: bool = True, token_data: TokenData = Depends(require_admin)):
    """Activate or deactivate a city."""
    city = await db.cities.find_one({"slug": city_slug})
    if not city:
        raise HTTPException(status_code=404, detail="City not found")
    await db.cities.update_one({"slug": city_slug}, {"$set": {"active": active}})
    await create_audit_log(
        admin_id=token_data.user_id, admin_email=token_data.email,
        action=AuditAction.CITY_ACTIVATE if active else AuditAction.CITY_DEACTIVATE,
        target_type="city", target_id=city_slug,
        details={"city_name": city.get("name"), "active": active}, request=request
    )
    return {"message": f"City {'activated' if active else 'deactivated'}", "slug": city_slug, "active": active}



# ============ CUSTOM REPORTS ============

@router.get("/reports/custom")
async def get_custom_report(
    date_from: str = "", date_to: str = "",
    city: str = "", category: str = "",
    token_data: TokenData = Depends(require_admin)
):
    """Generate a custom report with filters."""
    now = datetime.now(timezone.utc)
    if not date_from:
        date_from = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    if not date_to:
        date_to = now.strftime("%Y-%m-%d")

    # Booking filter
    bk_filter = {"date": {"$gte": date_from, "$lte": date_to}}

    # Business filter for city/category
    biz_ids = None
    if city or category:
        biz_query = {}
        if city:
            biz_query["city"] = {"$regex": city, "$options": "i"}
        if category:
            biz_query["category"] = {"$regex": category, "$options": "i"}
        biz_docs = await db.businesses.find(biz_query, {"_id": 0, "id": 1}).to_list(5000)
        biz_ids = [b["id"] for b in biz_docs]
        bk_filter["business_id"] = {"$in": biz_ids}

    bookings = await db.bookings.find(bk_filter, {"_id": 0}).to_list(50000)

    total = len(bookings)
    completed = len([b for b in bookings if b.get("status") == "completed"])
    confirmed = len([b for b in bookings if b.get("status") == "confirmed"])
    cancelled = len([b for b in bookings if b.get("status") == "cancelled"])
    revenue = sum(b.get("deposit_amount", 0) for b in bookings if b.get("deposit_paid"))

    # Unique users and businesses
    unique_users = len(set(b.get("user_id", "") for b in bookings if b.get("user_id")))
    unique_businesses = len(set(b.get("business_id", "") for b in bookings if b.get("business_id")))

    # Daily breakdown
    from collections import Counter, defaultdict
    daily_counts = Counter()
    daily_revenue = defaultdict(float)
    for b in bookings:
        d = b.get("date", "")
        daily_counts[d] += 1
        if b.get("deposit_paid"):
            daily_revenue[d] += b.get("deposit_amount", 0)

    daily_chart = sorted([
        {"date": d, "bookings": daily_counts[d], "revenue": round(daily_revenue.get(d, 0), 2)}
        for d in set(list(daily_counts.keys()) + list(daily_revenue.keys()))
    ], key=lambda x: x["date"])

    # Top businesses in period
    biz_counts = Counter(b.get("business_id") for b in bookings if b.get("business_id"))
    top_biz = []
    for bid, cnt in biz_counts.most_common(10):
        biz = await db.businesses.find_one({"id": bid}, {"_id": 0, "name": 1, "city": 1})
        top_biz.append({"business_id": bid, "name": biz.get("name", "?") if biz else "?", "city": biz.get("city", "") if biz else "", "bookings": cnt})

    # Top cities in period
    city_map = defaultdict(int)
    for b in bookings:
        city_map[b.get("business_city", b.get("city", "?"))] += 1
    # Fallback: enrich from businesses
    if not any(v for v in city_map.values()):
        for b in bookings:
            bid = b.get("business_id")
            if bid:
                biz = await db.businesses.find_one({"id": bid}, {"_id": 0, "city": 1})
                if biz:
                    city_map[biz.get("city", "?")] += 1

    top_cities_report = [{"city": c, "bookings": n} for c, n in sorted(city_map.items(), key=lambda x: -x[1])[:10]]

    # New users in period
    new_users = await db.users.count_documents({
        "role": "user",
        "created_at": {"$gte": date_from + "T00:00:00", "$lte": date_to + "T23:59:59"}
    })
    new_businesses = await db.businesses.count_documents({
        "created_at": {"$gte": date_from + "T00:00:00", "$lte": date_to + "T23:59:59"}
    })

    return {
        "filters": {"date_from": date_from, "date_to": date_to, "city": city, "category": category},
        "summary": {
            "total_bookings": total,
            "completed": completed,
            "confirmed": confirmed,
            "cancelled": cancelled,
            "cancel_rate": round((cancelled / total * 100), 1) if total else 0,
            "revenue": round(revenue, 2),
            "unique_users": unique_users,
            "unique_businesses": unique_businesses,
            "new_users": new_users,
            "new_businesses": new_businesses,
        },
        "daily_chart": daily_chart,
        "top_businesses": top_biz,
        "top_cities": top_cities_report,
    }



# ============ STAFF MANAGEMENT ============

AVAILABLE_PERMISSIONS = [
    "overview", "businesses", "users", "reviews", "categories",
    "rankings", "cities", "config", "support", "reports",
    "subscriptions", "finance",
]

@router.get("/staff")
async def get_staff_list(token_data: TokenData = Depends(require_super_admin)):
    """List all staff members (Super Admin only)."""
    staff = await db.users.find(
        {"role": UserRole.STAFF},
        {"_id": 0, "password_hash": 0, "totp_secret": 0, "backup_codes": 0}
    ).sort("created_at", -1).to_list(100)
    return {"staff": staff, "available_permissions": AVAILABLE_PERMISSIONS}


@router.post("/staff")
async def create_staff(body: StaffCreate, request: Request, token_data: TokenData = Depends(require_super_admin)):
    """Create a new staff member (Super Admin only)."""
    existing = await db.users.find_one({"email": body.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already in use")

    # Validate permissions
    invalid = [p for p in body.permissions if p not in AVAILABLE_PERMISSIONS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid permissions: {invalid}")

    now = datetime.now(timezone.utc).isoformat()
    staff_doc = {
        "id": generate_id(),
        "email": body.email,
        "password_hash": hash_password(body.password),
        "full_name": body.full_name,
        "role": UserRole.STAFF,
        "role_label": body.role_label,
        "staff_permissions": body.permissions,
        "active": True,
        "totp_enabled": False,
        "email_verified": True,
        "created_at": now,
        "created_by": token_data.email,
    }
    await db.users.insert_one(staff_doc)

    await create_audit_log(
        admin_id=token_data.user_id, admin_email=token_data.email,
        action=AuditAction.STAFF_CREATE, target_type="staff",
        target_id=staff_doc["id"],
        details={"email": body.email, "permissions": body.permissions, "role_label": body.role_label},
        request=request
    )

    staff_doc.pop("_id", None)
    staff_doc.pop("password_hash", None)
    return staff_doc


@router.put("/staff/{staff_id}")
async def update_staff(staff_id: str, body: StaffUpdate, request: Request, token_data: TokenData = Depends(require_super_admin)):
    """Update a staff member (Super Admin only)."""
    staff = await db.users.find_one({"id": staff_id, "role": UserRole.STAFF})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    changes = {}
    if body.full_name is not None:
        changes["full_name"] = body.full_name
    if body.role_label is not None:
        changes["role_label"] = body.role_label
    if body.active is not None:
        changes["active"] = body.active
    if body.permissions is not None:
        invalid = [p for p in body.permissions if p not in AVAILABLE_PERMISSIONS]
        if invalid:
            raise HTTPException(status_code=400, detail=f"Invalid permissions: {invalid}")
        changes["staff_permissions"] = body.permissions

    if not changes:
        raise HTTPException(status_code=400, detail="No changes provided")

    await db.users.update_one({"id": staff_id}, {"$set": changes})

    await create_audit_log(
        admin_id=token_data.user_id, admin_email=token_data.email,
        action=AuditAction.STAFF_UPDATE, target_type="staff",
        target_id=staff_id, details=changes, request=request
    )

    updated = await db.users.find_one({"id": staff_id}, {"_id": 0, "password_hash": 0, "totp_secret": 0, "backup_codes": 0})
    return updated


@router.delete("/staff/{staff_id}")
async def delete_staff(staff_id: str, request: Request, token_data: TokenData = Depends(require_super_admin)):
    """Delete a staff member (Super Admin only)."""
    staff = await db.users.find_one({"id": staff_id, "role": UserRole.STAFF})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    await db.users.delete_one({"id": staff_id})

    await create_audit_log(
        admin_id=token_data.user_id, admin_email=token_data.email,
        action=AuditAction.STAFF_DELETE, target_type="staff",
        target_id=staff_id, details={"email": staff.get("email")}, request=request
    )
    return {"message": "Staff member deleted"}


@router.put("/staff/{staff_id}/reset-password")
async def reset_staff_password(staff_id: str, request: Request, token_data: TokenData = Depends(require_super_admin)):
    """Reset staff password to a temporary one (Super Admin only)."""
    staff = await db.users.find_one({"id": staff_id, "role": UserRole.STAFF})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    temp_password = f"Staff{generate_id()[:8]}!"
    await db.users.update_one({"id": staff_id}, {"$set": {"password_hash": hash_password(temp_password)}})

    return {"message": "Password reset", "temporary_password": temp_password}


@router.get("/staff/permissions")
async def get_available_permissions(token_data: TokenData = Depends(require_admin)):
    """Get list of available permissions."""
    return {"permissions": AVAILABLE_PERMISSIONS}


@router.get("/my-permissions")
async def get_my_permissions(token_data: TokenData = Depends(require_admin)):
    """Get current user's permissions (for staff UI rendering)."""
    if token_data.role == UserRole.ADMIN:
        return {"role": "admin", "permissions": AVAILABLE_PERMISSIONS + ["staff"], "is_super_admin": True}
    user = await db.users.find_one({"id": token_data.user_id}, {"_id": 0, "staff_permissions": 1, "role_label": 1})
    return {
        "role": "staff",
        "permissions": user.get("staff_permissions", []) if user else [],
        "role_label": user.get("role_label", "staff") if user else "staff",
        "is_super_admin": False,
    }



# ============ REASSIGN CATEGORY ============

@router.put("/businesses/{business_id}/reassign-category")
async def reassign_business_category(
    business_id: str, category_id: str, request: Request,
    token_data: TokenData = Depends(require_admin)
):
    """Reassign a business to a different category."""
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    category = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    old_cat_id = business.get("category_id", "")
    await db.businesses.update_one(
        {"id": business_id},
        {"$set": {
            "category_id": category_id,
            "category": category.get("name_es", ""),
        }}
    )
    await create_audit_log(
        admin_id=token_data.user_id, admin_email=token_data.email,
        action=AuditAction.BUSINESS_APPROVE, target_type="business",
        target_id=business_id,
        details={"action": "reassign_category", "old_category_id": old_cat_id, "new_category_id": category_id, "new_category_name": category.get("name_es")},
        request=request
    )
    return {"message": "Category reassigned", "new_category": category.get("name_es")}
