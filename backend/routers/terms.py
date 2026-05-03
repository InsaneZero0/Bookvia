"""
Fase 10: Terms & Conditions versioning and acceptance.

Every registered user or business stores an append-only history of the
Terms versions they accepted (with IP, user-agent, source and timestamp).
When `TERMS_VERSION` is bumped, accounts will show a mismatch. The
frontend enforces re-acceptance with a 7-day grace period (dismissible
modal) that becomes a hard block afterwards.
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from typing import Optional

from core.config import (
    TERMS_VERSION,
    TERMS_VERSION_PUBLISHED_AT,
    TERMS_GRACE_DAYS,
    TERMS_SUMMARY,
)
from core.database import db
from core.security import TokenData
from core.dependencies import require_auth
from models.enums import UserRole

router = APIRouter(prefix="/terms", tags=["terms"])


# Plain-text changelog shown to users when they are asked to re-accept. Keep
# it short and client-facing. When bumping the version, add a new block at
# the top and keep the previous one for reference.
TERMS_CHANGELOG = [
    {
        "version": "2026-05-01",
        "published_at": TERMS_VERSION_PUBLISHED_AT,
        "summary_es": (
            "Version inicial publica. Se aclara que Bookvia es intermediario; "
            "propinas y facturas se gestionan directamente con el negocio; se "
            "incorporan Aviso de Privacidad LFPDPPP, mayoria de edad y "
            "jurisdiccion CDMX."
        ),
        "summary_en": (
            "Initial public version. Clarifies that Bookvia is an intermediary; "
            "tips and invoices are handled directly with the business; adds "
            "LFPDPPP Privacy Notice, legal age and Mexico City jurisdiction."
        ),
    }
]


class AcceptTermsRequest(BaseModel):
    version: Optional[str] = None  # Client can echo the version they read
    source: Optional[str] = None   # "register" | "re_accept" | "booking_checkout"


def _hard_block_active() -> bool:
    """True when the grace period for the current version has expired."""
    try:
        published = datetime.fromisoformat(TERMS_VERSION_PUBLISHED_AT)
    except ValueError:
        return True
    return datetime.now(timezone.utc) >= published + timedelta(days=TERMS_GRACE_DAYS)


def _grace_ends_at_iso() -> str:
    try:
        published = datetime.fromisoformat(TERMS_VERSION_PUBLISHED_AT)
    except ValueError:
        return TERMS_VERSION_PUBLISHED_AT
    return (published + timedelta(days=TERMS_GRACE_DAYS)).isoformat()


@router.get("/version")
async def get_terms_version():
    """Public endpoint. Returns the current T&C version and metadata."""
    return {
        "version": TERMS_VERSION,
        "published_at": TERMS_VERSION_PUBLISHED_AT,
        "grace_period_days": TERMS_GRACE_DAYS,
        "grace_period_ends_at": _grace_ends_at_iso(),
        "is_hard_block_now": _hard_block_active(),
        "summary": TERMS_SUMMARY,
        "terms_url": "/terms",
        "privacy_url": "/privacy",
        "changelog": TERMS_CHANGELOG,
    }


@router.post("/accept")
async def accept_terms(
    payload: AcceptTermsRequest,
    request: Request,
    token_data: TokenData = Depends(require_auth),
):
    """Record that the authenticated account has accepted the current T&C.

    Every acceptance is appended to `terms_acceptance_history` on the user
    (and on the business when the caller is the owner). We capture IP and
    user-agent for audit/compliance with LFPDPPP 210-A CFPC.
    """
    claimed = (payload.version or TERMS_VERSION).strip()
    if claimed and claimed != TERMS_VERSION:
        raise HTTPException(
            status_code=409,
            detail=f"Terms version mismatch. Expected {TERMS_VERSION}, got {claimed}",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    ip = (
        (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
        or (request.client.host if request.client else "")
    )
    ua = (request.headers.get("user-agent") or "")[:255]
    source = (payload.source or "re_accept").strip()[:32] or "re_accept"

    entry = {
        "version": TERMS_VERSION,
        "accepted_at": now_iso,
        "ip": ip,
        "user_agent": ua,
        "source": source,
    }

    await db.users.update_one(
        {"id": token_data.user_id},
        {
            "$set": {
                "accepted_terms_version": TERMS_VERSION,
                "accepted_terms_at": now_iso,
            },
            "$push": {"terms_acceptance_history": entry},
        },
    )

    # Mirror on business doc for easy admin review - only owners.
    if token_data.role == UserRole.BUSINESS:
        user = await db.users.find_one(
            {"id": token_data.user_id},
            {"_id": 0, "business_id": 1, "is_manager": 1},
        )
        if user and user.get("business_id") and not user.get("is_manager"):
            await db.businesses.update_one(
                {"id": user["business_id"]},
                {
                    "$set": {
                        "accepted_terms_version": TERMS_VERSION,
                        "accepted_terms_at": now_iso,
                    },
                    "$push": {"terms_acceptance_history": entry},
                },
            )

    return {"ok": True, "version": TERMS_VERSION, "accepted_at": now_iso}


@router.get("/me")
async def my_terms_status(token_data: TokenData = Depends(require_auth)):
    """Return the acceptance status for the current account.

    Drives the frontend modal: when `up_to_date=False` show a dismissible
    banner/modal until `grace_period_ends_at`; after that use `is_hard_block`
    to force re-acceptance.
    """
    user = await db.users.find_one(
        {"id": token_data.user_id},
        {"_id": 0, "accepted_terms_version": 1, "accepted_terms_at": 1},
    )
    accepted = (user or {}).get("accepted_terms_version")
    up_to_date = accepted == TERMS_VERSION
    return {
        "current_version": TERMS_VERSION,
        "accepted_version": accepted,
        "accepted_at": (user or {}).get("accepted_terms_at"),
        "up_to_date": up_to_date,
        "grace_period_ends_at": _grace_ends_at_iso(),
        "is_hard_block": (not up_to_date) and _hard_block_active(),
        "published_at": TERMS_VERSION_PUBLISHED_AT,
    }


@router.get("/me/history")
async def my_terms_history(token_data: TokenData = Depends(require_auth)):
    """Return the full acceptance history for the logged-in account.

    Admins (in a future endpoint) can query this for any user; this one is
    scoped to the caller so anyone can inspect their own record.
    """
    user = await db.users.find_one(
        {"id": token_data.user_id},
        {"_id": 0, "terms_acceptance_history": 1},
    )
    history = (user or {}).get("terms_acceptance_history") or []
    return {"count": len(history), "history": history}


# Helper usable by other routers to hard-gate critical actions once the grace
# period has expired. Import as: from routers.terms import require_terms_up_to_date
async def require_terms_up_to_date(user_id: str) -> None:
    """Raise 409 terms_outdated if the user has not accepted the current
    version AND the grace period is over. During grace the soft modal on the
    frontend handles it; here we only enforce the hard deadline.
    """
    if not _hard_block_active():
        return
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "accepted_terms_version": 1})
    if not user:
        return
    if user.get("accepted_terms_version") != TERMS_VERSION:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "terms_outdated",
                "message": "Debes aceptar los Terminos y Condiciones actualizados para continuar.",
                "current_version": TERMS_VERSION,
            },
        )
