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


# ============================ BROADCAST ============================


@admin_router.get("/cities/{city}/preview")
async def admin_broadcast_preview(
    city: str,
    country_code: str = "MX",
    only_unnotified: bool = False,
    token_data: TokenData = Depends(require_admin),
):
    """Count recipients and fetch featured businesses available in that
    city so the admin can decide what to include in the broadcast."""
    q = {"city": city.strip().title(), "country_code": country_code.upper().strip()}
    if only_unnotified:
        q["notified_at"] = None

    recipient_count = await db.waitlist_signups.count_documents(q)

    # Active businesses in that city (case-insensitive exact match)
    biz_q = {
        "city": {"$regex": f"^{city.strip()}$", "$options": "i"},
        "country_code": country_code.upper().strip(),
        "status": {"$nin": ["suspended", "deleted"]},
        "active": {"$ne": False},
    }
    cursor = db.businesses.find(
        biz_q,
        {"_id": 0, "id": 1, "name": 1, "slug": 1, "category_name": 1,
         "cover_image_url": 1, "logo_url": 1, "rating": 1, "review_count": 1},
    ).sort("rating", -1).limit(20)
    businesses = await cursor.to_list(20)
    return {
        "city": city.strip().title(),
        "country_code": country_code.upper().strip(),
        "recipient_count": recipient_count,
        "businesses": businesses,
    }


class BroadcastRequest(BaseModel):
    city: str = Field(min_length=2, max_length=80)
    country_code: str = "MX"
    subject: str = Field(min_length=5, max_length=120)
    message: str = Field(min_length=20, max_length=2000)
    business_ids: list[str] = []
    only_unnotified: bool = True  # safer default: skip people we already emailed


@admin_router.post("/broadcast")
async def admin_broadcast_send(
    payload: BroadcastRequest,
    request: Request,
    token_data: TokenData = Depends(require_admin),
):
    """Email every waitlist subscriber of a city that Bookvia just opened
    there. Records `notified_at` per signup so the next broadcast skips
    them unless the admin unchecks `only_unnotified`."""
    from core.helpers import create_audit_log

    city = payload.city.strip().title()
    country = payload.country_code.upper().strip()

    q = {"city": city, "country_code": country}
    if payload.only_unnotified:
        q["notified_at"] = None

    # Pull featured businesses chosen by the admin (max 5 for layout)
    featured = []
    if payload.business_ids:
        async for b in db.businesses.find(
            {"id": {"$in": payload.business_ids[:5]}},
            {"_id": 0, "id": 1, "name": 1, "slug": 1, "cover_image_url": 1,
             "logo_url": 1, "category_name": 1, "rating": 1, "review_count": 1},
        ):
            featured.append(b)

    # Build the business grid HTML once
    biz_html = ""
    if featured:
        cards = []
        for b in featured:
            img = b.get("cover_image_url") or b.get("logo_url") or ""
            rating_val = b.get("rating") or 0
            review_count = b.get("review_count") or 0
            rating_html = ""
            if rating_val:
                reviews_suffix = f" ({review_count} reseñas)" if review_count else ""
                rating_html = (
                    f'<p style="margin:4px 0 0;color:#64748b;font-size:12px;">'
                    f'&#9733; {float(rating_val):.1f}{reviews_suffix}</p>'
                )
            img_html = (
                f'<img src="{img}" width="100%" style="display:block;height:120px;object-fit:cover;" />'
                if img else ""
            )
            slug_or_id = b.get("slug") or b["id"]
            category = b.get("category_name") or ""
            card = (
                f'<td style="padding:8px;vertical-align:top;width:50%;">'
                f'<a href="https://bookvia.vercel.app/business/{slug_or_id}" '
                f'style="text-decoration:none;color:inherit;display:block;'
                f'border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#ffffff;">'
                f'{img_html}'
                f'<div style="padding:10px;">'
                f'<p style="margin:0;font-weight:bold;color:#1e293b;font-size:14px;">{b["name"]}</p>'
                f'<p style="margin:2px 0 0;color:#94a3b8;font-size:11px;">{category}</p>'
                f'{rating_html}'
                f'</div></a></td>'
            )
            cards.append(card)
        # Pair into 2-column rows
        rows_html = ""
        for i in range(0, len(cards), 2):
            pair = cards[i : i + 2]
            if len(pair) == 1:
                pair.append('<td style="width:50%;"></td>')
            rows_html += f'<tr>{"".join(pair)}</tr>'
        biz_html = (
            f'<h3 style="margin:24px 0 4px;color:#1e293b;font-size:16px;">'
            f'Primeros negocios disponibles</h3>'
            f'<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">'
            f'{rows_html}</table>'
        )

    # Sanitize custom message into simple paragraphs so admins can't
    # inject scripts while still getting line breaks.
    safe_message = (payload.message or "").replace("<", "&lt;").replace(">", "&gt;")
    paragraphs = "".join(
        f'<p style="color:#334155;font-size:15px;line-height:1.6;">{p.strip()}</p>'
        for p in safe_message.split("\n\n") if p.strip()
    )

    content = (
        f'<p style="margin:0 0 4px;color:#F05D5E;font-size:13px;font-weight:bold;'
        f'letter-spacing:0.5px;">BOOKVIA LLEGO A {city.upper()}</p>'
        f'{paragraphs}'
        f'{biz_html}'
        f'<table cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">'
        f'<tr><td style="background:#F05D5E;border-radius:8px;padding:12px 28px;">'
        f'<a href="https://bookvia.vercel.app/search?city={city}" '
        f'style="color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">'
        f'Explorar en {city}</a></td></tr></table>'
        f'<p style="color:#94a3b8;font-size:12px;margin-top:24px;">'
        f'Recibes esto porque te registraste en la lista de espera de Bookvia para {city}.</p>'
    )
    html = email_html(payload.subject, content)

    sent, failed = [], []
    now_iso = datetime.now(timezone.utc).isoformat()
    notified_ids = []

    async for signup in db.waitlist_signups.find(q, {"_id": 0}):
        to = signup.get("email")
        if not to:
            continue
        try:
            await send_email(
                to=to, subject=payload.subject, html=html,
                body=f"Bookvia llego a {city}. {payload.message[:200]}",
                template="waitlist_broadcast",
                data={"city": city, "country_code": country},
            )
            sent.append(to)
            notified_ids.append(signup["id"])
        except Exception as e:
            failed.append({"to": to, "error": str(e)[:200]})

    if notified_ids:
        await db.waitlist_signups.update_many(
            {"id": {"$in": notified_ids}},
            {"$set": {"notified_at": now_iso, "last_broadcast_subject": payload.subject}},
        )

    await create_audit_log(
        admin_id=token_data.user_id, admin_email=token_data.email,
        action="waitlist_broadcast",
        target_type="waitlist_city", target_id=f"{country}:{city}",
        details={
            "subject": payload.subject, "sent_count": len(sent),
            "failed_count": len(failed), "businesses_included": len(featured),
            "only_unnotified": payload.only_unnotified,
        },
        request=request,
    )

    return {
        "ok": True,
        "city": city,
        "country_code": country,
        "sent_count": len(sent),
        "failed_count": len(failed),
        "failed": failed[:10],
    }
