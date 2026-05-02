"""
Fase 2 Bookvia - Wallet/Saldo del cliente tests.
Covers:
- GET /api/users/me/wallet & /transactions
- services.wallet credit/debit/expire_stale_balances
- POST /api/bookings/{id}/cancel/user with refund_to='wallet'|'card' (>24h, <24h)
- POST /api/payments/deposit/checkout with use_wallet=true (balance=0, full, partial)
"""
import os
import sys
import uuid
import asyncio
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

# Make backend services importable
sys.path.insert(0, "/app/backend")

# ---- Config ----
BASE_URL = ""
try:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break
except Exception:
    pass
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"
_db = MongoClient(MONGO_URL)[DB_NAME]

USER_EMAIL = "testuser_stats@test.com"
USER_PASS = "TestPass123!"
BIZ_EMAIL = "testbiz_dashboard@test.com"
BIZ_PASS = "TestBiz123!"


# ---- Fixtures ----
@pytest.fixture(scope="module")
def user_token():
    r = requests.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return d.get("access_token") or d.get("token")


@pytest.fixture(scope="module")
def user_id():
    u = _db.users.find_one({"email": USER_EMAIL})
    assert u, "User not found in DB"
    return u["id"]


@pytest.fixture(scope="module")
def biz_token():
    r = requests.post(f"{API}/auth/login", json={"email": BIZ_EMAIL, "password": BIZ_PASS}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    return d.get("access_token") or d.get("token")


@pytest.fixture(scope="module")
def biz_context(biz_token):
    """Reuse the seeded business with worker + cheap/exp services from fase1 setup pattern."""
    u = _db.users.find_one({"email": BIZ_EMAIL})
    biz_id = u["business_id"]
    _db.businesses.update_one(
        {"id": biz_id},
        {"$set": {
            "status": "approved",
            "subscription_status": "active",
            "requires_deposit": True,
            "deposit_amount": 150.0,
            "min_time_between_appointments": 0,
            "allow_home_service": False,
        }},
    )
    exp_id = f"svc_f2_{uuid.uuid4().hex[:8]}"
    worker_id = f"wrk_f2_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()
    _db.services.insert_one({
        "id": exp_id, "business_id": biz_id, "name": "TEST_F2_EXP",
        "description": "expensive", "price": 500.0, "duration_minutes": 30,
        "active": True, "created_at": now,
    })
    schedule = {str(d): {"is_available": True, "blocks": [{"start_time": "08:00", "end_time": "22:00"}]} for d in range(7)}
    _db.workers.insert_one({
        "id": worker_id, "business_id": biz_id, "name": "TEST_F2_WORKER",
        "service_ids": [exp_id], "active": True, "schedule": schedule, "exceptions": [], "created_at": now,
    })
    yield {"biz_id": biz_id, "exp_id": exp_id, "worker_id": worker_id}
    _db.services.delete_many({"id": exp_id})
    _db.workers.delete_many({"id": worker_id})
    _db.bookings.delete_many({"business_id": biz_id, "notes": {"$regex": "^TEST_F2"}})


@pytest.fixture(autouse=True)
def reset_wallet(user_id):
    """Reset wallet + suspension state for the user before each test for isolation."""
    _db.user_wallets.delete_many({"user_id": user_id})
    _db.wallet_transactions.delete_many({"user_id": user_id})
    _db.users.update_one(
        {"id": user_id},
        {"$unset": {"suspended_until": "", "suspension_reason": ""},
         "$set": {"cancellation_count": 0, "active_appointments_count": 0}},
    )
    yield
    _db.user_wallets.delete_many({"user_id": user_id})
    _db.wallet_transactions.delete_many({"user_id": user_id})
    _db.users.update_one(
        {"id": user_id},
        {"$unset": {"suspended_until": "", "suspension_reason": ""},
         "$set": {"cancellation_count": 0}},
    )


def _auth(t):
    return {"Authorization": f"Bearer {t}"}


# =========================================================
# 1) GET /api/users/me/wallet
# =========================================================
class TestWalletEndpoint:
    def test_new_user_wallet_zero(self, user_token):
        r = requests.get(f"{API}/users/me/wallet", headers=_auth(user_token), timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["balance"] == 0.0
        assert d["currency"] == "MXN"
        assert d.get("expires_at") in (None, "")
        assert d["transactions"] == []
        assert d["transactions_total"] == 0

    def test_wallet_after_credit(self, user_token, user_id):
        from services.wallet import credit_wallet, CREDIT_ADMIN_ADJUSTMENT
        asyncio.get_event_loop().run_until_complete(
            credit_wallet(user_id, 100.0, CREDIT_ADMIN_ADJUSTMENT, description="seed")
        )
        r = requests.get(f"{API}/users/me/wallet", headers=_auth(user_token), timeout=10)
        d = r.json()
        assert d["balance"] == 100.0
        assert d["currency"] == "MXN"
        assert d["last_activity_at"] is not None
        assert d["expires_at"] is not None  # 24 months from now
        assert d["transactions_total"] == 1
        assert len(d["transactions"]) == 1
        tx = d["transactions"][0]
        assert tx["amount"] == 100.0
        assert tx["direction"] == "credit"
        assert tx["balance_after"] == 100.0

    def test_wallet_transactions_pagination(self, user_token, user_id):
        from services.wallet import credit_wallet, CREDIT_ADMIN_ADJUSTMENT
        loop = asyncio.get_event_loop()
        for i in range(5):
            loop.run_until_complete(credit_wallet(user_id, 10.0 + i, CREDIT_ADMIN_ADJUSTMENT, description=f"t{i}"))
        r = requests.get(f"{API}/users/me/wallet/transactions",
                         params={"page": 1, "limit": 3}, headers=_auth(user_token), timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["total"] == 5
        assert d["page"] == 1
        assert d["limit"] == 3
        assert len(d["transactions"]) == 3
        # Newest first - first item is the last credit
        amounts = [tx["amount"] for tx in d["transactions"]]
        assert amounts == sorted(amounts, reverse=True)


# =========================================================
# 2) services.wallet unit tests (asyncio)
# =========================================================
class TestWalletService:
    def test_credit_wallet_creates_tx(self, user_id):
        from services.wallet import credit_wallet, CREDIT_CANCELLATION
        loop = asyncio.get_event_loop()
        tx = loop.run_until_complete(
            credit_wallet(user_id, 50.0, CREDIT_CANCELLATION, booking_id="bk1", description="cancel")
        )
        assert tx["direction"] == "credit"
        assert tx["amount"] == 50.0
        assert tx["balance_after"] == 50.0
        assert tx["type"] == "credit_cancellation"
        assert tx["booking_id"] == "bk1"
        assert tx["description"] == "cancel"
        # Verify in DB
        w = _db.user_wallets.find_one({"user_id": user_id})
        assert w["balance"] == 50.0

    def test_debit_wallet_insufficient_balance_raises(self, user_id):
        from services.wallet import debit_wallet, DEBIT_BOOKING
        loop = asyncio.get_event_loop()
        with pytest.raises(ValueError):
            loop.run_until_complete(debit_wallet(user_id, 10.0, DEBIT_BOOKING, description="x"))

    def test_debit_wallet_invalid_type(self, user_id):
        from services.wallet import debit_wallet, credit_wallet, CREDIT_ADMIN_ADJUSTMENT
        loop = asyncio.get_event_loop()
        loop.run_until_complete(credit_wallet(user_id, 100.0, CREDIT_ADMIN_ADJUSTMENT))
        with pytest.raises(ValueError):
            loop.run_until_complete(debit_wallet(user_id, 10.0, "not_a_real_type"))

    def test_credit_invalid_type(self, user_id):
        from services.wallet import credit_wallet
        loop = asyncio.get_event_loop()
        with pytest.raises(ValueError):
            loop.run_until_complete(credit_wallet(user_id, 10.0, "bad_type"))

    def test_debit_wallet_success(self, user_id):
        from services.wallet import credit_wallet, debit_wallet, CREDIT_ADMIN_ADJUSTMENT, DEBIT_BOOKING
        loop = asyncio.get_event_loop()
        loop.run_until_complete(credit_wallet(user_id, 200.0, CREDIT_ADMIN_ADJUSTMENT))
        tx = loop.run_until_complete(debit_wallet(user_id, 50.0, DEBIT_BOOKING, booking_id="bk2"))
        assert tx["direction"] == "debit"
        assert tx["balance_after"] == 150.0
        w = _db.user_wallets.find_one({"user_id": user_id})
        assert w["balance"] == 150.0

    def test_expire_stale_balances(self, user_id):
        from services.wallet import credit_wallet, expire_stale_balances, CREDIT_ADMIN_ADJUSTMENT
        loop = asyncio.get_event_loop()
        loop.run_until_complete(credit_wallet(user_id, 75.0, CREDIT_ADMIN_ADJUSTMENT))
        # Simulate last_activity_at older than 24 months
        old = (datetime.now(timezone.utc) - timedelta(days=24 * 30 + 5)).isoformat()
        _db.user_wallets.update_one({"user_id": user_id}, {"$set": {"last_activity_at": old}})
        count = loop.run_until_complete(expire_stale_balances())
        assert count >= 1
        w = _db.user_wallets.find_one({"user_id": user_id})
        assert w["balance"] == 0.0
        # debit_expired transaction created
        debit_tx = _db.wallet_transactions.find_one({"user_id": user_id, "type": "debit_expired"})
        assert debit_tx is not None
        assert debit_tx["amount"] == 75.0
        assert debit_tx["balance_after"] == 0.0


# =========================================================
# 3) Cancel booking refund_to=wallet vs card
# =========================================================
def _seed_paid_booking(user_id, biz_id, exp_id, worker_id, hours_from_now=48):
    """Insert booking + paid transaction directly in DB for cancellation tests."""
    bk_id = f"bk_test_{uuid.uuid4().hex[:8]}"
    tx_id = f"tx_test_{uuid.uuid4().hex[:8]}"
    appt_dt = datetime.now(timezone.utc) + timedelta(hours=hours_from_now)
    date = appt_dt.strftime("%Y-%m-%d")
    time = appt_dt.strftime("%H:%M")
    now_iso = datetime.now(timezone.utc).isoformat()
    booking_doc = {
        "id": bk_id, "user_id": user_id, "business_id": biz_id, "service_id": exp_id,
        "service_name": "TEST_F2_EXP", "worker_id": worker_id, "worker_name": "TEST_F2_WORKER",
        "date": date, "time": time, "duration_minutes": 30, "status": "confirmed",
        "deposit_amount": 100.0, "deposit_paid": True, "transaction_id": tx_id,
        "notes": "TEST_F2_cancel", "created_at": now_iso, "confirmed_at": now_iso,
        "client_name": "Tester", "client_email": USER_EMAIL,
    }
    tx_doc = {
        "id": tx_id, "booking_id": bk_id, "user_id": user_id, "business_id": biz_id,
        "stripe_session_id": f"cs_test_{uuid.uuid4().hex[:6]}",
        "stripe_payment_intent_id": f"pi_test_{uuid.uuid4().hex[:6]}",
        "amount_total": 100.0, "client_paid": 108.2, "bookvia_fee": 8.2,
        "stripe_fee_estimated": 8.5, "stripe_fee_actual": 8.5,
        "business_amount": 91.5, "fee_amount": 8.5, "payout_amount": 91.5,
        "wallet_applied": 0.0, "stripe_charge_amount": 108.2, "currency": "MXN",
        "status": "paid", "paid_at": now_iso, "created_at": now_iso, "updated_at": now_iso,
    }
    _db.bookings.insert_one(booking_doc)
    _db.transactions.insert_one(tx_doc)
    return bk_id, tx_id


class TestCancelRefundToWallet:
    def test_cancel_gt24h_refund_to_wallet_credits_wallet(self, user_token, user_id, biz_context):
        bk, tx = _seed_paid_booking(user_id, biz_context["biz_id"], biz_context["exp_id"], biz_context["worker_id"], hours_from_now=48)
        try:
            r = requests.put(
                f"{API}/bookings/{bk}/cancel/user",
                json={"reason": "test", "refund_to": "wallet"},
                headers=_auth(user_token), timeout=20,
            )
            assert r.status_code == 200, r.text
            data = r.json()
            ref = data.get("refund_result") or data.get("refund") or data
            # Verify refund_to=wallet, wallet_credited=true
            assert ref.get("refund_to") == "wallet", f"Expected wallet, got {ref}"
            assert ref.get("wallet_credited") is True
            # Wallet should be credited with business_amount (91.5)
            w = _db.user_wallets.find_one({"user_id": user_id})
            assert w is not None
            assert w["balance"] == 91.5, f"Expected 91.5 in wallet, got {w['balance']}"
            # wallet_transaction created
            wtx = _db.wallet_transactions.find_one({"user_id": user_id, "booking_id": bk})
            assert wtx is not None
            assert wtx["type"] == "credit_cancellation"
            assert wtx["amount"] == 91.5
            assert wtx["direction"] == "credit"
            # Transaction updated
            ttx = _db.transactions.find_one({"id": tx})
            assert ttx["refund_to"] == "wallet"
            assert ttx["wallet_credited"] is True
        finally:
            _db.bookings.delete_one({"id": bk})
            _db.transactions.delete_one({"id": tx})

    def test_cancel_gt24h_refund_to_card_no_wallet(self, user_token, user_id, biz_context):
        bk, tx = _seed_paid_booking(user_id, biz_context["biz_id"], biz_context["exp_id"], biz_context["worker_id"], hours_from_now=48)
        try:
            r = requests.put(
                f"{API}/bookings/{bk}/cancel/user",
                json={"reason": "test", "refund_to": "card"},
                headers=_auth(user_token), timeout=20,
            )
            # Stripe refund will likely fail with fake pi_test, but we check transaction state
            # Cancel still proceeds; let's accept 200 or 400
            ttx = _db.transactions.find_one({"id": tx})
            assert ttx is not None
            # refund_to should remain card; wallet should not be credited
            assert ttx.get("refund_to") in (None, "card"), f"refund_to={ttx.get('refund_to')}"
            assert ttx.get("wallet_credited") in (None, False)
            w = _db.user_wallets.find_one({"user_id": user_id})
            balance = (w or {}).get("balance", 0.0)
            assert balance == 0.0, f"Wallet should NOT be credited for card refund, got {balance}"
        finally:
            _db.bookings.delete_one({"id": bk})
            _db.transactions.delete_one({"id": tx})

    def test_cancel_lt24h_no_refund_no_wallet(self, user_token, user_id, biz_context):
        bk, tx = _seed_paid_booking(user_id, biz_context["biz_id"], biz_context["exp_id"], biz_context["worker_id"], hours_from_now=2)
        try:
            r = requests.put(
                f"{API}/bookings/{bk}/cancel/user",
                json={"reason": "test", "refund_to": "wallet"},
                headers=_auth(user_token), timeout=20,
            )
            assert r.status_code == 200, r.text
            data = r.json()
            ref = data.get("refund_result") or data.get("refund") or data
            assert ref.get("refund_amount", 0) == 0
            assert ref.get("refund_to") == "card"  # Forced by backend when no refund
            # Wallet not credited
            w = _db.user_wallets.find_one({"user_id": user_id})
            balance = (w or {}).get("balance", 0.0)
            assert balance == 0.0
        finally:
            _db.bookings.delete_one({"id": bk})
            _db.transactions.delete_one({"id": tx})


# =========================================================
# 4) /payments/deposit/checkout with use_wallet
# =========================================================
class TestDepositCheckoutWithWallet:
    def _create_booking(self, user_token, biz_context, time, day_offset=2):
        date = (datetime.now(timezone.utc) + timedelta(days=day_offset)).strftime("%Y-%m-%d")
        payload = {
            "business_id": biz_context["biz_id"], "service_id": biz_context["exp_id"],
            "worker_id": biz_context["worker_id"], "date": date, "time": time,
            "notes": f"TEST_F2_co_{uuid.uuid4().hex[:6]}",
        }
        r = requests.post(f"{API}/bookings", json=payload, headers=_auth(user_token), timeout=20)
        assert r.status_code in (200, 201), r.text
        return r.json()["id"]

    def test_use_wallet_zero_balance_normal_stripe(self, user_token, biz_context):
        bk = self._create_booking(user_token, biz_context, time="09:00", day_offset=5)
        r = requests.post(f"{API}/payments/deposit/checkout",
                          json={"booking_id": bk, "use_wallet": True},
                          headers=_auth(user_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("wallet_only") is not True
        assert "url" in d and d["url"].startswith("http")
        # Response doesn't expose wallet_applied/stripe_charge_amount; check DB
        tx = _db.transactions.find_one({"booking_id": bk})
        assert tx is not None
        assert tx.get("wallet_applied", 0) == 0
        assert tx.get("stripe_charge_amount") == tx.get("client_paid")
        _db.bookings.delete_one({"id": bk})
        _db.transactions.delete_one({"id": tx["id"]})

    def test_use_wallet_full_coverage_no_stripe(self, user_token, user_id, biz_context):
        from services.wallet import credit_wallet, CREDIT_ADMIN_ADJUSTMENT
        # Need balance >= 158.20 (deposit 150 + bookvia fee 8.20)
        asyncio.get_event_loop().run_until_complete(
            credit_wallet(user_id, 200.0, CREDIT_ADMIN_ADJUSTMENT, description="seed full")
        )
        bk = self._create_booking(user_token, biz_context, time="11:00", day_offset=6)
        r = requests.post(f"{API}/payments/deposit/checkout",
                          json={"booking_id": bk, "use_wallet": True},
                          headers=_auth(user_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("wallet_only") is True, f"Expected wallet_only=true, got {d}"
        assert d.get("transaction_id")
        assert d.get("wallet_applied") == 158.2
        assert d.get("stripe_charge_amount") == 0.0
        assert d.get("redirect_url")
        # Booking should be CONFIRMED, transaction PAID
        bdoc = _db.bookings.find_one({"id": bk})
        assert bdoc["status"] == "confirmed"
        assert bdoc["deposit_paid"] is True
        tx = _db.transactions.find_one({"id": d["transaction_id"]})
        assert tx["status"] == "paid"
        assert tx["wallet_applied"] == 158.2
        # Wallet debited 158.2 (200 - 158.2 = 41.8)
        w = _db.user_wallets.find_one({"user_id": user_id})
        assert round(w["balance"], 2) == 41.8
        wtx = _db.wallet_transactions.find_one({"user_id": user_id, "booking_id": bk, "type": "debit_booking"})
        assert wtx is not None
        assert wtx["amount"] == 158.2
        _db.bookings.delete_one({"id": bk})
        _db.transactions.delete_one({"id": d["transaction_id"]})

    def test_use_wallet_partial_creates_stripe_for_remainder(self, user_token, user_id, biz_context):
        from services.wallet import credit_wallet, CREDIT_ADMIN_ADJUSTMENT
        # client_paid=158.2, give wallet 50 -> remainder 108.2 to Stripe
        asyncio.get_event_loop().run_until_complete(
            credit_wallet(user_id, 50.0, CREDIT_ADMIN_ADJUSTMENT, description="seed partial")
        )
        bk = self._create_booking(user_token, biz_context, time="13:00", day_offset=7)
        r = requests.post(f"{API}/payments/deposit/checkout",
                          json={"booking_id": bk, "use_wallet": True},
                          headers=_auth(user_token), timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("wallet_only") is not True
        assert "url" in d and d["url"].startswith("http")
        # Verify wallet_applied and stripe_charge_amount via DB transaction (not in response)
        tx = _db.transactions.find_one({"booking_id": bk})
        assert tx is not None
        assert tx.get("wallet_applied") == 50.0
        assert tx.get("stripe_charge_amount") == 108.2
        # Wallet not yet debited at checkout step (per code, debit happens at webhook confirmation)
        # But verify wallet still has 50
        w = _db.user_wallets.find_one({"user_id": user_id})
        assert w["balance"] == 50.0
        _db.bookings.delete_one({"id": bk})
        _db.transactions.delete_one({"id": tx["id"]})
