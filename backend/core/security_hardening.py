"""
Fase 12a: Platform rate limiting (slowapi) and brute-force protection.

`limiter` is imported by main.py to decorate sensitive endpoints.
`check_brute_force()` records failed login attempts per IP+email and locks
them out after N failures inside a window.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from core.database import db

logger = logging.getLogger(__name__)

# Global rate limiter. Defaults to in-memory storage - good enough for a
# single-worker preview. When we scale to multiple workers we can swap
# `storage_uri` to a Redis URL.
limiter = Limiter(key_func=get_remote_address, default_limits=["300/minute"])


# --------------- Brute-force lockout ---------------

BRUTE_FORCE_MAX_ATTEMPTS = 10       # within the window
BRUTE_FORCE_WINDOW_MIN = 15         # minutes
BRUTE_FORCE_LOCKOUT_MIN = 30        # minutes after limit reached


def _client_ip(request: Request) -> str:
    return (
        (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )


async def check_brute_force(request: Request, email: str) -> None:
    """Raise 429 if the caller has been locked out by brute-force guard.

    Must be called BEFORE verifying the password so the caller can't brute
    force through valid-password attempts either.
    """
    ip = _client_ip(request)
    key = f"{ip}|{(email or '').lower()}"
    doc = await db.brute_force_attempts.find_one({"_id": key})
    if not doc:
        return
    locked_until = doc.get("locked_until")
    if locked_until:
        try:
            lock_dt = datetime.fromisoformat(locked_until)
            if lock_dt > datetime.now(timezone.utc):
                remaining = int((lock_dt - datetime.now(timezone.utc)).total_seconds())
                raise HTTPException(
                    status_code=429,
                    detail=f"Demasiados intentos fallidos. Intenta de nuevo en {remaining // 60 + 1} minutos.",
                )
        except ValueError:
            pass


async def record_login_failure(request: Request, email: str) -> None:
    """Increment counter; when threshold is crossed set `locked_until`."""
    ip = _client_ip(request)
    key = f"{ip}|{(email or '').lower()}"
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(minutes=BRUTE_FORCE_WINDOW_MIN)).isoformat()

    doc = await db.brute_force_attempts.find_one_and_update(
        {"_id": key},
        {
            "$push": {"attempts": now.isoformat()},
            "$set": {"ip": ip, "email": (email or "").lower(), "last_at": now.isoformat()},
        },
        upsert=True,
        return_document=True,
    )

    # Trim attempts outside the window
    attempts = [a for a in (doc.get("attempts") or []) if a > cutoff]
    update = {"attempts": attempts}
    if len(attempts) >= BRUTE_FORCE_MAX_ATTEMPTS:
        update["locked_until"] = (now + timedelta(minutes=BRUTE_FORCE_LOCKOUT_MIN)).isoformat()
        logger.warning(f"Brute-force lockout triggered for {key} ({len(attempts)} attempts)")
    await db.brute_force_attempts.update_one({"_id": key}, {"$set": update})


async def clear_login_failures(request: Request, email: str) -> None:
    """Called after a successful login to reset the counter."""
    ip = _client_ip(request)
    key = f"{ip}|{(email or '').lower()}"
    await db.brute_force_attempts.delete_one({"_id": key})


# --------------- Security headers middleware ---------------

async def security_headers_middleware(request: Request, call_next):
    """Adds HSTS + basic hardening headers on every response."""
    response = await call_next(request)
    # HSTS: 2 years, includeSubDomains, preload - only on HTTPS
    response.headers.setdefault(
        "Strict-Transport-Security",
        "max-age=63072000; includeSubDomains; preload",
    )
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    # Let the frontend app open Stripe/third-party in iframes without MIME sniffing
    response.headers.setdefault("Permissions-Policy", "geolocation=(self), camera=(), microphone=()")
    return response
