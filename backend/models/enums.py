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
    "subscription_status": {"$in": ["active", "trialing"]}
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
