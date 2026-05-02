"""
Enum definitions and constants for the application.
These are the canonical versions used throughout the codebase.
"""
from enum import Enum


class UserRole(str, Enum):
    USER = "user"
    BUSINESS = "business"
    ADMIN = "admin"
    STAFF = "staff"


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


class FundsState(str, Enum):
    """
    Lifecycle of money owed to a business per booking transaction.
    
      PENDING_HOLD   -> Client paid; appointment hasn't happened yet.
      AVAILABLE      -> Appointment marked as completed; entering 24h grace window.
      CLEARED        -> Grace passed without complaints; eligible for monthly payout.
      DISPUTED       -> Client filed a complaint; admin must resolve before clearing.
      REFUNDED       -> Money was refunded (cancellation / dispute resolved against business).
      PAID_OUT       -> Money has been transferred to business in a settlement.
    """
    PENDING_HOLD = "pending_hold"
    AVAILABLE = "available"
    CLEARED = "cleared"
    DISPUTED = "disputed"
    REFUNDED = "refunded"
    PAID_OUT = "paid_out"


GRACE_PERIOD_HOURS = 24            # Hours after appointment completion before money clears
AUTO_COMPLETE_HOURS = 48           # Hours after scheduled end time to auto-mark completed if business hasn't
MAX_RESCHEDULES_PER_BOOKING = 2    # Maximum number of times a booking can be rescheduled by the client
RESCHEDULE_CUTOFF_HOURS = 2        # Client must reschedule at least N hours before the appointment


class StrikeReason(str, Enum):
    """Why a strike was issued to a business."""
    LATE_CANCELLATION = "late_cancellation"        # Business cancelled <6h before appointment
    REGULAR_CANCELLATION = "regular_cancellation"  # Business cancelled >6h before appointment (still counts)
    NO_SHOW_BUSINESS = "no_show_business"          # Client reported the business never opened (Fase 6)
    DISPUTE_LOST = "dispute_lost"                  # Admin resolved a dispute against the business
    EXCESSIVE_RESCHEDULES = "excessive_reschedules"  # Business reagended too many times
    ADMIN_MANUAL = "admin_manual"                  # Admin manually issued a strike


class StrikeSeverity(str, Enum):
    WARNING = "warning"           # No financial penalty, 1st strike under non-severe reasons
    MINOR = "minor"                # -$100 MXN deduction from next payout
    SUSPENSION_7D = "suspension_7d"   # Removed from search 7 days
    SUSPENSION_30D = "suspension_30d" # Removed from search 30 days, admin review triggered
    PERMANENT_BAN = "permanent_ban"   # Account banned indefinitely, payout final balance only


# Strike escalation thresholds (count within rolling window -> severity)
STRIKE_PENALTY_AMOUNT = 100.0      # MXN deducted per MINOR strike
STRIKE_WINDOW_30_DAYS = 30
STRIKE_WINDOW_90_DAYS = 90


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
    CATEGORY_CREATE = "category_create"
    CATEGORY_UPDATE = "category_update"
    CATEGORY_DELETE = "category_delete"
    CONFIG_UPDATE = "config_update"
    TICKET_RESPOND = "ticket_respond"
    TICKET_CLOSE = "ticket_close"
    CITY_ACTIVATE = "city_activate"
    CITY_DEACTIVATE = "city_deactivate"
    STAFF_CREATE = "staff_create"
    STAFF_UPDATE = "staff_update"
    STAFF_DELETE = "staff_delete"
    DOCS_VERIFY = "docs_verify"
    DOCS_REJECT = "docs_reject"


# ========================== CONSTANTS ==========================

PLATFORM_FEE_PERCENT = 0.08  # Legacy (unused in new model, keep for back-compat)
HOLD_EXPIRATION_MINUTES = 30
MIN_DEPOSIT_AMOUNT = 100.0  # Minimum deposit amount (MXN) per service
BOOKVIA_FEE_MXN = 8.20  # Fixed fee charged to client per booking with deposit (IVA included)
STRIPE_FEE_PERCENT_ESTIMATED = 0.085  # Estimated Stripe fee (8.5%) charged to business
SUBSCRIPTION_PRICE_MXN = 49.99
SUBSCRIPTION_PRICE_USD = 4.99
SUBSCRIPTION_TRIAL_DAYS = 30

VISIBLE_BUSINESS_FILTER = {
    "status": BusinessStatus.APPROVED,
    "subscription_status": {"$in": ["active", "trialing"]},
    "banned": {"$ne": True},
    "documents_verified": True,
}


def visible_business_filter_now() -> dict:
    """
    Return the visibility filter for businesses, computed at call time so we can compare
    suspended_until against the current ISO timestamp.
    """
    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        **VISIBLE_BUSINESS_FILTER,
        "$or": [
            {"suspended_until": None},
            {"suspended_until": {"$exists": False}},
            {"suspended_until": {"$lt": now_iso}},
        ],
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
