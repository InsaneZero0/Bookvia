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
    MAX_RESCHEDULES_PER_BOOKING, RESCHEDULE_CUTOFF_HOURS,
    VISIBLE_BUSINESS_FILTER, DEFAULT_MANAGER_PERMISSIONS,
    BOOKVIA_FEE_MXN, STRIPE_FEE_PERCENT_ESTIMATED, MIN_BUSINESS_COMMISSION_MXN,
)
from models.schemas import *
from schemas.booking import SlotStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bookings", tags=["Bookings"])


def is_exception_blocking(exc: dict, date_str: str, slot_start, slot_end) -> tuple:
    """Check if a worker exception blocks a given time slot.
    Returns (is_blocking: bool, reason: str|None)."""
    exc_start = exc.get("start_date", "")
    exc_end = exc.get("end_date", "")
    if not exc_start or not exc_end:
        return False, None
    # Check if date falls within exception range
    if not (exc_start <= date_str <= exc_end):
        return False, None
    # If exception has specific times, check overlap
    exc_start_time = exc.get("start_time")
    exc_end_time = exc.get("end_time")
    if exc_start_time and exc_end_time:
        slot_s = slot_start.strftime("%H:%M") if hasattr(slot_start, 'strftime') else str(slot_start)
        slot_e = slot_end.strftime("%H:%M") if hasattr(slot_end, 'strftime') else str(slot_end)
        if slot_s >= exc_end_time or slot_e <= exc_start_time:
            return False, None
    reason = exc.get("reason", exc.get("exception_type", "block"))
    return True, reason


async def send_pending_reminders():
    """Send reminders for bookings that are pending confirmation."""
    from services.email import send_appointment_reminder
    from services.sms import send_appointment_reminder_sms
    try:
        pending = await db.bookings.find(
            {"status": "confirmed", "reminder_sent": {"$ne": True}},
            {"_id": 0}
        ).to_list(200)
        count = 0
        for booking in pending:
            try:
                user = await db.users.find_one({"id": booking["user_id"]}, {"_id": 0, "email": 1, "full_name": 1, "phone": 1, "notify_email": 1, "notify_sms": 1})
                business = await db.businesses.find_one({"id": booking["business_id"]}, {"_id": 0, "name": 1, "address": 1})
                service = await db.services.find_one({"id": booking.get("service_id")}, {"_id": 0, "name": 1})
                if user and business:
                    if user.get("notify_email", True):
                        await send_appointment_reminder(
                            user_email=user["email"],
                            user_name=user.get("full_name", ""),
                            business_name=business.get("name", ""),
                            service_name=service.get("name", "") if service else "",
                            date=booking.get("date", ""),
                            time=booking.get("time", ""),
                            worker_name="",
                            business_address=business.get("address", "")
                        )
                    # Best-effort SMS reminder (respects notify_sms pref)
                    if user.get("notify_sms", True):
                        await send_appointment_reminder_sms(
                            phone=user.get("phone"),
                            user_name=user.get("full_name", ""),
                            business_name=business.get("name", ""),
                            date=booking.get("date", ""),
                            time=booking.get("time", "")
                        )
                    await db.bookings.update_one({"id": booking["id"]}, {"$set": {"reminder_sent": True}})
                    count += 1
            except Exception as e:
                logger.error(f"Error sending reminder for booking {booking.get('id')}: {e}")
        logger.info(f"Sent {count} pending reminders")
    except Exception as e:
        logger.error(f"Error in send_pending_reminders: {e}")


@router.get("/search-clients")
async def search_clients(
    q: str = "",
    token_data: TokenData = Depends(require_business)
):
    """Search past clients by name or phone for auto-fill in reception."""
    user = await db.users.find_one({"id": token_data.user_id}, {"_id": 0, "business_id": 1})
    if not user or not user.get("business_id"):
        raise HTTPException(status_code=404, detail="Business not found")
    
    business_id = user["business_id"]
    
    if not q or len(q) < 2:
        return []
    
    # Search in past bookings for this business
    regex_filter = {"$regex": q, "$options": "i"}
    bookings = await db.bookings.find(
        {
            "business_id": business_id,
            "$or": [
                {"client_name": regex_filter},
                {"client_phone": regex_filter},
                {"client_email": regex_filter},
            ]
        },
        {"_id": 0, "client_name": 1, "client_phone": 1, "client_email": 1}
    ).sort("created_at", -1).to_list(100)
    
    # Also search registered users who have booked with this business
    user_bookings = await db.bookings.find(
        {"business_id": business_id, "user_id": {"$exists": True}, "booked_by": {"$ne": "business"}},
        {"_id": 0, "user_id": 1}
    ).to_list(500)
    user_ids = list(set(b["user_id"] for b in user_bookings if b.get("user_id")))
    
    if user_ids:
        users = await db.users.find(
            {
                "id": {"$in": user_ids},
                "$or": [
                    {"full_name": regex_filter},
                    {"phone": regex_filter},
                    {"email": regex_filter},
                ]
            },
            {"_id": 0, "full_name": 1, "phone": 1, "email": 1}
        ).to_list(50)
    else:
        users = []
    
    # Deduplicate by name+phone
    seen = set()
    results = []
    
    for b in bookings:
        name = (b.get("client_name") or "").strip()
        phone = (b.get("client_phone") or "").strip()
        email = (b.get("client_email") or "").strip()
        if not name:
            continue
        key = f"{name.lower()}|{phone}"
        if key not in seen:
            seen.add(key)
            results.append({"name": name, "phone": phone, "email": email})
    
    for u in users:
        name = (u.get("full_name") or "").strip()
        phone = (u.get("phone") or "").strip()
        email = (u.get("email") or "").strip()
        if not name:
            continue
        key = f"{name.lower()}|{phone}"
        if key not in seen:
            seen.add(key)
            results.append({"name": name, "phone": phone, "email": email})
    
    return results[:20]


@router.get("/business/stats-detail")
async def get_business_stats_detail(
    stat_type: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    branch_id: Optional[str] = None,
    token_data: TokenData = Depends(require_business)
):
    """Get detailed bookings for a specific stat card.

    Optional `branch_id` narrows results to a single branch (multi-branch support).
    """
    user = await db.users.find_one({"id": token_data.user_id})
    if not user or not user.get("business_id"):
        raise HTTPException(status_code=404, detail="Business not found")
    
    business_id = user["business_id"]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    first_of_month = datetime.now(timezone.utc).replace(day=1).strftime("%Y-%m-%d")
    
    filters = {"business_id": business_id}
    if branch_id:
        filters["branch_id"] = branch_id
    
    if stat_type == "today":
        filters["date"] = today
        filters["status"] = AppointmentStatus.CONFIRMED
    elif stat_type == "pending":
        filters["status"] = AppointmentStatus.CONFIRMED
    elif stat_type == "revenue":
        filters["status"] = AppointmentStatus.COMPLETED
        if date_from and date_to:
            filters["date"] = {"$gte": date_from, "$lte": date_to}
        else:
            filters["date"] = {"$gte": first_of_month}
    elif stat_type == "total":
        filters["status"] = {"$in": [
            AppointmentStatus.CONFIRMED, 
            AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW
        ]}
        if date_from and date_to:
            filters["date"] = {"$gte": date_from, "$lte": date_to}
    else:
        raise HTTPException(status_code=400, detail="Invalid stat_type")
    
    bookings = await db.bookings.find(filters, {"_id": 0}).sort("date", -1).limit(200).to_list(200)
    
    # Populate names
    for b in bookings:
        user_doc = await db.users.find_one({"id": b.get("user_id")}, {"_id": 0, "full_name": 1})
        service_doc = await db.services.find_one({"id": b.get("service_id")}, {"_id": 0, "name": 1})
        worker_doc = await db.workers.find_one({"id": b.get("worker_id")}, {"_id": 0, "name": 1})
        b["user_name"] = user_doc.get("full_name") if user_doc else None
        b["service_name"] = service_doc.get("name") if service_doc else None
        b["worker_name"] = worker_doc.get("name") if worker_doc else None
    
    total_revenue = sum(b.get("total_amount", 0) for b in bookings) if stat_type == "revenue" else None
    
    return {
        "bookings": bookings,
        "count": len(bookings),
        "total_revenue": total_revenue
    }



@router.get("/availability/{business_id}", response_model=AvailabilityResponse)
async def get_availability(
    business_id: str,
    date: str,
    service_id: Optional[str] = None,
    worker_id: Optional[str] = None,
    include_unavailable: bool = False
):
    """
    Get available time slots for a business on a specific date.
    
    Args:
        business_id: The business ID
        date: Date in YYYY-MM-DD format
        service_id: Optional service ID to filter workers who can perform it
        worker_id: Optional worker ID to get availability for specific worker
        include_unavailable: If True, returns all slots with reasons for unavailability
    
    Returns:
        AvailabilityResponse with slots showing availability status and reasons
    """
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    business_tz_name = business.get("timezone", "America/Mexico_City")
    try:
        business_tz = pytz.timezone(business_tz_name)
    except pytz.UnknownTimeZoneError:
        business_tz = pytz.timezone("America/Mexico_City")
    
    # Get buffer time between appointments
    buffer_minutes = business.get("min_time_between_appointments", 0)
    
    # Check if business is closed on this date
    closure = await db.business_closures.find_one({
        "business_id": business_id, "date": date, "is_deleted": False
    })
    if closure:
        return AvailabilityResponse(
            date=date,
            business_timezone=business_tz_name,
            slots=[],
            available_count=0,
            total_workers=0
        )
    
    # Get service info
    service = None
    duration = 60
    allowed_workers = None
    
    if service_id:
        service = await db.services.find_one({"id": service_id})
        if service:
            duration = service.get("duration_minutes", 60)
            if service.get("allowed_worker_ids"):
                allowed_workers = service["allowed_worker_ids"]
    
    # Build worker filter
    worker_filter = {"business_id": business_id, "active": True}
    if worker_id:
        worker_filter["id"] = worker_id
    
    workers = await db.workers.find(worker_filter, {"_id": 0}).to_list(100)
    
    # Filter workers by service: check worker.service_ids contains the service
    if service_id:
        workers = [w for w in workers if not w.get("service_ids") or service_id in w.get("service_ids", [])]
    
    # Also filter by allowed_worker_ids from service model
    if allowed_workers:
        workers = [w for w in workers if w["id"] in allowed_workers]
    
    if not workers:
        return AvailabilityResponse(
            date=date,
            business_timezone=business_tz_name,
            slots=[],
            available_count=0,
            total_workers=0
        )
    
    # Get existing bookings for the date (HOLD and CONFIRMED)
    existing_bookings = await db.bookings.find({
        "business_id": business_id,
        "date": date,
        "status": {"$in": [AppointmentStatus.HOLD, AppointmentStatus.CONFIRMED]}
    }, {"_id": 0}).to_list(1000)
    
    # Parse date
    date_obj = datetime.strptime(date, "%Y-%m-%d")
    day_of_week = str(date_obj.weekday())
    
    # Get current time in business timezone for filtering past slots
    now_utc = datetime.now(timezone.utc)
    now_local = now_utc.astimezone(business_tz)
    is_today = date_obj.date() == now_local.date()
    
    slots_dict = {}  # time -> best slot info
    
    for worker in workers:
        schedule = worker.get("schedule", {}).get(day_of_week)
        
        # Check if worker is available this day
        if not schedule or not schedule.get("is_available", True):
            continue
        
        # Get all time blocks for this day
        blocks = schedule.get("blocks", [])
        if not blocks:
            # Legacy support: convert old format
            if schedule.get("start_time") and schedule.get("end_time"):
                blocks = [{"start_time": schedule["start_time"], "end_time": schedule["end_time"]}]
            else:
                continue
        
        for block in blocks:
            block_start = datetime.strptime(block["start_time"], "%H:%M")
            block_end = datetime.strptime(block["end_time"], "%H:%M")
            
            current_time = block_start
            while current_time + timedelta(minutes=duration) <= block_end:
                time_str = current_time.strftime("%H:%M")
                slot_end = current_time + timedelta(minutes=duration)
                end_time_str = slot_end.strftime("%H:%M")
                
                # Skip past slots if today
                if is_today:
                    slot_datetime = now_local.replace(
                        hour=current_time.hour,
                        minute=current_time.minute,
                        second=0,
                        microsecond=0
                    )
                    if slot_datetime <= now_local:
                        current_time += timedelta(minutes=30)
                        continue
                
                status = SlotStatus.AVAILABLE
                reason = None
                
                # Check exceptions (vacations/blocks)
                for exc in worker.get("exceptions", []):
                    is_blocking, exc_reason = is_exception_blocking(exc, date, current_time, slot_end)
                    if is_blocking:
                        status = SlotStatus.EXCEPTION
                        reason = exc_reason
                        break
                
                # Check existing bookings
                if status == SlotStatus.AVAILABLE:
                    for booking in existing_bookings:
                        if booking["worker_id"] == worker["id"]:
                            booking_start = datetime.strptime(booking["time"], "%H:%M")
                            booking_end = datetime.strptime(booking["end_time"], "%H:%M")
                            
                            # Add buffer to booking end
                            booking_end_with_buffer = booking_end + timedelta(minutes=buffer_minutes)
                            
                            # Check overlap (including buffer)
                            if not (slot_end <= booking_start or current_time >= booking_end_with_buffer):
                                if booking["status"] == AppointmentStatus.HOLD:
                                    status = SlotStatus.HOLD
                                    reason = "Reserva en proceso de pago"
                                else:
                                    status = SlotStatus.BOOKED
                                    reason = "Ocupado"
                                break
                            
                            # Check buffer before booking
                            if buffer_minutes > 0:
                                buffer_start = booking_start - timedelta(minutes=buffer_minutes)
                                if buffer_start < slot_end <= booking_start and current_time < booking_start:
                                    status = SlotStatus.BUFFER
                                    reason = f"Buffer de {buffer_minutes} min antes de cita"
                                    break
                
                # Store best slot for this time (prefer available)
                if time_str not in slots_dict:
                    slots_dict[time_str] = {
                        "time": time_str,
                        "end_time": end_time_str,
                        "status": status,
                        "reason": reason,
                        "worker_id": worker["id"] if status == SlotStatus.AVAILABLE else None,
                        "worker_name": worker["name"] if status == SlotStatus.AVAILABLE else None
                    }
                elif status == SlotStatus.AVAILABLE and slots_dict[time_str]["status"] != SlotStatus.AVAILABLE:
                    # This worker is available for this slot
                    slots_dict[time_str] = {
                        "time": time_str,
                        "end_time": end_time_str,
                        "status": status,
                        "reason": None,
                        "worker_id": worker["id"],
                        "worker_name": worker["name"]
                    }
                
                current_time += timedelta(minutes=30)  # 30 min intervals
    
    # Convert to list and sort
    all_slots = sorted(slots_dict.values(), key=lambda s: s["time"])
    
    # Filter if not including unavailable
    if not include_unavailable:
        all_slots = [s for s in all_slots if s["status"] == SlotStatus.AVAILABLE]
    
    available_count = len([s for s in all_slots if s["status"] == SlotStatus.AVAILABLE])
    
    return AvailabilityResponse(
        date=date,
        business_timezone=business_tz_name,
        slots=[AvailabilitySlot(**s) for s in all_slots],
        available_count=available_count,
        total_workers=len(workers)
    )



@router.post("/", response_model=BookingResponse)
async def create_booking(booking: BookingCreate, token_data: TokenData = Depends(require_auth)):
    # Check user limits (skip for business users)
    user = await db.users.find_one({"id": token_data.user_id})
    if token_data.role != UserRole.BUSINESS and user.get("active_appointments_count", 0) >= 5:
        raise HTTPException(status_code=400, detail="Maximum 5 active appointments allowed")
    
    # Check suspension
    if user.get("suspended_until"):
        suspended_until = datetime.fromisoformat(user["suspended_until"])
        if suspended_until > datetime.now(timezone.utc):
            raise HTTPException(status_code=403, detail="Account suspended")
    
    # Get business
    business = await db.businesses.find_one({"id": booking.business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    if business["status"] != BusinessStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Business is not accepting bookings")

    if not business.get("documents_verified", False):
        raise HTTPException(status_code=400, detail="El negocio aun no tiene sus documentos verificados por Bookvia")

    # Fase 10: hard-gate critical action on outdated T&C (after grace period)
    from routers.terms import require_terms_up_to_date
    await require_terms_up_to_date(token_data.user_id)

    if business.get("subscription_status") in ("canceled", "past_due", "unpaid"):
        raise HTTPException(status_code=400, detail="Business subscription is not active")

    # Phase A.2 — block bookings for businesses without an active Stripe Connect account.
    # Skip this check when the booking is created by the business itself (e.g. walk-in).
    # Controlled by ENFORCE_STRIPE_CONNECT_GATE env var (default OFF for testing).
    from models.enums import _stripe_connect_gate_enabled
    if (
        _stripe_connect_gate_enabled()
        and token_data.role != UserRole.BUSINESS
        and not business.get("stripe_connect_charges_enabled")
    ):
        raise HTTPException(
            status_code=400,
            detail="Este negocio aun no ha completado su registro de pagos. Intenta mas tarde."
        )
    
    # Check blacklist (skip for business users)
    if token_data.role != UserRole.BUSINESS and await is_user_blacklisted(booking.business_id, user_id=token_data.user_id):
        raise HTTPException(status_code=404, detail="Business not found")
    
    # Get service
    service = await db.services.find_one({"id": booking.service_id})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    # Get allowed workers for this service
    allowed_worker_ids = service.get("allowed_worker_ids", [])
    
    # Determine worker
    worker_id = booking.worker_id
    if not worker_id:
        # Auto-assign to worker with least appointments
        worker_filter = {"business_id": booking.business_id, "active": True}
        
        # If service has specific workers, filter by them
        if allowed_worker_ids:
            worker_filter["id"] = {"$in": allowed_worker_ids}
        
        workers = await db.workers.find(worker_filter).to_list(100)
        
        # Filter workers by service_ids (worker must offer this service)
        if booking.service_id:
            workers = [w for w in workers if not w.get("service_ids") or booking.service_id in w.get("service_ids", [])]
        
        if not workers:
            raise HTTPException(status_code=400, detail="No workers available for this service")
        
        # Parse booking date and time
        booking_date_str = booking.date
        booking_time_str = booking.time
        date_obj = datetime.strptime(booking_date_str, "%Y-%m-%d")
        day_of_week = str(date_obj.weekday())
        slot_start = datetime.strptime(booking_time_str, "%H:%M")
        slot_end = slot_start + timedelta(minutes=service["duration_minutes"])
        
        # Filter workers by availability on this specific slot
        eligible_workers = []
        for w in workers:
            # Check schedule
            schedule = w.get("schedule", {}).get(day_of_week)
            if not schedule or not schedule.get("is_available", True):
                continue
            
            # Check if slot falls within any block
            blocks = schedule.get("blocks", [])
            if not blocks:
                # Legacy support
                if schedule.get("start_time") and schedule.get("end_time"):
                    blocks = [{"start_time": schedule["start_time"], "end_time": schedule["end_time"]}]
            
            slot_in_schedule = False
            for block in blocks:
                block_start = datetime.strptime(block["start_time"], "%H:%M")
                block_end = datetime.strptime(block["end_time"], "%H:%M")
                if block_start <= slot_start and slot_end <= block_end:
                    slot_in_schedule = True
                    break
            
            if not slot_in_schedule:
                continue
            
            # Check exceptions
            is_blocked = False
            for exc in w.get("exceptions", []):
                blocking, _ = is_exception_blocking(exc, booking_date_str, slot_start, slot_end)
                if blocking:
                    is_blocked = True
                    break
            
            if is_blocked:
                continue
            
            eligible_workers.append(w)
        
        if not eligible_workers:
            raise HTTPException(status_code=400, detail="No workers available for this time slot")
        
        # Count appointments per eligible worker for this date (include HOLD status)
        worker_counts = {}
        for w in eligible_workers:
            count = await db.bookings.count_documents({
                "worker_id": w["id"],
                "date": booking.date,
                "status": {"$in": [AppointmentStatus.HOLD, AppointmentStatus.CONFIRMED]}
            })
            worker_counts[w["id"]] = count
        
        # Choose worker with least load
        worker_id = min(worker_counts, key=worker_counts.get)
    else:
        # Validate specific worker can perform this service
        if allowed_worker_ids and worker_id not in allowed_worker_ids:
            raise HTTPException(status_code=400, detail="Selected worker cannot perform this service")
    
    worker = await db.workers.find_one({"id": worker_id})
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    
    # Also check worker's own service_ids
    if worker.get("service_ids") and booking.service_id not in worker.get("service_ids", []):
        raise HTTPException(status_code=400, detail="Selected worker does not offer this service")
    
    if not worker.get("active", True):
        raise HTTPException(status_code=400, detail="Worker is not active")
    
    # Check if slot is already taken (including HOLD) with buffer consideration
    buffer_minutes = business.get("min_time_between_appointments", 0)
    start_time_dt = datetime.strptime(booking.time, "%H:%M")
    end_time_dt = start_time_dt + timedelta(minutes=service["duration_minutes"])
    
    # Get all bookings for this worker on this date
    existing_bookings = await db.bookings.find({
        "worker_id": worker_id,
        "date": booking.date,
        "status": {"$in": [AppointmentStatus.HOLD, AppointmentStatus.CONFIRMED]}
    }).to_list(100)
    
    for existing in existing_bookings:
        ex_start = datetime.strptime(existing["time"], "%H:%M")
        ex_end = datetime.strptime(existing["end_time"], "%H:%M")
        ex_end_with_buffer = ex_end + timedelta(minutes=buffer_minutes)
        
        # Check overlap with buffer
        if not (end_time_dt <= ex_start or start_time_dt >= ex_end_with_buffer):
            raise HTTPException(status_code=409, detail="Slot conflicts with existing booking")
    
    # Calculate deposit amount. Only charge deposit if business requires it
    # AND the service price is >= minimum deposit. Otherwise no deposit.
    business_deposit = float(business.get("deposit_amount") or 0)
    if business.get("requires_deposit") and business_deposit >= MIN_DEPOSIT_AMOUNT and service["price"] >= MIN_DEPOSIT_AMOUNT:
        deposit_amount = max(business_deposit, MIN_DEPOSIT_AMOUNT)
        # Cap deposit to service price (can't ask more than the service costs)
        deposit_amount = min(deposit_amount, float(service["price"]))
    else:
        deposit_amount = 0.0
    
    # Determine if this is a business-created booking (skip payment)
    is_biz_booking = booking.skip_payment and token_data.role == UserRole.BUSINESS
    now_iso = datetime.now(timezone.utc).isoformat()

    # Multi-branch: resolve branch_id BEFORE insert.
    # Validate ownership if client-provided (must belong to this business & be active);
    # otherwise fall back to the business's primary branch.
    resolved_branch_id = None
    if booking.branch_id:
        owned_branch = await db.branches.find_one({
            "id": booking.branch_id,
            "business_id": booking.business_id,
            "is_active": True,
        })
        if owned_branch:
            resolved_branch_id = owned_branch["id"]
    if not resolved_branch_id:
        primary = await db.branches.find_one({"business_id": booking.business_id, "is_primary": True})
        if primary:
            resolved_branch_id = primary["id"]

    if is_biz_booking:
        # Business creates booking: confirmed directly, no deposit needed
        booking_doc = {
            "id": generate_id(),
            "user_id": token_data.user_id,
            "business_id": booking.business_id,
            "service_id": booking.service_id,
            "worker_id": worker_id,
            "date": booking.date,
            "time": booking.time,
            "end_time": end_time_dt.strftime("%H:%M"),
            "duration_minutes": service["duration_minutes"],
            "status": AppointmentStatus.CONFIRMED,
            "notes": booking.notes,
            "is_home_service": booking.is_home_service,
            "address": booking.address,
            "deposit_amount": 0,
            "deposit_paid": True,
            "total_amount": service["price"],
            "transaction_id": None,
            "stripe_session_id": None,
            "hold_expires_at": None,
            "created_at": now_iso,
            "confirmed_at": now_iso,
            "cancelled_at": None,
            "cancelled_by": None,
            "cancellation_reason": None,
            "client_name": booking.client_name,
            "client_email": booking.client_email,
            "client_phone": booking.client_phone,
            "client_info": booking.client_info,
            "booked_by": "business",
            "branch_id": resolved_branch_id,
        }
    else:
        # Regular user: hold status, pending payment
        hold_expires_at = datetime.now(timezone.utc) + timedelta(minutes=HOLD_EXPIRATION_MINUTES)
        booking_doc = {
            "id": generate_id(),
            "user_id": token_data.user_id,
            "business_id": booking.business_id,
            "service_id": booking.service_id,
            "worker_id": worker_id,
            "date": booking.date,
            "time": booking.time,
            "end_time": end_time_dt.strftime("%H:%M"),
            "duration_minutes": service["duration_minutes"],
            "status": AppointmentStatus.HOLD,
            "notes": booking.notes,
            "is_home_service": booking.is_home_service,
            "address": booking.address,
            "deposit_amount": deposit_amount,
            "deposit_paid": False,
            "total_amount": service["price"],
            "transaction_id": None,
            "stripe_session_id": None,
            "hold_expires_at": hold_expires_at.isoformat(),
            "created_at": now_iso,
            "confirmed_at": None,
            "cancelled_at": None,
            "cancelled_by": None,
            "cancellation_reason": None,
            "branch_id": resolved_branch_id,
        }
    
    await db.bookings.insert_one(booking_doc)

    # Update user active appointments count
    await db.users.update_one(
        {"id": token_data.user_id},
        {"$inc": {"active_appointments_count": 1}}
    )
    
    # Notifications
    if is_biz_booking:
        await create_notification(
            business["user_id"],
            "Cita Registrada",
            f"Cita registrada para {booking.client_name or 'Cliente'} - {service['name']} el {booking.date} a las {booking.time}",
            "booking",
            {"booking_id": booking_doc["id"]}
        )
    else:
        await create_notification(
            business["user_id"],
            "Nueva Reserva (Pendiente de Pago)",
            f"Nueva reserva de {user['full_name']} para {service['name']} - Esperando pago del anticipo",
            "booking",
            {"booking_id": booking_doc["id"]}
        )
    
    booking_doc["business_name"] = business["name"]
    booking_doc["service_name"] = service["name"]
    booking_doc["worker_name"] = worker["name"]
    
    return BookingResponse(**booking_doc)



@router.get("/my", response_model=List[BookingResponse])
async def get_my_bookings(
    status: Optional[str] = None,
    upcoming: bool = True,
    token_data: TokenData = Depends(require_auth)
):
    filters = {"user_id": token_data.user_id}
    
    if status:
        filters["status"] = status
    
    if upcoming:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        filters["date"] = {"$gte": today}
    else:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        filters["date"] = {"$lt": today}
    
    bookings = await db.bookings.find(filters, {"_id": 0}).sort("date", 1).to_list(100)
    
    now = datetime.now(timezone.utc)
    
    # Populate names and calculate fields
    for b in bookings:
        business = await db.businesses.find_one({"id": b["business_id"]})
        service = await db.services.find_one({"id": b["service_id"]})
        worker = await db.workers.find_one({"id": b["worker_id"]})
        
        b["business_name"] = business["name"] if business else None
        b["business_slug"] = business.get("slug") if business else None
        b["service_name"] = service["name"] if service else None
        b["worker_name"] = worker["name"] if worker else None

        # Reschedule cutoff matches the business's cancellation window (1-72h).
        # Falls back to legacy days*24, or to the global default if not set.
        cutoff = None
        if business:
            ch = business.get("cancellation_hours")
            if isinstance(ch, (int, float)) and ch > 0:
                cutoff = int(ch)
            elif business.get("cancellation_days"):
                cutoff = int(business["cancellation_days"]) * 24
        if not cutoff:
            cutoff = RESCHEDULE_CUTOFF_HOURS
        b["reschedule_cutoff_hours"] = max(1, min(72, cutoff))
        
        # Check if already reviewed
        existing_review = await db.reviews.find_one({"booking_id": b["id"]})
        b["has_review"] = existing_review is not None

        # Attach refund-flow state (when business cancelled)
        if b.get("status") == AppointmentStatus.CANCELLED and b.get("cancelled_by") == "business":
            tx_for_refund = await db.transactions.find_one(
                {"booking_id": b["id"], "refund_amount": {"$gt": 0}},
                {"_id": 0, "refund_pending": 1, "refund_destination_choice": 1, "refund_amount": 1, "status": 1}
            )
            if tx_for_refund:
                b["refund_pending"] = bool(tx_for_refund.get("refund_pending"))
                b["refund_destination_choice"] = tx_for_refund.get("refund_destination_choice")
                b["refund_amount"] = float(tx_for_refund.get("refund_amount") or 0)
        
        # Calculate hours until appointment
        try:
            appointment_dt = datetime.strptime(f"{b['date']} {b['time']}", "%Y-%m-%d %H:%M")
            appointment_dt = appointment_dt.replace(tzinfo=timezone.utc)
            hours_diff = (appointment_dt - now).total_seconds() / 3600
            b["hours_until_appointment"] = round(hours_diff, 2)
            # Can cancel only if > 24h (for policy) or if still in HOLD
            b["can_cancel"] = hours_diff > 0 and (b["status"] in [AppointmentStatus.HOLD, AppointmentStatus.CONFIRMED])
        except:
            b["hours_until_appointment"] = None
            b["can_cancel"] = False
    
    return [BookingResponse(**b) for b in bookings]



@router.get("/business", response_model=List[BookingResponse])
async def get_business_bookings(
    date: Optional[str] = None,
    status: Optional[str] = None,
    branch_id: Optional[str] = None,
    token_data: TokenData = Depends(require_business)
):
    user = await db.users.find_one({"id": token_data.user_id})
    if not user or not user.get("business_id"):
        raise HTTPException(status_code=404, detail="Business not found")
    
    filters = {"business_id": user["business_id"]}
    if branch_id:
        filters["branch_id"] = branch_id
    
    if date:
        filters["date"] = date
    if status:
        filters["status"] = status
    
    bookings = await db.bookings.find(filters, {"_id": 0}).sort("date", 1).to_list(1000)
    
    now = datetime.now(timezone.utc)
    
    # Populate names
    for b in bookings:
        booking_user = await db.users.find_one({"id": b["user_id"]})
        service = await db.services.find_one({"id": b["service_id"]})
        worker = await db.workers.find_one({"id": b["worker_id"]})
        
        b["user_name"] = booking_user["full_name"] if booking_user else None
        b["user_email"] = booking_user.get("email") if booking_user else b.get("client_email")
        b["user_phone"] = booking_user.get("phone") if booking_user else b.get("client_phone")
        b["service_name"] = service["name"] if service else None
        b["worker_name"] = worker["name"] if worker else None
        
        # Calculate hours until appointment
        try:
            appointment_dt = datetime.strptime(f"{b['date']} {b['time']}", "%Y-%m-%d %H:%M")
            appointment_dt = appointment_dt.replace(tzinfo=timezone.utc)
            hours_diff = (appointment_dt - now).total_seconds() / 3600
            b["hours_until_appointment"] = round(hours_diff, 2)
            b["can_cancel"] = hours_diff > 0
        except:
            b["hours_until_appointment"] = None
            b["can_cancel"] = False
    
    return [BookingResponse(**b) for b in bookings]



@router.get("/policies")
async def get_booking_policies():
    """Public: return booking-related policies for UI display."""
    return {
        "max_reschedules_per_booking": MAX_RESCHEDULES_PER_BOOKING,
        "reschedule_cutoff_hours": RESCHEDULE_CUTOFF_HOURS,
        "grace_period_hours": 24,  # GRACE_PERIOD_HOURS
        "auto_complete_hours": 48,  # AUTO_COMPLETE_HOURS
        "min_deposit_amount": MIN_DEPOSIT_AMOUNT,
    }


@router.put("/{booking_id}/reschedule")
async def reschedule_booking(
    booking_id: str,
    new_date: str,
    new_time: str,
    token_data: TokenData = Depends(require_auth)
):
    booking = await db.bookings.find_one({"id": booking_id, "user_id": token_data.user_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    # Only confirmed or hold bookings can be rescheduled
    if booking.get("status") not in [AppointmentStatus.CONFIRMED, AppointmentStatus.HOLD]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reschedule booking in status '{booking.get('status')}'"
        )
    
    # Enforce reschedule limit (max 2 reschedules per booking)
    reschedule_count = int(booking.get("reschedule_count") or 0)
    if reschedule_count >= MAX_RESCHEDULES_PER_BOOKING:
        raise HTTPException(
            status_code=400,
            detail=f"Has alcanzado el limite de {MAX_RESCHEDULES_PER_BOOKING} reagendamientos para esta cita. Si necesitas cambiarla de nuevo, debes cancelarla."
        )
    
    # Enforce minimum cutoff: must be at least `cancellation_hours` before
    # the appointment. This mirrors the cancellation window the business
    # configured (1-72h), so clients can reschedule with the same lead time
    # they would need to cancel. Fallback to the global RESCHEDULE_CUTOFF_HOURS
    # if the business hasn't set anything.
    business_doc = await db.businesses.find_one(
        {"id": booking.get("business_id")},
        {"_id": 0, "cancellation_hours": 1, "cancellation_days": 1}
    ) or {}
    cutoff_hours = None
    ch = business_doc.get("cancellation_hours")
    if isinstance(ch, (int, float)) and ch > 0:
        cutoff_hours = int(ch)
    elif business_doc.get("cancellation_days"):
        cutoff_hours = int(business_doc["cancellation_days"]) * 24
    if not cutoff_hours:
        cutoff_hours = RESCHEDULE_CUTOFF_HOURS
    # Clamp to the same 1-72h band we enforce on cancellation_hours
    cutoff_hours = max(1, min(72, cutoff_hours))

    booking_datetime = datetime.strptime(f"{booking['date']} {booking['time']}", "%Y-%m-%d %H:%M")
    booking_datetime = booking_datetime.replace(tzinfo=timezone.utc)
    hours_until = (booking_datetime - datetime.now(timezone.utc)).total_seconds() / 3600

    if hours_until <= cutoff_hours:
        raise HTTPException(
            status_code=400,
            detail=f"No puedes reagendar con menos de {cutoff_hours} horas de anticipacion. Solo puedes cancelar."
        )

    # Validate new datetime is in the future and at least cutoff_hours away
    try:
        new_datetime = datetime.strptime(f"{new_date} {new_time}", "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha u hora invalido")

    if new_datetime <= datetime.now(timezone.utc) + timedelta(hours=1):
        raise HTTPException(status_code=400, detail="La nueva fecha debe ser al menos 1 hora en el futuro")
    
    # Calculate new end time
    service = await db.services.find_one({"id": booking["service_id"]})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    start_time = datetime.strptime(new_time, "%H:%M")
    end_time = start_time + timedelta(minutes=service["duration_minutes"])
    
    now_iso = datetime.now(timezone.utc).isoformat()
    history_entry = {
        "from_date": booking["date"],
        "from_time": booking["time"],
        "to_date": new_date,
        "to_time": new_time,
        "by": "user",
        "at": now_iso,
    }
    
    await db.bookings.update_one(
        {"id": booking_id},
        {
            "$set": {
                "date": new_date,
                "time": new_time,
                "end_time": end_time.strftime("%H:%M"),
                "appointment_date": f"{new_date}T{new_time}:00+00:00",
                "rescheduled_at": now_iso,
                "rescheduled_by": "user",
                "updated_at": now_iso,
            },
            "$inc": {"reschedule_count": 1},
            "$push": {"reschedule_history": history_entry},
        }
    )
    
    # Notify business
    business = await db.businesses.find_one({"id": booking["business_id"]})
    if business and business.get("user_id"):
        try:
            await create_notification(
                business["user_id"],
                "Cita reagendada por el cliente",
                f"El cliente reagendo su cita: {booking['date']} {booking['time']} -> {new_date} {new_time}",
                "booking",
                {"booking_id": booking_id, "old_date": booking["date"], "new_date": new_date}
            )
        except Exception as e:
            logger.error(f"Failed to send reschedule notification: {e}")
    
    return {
        "message": "Booking rescheduled",
        "reschedule_count": reschedule_count + 1,
        "remaining_reschedules": MAX_RESCHEDULES_PER_BOOKING - (reschedule_count + 1),
        "new_date": new_date,
        "new_time": new_time,
    }




@router.put("/{booking_id}/reschedule/business")
async def reschedule_booking_by_business(
    booking_id: str,
    req: RescheduleByBusinessRequest,
    token_data: TokenData = Depends(require_business)
):
    """Reschedule a booking by business owner - no 24h restriction, frees old slot"""
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    user = await db.users.find_one({"id": token_data.user_id})
    if not user or user.get("business_id") != booking["business_id"]:
        raise HTTPException(status_code=403, detail="Not your business booking")
    
    if booking["status"] not in [AppointmentStatus.CONFIRMED, AppointmentStatus.HOLD]:
        raise HTTPException(status_code=400, detail="Only confirmed or hold bookings can be rescheduled")
    
    # Get service duration
    service = await db.services.find_one({"id": booking["service_id"]})
    duration = service["duration_minutes"] if service else booking.get("duration_minutes", 60)
    
    # Calculate new end time
    start_dt = datetime.strptime(req.new_time, "%H:%M")
    end_dt = start_dt + timedelta(minutes=duration)
    new_end_time = end_dt.strftime("%H:%M")
    
    worker_id = req.new_worker_id or booking["worker_id"]
    
    # Check the new slot is available (exclude current booking)
    conflict = await db.bookings.find_one({
        "business_id": booking["business_id"],
        "worker_id": worker_id,
        "date": req.new_date,
        "status": {"$in": [AppointmentStatus.HOLD, AppointmentStatus.CONFIRMED]},
        "id": {"$ne": booking_id},
        "$or": [
            {"time": {"$lt": new_end_time}, "end_time": {"$gt": req.new_time}},
        ]
    })
    
    if conflict:
        raise HTTPException(status_code=409, detail="El horario seleccionado ya está ocupado")
    
    now = datetime.now(timezone.utc).isoformat()
    old_date = booking["date"]
    old_time = booking["time"]
    
    update_fields = {
        "date": req.new_date,
        "time": req.new_time,
        "end_time": new_end_time,
        "appointment_date": f"{req.new_date}T{req.new_time}:00+00:00",
        "rescheduled_at": now,
        "rescheduled_by": "business",
        "updated_at": now,
    }
    if req.new_worker_id:
        update_fields["worker_id"] = req.new_worker_id
    
    business_history_entry = {
        "from_date": old_date,
        "from_time": old_time,
        "to_date": req.new_date,
        "to_time": req.new_time,
        "by": "business",
        "at": now,
    }
    
    await db.bookings.update_one(
        {"id": booking_id},
        {
            "$set": update_fields,
            "$inc": {"business_reschedule_count": 1},
            "$push": {"reschedule_history": business_history_entry},
        }
    )
    
    # Notify client
    try:
        worker = await db.workers.find_one({"id": worker_id})
        worker_name = worker["name"] if worker else ""
        await create_notification(
            booking["user_id"],
            "Cita Reagendada",
            f"Tu cita del {old_date} a las {old_time} fue reagendada al {req.new_date} a las {req.new_time} con {worker_name}",
            "booking",
            {"booking_id": booking_id}
        )
    except Exception as e:
        logger.error(f"Reschedule notification error: {e}")
    
    logger.info(f"Business rescheduled booking {booking_id}: {old_date} {old_time} -> {req.new_date} {req.new_time}")
    
    # Log activity
    await create_business_activity(
        booking["business_id"], token_data, "reschedule_booking", "booking", booking_id,
        {"client_name": booking.get("client_name", ""), "service_name": booking.get("service_name", ""), "old_date": old_date, "old_time": old_time, "new_date": req.new_date, "new_time": req.new_time}
    )
    
    return {
        "message": "Cita reagendada exitosamente",
        "new_date": req.new_date,
        "new_time": req.new_time,
        "new_end_time": new_end_time
    }




@router.put("/{booking_id}/confirm")
async def confirm_booking(booking_id: str, token_data: TokenData = Depends(require_business)):
    user = await db.users.find_one({"id": token_data.user_id})
    booking = await db.bookings.find_one({"id": booking_id, "business_id": user.get("business_id")})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": AppointmentStatus.CONFIRMED}}
    )
    
    # Notify user
    await create_notification(
        booking["user_id"],
        "Reserva Confirmada",
        "Tu reserva ha sido confirmada",
        "booking",
        {"booking_id": booking_id}
    )
    
    return {"message": "Booking confirmed"}



@router.put("/{booking_id}/complete")
async def complete_booking(booking_id: str, token_data: TokenData = Depends(require_business)):
    user = await db.users.find_one({"id": token_data.user_id})
    booking = await db.bookings.find_one({"id": booking_id, "business_id": user.get("business_id")})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": AppointmentStatus.COMPLETED, "completed_at": datetime.now(timezone.utc).isoformat(), "completed_by": "business"}}
    )
    
    # Move associated transaction's funds_state from PENDING_HOLD to AVAILABLE (start 24h grace)
    try:
        tx = await db.transactions.find_one(
            {"booking_id": booking_id, "status": TransactionStatus.PAID},
            {"_id": 0}
        )
        if tx and tx.get("funds_state") == "pending_hold":
            from services.funds_state import mark_appointment_completed
            await mark_appointment_completed(tx["id"], actor="business", reason="Booking marked completed by business")
    except Exception as e:
        logger.error(f"Funds state -> AVAILABLE failed for booking {booking_id}: {e}")
    
    # Update business completed appointments
    await db.businesses.update_one(
        {"id": booking["business_id"]},
        {"$inc": {"completed_appointments": 1}}
    )
    
    # Update user active count
    await db.users.update_one(
        {"id": booking["user_id"]},
        {"$inc": {"active_appointments_count": -1}}
    )
    
    # Notify user to leave review (push + 24h grace explanation)
    await create_notification(
        booking["user_id"],
        "Deja tu opinion",
        "Tu cita ha sido completada. Tienes 24 horas para calificar o reportar cualquier problema.",
        "review",
        {"booking_id": booking_id, "business_id": booking["business_id"], "grace_period_hours": 24}
    )

    # Email client asking for explicit OK (accelerates payout for the business if confirmed)
    try:
        client = await db.users.find_one({"id": booking["user_id"]}, {"_id": 0, "email": 1, "full_name": 1, "notify_email": 1})
        if client and client.get("email") and client.get("notify_email", True):
            biz = await db.businesses.find_one({"id": booking["business_id"]}, {"_id": 0, "name": 1})
            service = await db.services.find_one({"id": booking.get("service_id")}, {"_id": 0, "name": 1}) if booking.get("service_id") else None
            from services.email import send_post_appointment_confirmation
            await send_post_appointment_confirmation(
                user_email=client["email"],
                user_name=client.get("full_name", "Cliente"),
                business_name=(biz or {}).get("name", "el negocio"),
                booking_id=booking_id,
                service_name=(service or {}).get("name", ""),
                date=booking.get("date", ""),
                time=booking.get("time", ""),
            )
    except Exception as e:
        logger.warning(f"Could not send post-appointment confirmation email: {e}")
    
    # Log activity
    await create_business_activity(
        booking["business_id"], token_data, "complete_booking", "booking", booking_id,
        {"client_name": booking.get("client_name", ""), "service_name": booking.get("service_name", ""), "date": booking.get("date", ""), "time": booking.get("time", "")}
    )
    
    return {"message": "Booking completed"}



@router.post("/{booking_id}/confirm-ok")
async def confirm_booking_ok(booking_id: str, token_data: TokenData = Depends(require_auth)):
    """Client confirms everything went well - immediately clears the funds.

    Skips the 24h grace window. Only allowed when:
      * Caller is the booking's client (owner).
      * Booking is in `completed` status.
      * Associated transaction is currently `funds_state=available`
        (i.e. business already marked the cita completed, grace not yet over).

    Side effects:
      * funds_state: available -> cleared (eligible for next day-20 settlement)
      * Booking gets `client_confirmed_ok_at` + `client_confirmation_method`
      * Notifies the business that the client confirmed satisfaction
    """
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("user_id") != token_data.user_id:
        raise HTTPException(status_code=403, detail="Not your booking")
    if booking.get("status") != AppointmentStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Solo puedes confirmar citas completadas")
    if booking.get("client_confirmed_ok_at"):
        return {"message": "Already confirmed", "already_confirmed": True}
    if booking.get("has_dispute"):
        raise HTTPException(status_code=400, detail="No puedes confirmar una cita con reporte abierto")

    # Find the paid transaction for this booking
    tx = await db.transactions.find_one(
        {"booking_id": booking_id, "status": TransactionStatus.PAID},
        {"_id": 0}
    )
    if not tx:
        raise HTTPException(status_code=400, detail="No hay pago asociado a esta cita")

    current_state = tx.get("funds_state")
    if current_state == "cleared":
        # Already cleared (e.g. grace already expired). Still record consent.
        pass
    elif current_state == "available":
        from services.funds_state import clear_now
        try:
            await clear_now(tx["id"], actor="client_confirm", reason="Client confirmed everything went well")
        except Exception as e:
            logger.error(f"Funds clear-now failed for tx {tx['id']}: {e}")
            raise HTTPException(status_code=500, detail="No se pudo liberar el pago en este momento")
    else:
        raise HTTPException(status_code=400, detail=f"Estado de fondos no permite confirmacion: {current_state}")

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "client_confirmed_ok_at": now_iso,
            "client_confirmation_method": "explicit",
        }}
    )

    # Notify business that the client gave the OK
    try:
        business = await db.businesses.find_one({"id": booking["business_id"]}, {"_id": 0, "user_id": 1, "name": 1})
        if business and business.get("user_id"):
            await create_notification(
                business["user_id"],
                "Cliente confirmo: todo bien",
                f"El cliente confirmo que la cita estuvo perfecta. Tu pago entrara en la proxima liquidacion del dia 20.",
                "client_confirmed_ok",
                {"booking_id": booking_id, "transaction_id": tx["id"]}
            )
    except Exception as e:
        logger.warning(f"Could not notify business of client confirmation: {e}")

    return {
        "message": "Confirmacion registrada. Tu negocio recibira el pago en la proxima liquidacion del dia 20.",
        "funds_state": "cleared",
        "confirmed_at": now_iso,
    }



@router.post("/{booking_id}/dispute")
async def dispute_booking(
    booking_id: str,
    body: dict = None,
    token_data: TokenData = Depends(require_auth)
):
    """
    Client raises a dispute for a completed booking.
    Marks the transaction's funds_state as DISPUTED (admin must resolve).
    Body: {"reason": "..."}
    """
    body = body or {}
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking["user_id"] != token_data.user_id:
        raise HTTPException(status_code=403, detail="Not your booking")
    
    if booking["status"] not in [AppointmentStatus.COMPLETED, AppointmentStatus.CONFIRMED]:
        raise HTTPException(status_code=400, detail="Only completed or confirmed bookings can be disputed")
    
    transaction = await db.transactions.find_one({"booking_id": booking_id, "status": TransactionStatus.PAID}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=400, detail="No paid transaction found for this booking")
    
    if transaction.get("funds_state") in {"refunded", "paid_out", "disputed"}:
        raise HTTPException(status_code=400, detail=f"Cannot dispute transaction in state {transaction.get('funds_state')}")
    
    reason = (body.get("reason") or "").strip() or "Cliente reporto un problema"
    try:
        from services.funds_state import mark_disputed
        await mark_disputed(transaction["id"], actor="client", reason=reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Mark booking with dispute flag
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"has_dispute": True, "dispute_reason": reason, "dispute_opened_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Notify business
    business = await db.businesses.find_one({"id": booking["business_id"]})
    if business and business.get("user_id"):
        await create_notification(
            business["user_id"],
            "Cliente reporto un problema",
            f"Un cliente ha reportado un problema con la cita. Razon: {reason[:80]}",
            "dispute",
            {"booking_id": booking_id, "reason": reason}
        )
    
    return {"message": "Dispute opened. Admin will review.", "funds_state": "disputed"}


# ────────────────────── FASE 6: Negocio cerrado ──────────────────────

NO_SHOW_RESPONSE_WINDOW_HOURS = 24    # Business has 24h to respond to a no-show report
NO_SHOW_AUTO_PROTECT_HOURS = 2        # If business responds within 2h with evidence, auto-recovery
NO_SHOW_COMPENSATION_MXN = 50.0       # Bonus paid to client after auto-refund


@router.post("/{booking_id}/no-show-business")
async def report_business_no_show(
    booking_id: str,
    body: dict = None,
    token_data: TokenData = Depends(require_auth),
):
    """
    Client reports that the business never opened / didn't attend the appointment.
    Creates a no_show_business strike in pending_review state and notifies the business.
    The business has 24h to respond with evidence; if no response, auto-resolve in
    favor of client (full refund + $50 compensation to wallet).
    """
    body = body or {}
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking["user_id"] != token_data.user_id:
        raise HTTPException(status_code=403, detail="Not your booking")
    if booking["status"] not in [AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED]:
        raise HTTPException(status_code=400, detail="Solo se puede reportar en citas confirmadas o completadas")
    if booking.get("no_show_report"):
        raise HTTPException(status_code=400, detail="Ya hay un reporte abierto para esta cita")
    
    # Time window: only allowed from 30min before appointment until 4h after
    booking_dt = datetime.strptime(f"{booking['date']} {booking['time']}", "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    delta_min = (now - booking_dt).total_seconds() / 60
    if delta_min < -30:
        raise HTTPException(status_code=400, detail="Solo puedes reportar desde 30 min antes de la cita")
    if delta_min > 240:  # 4h after
        raise HTTPException(status_code=400, detail="Ya pasaron mas de 4 horas; usa el boton de reportar problema")
    
    transaction = await db.transactions.find_one(
        {"booking_id": booking_id, "status": TransactionStatus.PAID}, {"_id": 0}
    )
    if not transaction:
        raise HTTPException(status_code=400, detail="No hay pago asociado a esta cita")
    if transaction.get("funds_state") in {"refunded", "paid_out"}:
        raise HTTPException(status_code=400, detail=f"No se puede reportar: estado={transaction.get('funds_state')}")
    
    description = (body.get("description") or "").strip()
    photo_url = (body.get("photo_url") or "").strip()
    
    # Issue pending_review strike
    from services.strikes import issue_strike
    try:
        strike = await issue_strike(
            business_id=booking["business_id"],
            reason="no_show_business",
            description=description or "Cliente reporto que el negocio no atendio",
            booking_id=booking_id,
            issued_by=f"client:{token_data.user_id}",
            metadata={
                "transaction_id": transaction["id"],
                "client_description": description,
                "photo_url": photo_url,
                "reported_at": now.isoformat(),
                "auto_resolve_at": (now + timedelta(hours=NO_SHOW_RESPONSE_WINDOW_HOURS)).isoformat(),
            },
            pending_review=True,
        )
    except Exception as e:
        logger.error(f"Failed to create no-show strike: {e}")
        raise HTTPException(status_code=500, detail="Error registrando el reporte")
    
    # Move funds to DISPUTED to freeze them
    try:
        from services.funds_state import mark_disputed
        if transaction.get("funds_state") in {"pending_hold", "available"}:
            await mark_disputed(transaction["id"], actor="client_no_show", reason=description or "Negocio no atendio")
    except Exception as e:
        logger.error(f"Funds state -> DISPUTED failed: {e}")
    
    # Mark the booking
    auto_resolve_at = (now + timedelta(hours=NO_SHOW_RESPONSE_WINDOW_HOURS)).isoformat()
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "no_show_report": {
                "reported_at": now.isoformat(),
                "description": description,
                "photo_url": photo_url,
                "strike_id": strike["id"],
                "auto_resolve_at": auto_resolve_at,
                "business_response": None,
                "resolved": False,
            }
        }}
    )
    
    # Notify business immediately (push)
    business = await db.businesses.find_one({"id": booking["business_id"]})
    if business and business.get("user_id"):
        try:
            await create_notification(
                business["user_id"],
                "URGENTE: Cliente reporto que no atendiste",
                f"Tienes 24h para responder con evidencia, de lo contrario se procesara reembolso automatico al cliente.",
                "no_show_report",
                {"booking_id": booking_id, "strike_id": strike["id"], "auto_resolve_at": auto_resolve_at}
            )
        except Exception as e:
            logger.error(f"Failed to send no-show notification: {e}")
    
    return {
        "message": "Reporte registrado. Bookvia notifico al negocio para que responda en 24h.",
        "auto_resolve_at": auto_resolve_at,
        "strike_id": strike["id"],
    }


@router.post("/{booking_id}/no-show-response")
async def respond_business_no_show(
    booking_id: str,
    body: dict,
    token_data: TokenData = Depends(require_business),
):
    """
    Business responds to a no-show report with evidence (photo + description).
    Body: {description, evidence_url}
    The strike stays in pending_review until admin reviews.
    """
    body = body or {}
    user = await db.users.find_one({"id": token_data.user_id})
    if not user or not user.get("business_id"):
        raise HTTPException(status_code=404, detail="Business not found")
    
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking["business_id"] != user["business_id"]:
        raise HTTPException(status_code=403, detail="Not your booking")
    
    report = booking.get("no_show_report")
    if not report:
        raise HTTPException(status_code=400, detail="No hay reporte abierto para esta cita")
    if report.get("resolved"):
        raise HTTPException(status_code=400, detail="El reporte ya fue resuelto")
    if report.get("business_response"):
        raise HTTPException(status_code=400, detail="Ya respondiste a este reporte")
    
    description = (body.get("description") or "").strip()
    evidence_url = (body.get("evidence_url") or "").strip()
    if len(description) < 10:
        raise HTTPException(status_code=400, detail="Describe tu version con al menos 10 caracteres")
    
    now = datetime.now(timezone.utc)
    response = {
        "responded_at": now.isoformat(),
        "description": description,
        "evidence_url": evidence_url,
    }
    
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"no_show_report.business_response": response}}
    )
    
    # Update strike metadata so admin can see business's evidence
    if report.get("strike_id"):
        await db.business_strikes.update_one(
            {"id": report["strike_id"]},
            {"$set": {"metadata.business_response": response}}
        )
    
    # Notify admin queue: the strike is in pending_review and now has business response
    return {
        "message": "Respuesta registrada. Bookvia revisara el caso y se pondra en contacto contigo.",
        "responded_at": response["responded_at"],
    }


async def _process_no_show_report(booking: dict) -> bool:
    """
    Process a single no-show report whose 24h window has elapsed.
    If business did NOT respond -> auto-resolve in favor of client (refund + $50 compensation).
    If business responded -> leave for admin review (return False).
    Returns True if auto-resolved.
    """
    report = booking.get("no_show_report") or {}
    if report.get("resolved"):
        return False
    if report.get("business_response"):
        # Business responded; leave pending for admin
        return False
    
    booking_id = booking["id"]
    business_id = booking["business_id"]
    user_id = booking["user_id"]
    
    transaction = await db.transactions.find_one(
        {"booking_id": booking_id, "status": TransactionStatus.PAID}, {"_id": 0}
    )
    if not transaction:
        return False
    
    now_iso = datetime.now(timezone.utc).isoformat()
    
    # 1) Refund client_paid (or business_amount + bookvia_fee) to wallet (avoids Stripe fee loss)
    try:
        from services.wallet import credit_wallet, CREDIT_BUSINESS_NO_SHOW
        client_paid = float(transaction.get("client_paid") or transaction.get("amount_total") or 0)
        if client_paid > 0:
            await credit_wallet(
                user_id=user_id,
                amount=client_paid,
                tx_type=CREDIT_BUSINESS_NO_SHOW,
                booking_id=booking_id,
                description="Reembolso completo: el negocio no atendio tu cita",
            )
        # 2) Compensation $50 to client wallet
        await credit_wallet(
            user_id=user_id,
            amount=NO_SHOW_COMPENSATION_MXN,
            tx_type=CREDIT_BUSINESS_NO_SHOW,
            booking_id=booking_id,
            description="Compensacion de Bookvia por inconveniente",
        )
    except Exception as e:
        logger.error(f"No-show wallet refund failed for booking {booking_id}: {e}")
    
    # 3) Mark transaction REFUNDED
    try:
        from services.funds_state import mark_refunded
        if transaction.get("funds_state") in {"pending_hold", "available", "disputed"}:
            await mark_refunded(transaction["id"], actor="auto_no_show", reason="Auto-resolved: business no-show, refund to client wallet")
    except Exception as e:
        logger.error(f"Funds state -> REFUNDED failed: {e}")
    
    await db.transactions.update_one(
        {"id": transaction["id"]},
        {"$set": {
            "status": TransactionStatus.REFUND_FULL,
            "refund_amount": float(transaction.get("client_paid") or 0),
            "refund_to": "wallet",
            "refund_reason": "auto_no_show_business",
            "wallet_credited": True,
            "cancelled_by": "system_no_show",
            "updated_at": now_iso,
        }}
    )
    
    # 4) Apply the strike (uphold in favor of client)
    if report.get("strike_id"):
        try:
            from services.strikes import resolve_pending_strike
            await resolve_pending_strike(
                report["strike_id"],
                outcome="upheld",
                resolved_by="system_auto_no_show",
                reason="Business did not respond within 24h",
            )
        except Exception as e:
            logger.error(f"Failed to uphold strike {report.get('strike_id')}: {e}")
    
    # 5) Mark booking
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "status": AppointmentStatus.CANCELLED,
            "cancelled_by": "system_no_show",
            "cancellation_reason": "Business did not attend",
            "no_show_report.resolved": True,
            "no_show_report.resolved_at": now_iso,
            "no_show_report.outcome": "auto_refund",
            "updated_at": now_iso,
        }}
    )
    
    # 6) Notifications
    try:
        client_refund = float(transaction.get("client_paid") or 0)
        total_received = client_refund + NO_SHOW_COMPENSATION_MXN
        await create_notification(
            user_id,
            "Reembolso procesado",
            f"El negocio no respondio a tu reporte. Te depositamos ${client_refund:.2f} + ${NO_SHOW_COMPENSATION_MXN:.0f} de compensacion (total ${total_received:.2f}) en tu saldo Bookvia.",
            "refund",
            {"booking_id": booking_id, "amount": total_received}
        )
        biz = await db.businesses.find_one({"id": business_id})
        if biz and biz.get("user_id"):
            await create_notification(
                biz["user_id"],
                "Strike aplicado por no atender cliente",
                "No respondiste al reporte en 24h. Se aplico strike y se reembolso al cliente.",
                "strike",
                {"booking_id": booking_id, "strike_id": report.get("strike_id")}
            )
    except Exception as e:
        logger.error(f"Failed to send no-show resolution notifications: {e}")
    
    logger.info(f"[No-show] Auto-resolved booking={booking_id} biz={business_id}: refund + $50 compensation")
    return True


async def process_expired_no_show_reports() -> int:
    """Cron task: auto-resolve no-show reports whose 24h window elapsed without business response."""
    now_iso = datetime.now(timezone.utc).isoformat()
    expired = await db.bookings.find(
        {
            "no_show_report.resolved": False,
            "no_show_report.business_response": None,
            "no_show_report.auto_resolve_at": {"$lte": now_iso},
        },
        {"_id": 0}
    ).to_list(500)
    
    resolved = 0
    for booking in expired:
        try:
            if await _process_no_show_report(booking):
                resolved += 1
        except Exception as e:
            logger.error(f"Auto-resolve no-show failed for {booking.get('id')}: {e}")
    
    if resolved > 0:
        logger.info(f"No-show: auto-resolved {resolved} expired reports")
    return resolved


@router.put("/{booking_id}/cancel/user")
async def cancel_booking_by_user(
    booking_id: str,
    cancel_req: CancelBookingRequest,
    token_data: TokenData = Depends(require_auth)
):
    """Cancel booking by user - applies cancellation policy"""
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    if booking["user_id"] != token_data.user_id:
        raise HTTPException(status_code=403, detail="Not your booking")
    
    if booking["status"] not in [AppointmentStatus.HOLD, AppointmentStatus.CONFIRMED]:
        raise HTTPException(status_code=400, detail=f"Cannot cancel booking with status {booking['status']}")
    
    now = datetime.now(timezone.utc)
    
    # Calculate hours until appointment
    appointment_dt = datetime.strptime(f"{booking['date']} {booking['time']}", "%Y-%m-%d %H:%M")
    appointment_dt = appointment_dt.replace(tzinfo=timezone.utc)
    hours_until = (appointment_dt - now).total_seconds() / 3600
    
    # Get transaction if exists
    transaction = await db.transactions.find_one({
        "booking_id": booking_id,
        "status": TransactionStatus.PAID
    })
    
    refund_result = None
    refund_to = (cancel_req.refund_to or "card").lower()
    if refund_to not in ("card", "wallet"):
        refund_to = "card"
    
    if transaction:
        # Apply business-defined cancellation policy (Phase O).
        # Each business sets cancellation_hours (1-72). Falls back to
        # cancellation_days * 24 for legacy records, or 24h as global default.
        biz_doc = await db.businesses.find_one({"id": booking["business_id"]}, {"cancellation_hours": 1, "cancellation_days": 1})
        cancel_window = None
        if biz_doc:
            ch = biz_doc.get("cancellation_hours")
            if isinstance(ch, (int, float)) and ch:
                cancel_window = int(ch)
            elif biz_doc.get("cancellation_days"):
                cancel_window = int(biz_doc["cancellation_days"]) * 24
        if not cancel_window:
            cancel_window = 24
        # Clamp to the same 1-72 hour range used in registration
        cancel_window = max(1, min(72, cancel_window))

        if hours_until > cancel_window:
            # Within the business's cancellation window: refund the deposit
            # minus the 8.5% processing fee.
            refund_amount = float(transaction.get("business_amount") or transaction.get("payout_amount") or 0)
            refund_status = TransactionStatus.REFUND_PARTIAL
            refund_reason = f"client_cancel_gt_window_{cancel_window}h_{refund_to}"

            logger.info(f"Partial refund (${refund_amount}) for booking {booking_id} -> {refund_to} (window {cancel_window}h)")
        else:
            # Past the cancellation window: no refund (business keeps the deposit)
            refund_amount = 0
            refund_status = TransactionStatus.REFUND_PARTIAL
            refund_reason = f"client_cancel_lt_window_{cancel_window}h"
            refund_to = "card"  # Force card so we don't credit wallet for $0

            logger.info(f"No refund (<{cancel_window}h): booking {booking_id}")
        
        # If client chose wallet refund and we have an amount > 0:
        # do NOT issue a Stripe refund (saves the unrecoverable Stripe fee).
        # Instead, credit the wallet immediately with the refund amount.
        wallet_credited = False
        stripe_refund_id = None
        if refund_to == "wallet" and refund_amount > 0:
            try:
                from services.wallet import credit_wallet, CREDIT_CANCELLATION
                await credit_wallet(
                    user_id=token_data.user_id,
                    amount=refund_amount,
                    tx_type=CREDIT_CANCELLATION,
                    booking_id=booking_id,
                    description=f"Cancelacion de cita - reembolso a saldo Bookvia",
                )
                wallet_credited = True
            except Exception as e:
                logger.error(f"Wallet credit failed for booking {booking_id}: {e}")
                # Fall back to card refund
                refund_to = "card"

        # If client chose card refund: emit a REAL Stripe.Refund.create.
        # Any portion of the refund that exceeds what was actually charged
        # on the card (because wallet was partially used) falls back to
        # wallet automatically - Stripe cannot push money into a wallet.
        if refund_to == "card" and refund_amount > 0:
            try:
                from services.stripe_refunds import issue_stripe_refund
                res = await issue_stripe_refund(
                    transaction=transaction,
                    amount_mxn=refund_amount,
                    reason="user_cancellation_gt_24h",
                    metadata={"cancelled_by": "user"},
                    actor="user_cancel",
                )
                stripe_refund_id = res.get("stripe_refund_id")
                surplus = float(res.get("surplus_to_wallet") or 0)
                if surplus > 0:
                    # The card portion was smaller than the refund; credit
                    # the remainder back to the wallet so the client is
                    # made whole.
                    from services.wallet import credit_wallet, CREDIT_CANCELLATION
                    await credit_wallet(
                        user_id=token_data.user_id,
                        amount=surplus,
                        tx_type=CREDIT_CANCELLATION,
                        booking_id=booking_id,
                        description="Cancelacion (excedente a saldo porque parte se pago con saldo)",
                    )
                    wallet_credited = True
            except Exception as e:
                logger.error(f"Stripe refund failed for booking {booking_id}: {e}")
                # Degrade gracefully: credit the wallet so the client does
                # not lose the money, and flag for admin intervention.
                try:
                    from services.wallet import credit_wallet, CREDIT_CANCELLATION
                    await credit_wallet(
                        user_id=token_data.user_id,
                        amount=refund_amount,
                        tx_type=CREDIT_CANCELLATION,
                        booking_id=booking_id,
                        description="Cancelacion (reembolso a tarjeta fallo - temporalmente a saldo)",
                    )
                    wallet_credited = True
                    refund_to = "wallet_fallback"
                except Exception as e2:
                    logger.error(f"Fallback wallet credit also failed: {e2}")
                    raise HTTPException(status_code=502, detail="No se pudo emitir el reembolso; contacta a soporte")
        
        # Update transaction
        await db.transactions.update_one(
            {"id": transaction["id"]},
            {"$set": {
                "status": refund_status,
                "refund_amount": refund_amount,
                "refund_reason": refund_reason,
                "refund_to": refund_to,
                "wallet_credited": wallet_credited,
                "stripe_refund_id": stripe_refund_id,
                "cancelled_by": "user",
                "updated_at": now.isoformat()
            }}
        )
        
        # Funds state: if money was refunded (full or partial >0) move to REFUNDED;
        # if no refund (<24h), keep money flowing -> AVAILABLE so it can clear normally.
        try:
            from services.funds_state import mark_refunded, mark_appointment_completed
            if refund_amount > 0:
                await mark_refunded(transaction["id"], actor="user_cancel", reason=refund_reason)
            else:
                # Past the cancellation window: treat as no-show/completed for the business
                if transaction.get("funds_state") == "pending_hold":
                    await mark_appointment_completed(
                        transaction["id"], actor=f"user_cancel_lt_{cancel_window}h",
                        reason=f"Late cancellation past {cancel_window}h window - business retains deposit"
                    )
        except Exception as e:
            logger.error(f"Funds state on user cancel failed: {e}")
        
        # Create ledger entries for refund (if within cancellation window)
        if hours_until > cancel_window and refund_amount > 0:
            updated_tx = {**transaction, "refund_amount": refund_amount, "refund_to": refund_to}
            await create_transaction_ledger_entries(updated_tx, TransactionStatus.REFUND_PARTIAL)

        refund_result = {
            "refund_amount": refund_amount,
            "refund_to": refund_to,
            "wallet_credited": wallet_credited,
            "cancellation_window_hours": cancel_window,
            "policy_applied": f">{cancel_window}h partial refund" if hours_until > cancel_window else f"<={cancel_window}h no refund"
        }
    
    # Update booking
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "status": AppointmentStatus.CANCELLED,
            "cancelled_at": now.isoformat(),
            "cancelled_by": "user",
            "cancellation_reason": cancel_req.reason
        }}
    )
    
    # Update user stats
    await db.users.update_one(
        {"id": token_data.user_id},
        {"$inc": {"active_appointments_count": -1, "cancellation_count": 1}}
    )
    
    # Check suspension threshold (4 cancellations)
    user = await db.users.find_one({"id": token_data.user_id})
    if user.get("cancellation_count", 0) >= 4:
        suspended_until = (now + timedelta(days=15)).isoformat()
        await db.users.update_one(
            {"id": token_data.user_id},
            {"$set": {"suspended_until": suspended_until}}
        )
        logger.warning(f"User {token_data.user_id} suspended for excessive cancellations")
    
    # Notify business
    business = await db.businesses.find_one({"id": booking["business_id"]})
    if business:
        await create_notification(
            business["user_id"],
            "Reserva Cancelada",
            f"El cliente canceló su cita del {booking['date']} a las {booking['time']}",
            "booking",
            {"booking_id": booking_id}
        )
    
    # Send cancellation email to business owner (respects notify_email pref)
    try:
        if business and business.get("notify_email", True):
            service = await db.services.find_one({"id": booking.get("service_id")})
            from services.email import send_booking_cancelled
            await send_booking_cancelled(
                user_email=business["email"],
                user_name=business["name"],
                business_name=business["name"],
                service_name=service["name"] if service else "Servicio",
                date=booking["date"],
                time=booking["time"],
                reason=f"Cancelada por el cliente. Motivo: {cancel_req.reason or 'No especificado'}"
            )
    except Exception as e:
        logger.error(f"Error sending cancellation email to business: {e}")
    
    # Best-effort SMS to business owner (respects notify_sms pref)
    if business and business.get("notify_sms", True):
        from services.sms import send_booking_cancelled_sms
        await send_booking_cancelled_sms(
            phone=business.get("phone"),
            user_name=business["name"],
            business_name=business["name"],
            date=booking["date"],
            time=booking["time"],
            reason="Cancelada por el cliente"
        )
    
    return {
        "message": "Booking cancelled",
        "status": AppointmentStatus.CANCELLED,
        "refund": refund_result
    }



@router.post("/{booking_id}/refund-choice")
async def refund_choice(
    booking_id: str,
    payload: dict,
    token_data: TokenData = Depends(require_auth),
):
    """Client picks where to receive the refund when the business cancelled.

    Body: { "destination": "wallet" | "card" }

      * wallet -> credits the user's Bookvia wallet immediately and marks
        the transaction as refunded (NO admin action needed). Money lands
        in the wallet within seconds.
      * card   -> stays in the admin queue. Admin issues the Stripe refund
        from /admin > Reembolsos (5-10 business days for the bank to push
        the money back to the card).
    """
    destination = (payload or {}).get("destination")
    if destination not in ("wallet", "card"):
        raise HTTPException(status_code=400, detail="destination must be 'wallet' or 'card'")

    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("user_id") != token_data.user_id:
        raise HTTPException(status_code=403, detail="Not your booking")
    if booking.get("cancelled_by") != "business":
        raise HTTPException(status_code=400, detail="Esta opcion solo aplica cuando el negocio cancelo la reserva")

    tx = await db.transactions.find_one(
        {"booking_id": booking_id, "refund_pending": True, "refund_destination_choice": "pending"},
        {"_id": 0}
    )
    if not tx:
        raise HTTPException(status_code=400, detail="No hay reembolso pendiente para esta reserva o ya elegiste")

    amount = float(tx.get("refund_amount") or tx.get("amount_total") or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Monto invalido")
    now = datetime.now(timezone.utc)

    if destination == "wallet":
        # Credit wallet immediately + mark refunded (no admin action)
        from services.wallet import credit_wallet, CREDIT_CANCELLATION
        await credit_wallet(
            user_id=token_data.user_id,
            amount=amount,
            tx_type=CREDIT_CANCELLATION,
            booking_id=booking_id,
            description="Reembolso por cancelacion del negocio (saldo Bookvia - eleccion del cliente)",
        )
        await db.transactions.update_one(
            {"id": tx["id"]},
            {"$set": {
                "status": TransactionStatus.REFUND_FULL,
                "refund_destination_choice": "wallet",
                "refund_destination": "wallet",
                "refund_pending": False,
                "refund_issued_at": now.isoformat(),
                "refund_issued_by": f"client_wallet_choice:{token_data.user_id}",
                "updated_at": now.isoformat(),
            }},
        )
        try:
            updated_tx = {**tx, "refund_amount": amount}
            await create_transaction_ledger_entries(updated_tx, TransactionStatus.REFUND_FULL)
        except Exception as e:
            logger.error(f"Ledger on wallet refund failed: {e}")
        try:
            from services.funds_state import mark_refunded
            await mark_refunded(tx["id"], actor="client_wallet_choice", reason="Client chose wallet refund after business cancellation")
        except Exception as e:
            logger.error(f"Funds state on wallet refund failed: {e}")
        return {
            "status": "ok",
            "destination": "wallet",
            "amount": amount,
            "message": "Saldo acreditado a tu wallet Bookvia",
        }

    # destination == "card" -> moves to admin queue
    await db.transactions.update_one(
        {"id": tx["id"]},
        {"$set": {
            "refund_destination_choice": "card",
            "refund_destination": "card",
            "updated_at": now.isoformat(),
        }},
    )
    # Alert admins now that the queue has a new card-refund to process
    try:
        admins = await db.users.find({"role": "admin"}, {"id": 1, "_id": 0}).to_list(50)
        for adm in admins:
            await create_notification(
                adm["id"],
                "Reembolso a tarjeta pendiente",
                f"El cliente eligio recibir reembolso en tarjeta para la reserva {booking_id}. Emitelo desde Admin > Reembolsos.",
                "admin_alert",
                {"booking_id": booking_id, "transaction_id": tx["id"], "amount": amount},
            )
    except Exception as e:
        logger.error(f"Failed to alert admins of card refund choice: {e}")

    return {
        "status": "ok",
        "destination": "card",
        "amount": amount,
        "message": "Solicitud enviada al admin. El reembolso aparecera en tu tarjeta en 5-10 dias habiles.",
    }


@router.get("/{booking_id}/cancellation-preview")
async def cancellation_preview(booking_id: str, token_data: TokenData = Depends(require_auth)):
    """Return what will happen if this booking is cancelled NOW.

    Both the client and the business can call this to display an upfront
    summary in the confirmation dialog before they actually trigger the
    cancellation. The exact numbers shown here must match what the real
    cancellation endpoints will apply.
    """
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    user = await db.users.find_one({"id": token_data.user_id}, {"_id": 0, "business_id": 1, "role": 1})
    is_owner_client = booking.get("user_id") == token_data.user_id
    is_owner_business = bool(user and user.get("business_id") == booking.get("business_id"))
    if not (is_owner_client or is_owner_business):
        raise HTTPException(status_code=403, detail="Not your booking")

    role = "business" if is_owner_business else "client"
    if booking.get("status") not in [AppointmentStatus.HOLD, AppointmentStatus.CONFIRMED]:
        raise HTTPException(status_code=400, detail=f"No se puede cancelar (estado actual: {booking.get('status')})")

    tx = await db.transactions.find_one(
        {"booking_id": booking_id, "status": TransactionStatus.PAID},
        {"_id": 0}
    )

    # Hours until appointment (used by client policy)
    try:
        appt_dt = datetime.strptime(f"{booking['date']} {booking['time']}", "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
        hours_until = max(0.0, (appt_dt - datetime.now(timezone.utc)).total_seconds() / 3600)
    except Exception:
        hours_until = None

    # Business cancellation window (1-72h) — same as cancellation_hours
    biz = await db.businesses.find_one({"id": booking["business_id"]}, {"_id": 0, "cancellation_hours": 1, "cancellation_days": 1, "pending_balance": 1}) or {}
    cutoff = None
    ch = biz.get("cancellation_hours")
    if isinstance(ch, (int, float)) and ch > 0:
        cutoff = int(ch)
    elif biz.get("cancellation_days"):
        cutoff = int(biz["cancellation_days"]) * 24
    cutoff = max(1, min(72, cutoff or 24))

    response = {
        "booking_id": booking_id,
        "role": role,
        "has_paid_transaction": bool(tx),
        "hours_until_appointment": round(hours_until, 2) if hours_until is not None else None,
        "cutoff_hours": cutoff,
    }

    if not tx:
        # Free booking — no money involved
        response["summary"] = {
            "title_es": "Esta reserva no tiene pago asociado",
            "title_en": "This booking has no payment attached",
            "lines_es": ["No hay reembolso porque no hubo cobro."],
            "lines_en": ["No refund since there was no charge."],
        }
        return response

    client_paid = float(tx.get("amount_total") or 0)
    deposit = float(tx.get("deposit_amount") or 0)
    if not deposit:
        deposit = max(0.0, client_paid - float(BOOKVIA_FEE_MXN))
    # The client's real out-of-pocket is the deposit + Bookvia fee. Some legacy
    # transactions store `amount_total` as only the deposit, so we recompute
    # explicitly here to make sure the refund total shown to the user matches
    # what they really paid (deposit + $8 fee).
    if deposit > 0 and client_paid < (deposit + float(BOOKVIA_FEE_MXN)) - 0.5:
        client_paid = round(deposit + float(BOOKVIA_FEE_MXN), 2)
    business_payout = float(tx.get("payout_amount") or 0)

    if role == "business":
        # Build penalty same way as the cancellation endpoint
        commission_component = max(deposit * STRIPE_FEE_PERCENT_ESTIMATED, MIN_BUSINESS_COMMISSION_MXN) if deposit > 0 else 0.0
        penalty = round(float(BOOKVIA_FEE_MXN) + commission_component, 2)
        current_pending = float(biz.get("pending_balance") or 0.0) - business_payout
        covered = min(max(current_pending, 0.0), penalty)
        debt = round(penalty - covered, 2)

        response["business_impact"] = {
            "client_refund": round(client_paid, 2),
            "penalty_total": penalty,
            "penalty_bookvia_fee": round(float(BOOKVIA_FEE_MXN), 2),
            "penalty_commission": round(commission_component, 2),
            "covered_from_pending": round(covered, 2),
            "outstanding_debt": debt,
        }
        response["summary"] = {
            "title_es": f"Esta cancelacion te costara ${penalty:.2f} MXN",
            "title_en": f"This cancellation will cost you ${penalty:.2f} MXN",
            "lines_es": [
                f"Se le reembolsaran ${client_paid:.2f} MXN al cliente.",
                f"Penalty: ${float(BOOKVIA_FEE_MXN):.2f} (tarifa Bookvia) + ${commission_component:.2f} (comision proporcional al anticipo).",
                f"Se descontaran ${covered:.2f} de tu saldo pendiente." if covered > 0 else "No hay saldo pendiente para cubrir el cargo.",
                f"Quedan ${debt:.2f} como deuda que se restara de tus proximos pagos." if debt > 0 else "Sin deuda adicional.",
                "Las cancelaciones frecuentes pueden suspender tu cuenta.",
            ],
            "lines_en": [
                f"${client_paid:.2f} MXN will be refunded to the client.",
                f"Penalty: ${float(BOOKVIA_FEE_MXN):.2f} (Bookvia fee) + ${commission_component:.2f} (commission proportional to the deposit).",
                f"${covered:.2f} will be deducted from your pending balance." if covered > 0 else "No pending balance to cover the charge.",
                f"${debt:.2f} will remain as debt deducted from future payouts." if debt > 0 else "No outstanding debt.",
                "Frequent cancellations may suspend your account.",
            ],
        }
    else:
        # Client preview — uses the policy already implemented in cancel_booking
        # Phase O cancellation: within cutoff_hours -> full refund to wallet/card;
        # past the cutoff -> deposit is forfeited (negocio se queda con el dinero).
        within_window = hours_until is None or hours_until >= cutoff
        if within_window:
            refund_amount = round(client_paid, 2)
            response["client_impact"] = {
                "refund_amount": refund_amount,
                "refund_destination_options": ["wallet", "card"],
                "policy": "free_cancellation",
            }
            response["summary"] = {
                "title_es": f"Recibiras ${refund_amount:.2f} MXN de reembolso",
                "title_en": f"You will get ${refund_amount:.2f} MXN refunded",
                "lines_es": [
                    f"Como cancelas con mas de {cutoff} horas de anticipacion, recibes el reembolso completo.",
                    "Puedes elegir si lo quieres en tu tarjeta (5-7 dias habiles) o en tu saldo Bookvia (instantaneo).",
                ],
                "lines_en": [
                    f"Since you cancel more than {cutoff} hours in advance, you get a full refund.",
                    "You can choose card (5-7 business days) or Bookvia wallet (instant).",
                ],
            }
        else:
            response["client_impact"] = {
                "refund_amount": 0.0,
                "refund_destination_options": [],
                "policy": "late_cancellation_no_refund",
            }
            response["summary"] = {
                "title_es": "Cancelacion tardia — no hay reembolso",
                "title_en": "Late cancellation — no refund",
                "lines_es": [
                    f"Faltan menos de {cutoff} horas para tu cita y la politica del negocio retiene el anticipo.",
                    f"Si cancelas ahora, perderas los ${client_paid:.2f} MXN que pagaste.",
                ],
                "lines_en": [
                    f"Less than {cutoff} hours remain and the business retains the deposit.",
                    f"If you cancel now, you will lose the ${client_paid:.2f} MXN you paid.",
                ],
            }
    return response


@router.put("/{booking_id}/cancel/business")
async def cancel_booking_by_business(
    booking_id: str,
    cancel_req: CancelBookingRequest,
    token_data: TokenData = Depends(require_business)
):
    """Cancel booking by business - full refund to client, fee charged to business"""
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    # Verify business ownership
    user = await db.users.find_one({"id": token_data.user_id})
    if not user or user.get("business_id") != booking["business_id"]:
        raise HTTPException(status_code=403, detail="Not your business booking")
    
    if booking["status"] not in [AppointmentStatus.HOLD, AppointmentStatus.CONFIRMED]:
        raise HTTPException(status_code=400, detail=f"Cannot cancel booking with status {booking['status']}")
    
    now = datetime.now(timezone.utc)
    
    # Get transaction if exists
    transaction = await db.transactions.find_one({
        "booking_id": booking_id,
        "status": TransactionStatus.PAID
    })
    
    refund_result = None
    # Refund is intentionally NOT executed inline. Admin reviews and issues
    # the Stripe refund manually from /admin > Reembolsos so that every
    # money movement is reviewed before it leaves Bookvia's accounts.

    if transaction:
        # Business cancels: Full refund to client, fee charged to business.
        # NOTE: We DO NOT emit the Stripe refund here. The admin issues the
        # refund manually from the Admin > Reembolsos tab. This gives full
        # visibility & control over money movement and prevents accidents.
        # The refund amount must match what the client actually paid (deposit
        # + $8 Bookvia fee). If `amount_total` is missing or stale, recompute.
        refund_amount = float(transaction.get("amount_total") or 0)
        _deposit_for_refund = float(transaction.get("deposit_amount") or 0)
        if _deposit_for_refund and refund_amount < (_deposit_for_refund + float(BOOKVIA_FEE_MXN)) - 0.5:
            refund_amount = round(_deposit_for_refund + float(BOOKVIA_FEE_MXN), 2)

        # Business penalty = Bookvia fee lost ($8 fixed) + commission % of
        # the deposit (8.5% with $8.50 floor). Proportional to the booking
        # size so a $200 deposit cancellation costs more than a $100 one.
        #
        # Examples:
        #   deposit $100 -> $8.00 + max($8.50, $8.50) = $16.50
        #   deposit $200 -> $8.00 + max($17.00, $8.50) = $25.00
        #   deposit $500 -> $8.00 + max($42.50, $8.50) = $50.50
        from models.enums import BOOKVIA_FEE_MXN, STRIPE_FEE_PERCENT_ESTIMATED, MIN_BUSINESS_COMMISSION_MXN
        deposit_for_penalty = float(transaction.get("deposit_amount") or transaction.get("payout_amount") or 0)
        if not deposit_for_penalty and transaction.get("amount_total"):
            # client_paid = deposit + bookvia_fee; back out the deposit
            deposit_for_penalty = max(0.0, float(transaction["amount_total"]) - float(BOOKVIA_FEE_MXN))
        commission_component = max(deposit_for_penalty * STRIPE_FEE_PERCENT_ESTIMATED, MIN_BUSINESS_COMMISSION_MXN) if deposit_for_penalty > 0 else 0.0
        fee_penalty = round(float(BOOKVIA_FEE_MXN) + commission_component, 2)

        # Mark the transaction as pending an admin-issued refund.
        # `refund_destination_choice` tracks the client's pick: pending|card|wallet.
        # While 'pending' it stays out of the admin queue (client hasn't decided).
        await db.transactions.update_one(
            {"id": transaction["id"]},
            {"$set": {
                "refund_amount": refund_amount,
                "refund_reason": "business_cancelled",
                "refund_pending": True,
                "refund_destination_choice": "pending",
                "refund_pending_since": now.isoformat(),
                "cancelled_by": "business",
                "updated_at": now.isoformat(),
            }}
        )

        # Funds state: AVAILABLE/PENDING_HOLD -> PENDING_REFUND.
        # Money is frozen but not yet returned to the client until admin acts.
        # (We do not call mark_refunded here; the admin issue endpoint does.)
        
        # Create fee penalty transaction for business
        penalty_tx = {
            "id": generate_id(),
            "booking_id": booking_id,
            "user_id": booking["user_id"],
            "business_id": booking["business_id"],
            "stripe_session_id": None,
            "stripe_payment_intent_id": None,
            "amount_total": fee_penalty,
            "fee_amount": fee_penalty,
            "payout_amount": -fee_penalty,  # Negative = charge to business
            "currency": "MXN",
            "status": TransactionStatus.BUSINESS_CANCEL_FEE,
            "refund_amount": None,
            "refund_reason": "business_cancellation_penalty",
            "cancelled_by": "business",
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "paid_at": None
        }
        await db.transactions.insert_one(penalty_tx)
        
        # Create ledger entries for penalty
        await create_transaction_ledger_entries(penalty_tx, TransactionStatus.BUSINESS_CANCEL_FEE)
        
        # Update business balance:
        #   1) Reverse the future payout this booking would have generated.
        #   2) Apply the penalty against pending_balance first; any uncovered
        #      portion becomes outstanding penalty debt (penalty_balance)
        #      that will be deducted from future payouts.
        biz_doc = await db.businesses.find_one({"id": booking["business_id"]}, {"_id": 0, "pending_balance": 1})
        current_pending = float((biz_doc or {}).get("pending_balance") or 0.0)
        # Reverse the payout this cancelled booking would have produced
        current_pending -= float(transaction.get("payout_amount") or 0.0)
        # Now apply the penalty against whatever is left in pending
        covered_from_pending = min(max(current_pending, 0.0), fee_penalty)
        penalty_debt = round(fee_penalty - covered_from_pending, 2)
        pending_delta = -float(transaction.get("payout_amount") or 0.0) - covered_from_pending

        update_doc = {"$inc": {"pending_balance": pending_delta}}
        if penalty_debt > 0:
            update_doc["$inc"]["penalty_balance"] = penalty_debt
        await db.businesses.update_one({"id": booking["business_id"]}, update_doc)

        logger.info(
            f"Business cancel penalty for {booking['business_id']}: total=${fee_penalty} "
            f"covered_from_pending=${covered_from_pending} debt=${penalty_debt}"
        )
        
        refund_result = {
            "refund_amount": refund_amount,
            "fee_penalty": fee_penalty,
            "penalty_breakdown": {
                "bookvia_fee_component": round(float(BOOKVIA_FEE_MXN), 2),
                "commission_component": round(commission_component, 2),
                "covered_from_pending": round(covered_from_pending, 2),
                "outstanding_debt": penalty_debt,
            },
            "policy_applied": "business_cancel_full_refund_proportional_penalty",
            "refund_status": "pending_admin_review",
            "stripe_refund_id": None,
            "refund_destination": "pending_admin",
        }

        logger.info(
            f"Business cancelled booking {booking_id}: refund ${refund_amount} pending admin issue, "
            f"penalty ${fee_penalty} (${BOOKVIA_FEE_MXN} fee + ${commission_component:.2f} commission)"
        )
    
    # Issue progressive strike to the business (Fase 5)
    try:
        from services.strikes import issue_strike
        booking_dt = datetime.strptime(f"{booking['date']} {booking['time']}", "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
        hours_until = (booking_dt - datetime.now(timezone.utc)).total_seconds() / 3600
        strike_reason = (
            "late_cancellation" if hours_until < 6 else "regular_cancellation"
        )
        strike = await issue_strike(
            business_id=booking["business_id"],
            reason=strike_reason,
            description=f"Business cancelled booking {booking_id} ({hours_until:.1f}h before appointment)",
            booking_id=booking_id,
            issued_by=f"business_user:{token_data.user_id}",
            metadata={"hours_before_appointment": round(hours_until, 2)},
        )
        if refund_result is not None:
            refund_result["strike"] = {
                "severity": strike["severity"],
                "financial_penalty_mxn": strike["financial_penalty_mxn"],
                "suspension_until": strike["suspension_until"],
            }
    except Exception as e:
        logger.error(f"Failed to issue strike for business cancellation: {e}")
    
    # Update booking
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "status": AppointmentStatus.CANCELLED,
            "cancelled_at": now.isoformat(),
            "cancelled_by": "business",
            "cancellation_reason": cancel_req.reason
        }}
    )
    
    # Update user stats (don't penalize user for business cancellation)
    await db.users.update_one(
        {"id": booking["user_id"]},
        {"$inc": {"active_appointments_count": -1}}
    )
    
    # Notify user — explicitly asks them to pick refund destination
    await create_notification(
        booking["user_id"],
        "Reserva Cancelada por el Negocio",
        f"Tu cita del {booking['date']} a las {booking['time']} fue cancelada. Elige donde quieres recibir tu reembolso de ${(transaction or {}).get('amount_total', 0):.2f} MXN.",
        "refund_choice_needed",
        {"booking_id": booking_id, "transaction_id": (transaction or {}).get('id')}
    )
    
    # Send cancellation email to client (respects notify_email pref)
    try:
        client_user = await db.users.find_one({"id": booking["user_id"]})
        business = await db.businesses.find_one({"id": booking["business_id"]})
        service = await db.services.find_one({"id": booking.get("service_id")})
        if client_user and business:
            if client_user.get("notify_email", True):
                from services.email import send_booking_cancelled
                if refund_result:
                    refund_msg = "Para recibir tu reembolso, abre Bookvia > Mis reservas y elige: 'Saldo Bookvia' (instantaneo) o 'Tarjeta' (5-10 dias habiles). El monto completo se devolvera donde elijas."
                else:
                    refund_msg = None
                await send_booking_cancelled(
                    user_email=client_user["email"],
                    user_name=client_user.get("full_name", "Cliente"),
                    business_name=business["name"],
                    service_name=service["name"] if service else "Servicio",
                    date=booking["date"],
                    time=booking["time"],
                    reason=f"Cancelada por el negocio. Motivo: {cancel_req.reason or 'No especificado'}",
                    refund_info=refund_msg
                )
            # Best-effort SMS to client (respects notify_sms pref)
            if client_user.get("notify_sms", True):
                from services.sms import send_booking_cancelled_sms
                await send_booking_cancelled_sms(
                    phone=client_user.get("phone"),
                    user_name=client_user.get("full_name", "Cliente"),
                    business_name=business["name"],
                    date=booking["date"],
                    time=booking["time"],
                    reason="Cancelada por el negocio"
                )
    except Exception as e:
        logger.error(f"Error sending cancellation email to client: {e}")
    
    # Log activity
    await create_business_activity(
        booking["business_id"], token_data, "cancel_booking", "booking", booking_id,
        {"client_name": booking.get("client_name", ""), "service_name": booking.get("service_name", ""), "date": booking.get("date", ""), "time": booking.get("time", ""), "reason": cancel_req.reason}
    )

    # NOTE: Admin alert moved to the refund-choice endpoint. We only ping admins
    # when the client picks "card" so the queue stays clean.

    return {
        "message": "Booking cancelled by business",
        "status": AppointmentStatus.CANCELLED,
        "refund": refund_result
    }



@router.put("/{booking_id}/no-show")
async def mark_no_show(booking_id: str, token_data: TokenData = Depends(require_business)):
    """Mark booking as no-show - business keeps deposit minus fee"""
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    # Verify business ownership
    user = await db.users.find_one({"id": token_data.user_id})
    if not user or user.get("business_id") != booking["business_id"]:
        raise HTTPException(status_code=403, detail="Not your business booking")
    
    if booking["status"] != AppointmentStatus.CONFIRMED:
        raise HTTPException(status_code=400, detail="Can only mark confirmed bookings as no-show")
    
    now = datetime.now(timezone.utc)
    
    # Get transaction
    transaction = await db.transactions.find_one({
        "booking_id": booking_id,
        "status": TransactionStatus.PAID
    })
    
    payout_result = None
    
    if transaction:
        # No-show: Business receives payout (deposit - fee)
        await db.transactions.update_one(
            {"id": transaction["id"]},
            {"$set": {
                "status": TransactionStatus.NO_SHOW_PAYOUT,
                "updated_at": now.isoformat()
            }}
        )
        
        payout_result = {
            "payout_amount": transaction["payout_amount"],
            "fee_retained": transaction["fee_amount"]
        }
        
        logger.info(f"No-show for booking {booking_id}: business payout ${transaction['payout_amount']}")
    
    # Update booking
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": AppointmentStatus.NO_SHOW}}
    )
    
    # Update user stats (no-show counts as cancellation)
    await db.users.update_one(
        {"id": booking["user_id"]},
        {"$inc": {"active_appointments_count": -1, "cancellation_count": 1, "no_show_count": 1}}
    )
    
    # Check suspension threshold
    booking_user = await db.users.find_one({"id": booking["user_id"]})
    if booking_user.get("cancellation_count", 0) >= 4:
        suspended_until = (now + timedelta(days=15)).isoformat()
        await db.users.update_one(
            {"id": booking["user_id"]},
            {"$set": {"suspended_until": suspended_until}}
        )
    
    return {
        "message": "Marked as no-show",
        "payout": payout_result
    }



@router.post("/send-reminders")
async def trigger_send_reminders(token_data: TokenData = Depends(require_admin)):
    """Admin endpoint to manually trigger appointment reminders"""
    await send_pending_reminders()
    return {"message": "Reminders processed"}


# ========================== CALENDAR (.ICS) ==========================

def _calendar_token(booking_id: str) -> str:
    """HMAC-SHA256 token to authorize public calendar download for a booking."""
    import hmac
    import hashlib
    from core.config import JWT_SECRET
    msg = f"calendar:{booking_id}".encode("utf-8")
    secret = (JWT_SECRET or "dev").encode("utf-8")
    return hmac.new(secret, msg, hashlib.sha256).hexdigest()[:32]


def _ics_escape(value: str) -> str:
    """Escape a string for inclusion in an ICS field per RFC 5545."""
    return (
        (value or "")
        .replace("\\", "\\\\")
        .replace(",", "\\,")
        .replace(";", "\\;")
        .replace("\n", "\\n")
    )


@router.get("/{booking_id}/calendar.ics")
async def download_booking_calendar(booking_id: str, token: str = ""):
    """Public endpoint that returns an .ics file for a booking.

    Authentication is handled via an HMAC token tied to the booking id so the
    link can be shared from email without requiring a session.
    """
    expected = _calendar_token(booking_id)
    import hmac
    if not token or not hmac.compare_digest(token, expected):
        raise HTTPException(status_code=403, detail="Invalid calendar token")

    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("status") in ("cancelled", "expired", "no_show"):
        raise HTTPException(status_code=410, detail="Booking is no longer active")

    business = await db.businesses.find_one(
        {"id": booking["business_id"]},
        {"_id": 0, "name": 1, "address": 1, "timezone": 1, "phone": 1},
    ) or {}
    service = await db.services.find_one(
        {"id": booking.get("service_id")},
        {"_id": 0, "name": 1, "duration_minutes": 1, "duration": 1},
    ) or {}

    tz_name = business.get("timezone") or "America/Mexico_City"
    biz_tz = pytz.timezone(tz_name)

    date_str = booking.get("date", "")
    time_str = booking.get("time", "")
    try:
        naive_start = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid booking datetime")

    duration_min = int(
        service.get("duration_minutes")
        or service.get("duration")
        or booking.get("duration_minutes")
        or 60
    )

    local_start = biz_tz.localize(naive_start)
    local_end = local_start + timedelta(minutes=duration_min)
    utc_start = local_start.astimezone(pytz.utc)
    utc_end = local_end.astimezone(pytz.utc)

    dtstamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dtstart = utc_start.strftime("%Y%m%dT%H%M%SZ")
    dtend = utc_end.strftime("%Y%m%dT%H%M%SZ")

    summary = _ics_escape(f"Cita en {business.get('name', 'Bookvia')}")
    description_parts = [f"Servicio: {service.get('name', '')}"]
    if business.get("phone"):
        description_parts.append(f"Tel negocio: {business.get('phone')}")
    description_parts.append("Reserva: https://bookvia.vercel.app/bookings")
    description = _ics_escape("\n".join(description_parts))
    location = _ics_escape(business.get("address") or "")

    ics_lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Bookvia//Reminders//ES",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{booking_id}@bookvia.app",
        f"DTSTAMP:{dtstamp}",
        f"DTSTART:{dtstart}",
        f"DTEND:{dtend}",
        f"SUMMARY:{summary}",
        f"DESCRIPTION:{description}",
        f"LOCATION:{location}",
        "STATUS:CONFIRMED",
        "BEGIN:VALARM",
        "TRIGGER:-PT2H",
        "ACTION:DISPLAY",
        f"DESCRIPTION:{summary}",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    body = "\r\n".join(ics_lines) + "\r\n"

    return Response(
        content=body,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="bookvia-{booking_id}.ics"',
            "Cache-Control": "no-store",
        },
    )




