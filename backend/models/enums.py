"""
Enum definitions for the application.
"""
from enum import Enum


class UserRole(str, Enum):
    USER = "user"
    BUSINESS = "business"
    ADMIN = "admin"


class AppointmentStatus(str, Enum):
    HOLD = "HOLD"  # Waiting for payment (30 min)
    CONFIRMED = "CONFIRMED"  # Paid and confirmed
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"
    NO_SHOW = "NO_SHOW"
    EXPIRED = "EXPIRED"  # Hold expired without payment


class BusinessStatus(str, Enum):
    PENDING_REVIEW = "PENDING_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    SUSPENDED = "SUSPENDED"


class PaymentStatus(str, Enum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"


class TransactionStatus(str, Enum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"
    CANCELLED = "CANCELLED"


class LedgerDirection(str, Enum):
    DEBIT = "DEBIT"
    CREDIT = "CREDIT"


class LedgerAccount(str, Enum):
    BUSINESS_RECEIVABLE = "BUSINESS_RECEIVABLE"  # What we owe the business
    PLATFORM_REVENUE = "PLATFORM_REVENUE"  # Our commission
    BUSINESS_PAYOUT = "BUSINESS_PAYOUT"  # Paid to business


class LedgerEntryStatus(str, Enum):
    PENDING = "PENDING"
    SETTLED = "SETTLED"


class SettlementStatus(str, Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    HELD = "HELD"


class AuditAction(str, Enum):
    BUSINESS_APPROVED = "BUSINESS_APPROVED"
    BUSINESS_REJECTED = "BUSINESS_REJECTED"
    BUSINESS_SUSPENDED = "BUSINESS_SUSPENDED"
    SETTLEMENT_CREATED = "SETTLEMENT_CREATED"
    SETTLEMENT_PAID = "SETTLEMENT_PAID"
    SETTLEMENT_HELD = "SETTLEMENT_HELD"
    PAYOUT_HELD = "PAYOUT_HELD"
    PAYOUT_RELEASED = "PAYOUT_RELEASED"
    USER_SUSPENDED = "USER_SUSPENDED"


class NotificationType(str, Enum):
    BOOKING_CONFIRMED = "BOOKING_CONFIRMED"
    BOOKING_CANCELLED = "BOOKING_CANCELLED"
    BOOKING_REMINDER = "BOOKING_REMINDER"
    PAYMENT_RECEIVED = "PAYMENT_RECEIVED"
    WORKER_ASSIGNED = "WORKER_ASSIGNED"
    SETTLEMENT_READY = "SETTLEMENT_READY"
    GENERAL = "GENERAL"
