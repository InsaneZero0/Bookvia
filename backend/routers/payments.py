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
    BOOKVIA_FEE_MXN, STRIPE_FEE_PERCENT_ESTIMATED,
    SUBSCRIPTION_PRICE_MXN, SUBSCRIPTION_TRIAL_DAYS,
    VISIBLE_BUSINESS_FILTER, DEFAULT_MANAGER_PERMISSIONS
)
from models.schemas import *

logger = logging.getLogger(__name__)

import stripe as stripe_lib
from core.stripe_config import STRIPE_API_KEY
stripe_lib.api_key = STRIPE_API_KEY
if "sk_test_emergent" in (STRIPE_API_KEY or ""):
    stripe_lib.api_base = "https://integrations.emergentagent.com/stripe"

router = APIRouter(prefix="/payments", tags=["Payments"])

def success_url_for_wallet(request, booking_id: str) -> str:
    """Build the success URL used when a booking is paid entirely with wallet funds (no Stripe)."""
    origin = request.headers.get('origin', str(request.base_url).rstrip('/'))
    return f"{origin}/payment/success?wallet=1&booking_id={booking_id}"

def calculate_fees(deposit_amount: float) -> dict:
    """
    Calculate the payment breakdown for a booking with deposit.
    
    Model:
      - client_paid       = deposit + Bookvia fixed fee ($8.20 MXN)
      - bookvia_fee       = $8.20 MXN fixed (IVA included)
      - stripe_fee_est    = 8.5% of deposit (charged to business, covers Stripe)
      - business_amount   = deposit - stripe_fee_est (what business receives after payout)
    
    Returns dict with all amounts rounded to 2 decimals.
    """
    deposit_amount = round(float(deposit_amount or 0), 2)
    bookvia_fee = round(BOOKVIA_FEE_MXN, 2)
    stripe_fee_est = round(deposit_amount * STRIPE_FEE_PERCENT_ESTIMATED, 2)
    business_amount = round(deposit_amount - stripe_fee_est, 2)
    client_paid = round(deposit_amount + bookvia_fee, 2)
    # Legacy keys kept for back-compat in callers (fee_amount / payout_amount)
    return {
        "deposit_amount": deposit_amount,
        "bookvia_fee": bookvia_fee,
        "stripe_fee_estimated": stripe_fee_est,
        "business_amount": business_amount,
        "client_paid": client_paid,
        "fee_amount": stripe_fee_est,
        "payout_amount": business_amount,
    }


async def expire_holds_task() -> int:
    """Expire bookings that have been in 'hold' status for too long."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=HOLD_EXPIRATION_MINUTES)
    cutoff_str = cutoff.isoformat()
    result = await db.bookings.update_many(
        {"status": "hold", "created_at": {"$lt": cutoff_str}},
        {"$set": {"status": "cancelled", "cancelled_by": "system", "cancelled_reason": "Hold expired"}}
    )
    if result.modified_count > 0:
        logger.info(f"Expired {result.modified_count} hold bookings")
    return result.modified_count


@router.get("/fees/breakdown")
async def get_fees_breakdown(deposit_amount: float):
    """Return fee breakdown for a given deposit amount. Public helper for UI previews."""
    if deposit_amount <= 0:
        return {
            "deposit_amount": 0.0,
            "bookvia_fee": 0.0,
            "stripe_fee_estimated": 0.0,
            "business_amount": 0.0,
            "client_paid": 0.0,
            "min_deposit_amount": MIN_DEPOSIT_AMOUNT,
            "bookvia_fee_mxn": BOOKVIA_FEE_MXN,
            "stripe_fee_percent_estimated": STRIPE_FEE_PERCENT_ESTIMATED,
        }
    fees = calculate_fees(deposit_amount)
    return {
        **fees,
        "min_deposit_amount": MIN_DEPOSIT_AMOUNT,
        "bookvia_fee_mxn": BOOKVIA_FEE_MXN,
        "stripe_fee_percent_estimated": STRIPE_FEE_PERCENT_ESTIMATED,
    }

@router.post("/deposit/checkout")
async def create_deposit_checkout(
    request: Request, 
    checkout_req: DepositCheckoutRequest, 
    token_data: TokenData = Depends(require_auth)
):
    """Create Stripe Checkout session for booking deposit"""
    # Get booking
    booking = await db.bookings.find_one({"id": checkout_req.booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    # Verify ownership
    if booking["user_id"] != token_data.user_id:
        raise HTTPException(status_code=403, detail="Not your booking")
    
    # Check status
    if booking["status"] != AppointmentStatus.HOLD:
        raise HTTPException(status_code=400, detail=f"Booking status is {booking['status']}, cannot pay")
    
    # Check expiration
    hold_expires = datetime.fromisoformat(booking["hold_expires_at"].replace('Z', '+00:00'))
    if hold_expires < datetime.now(timezone.utc):
        # Mark as expired
        await db.bookings.update_one(
            {"id": checkout_req.booking_id},
            {"$set": {"status": AppointmentStatus.EXPIRED}}
        )
        await db.users.update_one(
            {"id": booking["user_id"]},
            {"$inc": {"active_appointments_count": -1}}
        )
        raise HTTPException(status_code=400, detail="Hold expired. Please create a new booking.")
    
    # Check for existing transaction (idempotency)
    existing_tx = await db.transactions.find_one({
        "booking_id": checkout_req.booking_id,
        "status": {"$in": [TransactionStatus.CREATED, TransactionStatus.PAID]}
    })
    if existing_tx and existing_tx.get("stripe_session_id"):
        try:
            existing_session = stripe_lib.checkout.Session.retrieve(existing_tx["stripe_session_id"])
            if existing_session.status != "expired":
                return {"url": existing_session.url, 
                        "session_id": existing_tx["stripe_session_id"],
                        "existing": True}
        except Exception:
            pass
    
    # Get business
    business = await db.businesses.find_one({"id": booking["business_id"]})
    service = await db.services.find_one({"id": booking["service_id"]})
    
    deposit_amount = max(booking.get("deposit_amount", MIN_DEPOSIT_AMOUNT), MIN_DEPOSIT_AMOUNT)
    fees = calculate_fees(deposit_amount)
    client_paid = fees["client_paid"]  # deposit + $8.20 Bookvia fee
    
    # Optionally apply user wallet balance toward the total client_paid
    wallet_applied = 0.0
    stripe_charge_amount = client_paid
    if checkout_req.use_wallet:
        from services.wallet import get_wallet_balance
        winfo = await get_wallet_balance(token_data.user_id)
        wallet_balance = float(winfo.get("balance") or 0)
        wallet_applied = round(min(wallet_balance, client_paid), 2)
        stripe_charge_amount = round(client_paid - wallet_applied, 2)
    
    # If wallet covers the entire amount, no Stripe checkout needed - confirm directly
    if checkout_req.use_wallet and stripe_charge_amount <= 0.50:  # tiny rounding leftover
        from services.wallet import debit_wallet, DEBIT_BOOKING
        try:
            # Debit the full client_paid from wallet
            await debit_wallet(
                user_id=token_data.user_id,
                amount=client_paid,
                tx_type=DEBIT_BOOKING,
                booking_id=checkout_req.booking_id,
                description=f"Reserva con saldo Bookvia - {service['name'] if service else 'cita'}",
            )
            wallet_applied = client_paid
            stripe_charge_amount = 0.0
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Saldo insuficiente: {e}")
        
        # Create transaction record (paid by wallet, no Stripe)
        now_iso = datetime.now(timezone.utc).isoformat()
        transaction_id = generate_id()
        transaction_doc = {
            "id": transaction_id,
            "booking_id": checkout_req.booking_id,
            "user_id": token_data.user_id,
            "business_id": booking["business_id"],
            "stripe_session_id": None,
            "stripe_payment_intent_id": None,
            "amount_total": deposit_amount,
            "client_paid": client_paid,
            "bookvia_fee": fees["bookvia_fee"],
            "stripe_fee_estimated": fees["stripe_fee_estimated"],
            "stripe_fee_actual": 0.0,  # No Stripe fee since paid from wallet
            "business_amount": fees["business_amount"],
            "fee_amount": fees["fee_amount"],
            "payout_amount": fees["payout_amount"],
            "wallet_applied": wallet_applied,
            "stripe_charge_amount": 0.0,
            "currency": "MXN",
            "status": TransactionStatus.PAID,
            "paid_at": now_iso,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        await db.transactions.insert_one(transaction_doc)
        
        # Confirm booking
        await db.bookings.update_one(
            {"id": checkout_req.booking_id},
            {"$set": {
                "status": AppointmentStatus.CONFIRMED,
                "deposit_paid": True,
                "transaction_id": transaction_id,
                "confirmed_at": now_iso,
            }}
        )
        # Create ledger entries for paid transaction
        try:
            await create_transaction_ledger_entries(transaction_doc, TransactionStatus.PAID)
        except Exception as e:
            logger.error(f"Wallet-paid ledger error: {e}")
        
        return {
            "wallet_only": True,
            "transaction_id": transaction_id,
            "amount": deposit_amount,
            "client_paid": client_paid,
            "wallet_applied": wallet_applied,
            "stripe_charge_amount": 0.0,
            "bookvia_fee": fees["bookvia_fee"],
            "business_amount": fees["business_amount"],
            "redirect_url": success_url_for_wallet(request, checkout_req.booking_id),
        }
    
    # Create transaction record
    transaction_id = generate_id()
    transaction_doc = {
        "id": transaction_id,
        "booking_id": checkout_req.booking_id,
        "user_id": token_data.user_id,
        "business_id": booking["business_id"],
        "stripe_session_id": None,
        "stripe_payment_intent_id": None,
        "amount_total": deposit_amount,           # Deposit only (historical field)
        "client_paid": client_paid,                # What client actually paid to Stripe + wallet
        "bookvia_fee": fees["bookvia_fee"],        # $8.20 Bookvia retains
        "stripe_fee_estimated": fees["stripe_fee_estimated"],  # 8.5% estimated charged to business
        "stripe_fee_actual": None,                 # Populated by webhook from balance_transaction.fee
        "business_amount": fees["business_amount"],# What the business will eventually receive
        "fee_amount": fees["fee_amount"],          # Back-compat alias for stripe_fee_estimated
        "payout_amount": fees["payout_amount"],    # Back-compat alias for business_amount
        "wallet_applied": wallet_applied,           # Amount applied from wallet (0 if not used)
        "stripe_charge_amount": stripe_charge_amount,  # Amount charged to card after wallet
        "currency": "MXN",
        "status": TransactionStatus.CREATED,
        "refund_amount": None,
        "refund_reason": None,
        "cancelled_by": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": None,
        "paid_at": None
    }
    
    await db.transactions.insert_one(transaction_doc)
    
    origin = request.headers.get('origin', str(request.base_url).rstrip('/'))
    success_url = f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}&booking_id={checkout_req.booking_id}"
    cancel_url = f"{origin}/payment/cancel?booking_id={checkout_req.booking_id}"
    
    # Build Stripe line items. If wallet covers part, show a single combined "Reserva" item
    # for the remainder (so Stripe charges the right amount). Otherwise show the standard breakdown.
    if wallet_applied > 0:
        line_items = [{
            "price_data": {
                "currency": "mxn",
                "unit_amount": int(stripe_charge_amount * 100),
                "product_data": {
                    "name": f"Reserva - {service['name'] if service else 'Cita'}",
                    "description": f"Anticipo + Servicio Bookvia (saldo aplicado: ${wallet_applied:.2f})"
                }
            },
            "quantity": 1
        }]
    else:
        line_items = [
            {
                "price_data": {
                    "currency": "mxn",
                    "unit_amount": int(deposit_amount * 100),
                    "product_data": {
                        "name": f"Anticipo - {service['name'] if service else 'Reserva'}" if service else "Anticipo de reserva",
                        "description": f"Anticipo para {business['name']}" if business else "Anticipo de reserva"
                    }
                },
                "quantity": 1
            },
            {
                "price_data": {
                    "currency": "mxn",
                    "unit_amount": int(fees["bookvia_fee"] * 100),
                    "product_data": {
                        "name": "Servicio Bookvia",
                        "description": "Gestion de reserva y recordatorios (IVA incluido)"
                    }
                },
                "quantity": 1
            }
        ]
    
    try:
        session = stripe_lib.checkout.Session.create(
            payment_method_types=["card"],
            mode="payment",
            line_items=line_items,
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "transaction_id": transaction_id,
                "booking_id": checkout_req.booking_id,
                "user_id": token_data.user_id,
                "business_id": booking["business_id"],
                "type": "deposit"
            }
        )
    except Exception as e:
        logger.error(f"Stripe checkout error: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating payment session: {str(e)}")
    
    # Update transaction with session ID
    await db.transactions.update_one(
        {"id": transaction_id},
        {"$set": {"stripe_session_id": session.id}}
    )
    
    # Update booking with transaction reference
    await db.bookings.update_one(
        {"id": checkout_req.booking_id},
        {"$set": {"transaction_id": transaction_id, "stripe_session_id": session.id}}
    )
    
    logger.info(f"Created checkout session {session.id} for booking {checkout_req.booking_id}")
    
    return {
        "url": session.url, 
        "session_id": session.id,
        "transaction_id": transaction_id,
        "amount": deposit_amount,
        "client_paid": client_paid,
        "bookvia_fee": fees["bookvia_fee"],
        "business_amount": fees["business_amount"],
        "fee": fees["fee_amount"],
        "wallet_applied": wallet_applied,
        "stripe_charge_amount": stripe_charge_amount,
    }



@router.get("/checkout/status/{session_id}")
async def get_checkout_status(session_id: str, request: Request):
    """Check checkout session status - also acts as webhook fallback to confirm payment"""
    try:
        session = stripe_lib.checkout.Session.retrieve(session_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not retrieve session: {str(e)}")
    
    # Get transaction
    transaction = await db.transactions.find_one({"stripe_session_id": session_id})
    
    # Fallback: if Stripe says paid but our DB hasn't been updated (webhook didn't fire)
    if transaction and session.payment_status == "paid" and transaction["status"] != TransactionStatus.PAID:
        now = datetime.now(timezone.utc).isoformat()
        logger.info(f"Checkout status fallback: confirming payment for transaction {transaction['id']} (webhook may not have fired)")
        
        # Attempt to capture actual Stripe fee from the payment intent's charge balance transaction
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
        
        # If transaction had a wallet portion applied, debit it now
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
                logger.error(f"Wallet debit on fallback failed for tx {transaction['id']}: {e}")
        
        # Create ledger entries
        try:
            await create_transaction_ledger_entries(transaction, TransactionStatus.PAID)
        except Exception as e:
            logger.error(f"Fallback ledger error: {e}")
        
        # Update booking to CONFIRMED
        await db.bookings.update_one(
            {"id": transaction["booking_id"]},
            {"$set": {
                "status": AppointmentStatus.CONFIRMED,
                "deposit_paid": True,
                "confirmed_at": now
            }}
        )
        
        # Update business pending balance
        await db.businesses.update_one(
            {"id": transaction["business_id"]},
            {"$inc": {"pending_balance": transaction["payout_amount"]}}
        )
        
        # Send notifications (best-effort)
        try:
            booking = await db.bookings.find_one({"id": transaction["booking_id"]})
            business = await db.businesses.find_one({"id": transaction["business_id"]})
            user = await db.users.find_one({"id": transaction["user_id"]})
            service = await db.services.find_one({"id": booking["service_id"]}) if booking else None
            
            if user:
                await create_notification(
                    user["id"],
                    "Pago Confirmado",
                    f"Tu anticipo de ${transaction['amount_total']} MXN ha sido confirmado para {service['name'] if service else 'tu cita'}",
                    "system",
                    {"booking_id": transaction["booking_id"], "transaction_id": transaction["id"]}
                )
            if business:
                await create_notification(
                    business["user_id"],
                    "Reserva Confirmada",
                    f"Nueva reserva confirmada - Anticipo recibido",
                    "booking",
                    {"booking_id": transaction["booking_id"]}
                )
            # Send confirmation email to client (fallback, respects notify_email pref)
            if user and booking and service:
                if user.get("notify_email", True):
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
                    except Exception as e:
                        logger.error(f"Fallback confirmation email error: {e}")
                
                # Fallback SMS confirmation (respects notify_sms pref)
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
        except Exception as e:
            logger.error(f"Fallback notification error: {e}")
        
        logger.info(f"Fallback: Payment confirmed for booking {transaction['booking_id']}")
        
        # Refresh transaction data after update
        transaction = await db.transactions.find_one({"stripe_session_id": session_id})
    
    return {
        "status": session.status,
        "payment_status": session.payment_status,
        "amount_total": session.amount_total,
        "currency": session.currency,
        "transaction_id": transaction["id"] if transaction else None,
        "booking_id": transaction["booking_id"] if transaction else None
    }



@router.get("/transaction/{transaction_id}", response_model=TransactionResponse)
async def get_transaction(transaction_id: str, token_data: TokenData = Depends(require_auth)):
    """Get transaction details"""
    transaction = await db.transactions.find_one({"id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Verify ownership
    if transaction["user_id"] != token_data.user_id and token_data.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return TransactionResponse(**transaction)



@router.post("/expire-holds")
async def trigger_expire_holds(token_data: TokenData = Depends(require_admin)):
    """Admin endpoint to manually trigger hold expiration"""
    count = await expire_holds_task()
    return {"expired_count": count}



@router.get("/my-transactions", response_model=List[TransactionResponse])
async def get_my_transactions(
    status: Optional[str] = None,
    token_data: TokenData = Depends(require_auth)
):
    """Get user's payment transactions"""
    filters = {"user_id": token_data.user_id}
    if status:
        filters["status"] = status
    
    transactions = await db.transactions.find(filters, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [TransactionResponse(**t) for t in transactions]



@router.get("/business-transactions", response_model=List[TransactionResponse])
async def get_business_transactions(
    status: Optional[str] = None,
    token_data: TokenData = Depends(require_business)
):
    """Get business payment transactions"""
    user = await db.users.find_one({"id": token_data.user_id})
    if not user or not user.get("business_id"):
        raise HTTPException(status_code=404, detail="Business not found")
    
    filters = {"business_id": user["business_id"]}
    if status:
        filters["status"] = status
    
    transactions = await db.transactions.find(filters, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [TransactionResponse(**t) for t in transactions]



@router.post("/checkout/session")
async def create_checkout_session(request: Request, payment: PaymentCreate, token_data: TokenData = Depends(require_auth)):
    origin = request.headers.get('origin', str(request.base_url).rstrip('/'))
    success_url = f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/payment/cancel"
    
    try:
        session = stripe_lib.checkout.Session.create(
            payment_method_types=["card"],
            mode="payment",
            line_items=[{
                "price_data": {
                    "currency": payment.currency.lower(),
                    "unit_amount": int(float(payment.amount) * 100),
                    "product_data": {
                        "name": "Pago Bookvia"
                    }
                },
                "quantity": 1
            }],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "user_id": token_data.user_id,
                "booking_id": payment.booking_id or "",
                "subscription_type": payment.subscription_type or ""
            }
        )
        return {"url": session.url, "session_id": session.id}
    except Exception as e:
        logger.error(f"Stripe checkout error: {e}")
        raise HTTPException(status_code=500, detail=str(e))



