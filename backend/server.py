from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, BackgroundTasks, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr, validator
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import pyotp
import qrcode
import io
import base64
import random
import re
from bson import ObjectId
from enum import Enum

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'bookvia-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# SMS Config (mock by default)
SMS_PROVIDER = os.environ.get('SMS_PROVIDER', 'mock')  # 'mock' or 'twilio'
TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID', '')
TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN', '')
TWILIO_PHONE_NUMBER = os.environ.get('TWILIO_PHONE_NUMBER', '')

# Stripe Config
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', 'sk_test_emergent')

# Admin Config (from environment - NEVER hardcode)
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL')
ADMIN_INITIAL_PASSWORD = os.environ.get('ADMIN_INITIAL_PASSWORD')

# Environment
ENV = os.environ.get('ENV', 'development')

# Create the main app
app = FastAPI(title="Bookvia API", version="1.0.0")

# Create routers
api_router = APIRouter(prefix="/api")
auth_router = APIRouter(prefix="/auth", tags=["Authentication"])
users_router = APIRouter(prefix="/users", tags=["Users"])
businesses_router = APIRouter(prefix="/businesses", tags=["Businesses"])
services_router = APIRouter(prefix="/services", tags=["Services"])
bookings_router = APIRouter(prefix="/bookings", tags=["Bookings"])
reviews_router = APIRouter(prefix="/reviews", tags=["Reviews"])
categories_router = APIRouter(prefix="/categories", tags=["Categories"])
payments_router = APIRouter(prefix="/payments", tags=["Payments"])
admin_router = APIRouter(prefix="/admin", tags=["Admin"])
notifications_router = APIRouter(prefix="/notifications", tags=["Notifications"])

security = HTTPBearer(auto_error=False)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ========================== ENUMS ==========================

class UserRole(str, Enum):
    USER = "user"
    BUSINESS = "business"
    ADMIN = "admin"

class AppointmentStatus(str, Enum):
    HOLD = "hold"  # Slot reservado, esperando pago (30 min)
    CONFIRMED = "confirmed"  # Pago completado
    COMPLETED = "completed"  # Cita finalizada
    CANCELLED = "cancelled"  # Cancelada por cliente o negocio
    NO_SHOW = "no_show"  # Cliente no asistió
    EXPIRED = "expired"  # Hold expirado sin pago

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
    CREATED = "created"  # Checkout creado / hold activo
    PAID = "paid"  # Confirmado por webhook
    REFUND_PARTIAL = "refund_partial"  # Cliente cancela >24h, se devuelve anticipo-fee
    REFUND_FULL = "refund_full"  # Negocio cancela, se devuelve 100% al cliente
    NO_SHOW_PAYOUT = "no_show_payout"  # Cliente no asiste, negocio recibe anticipo-fee
    BUSINESS_CANCEL_FEE = "business_cancel_fee"  # Negocio cancela, se le cobra 8%
    EXPIRED = "expired"  # Hold expirado sin pago

# Platform fee constant
PLATFORM_FEE_PERCENT = 0.08  # 8%
HOLD_EXPIRATION_MINUTES = 30
MIN_DEPOSIT_AMOUNT = 50.0  # MXN

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

# ========================== MODELS ==========================

class TokenData(BaseModel):
    user_id: str
    role: UserRole
    email: str

# User Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    phone: str
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
    birth_date: Optional[str] = None
    gender: Optional[str] = None
    photo_url: Optional[str] = None
    role: str = "user"
    active_appointments_count: int = 0
    cancellation_count: int = 0
    suspended_until: Optional[str] = None
    favorites: List[str] = []
    preferred_language: str = "es"
    created_at: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    birth_date: Optional[str] = None
    gender: Optional[str] = None
    photo_url: Optional[str] = None
    preferred_language: Optional[str] = None

# Phone Verification
class PhoneVerifyRequest(BaseModel):
    phone: str

class PhoneVerifyConfirm(BaseModel):
    phone: str
    code: str

# Business Models
class BusinessCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: str
    description: str
    category_id: str
    address: str
    city: str
    state: str
    country: str = "MX"
    zip_code: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    # Legal documents
    ine_url: Optional[str] = None
    rfc: str
    proof_of_address_url: Optional[str] = None
    clabe: str
    legal_name: str
    # Business settings
    requires_deposit: bool = False
    deposit_amount: float = 50.0
    min_time_between_appointments: int = 0  # minutes
    service_radius_km: Optional[float] = None  # for home service
    plan_type: str = "basic"  # basic, premium

class BusinessResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    email: str
    phone: str
    phone_verified: bool = False
    description: str
    category_id: str
    category_name: Optional[str] = None
    address: str
    city: str
    state: str
    country: str
    zip_code: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: str = "pending"
    rating: float = 0.0
    review_count: int = 0
    completed_appointments: int = 0
    badges: List[str] = []
    requires_deposit: bool = False
    deposit_amount: float = 50.0
    photos: List[str] = []
    logo_url: Optional[str] = None
    slug: str
    created_at: str
    is_featured: bool = False
    plan_type: str = "basic"
    trial_ends_at: Optional[str] = None
    can_accept_bookings: bool = True  # False if PENDING_REVIEW

class BusinessUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    requires_deposit: Optional[bool] = None
    deposit_amount: Optional[float] = None
    min_time_between_appointments: Optional[int] = None
    service_radius_km: Optional[float] = None
    photos: Optional[List[str]] = None
    logo_url: Optional[str] = None

# Worker Models
class WorkerCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    photo_url: Optional[str] = None
    bio: Optional[str] = None
    service_ids: List[str] = []

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
    blocked_slots: List[Dict[str, Any]] = []
    vacation_dates: List[str] = []
    active: bool = True

class WorkerSchedule(BaseModel):
    day_of_week: int  # 0-6, Monday=0
    start_time: str  # "09:00"
    end_time: str  # "18:00"
    is_available: bool = True

# Service Models
class ServiceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    duration_minutes: int = 60
    price: float
    category_id: Optional[str] = None
    is_home_service: bool = False

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
    active: bool = True

# Booking Models
class BookingCreate(BaseModel):
    business_id: str
    service_id: str
    worker_id: Optional[str] = None  # null = any available
    date: str  # "2024-01-15"
    time: str  # "10:00"
    notes: Optional[str] = None
    is_home_service: bool = False
    address: Optional[str] = None

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
    # Populated fields
    business_name: Optional[str] = None
    service_name: Optional[str] = None
    worker_name: Optional[str] = None
    user_name: Optional[str] = None
    # Computed fields
    can_cancel: bool = True
    hours_until_appointment: Optional[float] = None

# Review Models
class ReviewCreate(BaseModel):
    business_id: str
    booking_id: str
    rating: int  # 1-5
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

# Category Models
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

# Payment Models
class PaymentCreate(BaseModel):
    amount: float
    currency: str = "MXN"
    booking_id: Optional[str] = None
    subscription_type: Optional[str] = None  # monthly, monthly_deposit

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
    payment_type: str  # deposit, subscription, refund
    created_at: str

# Transaction Models (Bookvia-specific)
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
    fee_amount: float  # 8% platform fee
    payout_amount: float  # Amount for business (amount - fee)
    currency: str = "MXN"
    status: str  # TransactionStatus enum
    refund_amount: Optional[float] = None
    refund_reason: Optional[str] = None
    cancelled_by: Optional[str] = None  # "user" or "business"
    created_at: str
    updated_at: Optional[str] = None
    paid_at: Optional[str] = None
    
# Deposit checkout request
class DepositCheckoutRequest(BaseModel):
    booking_id: str

# Cancel booking request
class CancelBookingRequest(BaseModel):
    reason: Optional[str] = None

# Admin 2FA
class Admin2FASetup(BaseModel):
    password: str

class Admin2FAVerify(BaseModel):
    code: str

class AdminLogin(BaseModel):
    email: EmailStr
    password: str
    totp_code: str

# Audit Log Models
class AuditLogResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    admin_id: str
    admin_email: str
    action: str
    target_type: str  # business, user, review, payment
    target_id: str
    details: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: str

# Notification Models
class NotificationResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    title: str
    message: str
    type: str  # booking, reminder, system
    read: bool = False
    created_at: str
    data: Optional[Dict[str, Any]] = None

# Search Models
class SearchQuery(BaseModel):
    query: Optional[str] = None
    category_id: Optional[str] = None
    city: Optional[str] = None
    date: Optional[str] = None
    min_rating: Optional[float] = None
    is_home_service: Optional[bool] = None
    page: int = 1
    limit: int = 20

# ========================== HELPERS ==========================

def generate_id() -> str:
    return str(uuid.uuid4())

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, role: str, email: str) -> str:
    payload = {
        "user_id": user_id,
        "role": role,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> Optional[TokenData]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return TokenData(**payload)
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Optional[TokenData]:
    if not credentials:
        return None
    return decode_token(credentials.credentials)

async def require_auth(credentials: HTTPAuthorizationCredentials = Depends(security)) -> TokenData:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    token_data = decode_token(credentials.credentials)
    if not token_data:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return token_data

async def require_admin(token_data: TokenData = Depends(require_auth)) -> TokenData:
    if token_data.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return token_data

async def require_business(token_data: TokenData = Depends(require_auth)) -> TokenData:
    if token_data.role not in [UserRole.BUSINESS, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Business access required")
    return token_data

def generate_slug(name: str) -> str:
    slug = name.lower()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    return slug.strip('-')

def calculate_bayesian_rating(rating_sum: float, review_count: int, global_avg: float = 3.5, min_reviews: int = 5) -> float:
    """Calculate Bayesian average rating"""
    if review_count == 0:
        return 0.0
    return (min_reviews * global_avg + rating_sum) / (min_reviews + review_count)

async def send_sms(phone: str, message: str):
    """Send SMS - mock or real"""
    if SMS_PROVIDER == 'mock':
        logger.info(f"[MOCK SMS] To: {phone} | Message: {message}")
        return True
    elif SMS_PROVIDER == 'twilio':
        try:
            from twilio.rest import Client
            client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
            client.messages.create(body=message, from_=TWILIO_PHONE_NUMBER, to=phone)
            return True
        except Exception as e:
            logger.error(f"SMS Error: {e}")
            return False
    return False

async def create_notification(user_id: str, title: str, message: str, notif_type: str, data: dict = None):
    """Create internal notification"""
    notification = {
        "id": generate_id(),
        "user_id": user_id,
        "title": title,
        "message": message,
        "type": notif_type,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "data": data or {}
    }
    await db.notifications.insert_one(notification)
    return notification

async def create_audit_log(
    admin_id: str,
    admin_email: str,
    action: str,
    target_type: str,
    target_id: str,
    details: dict = None,
    request: Request = None
):
    """Create audit log for admin actions"""
    audit_log = {
        "id": generate_id(),
        "admin_id": admin_id,
        "admin_email": admin_email,
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "details": details or {},
        "ip_address": request.client.host if request else None,
        "user_agent": request.headers.get("user-agent") if request else None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.audit_logs.insert_one(audit_log)
    logger.info(f"[AUDIT] {admin_email} - {action} - {target_type}:{target_id}")
    return audit_log

# ========================== AUTH ROUTES ==========================

@auth_router.post("/register", response_model=dict)
async def register_user(user: UserCreate):
    # Check if email exists
    existing = await db.users.find_one({"email": user.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_doc = {
        "id": generate_id(),
        "email": user.email,
        "password_hash": hash_password(user.password),
        "full_name": user.full_name,
        "phone": user.phone,
        "phone_verified": False,
        "birth_date": user.birth_date,
        "gender": user.gender,
        "photo_url": user.photo_url,
        "role": UserRole.USER,
        "active_appointments_count": 0,
        "cancellation_count": 0,
        "suspended_until": None,
        "favorites": [],
        "preferred_language": user.preferred_language,
        "stripe_customer_id": None,
        "saved_cards": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_doc)
    token = create_token(user_doc["id"], UserRole.USER, user.email)
    
    return {"token": token, "user": UserResponse(**user_doc).model_dump()}

@auth_router.post("/login", response_model=dict)
async def login_user(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Check suspension
    if user.get("suspended_until"):
        suspended_until = datetime.fromisoformat(user["suspended_until"])
        if suspended_until > datetime.now(timezone.utc):
            raise HTTPException(status_code=403, detail=f"Account suspended until {user['suspended_until']}")
    
    token = create_token(user["id"], user["role"], user["email"])
    return {"token": token, "user": UserResponse(**user).model_dump()}

@auth_router.post("/phone/send-code")
async def send_phone_code(request: PhoneVerifyRequest):
    code = str(random.randint(100000, 999999))
    
    # Store code with expiration
    await db.phone_codes.update_one(
        {"phone": request.phone},
        {"$set": {"code": code, "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()}},
        upsert=True
    )
    
    # Send SMS
    message = f"Tu codigo de verificacion Bookvia es: {code}"
    await send_sms(request.phone, message)
    
    # In dev mode, return code (remove in production)
    is_dev = os.environ.get('ENV', 'development') == 'development'
    response = {"message": "Code sent successfully"}
    if is_dev:
        response["dev_code"] = code
    return response

@auth_router.post("/phone/verify")
async def verify_phone_code(request: PhoneVerifyConfirm, token_data: TokenData = Depends(require_auth)):
    stored = await db.phone_codes.find_one({"phone": request.phone})
    if not stored:
        raise HTTPException(status_code=400, detail="No code found for this phone")
    
    if stored["code"] != request.code:
        raise HTTPException(status_code=400, detail="Invalid code")
    
    expires_at = datetime.fromisoformat(stored["expires_at"])
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Code expired")
    
    # Mark phone as verified
    await db.users.update_one(
        {"id": token_data.user_id},
        {"$set": {"phone_verified": True, "phone": request.phone}}
    )
    
    await db.phone_codes.delete_one({"phone": request.phone})
    return {"message": "Phone verified successfully"}

@auth_router.get("/me", response_model=UserResponse)
async def get_current_user_profile(token_data: TokenData = Depends(require_auth)):
    user = await db.users.find_one({"id": token_data.user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(**user)

# ========================== BUSINESS AUTH ROUTES ==========================

@auth_router.post("/business/register", response_model=dict)
async def register_business(business: BusinessCreate):
    existing = await db.businesses.find_one({"email": business.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Also create user account for business owner
    user_id = generate_id()
    business_id = generate_id()
    slug = generate_slug(business.name) + "-" + business_id[:8]
    
    # Calculate trial end (3 months free)
    trial_ends = (datetime.now(timezone.utc) + timedelta(days=90)).isoformat()
    
    business_doc = {
        "id": business_id,
        "user_id": user_id,
        "name": business.name,
        "email": business.email,
        "password_hash": hash_password(business.password),
        "phone": business.phone,
        "phone_verified": False,
        "description": business.description,
        "category_id": business.category_id,
        "address": business.address,
        "city": business.city,
        "state": business.state,
        "country": business.country,
        "zip_code": business.zip_code,
        "latitude": business.latitude,
        "longitude": business.longitude,
        "ine_url": business.ine_url,
        "rfc": business.rfc,
        "proof_of_address_url": business.proof_of_address_url,
        "clabe": business.clabe,
        "legal_name": business.legal_name,
        "status": BusinessStatus.PENDING,
        "rating": 0.0,
        "rating_sum": 0.0,
        "review_count": 0,
        "completed_appointments": 0,
        "badges": ["nuevo"],
        "requires_deposit": business.requires_deposit,
        "deposit_amount": max(business.deposit_amount, 50.0),
        "min_time_between_appointments": business.min_time_between_appointments,
        "service_radius_km": business.service_radius_km,
        "photos": [],
        "logo_url": None,
        "slug": slug,
        "plan_type": business.plan_type,
        "stripe_account_id": None,
        "stripe_subscription_id": None,
        "trial_ends_at": trial_ends,
        "is_featured": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    user_doc = {
        "id": user_id,
        "email": business.email,
        "password_hash": hash_password(business.password),
        "full_name": business.legal_name,
        "phone": business.phone,
        "phone_verified": False,
        "role": UserRole.BUSINESS,
        "business_id": business_id,
        "preferred_language": "es",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.businesses.insert_one(business_doc)
    await db.users.insert_one(user_doc)
    
    token = create_token(user_id, UserRole.BUSINESS, business.email)
    
    return {"token": token, "business": BusinessResponse(**business_doc).model_dump()}

@auth_router.post("/business/login", response_model=dict)
async def login_business(credentials: UserLogin):
    business = await db.businesses.find_one({"email": credentials.email})
    if not business:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(credentials.password, business["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user = await db.users.find_one({"business_id": business["id"]})
    if not user:
        raise HTTPException(status_code=500, detail="User account not found")
    
    token = create_token(user["id"], UserRole.BUSINESS, business["email"])
    return {"token": token, "business": BusinessResponse(**business).model_dump()}

# ========================== ADMIN AUTH ROUTES ==========================

@auth_router.post("/admin/setup-2fa", response_model=dict)
async def setup_admin_2fa(setup: Admin2FASetup, token_data: TokenData = Depends(require_admin)):
    user = await db.users.find_one({"id": token_data.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if not verify_password(setup.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid password")
    
    # Generate TOTP secret
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(name=user["email"], issuer_name="Bookvia Admin")
    
    # Generate QR code
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(provisioning_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    qr_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
    
    # Generate backup codes
    backup_codes = [str(random.randint(10000000, 99999999)) for _ in range(8)]
    hashed_backups = [hash_password(code) for code in backup_codes]
    
    # Store secret (not yet verified)
    await db.users.update_one(
        {"id": token_data.user_id},
        {"$set": {
            "totp_secret_pending": secret,
            "backup_codes_pending": hashed_backups
        }}
    )
    
    return {
        "qr_code": f"data:image/png;base64,{qr_base64}",
        "secret": secret,
        "backup_codes": backup_codes,
        "message": "Scan QR code with authenticator app, then verify with a code"
    }

@auth_router.post("/admin/verify-2fa")
async def verify_admin_2fa(verify: Admin2FAVerify, token_data: TokenData = Depends(require_admin)):
    user = await db.users.find_one({"id": token_data.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    pending_secret = user.get("totp_secret_pending")
    if not pending_secret:
        raise HTTPException(status_code=400, detail="No 2FA setup in progress")
    
    totp = pyotp.TOTP(pending_secret)
    if not totp.verify(verify.code):
        raise HTTPException(status_code=400, detail="Invalid code")
    
    # Activate 2FA
    await db.users.update_one(
        {"id": token_data.user_id},
        {
            "$set": {
                "totp_secret": pending_secret,
                "backup_codes": user.get("backup_codes_pending", []),
                "totp_enabled": True
            },
            "$unset": {
                "totp_secret_pending": "",
                "backup_codes_pending": ""
            }
        }
    )
    
    return {"message": "2FA enabled successfully"}

@auth_router.post("/admin/login", response_model=dict)
async def admin_login(credentials: AdminLogin, request: Request):
    user = await db.users.find_one({"email": credentials.email, "role": UserRole.ADMIN})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Check if 2FA is enabled - REQUIRED for admin
    if not user.get("totp_enabled"):
        # Return special response indicating 2FA setup required
        temp_token = create_token(user["id"], UserRole.ADMIN, user["email"])
        return {
            "requires_2fa_setup": True,
            "temp_token": temp_token,
            "message": "2FA setup required before accessing admin panel"
        }
    
    # Verify 2FA
    totp = pyotp.TOTP(user["totp_secret"])
    if not totp.verify(credentials.totp_code):
        # Check backup codes
        valid_backup = False
        for i, hashed_code in enumerate(user.get("backup_codes", [])):
            if verify_password(credentials.totp_code, hashed_code):
                valid_backup = True
                # Remove used backup code
                backup_codes = user["backup_codes"]
                backup_codes.pop(i)
                await db.users.update_one(
                    {"id": user["id"]},
                    {"$set": {"backup_codes": backup_codes}}
                )
                break
        
        if not valid_backup:
            raise HTTPException(status_code=401, detail="Invalid 2FA code")
    
    # Create audit log for admin login
    await create_audit_log(
        admin_id=user["id"],
        admin_email=user["email"],
        action=AuditAction.ADMIN_LOGIN,
        target_type="admin",
        target_id=user["id"],
        details={"login_successful": True},
        request=request
    )
    
    token = create_token(user["id"], UserRole.ADMIN, user["email"])
    return {"token": token, "user": UserResponse(**user).model_dump(), "totp_enabled": True}

# ========================== USER ROUTES ==========================

@users_router.put("/me", response_model=UserResponse)
async def update_user_profile(update: UserUpdate, token_data: TokenData = Depends(require_auth)):
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    await db.users.update_one({"id": token_data.user_id}, {"$set": update_data})
    user = await db.users.find_one({"id": token_data.user_id}, {"_id": 0, "password_hash": 0})
    return UserResponse(**user)

@users_router.post("/favorites/{business_id}")
async def add_favorite(business_id: str, token_data: TokenData = Depends(require_auth)):
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    await db.users.update_one(
        {"id": token_data.user_id},
        {"$addToSet": {"favorites": business_id}}
    )
    return {"message": "Added to favorites"}

@users_router.delete("/favorites/{business_id}")
async def remove_favorite(business_id: str, token_data: TokenData = Depends(require_auth)):
    await db.users.update_one(
        {"id": token_data.user_id},
        {"$pull": {"favorites": business_id}}
    )
    return {"message": "Removed from favorites"}

@users_router.get("/favorites", response_model=List[BusinessResponse])
async def get_favorites(token_data: TokenData = Depends(require_auth)):
    user = await db.users.find_one({"id": token_data.user_id})
    if not user or not user.get("favorites"):
        return []
    
    businesses = await db.businesses.find(
        {"id": {"$in": user["favorites"]}, "status": BusinessStatus.APPROVED},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    
    return [BusinessResponse(**b) for b in businesses]

# ========================== CATEGORY ROUTES ==========================

@categories_router.get("/", response_model=List[CategoryResponse])
async def get_categories():
    categories = await db.categories.find({}, {"_id": 0}).to_list(100)
    
    # Add business count for each category
    for cat in categories:
        count = await db.businesses.count_documents({"category_id": cat["id"], "status": BusinessStatus.APPROVED})
        cat["business_count"] = count
    
    return [CategoryResponse(**c) for c in categories]

@categories_router.get("/{slug}", response_model=CategoryResponse)
async def get_category_by_slug(slug: str):
    category = await db.categories.find_one({"slug": slug}, {"_id": 0})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    count = await db.businesses.count_documents({"category_id": category["id"], "status": BusinessStatus.APPROVED})
    category["business_count"] = count
    
    return CategoryResponse(**category)

@categories_router.post("/", response_model=CategoryResponse)
async def create_category(category: CategoryCreate, token_data: TokenData = Depends(require_admin)):
    category_doc = {
        "id": generate_id(),
        **category.model_dump()
    }
    await db.categories.insert_one(category_doc)
    return CategoryResponse(**category_doc)

# ========================== BUSINESS ROUTES ==========================

@businesses_router.get("/", response_model=List[BusinessResponse])
async def search_businesses(
    query: Optional[str] = None,
    category_id: Optional[str] = None,
    city: Optional[str] = None,
    min_rating: Optional[float] = None,
    is_home_service: Optional[bool] = None,
    include_pending: bool = False,
    page: int = 1,
    limit: int = 20
):
    # By default only show approved businesses
    # If include_pending=True, also show PENDING (for profile viewing, but no bookings)
    if include_pending:
        filters = {"status": {"$in": [BusinessStatus.APPROVED, BusinessStatus.PENDING]}}
    else:
        filters = {"status": BusinessStatus.APPROVED}
    
    if query:
        filters["$or"] = [
            {"name": {"$regex": query, "$options": "i"}},
            {"description": {"$regex": query, "$options": "i"}}
        ]
    if category_id:
        filters["category_id"] = category_id
    if city:
        filters["city"] = {"$regex": city, "$options": "i"}
    if min_rating:
        filters["rating"] = {"$gte": min_rating}
    if is_home_service is not None:
        filters["service_radius_km"] = {"$exists": True, "$ne": None} if is_home_service else {"$in": [None, 0]}
    
    skip = (page - 1) * limit
    businesses = await db.businesses.find(
        filters,
        {"_id": 0, "password_hash": 0, "clabe": 0, "rfc": 0, "ine_url": 0, "proof_of_address_url": 0}
    ).sort("rating", -1).skip(skip).limit(limit).to_list(limit)
    
    # Add category names and booking availability
    for b in businesses:
        if b.get("category_id"):
            cat = await db.categories.find_one({"id": b["category_id"]})
            if cat:
                b["category_name"] = cat.get("name_es", "")
        # Mark if business can accept bookings
        b["can_accept_bookings"] = b.get("status") == BusinessStatus.APPROVED
    
    return [BusinessResponse(**b) for b in businesses]

@businesses_router.get("/featured", response_model=List[BusinessResponse])
async def get_featured_businesses(limit: int = 8):
    businesses = await db.businesses.find(
        {"status": BusinessStatus.APPROVED, "is_featured": True},
        {"_id": 0, "password_hash": 0, "clabe": 0, "rfc": 0}
    ).sort("rating", -1).limit(limit).to_list(limit)
    
    # If not enough featured, add top rated
    if len(businesses) < limit:
        existing_ids = [b["id"] for b in businesses]
        more = await db.businesses.find(
            {"status": BusinessStatus.APPROVED, "id": {"$nin": existing_ids}},
            {"_id": 0, "password_hash": 0, "clabe": 0, "rfc": 0}
        ).sort("rating", -1).limit(limit - len(businesses)).to_list(limit - len(businesses))
        businesses.extend(more)
    
    return [BusinessResponse(**b) for b in businesses]

@businesses_router.get("/slug/{slug}", response_model=BusinessResponse)
async def get_business_by_slug(slug: str):
    business = await db.businesses.find_one(
        {"slug": slug},
        {"_id": 0, "password_hash": 0, "clabe": 0, "rfc": 0, "ine_url": 0, "proof_of_address_url": 0}
    )
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    if business.get("category_id"):
        cat = await db.categories.find_one({"id": business["category_id"]})
        if cat:
            business["category_name"] = cat.get("name_es", "")
    
    return BusinessResponse(**business)

@businesses_router.get("/{business_id}", response_model=BusinessResponse)
async def get_business(business_id: str):
    business = await db.businesses.find_one(
        {"id": business_id},
        {"_id": 0, "password_hash": 0, "clabe": 0, "rfc": 0, "ine_url": 0, "proof_of_address_url": 0}
    )
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    return BusinessResponse(**business)

@businesses_router.put("/me", response_model=BusinessResponse)
async def update_my_business(update: BusinessUpdate, token_data: TokenData = Depends(require_business)):
    user = await db.users.find_one({"id": token_data.user_id})
    if not user or not user.get("business_id"):
        raise HTTPException(status_code=404, detail="Business not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    if "deposit_amount" in update_data:
        update_data["deposit_amount"] = max(update_data["deposit_amount"], 50.0)
    
    await db.businesses.update_one({"id": user["business_id"]}, {"$set": update_data})
    business = await db.businesses.find_one({"id": user["business_id"]}, {"_id": 0, "password_hash": 0})
    return BusinessResponse(**business)

@businesses_router.get("/me/dashboard")
async def get_business_dashboard(token_data: TokenData = Depends(require_business)):
    user = await db.users.find_one({"id": token_data.user_id})
    if not user or not user.get("business_id"):
        raise HTTPException(status_code=404, detail="Business not found")
    
    business = await db.businesses.find_one({"id": user["business_id"]}, {"_id": 0, "password_hash": 0})
    
    # Get stats
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    today_appointments = await db.bookings.count_documents({
        "business_id": business["id"],
        "date": today,
        "status": {"$in": [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]}
    })
    
    pending_appointments = await db.bookings.count_documents({
        "business_id": business["id"],
        "status": AppointmentStatus.PENDING
    })
    
    # This month revenue
    first_of_month = datetime.now(timezone.utc).replace(day=1).strftime("%Y-%m-%d")
    month_bookings = await db.bookings.find({
        "business_id": business["id"],
        "date": {"$gte": first_of_month},
        "status": AppointmentStatus.COMPLETED
    }).to_list(1000)
    
    month_revenue = sum(b.get("total_amount", 0) for b in month_bookings)
    
    return {
        "business": BusinessResponse(**business).model_dump(),
        "stats": {
            "today_appointments": today_appointments,
            "pending_appointments": pending_appointments,
            "month_revenue": month_revenue,
            "total_reviews": business.get("review_count", 0),
            "rating": business.get("rating", 0)
        }
    }

# ========================== WORKER ROUTES ==========================

@businesses_router.post("/workers", response_model=WorkerResponse)
async def create_worker(worker: WorkerCreate, token_data: TokenData = Depends(require_business)):
    user = await db.users.find_one({"id": token_data.user_id})
    if not user or not user.get("business_id"):
        raise HTTPException(status_code=404, detail="Business not found")
    
    worker_doc = {
        "id": generate_id(),
        "business_id": user["business_id"],
        "name": worker.name,
        "email": worker.email,
        "phone": worker.phone,
        "photo_url": worker.photo_url,
        "bio": worker.bio,
        "service_ids": worker.service_ids,
        "schedule": {},  # Will be set separately
        "blocked_slots": [],
        "vacation_dates": [],
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.workers.insert_one(worker_doc)
    return WorkerResponse(**worker_doc)

@businesses_router.get("/workers", response_model=List[WorkerResponse])
async def get_business_workers(business_id: Optional[str] = None, token_data: TokenData = Depends(require_auth)):
    if not business_id:
        user = await db.users.find_one({"id": token_data.user_id})
        if not user or not user.get("business_id"):
            raise HTTPException(status_code=400, detail="Business ID required")
        business_id = user["business_id"]
    
    workers = await db.workers.find({"business_id": business_id, "active": True}, {"_id": 0}).to_list(100)
    return [WorkerResponse(**w) for w in workers]

@businesses_router.get("/{business_id}/workers", response_model=List[WorkerResponse])
async def get_workers_by_business(business_id: str):
    workers = await db.workers.find({"business_id": business_id, "active": True}, {"_id": 0}).to_list(100)
    return [WorkerResponse(**w) for w in workers]

@businesses_router.put("/workers/{worker_id}/schedule")
async def update_worker_schedule(
    worker_id: str,
    schedules: List[WorkerSchedule],
    token_data: TokenData = Depends(require_business)
):
    user = await db.users.find_one({"id": token_data.user_id})
    worker = await db.workers.find_one({"id": worker_id, "business_id": user.get("business_id")})
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    
    schedule_dict = {}
    for s in schedules:
        schedule_dict[str(s.day_of_week)] = {
            "start_time": s.start_time,
            "end_time": s.end_time,
            "is_available": s.is_available
        }
    
    await db.workers.update_one({"id": worker_id}, {"$set": {"schedule": schedule_dict}})
    return {"message": "Schedule updated"}

# ========================== SERVICE ROUTES ==========================

@services_router.post("/", response_model=ServiceResponse)
async def create_service(service: ServiceCreate, token_data: TokenData = Depends(require_business)):
    user = await db.users.find_one({"id": token_data.user_id})
    if not user or not user.get("business_id"):
        raise HTTPException(status_code=404, detail="Business not found")
    
    service_doc = {
        "id": generate_id(),
        "business_id": user["business_id"],
        **service.model_dump(),
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.services.insert_one(service_doc)
    return ServiceResponse(**service_doc)

@services_router.get("/business/{business_id}", response_model=List[ServiceResponse])
async def get_business_services(business_id: str):
    services = await db.services.find({"business_id": business_id, "active": True}, {"_id": 0}).to_list(100)
    return [ServiceResponse(**s) for s in services]

@services_router.put("/{service_id}", response_model=ServiceResponse)
async def update_service(service_id: str, update: ServiceCreate, token_data: TokenData = Depends(require_business)):
    user = await db.users.find_one({"id": token_data.user_id})
    service = await db.services.find_one({"id": service_id, "business_id": user.get("business_id")})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    await db.services.update_one({"id": service_id}, {"$set": update.model_dump()})
    updated = await db.services.find_one({"id": service_id}, {"_id": 0})
    return ServiceResponse(**updated)

@services_router.delete("/{service_id}")
async def delete_service(service_id: str, token_data: TokenData = Depends(require_business)):
    user = await db.users.find_one({"id": token_data.user_id})
    service = await db.services.find_one({"id": service_id, "business_id": user.get("business_id")})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    await db.services.update_one({"id": service_id}, {"$set": {"active": False}})
    return {"message": "Service deleted"}

# ========================== BOOKING ROUTES ==========================

@bookings_router.get("/availability/{business_id}")
async def get_availability(business_id: str, date: str, service_id: Optional[str] = None):
    """Get available time slots for a business on a specific date"""
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    # Get service duration
    duration = 60
    if service_id:
        service = await db.services.find_one({"id": service_id})
        if service:
            duration = service.get("duration_minutes", 60)
    
    # Get all workers
    workers = await db.workers.find({"business_id": business_id, "active": True}, {"_id": 0}).to_list(100)
    
    # Get existing bookings for the date
    existing_bookings = await db.bookings.find({
        "business_id": business_id,
        "date": date,
        "status": {"$in": [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]}
    }, {"_id": 0}).to_list(1000)
    
    # Parse date to get day of week
    date_obj = datetime.strptime(date, "%Y-%m-%d")
    day_of_week = str(date_obj.weekday())
    
    available_slots = []
    
    for worker in workers:
        schedule = worker.get("schedule", {}).get(day_of_week)
        if not schedule or not schedule.get("is_available", True):
            continue
        
        # Check if on vacation
        if date in worker.get("vacation_dates", []):
            continue
        
        start_time = datetime.strptime(schedule.get("start_time", "09:00"), "%H:%M")
        end_time = datetime.strptime(schedule.get("end_time", "18:00"), "%H:%M")
        
        current_time = start_time
        while current_time + timedelta(minutes=duration) <= end_time:
            time_str = current_time.strftime("%H:%M")
            end_time_str = (current_time + timedelta(minutes=duration)).strftime("%H:%M")
            
            # Check if slot is available (not booked)
            is_available = True
            for booking in existing_bookings:
                if booking["worker_id"] == worker["id"]:
                    booking_start = datetime.strptime(booking["time"], "%H:%M")
                    booking_end = datetime.strptime(booking["end_time"], "%H:%M")
                    slot_start = current_time
                    slot_end = current_time + timedelta(minutes=duration)
                    
                    if not (slot_end <= booking_start or slot_start >= booking_end):
                        is_available = False
                        break
            
            # Check blocked slots
            for blocked in worker.get("blocked_slots", []):
                if blocked.get("date") == date:
                    blocked_start = datetime.strptime(blocked["start_time"], "%H:%M")
                    blocked_end = datetime.strptime(blocked["end_time"], "%H:%M")
                    if not (current_time + timedelta(minutes=duration) <= blocked_start or current_time >= blocked_end):
                        is_available = False
                        break
            
            if is_available:
                available_slots.append({
                    "time": time_str,
                    "end_time": end_time_str,
                    "worker_id": worker["id"],
                    "worker_name": worker["name"]
                })
            
            current_time += timedelta(minutes=30)  # 30 min intervals
    
    return {"date": date, "slots": available_slots}

@bookings_router.post("/", response_model=BookingResponse)
async def create_booking(booking: BookingCreate, token_data: TokenData = Depends(require_auth)):
    # Check user limits
    user = await db.users.find_one({"id": token_data.user_id})
    if user.get("active_appointments_count", 0) >= 5:
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
    
    # Get service
    service = await db.services.find_one({"id": booking.service_id})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    # Determine worker
    worker_id = booking.worker_id
    if not worker_id:
        # Auto-assign to worker with least appointments
        workers = await db.workers.find({"business_id": booking.business_id, "active": True}).to_list(100)
        if not workers:
            raise HTTPException(status_code=400, detail="No workers available")
        
        # Count appointments per worker for this date (include HOLD status)
        worker_counts = {}
        for w in workers:
            count = await db.bookings.count_documents({
                "worker_id": w["id"],
                "date": booking.date,
                "status": {"$in": [AppointmentStatus.HOLD, AppointmentStatus.CONFIRMED]}
            })
            worker_counts[w["id"]] = count
        
        worker_id = min(worker_counts, key=worker_counts.get)
    
    worker = await db.workers.find_one({"id": worker_id})
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    
    # Check if slot is already taken (including HOLD)
    existing_booking = await db.bookings.find_one({
        "worker_id": worker_id,
        "date": booking.date,
        "time": booking.time,
        "status": {"$in": [AppointmentStatus.HOLD, AppointmentStatus.CONFIRMED]}
    })
    if existing_booking:
        raise HTTPException(status_code=409, detail="Slot already taken")
    
    # Calculate end time
    start_time_dt = datetime.strptime(booking.time, "%H:%M")
    end_time_dt = start_time_dt + timedelta(minutes=service["duration_minutes"])
    
    # Calculate deposit amount (minimum 50 MXN)
    deposit_amount = max(
        business.get("deposit_amount", MIN_DEPOSIT_AMOUNT) if business.get("requires_deposit") else MIN_DEPOSIT_AMOUNT,
        MIN_DEPOSIT_AMOUNT
    )
    
    # Create booking with HOLD status
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
        "created_at": datetime.now(timezone.utc).isoformat(),
        "confirmed_at": None,
        "cancelled_at": None,
        "cancelled_by": None,
        "cancellation_reason": None
    }
    
    await db.bookings.insert_one(booking_doc)
    
    # Update user active appointments count
    await db.users.update_one(
        {"id": token_data.user_id},
        {"$inc": {"active_appointments_count": 1}}
    )
    
    # Create notification for business (hold pending payment)
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

@bookings_router.get("/my", response_model=List[BookingResponse])
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
    
    bookings = await db.bookings.find(filters, {"_id": 0}).sort("date", 1).to_list(100)
    
    now = datetime.now(timezone.utc)
    
    # Populate names and calculate fields
    for b in bookings:
        business = await db.businesses.find_one({"id": b["business_id"]})
        service = await db.services.find_one({"id": b["service_id"]})
        worker = await db.workers.find_one({"id": b["worker_id"]})
        
        b["business_name"] = business["name"] if business else None
        b["service_name"] = service["name"] if service else None
        b["worker_name"] = worker["name"] if worker else None
        
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

@bookings_router.get("/business", response_model=List[BookingResponse])
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

@bookings_router.put("/{booking_id}/cancel")
async def cancel_booking(booking_id: str, token_data: TokenData = Depends(require_auth)):
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    # Check if user owns booking or is business owner
    is_user = booking["user_id"] == token_data.user_id
    is_business = False
    
    if not is_user:
        user = await db.users.find_one({"id": token_data.user_id})
        is_business = user.get("business_id") == booking["business_id"]
    
    if not is_user and not is_business:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Check if cancellation is >24h before
    booking_datetime = datetime.strptime(f"{booking['date']} {booking['time']}", "%Y-%m-%d %H:%M")
    booking_datetime = booking_datetime.replace(tzinfo=timezone.utc)
    hours_until = (booking_datetime - datetime.now(timezone.utc)).total_seconds() / 3600
    
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": AppointmentStatus.CANCELLED, "cancelled_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Update user stats
    if is_user:
        await db.users.update_one(
            {"id": token_data.user_id},
            {
                "$inc": {"active_appointments_count": -1, "cancellation_count": 1}
            }
        )
        
        # Check for suspension
        user = await db.users.find_one({"id": token_data.user_id})
        if user["cancellation_count"] >= 4:
            suspended_until = (datetime.now(timezone.utc) + timedelta(days=15)).isoformat()
            await db.users.update_one(
                {"id": token_data.user_id},
                {"$set": {"suspended_until": suspended_until}}
            )
    
    # Handle deposit refund logic would go here
    refund_info = None
    if booking.get("deposit_paid") and booking.get("deposit_amount"):
        if is_user and hours_until > 24:
            # Refund deposit minus 8%
            refund_info = {
                "refund_amount": booking["deposit_amount"] * 0.92,
                "retained_fee": booking["deposit_amount"] * 0.08
            }
        elif is_business:
            # Full refund to customer
            refund_info = {
                "refund_amount": booking["deposit_amount"],
                "business_charged": booking["deposit_amount"] * 0.08
            }
    
    return {"message": "Booking cancelled", "refund_info": refund_info}

@bookings_router.put("/{booking_id}/reschedule")
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

@bookings_router.put("/{booking_id}/confirm")
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

@bookings_router.put("/{booking_id}/complete")
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
    
    return {"message": "Booking completed"}

@bookings_router.put("/{booking_id}/no-show")
async def mark_no_show(booking_id: str, token_data: TokenData = Depends(require_business)):
    user = await db.users.find_one({"id": token_data.user_id})
    booking = await db.bookings.find_one({"id": booking_id, "business_id": user.get("business_id")})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": AppointmentStatus.NO_SHOW}}
    )
    
    # Update user stats
    await db.users.update_one(
        {"id": booking["user_id"]},
        {"$inc": {"active_appointments_count": -1, "cancellation_count": 1}}
    )
    
    return {"message": "Marked as no-show"}

# ========================== REVIEW ROUTES ==========================

@reviews_router.post("/", response_model=ReviewResponse)
async def create_review(review: ReviewCreate, token_data: TokenData = Depends(require_auth)):
    # Verify booking was completed
    booking = await db.bookings.find_one({
        "id": review.booking_id,
        "user_id": token_data.user_id,
        "status": AppointmentStatus.COMPLETED
    })
    
    if not booking:
        raise HTTPException(status_code=400, detail="Can only review completed bookings")
    
    # Check if already reviewed
    existing = await db.reviews.find_one({"booking_id": review.booking_id})
    if existing:
        raise HTTPException(status_code=400, detail="Already reviewed this booking")
    
    user = await db.users.find_one({"id": token_data.user_id})
    
    review_doc = {
        "id": generate_id(),
        "user_id": token_data.user_id,
        "business_id": review.business_id,
        "booking_id": review.booking_id,
        "rating": min(max(review.rating, 1), 5),
        "comment": review.comment,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_name": user["full_name"],
        "user_photo": user.get("photo_url")
    }
    
    await db.reviews.insert_one(review_doc)
    
    # Update business rating (Bayesian)
    business = await db.businesses.find_one({"id": review.business_id})
    new_rating_sum = business.get("rating_sum", 0) + review.rating
    new_review_count = business.get("review_count", 0) + 1
    new_rating = calculate_bayesian_rating(new_rating_sum, new_review_count)
    
    await db.businesses.update_one(
        {"id": review.business_id},
        {"$set": {"rating": round(new_rating, 2), "rating_sum": new_rating_sum, "review_count": new_review_count}}
    )
    
    return ReviewResponse(**review_doc)

@reviews_router.get("/business/{business_id}", response_model=List[ReviewResponse])
async def get_business_reviews(business_id: str, page: int = 1, limit: int = 20):
    skip = (page - 1) * limit
    reviews = await db.reviews.find(
        {"business_id": business_id},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return [ReviewResponse(**r) for r in reviews]

# ========================== PAYMENT ROUTES ==========================

@payments_router.post("/checkout/session")
async def create_checkout_session(request: Request, payment: PaymentCreate, token_data: TokenData = Depends(require_auth)):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
    
    host_url = str(request.base_url).rstrip('/')
    webhook_url = f"{host_url}/api/webhook/stripe"
    
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    # Get origin from frontend
    origin = request.headers.get('origin', host_url)
    success_url = f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/payment/cancel"
    
    checkout_request = CheckoutSessionRequest(
        amount=float(payment.amount),
        currency=payment.currency.lower(),
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": token_data.user_id,
            "booking_id": payment.booking_id or "",
            "subscription_type": payment.subscription_type or ""
        }
    )
    
    session = await stripe_checkout.create_checkout_session(checkout_request)
    
    # Create payment transaction record
    payment_doc = {
        "id": generate_id(),
        "user_id": token_data.user_id,
        "business_id": None,
        "booking_id": payment.booking_id,
        "amount": float(payment.amount),
        "currency": payment.currency,
        "status": PaymentStatus.PENDING,
        "stripe_session_id": session.session_id,
        "payment_type": "deposit" if payment.booking_id else "subscription",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.payment_transactions.insert_one(payment_doc)
    
    return {"url": session.url, "session_id": session.session_id}

@payments_router.get("/checkout/status/{session_id}")
async def get_checkout_status(session_id: str, request: Request):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    
    host_url = str(request.base_url).rstrip('/')
    webhook_url = f"{host_url}/api/webhook/stripe"
    
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    status = await stripe_checkout.get_checkout_status(session_id)
    
    # Update payment transaction
    if status.payment_status == "paid":
        payment = await db.payment_transactions.find_one({"stripe_session_id": session_id})
        if payment and payment["status"] != PaymentStatus.COMPLETED:
            await db.payment_transactions.update_one(
                {"stripe_session_id": session_id},
                {"$set": {"status": PaymentStatus.COMPLETED}}
            )
            
            # If booking deposit, mark as paid
            if payment.get("booking_id"):
                await db.bookings.update_one(
                    {"id": payment["booking_id"]},
                    {"$set": {"deposit_paid": True, "payment_id": payment["id"]}}
                )
    
    return {
        "status": status.status,
        "payment_status": status.payment_status,
        "amount_total": status.amount_total,
        "currency": status.currency
    }

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    
    host_url = str(request.base_url).rstrip('/')
    webhook_url = f"{host_url}/api/webhook/stripe"
    
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    body = await request.body()
    signature = request.headers.get("Stripe-Signature", "")
    
    try:
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        
        if webhook_response.payment_status == "paid":
            await db.payment_transactions.update_one(
                {"stripe_session_id": webhook_response.session_id},
                {"$set": {"status": PaymentStatus.COMPLETED}}
            )
        
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"status": "error", "message": str(e)}

# ========================== NOTIFICATION ROUTES ==========================

@notifications_router.get("/", response_model=List[NotificationResponse])
async def get_notifications(
    unread_only: bool = False,
    token_data: TokenData = Depends(require_auth)
):
    filters = {"user_id": token_data.user_id}
    if unread_only:
        filters["read"] = False
    
    notifications = await db.notifications.find(filters, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    return [NotificationResponse(**n) for n in notifications]

@notifications_router.put("/{notification_id}/read")
async def mark_notification_read(notification_id: str, token_data: TokenData = Depends(require_auth)):
    await db.notifications.update_one(
        {"id": notification_id, "user_id": token_data.user_id},
        {"$set": {"read": True}}
    )
    return {"message": "Marked as read"}

@notifications_router.put("/read-all")
async def mark_all_read(token_data: TokenData = Depends(require_auth)):
    await db.notifications.update_many(
        {"user_id": token_data.user_id},
        {"$set": {"read": True}}
    )
    return {"message": "All marked as read"}

# ========================== ADMIN ROUTES ==========================

@admin_router.get("/stats")
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

@admin_router.get("/businesses/pending", response_model=List[BusinessResponse])
async def get_pending_businesses(token_data: TokenData = Depends(require_admin)):
    businesses = await db.businesses.find(
        {"status": BusinessStatus.PENDING},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    return [BusinessResponse(**b) for b in businesses]

@admin_router.put("/businesses/{business_id}/approve")
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

@admin_router.put("/businesses/{business_id}/reject")
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

@admin_router.put("/businesses/{business_id}/suspend")
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

@admin_router.put("/users/{user_id}/suspend")
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

@admin_router.delete("/reviews/{review_id}")
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

@admin_router.get("/audit-logs", response_model=List[AuditLogResponse])
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

@admin_router.put("/businesses/{business_id}/feature")
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

# Payment hold/release endpoints for admin
@admin_router.put("/payments/{payment_id}/hold")
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

@admin_router.put("/payments/{payment_id}/release")
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

@admin_router.get("/payments/held")
async def get_held_payments(page: int = 1, limit: int = 50, token_data: TokenData = Depends(require_admin)):
    """Get all payments currently on hold"""
    skip = (page - 1) * limit
    payments = await db.payment_transactions.find(
        {"on_hold": True},
        {"_id": 0}
    ).sort("held_at", -1).skip(skip).limit(limit).to_list(limit)
    return payments

# ========================== SEED DATA ==========================

@api_router.post("/seed")
async def seed_data():
    """Seed initial categories and admin user from environment variables"""
    categories = [
        {"id": generate_id(), "name_es": "Belleza y Estética", "name_en": "Beauty & Aesthetics", "slug": "belleza-estetica", "icon": "Sparkles", "image_url": "https://images.pexels.com/photos/853427/pexels-photo-853427.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"},
        {"id": generate_id(), "name_es": "Salud", "name_en": "Health", "slug": "salud", "icon": "Heart", "image_url": "https://images.pexels.com/photos/4270095/pexels-photo-4270095.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"},
        {"id": generate_id(), "name_es": "Fitness y Bienestar", "name_en": "Fitness & Wellness", "slug": "fitness-bienestar", "icon": "Dumbbell", "image_url": "https://images.unsplash.com/photo-1761971975724-31001b4de0bf?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDF8MHwxfHNlYXJjaHwzfHx5b2dhJTIwc3R1ZGlvJTIwaW50ZXJpb3IlMjBjYWxtfGVufDB8fHx8MTc3MTgwMjE1OXww&ixlib=rb-4.1.0&q=85"},
        {"id": generate_id(), "name_es": "Spa y Masajes", "name_en": "Spa & Massage", "slug": "spa-masajes", "icon": "Flower2", "image_url": "https://images.pexels.com/photos/5240677/pexels-photo-5240677.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"},
        {"id": generate_id(), "name_es": "Servicios Legales", "name_en": "Legal Services", "slug": "servicios-legales", "icon": "Scale", "image_url": "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&q=80&w=2070"},
        {"id": generate_id(), "name_es": "Consultoría", "name_en": "Consulting", "slug": "consultoria", "icon": "Briefcase", "image_url": "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=2070"},
        {"id": generate_id(), "name_es": "Automotriz", "name_en": "Automotive", "slug": "automotriz", "icon": "Car", "image_url": "https://images.unsplash.com/photo-1487754180451-c456f719a1fc?auto=format&fit=crop&q=80&w=2070"},
        {"id": generate_id(), "name_es": "Veterinaria", "name_en": "Veterinary", "slug": "veterinaria", "icon": "PawPrint", "image_url": "https://images.unsplash.com/photo-1628009368231-7bb7cfcb0def?auto=format&fit=crop&q=80&w=2070"},
    ]
    
    # Check if already seeded
    existing = await db.categories.count_documents({})
    if existing > 0:
        return {"message": "Already seeded"}
    
    await db.categories.insert_many(categories)
    
    # Create admin user from environment variables - NEVER hardcode credentials
    admin_email = ADMIN_EMAIL
    admin_password = ADMIN_INITIAL_PASSWORD
    
    if not admin_email or not admin_password:
        logger.warning("ADMIN_EMAIL or ADMIN_INITIAL_PASSWORD not set in environment variables")
        return {
            "message": "Categories seeded. Admin not created - set ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD in environment",
            "admin_created": False
        }
    
    # Check if admin already exists
    existing_admin = await db.users.find_one({"email": admin_email})
    if existing_admin:
        return {
            "message": "Categories seeded. Admin already exists",
            "admin_created": False,
            "admin_email": admin_email
        }
    
    admin_doc = {
        "id": generate_id(),
        "email": admin_email,
        "password_hash": hash_password(admin_password),
        "full_name": "Admin Bookvia",
        "phone": "+521234567890",
        "phone_verified": True,
        "role": UserRole.ADMIN,
        "totp_enabled": False,  # Must be enabled on first login
        "totp_secret": None,
        "backup_codes": [],
        "must_change_password": False,  # Set to True if using temp password
        "preferred_language": "es",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(admin_doc)
    
    logger.info(f"Admin user created with email: {admin_email}")
    
    return {
        "message": "Seed data created successfully",
        "admin_created": True,
        "admin_email": admin_email,
        "note": "2FA setup required on first admin login"
    }

# ========================== CITIES ==========================

@api_router.get("/cities")
async def get_cities():
    """Get list of cities with businesses"""
    cities = await db.businesses.distinct("city", {"status": BusinessStatus.APPROVED})
    return [{"name": city, "slug": generate_slug(city)} for city in cities if city]

# ========================== INCLUDE ROUTERS ==========================

api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(businesses_router)
api_router.include_router(services_router)
api_router.include_router(bookings_router)
api_router.include_router(reviews_router)
api_router.include_router(categories_router)
api_router.include_router(payments_router)
api_router.include_router(admin_router)
api_router.include_router(notifications_router)

app.include_router(api_router)

# Add middleware to handle HTTPS redirects behind proxy
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import RedirectResponse

class HTTPSRedirectMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        # If it's a redirect and we're behind HTTPS proxy, fix the Location header
        if response.status_code in (307, 308, 301, 302):
            location = response.headers.get('location', '')
            x_forwarded_proto = request.headers.get('x-forwarded-proto', 'http')
            if x_forwarded_proto == 'https' and location.startswith('http://'):
                new_location = location.replace('http://', 'https://', 1)
                return RedirectResponse(url=new_location, status_code=response.status_code)
        return response

app.add_middleware(HTTPSRedirectMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
