"""
Fase 10: Terms & Conditions versioning and acceptance.

Every registered user or business stores the T&C version they accepted and
a timestamp. When `TERMS_VERSION` is bumped, accounts will show a mismatch
and the frontend can prompt for re-acceptance.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime, timezone
from typing import Optional

from core.config import TERMS_VERSION, TERMS_SUMMARY
from core.database import db
from core.security import TokenData
from core.dependencies import require_auth
from models.enums import UserRole

router = APIRouter(prefix="/terms", tags=["terms"])


class AcceptTermsRequest(BaseModel):
    version: Optional[str] = None  # Client can echo the version they read


@router.get("/version")
async def get_terms_version():
    """Public endpoint. Returns the current accepted Terms version.

    The frontend reads this once on load and compares against the version
    stored on the user/business to decide whether to prompt re-acceptance.
    """
    return {
        "version": TERMS_VERSION,
        "summary": TERMS_SUMMARY,
        "terms_url": "/terms",
        "privacy_url": "/privacy",
    }


@router.post("/accept")
async def accept_terms(
    payload: AcceptTermsRequest,
    token_data: TokenData = Depends(require_auth),
):
    """Record that the authenticated account has accepted the current T&C.

    Works for every role: client, business-owner and business-manager. The
    acceptance is stored on the user document; business accounts additionally
    mirror the acceptance on the business document so admin reviews can see
    it at a glance.
    """
    # The version the client echoes MUST match the server version: we don't
    # accept stale versions because that would let a UI bug silently record
    # outdated acceptance. If the client omits the version we accept the
    # current one (common path for apps updated to the latest release).
    claimed = (payload.version or TERMS_VERSION).strip()
    if claimed != TERMS_VERSION:
        raise HTTPException(
            status_code=409,
            detail=f"Terms version mismatch. Expected {TERMS_VERSION}, got {claimed}",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"id": token_data.user_id},
        {"$set": {
            "accepted_terms_version": TERMS_VERSION,
            "accepted_terms_at": now_iso,
        }},
    )

    # Mirror on business doc for easy admin review
    if token_data.role == UserRole.BUSINESS:
        user = await db.users.find_one(
            {"id": token_data.user_id},
            {"_id": 0, "business_id": 1, "is_manager": 1},
        )
        # Only the owner's acceptance updates the business record (managers
        # just accept for themselves so admins can audit the owner's intent).
        if user and user.get("business_id") and not user.get("is_manager"):
            await db.businesses.update_one(
                {"id": user["business_id"]},
                {"$set": {
                    "accepted_terms_version": TERMS_VERSION,
                    "accepted_terms_at": now_iso,
                }},
            )

    return {
        "ok": True,
        "version": TERMS_VERSION,
        "accepted_at": now_iso,
    }


@router.get("/me")
async def my_terms_status(token_data: TokenData = Depends(require_auth)):
    """Return the acceptance status for the current account.

    Frontend uses this to decide whether to show a re-acceptance banner.
    """
    user = await db.users.find_one(
        {"id": token_data.user_id},
        {"_id": 0, "accepted_terms_version": 1, "accepted_terms_at": 1},
    )
    accepted = (user or {}).get("accepted_terms_version")
    return {
        "current_version": TERMS_VERSION,
        "accepted_version": accepted,
        "accepted_at": (user or {}).get("accepted_terms_at"),
        "up_to_date": accepted == TERMS_VERSION,
    }
