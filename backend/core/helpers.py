"""
Shared helper functions used across multiple routers.
"""
import uuid
import re
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, Request
from core.database import db
from core.security import TokenData
from models.enums import LedgerDirection, LedgerAccount, LedgerEntryStatus, TransactionStatus

logger = logging.getLogger(__name__)


def generate_id() -> str:
    return str(uuid.uuid4())


def generate_slug(name: str) -> str:
    slug = name.lower()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    return slug.strip('-')


def amount_to_cents(amount: float) -> int:
    return int(round(amount * 100))


def cents_to_amount(cents: int) -> float:
    return round(cents / 100, 2)


def calculate_bayesian_rating(rating_sum: float, review_count: int, global_avg: float = 3.5, min_reviews: int = 5) -> float:
    if review_count == 0:
        return 0.0
    return (min_reviews * global_avg + rating_sum) / (min_reviews + review_count)


async def is_user_blacklisted(business_id: str, user_id: str = None, email: str = None, phone: str = None) -> bool:
    if not user_id and not email and not phone:
        return False
    lookup_emails = set()
    lookup_phones = set()
    lookup_user_ids = set()
    if user_id:
        lookup_user_ids.add(user_id)
        user_doc = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1, "phone": 1})
        if user_doc:
            if user_doc.get("email"):
                lookup_emails.add(user_doc["email"].lower())
            if user_doc.get("phone"):
                lookup_phones.add(user_doc["phone"])
    if email:
        lookup_emails.add(email.lower())
    if phone:
        lookup_phones.add(phone)
    or_conditions = []
    if lookup_user_ids:
        or_conditions.append({"user_id": {"$in": list(lookup_user_ids)}})
    if lookup_emails:
        or_conditions.append({"email": {"$in": [e.lower() for e in lookup_emails]}})
    if lookup_phones:
        or_conditions.append({"phone": {"$in": list(lookup_phones)}})
    if not or_conditions:
        return False
    entry = await db.blacklist.find_one({"business_id": business_id, "$or": or_conditions})
    return entry is not None


async def send_sms(phone: str, message: str):
    from services.sms import send_sms as sms_send, SMSServiceError, SMSRateLimitError, SMSNotConfiguredError
    try:
        success, msg_id = await sms_send(phone, message)
        return success
    except SMSRateLimitError as e:
        logger.warning(f"SMS rate limit exceeded for {phone}: {e}")
        raise HTTPException(status_code=429, detail=str(e))
    except SMSNotConfiguredError as e:
        logger.error(f"SMS not configured: {e}")
        raise HTTPException(status_code=503, detail=str(e))
    except SMSServiceError as e:
        logger.error(f"SMS error: {e}")
        return False


async def create_notification(user_id: str, title: str, message: str, notif_type: str, data: dict = None):
    notification = {
        "id": generate_id(),
        "user_id": user_id,
        "title": title,
        "message": message,
        "type": notif_type,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "data": data or {}
    }
    await db.notifications.insert_one(notification)
    return notification


async def create_audit_log(
    admin_id: str,
    admin_email: str,
    action: str,
    target_type: str,
    target_id: str,
    details: dict = None,
    request: Request = None
):
    audit_log = {
        "id": generate_id(),
        "admin_id": admin_id,
        "admin_email": admin_email,
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "details": details or {},
        "ip_address": request.client.host if request else None,
        "user_agent": request.headers.get("user-agent") if request else None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.audit_logs.insert_one(audit_log)
    logger.info(f"[AUDIT] {admin_email} - {action} - {target_type}:{target_id}")
    return audit_log


async def create_business_activity(
    business_id: str,
    token_data: TokenData,
    action: str,
    target_type: str,
    target_id: str,
    details: dict = None,
):
    if token_data.is_manager and token_data.worker_id:
        worker = await db.workers.find_one({"id": token_data.worker_id}, {"_id": 0, "name": 1})
        actor_type = "admin"
        actor_name = worker["name"] if worker else "Administrador"
    else:
        actor_type = "owner"
        actor_name = "Dueño"
    log_entry = {
        "id": generate_id(),
        "business_id": business_id,
        "actor_type": actor_type,
        "actor_name": actor_name,
        "worker_id": token_data.worker_id,
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "details": details or {},
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.business_activity_logs.insert_one(log_entry)
    logger.info(f"[BIZ-ACTIVITY] {actor_name} ({actor_type}) - {action} - {target_type}:{target_id}")
    return log_entry


# ========================== LEDGER HELPERS ==========================

async def create_ledger_entry(
    transaction_id: str,
    business_id: str,
    direction: str,
    account: str,
    amount: float,
    currency: str = "MXN",
    country: str = "MX",
    description: str = None,
    booking_id: str = None,
    created_by: str = "system"
) -> dict:
    entry = {
        "id": generate_id(),
        "transaction_id": transaction_id,
        "booking_id": booking_id,
        "business_id": business_id,
        "direction": direction,
        "account": account,
        "amount_cents": amount_to_cents(amount),
        "amount": round(amount, 2),
        "currency": currency,
        "country": country,
        "entry_status": LedgerEntryStatus.POSTED,
        "description": description,
        "related_appointment_id": booking_id,
        "created_by": created_by,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.ledger_entries.insert_one(entry)
    logger.info(f"[LEDGER] {direction} {amount} {currency} - {account} - business:{business_id}")
    return entry


async def create_transaction_ledger_entries(transaction: dict, status: str):
    tx_id = transaction["id"]
    business_id = transaction["business_id"]
    booking_id = transaction.get("booking_id")
    amount = transaction["amount_total"]
    fee = transaction["fee_amount"]
    payout = transaction["payout_amount"]

    if status == TransactionStatus.PAID:
        await create_ledger_entry(
            tx_id, business_id, LedgerDirection.CREDIT, LedgerAccount.BUSINESS_REVENUE,
            amount, description="Anticipo recibido", booking_id=booking_id
        )
        await create_ledger_entry(
            tx_id, business_id, LedgerDirection.DEBIT, LedgerAccount.PLATFORM_FEE,
            fee, description="Comisión Bookvia 8%", booking_id=booking_id
        )
    elif status == TransactionStatus.REFUND_PARTIAL:
        refund_amount = transaction.get("refund_amount", payout)
        await create_ledger_entry(
            tx_id, business_id, LedgerDirection.DEBIT, LedgerAccount.REFUND,
            refund_amount, description="Reembolso parcial cliente >24h", booking_id=booking_id
        )
    elif status == TransactionStatus.REFUND_FULL:
        await create_ledger_entry(
            tx_id, business_id, LedgerDirection.DEBIT, LedgerAccount.REFUND,
            amount, description="Reembolso completo (negocio canceló)", booking_id=booking_id
        )
    elif status == TransactionStatus.BUSINESS_CANCEL_FEE:
        penalty = transaction.get("fee_amount", fee)
        await create_ledger_entry(
            tx_id, business_id, LedgerDirection.DEBIT, LedgerAccount.PENALTY,
            penalty, description="Penalidad por cancelación del negocio 8%", booking_id=booking_id
        )
    elif status == TransactionStatus.NO_SHOW_PAYOUT:
        pass


async def calculate_business_ledger_summary(business_id: str, period_start: str = None, period_end: str = None) -> dict:
    filters = {"business_id": business_id, "entry_status": LedgerEntryStatus.POSTED}
    if period_start and period_end:
        filters["created_at"] = {"$gte": period_start, "$lte": period_end}
    entries = await db.ledger_entries.find(filters, {"_id": 0}).to_list(10000)
    gross_revenue = 0
    total_fees = 0
    total_refunds = 0
    total_penalties = 0
    total_payouts = 0
    for entry in entries:
        amount = entry["amount"]
        account = entry["account"]
        direction = entry["direction"]
        if account == LedgerAccount.BUSINESS_REVENUE and direction == LedgerDirection.CREDIT:
            gross_revenue += amount
        elif account == LedgerAccount.PLATFORM_FEE and direction == LedgerDirection.DEBIT:
            total_fees += amount
        elif account == LedgerAccount.REFUND and direction == LedgerDirection.DEBIT:
            total_refunds += amount
        elif account == LedgerAccount.PENALTY and direction == LedgerDirection.DEBIT:
            total_penalties += amount
        elif account == LedgerAccount.PAYOUT and direction == LedgerDirection.CREDIT:
            total_payouts += amount
    net_earnings = gross_revenue - total_fees - total_refunds - total_penalties
    return {
        "gross_revenue": round(gross_revenue, 2),
        "total_fees": round(total_fees, 2),
        "total_refunds": round(total_refunds, 2),
        "total_penalties": round(total_penalties, 2),
        "net_earnings": round(net_earnings, 2),
        "total_payouts": round(total_payouts, 2),
        "pending_payout": round(net_earnings - total_payouts, 2)
    }
