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


@router.get("/business/stats-detail")

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


async def get_business_stats_detail(
    stat_type: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    token_data: TokenData = Depends(require_business)
):
    """Get detailed bookings for a specific stat card."""
    user = await db.users.find_one({"id": token_data.user_id})
    if not user or not user.get("business_id"):
        raise HTTPException(status_code=404, detail="Business not found")
    
    business_id = user["business_id"]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    first_of_month = datetime.now(timezone.utc).replace(day=1).strftime("%Y-%m-%d")
    
    filters = {"business_id": business_id}
    
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
    
    if business.get("subscription_status") in ("canceled", "past_due", "unpaid"):
        raise HTTPException(status_code=400, detail="Business subscription is not active")
    
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
    
    # Calculate deposit amount (minimum 50 MXN)
    deposit_amount = max(
        business.get("deposit_amount", MIN_DEPOSIT_AMOUNT) if business.get("requires_deposit") else MIN_DEPOSIT_AMOUNT,
        MIN_DEPOSIT_AMOUNT
    )
    
    # Determine if this is a business-created booking (skip payment)
    is_biz_booking = booking.skip_payment and token_data.role == UserRole.BUSINESS
    now_iso = datetime.now(timezone.utc).isoformat()
    
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
        
        # Check if already reviewed
        existing_review = await db.reviews.find_one({"booking_id": b["id"]})
        b["has_review"] = existing_review is not None
        
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
    token_data: TokenData = Depends(require_business)
):
    user = await db.users.find_one({"id": token_data.user_id})
    if not user or not user.get("business_id"):
        raise HTTPException(status_code=404, detail="Business not found")
    
    filters = {"business_id": user["business_id"]}
    
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
    
    # Check if >24h before
    booking_datetime = datetime.strptime(f"{booking['date']} {booking['time']}", "%Y-%m-%d %H:%M")
    booking_datetime = booking_datetime.replace(tzinfo=timezone.utc)
    hours_until = (booking_datetime - datetime.now(timezone.utc)).total_seconds() / 3600
    
    if hours_until <= 24:
        raise HTTPException(status_code=400, detail="Cannot reschedule less than 24 hours before appointment")
    
    # Calculate new end time
    service = await db.services.find_one({"id": booking["service_id"]})
    start_time = datetime.strptime(new_time, "%H:%M")
    end_time = start_time + timedelta(minutes=service["duration_minutes"])
    
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "date": new_date,
            "time": new_time,
            "end_time": end_time.strftime("%H:%M"),
            "rescheduled_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Booking rescheduled"}




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
        "rescheduled_at": now,
        "rescheduled_by": "business",
    }
    if req.new_worker_id:
        update_fields["worker_id"] = req.new_worker_id
    
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": update_fields}
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
        {"$set": {"status": AppointmentStatus.COMPLETED, "completed_at": datetime.now(timezone.utc).isoformat()}}
    )
    
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
    
    # Notify user to leave review
    await create_notification(
        booking["user_id"],
        "Deja tu opinion",
        "Tu cita ha sido completada. Dejanos tu opinion!",
        "review",
        {"booking_id": booking_id, "business_id": booking["business_id"]}
    )
    
    # Log activity
    await create_business_activity(
        booking["business_id"], token_data, "complete_booking", "booking", booking_id,
        {"client_name": booking.get("client_name", ""), "service_name": booking.get("service_name", ""), "date": booking.get("date", ""), "time": booking.get("time", "")}
    )
    
    return {"message": "Booking completed"}



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
    
    if transaction:
        # Apply cancellation policy
        if hours_until > 24:
            # >24h: Refund amount - fee (8%)
            refund_amount = transaction["payout_amount"]  # amount - fee
            refund_status = TransactionStatus.REFUND_PARTIAL
            refund_reason = "client_cancel_gt_24h"
            
            logger.info(f"Partial refund: ${refund_amount} for booking {booking_id}")
        else:
            # <24h: No refund (business keeps the deposit minus fee)
            refund_amount = 0
            refund_status = TransactionStatus.REFUND_PARTIAL  # 0 refund, business gets payout
            refund_reason = "client_cancel_lt_24h"
            
            logger.info(f"No refund (<24h): booking {booking_id}")
        
        # Update transaction
        await db.transactions.update_one(
            {"id": transaction["id"]},
            {"$set": {
                "status": refund_status,
                "refund_amount": refund_amount,
                "refund_reason": refund_reason,
                "cancelled_by": "user",
                "updated_at": now.isoformat()
            }}
        )
        
        # Create ledger entries for refund (if >24h)
        if hours_until > 24 and refund_amount > 0:
            updated_tx = {**transaction, "refund_amount": refund_amount}
            await create_transaction_ledger_entries(updated_tx, TransactionStatus.REFUND_PARTIAL)
        
        refund_result = {
            "refund_amount": refund_amount,
            "policy_applied": ">24h partial refund" if hours_until > 24 else "<24h no refund"
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
    
    if transaction:
        # Business cancels: Full refund to client, fee charged to business
        refund_amount = transaction["amount_total"]  # 100% refund
        fee_penalty = transaction["fee_amount"]  # 8% fee charged to business
        
        # Update transaction
        await db.transactions.update_one(
            {"id": transaction["id"]},
            {"$set": {
                "status": TransactionStatus.REFUND_FULL,
                "refund_amount": refund_amount,
                "refund_reason": "business_cancelled",
                "cancelled_by": "business",
                "updated_at": now.isoformat()
            }}
        )
        
        # Create ledger entries for full refund
        updated_tx = {**transaction, "refund_amount": refund_amount}
        await create_transaction_ledger_entries(updated_tx, TransactionStatus.REFUND_FULL)
        
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
        
        # Update business balance (deduct pending and add penalty)
        await db.businesses.update_one(
            {"id": booking["business_id"]},
            {"$inc": {
                "pending_balance": -transaction["payout_amount"],
                "penalty_balance": fee_penalty
            }}
        )
        
        refund_result = {
            "refund_amount": refund_amount,
            "fee_penalty": fee_penalty,
            "policy_applied": "business_cancel_full_refund_fee_penalty"
        }
        
        logger.info(f"Business cancelled booking {booking_id}: full refund ${refund_amount}, penalty ${fee_penalty}")
    
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
    
    # Notify user
    await create_notification(
        booking["user_id"],
        "Reserva Cancelada por el Negocio",
        f"Tu cita del {booking['date']} a las {booking['time']} fue cancelada. Se procesará un reembolso completo.",
        "system",
        {"booking_id": booking_id}
    )
    
    # Send cancellation email to client (respects notify_email pref)
    try:
        client_user = await db.users.find_one({"id": booking["user_id"]})
        business = await db.businesses.find_one({"id": booking["business_id"]})
        service = await db.services.find_one({"id": booking.get("service_id")})
        if client_user and business:
            if client_user.get("notify_email", True):
                from services.email import send_booking_cancelled
                refund_msg = "Se procesará un reembolso completo a tu método de pago." if refund_result else None
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




