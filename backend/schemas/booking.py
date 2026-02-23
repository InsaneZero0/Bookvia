"""
Booking and availability schemas.
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from enum import Enum


class SlotStatus(str, Enum):
    AVAILABLE = "available"
    BOOKED = "booked"
    HOLD = "hold"
    EXCEPTION = "exception"
    OUTSIDE_SCHEDULE = "outside_schedule"
    BUFFER = "buffer"


class BookingCreate(BaseModel):
    business_id: str
    service_id: str
    worker_id: Optional[str] = None  # None = auto-assign
    date: str  # YYYY-MM-DD
    time: str  # HH:MM
    notes: Optional[str] = None
    is_home_service: bool = False
    address: Optional[str] = None


class BookingResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    business_id: str
    business_name: Optional[str] = None
    business_address: Optional[str] = None
    service_id: str
    service_name: Optional[str] = None
    worker_id: str
    worker_name: Optional[str] = None
    date: str
    time: str
    end_time: str
    status: str
    notes: Optional[str] = None
    is_home_service: bool = False
    address: Optional[str] = None
    deposit_amount: float
    deposit_paid: bool = False
    total_amount: float
    transaction_id: Optional[str] = None
    stripe_session_id: Optional[str] = None
    hold_expires_at: Optional[str] = None
    created_at: str
    confirmed_at: Optional[str] = None
    cancelled_at: Optional[str] = None
    cancelled_by: Optional[str] = None
    cancellation_reason: Optional[str] = None
    can_cancel: bool = True


class ReviewCreate(BaseModel):
    booking_id: str
    rating: int  # 1-5
    comment: Optional[str] = None


class ReviewResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    booking_id: str
    user_id: str
    user_name: str
    business_id: str
    rating: int
    comment: Optional[str] = None
    created_at: str


class AvailabilitySlot(BaseModel):
    time: str
    end_time: str
    status: str
    reason: Optional[str] = None
    worker_id: Optional[str] = None
    worker_name: Optional[str] = None


class AvailabilityResponse(BaseModel):
    date: str
    business_timezone: str
    slots: List[AvailabilitySlot]
    available_count: int
    total_workers: int


class CancelBookingRequest(BaseModel):
    reason: Optional[str] = None


class DepositCheckoutRequest(BaseModel):
    success_url: str
    cancel_url: str
