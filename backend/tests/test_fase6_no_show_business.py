"""
Fase 6 - Negocio cerrado / No-show business + auto-resolve 24h + $50 compensation.
Covers:
  - services.strikes.issue_strike(pending_review=True) side-effect isolation
  - services.strikes.resolve_pending_strike (upheld / cleared / invalid)
  - POST /api/bookings/{id}/no-show-business (auth, window, duplicate, missing payment)
  - POST /api/bookings/{id}/no-show-response (business auth, validation)
  - routers.bookings._process_no_show_report (auto-resolve wallet credits, strike upheld)
  - routers.bookings.process_expired_no_show_reports (skips when response present)
  - GET  /api/admin/no-show-reports
  - POST /api/admin/no-show-reports/{id}/resolve (favor_client / favor_business / invalid)
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta

import pyotp
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

sys.path.insert(0, "/app/backend")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "zamorachapa50@gmail.com"
ADMIN_PASSWORD = "RainbowLol3133!"
BIZ_EMAIL = "testbiz_dashboard@test.com"
BIZ_PASSWORD = "TestBiz123!"
USER_EMAIL = "testuser_stats@test.com"
USER_PASSWORD = "TestPass123!"

TEST_PREFIX = "TEST_F6_"


# ----------------- Fixtures -----------------
@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def db():
    client = AsyncIOMotorClient(os.environ.get("MONGO_URL"))
    return client[os.environ.get("DB_NAME", "bookvia")]


@pytest.fixture(scope="module")
def admin_token(db, event_loop):
    async def _totp():
        u = await db.users.find_one({"email": ADMIN_EMAIL}, {"_id": 0, "totp_secret": 1})
        return pyotp.TOTP(u["totp_secret"]).now() if u and u.get("totp_secret") else "000000"
    code = event_loop.run_until_complete(_totp())
    r = requests.post(f"{API}/auth/admin/login", json={
        "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "totp_code": code,
    })
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def business_token():
    r = requests.post(f"{API}/auth/login", json={"email": BIZ_EMAIL, "password": BIZ_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Business login failed: {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def user_token():
    r = requests.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"User login failed: {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def biz_id(db, event_loop):
    async def _find():
        u = await db.users.find_one({"email": BIZ_EMAIL}, {"_id": 0, "business_id": 1})
        return u.get("business_id") if u else None
    return event_loop.run_until_complete(_find())


@pytest.fixture(scope="module")
def user_id(db, event_loop):
    async def _find():
        u = await db.users.find_one({"email": USER_EMAIL}, {"_id": 0, "id": 1})
        return u.get("id") if u else None
    return event_loop.run_until_complete(_find())


def _reset_business(db, event_loop, bid):
    async def _r():
        await db.business_strikes.delete_many({"business_id": bid})
        await db.businesses.update_one(
            {"id": bid},
            {"$set": {
                "strike_count_30d": 0, "strike_count_90d": 0,
                "pending_strike_penalty_mxn": 0,
                "suspended_until": None, "suspended_reason": None,
                "banned": False, "status": "approved",
            }}
        )
    event_loop.run_until_complete(_r())


@pytest.fixture(scope="module", autouse=True)
def cleanup_module(db, event_loop, biz_id, user_id):
    """Wipe prior test data before & after the module."""
    async def _clean():
        if biz_id:
            await db.business_strikes.delete_many({"business_id": biz_id})
            await db.businesses.update_one(
                {"id": biz_id},
                {"$set": {
                    "strike_count_30d": 0, "strike_count_90d": 0,
                    "pending_strike_penalty_mxn": 0,
                    "suspended_until": None, "suspended_reason": None,
                    "banned": False, "status": "approved",
                }}
            )
        # Remove TEST_F6_ bookings / transactions / wallet txns
        await db.bookings.delete_many({"id": {"$regex": "^TEST_F6_"}})
        await db.transactions.delete_many({"id": {"$regex": "^TEST_F6_"}})
        await db.wallet_transactions.delete_many({"booking_id": {"$regex": "^TEST_F6_"}})

    event_loop.run_until_complete(_clean())
    yield
    event_loop.run_until_complete(_clean())


# ----------------- Helpers -----------------
def _make_booking_and_tx(db, event_loop, biz_id, user_id, *, minutes_ago=30,
                        client_paid=108.20, status="confirmed", funds_state="pending_hold",
                        with_transaction=True):
    """
    Insert a booking (in the past, default 30 min ago -> inside the 4h reporting window)
    with an associated PAID transaction. Returns (booking_id, transaction_id).
    """
    booking_id = f"{TEST_PREFIX}bk_{uuid.uuid4().hex[:8]}"
    tx_id = f"{TEST_PREFIX}tx_{uuid.uuid4().hex[:8]}"
    booking_dt = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
    date_s = booking_dt.strftime("%Y-%m-%d")
    time_s = booking_dt.strftime("%H:%M")

    async def _insert():
        # Get a real service for the business (fallback: synthesize minimal fields)
        svc = await db.services.find_one({"business_id": biz_id}, {"_id": 0})
        service_id = (svc or {}).get("id") or f"{TEST_PREFIX}svc"
        service_name = (svc or {}).get("name") or "TEST_F6 service"
        service_price = float((svc or {}).get("price") or 100.0)

        await db.bookings.insert_one({
            "id": booking_id,
            "business_id": biz_id,
            "user_id": user_id,
            "service_id": service_id,
            "service_name": service_name,
            "service_price": service_price,
            "date": date_s,
            "time": time_s,
            "status": status,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        if with_transaction:
            await db.transactions.insert_one({
                "id": tx_id,
                "booking_id": booking_id,
                "user_id": user_id,
                "business_id": biz_id,
                "amount_total": client_paid,
                "client_paid": client_paid,
                "fee_amount": 8.20,
                "payout_amount": 100.0,
                "currency": "mxn",
                "status": "paid",
                "funds_state": funds_state,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "paid_at": datetime.now(timezone.utc).isoformat(),
            })
    event_loop.run_until_complete(_insert())
    return booking_id, tx_id


# ===================== SERVICE-LEVEL =====================
class TestIssueStrikePendingReview:
    """strikes.issue_strike(pending_review=True) should NOT apply side effects."""

    def test_pending_review_no_side_effects(self, db, event_loop, biz_id):
        _reset_business(db, event_loop, biz_id)
        from services.strikes import issue_strike

        async def _run():
            s = await issue_strike(
                biz_id, reason="no_show_business",
                description="TEST_F6 pending", issued_by="test",
                pending_review=True,
            )
            biz = await db.businesses.find_one({"id": biz_id}, {"_id": 0})
            return s, biz

        strike, biz = event_loop.run_until_complete(_run())
        assert strike["pending_review"] is True
        assert strike["review_resolved"] is False
        assert strike["financial_penalty_mxn"] == 0.0
        assert strike["suspension_until"] is None
        # Counters still bumped
        assert biz.get("strike_count_30d") == 1
        assert biz.get("strike_count_90d") == 1
        # But NO suspension / pending penalty side-effects
        assert biz.get("suspended_until") in (None, "")
        assert not biz.get("banned")
        assert float(biz.get("pending_strike_penalty_mxn") or 0) == 0.0


class TestResolvePendingStrike:
    """strikes.resolve_pending_strike upheld / cleared / invalid."""

    def test_upheld_applies_minor_penalty(self, db, event_loop, biz_id):
        _reset_business(db, event_loop, biz_id)
        from services.strikes import issue_strike, resolve_pending_strike

        async def _run():
            s = await issue_strike(biz_id, reason="no_show_business",
                                   issued_by="test", pending_review=True)
            r = await resolve_pending_strike(s["id"], outcome="upheld",
                                             resolved_by="admin:test", reason="upheld test")
            biz = await db.businesses.find_one({"id": biz_id}, {"_id": 0})
            return s, r, biz

        s, resolved, biz = event_loop.run_until_complete(_run())
        # severity stored as MINOR (first severe strike)
        assert s["severity"] == "minor"
        assert resolved["review_resolved"] is True
        assert resolved["review_outcome"] == "upheld"
        assert resolved["pending_review"] is False
        # penalty now reflected on strike
        assert resolved["financial_penalty_mxn"] == 100.0
        # Business pending penalty bumped
        assert float(biz.get("pending_strike_penalty_mxn") or 0) == 100.0

    def test_cleared_decrements_counters(self, db, event_loop, biz_id):
        _reset_business(db, event_loop, biz_id)
        from services.strikes import issue_strike, resolve_pending_strike

        async def _run():
            s = await issue_strike(biz_id, reason="no_show_business",
                                   issued_by="test", pending_review=True)
            biz_before = await db.businesses.find_one({"id": biz_id}, {"_id": 0})
            r = await resolve_pending_strike(s["id"], outcome="cleared",
                                             resolved_by="admin:test", reason="cleared test")
            biz_after = await db.businesses.find_one({"id": biz_id}, {"_id": 0})
            return s, r, biz_before, biz_after

        s, resolved, bb, ba = event_loop.run_until_complete(_run())
        assert bb.get("strike_count_30d") == 1
        assert resolved["review_outcome"] == "cleared"
        assert resolved.get("cleared") is True
        # Counters decremented
        assert ba.get("strike_count_30d") == 0
        assert ba.get("strike_count_90d") == 0

    def test_invalid_outcome_raises(self, db, event_loop, biz_id):
        _reset_business(db, event_loop, biz_id)
        from services.strikes import issue_strike, resolve_pending_strike

        async def _run():
            s = await issue_strike(biz_id, reason="no_show_business",
                                   issued_by="test", pending_review=True)
            with pytest.raises(ValueError):
                await resolve_pending_strike(s["id"], outcome="bogus",
                                             resolved_by="admin:test")
        event_loop.run_until_complete(_run())

    def test_non_pending_strike_raises(self, db, event_loop, biz_id):
        _reset_business(db, event_loop, biz_id)
        from services.strikes import issue_strike, resolve_pending_strike

        async def _run():
            s = await issue_strike(biz_id, reason="regular_cancellation",
                                   issued_by="test", pending_review=False)
            with pytest.raises(ValueError):
                await resolve_pending_strike(s["id"], outcome="upheld",
                                             resolved_by="admin:test")
        event_loop.run_until_complete(_run())


# ===================== ENDPOINT: /bookings/{id}/no-show-business =====================
class TestNoShowBusinessEndpoint:

    def test_client_creates_report_ok(self, db, event_loop, biz_id, user_id, user_token):
        _reset_business(db, event_loop, biz_id)
        booking_id, tx_id = _make_booking_and_tx(db, event_loop, biz_id, user_id, minutes_ago=30)
        r = requests.post(
            f"{API}/bookings/{booking_id}/no-show-business",
            headers={"Authorization": f"Bearer {user_token}"},
            json={"description": "El negocio estaba cerrado", "photo_url": ""},
        )
        assert r.status_code == 200, f"Expected 200 got {r.status_code}: {r.text}"
        data = r.json()
        assert "auto_resolve_at" in data
        assert "strike_id" in data

        async def _check():
            bk = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
            tx = await db.transactions.find_one({"id": tx_id}, {"_id": 0})
            strike = await db.business_strikes.find_one({"id": data["strike_id"]}, {"_id": 0})
            return bk, tx, strike

        bk, tx, strike = event_loop.run_until_complete(_check())
        assert bk["no_show_report"]["resolved"] is False
        assert bk["no_show_report"]["business_response"] is None
        assert bk["no_show_report"]["strike_id"] == data["strike_id"]
        # transaction funds_state moved to disputed
        assert tx["funds_state"] == "disputed"
        # Strike is in pending_review with severity MINOR (first severe strike) but no penalty applied yet
        assert strike["pending_review"] is True
        assert strike["severity"] == "minor"
        assert strike["financial_penalty_mxn"] == 0.0

    def test_window_too_early(self, db, event_loop, biz_id, user_id, user_token):
        _reset_business(db, event_loop, biz_id)
        # 2 hours BEFORE appointment -> not allowed (must be within 30 min prior)
        booking_id, _ = _make_booking_and_tx(db, event_loop, biz_id, user_id, minutes_ago=-120)
        r = requests.post(
            f"{API}/bookings/{booking_id}/no-show-business",
            headers={"Authorization": f"Bearer {user_token}"}, json={"description": "x"},
        )
        assert r.status_code == 400

    def test_window_too_late(self, db, event_loop, biz_id, user_id, user_token):
        _reset_business(db, event_loop, biz_id)
        # 5 hours AFTER appointment -> too late
        booking_id, _ = _make_booking_and_tx(db, event_loop, biz_id, user_id, minutes_ago=300)
        r = requests.post(
            f"{API}/bookings/{booking_id}/no-show-business",
            headers={"Authorization": f"Bearer {user_token}"}, json={"description": "x"},
        )
        assert r.status_code == 400

    def test_30min_before_allowed(self, db, event_loop, biz_id, user_id, user_token):
        _reset_business(db, event_loop, biz_id)
        # 25 min BEFORE appointment (minutes_ago=-25 -> inside -30 min window)
        booking_id, _ = _make_booking_and_tx(db, event_loop, biz_id, user_id, minutes_ago=-25)
        r = requests.post(
            f"{API}/bookings/{booking_id}/no-show-business",
            headers={"Authorization": f"Bearer {user_token}"},
            json={"description": "El local esta cerrado"},
        )
        assert r.status_code == 200, r.text

    def test_duplicate_report(self, db, event_loop, biz_id, user_id, user_token):
        _reset_business(db, event_loop, biz_id)
        booking_id, _ = _make_booking_and_tx(db, event_loop, biz_id, user_id, minutes_ago=30)
        r1 = requests.post(
            f"{API}/bookings/{booking_id}/no-show-business",
            headers={"Authorization": f"Bearer {user_token}"}, json={"description": "a"},
        )
        assert r1.status_code == 200
        r2 = requests.post(
            f"{API}/bookings/{booking_id}/no-show-business",
            headers={"Authorization": f"Bearer {user_token}"}, json={"description": "a"},
        )
        assert r2.status_code == 400

    def test_without_payment(self, db, event_loop, biz_id, user_id, user_token):
        _reset_business(db, event_loop, biz_id)
        booking_id, _ = _make_booking_and_tx(
            db, event_loop, biz_id, user_id, minutes_ago=30, with_transaction=False
        )
        r = requests.post(
            f"{API}/bookings/{booking_id}/no-show-business",
            headers={"Authorization": f"Bearer {user_token}"}, json={"description": "x"},
        )
        assert r.status_code == 400

    def test_booking_of_other_user_forbidden(self, db, event_loop, biz_id, user_token):
        _reset_business(db, event_loop, biz_id)
        # Make booking owned by someone else
        other_uid = f"{TEST_PREFIX}other_user"
        booking_id, _ = _make_booking_and_tx(db, event_loop, biz_id, other_uid, minutes_ago=30)
        r = requests.post(
            f"{API}/bookings/{booking_id}/no-show-business",
            headers={"Authorization": f"Bearer {user_token}"}, json={"description": "x"},
        )
        assert r.status_code == 403


# ===================== ENDPOINT: /bookings/{id}/no-show-response =====================
class TestNoShowResponse:

    def _setup_report(self, db, event_loop, biz_id, user_id, user_token):
        _reset_business(db, event_loop, biz_id)
        booking_id, _ = _make_booking_and_tx(db, event_loop, biz_id, user_id, minutes_ago=30)
        r = requests.post(
            f"{API}/bookings/{booking_id}/no-show-business",
            headers={"Authorization": f"Bearer {user_token}"},
            json={"description": "no atendio"},
        )
        assert r.status_code == 200
        return booking_id, r.json()["strike_id"]

    def test_business_responds_ok(self, db, event_loop, biz_id, user_id, user_token, business_token):
        booking_id, strike_id = self._setup_report(db, event_loop, biz_id, user_id, user_token)
        r = requests.post(
            f"{API}/bookings/{booking_id}/no-show-response",
            headers={"Authorization": f"Bearer {business_token}"},
            json={"description": "Si atendimos al cliente", "evidence_url": "http://x/y.jpg"},
        )
        assert r.status_code == 200, r.text

        async def _check():
            bk = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
            strike = await db.business_strikes.find_one({"id": strike_id}, {"_id": 0})
            return bk, strike
        bk, strike = event_loop.run_until_complete(_check())
        assert bk["no_show_report"]["business_response"]["description"].startswith("Si atendimos")
        # Strike still pending
        assert strike["pending_review"] is True
        assert strike["review_resolved"] is False
        # Strike metadata also got the business response
        assert strike.get("metadata", {}).get("business_response", {}).get("description")

    def test_response_too_short(self, db, event_loop, biz_id, user_id, user_token, business_token):
        booking_id, _ = self._setup_report(db, event_loop, biz_id, user_id, user_token)
        r = requests.post(
            f"{API}/bookings/{booking_id}/no-show-response",
            headers={"Authorization": f"Bearer {business_token}"},
            json={"description": "short"},
        )
        assert r.status_code == 400

    def test_response_twice_rejected(self, db, event_loop, biz_id, user_id, user_token, business_token):
        booking_id, _ = self._setup_report(db, event_loop, biz_id, user_id, user_token)
        r1 = requests.post(
            f"{API}/bookings/{booking_id}/no-show-response",
            headers={"Authorization": f"Bearer {business_token}"},
            json={"description": "Primera respuesta documentada"},
        )
        assert r1.status_code == 200
        r2 = requests.post(
            f"{API}/bookings/{booking_id}/no-show-response",
            headers={"Authorization": f"Bearer {business_token}"},
            json={"description": "Otra respuesta documentada"},
        )
        assert r2.status_code == 400

    def test_response_without_report(self, db, event_loop, biz_id, user_id, business_token):
        _reset_business(db, event_loop, biz_id)
        booking_id, _ = _make_booking_and_tx(db, event_loop, biz_id, user_id, minutes_ago=30)
        r = requests.post(
            f"{API}/bookings/{booking_id}/no-show-response",
            headers={"Authorization": f"Bearer {business_token}"},
            json={"description": "No hay reporte abierto aqui"},
        )
        assert r.status_code == 400


# ===================== _process_no_show_report + process_expired_no_show_reports =====================
class TestAutoResolve:

    def test_auto_resolve_refunds_and_upholds(self, db, event_loop, biz_id, user_id, user_token):
        _reset_business(db, event_loop, biz_id)
        booking_id, tx_id = _make_booking_and_tx(db, event_loop, biz_id, user_id, minutes_ago=30)
        r = requests.post(
            f"{API}/bookings/{booking_id}/no-show-business",
            headers={"Authorization": f"Bearer {user_token}"},
            json={"description": "No atendio"},
        )
        assert r.status_code == 200
        strike_id = r.json()["strike_id"]

        # Backdate auto_resolve_at so the cron picks it up
        async def _expire_and_run():
            past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
            await db.bookings.update_one(
                {"id": booking_id},
                {"$set": {"no_show_report.auto_resolve_at": past}},
            )
            # Snapshot existing wallet txns for this booking (should be zero)
            before = await db.wallet_transactions.count_documents({"booking_id": booking_id})
            from routers.bookings import process_expired_no_show_reports
            resolved = await process_expired_no_show_reports()
            bk = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
            tx = await db.transactions.find_one({"id": tx_id}, {"_id": 0})
            strike = await db.business_strikes.find_one({"id": strike_id}, {"_id": 0})
            wallet_txns = await db.wallet_transactions.find(
                {"booking_id": booking_id}, {"_id": 0}
            ).to_list(10)
            return before, resolved, bk, tx, strike, wallet_txns

        before, resolved, bk, tx, strike, wtxns = event_loop.run_until_complete(_expire_and_run())
        assert before == 0
        assert resolved >= 1
        # Booking cancelled + report resolved
        assert bk["status"] == "cancelled"
        assert bk["no_show_report"]["resolved"] is True
        assert bk["no_show_report"]["outcome"] == "auto_refund"
        # Transaction refunded
        assert tx["status"] == "refund_full"
        assert tx["funds_state"] == "refunded"
        # Strike upheld (no longer pending_review)
        assert strike["review_resolved"] is True
        assert strike["review_outcome"] == "upheld"
        assert strike["pending_review"] is False
        # Two wallet transactions: refund + $50 comp
        assert len(wtxns) == 2
        types = {w["type"] for w in wtxns}
        assert types == {"credit_business_no_show"}
        amounts = sorted([w["amount"] for w in wtxns])
        assert amounts[0] == 50.0  # compensation
        assert amounts[1] == 108.20  # client_paid refund

    def test_skip_when_business_responded(self, db, event_loop, biz_id, user_id,
                                          user_token, business_token):
        _reset_business(db, event_loop, biz_id)
        booking_id, tx_id = _make_booking_and_tx(db, event_loop, biz_id, user_id, minutes_ago=30)
        r = requests.post(
            f"{API}/bookings/{booking_id}/no-show-business",
            headers={"Authorization": f"Bearer {user_token}"},
            json={"description": "No atendio"},
        )
        assert r.status_code == 200
        strike_id = r.json()["strike_id"]
        # Business responds
        rb = requests.post(
            f"{API}/bookings/{booking_id}/no-show-response",
            headers={"Authorization": f"Bearer {business_token}"},
            json={"description": "Aqui mi evidencia del atendido"},
        )
        assert rb.status_code == 200

        async def _run():
            past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
            await db.bookings.update_one(
                {"id": booking_id},
                {"$set": {"no_show_report.auto_resolve_at": past}},
            )
            from routers.bookings import process_expired_no_show_reports
            _ = await process_expired_no_show_reports()
            bk = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
            tx = await db.transactions.find_one({"id": tx_id}, {"_id": 0})
            strike = await db.business_strikes.find_one({"id": strike_id}, {"_id": 0})
            wallet_count = await db.wallet_transactions.count_documents(
                {"booking_id": booking_id}
            )
            return bk, tx, strike, wallet_count

        bk, tx, strike, wc = event_loop.run_until_complete(_run())
        # NOT auto-resolved because business responded
        assert bk["no_show_report"].get("resolved") is False
        assert bk["status"] == "confirmed"
        assert tx["status"] == "paid"
        assert tx["funds_state"] == "disputed"
        assert strike["pending_review"] is True
        assert wc == 0


# ===================== ADMIN ENDPOINTS =====================
class TestAdminNoShowReports:

    def test_list_no_show_reports(self, db, event_loop, biz_id, user_id, user_token, admin_token):
        _reset_business(db, event_loop, biz_id)
        booking_id, _ = _make_booking_and_tx(db, event_loop, biz_id, user_id, minutes_ago=30)
        r = requests.post(
            f"{API}/bookings/{booking_id}/no-show-business",
            headers={"Authorization": f"Bearer {user_token}"},
            json={"description": "no abrio"},
        )
        assert r.status_code == 200

        lr = requests.get(
            f"{API}/admin/no-show-reports",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert lr.status_code == 200, lr.text
        data = lr.json()
        assert "reports" in data and "total" in data
        ids = [rep["booking_id"] for rep in data["reports"]]
        assert booking_id in ids
        for rep in data["reports"]:
            if rep["booking_id"] == booking_id:
                assert rep["business_summary"] is not None
                assert rep["user_summary"] is not None
                assert rep["report"]["strike_id"]

    def test_admin_resolve_favor_client(self, db, event_loop, biz_id, user_id,
                                        user_token, admin_token):
        _reset_business(db, event_loop, biz_id)
        booking_id, tx_id = _make_booking_and_tx(db, event_loop, biz_id, user_id, minutes_ago=30)
        r = requests.post(
            f"{API}/bookings/{booking_id}/no-show-business",
            headers={"Authorization": f"Bearer {user_token}"},
            json={"description": "no abrio"},
        )
        assert r.status_code == 200
        strike_id = r.json()["strike_id"]

        rr = requests.post(
            f"{API}/admin/no-show-reports/{booking_id}/resolve",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"outcome": "favor_client", "reason": "Admin test refund"},
        )
        assert rr.status_code == 200, rr.text

        async def _check():
            bk = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
            tx = await db.transactions.find_one({"id": tx_id}, {"_id": 0})
            strike = await db.business_strikes.find_one({"id": strike_id}, {"_id": 0})
            wts = await db.wallet_transactions.find(
                {"booking_id": booking_id}, {"_id": 0}
            ).to_list(10)
            return bk, tx, strike, wts
        bk, tx, strike, wts = event_loop.run_until_complete(_check())
        assert bk["status"] == "cancelled"
        assert bk["no_show_report"]["resolved"] is True
        assert tx["status"] == "refund_full"
        assert tx["funds_state"] == "refunded"
        assert strike["review_outcome"] == "upheld"
        assert len(wts) == 2

    def test_admin_resolve_favor_business(self, db, event_loop, biz_id, user_id,
                                          user_token, admin_token):
        _reset_business(db, event_loop, biz_id)
        booking_id, tx_id = _make_booking_and_tx(db, event_loop, biz_id, user_id, minutes_ago=30)
        r = requests.post(
            f"{API}/bookings/{booking_id}/no-show-business",
            headers={"Authorization": f"Bearer {user_token}"},
            json={"description": "no abrio"},
        )
        assert r.status_code == 200
        strike_id = r.json()["strike_id"]

        rr = requests.post(
            f"{API}/admin/no-show-reports/{booking_id}/resolve",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"outcome": "favor_business", "reason": "Business provided evidence"},
        )
        assert rr.status_code == 200, rr.text

        async def _check():
            bk = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
            tx = await db.transactions.find_one({"id": tx_id}, {"_id": 0})
            strike = await db.business_strikes.find_one({"id": strike_id}, {"_id": 0})
            wts = await db.wallet_transactions.count_documents({"booking_id": booking_id})
            return bk, tx, strike, wts
        bk, tx, strike, wts = event_loop.run_until_complete(_check())
        assert bk["no_show_report"]["resolved"] is True
        assert bk["no_show_report"]["outcome"] == "cleared"
        # No booking cancellation
        assert bk["status"] != "cancelled"
        # No refund, funds restored available
        assert tx["status"] == "paid"
        assert tx["funds_state"] == "available"
        # Strike cleared
        assert strike["review_outcome"] == "cleared"
        assert strike.get("cleared") is True
        # No wallet credits
        assert wts == 0

    def test_admin_resolve_invalid_outcome(self, db, event_loop, biz_id, user_id,
                                           user_token, admin_token):
        _reset_business(db, event_loop, biz_id)
        booking_id, _ = _make_booking_and_tx(db, event_loop, biz_id, user_id, minutes_ago=30)
        r = requests.post(
            f"{API}/bookings/{booking_id}/no-show-business",
            headers={"Authorization": f"Bearer {user_token}"},
            json={"description": "no abrio"},
        )
        assert r.status_code == 200
        rr = requests.post(
            f"{API}/admin/no-show-reports/{booking_id}/resolve",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"outcome": "bogus"},
        )
        assert rr.status_code == 400
