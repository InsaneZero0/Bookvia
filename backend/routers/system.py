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
from core.config import ENV, BASE_URL, ADMIN_EMAIL, ADMIN_INITIAL_PASSWORD
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
from services.cloudinary_service import is_configured as cloudinary_configured, upload_image, validate_image

logger = logging.getLogger(__name__)

ENV = os.environ.get('ENV', 'development')

import stripe as stripe_lib
from core.stripe_config import STRIPE_API_KEY
stripe_lib.api_key = STRIPE_API_KEY
if "sk_test_emergent" in (STRIPE_API_KEY or ""):
    stripe_lib.api_base = "https://integrations.emergentagent.com/stripe"
from services.storage import init_storage, put_object, get_object, generate_upload_path, ALLOWED_IMAGE_TYPES, ALLOWED_IMAGE_EXTENSIONS, MAX_FILE_SIZE

router = APIRouter(tags=["System"])

@router.get("/health", tags=["System"])
async def health_check():
    """Health check endpoint with configuration status"""
    # Check database connection
    try:
        await db.command("ping")
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"
    
    # Check service configurations
    twilio_configured = all([
        os.environ.get("TWILIO_ACCOUNT_SID"),
        os.environ.get("TWILIO_AUTH_TOKEN"),
        os.environ.get("TWILIO_PHONE_NUMBER")
    ])
    
    resend_configured = bool(os.environ.get("RESEND_API_KEY"))
    
    stripe_key = os.environ.get("STRIPE_API_KEY", "")
    stripe_status = "not configured"
    if stripe_key:
        stripe_status = "live" if stripe_key.startswith("sk_live_") else "test"
    
    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "version": "1.0.0",
        "environment": ENV,
        "database": db_status,
        "config": {
            "sms": "twilio" if twilio_configured else "mock",
            "email": "resend" if resend_configured else "mock",
            "stripe": stripe_status,
            "base_url": os.environ.get("BASE_URL", "auto-detect")
        }
    }



@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events - SOURCE OF TRUTH for payments"""
    body = await request.body()
    signature = request.headers.get("Stripe-Signature", "")
    
    try:
        # Try to verify with webhook secret if available
        webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
        if webhook_secret:
            event = stripe_lib.Webhook.construct_event(body, signature, webhook_secret)
        else:
            event = stripe_lib.Event.construct_from(
                stripe_lib.util.convert_to_stripe_object(
                    __import__('json').loads(body)
                ),
                stripe_lib.api_key
            )
        
        if event.type == "checkout.session.completed":
            session = event.data.object
            session_id = session.id
            payment_status = "paid" if session.payment_status == "paid" else "unpaid"
            
            logger.info(f"Webhook received: session={session_id}, status={payment_status}")
            
            # Idempotency check
            transaction = await db.transactions.find_one({"stripe_session_id": session_id})
            if not transaction:
                logger.warning(f"No transaction found for session {session_id}")
                return {"status": "ignored", "reason": "no_transaction"}
            
            # Already processed?
            if transaction["status"] == TransactionStatus.PAID:
                logger.info(f"Transaction {transaction['id']} already paid, ignoring duplicate webhook")
                return {"status": "already_processed"}
            
            if payment_status == "paid":
                now = datetime.now(timezone.utc).isoformat()
                
                # Update transaction
                await db.transactions.update_one(
                    {"id": transaction["id"]},
                    {"$set": {
                        "status": TransactionStatus.PAID,
                        "stripe_payment_intent_id": session.payment_intent if hasattr(session, 'payment_intent') else None,
                        "paid_at": now,
                        "updated_at": now
                    }}
                )
                
                # Create ledger entries for payment
                await create_transaction_ledger_entries(transaction, TransactionStatus.PAID)
                
                # Update booking to CONFIRMED
                await db.bookings.update_one(
                    {"id": transaction["booking_id"]},
                    {"$set": {
                        "status": AppointmentStatus.CONFIRMED,
                        "deposit_paid": True,
                        "confirmed_at": now
                    }}
                )
                
                # Get booking details for notification
                booking = await db.bookings.find_one({"id": transaction["booking_id"]})
                business = await db.businesses.find_one({"id": transaction["business_id"]})
                user = await db.users.find_one({"id": transaction["user_id"]})
                service = await db.services.find_one({"id": booking["service_id"]}) if booking else None
                
                # Notify user
                if user:
                    await create_notification(
                        user["id"],
                        "Pago Confirmado",
                        f"Tu anticipo de ${transaction['amount_total']} MXN ha sido confirmado para {service['name'] if service else 'tu cita'}",
                        "system",
                        {"booking_id": transaction["booking_id"], "transaction_id": transaction["id"]}
                    )
                
                # Notify business
                if business:
                    await create_notification(
                        business["user_id"],
                        "Reserva Confirmada",
                        f"Nueva reserva confirmada de {user['full_name'] if user else 'cliente'} - Anticipo recibido",
                        "booking",
                        {"booking_id": transaction["booking_id"]}
                    )
                
                # Notify worker (email + internal notification)
                if booking and booking.get("worker_id"):
                    worker = await db.workers.find_one({"id": booking["worker_id"]})
                    if worker:
                        worker_user = await db.users.find_one({"email": worker.get("email")}) if worker.get("email") else None
                        if worker_user:
                            await create_notification(
                                worker_user["id"],
                                "Nueva cita asignada",
                                f"Se te ha asignado una cita: {service['name'] if service else 'servicio'} el {booking['date']} a las {booking['time']}",
                                "worker_assignment",
                                {"booking_id": booking["id"]}
                            )
                        
                        if worker.get("email"):
                            from services.email import send_worker_assignment
                            try:
                                await send_worker_assignment(
                                    worker_email=worker["email"],
                                    worker_name=worker["name"],
                                    business_name=business["name"] if business else "Bookvia",
                                    service_name=service["name"] if service else "Servicio",
                                    client_name=user["full_name"] if user else "Cliente",
                                    date=booking["date"],
                                    time=booking["time"],
                                    notes=booking.get("notes")
                                )
                                logger.info(f"Worker notification sent to {worker['email']} for booking {booking['id']}")
                            except Exception as e:
                                logger.error(f"Error sending worker notification: {e}")
                
                # Send confirmation email to client
                if user and booking and service:
                    from services.email import send_booking_confirmation
                    try:
                        worker_name = ""
                        if booking.get("worker_id"):
                            w = await db.workers.find_one({"id": booking["worker_id"]}, {"_id": 0, "name": 1})
                            worker_name = w["name"] if w else ""
                        await send_booking_confirmation(
                            user_email=user["email"],
                            user_name=user.get("full_name", "Cliente"),
                            business_name=business["name"] if business else "Negocio",
                            service_name=service["name"],
                            date=booking["date"],
                            time=booking["time"],
                            worker_name=worker_name
                        )
                        logger.info(f"Confirmation email sent to {user['email']} for booking {booking['id']}")
                    except Exception as e:
                        logger.error(f"Error sending confirmation email: {e}")
                
                # Update business balance (pending payout)
                await db.businesses.update_one(
                    {"id": transaction["business_id"]},
                    {"$inc": {"pending_balance": transaction["payout_amount"]}}
                )
                
                logger.info(f"Payment confirmed for booking {transaction['booking_id']}")
        
        return {"status": "success"}
        
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"status": "error", "message": str(e)}



@router.post("/seed")
async def seed_data():
    """Seed initial categories and admin user from environment variables"""
    categories = [
        {"id": generate_id(), "name_es": "Belleza y Estética", "name_en": "Beauty & Aesthetics", "slug": "belleza-estetica", "icon": "Sparkles", "image_url": "https://images.pexels.com/photos/853427/pexels-photo-853427.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"},
        {"id": generate_id(), "name_es": "Salud", "name_en": "Health", "slug": "salud", "icon": "Heart", "image_url": "https://images.pexels.com/photos/4270095/pexels-photo-4270095.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"},
        {"id": generate_id(), "name_es": "Fitness y Bienestar", "name_en": "Fitness & Wellness", "slug": "fitness-bienestar", "icon": "Dumbbell", "image_url": "https://images.unsplash.com/photo-1761971975724-31001b4de0bf?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDF8MHwxfHNlYXJjaHwzfHx5b2dhJTIwc3R1ZGlvJTIwaW50ZXJpb3IlMjBjYWxtfGVufDB8fHx8MTc3MTgwMjE1OXww&ixlib=rb-4.1.0&q=85"},
        {"id": generate_id(), "name_es": "Spa y Masajes", "name_en": "Spa & Massage", "slug": "spa-masajes", "icon": "Flower2", "image_url": "https://images.pexels.com/photos/5240677/pexels-photo-5240677.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"},
        {"id": generate_id(), "name_es": "Servicios Legales", "name_en": "Legal Services", "slug": "servicios-legales", "icon": "Scale", "image_url": "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&q=80&w=2070"},
        {"id": generate_id(), "name_es": "Consultoría", "name_en": "Consulting", "slug": "consultoria", "icon": "Briefcase", "image_url": "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&q=80&w=2070"},
        {"id": generate_id(), "name_es": "Automotriz", "name_en": "Automotive", "slug": "automotriz", "icon": "Car", "image_url": "https://images.unsplash.com/photo-1487754180451-c456f719a1fc?auto=format&fit=crop&q=80&w=2070"},
        {"id": generate_id(), "name_es": "Veterinaria", "name_en": "Veterinary", "slug": "veterinaria", "icon": "PawPrint", "image_url": "https://images.unsplash.com/photo-1628009368231-7bb7cfcb0def?auto=format&fit=crop&q=80&w=2070"},
        {"id": generate_id(), "name_es": "Salones, Servicios y Eventos", "name_en": "Venues, Services & Events", "slug": "salones-servicios-eventos", "icon": "PartyPopper", "image_url": "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=2070"},
    ]
    
    # Upsert categories by slug (idempotent - adds new ones, updates existing)
    for cat in categories:
        await db.categories.update_one(
            {"slug": cat["slug"]},
            {"$setOnInsert": cat},
            upsert=True
        )
    
    # Create admin user from environment variables - NEVER hardcode credentials
    admin_email = ADMIN_EMAIL
    admin_password = ADMIN_INITIAL_PASSWORD
    
    if not admin_email or not admin_password:
        logger.warning("ADMIN_EMAIL or ADMIN_INITIAL_PASSWORD not set in environment variables")
        return {
            "message": "Categories seeded. Admin not created - set ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD in environment",
            "admin_created": False
        }
    
    # Check if admin already exists
    existing_admin = await db.users.find_one({"email": admin_email})
    if existing_admin:
        return {
            "message": "Categories seeded. Admin already exists",
            "admin_created": False,
            "admin_email": admin_email
        }
    
    admin_doc = {
        "id": generate_id(),
        "email": admin_email,
        "password_hash": hash_password(admin_password),
        "full_name": "Admin Bookvia",
        "phone": "+521234567890",
        "phone_verified": True,
        "role": UserRole.ADMIN,
        "totp_enabled": False,  # Must be enabled on first login
        "totp_secret": None,
        "backup_codes": [],
        "must_change_password": False,  # Set to True if using temp password
        "preferred_language": "es",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(admin_doc)
    
    logger.info(f"Admin user created with email: {admin_email}")
    
    return {
        "message": "Seed data created successfully",
        "admin_created": True,
        "admin_email": admin_email,
        "note": "2FA setup required on first admin login"
    }



@router.post("/contact")
async def submit_contact_form(contact: ContactMessage):
    """Submit a contact form message"""
    contact_doc = {
        "id": generate_id(),
        "name": contact.name,
        "email": contact.email,
        "subject": contact.subject or "Sin asunto",
        "category": contact.category or "general",
        "message": contact.message,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "responded_at": None,
        "response": None
    }
    
    await db.contact_messages.insert_one(contact_doc)
    
    # Log for admin notification (in production, send email)
    logger.info(f"New contact message from {contact.email}: {contact.subject}")
    
    return {"success": True, "message": "Contact message received"}



@router.get("/admin/contact-messages")
async def get_contact_messages(
    status: Optional[str] = None,
    token_data: TokenData = Depends(require_admin)
):
    """Get all contact messages (admin only)"""
    filters = {}
    if status:
        filters["status"] = status
    
    messages = await db.contact_messages.find(
        filters, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return messages



@router.put("/admin/contact-messages/{message_id}")
async def update_contact_message(
    message_id: str,
    response: str = None,
    status: str = "responded",
    token_data: TokenData = Depends(require_admin)
):
    """Update a contact message (admin only)"""
    update_data = {
        "status": status,
        "responded_at": datetime.now(timezone.utc).isoformat()
    }
    if response:
        update_data["response"] = response
    
    result = await db.contact_messages.update_one(
        {"id": message_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Message not found")
    
    return {"success": True}



@router.get("/cities")
async def get_cities(country_code: str = "MX", with_businesses: bool = False, q: Optional[str] = None):
    """Get list of cities for a country. If with_businesses=True, only returns cities that have approved businesses, sorted by count."""
    country_upper = country_code.upper()

    if with_businesses:
        # Aggregate: count approved businesses per city in this country
        pipeline = [
            {"$match": {**VISIBLE_BUSINESS_FILTER, "country_code": country_upper}},
            {"$group": {"_id": "$city", "count": {"$sum": 1}}},
            {"$match": {"_id": {"$ne": None}}},
            {"$sort": {"count": -1}},
        ]
        if q:
            pipeline[0]["$match"]["city"] = {"$regex": q, "$options": "i"}

        agg_results = await db.businesses.aggregate(pipeline).to_list(200)

        cities_out = []
        for r in agg_results:
            city_name = r["_id"]
            # Try to enrich with seeded city data (state, slug)
            seeded = await db.cities.find_one(
                {"name": city_name, "country_code": country_upper},
                {"_id": 0}
            )
            if seeded:
                seeded["business_count"] = r["count"]
                cities_out.append(seeded)
            else:
                cities_out.append({
                    "name": city_name,
                    "slug": city_name.lower().replace(" ", "-"),
                    "country_code": country_upper,
                    "business_count": r["count"],
                })
        return cities_out

    # Default: return all seeded cities for the country
    filter_q = {"country_code": country_upper, "active": True}
    if q:
        filter_q["name"] = {"$regex": q, "$options": "i"}

    cities_from_db = await db.cities.find(filter_q, {"_id": 0}).sort("name", 1).to_list(500)
    if cities_from_db:
        return cities_from_db

    # Fallback: get from businesses
    cities = await db.businesses.distinct("city", {
        **VISIBLE_BUSINESS_FILTER,
        "country_code": country_upper
    })
    return [{"name": city, "slug": city.lower().replace(" ", "-"), "country_code": country_upper} for city in cities if city]




@router.post("/seed/countries")
async def seed_countries():
    """Seed countries and cities for multi-country support (idempotent via upsert)"""
    from data.countries import COUNTRIES
    from data.cities import CITIES as CITIES_DATA

    upserted = 0
    for c in COUNTRIES:
        result = await db.countries.update_one(
            {"code": c["code"]},
            {"$set": c},
            upsert=True,
        )
        if result.upserted_id or result.modified_count:
            upserted += 1

    # Seed cities from master data (idempotent via upsert)
    cities_upserted = 0
    for city in CITIES_DATA:
        result = await db.cities.update_one(
            {"slug": city["slug"], "country_code": city["country_code"]},
            {"$set": city},
            upsert=True,
        )
        if result.upserted_id or result.modified_count:
            cities_upserted += 1

    # Backfill: existing businesses without country_code default to MX
    await db.businesses.update_many(
        {"country_code": {"$exists": False}},
        {"$set": {"country_code": "MX"}}
    )
    await db.ledger_entries.update_many(
        {"country_code": {"$exists": False}},
        {"$set": {"country_code": "MX"}}
    )
    await db.settlements.update_many(
        {"country_code": {"$exists": False}},
        {"$set": {"country_code": "MX"}}
    )

    total_countries = await db.countries.count_documents({})
    return {
        "message": "Countries seed completed (idempotent)",
        "countries_total": total_countries,
        "countries_upserted": upserted,
        "cities_upserted": cities_upserted,
    }




@router.post("/upload/public")
async def upload_public_image(file: UploadFile = File(...)):
    """Public upload endpoint for registration (no auth needed)."""
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum 5MB")
    
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    if ext not in ("jpg", "jpeg", "png", "webp", "jfif"):
        raise HTTPException(status_code=400, detail="Only JPG, PNG, WebP allowed")
    
    content_type = file.content_type or "image/jpeg"
    if ext in ("jfif", "jpg", "jpeg", "pjpeg"):
        content_type = "image/jpeg"
    
    path = generate_upload_path("registration", file.filename)
    try:
        result = put_object(path, data, content_type)
        base_url = os.environ.get("BASE_URL", "")
        photo_url = f"{base_url}/api/files/{result['path']}"
        return {"url": photo_url}
    except Exception as e:
        logger.error(f"Public upload failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload image")




@router.post("/upload/image")
async def upload_image_endpoint(
    file: UploadFile = File(...),
    folder: str = "business_gallery",
    entity_id: str = "",
    token_data: TokenData = Depends(require_auth),
):
    """Upload an image to Cloudinary. Used by logo upload, gallery, etc."""
    data = await file.read()
    ok, err = validate_image(file.filename, file.content_type, len(data))
    if not ok:
        raise HTTPException(status_code=400, detail=err)

    if not cloudinary_configured():
        raise HTTPException(status_code=503, detail="Image storage not configured")

    try:
        result = upload_image(data, folder, entity_id)
        return {"secure_url": result["secure_url"], "public_id": result["public_id"]}
    except Exception as e:
        logger.error(f"Cloudinary upload error: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload image")




@router.get("/files/{path:path}")
async def serve_file(path: str):
    """Serve uploaded files from Emergent object storage (fallback)."""
    # Check business_photos collection first
    record = await db.business_photos.find_one({"public_id": path, "is_deleted": False})
    
    # If not found in photos, check if it's a logo (stored in businesses collection)
    if not record:
        business = await db.businesses.find_one({"logo_public_id": path})
        if business:
            record = {"content_type": "image/jpeg"}  # Default for logos
    
    if not record:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        data, content_type = get_object(path)
    except Exception as e:
        logger.error(f"Failed to retrieve file: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve file")

    return Response(
        content=data,
        media_type=record.get("content_type", content_type),
        headers={"Cache-Control": "public, max-age=86400"}
    )






@router.post("/support/tickets")
async def create_support_ticket(ticket: SupportTicketCreate, token_data: TokenData = Depends(require_auth)):
    """Create a support ticket (authenticated users)."""
    user = await db.users.find_one({"id": token_data.user_id}, {"_id": 0, "full_name": 1, "email": 1})
    now = datetime.now(timezone.utc).isoformat()
    biz_name = None
    if ticket.business_id:
        biz = await db.businesses.find_one({"id": ticket.business_id}, {"_id": 0, "name": 1})
        biz_name = biz.get("name") if biz else None
    doc = {
        "id": generate_id(),
        "user_id": token_data.user_id,
        "user_name": user.get("full_name", "") if user else "",
        "user_email": user.get("email", "") if user else "",
        "subject": ticket.subject,
        "message": ticket.message,
        "category": ticket.category,
        "status": "open",
        "business_id": ticket.business_id,
        "business_name": biz_name,
        "booking_id": ticket.booking_id,
        "messages": [{"sender": "user", "sender_name": user.get("full_name", ""), "message": ticket.message, "created_at": now}],
        "created_at": now,
        "updated_at": now,
    }
    await db.support_tickets.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/support/my-tickets")
async def get_my_tickets(page: int = 1, limit: int = 20, token_data: TokenData = Depends(require_auth)):
    """Get tickets created by the current user."""
    total = await db.support_tickets.count_documents({"user_id": token_data.user_id})
    tickets = await db.support_tickets.find(
        {"user_id": token_data.user_id}, {"_id": 0}
    ).sort("created_at", -1).skip((page - 1) * limit).limit(limit).to_list(limit)
    return {"tickets": tickets, "total": total}
