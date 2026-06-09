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


@router.get("/platform-stats")
async def get_platform_stats():
    """Public platform stats for homepage."""
    businesses = await db.businesses.count_documents({"status": "approved"})
    bookings = await db.bookings.count_documents({})
    reviews = await db.reviews.count_documents({})
    if reviews > 0:
        avg_pipe = [{"$group": {"_id": None, "avg": {"$avg": "$rating"}}}]
        avg_res = await db.reviews.aggregate(avg_pipe).to_list(1)
        avg_rating = round(avg_res[0]["avg"], 1) if avg_res else 0
    else:
        avg_rating = 0
    return {"businesses": businesses, "bookings": bookings, "reviews": reviews, "avg_rating": avg_rating}



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


@router.get("/status", tags=["System"])
async def public_status():
    """Public status page: shallow uptime check of DB + Stripe API + backend.

    Returns per-component status (operational | degraded | down) plus latency
    in ms. Safe to expose publicly — no secrets, no PII.
    """
    import time
    components = []

    # API itself (we are responding, so it's operational by definition)
    components.append({
        "name": "API",
        "status": "operational",
        "latency_ms": 0,
        "message": "Backend responding",
    })

    # Database
    db_start = time.perf_counter()
    try:
        await db.command("ping")
        db_latency = int((time.perf_counter() - db_start) * 1000)
        components.append({
            "name": "Database",
            "status": "operational",
            "latency_ms": db_latency,
            "message": "MongoDB connection healthy",
        })
    except Exception as e:
        components.append({
            "name": "Database",
            "status": "down",
            "latency_ms": int((time.perf_counter() - db_start) * 1000),
            "message": f"MongoDB unreachable: {type(e).__name__}",
        })

    # Stripe API (lightweight ping via Account.retrieve, only if key configured)
    stripe_key = os.environ.get("STRIPE_API_KEY", "")
    if stripe_key:
        s_start = time.perf_counter()
        try:
            # Stripe SDK is sync — wrap in thread to avoid blocking event loop
            import asyncio
            await asyncio.to_thread(stripe_lib.Account.retrieve)
            s_latency = int((time.perf_counter() - s_start) * 1000)
            components.append({
                "name": "Stripe",
                "status": "operational",
                "latency_ms": s_latency,
                "message": "Live" if stripe_key.startswith("sk_live_") else "Test mode",
            })
        except Exception as e:
            components.append({
                "name": "Stripe",
                "status": "degraded",
                "latency_ms": int((time.perf_counter() - s_start) * 1000),
                "message": f"Stripe API unreachable: {type(e).__name__}",
            })
    else:
        components.append({
            "name": "Stripe",
            "status": "down",
            "latency_ms": 0,
            "message": "Stripe API key not configured",
        })

    # Aggregate overall status: down > degraded > operational
    priority = {"operational": 0, "degraded": 1, "down": 2}
    overall = max(components, key=lambda c: priority.get(c["status"], 0))["status"]

    return {
        "overall": overall,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "components": components,
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
                __import__('json').loads(body),
                stripe_lib.api_key
            )

        # Fase 11: strong idempotency across Stripe retries (up to 3 days).
        from services.stripe_refunds import record_stripe_event
        first_time = await record_stripe_event(event.id, event.type)
        if not first_time:
            logger.info(f"Stripe event {event.id} ({event.type}) already processed, skipping")
            return {"status": "skipped", "event_id": event.id}
        
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
                
                # Attempt to capture actual Stripe fee from payment intent balance transaction
                stripe_fee_actual = None
                payment_intent_id = session.payment_intent if hasattr(session, 'payment_intent') else None
                try:
                    if payment_intent_id:
                        pi = stripe_lib.PaymentIntent.retrieve(payment_intent_id, expand=["latest_charge.balance_transaction"])
                        charge = getattr(pi, "latest_charge", None)
                        bt = getattr(charge, "balance_transaction", None) if charge else None
                        if bt and getattr(bt, "fee", None) is not None:
                            stripe_fee_actual = round(bt.fee / 100.0, 2)
                except Exception as e:
                    logger.warning(f"Could not fetch actual Stripe fee for tx {transaction['id']}: {e}")
                
                # Update transaction
                update_set = {
                    "status": TransactionStatus.PAID,
                    "stripe_payment_intent_id": payment_intent_id,
                    "paid_at": now,
                    "updated_at": now
                }
                if stripe_fee_actual is not None:
                    update_set["stripe_fee_actual"] = stripe_fee_actual
                await db.transactions.update_one(
                    {"id": transaction["id"]},
                    {"$set": update_set}
                )
                
                # If transaction had a wallet portion applied, debit it now (was reserved at checkout creation)
                wallet_applied = float(transaction.get("wallet_applied") or 0)
                if wallet_applied > 0:
                    try:
                        from services.wallet import debit_wallet, DEBIT_BOOKING
                        await debit_wallet(
                            user_id=transaction["user_id"],
                            amount=wallet_applied,
                            tx_type=DEBIT_BOOKING,
                            booking_id=transaction["booking_id"],
                            description=f"Saldo aplicado a reserva (resto pagado con tarjeta)",
                        )
                    except Exception as e:
                        logger.error(f"Wallet debit on confirm failed for tx {transaction['id']}: {e}")
                
                # Create ledger entries for payment
                await create_transaction_ledger_entries(transaction, TransactionStatus.PAID)
                
                # Initialize funds state machine: PENDING_HOLD
                try:
                    from services.funds_state import initialize as init_funds
                    await init_funds(transaction["id"], actor="webhook_stripe")
                except Exception as e:
                    logger.error(f"Funds state initialize failed for tx {transaction['id']}: {e}")
                
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
                
                # Send confirmation email to client (respects notify_email pref)
                if user and booking and service and user.get("notify_email", True):
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
                            worker_name=worker_name,
                            business_public_code=business.get("public_code") if business else None
                        )
                        logger.info(f"Confirmation email sent to {user['email']} for booking {booking['id']}")
                    except Exception as e:
                        logger.error(f"Error sending confirmation email: {e}")
                
                # Send SMS confirmation to client + business (respects notify_sms pref)
                if user and booking and service:
                    from services.sms import send_booking_confirmation_sms, send_business_new_booking_sms
                    if user.get("notify_sms", True):
                        await send_booking_confirmation_sms(
                            phone=user.get("phone"),
                            user_name=user.get("full_name", "Cliente"),
                            business_name=business["name"] if business else "Negocio",
                            date=booking["date"],
                            time=booking["time"]
                        )
                    if business and business.get("notify_sms", True):
                        await send_business_new_booking_sms(
                            phone=business.get("phone"),
                            business_name=business["name"],
                            client_name=user.get("full_name", "Cliente"),
                            service_name=service["name"],
                            date=booking["date"],
                            time=booking["time"]
                        )
                
                # Update business balance (pending payout)
                await db.businesses.update_one(
                    {"id": transaction["business_id"]},
                    {"$inc": {"pending_balance": transaction["payout_amount"]}}
                )
                
                logger.info(f"Payment confirmed for booking {transaction['booking_id']}")

        elif event.type == "charge.refunded":
            # Fires when a refund is issued (from our code OR from Stripe Dashboard).
            # We sync `refund_status` + move the ledger to REFUNDED so the
            # business isn't paid for money the client is getting back.
            charge = event.data.object
            pi_id = getattr(charge, "payment_intent", None)
            if pi_id:
                tx = await db.transactions.find_one({"stripe_payment_intent_id": pi_id})
                if tx:
                    amount_refunded_mxn = round(float(getattr(charge, "amount_refunded", 0)) / 100.0, 2)
                    fully_refunded = bool(getattr(charge, "refunded", False)) or amount_refunded_mxn >= float(tx.get("stripe_charge_amount") or 0)
                    new_status = "refund_full" if fully_refunded else "refund_partial"
                    await db.transactions.update_one(
                        {"id": tx["id"]},
                        {"$set": {
                            "status": new_status,
                            "refund_amount": amount_refunded_mxn,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                        }},
                    )
                    try:
                        from services.funds_state import mark_refunded
                        await mark_refunded(tx["id"], actor="stripe_webhook", reason="charge.refunded")
                    except Exception as e:
                        logger.warning(f"mark_refunded failed for tx {tx['id']}: {e}")
                    logger.info(f"charge.refunded synced tx={tx['id']} amount=${amount_refunded_mxn}")

        elif event.type in ("charge.dispute.created", "charge.dispute.funds_withdrawn"):
            # Chargeback opened by the cardholder. Freeze the business's
            # payout and flag the transaction so the ledger excludes it
            # from the next settlement.
            dispute = event.data.object
            charge_id = getattr(dispute, "charge", None)
            pi_id = getattr(dispute, "payment_intent", None)
            tx = None
            if pi_id:
                tx = await db.transactions.find_one({"stripe_payment_intent_id": pi_id})
            if not tx and charge_id:
                tx = await db.transactions.find_one({"stripe_charge_id": charge_id})
            if tx:
                await db.transactions.update_one(
                    {"id": tx["id"]},
                    {"$set": {
                        "funds_state": "disputed",
                        "dispute_status": getattr(dispute, "status", "needs_response"),
                        "dispute_id": getattr(dispute, "id", None),
                        "dispute_amount_mxn": round(float(getattr(dispute, "amount", 0)) / 100.0, 2),
                        "dispute_opened_at": datetime.now(timezone.utc).isoformat(),
                    }},
                )
                # Freeze all business payouts until admin resolves
                await db.businesses.update_one(
                    {"id": tx["business_id"]},
                    {"$set": {
                        "payout_hold": True,
                        "payout_hold_reason": f"Dispute {getattr(dispute, 'id', '')} opened",
                    }},
                )
                # Notify admins
                try:
                    from core.helpers import create_notification
                    admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(20)
                    for admin in admins:
                        await create_notification(
                            admin["id"],
                            "Disputa (chargeback) recibida",
                            f"Negocio {tx.get('business_id')} - monto ${getattr(dispute, 'amount', 0)/100:.2f} MXN. Payout suspendido.",
                            "chargeback_opened",
                            {"transaction_id": tx["id"], "dispute_id": getattr(dispute, "id", None)},
                        )
                except Exception as e:
                    logger.warning(f"Could not notify admins on dispute: {e}")
                logger.warning(f"DISPUTE opened for tx={tx['id']} biz={tx.get('business_id')}")

        elif event.type == "charge.dispute.closed":
            dispute = event.data.object
            pi_id = getattr(dispute, "payment_intent", None)
            charge_id = getattr(dispute, "charge", None)
            tx = None
            if pi_id:
                tx = await db.transactions.find_one({"stripe_payment_intent_id": pi_id})
            if not tx and charge_id:
                tx = await db.transactions.find_one({"stripe_charge_id": charge_id})
            if tx:
                status = getattr(dispute, "status", "")
                await db.transactions.update_one(
                    {"id": tx["id"]},
                    {"$set": {
                        "dispute_status": status,
                        "dispute_closed_at": datetime.now(timezone.utc).isoformat(),
                        "funds_state": "refunded" if status == "lost" else "available",
                    }},
                )
                # Admin must manually re-enable payouts after reviewing.
                logger.info(f"Dispute closed tx={tx['id']} status={status}")

        elif event.type == "payment_intent.payment_failed":
            pi = event.data.object
            tx = await db.transactions.find_one({"stripe_payment_intent_id": pi.id})
            if tx:
                await db.transactions.update_one(
                    {"id": tx["id"]},
                    {"$set": {
                        "status": "failed",
                        "failure_reason": (getattr(pi, "last_payment_error", None) or {}).get("message", "payment failed")
                            if getattr(pi, "last_payment_error", None) else "payment failed",
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }},
                )
                try:
                    from core.helpers import create_notification
                    await create_notification(
                        tx["user_id"],
                        "Pago rechazado",
                        "Tu pago no pudo procesarse. Intenta otra tarjeta o contacta a tu banco.",
                        "payment_failed",
                        {"booking_id": tx.get("booking_id")},
                    )
                except Exception as e:
                    logger.warning(f"Could not notify payment_failed: {e}")

        elif event.type == "checkout.session.expired":
            session = event.data.object
            tx = await db.transactions.find_one({"stripe_session_id": session.id})
            if tx and tx.get("status") == "created":
                # Release the booking slot and mark tx as expired.
                await db.transactions.update_one(
                    {"id": tx["id"]},
                    {"$set": {
                        "status": "expired",
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }},
                )
                if tx.get("booking_id"):
                    await db.bookings.update_one(
                        {"id": tx["booking_id"], "status": "hold"},
                        {"$set": {"status": "expired"}},
                    )
                    # Refund wallet if it was applied to this checkout
                    wallet_applied = float(tx.get("wallet_applied") or 0)
                    if wallet_applied > 0:
                        try:
                            from services.wallet import credit_wallet, CREDIT_ADMIN_ADJUSTMENT
                            await credit_wallet(
                                user_id=tx["user_id"], amount=wallet_applied,
                                tx_type=CREDIT_ADMIN_ADJUSTMENT, booking_id=tx.get("booking_id"),
                                description="Reversa de saldo: sesion de pago expirada",
                            )
                        except Exception as e:
                            logger.warning(f"Could not revert wallet on checkout.session.expired: {e}")

        elif event.type == "invoice.payment_succeeded":
            # Phase D — Subscription paid successfully (re-activate if was past_due/unpaid)
            inv = event.data.object
            subscription_id = inv.get("subscription") if isinstance(inv, dict) else getattr(inv, "subscription", None)
            if subscription_id:
                biz = await db.businesses.find_one({"stripe_subscription_id": subscription_id})
                if biz:
                    update = {
                        "subscription_status": "active",
                        "subscription_failed_attempts": 0,
                        "subscription_failed_at": None,
                        "subscription_last_paid_at": datetime.now(timezone.utc).isoformat(),
                    }
                    # Re-enable banned-by-payment business
                    if biz.get("banned_reason") == "subscription_unpaid":
                        update["banned"] = False
                        update["banned_reason"] = None
                    await db.businesses.update_one({"id": biz["id"]}, {"$set": update})
                    logger.info(f"Subscription paid - reactivated business {biz['id']}")

        elif event.type == "invoice.payment_failed":
            # Phase D — Track failed payment attempts. Cron escalates suspension.
            inv = event.data.object
            subscription_id = inv.get("subscription") if isinstance(inv, dict) else getattr(inv, "subscription", None)
            if subscription_id:
                biz = await db.businesses.find_one({"stripe_subscription_id": subscription_id})
                if biz:
                    attempts = int(biz.get("subscription_failed_attempts") or 0) + 1
                    now_iso = datetime.now(timezone.utc).isoformat()
                    update = {
                        "subscription_status": "past_due",
                        "subscription_failed_attempts": attempts,
                    }
                    if not biz.get("subscription_failed_at"):
                        update["subscription_failed_at"] = now_iso
                    await db.businesses.update_one({"id": biz["id"]}, {"$set": update})
                    logger.info(f"Subscription payment failed for biz {biz['id']} - attempt #{attempts}")
                    # Send email notification (best effort)
                    try:
                        from services.email import send_email
                        await send_email(
                            to=biz.get("email"),
                            subject="Tu pago de Bookvia fallo - actualiza tu metodo de pago",
                            body=(
                                f"Hola {biz.get('name', 'negocio')},\n\n"
                                f"Tu pago mensual de la suscripcion de $49 MXN no pudo procesarse "
                                f"({attempts} intento{'s' if attempts > 1 else ''}). "
                                f"Tienes 7 dias para actualizar tu tarjeta antes de que tu negocio sea suspendido.\n\n"
                                f"Actualiza tu tarjeta: https://bookvia.app/business/finance\n\n"
                                f"Bookvia"
                            ),
                            template="subscription_payment_failed",
                            data={"business_id": biz["id"], "attempts": attempts},
                        )
                    except Exception as e:
                        logger.warning(f"Could not send subscription failure email: {e}")

        elif event.type == "customer.subscription.deleted":
            # Phase D — Subscription canceled (after grace period or by user)
            sub = event.data.object
            subscription_id = sub.id if hasattr(sub, "id") else sub.get("id")
            if subscription_id:
                biz = await db.businesses.find_one({"stripe_subscription_id": subscription_id})
                if biz:
                    await db.businesses.update_one(
                        {"id": biz["id"]},
                        {"$set": {
                            "subscription_status": "canceled",
                            "subscription_canceled_at": datetime.now(timezone.utc).isoformat(),
                            "banned": True,
                            "banned_reason": "subscription_canceled",
                        }},
                    )
                    logger.info(f"Subscription canceled for biz {biz['id']}")

        elif event.type == "account.updated":
            # Stripe Connect Express: sync account capabilities to DB
            acct = event.data.object
            account_id = acct.id if hasattr(acct, "id") else acct.get("id")
            if account_id:
                biz = await db.businesses.find_one({"stripe_connect_account_id": account_id})
                if biz:
                    charges_enabled = bool(getattr(acct, "charges_enabled", False) if hasattr(acct, "charges_enabled") else acct.get("charges_enabled", False))
                    payouts_enabled = bool(getattr(acct, "payouts_enabled", False) if hasattr(acct, "payouts_enabled") else acct.get("payouts_enabled", False))
                    details_submitted = bool(getattr(acct, "details_submitted", False) if hasattr(acct, "details_submitted") else acct.get("details_submitted", False))
                    requirements = getattr(acct, "requirements", None) if hasattr(acct, "requirements") else acct.get("requirements")
                    currently_due = []
                    disabled_reason = None
                    if requirements:
                        currently_due = list((getattr(requirements, "currently_due", None) if hasattr(requirements, "currently_due") else requirements.get("currently_due")) or [])
                        disabled_reason = getattr(requirements, "disabled_reason", None) if hasattr(requirements, "disabled_reason") else requirements.get("disabled_reason")
                    update_doc = {
                        "stripe_connect_charges_enabled": charges_enabled,
                        "stripe_connect_payouts_enabled": payouts_enabled,
                        "stripe_connect_details_submitted": details_submitted,
                        "stripe_connect_disabled_reason": disabled_reason,
                        "stripe_connect_requirements_due": currently_due,
                        "stripe_connect_synced_at": datetime.now(timezone.utc).isoformat(),
                    }
                    if details_submitted and charges_enabled and payouts_enabled and not biz.get("stripe_connect_onboarded_at"):
                        update_doc["stripe_connect_onboarded_at"] = datetime.now(timezone.utc).isoformat()
                    await db.businesses.update_one({"id": biz["id"]}, {"$set": update_doc})
                    logger.info(f"account.updated synced biz={biz['id']} acct={account_id} charges={charges_enabled} payouts={payouts_enabled}")

        return {"status": "success"}
        
    except Exception as e:
        logger.exception(f"Webhook error: {e}")
        # Return 500 so Stripe retries the event. Duplicate retries are
        # de-duplicated by the `stripe_events` collection (Fase 11).
        raise HTTPException(status_code=500, detail="Webhook processing error")



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
        {"id": generate_id(), "name_es": "Otro", "name_en": "Other", "slug": "otro", "icon": "HelpCircle", "image_url": ""},
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
    if ext not in ("jpg", "jpeg", "png", "webp", "jfif", "pdf"):
        raise HTTPException(status_code=400, detail="Only JPG, PNG, WebP or PDF allowed")

    content_type = file.content_type or "image/jpeg"
    if ext in ("jfif", "jpg", "jpeg", "pjpeg"):
        content_type = "image/jpeg"
    elif ext == "pdf":
        content_type = "application/pdf"
    
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
    user = await db.users.find_one(
        {"id": token_data.user_id},
        {"_id": 0, "full_name": 1, "email": 1, "role": 1, "business_id": 1, "public_code": 1}
    )
    now = datetime.now(timezone.utc).isoformat()
    biz_name = None
    biz_public_code = None
    if ticket.business_id:
        biz = await db.businesses.find_one({"id": ticket.business_id}, {"_id": 0, "name": 1, "public_code": 1})
        if biz:
            biz_name = biz.get("name")
            biz_public_code = biz.get("public_code")
    # Reporter code: BV- if reporter is a business owner, else CL- (their own user code)
    reporter_code = None
    reporter_role = user.get("role", "user") if user else "user"
    if reporter_role == "business" and user and user.get("business_id"):
        owner_biz = await db.businesses.find_one({"id": user["business_id"]}, {"_id": 0, "public_code": 1})
        reporter_code = owner_biz.get("public_code") if owner_biz else None
    elif user:
        reporter_code = user.get("public_code")
    
    doc = {
        "id": generate_id(),
        "user_id": token_data.user_id,
        "user_name": user.get("full_name", "") if user else "",
        "user_email": user.get("email", "") if user else "",
        "reporter_code": reporter_code,
        "reporter_role": reporter_role,
        "subject": ticket.subject,
        "message": ticket.message,
        "category": ticket.category,
        "status": "open",
        "business_id": ticket.business_id,
        "business_name": biz_name,
        "business_public_code": biz_public_code,
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
