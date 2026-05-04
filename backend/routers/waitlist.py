"""Fase 16: City waitlist - capture leads for cities/zones that don't
have businesses yet so the marketing team can reach out when Bookvia
opens that area.
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr, Field

from core.database import db
from core.dependencies import require_admin
from core.helpers import generate_id
from core.security import TokenData
from services.email import email_html, send_email

router = APIRouter(prefix="/waitlist", tags=["waitlist"])
admin_router = APIRouter(prefix="/admin/waitlist", tags=["admin-waitlist"])


class WaitlistRequest(BaseModel):
    email: EmailStr
    city: str = Field(min_length=2, max_length=80)
    country_code: Optional[str] = Field(default="MX", max_length=3)
    category_id: Optional[str] = None
    source: Optional[str] = None  # "search_empty" | "home_no_city" | "manual"


@router.post("")
async def join_waitlist(payload: WaitlistRequest, request: Request):
    """Public endpoint. One email can only sign up once per (city, country).
    Sends a confirmation email best-effort (failures are logged, never
    break the API response)."""
    email = payload.email.lower().strip()
    city = payload.city.strip().title()
    country = (payload.country_code or "MX").upper().strip()
    now_iso = datetime.now(timezone.utc).isoformat()

    existing = await db.waitlist_signups.find_one(
        {"email": email, "city": city, "country_code": country},
        {"_id": 0, "id": 1, "created_at": 1},
    )
    if existing:
        return {"ok": True, "already_subscribed": True, "created_at": existing["created_at"]}

    cat_name = None
    if payload.category_id:
        cat = await db.categories.find_one({"id": payload.category_id}, {"_id": 0, "name_es": 1})
        if cat:
            cat_name = cat.get("name_es")

    doc = {
        "id": generate_id(),
        "email": email,
        "city": city,
        "country_code": country,
        "category_id": payload.category_id,
        "category_name": cat_name,
        "source": payload.source or "manual",
        "ip_address": request.client.host if request and request.client else None,
        "user_agent": request.headers.get("user-agent", "")[:200] if request else None,
        "created_at": now_iso,
        "notified_at": None,
    }
    await db.waitlist_signups.insert_one(doc)

    # Fire-and-forget confirmation email
    try:
        subject = f"Bookvia llega pronto a {city}"
        cat_line = f"<br><strong>Categoria:</strong> {cat_name}" if cat_name else ""
        content = (
            f'<p style="color:#334155;font-size:15px;line-height:1.6;">'
            f'Gracias por tu interes en Bookvia. Registramos tu correo para avisarte '
            f'apenas abramos negocios en <strong>{city}</strong>.{cat_line}</p>'
            f'<p style="color:#334155;font-size:15px;line-height:1.6;">'
            f'Estamos expandiendo rapido por todo Mexico. Mientras tanto, puedes '
            f'explorar los negocios ya disponibles en tu pais.</p>'
            f'<table cellpadding="0" cellspacing="0" style="margin:24px 0;">'
            f'<tr><td style="background:#F05D5E;border-radius:8px;padding:12px 28px;">'
            f'<a href="https://bookvia.vercel.app" '
            f'style="color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">'
            f'Explorar Bookvia</a></td></tr></table>'
            f'<p style="color:#94a3b8;font-size:13px;">'
            f'Si no fuiste tu, ignora este correo.</p>'
        )
        await send_email(
            to=email,
            subject=subject,
            body=f"Gracias por tu interes en Bookvia. Te avisaremos cuando abramos en {city}.",
            html=email_html(subject, content),
            template="waitlist_confirm",
            data={"city": city, "country_code": country},
        )
    except Exception:
        # Never break signup because of email issues (eg. resend domain not verified)
        pass

    return {"ok": True, "already_subscribed": False}


@router.get("/stats")
async def waitlist_public_stats(country_code: str = "MX"):
    """Lightweight public stats so the signup card can show social proof
    ("ya hay 248 personas esperando que abramos en Monterrey")."""
    country = country_code.upper().strip()
    pipeline = [
        {"$match": {"country_code": country}},
        {"$group": {"_id": "$city", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    rows = await db.waitlist_signups.aggregate(pipeline).to_list(10)
    total = await db.waitlist_signups.count_documents({"country_code": country})
    return {
        "country_code": country,
        "total": total,
        "top_cities": [{"city": r["_id"], "count": r["count"]} for r in rows],
    }


# ============================ ADMIN ROUTES ============================


@admin_router.get("")
async def admin_list_waitlist(
    city: Optional[str] = None,
    country_code: Optional[str] = None,
    limit: int = 100,
    page: int = 1,
    token_data: TokenData = Depends(require_admin),
):
    q = {}
    if city:
        q["city"] = city.strip().title()
    if country_code:
        q["country_code"] = country_code.upper().strip()
    limit = max(1, min(limit, 500))
    page = max(1, page)

    total = await db.waitlist_signups.count_documents(q)
    cursor = db.waitlist_signups.find(q, {"_id": 0}).sort("created_at", -1) \
        .skip((page - 1) * limit).limit(limit)
    items = await cursor.to_list(limit)

    stats = await waitlist_public_stats(country_code or "MX")
    return {"total": total, "page": page, "limit": limit, "items": items, "stats": stats}


@admin_router.get("/export")
async def admin_export_waitlist(
    city: Optional[str] = None,
    country_code: Optional[str] = None,
    token_data: TokenData = Depends(require_admin),
):
    q = {}
    if city:
        q["city"] = city.strip().title()
    if country_code:
        q["country_code"] = country_code.upper().strip()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["email", "city", "country_code", "category", "source", "created_at"])
    async for d in db.waitlist_signups.find(q, {"_id": 0}).sort("created_at", -1):
        w.writerow([
            d.get("email", ""), d.get("city", ""), d.get("country_code", ""),
            d.get("category_name", ""), d.get("source", ""), d.get("created_at", ""),
        ])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=waitlist.csv"},
    )


@admin_router.delete("/{signup_id}")
async def admin_delete_waitlist(signup_id: str, token_data: TokenData = Depends(require_admin)):
    res = await db.waitlist_signups.delete_one({"id": signup_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Signup not found")
    return {"ok": True}
