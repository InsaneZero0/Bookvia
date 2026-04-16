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
import pyotp
from bson import ObjectId

from core.database import db
from core.config import ENV, BASE_URL, ADMIN_EMAIL
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

logger = logging.getLogger(__name__)

import stripe as stripe_lib
from core.stripe_config import STRIPE_API_KEY, get_or_create_stripe_price
stripe_lib.api_key = STRIPE_API_KEY
if "sk_test_emergent" in (STRIPE_API_KEY or ""):
    stripe_lib.api_base = "https://integrations.emergentagent.com/stripe"
import httpx

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/register", response_model=dict)
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
        "country": user.country,
        "city": user.city,
        "phone_verified": False,
        "email_verified": False,
        "email_verification_token": generate_id(),
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
    
    # Send verification email (non-blocking)
    try:
        from services.email import send_verification_email
        await send_verification_email(user.email, user.full_name, user_doc["email_verification_token"])
    except Exception as e:
        logger.warning(f"Failed to send verification email: {e}")
    
    return {"message": "Registro exitoso. Revisa tu correo para verificar tu cuenta.", "email": user.email}



@router.post("/login", response_model=dict)
async def login_user(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Check email verification
    if not user.get("email_verified", True):
        raise HTTPException(status_code=403, detail="email_not_verified")
    
    # Check suspension
    if user.get("suspended_until"):
        suspended_until = datetime.fromisoformat(user["suspended_until"])
        if suspended_until > datetime.now(timezone.utc):
            raise HTTPException(status_code=403, detail=f"Account suspended until {user['suspended_until']}")
    
    token = create_token(user["id"], user["role"], user["email"])
    return {"token": token, "user": UserResponse(**user).model_dump()}


@router.post("/unified-login", response_model=dict)
async def unified_login(credentials: UserLogin):
    """Unified login - auto detects if user or business owner."""
    email = credentials.email
    password = credentials.password

    # 1. Try as regular user first
    user = await db.users.find_one({"email": email, "role": UserRole.USER})
    if user:
        if not verify_password(password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if not user.get("email_verified", True):
            raise HTTPException(status_code=403, detail="email_not_verified")
        if user.get("suspended_until"):
            suspended_until = datetime.fromisoformat(user["suspended_until"])
            if suspended_until > datetime.now(timezone.utc):
                raise HTTPException(status_code=403, detail=f"Account suspended until {user['suspended_until']}")
        token = create_token(user["id"], user["role"], user["email"])
        return {"token": token, "user": UserResponse(**user).model_dump(), "account_type": "user"}

    # 2. Try as business owner
    business = await db.businesses.find_one({"email": email})
    if business:
        if not verify_password(password, business["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        biz_user = await db.users.find_one({"business_id": business["id"]})
        if not biz_user:
            raise HTTPException(status_code=500, detail="User account not found")
        sub_status = business.get("subscription_status", "none")
        if sub_status == "none":
            raise HTTPException(status_code=403, detail="subscription_required")
        if not biz_user.get("email_verified", True):
            raise HTTPException(status_code=403, detail="email_not_verified")
        business.setdefault("description", "")
        business.setdefault("category_id", "")
        business.setdefault("address", "")
        business.setdefault("city", "")
        business.setdefault("state", "")
        business.setdefault("country", "MX")
        business.setdefault("zip_code", "")
        business.setdefault("subscription_status", "none")
        business.pop("_id", None)
        token = create_token(biz_user["id"], UserRole.BUSINESS, business["email"])
        return {"token": token, "business": BusinessResponse(**business).model_dump(), "account_type": "business"}

    raise HTTPException(status_code=401, detail="Invalid credentials")
@router.get("/verify-email")
async def verify_email(token: str):
    """Verify user email address using token from email"""
    user = await db.users.find_one({"email_verification_token": token})
    if not user:
        raise HTTPException(status_code=400, detail="Token de verificación inválido o expirado")
    
    if user.get("email_verified"):
        return {"message": "Email ya verificado", "already_verified": True}
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"email_verified": True}, "$unset": {"email_verification_token": ""}}
    )
    
    return {"message": "Email verificado exitosamente", "already_verified": False}



@router.post("/resend-verification")
async def resend_verification_email(data: dict):
    """Resend verification email"""
    email = data.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Email requerido")
    
    user = await db.users.find_one({"email": email})
    if not user:
        return {"message": "Si el correo existe, recibirás un email de verificación"}
    
    if user.get("email_verified"):
        return {"message": "Email ya verificado"}
    
    new_token = generate_id()
    await db.users.update_one({"id": user["id"]}, {"$set": {"email_verification_token": new_token}})
    
    try:
        from services.email import send_verification_email
        await send_verification_email(email, user.get("full_name", ""), new_token)
    except Exception as e:
        logger.warning(f"Failed to resend verification email: {e}")
    
    return {"message": "Si el correo existe, recibirás un email de verificación"}



@router.post("/google/session")
async def google_auth_session(data: dict):
    """Exchange Emergent Google Auth session_id for a Bookvia JWT token."""
    session_id = data.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id requerido")
    
    # Call Emergent Auth to get user data
    import httpx
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id},
                timeout=10.0
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=401, detail="Sesion de Google invalida")
            google_data = resp.json()
    except httpx.RequestError:
        raise HTTPException(status_code=500, detail="Error al verificar con Google")
    
    google_email = google_data.get("email", "").strip().lower()
    google_name = google_data.get("name", "")
    google_picture = google_data.get("picture", "")
    google_id = google_data.get("id", "")
    
    if not google_email:
        raise HTTPException(status_code=400, detail="No se pudo obtener email de Google")
    
    # Check if user exists by email
    user = await db.users.find_one({"email": google_email}, {"_id": 0})
    
    if user:
        # Update Google info on existing user
        update_fields = {"auth_provider": "google", "google_id": google_id}
        if not user.get("photo_url") and google_picture:
            update_fields["photo_url"] = google_picture
        if not user.get("email_verified"):
            update_fields["email_verified"] = True
        await db.users.update_one({"id": user["id"]}, {"$set": update_fields})
    else:
        # Create new user from Google data
        user = {
            "id": generate_id(),
            "email": google_email,
            "password_hash": None,
            "full_name": google_name,
            "phone": "",
            "country": "MX",
            "city": "",
            "phone_verified": False,
            "email_verified": True,
            "auth_provider": "google",
            "google_id": google_id,
            "photo_url": google_picture,
            "role": UserRole.USER,
            "active_appointments_count": 0,
            "cancellation_count": 0,
            "suspended_until": None,
            "favorites": [],
            "preferred_language": "es",
            "stripe_customer_id": None,
            "saved_cards": [],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user)
    
    # Check if suspended
    if user.get("suspended_until"):
        try:
            suspended = datetime.fromisoformat(user["suspended_until"])
            if suspended.tzinfo is None:
                suspended = suspended.replace(tzinfo=timezone.utc)
            if suspended > datetime.now(timezone.utc):
                raise HTTPException(status_code=403, detail="Cuenta suspendida")
        except (ValueError, TypeError):
            pass
    
    # Generate Bookvia JWT
    token = create_token(user["id"], user.get("role", "user"), google_email)
    
    user_response = {
        "id": user["id"],
        "email": google_email,
        "full_name": user.get("full_name", google_name),
        "role": user.get("role", "user"),
        "phone": user.get("phone", ""),
        "photo_url": user.get("photo_url", google_picture),
        "email_verified": True,
        "favorites": user.get("favorites", []),
        "country": user.get("country", "MX"),
        "city": user.get("city", ""),
    }
    
    return {"token": token, "user": user_response}





@router.post("/forgot-password")
async def forgot_password(data: dict):
    """Send password reset email"""
    email = data.get("email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email requerido")
    
    user = await db.users.find_one({"email": email})
    if not user:
        return {"message": "Si el correo existe, recibirás instrucciones para restablecer tu contraseña"}
    
    reset_token = generate_id()
    reset_expires = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_reset_token": reset_token, "password_reset_expires": reset_expires}}
    )
    
    try:
        from services.email import send_password_reset_email
        await send_password_reset_email(email, user.get("full_name", ""), reset_token)
    except Exception as e:
        logger.warning(f"Failed to send password reset email: {e}")
    
    return {"message": "Si el correo existe, recibirás instrucciones para restablecer tu contraseña"}



@router.post("/reset-password")
async def reset_password(data: dict):
    """Reset password using token from email"""
    token = data.get("token", "")
    new_password = data.get("password", "")
    
    if not token or not new_password:
        raise HTTPException(status_code=400, detail="Token y contraseña requeridos")
    
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres")
    
    user = await db.users.find_one({"password_reset_token": token})
    if not user:
        raise HTTPException(status_code=400, detail="El enlace es inválido o ha expirado")
    
    expires = user.get("password_reset_expires", "")
    if expires:
        expires_dt = datetime.fromisoformat(expires)
        if datetime.now(timezone.utc) > expires_dt:
            raise HTTPException(status_code=400, detail="El enlace ha expirado. Solicita uno nuevo")
    
    new_hash = hash_password(new_password)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": new_hash}, "$unset": {"password_reset_token": "", "password_reset_expires": ""}}
    )
    
    if user.get("role") == "business" and user.get("business_id"):
        await db.businesses.update_one(
            {"id": user["business_id"]},
            {"$set": {"password_hash": new_hash}}
        )
    
    return {"message": "Contraseña actualizada exitosamente"}



@router.post("/phone/send-code")
async def send_phone_code(request: PhoneVerifyRequest):
    """Send phone verification code with rate limiting"""
    from services.sms import send_verification_code, SMSRateLimitError, SMSNotConfiguredError, SMSServiceError
    from core.config import IS_DEVELOPMENT
    
    try:
        code, msg_id = await send_verification_code(request.phone)
        
        response = {"message": "Code sent successfully"}
        if IS_DEVELOPMENT:
            response["dev_code"] = code
        return response
        
    except SMSRateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except SMSNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except SMSServiceError as e:
        logger.error(f"SMS error: {e}")
        raise HTTPException(status_code=500, detail="Failed to send verification code")



@router.post("/phone/verify")
async def verify_phone_code(request: PhoneVerifyConfirm, token_data: TokenData = Depends(require_auth)):
    """Verify phone code with proper expiration"""
    from services.sms import verify_code
    
    is_valid = await verify_code(request.phone, request.code)
    if not is_valid:
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    
    # Mark phone as verified
    await db.users.update_one(
        {"id": token_data.user_id},
        {"$set": {"phone_verified": True, "phone": request.phone}}
    )
    
    return {"message": "Phone verified successfully"}



@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(token_data: TokenData = Depends(require_auth)):
    user = await db.users.find_one({"id": token_data.user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(**user)



@router.post("/business/register", response_model=dict)
async def register_business(business: BusinessCreate):
    existing = await db.businesses.find_one({"email": business.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Also create user account for business owner
    user_id = generate_id()
    business_id = generate_id()
    slug = generate_slug(business.name) + "-" + business_id[:8]
    city_slug = generate_slug(business.city)
    
    # Normalize country code
    country_code = business.country.upper()[:2] if business.country else "MX"
    
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
        "city_slug": city_slug,
        "state": business.state,
        "country": business.country,
        "country_code": country_code,
        "zip_code": business.zip_code,
        "latitude": business.latitude,
        "longitude": business.longitude,
        "ine_url": business.ine_url,
        "rfc": business.rfc,
        "proof_of_address_url": business.proof_of_address_url,
        "clabe": business.clabe,
        "legal_name": business.legal_name,
        "owner_birth_date": business.owner_birth_date,
        "status": BusinessStatus.PENDING,
        "rating": 0.0,
        "rating_sum": 0.0,
        "review_count": 0,
        "completed_appointments": 0,
        "badges": ["nuevo"],
        "requires_deposit": business.requires_deposit,
        "deposit_amount": max(business.deposit_amount, 50.0),
        "cancellation_days": business.cancellation_days,
        "payout_schedule": business.payout_schedule if business.requires_deposit else None,
        "min_time_between_appointments": business.min_time_between_appointments,
        "service_radius_km": business.service_radius_km,
        "timezone": business.timezone,
        "photos": [],
        "logo_url": business.logo_url,
        "cover_photo": business.cover_photo,
        "slug": slug,
        "plan_type": business.plan_type,
        "stripe_account_id": None,
        "stripe_customer_id": None,
        "stripe_subscription_id": None,
        "subscription_status": "none",
        "trial_ends_at": trial_ends,
        "is_featured": False,
        "payout_hold": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    user_doc = {
        "id": user_id,
        "email": business.email,
        "password_hash": hash_password(business.password),
        "full_name": business.legal_name,
        "phone": business.phone,
        "phone_verified": False,
        "email_verified": False,
        "email_verification_token": generate_id(),
        "role": UserRole.BUSINESS,
        "business_id": business_id,
        "preferred_language": "es",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.businesses.insert_one(business_doc)
    await db.users.insert_one(user_doc)
    
    # NOTE: Verification email is NOT sent here. It will be sent after subscription payment.
    
    return {"message": "Registro exitoso. Completa tu suscripción para activar tu cuenta.", "email": business.email, "business_id": business_id}




@router.post("/business/create-subscription")
async def create_registration_subscription(data: dict):
    """Create Stripe subscription checkout for a newly registered business (no auth required)."""
    email = data.get("email", "").strip().lower()
    origin_url = data.get("origin_url", os.environ.get("BASE_URL", ""))
    
    if not email:
        raise HTTPException(status_code=400, detail="Email requerido")
    
    business = await db.businesses.find_one({"email": email}, {"_id": 0})
    if not business:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")
    
    if business.get("subscription_status") not in ("none", None):
        raise HTTPException(status_code=400, detail="Ya tiene una suscripción activa")
    
    price_id = await get_or_create_stripe_price()
    if not price_id:
        raise HTTPException(status_code=500, detail="Error de configuración de pagos")
    
    success_url = f"{origin_url}/business/subscription/success?session_id={{CHECKOUT_SESSION_ID}}&from=register"
    cancel_url = f"{origin_url}/login"
    
    try:
        customer_id = business.get("stripe_customer_id")
        if not customer_id:
            customer = stripe_lib.Customer.create(
                email=business.get("email"),
                name=business.get("name"),
                metadata={"business_id": business["id"]}
            )
            customer_id = customer.id
            await db.businesses.update_one(
                {"id": business["id"]},
                {"$set": {"stripe_customer_id": customer_id}}
            )
        
        session = stripe_lib.checkout.Session.create(
            customer=customer_id,
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            subscription_data={"trial_period_days": SUBSCRIPTION_TRIAL_DAYS},
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"business_id": business["id"], "registration_flow": "true"}
        )
        
        await db.payment_transactions.insert_one({
            "id": generate_id(),
            "business_id": business["id"],
            "session_id": session.id,
            "type": "subscription",
            "amount": SUBSCRIPTION_PRICE_MXN,
            "currency": "mxn",
            "payment_status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        return {"url": session.url, "session_id": session.id}
    except Exception as e:
        logger.error(f"Stripe registration subscription error: {e}")
        raise HTTPException(status_code=500, detail=str(e))




@router.post("/business/verify-subscription")
async def verify_registration_subscription(data: dict):
    """Verify subscription payment and send verification email (no auth required)."""
    session_id = data.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id requerido")
    
    try:
        session = stripe_lib.checkout.Session.retrieve(session_id)
    except Exception as e:
        logger.error(f"Stripe session retrieve error: {e}")
        raise HTTPException(status_code=400, detail="Sesión de pago inválida")
    
    business_id = session.metadata.get("business_id") if session.metadata else None
    if not business_id:
        raise HTTPException(status_code=400, detail="Sesión no asociada a un negocio")
    
    business = await db.businesses.find_one({"id": business_id}, {"_id": 0})
    if not business:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")
    
    if session.payment_status in ("paid", "no_payment_required") or session.status == "complete":
        subscription_id = session.subscription
        await db.businesses.update_one(
            {"id": business_id},
            {"$set": {
                "stripe_subscription_id": subscription_id,
                "stripe_customer_id": session.customer,
                "subscription_status": "trialing",
                "subscription_started_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "completed", "subscription_id": subscription_id}}
        )
        
        # NOW send verification email since payment is confirmed
        user = await db.users.find_one({"business_id": business_id}, {"_id": 0})
        if user and user.get("email_verification_token"):
            try:
                from services.email import send_verification_email
                await send_verification_email(business["email"], business["name"], user["email_verification_token"])
            except Exception as e:
                logger.warning(f"Failed to send verification email after subscription: {e}")
        
        return {
            "status": "active",
            "subscription_status": "trialing",
            "email": business["email"],
            "message": "Suscripción activada. Revisa tu correo para verificar tu cuenta."
        }
    else:
        return {
            "status": "pending",
            "message": "El pago aún no se ha confirmado. Intenta de nuevo."
        }




@router.post("/business/login", response_model=dict)
async def login_business(credentials: UserLogin):
    business = await db.businesses.find_one({"email": credentials.email})
    if not business:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(credentials.password, business["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user = await db.users.find_one({"business_id": business["id"]})
    if not user:
        raise HTTPException(status_code=500, detail="User account not found")
    
    # Check subscription payment - must pay before accessing account
    sub_status = business.get("subscription_status", "none")
    if sub_status == "none":
        raise HTTPException(status_code=403, detail="subscription_required")
    
    # Check email verification
    if not user.get("email_verified", True):
        raise HTTPException(status_code=403, detail="email_not_verified")
    
    # Ensure required defaults for BusinessResponse
    business.setdefault("description", "")
    business.setdefault("category_id", "")
    business.setdefault("address", "")
    business.setdefault("city", "")
    business.setdefault("state", "")
    business.setdefault("country", "MX")
    business.setdefault("zip_code", "")
    business.setdefault("subscription_status", "none")
    
    # Remove MongoDB _id
    business.pop("_id", None)
    
    token = create_token(user["id"], UserRole.BUSINESS, business["email"])
    return {"token": token, "business": BusinessResponse(**business).model_dump()}



@router.post("/business/manager-login", response_model=dict)
async def login_manager(credentials: ManagerLogin):
    """Login as a manager/administrator of a business using PIN"""
    business = await db.businesses.find_one({"email": credentials.business_email})
    if not business:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    
    worker = await db.workers.find_one({
        "id": credentials.worker_id,
        "business_id": business["id"],
        "is_manager": True
    })
    if not worker:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    
    pin_hash = worker.get("manager_pin_hash")
    if not pin_hash:
        raise HTTPException(status_code=401, detail="Este administrador no tiene PIN configurado")
    
    if not verify_password(credentials.pin, pin_hash):
        raise HTTPException(status_code=401, detail="PIN incorrecto")
    
    user = await db.users.find_one({"business_id": business["id"]})
    if not user:
        raise HTTPException(status_code=500, detail="Cuenta de usuario no encontrada")
    
    business.setdefault("description", "")
    business.setdefault("category_id", "")
    business.setdefault("address", "")
    business.setdefault("city", "")
    business.setdefault("state", "")
    business.setdefault("country", "MX")
    business.setdefault("zip_code", "")
    business.setdefault("subscription_status", "none")
    business.pop("_id", None)
    
    token = create_token(user["id"], UserRole.BUSINESS, business["email"], worker_id=worker["id"], is_manager=True)
    
    permissions = worker.get("manager_permissions", {})
    return {
        "token": token,
        "business": BusinessResponse(**business).model_dump(),
        "manager": {
            "worker_id": worker["id"],
            "worker_name": worker["name"],
            "permissions": permissions,
            "is_manager": True
        }
    }



@router.get("/business/managers")
async def get_business_managers(email: str):
    """Get list of manager workers for a business (used in login flow)"""
    business = await db.businesses.find_one({"email": email})
    if not business:
        return []
    workers = await db.workers.find(
        {"business_id": business["id"], "is_manager": True},
        {"_id": 0, "id": 1, "name": 1, "has_manager_pin": 1}
    ).to_list(100)
    # Compute has_manager_pin from manager_pin_hash
    result = []
    for w in workers:
        w_full = await db.workers.find_one({"id": w["id"]}, {"_id": 0, "manager_pin_hash": 1})
        result.append({"id": w["id"], "name": w["name"], "has_pin": bool(w_full.get("manager_pin_hash"))})
    return result



@router.post("/admin/setup-2fa", response_model=dict)
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



@router.post("/admin/verify-2fa")
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



@router.post("/admin/login", response_model=dict)
async def admin_login(credentials: AdminLogin, request: Request):
    user = await db.users.find_one({"email": credentials.email, "role": {"$in": [UserRole.ADMIN, UserRole.STAFF]}})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user_role = user.get("role", UserRole.ADMIN)

    # Check if 2FA is enabled
    if not user.get("totp_enabled"):
        if user_role == UserRole.ADMIN:
            # Super admin MUST set up 2FA
            temp_token = create_token(user["id"], user_role, user["email"])
            return {
                "requires_2fa_setup": True,
                "temp_token": temp_token,
                "message": "2FA setup required before accessing admin panel"
            }
        # Staff without 2FA can login directly (2FA optional for staff)
        await create_audit_log(
            admin_id=user["id"], admin_email=user["email"],
            action=AuditAction.ADMIN_LOGIN, target_type="staff",
            target_id=user["id"], details={"login_successful": True, "role": user_role},
            request=request
        )
        token = create_token(user["id"], user_role, user["email"])
        user_resp = {k: v for k, v in user.items() if k not in ("_id", "password_hash", "totp_secret", "backup_codes")}
        return {"token": token, "user": user_resp, "totp_enabled": False}
    
    # Verify 2FA
    totp = pyotp.TOTP(user["totp_secret"])
    if not totp.verify(credentials.totp_code):
        # Check backup codes
        valid_backup = False
        for i, hashed_code in enumerate(user.get("backup_codes", [])):
            if verify_password(credentials.totp_code, hashed_code):
                valid_backup = True
                backup_codes = user["backup_codes"]
                backup_codes.pop(i)
                await db.users.update_one(
                    {"id": user["id"]},
                    {"$set": {"backup_codes": backup_codes}}
                )
                break
        
        if not valid_backup:
            raise HTTPException(status_code=401, detail="Invalid 2FA code")
    
    # Create audit log
    await create_audit_log(
        admin_id=user["id"], admin_email=user["email"],
        action=AuditAction.ADMIN_LOGIN, target_type=user_role,
        target_id=user["id"], details={"login_successful": True, "role": user_role},
        request=request
    )
    
    token = create_token(user["id"], user_role, user["email"])
    user_resp = {k: v for k, v in user.items() if k not in ("_id", "password_hash", "totp_secret", "backup_codes")}
    return {"token": token, "user": user_resp, "totp_enabled": True}



