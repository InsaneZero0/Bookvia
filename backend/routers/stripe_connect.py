"""
Stripe Connect Express integration — Phase A: Onboarding.

Allows each business to create its own Stripe Express account and complete
KYC hosted by Stripe. Payment flow migration (application_fee + transfer_data)
lives in a later phase; this router only handles onboarding + status sync.
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from datetime import datetime, timezone
import logging
import os

import stripe as stripe_lib

from core.database import db
from core.dependencies import require_business
from core.stripe_config import STRIPE_API_KEY

logger = logging.getLogger(__name__)

stripe_lib.api_key = STRIPE_API_KEY
if "sk_test_emergent" in (STRIPE_API_KEY or ""):
    stripe_lib.api_base = "https://integrations.emergentagent.com/stripe"

router = APIRouter(prefix="/stripe-connect", tags=["Stripe Connect"])


def _frontend_base_url(request: Request) -> str:
    """Resolve the frontend origin from the request `Origin` header, falling
    back to the environment variable. Stripe will redirect the user here after
    onboarding."""
    origin = request.headers.get("origin") or request.headers.get("referer", "").split("/").__getitem__(0) if False else request.headers.get("origin")
    if origin:
        return origin.rstrip("/")
    # Fallback to backend public URL env (Railway / Emergent)
    env_url = os.environ.get("FRONTEND_URL") or os.environ.get("PUBLIC_BASE_URL") or ""
    return env_url.rstrip("/") or "https://bookvia.app"


async def _sync_account_to_db(business_id: str, acct) -> dict:
    """Persist the authoritative Stripe account state into the business doc."""
    charges_enabled = bool(getattr(acct, "charges_enabled", False))
    payouts_enabled = bool(getattr(acct, "payouts_enabled", False))
    details_submitted = bool(getattr(acct, "details_submitted", False))
    requirements = getattr(acct, "requirements", None)
    disabled_reason = getattr(requirements, "disabled_reason", None) if requirements else None
    currently_due = list(getattr(requirements, "currently_due", []) or []) if requirements else []

    snapshot = {
        "stripe_connect_account_id": acct.id,
        "stripe_connect_charges_enabled": charges_enabled,
        "stripe_connect_payouts_enabled": payouts_enabled,
        "stripe_connect_details_submitted": details_submitted,
        "stripe_connect_disabled_reason": disabled_reason,
        "stripe_connect_requirements_due": currently_due,
        "stripe_connect_synced_at": datetime.now(timezone.utc).isoformat(),
    }
    if details_submitted and charges_enabled and payouts_enabled:
        snapshot.setdefault("stripe_connect_onboarded_at", datetime.now(timezone.utc).isoformat())

    await db.businesses.update_one({"id": business_id}, {"$set": snapshot})
    return snapshot


@router.post("/onboard")
async def connect_onboard(request: Request, current=Depends(require_business)):
    """Return a Stripe Express onboarding URL.

    - Creates the Express account if the business doesn't have one yet.
    - Generates a fresh `AccountLink` every call (links expire in minutes).
    """
    business = await db.businesses.find_one({"user_id": current.user_id}, {"_id": 0})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    account_id = business.get("stripe_connect_account_id")
    try:
        if not account_id:
            # Create Express account for MX marketplace
            acct = stripe_lib.Account.create(
                type="express",
                country="MX",
                email=business.get("email") or None,
                business_type="company" if business.get("tax_regime") in ("601", "603") else "individual",
                capabilities={
                    "card_payments": {"requested": True},
                    "transfers": {"requested": True},
                },
                business_profile={
                    "name": business.get("name"),
                    "url": "https://bookvia.app",
                    "mcc": "7299",  # Services - Miscellaneous personal services
                },
                settings={
                    # Payouts triggered manually by Bookvia cron (day 1 of month)
                    "payouts": {"schedule": {"interval": "manual"}},
                },
                metadata={
                    "bookvia_business_id": business["id"],
                    "bookvia_public_code": business.get("public_code") or "",
                },
            )
            account_id = acct.id
            await db.businesses.update_one(
                {"id": business["id"]},
                {"$set": {
                    "stripe_connect_account_id": account_id,
                    "stripe_connect_created_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
            logger.info(f"Created Stripe Connect Express account {account_id} for business {business['id']}")

        # Build redirect URLs back to the frontend
        origin = request.headers.get("origin") or os.environ.get("FRONTEND_URL", "https://bookvia.app")
        origin = origin.rstrip("/")
        return_url = f"{origin}/business/finance?connect_return=1"
        refresh_url = f"{origin}/business/finance?connect_refresh=1"

        link = stripe_lib.AccountLink.create(
            account=account_id,
            refresh_url=refresh_url,
            return_url=return_url,
            type="account_onboarding",
        )
        return {"url": link.url, "account_id": account_id}
    except stripe_lib.error.StripeError as e:
        logger.error(f"Stripe error in connect_onboard for biz {business['id']}: {e}")
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")


@router.get("/status")
async def connect_status(current=Depends(require_business)):
    """Fetch the live Stripe account state and sync it to MongoDB."""
    business = await db.businesses.find_one({"user_id": current.user_id}, {"_id": 0})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    account_id = business.get("stripe_connect_account_id")
    if not account_id:
        return {
            "connected": False,
            "account_id": None,
            "charges_enabled": False,
            "payouts_enabled": False,
            "details_submitted": False,
            "requirements_due": [],
            "disabled_reason": None,
        }

    try:
        acct = stripe_lib.Account.retrieve(account_id)
        snapshot = await _sync_account_to_db(business["id"], acct)
        return {
            "connected": True,
            "account_id": account_id,
            "charges_enabled": snapshot["stripe_connect_charges_enabled"],
            "payouts_enabled": snapshot["stripe_connect_payouts_enabled"],
            "details_submitted": snapshot["stripe_connect_details_submitted"],
            "requirements_due": snapshot["stripe_connect_requirements_due"],
            "disabled_reason": snapshot["stripe_connect_disabled_reason"],
        }
    except stripe_lib.error.StripeError as e:
        logger.error(f"Stripe error in connect_status for biz {business['id']}: {e}")
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")


@router.post("/dashboard-link")
async def connect_dashboard_link(current=Depends(require_business)):
    """Return a one-time login link so the business can access the Stripe
    Express dashboard (to see payouts, update banking info, etc.)."""
    business = await db.businesses.find_one({"user_id": current.user_id}, {"_id": 0})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    account_id = business.get("stripe_connect_account_id")
    if not account_id:
        raise HTTPException(status_code=400, detail="Stripe Connect account not created yet")

    try:
        link = stripe_lib.Account.create_login_link(account_id)
        return {"url": link.url}
    except stripe_lib.error.StripeError as e:
        logger.error(f"Stripe error in dashboard-link for biz {business['id']}: {e}")
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")
