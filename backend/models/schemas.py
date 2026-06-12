"""
All Pydantic models (schemas) for the application.
This is the single source of truth for request/response models.
"""
from pydantic import BaseModel, ConfigDict, EmailStr
from typing import Optional, List, Dict, Any


# ========================== AUTH MODELS ==========================

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    phone: str
    country: Optional[str] = None
    city: Optional[str] = None
    birth_date: Optional[str] = None
    gender: Optional[str] = None
    photo_url: Optional[str] = None
    preferred_language: str = "es"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    full_name: str
    phone: str
    phone_verified: bool = False
    email_verified: bool = False
    birth_date: Optional[str] = None
    gender: Optional[str] = None
    photo_url: Optional[str] = None
    role: str = "user"
    business_id: Optional[str] = None
    active_appointments_count: int = 0
    cancellation_count: int = 0
    suspended_until: Optional[str] = None
    favorites: List[str] = []
    preferred_language: str = "es"
    totp_enabled: bool = False
    notify_email: bool = True
    notify_sms: bool = True
    public_code: Optional[str] = None
    created_at: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    birth_date: Optional[str] = None
    gender: Optional[str] = None
    photo_url: Optional[str] = None
    preferred_language: Optional[str] = None
    notify_email: Optional[bool] = None
    notify_sms: Optional[bool] = None

class PhoneVerifyRequest(BaseModel):
    phone: str

class PhoneVerifyConfirm(BaseModel):
    phone: str
    code: str

class Admin2FASetup(BaseModel):
    password: str

class Admin2FAVerify(BaseModel):
    code: str

class AdminLogin(BaseModel):
    email: EmailStr
    password: str
    totp_code: str


# ========================== BUSINESS MODELS ==========================

class BusinessCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: str
    description: str
    category_id: str
    subcategory_ids: List[str] = []  # Phase H — up to 3 subcategory ids
    address: str
    city: str
    state: str
    country: str = "MX"
    zip_code: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    timezone: str = "America/Mexico_City"
    ine_url: Optional[str] = None
    rfc: str
    proof_of_address_url: Optional[str] = None
    clabe: str
    legal_name: str
    owner_birth_date: Optional[str] = None
    requires_deposit: bool = False
    deposit_amount: float = 100.0
    cancellation_days: int = 1
    payout_schedule: Optional[str] = "monthly_cutoff_20"  # fixed cadence: corte día 20, depósito día 1° del mes siguiente
    min_time_between_appointments: int = 0
    service_radius_km: Optional[float] = None
    plan_type: str = "basic"
    logo_url: Optional[str] = None
    cover_photo: Optional[str] = None
    custom_category_description: Optional[str] = None
    # Commission terms acceptance (Phase 18 + 19)
    commission_terms_accepted: Optional[bool] = None
    commission_terms_version: Optional[str] = None
    commission_terms_hash: Optional[str] = None
    commission_terms_snapshot: Optional[Dict[str, Any]] = None
    # Tax regime (Phase 19) — used for future Fintech withholding calculations
    tax_regime: Optional[str] = None

class BusinessResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    email: str = ""
    phone: str = ""
    phone_verified: bool = False
    description: str = ""
    category_id: str
    category_name: Optional[str] = None
    subcategory_ids: List[str] = []
    subcategory_names: List[str] = []
    address: str
    city: str
    city_slug: Optional[str] = None
    state: str
    country: str
    country_code: str = "MX"
    zip_code: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    timezone: str = "America/Mexico_City"
    status: str = "pending"
    rating: float = 0.0
    review_count: int = 0
    completed_appointments: int = 0
    badges: List[str] = []
    requires_deposit: bool = False
    deposit_amount: float = 100.0
    cancellation_days: int = 1
    payout_schedule: Optional[str] = "monthly_cutoff_20"
    min_time_between_appointments: int = 0
    photos: List[str] = []
    logo_url: Optional[str] = None
    cover_photo: Optional[str] = None
    slug: Optional[str] = None
    created_at: str
    is_featured: bool = False
    plan_type: str = "basic"
    trial_ends_at: Optional[str] = None
    can_accept_bookings: bool = True
    subscription_status: str = "none"
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    logo_public_id: Optional[str] = None
    distance_km: Optional[float] = None
    next_available_text: Optional[str] = None
    # Multi-branch expansion (Phase E): when a business has multiple branches,
    # search results expand to one entry per branch with these fields populated.
    branch_id: Optional[str] = None
    branch_name: Optional[str] = None
    is_primary_branch: Optional[bool] = None
    is_open_now: Optional[bool] = None
    business_hours: Optional[Dict[str, Any]] = None
    notify_email: bool = True
    notify_sms: bool = True
    top_services: List[Dict[str, Any]] = []
    min_price: Optional[float] = None
    public_code: Optional[str] = None
    # Stripe Connect Express (Phase A)
    stripe_connect_account_id: Optional[str] = None
    stripe_connect_charges_enabled: bool = False
    stripe_connect_payouts_enabled: bool = False
    stripe_connect_details_submitted: bool = False


# BRANCH (SUCURSAL) MODELS — Phase Multi-Branch
# A Branch is a physical location of a Business. A Business can have N branches.
# Existing single-location businesses get a "Sucursal Principal" auto-created on first access.

class BranchBase(BaseModel):
    name: str  # "Plaza Centro", "Sucursal Norte"
    address: str
    city: str
    state: str
    zip_code: Optional[str] = ""
    country: str = "MX"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    phone: Optional[str] = None
    timezone: str = "America/Mexico_City"
    business_hours: Optional[Dict[str, Any]] = None
    photos: List[str] = []
    cover_photo: Optional[str] = None


class BranchCreate(BranchBase):
    pass


class BranchUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    phone: Optional[str] = None
    timezone: Optional[str] = None
    business_hours: Optional[Dict[str, Any]] = None
    photos: Optional[List[str]] = None
    cover_photo: Optional[str] = None
    is_active: Optional[bool] = None


class BranchResponse(BranchBase):
    id: str
    business_id: str
    is_active: bool = True
    is_primary: bool = False
    services_count: Optional[int] = None
    bookings_month: Optional[int] = None
    created_at: str
    updated_at: str


class BusinessUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    timezone: Optional[str] = None
    requires_deposit: Optional[bool] = None
    deposit_amount: Optional[float] = None
    cancellation_days: Optional[int] = None
    payout_schedule: Optional[str] = None
    min_time_between_appointments: Optional[int] = None
    service_radius_km: Optional[float] = None
    photos: Optional[List[str]] = None
    logo_url: Optional[str] = None
    notify_email: Optional[bool] = None
    notify_sms: Optional[bool] = None


class BusinessLegalDocsUpdate(BaseModel):
    """Payload for the business owner to update its legal/banking documents.

    Any change submitted here ALWAYS flips `documents_verified` back to False
    and notifies admins for re-verification.
    """
    legal_name: Optional[str] = None
    rfc: Optional[str] = None
    clabe: Optional[str] = None
    ine_url: Optional[str] = None
    proof_of_address_url: Optional[str] = None
    bank_proof_url: Optional[str] = None
    owner_birth_date: Optional[str] = None


class DocumentsRejectRequest(BaseModel):
    reason: str

class CategoryCreate(BaseModel):
    name_es: str
    name_en: str
    slug: str
    icon: str
    image_url: Optional[str] = None
    parent_id: Optional[str] = None

class CategoryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name_es: str
    name_en: str
    slug: str
    icon: str
    image_url: Optional[str] = None
    parent_id: Optional[str] = None
    business_count: int = 0

class SearchQuery(BaseModel):
    query: Optional[str] = None
    category_id: Optional[str] = None
    city: Optional[str] = None
    date: Optional[str] = None
    min_rating: Optional[float] = None
    is_home_service: Optional[bool] = None
    page: int = 1
    limit: int = 20

class BlacklistEntry(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    user_id: Optional[str] = None
    reason: Optional[str] = None

class BlacklistResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    business_id: str
    email: Optional[str] = None
    phone: Optional[str] = None
    user_id: Optional[str] = None
    reason: Optional[str] = None
    created_at: str


# ========================== WORKER MODELS ==========================

class ScheduleBlock(BaseModel):
    start_time: str
    end_time: str

class DaySchedule(BaseModel):
    is_available: bool = True
    blocks: List[ScheduleBlock] = []

class WorkerException(BaseModel):
    start_date: str
    end_date: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    reason: Optional[str] = None
    exception_type: str = "block"

class WorkerCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    photo_url: Optional[str] = None
    bio: Optional[str] = None
    service_ids: List[str] = []

class WorkerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    photo_url: Optional[str] = None
    bio: Optional[str] = None
    service_ids: Optional[List[str]] = None

class WorkerResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    business_id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    photo_url: Optional[str] = None
    bio: Optional[str] = None
    service_ids: List[str] = []
    schedule: Dict[str, Any] = {}
    exceptions: List[Dict[str, Any]] = []
    active: bool = True
    is_manager: bool = False
    manager_permissions: Optional[Dict[str, bool]] = None
    manager_designated_at: Optional[str] = None
    has_manager_pin: bool = False
    created_at: Optional[str] = None
    deactivated_at: Optional[str] = None

class PinCreate(BaseModel):
    pin: str

class PinVerify(BaseModel):
    pin: str

class ManagerLogin(BaseModel):
    business_email: EmailStr
    worker_id: str
    pin: str

class ManagerDesignate(BaseModel):
    permissions: Dict[str, bool] = {}

class ManagerPermissionsUpdate(BaseModel):
    permissions: Dict[str, bool]

class WorkerScheduleUpdate(BaseModel):
    schedule: Dict[str, DaySchedule]

class WorkerExceptionAdd(BaseModel):
    exception: WorkerException


# ========================== SERVICE MODELS ==========================

class ServiceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    duration_minutes: int = 60
    price: float
    category_id: Optional[str] = None
    is_home_service: bool = False
    allowed_worker_ids: List[str] = []

class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    price: Optional[float] = None
    category_id: Optional[str] = None
    is_home_service: Optional[bool] = None
    allowed_worker_ids: Optional[List[str]] = None

class ServiceResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    business_id: str
    name: str
    description: Optional[str] = None
    duration_minutes: int
    price: float
    category_id: Optional[str] = None
    is_home_service: bool = False
    allowed_worker_ids: List[str] = []
    active: bool = True


# ========================== BOOKING MODELS ==========================

class BookingCreate(BaseModel):
    business_id: str
    branch_id: Optional[str] = None  # Multi-branch: which branch this booking belongs to
    service_id: str
    worker_id: Optional[str] = None
    date: str
    time: str
    notes: Optional[str] = None
    is_home_service: bool = False
    address: Optional[str] = None
    skip_payment: bool = False
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    client_info: Optional[str] = None

class BookingResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    business_id: str
    service_id: str
    worker_id: str
    date: str
    time: str
    end_time: str
    duration_minutes: int = 60
    status: str
    notes: Optional[str] = None
    is_home_service: bool = False
    address: Optional[str] = None
    deposit_amount: Optional[float] = None
    deposit_paid: bool = False
    payment_id: Optional[str] = None
    transaction_id: Optional[str] = None
    stripe_session_id: Optional[str] = None
    hold_expires_at: Optional[str] = None
    total_amount: Optional[float] = None
    created_at: str
    confirmed_at: Optional[str] = None
    cancelled_at: Optional[str] = None
    cancelled_by: Optional[str] = None
    cancellation_reason: Optional[str] = None
    business_name: Optional[str] = None
    service_name: Optional[str] = None
    worker_name: Optional[str] = None
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    user_phone: Optional[str] = None
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    client_info: Optional[str] = None
    can_cancel: bool = True
    hours_until_appointment: Optional[float] = None
    has_review: bool = False
    reminder_sent: bool = False
    business_slug: Optional[str] = None
    booked_by: Optional[str] = None

class ReviewCreate(BaseModel):
    business_id: str
    booking_id: str
    rating: int
    comment: Optional[str] = None

class ReviewResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    business_id: str
    booking_id: str
    rating: int
    comment: Optional[str] = None
    created_at: str
    user_name: Optional[str] = None
    user_photo: Optional[str] = None

# ========================== AVAILABILITY MODELS ==========================

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
    workers: List[Dict[str, Any]] = []


# ========================== RESCHEDULE MODELS ==========================

class RescheduleByBusinessRequest(BaseModel):
    new_date: str
    new_time: str
    new_worker_id: Optional[str] = None


# ========================== CONTACT MODELS ==========================

class ContactMessage(BaseModel):
    name: str
    email: str
    subject: Optional[str] = None
    category: Optional[str] = None
    message: str


# ========================== CLOSURE MODELS ==========================

class ClosureDateCreate(BaseModel):
    date: str
    reason: Optional[str] = None

class DepositCheckoutRequest(BaseModel):
    booking_id: str
    use_wallet: bool = False  # If True, apply user wallet balance before charging Stripe

class CancelBookingRequest(BaseModel):
    reason: Optional[str] = None
    refund_to: Optional[str] = "card"  # "card" or "wallet" - where to send the refund


# ========================== WALLET MODELS ==========================

class WalletTransactionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    type: str  # credit_cancellation, credit_admin, credit_business_cancel, debit_booking, debit_expired, etc.
    amount: float  # positive value; type indicates direction
    direction: str  # "credit" or "debit"
    balance_after: float
    booking_id: Optional[str] = None
    description: Optional[str] = None
    currency: str = "MXN"
    created_at: str


class WalletBalanceResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    balance: float
    currency: str = "MXN"
    last_activity_at: Optional[str] = None
    expires_at: Optional[str] = None  # 24 months after last_activity_at if balance > 0
    transactions: List[WalletTransactionResponse] = []
    transactions_total: int = 0


# ========================== PAYMENT MODELS ==========================

class PaymentCreate(BaseModel):
    amount: float
    currency: str = "MXN"
    booking_id: Optional[str] = None
    subscription_type: Optional[str] = None

class PaymentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: Optional[str] = None
    business_id: Optional[str] = None
    booking_id: Optional[str] = None
    amount: float
    currency: str
    status: str
    stripe_session_id: Optional[str] = None
    payment_type: str
    created_at: str

class TransactionCreate(BaseModel):
    booking_id: str
    amount: float
    currency: str = "MXN"

class TransactionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    booking_id: str
    user_id: str
    business_id: str
    stripe_session_id: Optional[str] = None
    stripe_payment_intent_id: Optional[str] = None
    amount_total: float
    fee_amount: float
    payout_amount: float
    currency: str = "MXN"
    status: str
    refund_amount: Optional[float] = None
    refund_reason: Optional[str] = None
    cancelled_by: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None
    paid_at: Optional[str] = None


# ========================== LEDGER & SETTLEMENT MODELS ==========================

class LedgerEntryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    transaction_id: str
    booking_id: Optional[str] = None
    business_id: str
    direction: str
    account: str
    amount_cents: int
    amount: float
    currency: str = "MXN"
    country: str = "MX"
    entry_status: str = "posted"
    description: Optional[str] = None
    related_appointment_id: Optional[str] = None
    created_by: str = "system"
    created_at: str

class SettlementResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    business_id: str
    business_name: Optional[str] = None
    period_key: str
    period_start: str
    period_end: str
    gross_paid: float
    total_fees: float
    total_refunds: float
    total_penalties: float
    net_payout: float
    currency: str = "MXN"
    country: str = "MX"
    status: str
    held_reason: Optional[str] = None
    idempotency_key: str
    payout_reference: Optional[str] = None
    paid_at: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None

class SettlementMarkPaidRequest(BaseModel):
    payout_reference: str

class BusinessFinanceSummary(BaseModel):
    gross_revenue: float
    total_fees: float
    total_refunds: float
    total_penalties: float
    net_earnings: float
    pending_payout: float
    paid_payout: float
    held_payout: float
    next_settlement_date: Optional[str] = None
    currency: str = "MXN"

class PayoutHoldRequest(BaseModel):
    hold: bool
    reason: Optional[str] = None


# ========================== ADMIN MODELS ==========================

class AuditLogResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    admin_id: str
    admin_email: str
    action: str
    target_type: str
    target_id: str
    details: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: str

class NotificationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    title: str
    message: str
    type: str
    read: bool = False
    created_at: str
    data: Optional[Dict[str, Any]] = None


class CategoryUpdate(BaseModel):
    name_es: Optional[str] = None
    name_en: Optional[str] = None
    slug: Optional[str] = None
    icon: Optional[str] = None
    image_url: Optional[str] = None
    active: Optional[bool] = None


class PlatformConfigUpdate(BaseModel):
    platform_fee_percent: Optional[float] = None
    subscription_price_mxn: Optional[float] = None
    subscription_trial_days: Optional[int] = None
    min_deposit_amount: Optional[float] = None


class PlatformConfigResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    platform_fee_percent: float = 0.08
    subscription_price_mxn: float = 49.99
    subscription_trial_days: int = 30
    min_deposit_amount: float = 100.0
    bookvia_fee_mxn: float = 8.00
    stripe_fee_percent_estimated: float = 0.085
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None


class SupportTicketCreate(BaseModel):
    subject: str
    message: str
    category: str = "general"
    business_id: Optional[str] = None
    booking_id: Optional[str] = None


class SupportTicketResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    subject: str
    category: str = "general"
    status: str = "open"
    business_id: Optional[str] = None
    business_name: Optional[str] = None
    booking_id: Optional[str] = None
    messages: list = []
    created_at: str
    updated_at: Optional[str] = None
    closed_at: Optional[str] = None


class TicketMessageCreate(BaseModel):
    message: str


class StaffCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role_label: str = "staff"
    permissions: List[str] = []


class StaffUpdate(BaseModel):
    full_name: Optional[str] = None
    role_label: Optional[str] = None
    permissions: Optional[List[str]] = None
    active: Optional[bool] = None
