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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["Users"])

@router.put("/me", response_model=UserResponse)
async def update_user_profile(update: UserUpdate, token_data: TokenData = Depends(require_auth)):
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    await db.users.update_one({"id": token_data.user_id}, {"$set": update_data})
    user = await db.users.find_one({"id": token_data.user_id}, {"_id": 0, "password_hash": 0})
    return UserResponse(**user)



@router.post("/favorites/{business_id}")
async def add_favorite(business_id: str, token_data: TokenData = Depends(require_auth)):
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    await db.users.update_one(
        {"id": token_data.user_id},
        {"$addToSet": {"favorites": business_id}}
    )
    return {"message": "Added to favorites"}



@router.delete("/favorites/{business_id}")
async def remove_favorite(business_id: str, token_data: TokenData = Depends(require_auth)):
    await db.users.update_one(
        {"id": token_data.user_id},
        {"$pull": {"favorites": business_id}}
    )
    return {"message": "Removed from favorites"}



@router.get("/favorites", response_model=List[BusinessResponse])
async def get_favorites(token_data: TokenData = Depends(require_auth)):
    user = await db.users.find_one({"id": token_data.user_id})
    if not user or not user.get("favorites"):
        return []
    
    businesses = await db.businesses.find(
        {"id": {"$in": user["favorites"]}, **VISIBLE_BUSINESS_FILTER},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)
    
    # Add category names
    for b in businesses:
        if b.get("category_id"):
            cat = await db.categories.find_one({"id": b["category_id"]})
            if cat:
                b["category_name"] = cat.get("name_es", "")
    
    # Compute is_open_now and next_available_text
    biz_ids = [b["id"] for b in businesses]
    if biz_ids:
        all_workers = await db.workers.find(
            {"business_id": {"$in": biz_ids}, "active": True},
            {"_id": 0, "business_id": 1, "schedule": 1}
        ).to_list(500)
        biz_workers_map = {}
        for w in all_workers:
            biz_workers_map.setdefault(w["business_id"], []).append(w)
        day_names_es = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"]
        try:
            now_fav = datetime.now(pytz.timezone("America/Mexico_City"))
        except Exception:
            now_fav = datetime.now(timezone.utc)
        cwd = now_fav.weekday()
        ctm = now_fav.strftime("%H:%M")
        for b in businesses:
            wl = biz_workers_map.get(b["id"], [])
            if not wl:
                continue
            # is_open_now
            is_open = False
            for wk in wl:
                ds = wk.get("schedule", {}).get(str(cwd), {})
                if ds.get("is_available") and ds.get("blocks"):
                    for blk in ds["blocks"]:
                        if blk["start_time"] <= ctm < blk["end_time"]:
                            is_open = True
                            break
                if is_open:
                    break
            b["is_open_now"] = is_open
            # next_available_text
            found = False
            for doff in range(7):
                cd = (cwd + doff) % 7
                for wk in wl:
                    ds = wk.get("schedule", {}).get(str(cd), {})
                    if ds.get("is_available") and ds.get("blocks"):
                        for blk in ds["blocks"]:
                            if doff == 0 and blk["end_time"] > ctm:
                                b["next_available_text"] = "Hoy disponible"
                                found = True
                                break
                            elif doff > 0:
                                b["next_available_text"] = f"{'Manana' if doff == 1 else day_names_es[(cwd + doff) % 7]} {blk['start_time']}"
                                found = True
                                break
                        if found:
                            break
                    if found:
                        break
                if found:
                    break
    
    return [BusinessResponse(**b) for b in businesses]





@router.get("/my-stats")
async def get_user_stats(token_data: TokenData = Depends(require_auth)):
    """Get user statistics for dashboard."""
    user_id = token_data.user_id
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "created_at": 1})

    total_bookings = await db.bookings.count_documents({"user_id": user_id})
    completed = await db.bookings.count_documents({"user_id": user_id, "status": "completed"})
    upcoming = await db.bookings.count_documents({"user_id": user_id, "status": {"$in": ["confirmed", "hold"]}})

    # Total spent
    pipeline = [
        {"$match": {"user_id": user_id, "deposit_paid": True}},
        {"$group": {"_id": None, "total": {"$sum": "$deposit_amount"}}}
    ]
    spent_res = await db.bookings.aggregate(pipeline).to_list(1)
    total_spent = spent_res[0]["total"] if spent_res else 0

    # Reviews given
    reviews_given = await db.reviews.count_documents({"user_id": user_id})

    # Avg rating given
    avg_pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": None, "avg": {"$avg": "$rating"}}}
    ]
    avg_res = await db.reviews.aggregate(avg_pipeline).to_list(1)
    avg_rating = round(avg_res[0]["avg"], 1) if avg_res else 0

    # Favorite category
    cat_pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {"_id": "$service_name", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 1}
    ]
    cat_res = await db.bookings.aggregate(cat_pipeline).to_list(1)
    fav_service = cat_res[0]["_id"] if cat_res else None

    # Last 3 completed bookings (for rebook)
    recent = await db.bookings.find(
        {"user_id": user_id, "status": "completed"},
        {"_id": 0, "id": 1, "business_id": 1, "business_name": 1, "service_id": 1, "service_name": 1, "worker_id": 1, "worker_name": 1}
    ).sort("date", -1).limit(3).to_list(3)

    return {
        "total_bookings": total_bookings,
        "completed": completed,
        "upcoming": upcoming,
        "total_spent": round(total_spent, 2),
        "reviews_given": reviews_given,
        "avg_rating_given": avg_rating,
        "favorite_service": fav_service,
        "member_since": user.get("created_at") if user else None,
        "recent_completed": recent,
    }



# ========================== WALLET ENDPOINTS ==========================

@router.get("/me/wallet")
async def get_my_wallet(token_data: TokenData = Depends(require_auth)):
    """Return wallet balance + recent transactions for the authenticated user."""
    from services.wallet import get_wallet_balance, list_wallet_transactions
    info = await get_wallet_balance(token_data.user_id)
    txs = await list_wallet_transactions(token_data.user_id, page=1, limit=10)
    info["transactions"] = txs["transactions"]
    info["transactions_total"] = txs["total"]
    return info


@router.get("/me/wallet/transactions")
async def list_my_wallet_transactions(
    page: int = 1,
    limit: int = 20,
    token_data: TokenData = Depends(require_auth)
):
    """Paginated list of wallet transactions for the authenticated user."""
    from services.wallet import list_wallet_transactions
    page = max(1, int(page))
    limit = max(1, min(100, int(limit)))
    return await list_wallet_transactions(token_data.user_id, page=page, limit=limit)



# ========================== FASE 10c: PERSONAL DATA EXPORT (LFPDPPP ARCO-A) ==========================


def _sanitize_doc(doc: dict, drop: set = None) -> dict:
    """Drop MongoDB internal fields and caller-specified sensitive fields."""
    drop = drop or set()
    drop = drop | {"_id", "password_hash", "email_verification_token",
                   "reset_password_token", "totp_secret"}
    return {k: v for k, v in (doc or {}).items() if k not in drop}


@router.get("/me/export-data")
async def export_my_personal_data(
    request: Request,
    token_data: TokenData = Depends(require_auth),
):
    """LFPDPPP-compliant data export (derecho de Acceso - 'A' en ARCO).

    Packs every piece of personal data the platform has stored about the
    caller into a single JSON that the client can download. Includes:
      * User profile (password_hash and tokens removed)
      * Bookings they created (as client)
      * Wallet transactions
      * Notifications history (last 500)
      * Terms of Service acceptance history
      * Favorites
      * Payment transactions where they are the payer
      * For business owners: business profile, settlements, and ledger
        entries where the business is the beneficiary.

    The response is delivered as an attachment so the browser downloads it
    immediately. Each export is audited for support traceability.
    """
    user = await db.users.find_one({"id": token_data.user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    ip = (
        (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
        or (request.client.host if request.client else "")
    )
    generated_at = datetime.now(timezone.utc).isoformat()

    # --- Core collections the client has rows in ---
    bookings = await db.bookings.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    notifications = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    favorites = await db.user_favorites.find({"user_id": user["id"]}, {"_id": 0}).to_list(500)
    wallet = await db.user_wallets.find_one({"user_id": user["id"]}, {"_id": 0})
    payments = await db.payment_transactions.find(
        {"user_id": user["id"]},
        {"_id": 0, "stripe_secret": 0},
    ).sort("created_at", -1).to_list(500)

    export_payload = {
        "meta": {
            "generated_at": generated_at,
            "generated_ip": ip,
            "schema_version": "1.0",
            "user_id": user["id"],
            "note": "Export completo de tus datos personales segun LFPDPPP (derecho de Acceso)",
            "truncation_cap_per_section": 500,
            "truncated": any(len(x) >= 500 for x in (bookings, notifications, payments)),
        },
        "profile": _sanitize_doc(user),
        "bookings": [_sanitize_doc(b) for b in bookings],
        "wallet": _sanitize_doc(wallet) if wallet else None,
        "payments": [_sanitize_doc(p) for p in payments],
        "notifications": [_sanitize_doc(n) for n in notifications],
        "favorites": [_sanitize_doc(f) for f in favorites],
        "terms_acceptance_history": (user or {}).get("terms_acceptance_history") or [],
    }

    # --- Business-owner extras (only true owner, not managers) ---
    if (
        user.get("role") == UserRole.BUSINESS
        and user.get("business_id")
        and not user.get("is_manager")
    ):
        business = await db.businesses.find_one(
            {"id": user["business_id"]},
            {"_id": 0},
        )
        settlements = await db.settlements.find(
            {"business_id": user["business_id"]},
            {"_id": 0},
        ).sort("created_at", -1).to_list(500)
        tx_out = await db.transactions.find(
            {"business_id": user["business_id"]},
            {"_id": 0},
        ).sort("created_at", -1).to_list(500)
        strikes = await db.business_strikes.find(
            {"business_id": user["business_id"]},
            {"_id": 0},
        ).to_list(200)

        export_payload["business_profile"] = _sanitize_doc(business) if business else None
        export_payload["business_settlements"] = [_sanitize_doc(s) for s in settlements]
        export_payload["business_transactions"] = [_sanitize_doc(t) for t in tx_out]
        export_payload["business_strikes"] = [_sanitize_doc(s) for s in strikes]

    # Audit
    try:
        await db.audit_logs.insert_one({
            "id": generate_id(),
            "actor_id": user["id"],
            "actor_email": user.get("email"),
            "action": "personal_data_export",
            "target_type": "user",
            "target_id": user["id"],
            "ip": ip,
            "details": {
                "bookings": len(bookings),
                "payments": len(payments),
                "notifications": len(notifications),
                "is_business": user.get("role") == UserRole.BUSINESS,
            },
            "created_at": generated_at,
        })
    except Exception as e:
        logger.warning(f"Failed to audit personal_data_export for {user['id']}: {e}")

    body = json.dumps(export_payload, ensure_ascii=False, indent=2, default=str)
    filename = f"bookvia-mis-datos-{user['id'][:8]}-{generated_at[:10]}.json"
    return Response(
        content=body,
        media_type="application/json; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )



# ========================== FASE 10d: ARCO R-C-O (LFPDPPP) ==========================


class MarketingOptRequest(BaseModel):
    opt_out: bool


@router.post("/me/marketing-consent")
async def update_marketing_consent(
    payload: MarketingOptRequest,
    token_data: TokenData = Depends(require_auth),
):
    """Derecho de Oposicion (ARCO-O).

    Bookvia does not send marketing today, but we expose an explicit flag
    so the user can record their opposition in advance. If we ever launch
    marketing campaigns, this flag (`marketing_opt_out=True`) excludes the
    user from every non-essential communication.
    """
    await db.users.update_one(
        {"id": token_data.user_id},
        {"$set": {
            "marketing_opt_out": bool(payload.opt_out),
            "marketing_opt_out_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True, "marketing_opt_out": bool(payload.opt_out)}


class DeleteAccountRequest(BaseModel):
    password: str
    confirmation: str  # must be literally "ELIMINAR" to proceed


@router.delete("/me/account")
async def delete_my_account(
    payload: DeleteAccountRequest,
    request: Request,
    token_data: TokenData = Depends(require_auth),
):
    """Derecho de Cancelacion (ARCO-C).

    Soft-deletes the caller's account: redacts every PII field, forbids
    future login, removes favorites and notifications, but keeps bookings
    and payment records (anonymized via `user_id` -> redacted user) because
    they are required for fiscal and business accounting reasons.

    Blocks self-deletion when:
      * Role is BUSINESS owner (delegated to admin - too complex to auto-
        unwind subscriptions, settlements and pending payouts).
      * The user has confirmed upcoming bookings that haven't happened yet.
      * The user holds wallet balance > $0 (must spend or wait for expiry).

    The confirmation string must be exactly "ELIMINAR" in Spanish, and the
    password must match the account, to avoid accidental or CSRF deletions.
    """
    if (payload.confirmation or "").strip().upper() != "ELIMINAR":
        raise HTTPException(status_code=400, detail="La palabra de confirmacion debe ser 'ELIMINAR'")

    user = await db.users.find_one({"id": token_data.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.get("password_hash") or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Contrasena incorrecta")

    if user.get("role") == UserRole.BUSINESS and not user.get("is_manager"):
        raise HTTPException(
            status_code=400,
            detail=(
                "Los duenos de negocio no pueden eliminar su cuenta automaticamente. "
                "Escribe a soporte@bookvia.app indicando tu motivo para iniciar el proceso."
            ),
        )

    # Block if there are upcoming bookings
    now_utc = datetime.now(timezone.utc)
    upcoming = await db.bookings.count_documents({
        "user_id": user["id"],
        "status": {"$in": ["confirmed", "pending"]},
    })
    if upcoming:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Tienes {upcoming} cita{'s' if upcoming != 1 else ''} activa{'s' if upcoming != 1 else ''}. "
                f"Cancelalas o espera a que se completen antes de eliminar tu cuenta."
            ),
        )

    # Block if there is wallet balance
    wallet = await db.user_wallets.find_one({"user_id": user["id"]}, {"_id": 0, "balance_mxn": 1})
    balance = float((wallet or {}).get("balance_mxn") or 0)
    if balance > 0.0:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Tienes ${balance:.2f} MXN de saldo. Usalo en una cita o espera a que expire antes "
                f"de eliminar tu cuenta. Una cuenta eliminada NO puede recuperar el saldo."
            ),
        )

    ip = (
        (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
        or (request.client.host if request.client else "")
    )
    redacted_email = f"deleted_{user['id']}@bookvia.deleted"
    original_email = user.get("email")

    # Soft-delete + full PII redaction
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "email": redacted_email,
            "full_name": "[Cuenta eliminada]",
            "phone": "",
            "photo_url": None,
            "birth_date": None,
            "gender": None,
            "city": None,
            "country": None,
            "favorites": [],
            "stripe_customer_id": None,
            "saved_cards": [],
            "active": False,
            "email_verified": False,
            "phone_verified": False,
            "account_deleted": True,
            "account_deleted_at": now_utc.isoformat(),
            "account_deleted_ip": ip,
            "password_hash": hash_password(generate_id()),  # random unguessable
        }},
    )

    # Purge per-user collections that no longer make sense post-deletion
    await db.user_favorites.delete_many({"user_id": user["id"]})
    await db.notifications.delete_many({"user_id": user["id"]})

    # Audit log (compliance - cannot be deleted by the user)
    try:
        await db.audit_logs.insert_one({
            "id": generate_id(),
            "actor_id": user["id"],
            "actor_email": original_email,
            "action": "account_deleted_by_user",
            "target_type": "user",
            "target_id": user["id"],
            "ip": ip,
            "details": {"role": user.get("role")},
            "created_at": now_utc.isoformat(),
        })
    except Exception as e:
        logger.warning(f"Failed to audit account deletion for {user['id']}: {e}")

    # Best-effort confirmation email
    if original_email:
        try:
            from services.email import send_email, email_html
            content = f"""<p style="color:#334155;font-size:15px;line-height:1.6;">Confirmamos que eliminamos tu cuenta de Bookvia el {now_utc.strftime('%d/%m/%Y %H:%M UTC')}.</p>
<p style="color:#334155;font-size:14px;">Tus datos personales fueron redactados. Los registros contables (pagos, facturacion) se conservan el tiempo que la ley mexicana requiere.</p>
<p style="color:#64748b;font-size:13px;">Si esta eliminacion no la hiciste tu, escribenos a soporte@bookvia.app lo antes posible.</p>"""
            await send_email(
                to=original_email,
                subject="Tu cuenta de Bookvia fue eliminada",
                body=f"Confirmamos la eliminacion de tu cuenta el {now_utc.isoformat()}. Tus datos personales fueron redactados.",
                html=email_html("Cuenta eliminada", content),
                template="account_deleted",
                data={"deleted_at": now_utc.isoformat()},
            )
        except Exception as e:
            logger.warning(f"Failed to send deletion confirmation to {original_email}: {e}")

    return {"ok": True, "deleted_at": now_utc.isoformat()}
