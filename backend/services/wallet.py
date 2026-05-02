"""
Wallet service - Bookvia user wallet (saldo) management.

Stores client balances in MXN. Used as alternative to card refunds when
clients cancel bookings or as compensation when businesses cancel.

Schema:
  user_wallets: { user_id, balance, currency, last_activity_at, created_at, updated_at }
  wallet_transactions: { id, user_id, type, direction, amount, balance_after,
                          booking_id, description, currency, created_at }

Expiration: balance expires 24 months after last_activity_at if no movement.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from core.database import db
from core.helpers import generate_id

logger = logging.getLogger(__name__)

WALLET_EXPIRATION_MONTHS = 24
WALLET_CURRENCY = "MXN"

# Transaction types
CREDIT_CANCELLATION = "credit_cancellation"  # Client cancels and chooses wallet
CREDIT_BUSINESS_CANCEL = "credit_business_cancel"  # Business cancels, full refund to wallet
CREDIT_ADMIN_ADJUSTMENT = "credit_admin"  # Admin manual credit
CREDIT_BUSINESS_NO_SHOW = "credit_business_no_show"  # Compensation for closed business
DEBIT_BOOKING = "debit_booking"  # Used to pay for a booking
DEBIT_EXPIRED = "debit_expired"  # Balance expired
DEBIT_REFUND_TO_CARD = "debit_refund_to_card"  # Admin sent balance back to card

# Direction constants
DIRECTION_CREDIT = "credit"
DIRECTION_DEBIT = "debit"

CREDIT_TYPES = {
    CREDIT_CANCELLATION,
    CREDIT_BUSINESS_CANCEL,
    CREDIT_ADMIN_ADJUSTMENT,
    CREDIT_BUSINESS_NO_SHOW,
}
DEBIT_TYPES = {
    DEBIT_BOOKING,
    DEBIT_EXPIRED,
    DEBIT_REFUND_TO_CARD,
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _compute_expires_at(last_activity_at: Optional[str]) -> Optional[str]:
    if not last_activity_at:
        return None
    try:
        last = datetime.fromisoformat(last_activity_at.replace("Z", "+00:00"))
    except Exception:
        return None
    return (last + timedelta(days=WALLET_EXPIRATION_MONTHS * 30)).isoformat()


async def _get_or_create_wallet(user_id: str) -> dict:
    wallet = await db.user_wallets.find_one({"user_id": user_id}, {"_id": 0})
    if wallet:
        return wallet
    new_wallet = {
        "user_id": user_id,
        "balance": 0.0,
        "currency": WALLET_CURRENCY,
        "last_activity_at": None,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    await db.user_wallets.insert_one(dict(new_wallet))
    return new_wallet


async def get_wallet_balance(user_id: str) -> dict:
    """Return current wallet info: balance, last activity, expiration date."""
    wallet = await _get_or_create_wallet(user_id)
    return {
        "user_id": user_id,
        "balance": round(float(wallet.get("balance") or 0.0), 2),
        "currency": wallet.get("currency") or WALLET_CURRENCY,
        "last_activity_at": wallet.get("last_activity_at"),
        "expires_at": _compute_expires_at(wallet.get("last_activity_at")) if (wallet.get("balance") or 0) > 0 else None,
    }


async def credit_wallet(
    user_id: str,
    amount: float,
    tx_type: str,
    booking_id: Optional[str] = None,
    description: Optional[str] = None,
) -> dict:
    """Add funds to user wallet. Returns transaction record."""
    if amount <= 0:
        raise ValueError("Credit amount must be positive")
    if tx_type not in CREDIT_TYPES:
        raise ValueError(f"Invalid credit type: {tx_type}")
    
    await _get_or_create_wallet(user_id)
    now = _now_iso()
    amount = round(float(amount), 2)
    
    # Atomic update of balance
    res = await db.user_wallets.find_one_and_update(
        {"user_id": user_id},
        {
            "$inc": {"balance": amount},
            "$set": {"last_activity_at": now, "updated_at": now},
        },
        return_document=True,
    )
    new_balance = round(float(res.get("balance") or 0.0), 2)
    
    tx = {
        "id": generate_id(),
        "user_id": user_id,
        "type": tx_type,
        "direction": DIRECTION_CREDIT,
        "amount": amount,
        "balance_after": new_balance,
        "booking_id": booking_id,
        "description": description,
        "currency": WALLET_CURRENCY,
        "created_at": now,
    }
    await db.wallet_transactions.insert_one(dict(tx))
    logger.info(f"Wallet credit: user={user_id} +${amount} type={tx_type} new_balance=${new_balance}")
    return tx


async def debit_wallet(
    user_id: str,
    amount: float,
    tx_type: str,
    booking_id: Optional[str] = None,
    description: Optional[str] = None,
) -> dict:
    """Deduct funds from user wallet. Raises ValueError on insufficient balance."""
    if amount <= 0:
        raise ValueError("Debit amount must be positive")
    if tx_type not in DEBIT_TYPES:
        raise ValueError(f"Invalid debit type: {tx_type}")
    
    wallet = await _get_or_create_wallet(user_id)
    current = round(float(wallet.get("balance") or 0.0), 2)
    amount = round(float(amount), 2)
    if amount > current:
        raise ValueError(f"Insufficient wallet balance: requested={amount}, available={current}")
    
    now = _now_iso()
    res = await db.user_wallets.find_one_and_update(
        {"user_id": user_id, "balance": {"$gte": amount}},
        {
            "$inc": {"balance": -amount},
            "$set": {"last_activity_at": now, "updated_at": now},
        },
        return_document=True,
    )
    if not res:
        # Race condition: someone debited between the check and the update
        raise ValueError("Insufficient wallet balance (concurrent debit)")
    new_balance = round(float(res.get("balance") or 0.0), 2)
    
    tx = {
        "id": generate_id(),
        "user_id": user_id,
        "type": tx_type,
        "direction": DIRECTION_DEBIT,
        "amount": amount,
        "balance_after": new_balance,
        "booking_id": booking_id,
        "description": description,
        "currency": WALLET_CURRENCY,
        "created_at": now,
    }
    await db.wallet_transactions.insert_one(dict(tx))
    logger.info(f"Wallet debit: user={user_id} -${amount} type={tx_type} new_balance=${new_balance}")
    return tx


async def list_wallet_transactions(user_id: str, page: int = 1, limit: int = 20) -> dict:
    """Paginated list of wallet transactions for a user, newest first."""
    skip = max(0, (page - 1) * limit)
    total = await db.wallet_transactions.count_documents({"user_id": user_id})
    txs = await db.wallet_transactions.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"transactions": txs, "total": total, "page": page, "limit": limit}


async def expire_stale_balances() -> int:
    """Cron task: zero-out wallet balances that have been inactive for >= 24 months."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=WALLET_EXPIRATION_MONTHS * 30)).isoformat()
    stale = await db.user_wallets.find(
        {
            "balance": {"$gt": 0},
            "last_activity_at": {"$ne": None, "$lt": cutoff},
        },
        {"_id": 0}
    ).to_list(1000)
    
    expired_count = 0
    for w in stale:
        try:
            await debit_wallet(
                user_id=w["user_id"],
                amount=float(w.get("balance") or 0),
                tx_type=DEBIT_EXPIRED,
                description=f"Saldo expirado por inactividad de {WALLET_EXPIRATION_MONTHS} meses",
            )
            expired_count += 1
        except Exception as e:
            logger.error(f"Wallet expiration failed for user {w['user_id']}: {e}")
    
    if expired_count > 0:
        logger.info(f"Wallet expiration: {expired_count} balances zeroed out")
    return expired_count
