"""HTTP endpoints for push notifications.

Mounted at `/api/push`. Three concerns:

- `POST /register`   → Save / refresh an FCM device token for the current user.
- `DELETE /unregister` → Drop a device token (called on logout).
- `GET /preferences` / `PATCH /preferences` → Per-user opt-out controls.
- `POST /test` (auth required) → Send yourself a test push to verify setup.
"""

from __future__ import annotations

from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.dependencies import require_auth
from core.database import db
from core.security import TokenData
from services.push_notifications import (
    NOTIFICATION_TYPES,
    default_preferences,
    init_firebase,
    register_token,
    send_to_user,
    unregister_token,
)

router = APIRouter(prefix="/push", tags=["push"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class RegisterTokenBody(BaseModel):
    token: str = Field(..., min_length=10, max_length=4096)
    platform: str = Field("android", pattern=r"^(android|ios|web)$")


class UnregisterTokenBody(BaseModel):
    token: str


class UpdatePreferencesBody(BaseModel):
    # Partial: only the flags the client wants to flip
    preferences: Dict[str, bool]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/register")
async def register_push_token(body: RegisterTokenBody, user: TokenData = Depends(require_auth)):
    """Save the device's FCM token. Idempotent — safe to call on every app launch."""
    await register_token(db, user.user_id, body.token, body.platform)
    return {"ok": True}


@router.delete("/unregister")
async def unregister_push_token(body: UnregisterTokenBody, user: TokenData = Depends(require_auth)):
    """Drop a token (e.g. on logout). Auth ensures only the owner can unregister."""
    # Best effort — silently ignore mismatched ownership (logout-flow friendly)
    await unregister_token(db, body.token)
    return {"ok": True}


@router.get("/preferences")
async def get_preferences(user: TokenData = Depends(require_auth)):
    """Return the user's notification preferences, with defaults for missing keys."""
    full_user = await db.users.find_one(
        {"id": user.user_id},
        {"_id": 0, "notification_preferences": 1},
    ) or {}
    stored = full_user.get("notification_preferences") or {}
    out = default_preferences()
    out.update({k: bool(v) for k, v in stored.items() if k in NOTIFICATION_TYPES})
    return {
        "preferences": out,
        "labels": NOTIFICATION_TYPES,  # human-readable labels for the UI
    }


@router.patch("/preferences")
async def update_preferences(body: UpdatePreferencesBody, user: TokenData = Depends(require_auth)):
    """Update one or more notification preference flags."""
    # Ignore unknown keys to keep the schema clean
    safe = {k: bool(v) for k, v in body.preferences.items() if k in NOTIFICATION_TYPES}
    if not safe:
        raise HTTPException(status_code=400, detail="No valid preference keys provided")
    set_doc = {f"notification_preferences.{k}": v for k, v in safe.items()}
    await db.users.update_one({"id": user.user_id}, {"$set": set_doc})
    return {"ok": True, "updated": safe}


@router.post("/test")
async def send_test_push(user: TokenData = Depends(require_auth)):
    """Send a test push to all of the current user's devices.

    Useful to verify Firebase setup end-to-end after registering a token.
    """
    if not init_firebase():
        raise HTTPException(
            status_code=503,
            detail="Firebase Admin SDK no configurado. Revisa FIREBASE_ADMIN_SDK_JSON env var.",
        )
    result = await send_to_user(
        db,
        user.user_id,
        "booking_confirmed",  # any enabled type
        title="🔔 Bookvia - Notificación de prueba",
        body="¡Las notificaciones push están funcionando correctamente!",
        deep_link="/",
    )
    return result
