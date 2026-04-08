"""
Enum definitions and constants for the application.
These are the canonical versions used throughout the codebase.
"""
from enum import Enum


class UserRole(str, Enum):
    USER = "user"
    BUSINESS = "business"
    ADMIN = "admin"


class AppointmentStatus(str, Enum):
    HOLD = "hold"
    CONFIRMED = "confirmed"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"
    EXPIRED = "expired"


class BusinessStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    SUSPENDED = "suspended"
    REJECTED = "rejected"


class PaymentStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    REFUNDED = "refunded"
    FAILED = "failed"


class TransactionStatus(str, Enum):
    CREATED = "created"
    PAID = "paid"
    REFUND_PARTIAL = "refund_partial"
    REFUND_FULL = "refund_full"
    NO_SHOW_PAYOUT = "no_show_payout"
    BUSINESS_CANCEL_FEE = "business_cancel_fee"
    EXPIRED = "expired"


class LedgerDirection(str, Enum):
    DEBIT = "debit"
    CREDIT = "credit"


class LedgerAccount(str, Enum):
    BUSINESS_REVENUE = "business_revenue"
    PLATFORM_FEE = "platform_fee"
    REFUND = "refund"
    PENALTY = "penalty"
    PAYOUT = "payout"


class LedgerEntryStatus(str, Enum):
    POSTED = "posted"
    REVERSED = "reversed"


class SettlementStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"
    HELD = "held"
    FAILED = "failed"


class AuditAction(str, Enum):
    BUSINESS_APPROVE = "business_approve"
    BUSINESS_REJECT = "business_reject"
    BUSINESS_SUSPEND = "business_suspend"
    USER_SUSPEND = "user_suspend"
    REVIEW_DELETE = "review_delete"
    BUSINESS_FEATURE = "business_feature"
    PAYMENT_HOLD = "payment_hold"
    PAYMENT_RELEASE = "payment_release"
    ADMIN_LOGIN = "admin_login"
    ADMIN_2FA_SETUP = "admin_2fa_setup"
    PAYOUT_HOLD = "payout_hold"
    PAYOUT_RELEASE = "payout_release"
    SETTLEMENT_GENERATE = "settlement_generate"
    SETTLEMENT_MARK_PAID = "settlement_mark_paid"


# ========================== CONSTANTS ==========================

PLATFORM_FEE_PERCENT = 0.08
HOLD_EXPIRATION_MINUTES = 30
MIN_DEPOSIT_AMOUNT = 50.0
SUBSCRIPTION_PRICE_MXN = 39.00
SUBSCRIPTION_TRIAL_DAYS = 30

VISIBLE_BUSINESS_FILTER = {
    "status": BusinessStatus.APPROVED,
    "$or": [
        {"subscription_status": {"$in": ["active", "trialing"]}},
        {"subscription_status": {"$exists": False}},
        {"subscription_status": None},
        {"subscription_status": "none"},
    ]
}

DEFAULT_MANAGER_PERMISSIONS = {
    "complete_bookings": True,
    "reschedule_bookings": True,
    "cancel_bookings": False,
    "block_clients": False,
    "view_client_data": False,
    "edit_services": False,
    "view_reports": False,
    "view_today_bookings": True,
    "view_confirmed_bookings": True,
    "view_agenda": True,
    "view_team": False,
    "edit_photos": False,
    "edit_description": False,
    "edit_schedule": False,
    "edit_contact": False,
}
