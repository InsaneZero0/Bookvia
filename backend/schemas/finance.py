"""
Finance, ledger, and settlement schemas.
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List


class PaymentCreate(BaseModel):
    amount: float
    currency: str = "mxn"
    description: Optional[str] = None


class PaymentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    amount: float
    currency: str
    status: str
    stripe_payment_intent_id: Optional[str] = None
    stripe_session_id: Optional[str] = None
    created_at: str


class TransactionCreate(BaseModel):
    booking_id: str
    amount: float


class TransactionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    booking_id: str
    business_id: str
    user_id: str
    amount_total: float
    fee_amount: float
    business_amount: float
    status: str
    stripe_session_id: Optional[str] = None
    stripe_payment_intent_id: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None


class LedgerEntryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    account_id: str  # business_id or "platform"
    direction: str  # DEBIT or CREDIT
    amount_cents: int
    entry_type: str
    entry_status: str
    reference_id: Optional[str] = None
    description: str
    created_at: str


class SettlementResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    business_id: str
    business_name: Optional[str] = None
    period_start: str
    period_end: str
    period_key: str
    total_transactions: int
    gross_amount_cents: int
    fee_amount_cents: int
    net_amount_cents: int
    refunds_cents: int
    adjustments_cents: int
    status: str
    paid_at: Optional[str] = None
    paid_reference: Optional[str] = None
    created_at: str


class SettlementMarkPaidRequest(BaseModel):
    reference: str


class BusinessFinanceSummary(BaseModel):
    total_earned_cents: int
    total_fees_cents: int
    total_refunds_cents: int
    pending_payout_cents: int
    last_payout_cents: int
    last_payout_date: Optional[str] = None
    transactions_count: int
    current_period: str


class PayoutHoldRequest(BaseModel):
    reason: str


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    admin_id: str
    admin_email: Optional[str] = None
    action: str
    target_type: str
    target_id: str
    details: dict
    created_at: str


class NotificationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    title: str
    message: str
    type: str
    read: bool = False
    data: Optional[dict] = None
    created_at: str
