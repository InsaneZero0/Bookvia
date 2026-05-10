"""
Phase G — User reactivation (winback) admin endpoints + LFPDPPP compliance
public endpoints (unsubscribe + delete account).
"""
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import Optional, Literal
import logging

from core.database import db
from core.dependencies import require_admin, require_auth
from services.winback import (
    find_inactive_users,
    run_winback_campaign,
    SegmentType,
    TemplateType,
)

logger = logging.getLogger(__name__)

admin_router = APIRouter(prefix="/admin/winback", tags=["Admin Winback"])
public_router = APIRouter(prefix="/users", tags=["User Privacy"])


class WinbackCampaignRequest(BaseModel):
    segment: Literal["never_booked", "stale_user", "all"] = "all"
    template: Literal["miss_you", "first_booking", "new_businesses"] = "miss_you"
    days: int = 30
    incentive: bool = True
    dry_run: bool = False


@admin_router.get("/inactive-users")
async def admin_inactive_users(
    segment: SegmentType = Query("all"),
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(500, ge=1, le=2000),
    current=Depends(require_admin),
):
    users = await find_inactive_users(segment=segment, days=days, limit=limit)
    return {
        "segment": segment,
        "days": days,
        "count": len(users),
        "users": users,
    }


@admin_router.post("/campaign")
async def admin_run_campaign(
    payload: WinbackCampaignRequest,
    current=Depends(require_admin),
):
    if payload.days < 7:
        raise HTTPException(status_code=400, detail="days must be >= 7 to avoid spam")
    summary = await run_winback_campaign(
        segment=payload.segment,
        template=payload.template,
        days=payload.days,
        incentive=payload.incentive,
        dry_run=payload.dry_run,
        actor_admin_id=getattr(current, "user_id", None),
    )
    return summary


@admin_router.get("/campaigns")
async def admin_campaigns_history(
    limit: int = Query(50, ge=1, le=200),
    current=Depends(require_admin),
):
    docs = await db.winback_campaigns.find({}, {"_id": 0}).sort("started_at", -1).limit(limit).to_list(limit)
    return {"campaigns": docs}


# =====================================================================
# LFPDPPP compliance — public/auth endpoints
# =====================================================================

@public_router.get("/unsubscribe-info")
async def unsubscribe_info(token: str = Query(...)):
    """Return info to render the unsubscribe confirmation page."""
    doc = await db.email_unsubscribe_tokens.find_one({"token": token}, {"_id": 0, "user_id": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Token invalido")
    user = await db.users.find_one({"id": doc["user_id"]}, {"_id": 0, "email": 1, "name": 1})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    already = await db.email_unsubscribes.find_one({"user_id": doc["user_id"]}, {"_id": 0})
    return {
        "email": user.get("email"),
        "name": user.get("name"),
        "already_unsubscribed": bool(already),
    }


@public_router.post("/unsubscribe")
async def unsubscribe(token: str = Body(..., embed=True)):
    """1-click unsubscribe — LFPDPPP requires no auth needed."""
    doc = await db.email_unsubscribe_tokens.find_one({"token": token}, {"_id": 0, "user_id": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Token invalido")
    user_id = doc["user_id"]
    existing = await db.email_unsubscribes.find_one({"user_id": user_id})
    if not existing:
        await db.email_unsubscribes.insert_one({
            "user_id": user_id,
            "unsubscribed_at": datetime.now(timezone.utc).isoformat(),
            "source": "winback_email",
        })
    return {"ok": True, "message": "Tus preferencias se actualizaron. No volveras a recibir correos de Bookvia."}


@public_router.post("/me/delete-account")
async def delete_my_user_account(current=Depends(require_auth)):
    """LFPDPPP — derecho al olvido for end-users. Soft delete: anonymize PII
    and disable login. Bookings history is preserved (without PII) for fiscal
    & operational integrity."""
    user = await db.users.find_one({"id": current.user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    redacted_email = f"deleted_{current.user_id[:8]}@deleted.bookvia.app"
    redacted_phone = ""
    redacted_name = "[Cuenta eliminada]"

    await db.users.update_one(
        {"id": current.user_id},
        {"$set": {
            "is_deleted": True,
            "deleted_at": datetime.now(timezone.utc).isoformat(),
            "email": redacted_email,
            "phone": redacted_phone,
            "name": redacted_name,
            "avatar_url": None,
            "banned": True,  # prevent login
        }},
    )
    # Also unsubscribe from emails
    await db.email_unsubscribes.update_one(
        {"user_id": current.user_id},
        {"$setOnInsert": {
            "user_id": current.user_id,
            "unsubscribed_at": datetime.now(timezone.utc).isoformat(),
            "source": "account_deletion",
        }},
        upsert=True,
    )
    return {"ok": True, "message": "Tu cuenta fue eliminada. Recibiras una confirmacion por correo."}


@public_router.post("/me/business/delete-account")
async def delete_my_business_account(current=Depends(require_auth)):
    """LFPDPPP — derecho al olvido for businesses. Soft delete: hide from
    public, anonymize public PII, cancel subscription. Settlement history
    preserved for fiscal compliance."""
    if str(getattr(current, "role", "")).lower() != "business":
        raise HTTPException(status_code=403, detail="Solo cuentas de negocio")

    biz = await db.businesses.find_one({"user_id": current.user_id}, {"_id": 0, "id": 1})
    if not biz:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.businesses.update_one(
        {"id": biz["id"]},
        {"$set": {
            "is_deleted": True,
            "deleted_at": now_iso,
            "status": "deleted",
            "subscription_status": "canceled",
            "name": f"[Negocio eliminado {biz['id'][:8]}]",
            "phone": "",
            "address": "",
            "description": "",
            "banned": True,
        }},
    )
    await db.users.update_one(
        {"id": current.user_id},
        {"$set": {
            "is_deleted": True,
            "deleted_at": now_iso,
            "email": f"deleted_biz_{current.user_id[:8]}@deleted.bookvia.app",
            "name": "[Cuenta eliminada]",
            "banned": True,
        }},
    )
    return {"ok": True, "message": "Tu negocio fue eliminado. Tu historial de liquidaciones se conserva por motivos fiscales."}
