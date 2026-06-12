"""Branches (Sucursales) router.

A Branch is a physical location of a Business. One Business can have N branches.
Existing legacy businesses get a "Sucursal Principal" auto-created on first GET
so the migration is seamless.

Booking and Service models gain an optional branch_id field. Reservations
created before multi-branch existed are treated as belonging to the primary
branch.
"""
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from bson import ObjectId

from core.database import db
from core.dependencies import require_business, require_auth, TokenData
from core.helpers import generate_id
from models.schemas import BranchCreate, BranchUpdate, BranchResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Branches"])


async def _serialize_branch(b: dict, include_metrics: bool = False) -> dict:
    """Strip Mongo internals and optionally hydrate live metrics."""
    out = {**b}
    out.pop("_id", None)
    if include_metrics:
        # Bookings created in current month for this branch
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
        try:
            count = await db.bookings.count_documents({"branch_id": b["id"], "created_at": {"$gte": month_start}})
            out["bookings_month"] = int(count)
        except Exception:
            out["bookings_month"] = 0
        try:
            services_count = await db.services.count_documents({"$or": [{"branch_id": b["id"]}, {"branch_id": None, "business_id": b["business_id"]}]})
            out["services_count"] = int(services_count)
        except Exception:
            out["services_count"] = 0
    return out


async def _ensure_primary_branch(business: dict) -> dict:
    """Auto-create a primary branch for legacy businesses.

    Called from GET /branches the first time. Uses the existing business
    address/phone/hours as the primary branch defaults. Idempotent.
    """
    existing = await db.branches.find_one({"business_id": business["id"], "is_primary": True})
    if existing:
        return existing
    now_iso = datetime.now(timezone.utc).isoformat()
    branch = {
        "id": generate_id(),
        "business_id": business["id"],
        "name": business.get("name", "Sucursal Principal") + " - Principal",
        "address": business.get("address", ""),
        "city": business.get("city", ""),
        "state": business.get("state", ""),
        "zip_code": business.get("zip_code", "") or "",
        "country": business.get("country", "MX") or "MX",
        "latitude": business.get("latitude"),
        "longitude": business.get("longitude"),
        "phone": business.get("phone"),
        "timezone": business.get("timezone", "America/Mexico_City") or "America/Mexico_City",
        "business_hours": business.get("business_hours"),
        "photos": business.get("photos", []) or [],
        "cover_photo": business.get("cover_photo"),
        "is_active": True,
        "is_primary": True,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.branches.insert_one(branch)
    # Backfill: assign primary branch_id to existing bookings/services that don't have one.
    await db.bookings.update_many({"business_id": business["id"], "branch_id": {"$in": [None, ""]}}, {"$set": {"branch_id": branch["id"]}})
    await db.bookings.update_many({"business_id": business["id"], "branch_id": {"$exists": False}}, {"$set": {"branch_id": branch["id"]}})
    return branch


# =================== OWNER-FACING ENDPOINTS ===================

@router.get("/businesses/me/branches", response_model=List[BranchResponse])
async def list_my_branches(token_data: TokenData = Depends(require_auth)):
    """List all branches of the authenticated business owner / manager.

    Auto-creates the primary branch on first call if the business has none yet
    (seamless migration for legacy single-location businesses).
    """
    user = await db.users.find_one({"id": token_data.user_id})
    business_id = (user or {}).get("business_id")
    if not business_id:
        raise HTTPException(status_code=404, detail="Business not found")
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    # Ensure primary branch exists (lazy auto-migration for legacy businesses)
    await _ensure_primary_branch(business)

    branches = await db.branches.find({"business_id": business_id}).sort([("is_primary", -1), ("created_at", 1)]).to_list(100)
    return [await _serialize_branch(b, include_metrics=True) for b in branches]


@router.post("/businesses/me/branches", response_model=BranchResponse)
async def create_branch(body: BranchCreate, token_data: TokenData = Depends(require_business)):
    """Create a new branch for the authenticated business."""
    if token_data.is_manager:
        raise HTTPException(status_code=403, detail="Solo el dueño puede crear sucursales")
    user = await db.users.find_one({"id": token_data.user_id})
    business_id = (user or {}).get("business_id")
    if not business_id:
        raise HTTPException(status_code=404, detail="Business not found")
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    # Ensure primary exists first so new branches are not accidentally primary
    await _ensure_primary_branch(business)

    now_iso = datetime.now(timezone.utc).isoformat()
    branch = {
        "id": generate_id(),
        "business_id": business_id,
        "name": body.name.strip()[:120],
        "address": body.address.strip()[:300],
        "city": body.city.strip()[:80],
        "state": body.state.strip()[:80],
        "zip_code": (body.zip_code or "").strip()[:20],
        "country": (body.country or "MX")[:5],
        "latitude": body.latitude,
        "longitude": body.longitude,
        "phone": (body.phone or "").strip()[:30] or None,
        "timezone": body.timezone or "America/Mexico_City",
        "business_hours": body.business_hours,
        "photos": body.photos or [],
        "cover_photo": body.cover_photo,
        "is_active": True,
        "is_primary": False,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db.branches.insert_one(branch)
    return await _serialize_branch(branch, include_metrics=True)


@router.get("/businesses/me/branches/{branch_id}", response_model=BranchResponse)
async def get_my_branch(branch_id: str, token_data: TokenData = Depends(require_auth)):
    user = await db.users.find_one({"id": token_data.user_id})
    business_id = (user or {}).get("business_id")
    branch = await db.branches.find_one({"id": branch_id, "business_id": business_id})
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    return await _serialize_branch(branch, include_metrics=True)


@router.patch("/businesses/me/branches/{branch_id}", response_model=BranchResponse)
async def update_branch(branch_id: str, body: BranchUpdate, token_data: TokenData = Depends(require_business)):
    if token_data.is_manager:
        raise HTTPException(status_code=403, detail="Solo el dueño puede editar sucursales")
    user = await db.users.find_one({"id": token_data.user_id})
    business_id = (user or {}).get("business_id")
    branch = await db.branches.find_one({"id": branch_id, "business_id": business_id})
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    updates = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    if not updates:
        return await _serialize_branch(branch, include_metrics=True)

    # Sanitize string lengths
    for k in ("name",):
        if k in updates: updates[k] = str(updates[k]).strip()[:120]
    for k in ("address",):
        if k in updates: updates[k] = str(updates[k]).strip()[:300]
    for k in ("city", "state"):
        if k in updates: updates[k] = str(updates[k]).strip()[:80]

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.branches.update_one({"id": branch_id}, {"$set": updates})
    fresh = await db.branches.find_one({"id": branch_id})
    return await _serialize_branch(fresh, include_metrics=True)


@router.delete("/businesses/me/branches/{branch_id}")
async def delete_branch(branch_id: str, token_data: TokenData = Depends(require_business)):
    """Soft-delete a branch. Primary branch cannot be deleted.

    Sets is_active=false. Existing bookings/services keep their branch_id so
    history is preserved. Deactivated branches do not appear in public search.
    """
    if token_data.is_manager:
        raise HTTPException(status_code=403, detail="Solo el dueño puede dar de baja sucursales")
    user = await db.users.find_one({"id": token_data.user_id})
    business_id = (user or {}).get("business_id")
    branch = await db.branches.find_one({"id": branch_id, "business_id": business_id})
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    if branch.get("is_primary"):
        raise HTTPException(status_code=400, detail="No puedes eliminar la sucursal principal. Elimina las demás primero o marca otra como principal.")

    # Block delete if there are upcoming bookings
    today_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    upcoming = await db.bookings.count_documents({
        "branch_id": branch_id,
        "date": {"$gte": today_iso},
        "status": {"$in": ["pending", "confirmed"]},
    })
    if upcoming > 0:
        raise HTTPException(status_code=409, detail=f"Esta sucursal tiene {upcoming} reservas futuras pendientes. Cancélalas o reasígnalas antes de eliminar.")

    await db.branches.update_one({"id": branch_id}, {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Branch deactivated", "branch_id": branch_id}


@router.post("/businesses/me/branches/{branch_id}/set-primary")
async def set_primary_branch(branch_id: str, token_data: TokenData = Depends(require_business)):
    """Promote a branch to primary. Demotes the current primary atomically."""
    if token_data.is_manager:
        raise HTTPException(status_code=403, detail="Solo el dueño puede cambiar la sucursal principal")
    user = await db.users.find_one({"id": token_data.user_id})
    business_id = (user or {}).get("business_id")
    target = await db.branches.find_one({"id": branch_id, "business_id": business_id})
    if not target:
        raise HTTPException(status_code=404, detail="Branch not found")
    if not target.get("is_active"):
        raise HTTPException(status_code=400, detail="No puedes hacer principal una sucursal inactiva")

    now_iso = datetime.now(timezone.utc).isoformat()
    # Demote current primaries
    await db.branches.update_many({"business_id": business_id, "is_primary": True}, {"$set": {"is_primary": False, "updated_at": now_iso}})
    # Promote target
    await db.branches.update_one({"id": branch_id}, {"$set": {"is_primary": True, "updated_at": now_iso}})
    return {"message": "Primary branch updated", "branch_id": branch_id}


# =================== PUBLIC ENDPOINTS ===================

@router.get("/businesses/{business_id}/branches", response_model=List[BranchResponse])
async def list_public_branches(business_id: str):
    """Public list of active branches for a given business."""
    business = await db.businesses.find_one({"id": business_id})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    # Lazy-create primary if needed (so the public endpoint always returns at least 1)
    await _ensure_primary_branch(business)
    branches = await db.branches.find({"business_id": business_id, "is_active": True}).sort([("is_primary", -1), ("name", 1)]).to_list(50)
    return [await _serialize_branch(b, include_metrics=False) for b in branches]
