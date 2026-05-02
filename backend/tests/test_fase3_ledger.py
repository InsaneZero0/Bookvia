"""
Fase 3 Ledger States - funds_state service + API endpoints.

Tests:
  - funds_state state machine transitions (valid + invalid)
  - initialize / mark_appointment_completed / clear_now / mark_disputed
  - auto_clear_after_grace / auto_complete_appointments / get_state_summary
  - Booking endpoints (complete, cancel user/business, dispute)
  - Finance endpoint (GET /business/finance/funds-state)
  - Admin dispute endpoints (GET /admin/disputes, POST resolve)
"""
import os
import sys
import asyncio
import subprocess
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests

sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://marketplace-test-21.preview.emergentagent.com").rstrip("/")

# ---- Load backend env so direct DB imports work ----
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

from core.database import db  # noqa: E402
from services import funds_state as fs  # noqa: E402
from models.enums import FundsState, TransactionStatus, AppointmentStatus  # noqa: E402


# =============================================================================
# Helpers / Fixtures
# =============================================================================

def _now_iso():
    return datetime.now(timezone.utc).isoformat()


async def _mk_tx(state=None, business_id="BIZ_FASE3", amount=100.0, booking_id=None):
    tx_id = f"TEST_TX_{uuid.uuid4().hex[:8]}"
    doc = {
        "id": tx_id,
        "business_id": business_id,
        "user_id": "TEST_USER",
        "booking_id": booking_id or f"TEST_BK_{uuid.uuid4().hex[:8]}",
        "status": TransactionStatus.PAID,
        "business_amount": amount,
        "amount_total": amount,
        "client_paid": amount,
        "funds_state": state,
        "funds_state_history": [],
        "created_at": _now_iso(),
    }
    await db.transactions.insert_one(doc)
    return tx_id


async def _mk_booking(business_id="BIZ_FASE3", status=AppointmentStatus.CONFIRMED,
                      appt_date=None, deposit_paid=True):
    bk_id = f"TEST_BK_{uuid.uuid4().hex[:8]}"
    doc = {
        "id": bk_id,
        "business_id": business_id,
        "user_id": "TEST_USER",
        "status": status,
        "appointment_date": appt_date or _now_iso(),
        "deposit_paid": deposit_paid,
        "created_at": _now_iso(),
    }
    await db.bookings.insert_one(doc)
    return bk_id


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


def _final_cleanup():
    """Sync cleanup using pymongo to avoid motor loop issues."""
    try:
        from pymongo import MongoClient
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "test_database")
        client = MongoClient(mongo_url)
        client[db_name].transactions.delete_many({"id": {"$regex": "^TEST_TX_"}})
        client[db_name].bookings.delete_many({"id": {"$regex": "^TEST_BK_"}})
        client.close()
    except Exception:
        pass


@pytest.fixture(autouse=True, scope="session")
def _cleanup():
    yield
    _final_cleanup()


def run_async(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# =============================================================================
# 1. State machine transition rules
# =============================================================================

class TestTransitions:
    def test_initialize_sets_pending_hold(self):
        async def _t():
            tx_id = await _mk_tx(state=None)
            res = await fs.initialize(tx_id)
            assert res["funds_state"] == FundsState.PENDING_HOLD.value
            assert len(res["funds_state_history"]) == 1
            assert res["funds_state_history"][0]["to"] == "pending_hold"
        run_async(_t())

    def test_pending_hold_to_available(self):
        async def _t():
            tx_id = await _mk_tx(state="pending_hold")
            res = await fs.mark_appointment_completed(tx_id)
            assert res["funds_state"] == "available"
            assert res.get("funds_available_at")
            assert res.get("funds_clears_at")
            # Verify clears_at = available_at + 24h (approx)
            cl = datetime.fromisoformat(res["funds_clears_at"])
            av = datetime.fromisoformat(res["funds_available_at"])
            delta = (cl - av).total_seconds() / 3600
            assert 23.9 < delta < 24.1
        run_async(_t())

    def test_available_to_cleared(self):
        async def _t():
            tx_id = await _mk_tx(state="available")
            res = await fs.clear_now(tx_id)
            assert res["funds_state"] == "cleared"
            assert res.get("funds_cleared_at")
        run_async(_t())

    def test_available_to_disputed(self):
        async def _t():
            tx_id = await _mk_tx(state="available")
            res = await fs.mark_disputed(tx_id)
            assert res["funds_state"] == "disputed"
            assert res.get("funds_disputed_at")
        run_async(_t())

    def test_disputed_to_cleared_and_refunded(self):
        async def _t():
            tx_id = await _mk_tx(state="disputed")
            res = await fs.transition(tx_id, "cleared", actor="admin")
            assert res["funds_state"] == "cleared"

            tx_id2 = await _mk_tx(state="disputed")
            res2 = await fs.mark_refunded(tx_id2)
            assert res2["funds_state"] == "refunded"
        run_async(_t())

    def test_cleared_to_paid_out(self):
        async def _t():
            tx_id = await _mk_tx(state="cleared")
            res = await fs.transition(tx_id, "paid_out", actor="system")
            assert res["funds_state"] == "paid_out"
            assert res.get("funds_paid_out_at")
        run_async(_t())

    def test_refunded_is_terminal(self):
        async def _t():
            tx_id = await _mk_tx(state="refunded")
            with pytest.raises(ValueError):
                await fs.transition(tx_id, "cleared")
        run_async(_t())

    def test_paid_out_is_terminal(self):
        async def _t():
            tx_id = await _mk_tx(state="paid_out")
            with pytest.raises(ValueError):
                await fs.transition(tx_id, "refunded")
        run_async(_t())

    def test_invalid_transition_pending_to_cleared_raises(self):
        async def _t():
            tx_id = await _mk_tx(state="pending_hold")
            with pytest.raises(ValueError):
                await fs.transition(tx_id, "cleared")
        run_async(_t())

    def test_history_entry_appended(self):
        async def _t():
            tx_id = await _mk_tx(state="pending_hold")
            await fs.mark_appointment_completed(tx_id, actor="business", reason="done")
            tx = await db.transactions.find_one({"id": tx_id}, {"_id": 0})
            h = tx["funds_state_history"]
            assert len(h) == 1
            e = h[0]
            assert set(e.keys()) >= {"from", "to", "actor", "reason", "at"}
            assert e["from"] == "pending_hold"
            assert e["to"] == "available"
            assert e["actor"] == "business"
            assert e["reason"] == "done"
        run_async(_t())


# =============================================================================
# 2. Cron / aggregation services
# =============================================================================

class TestCronAndSummary:
    def test_auto_clear_after_grace(self):
        async def _t():
            past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
            future = (datetime.now(timezone.utc) + timedelta(hours=5)).isoformat()
            tx_past = await _mk_tx(state="available")
            tx_future = await _mk_tx(state="available")
            await db.transactions.update_one({"id": tx_past}, {"$set": {"funds_clears_at": past}})
            await db.transactions.update_one({"id": tx_future}, {"$set": {"funds_clears_at": future}})

            cleared = await fs.auto_clear_after_grace()
            assert cleared >= 1

            d1 = await db.transactions.find_one({"id": tx_past}, {"_id": 0})
            d2 = await db.transactions.find_one({"id": tx_future}, {"_id": 0})
            assert d1["funds_state"] == "cleared"
            assert d2["funds_state"] == "available"
        run_async(_t())

    def test_auto_complete_appointments(self):
        async def _t():
            past50 = (datetime.now(timezone.utc) - timedelta(hours=50)).isoformat()
            bk_id = await _mk_booking(appt_date=past50, status=AppointmentStatus.CONFIRMED)
            tx_id = await _mk_tx(state="pending_hold", booking_id=bk_id)

            count = await fs.auto_complete_appointments()
            assert count >= 1

            bk = await db.bookings.find_one({"id": bk_id}, {"_id": 0})
            tx = await db.transactions.find_one({"id": tx_id}, {"_id": 0})
            assert bk["status"] == AppointmentStatus.COMPLETED
            assert bk.get("completed_by") == "system_auto"
            assert tx["funds_state"] == "available"
        run_async(_t())

    def test_get_state_summary(self):
        async def _t():
            bid = f"BIZ_SUM_{uuid.uuid4().hex[:6]}"
            await _mk_tx(state="pending_hold", business_id=bid, amount=100.0)
            await _mk_tx(state="pending_hold", business_id=bid, amount=50.0)
            await _mk_tx(state="available", business_id=bid, amount=30.0)
            await _mk_tx(state="cleared", business_id=bid, amount=70.0)
            await _mk_tx(state="disputed", business_id=bid, amount=20.0)

            s = await fs.get_state_summary(bid)
            assert s["business_id"] == bid
            assert s["by_state"]["pending_hold"]["count"] == 2
            assert abs(s["by_state"]["pending_hold"]["total"] - 150.0) < 0.01
            assert s["in_hold"] == s["by_state"]["pending_hold"]["total"]
            assert s["in_grace"] == 30.0
            assert s["pending_payout"] == 70.0
            assert s["disputed"] == 20.0
        run_async(_t())


# =============================================================================
# 3. API Endpoint tests (HTTP)
# =============================================================================

BIZ_EMAIL = "testbiz_dashboard@test.com"
BIZ_PASS = "TestBiz123!"
USER_EMAIL = "testuser_stats@test.com"
USER_PASS = "TestPass123!"
ADMIN_EMAIL = "zamorachapa50@gmail.com"
ADMIN_PASS = "RainbowLol3133!"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    if r.status_code != 200:
        return None
    return r.json().get("access_token") or r.json().get("token")


def _admin_totp():
    try:
        out = subprocess.check_output(["python3", "/app/scripts/get_admin_totp.py"], timeout=10).decode().strip()
        # Could output multiple lines - take 6-digit code
        for line in out.splitlines():
            line = line.strip()
            if line.isdigit() and len(line) == 6:
                return line
        return out
    except Exception:
        return None


def _admin_login():
    code = _admin_totp()
    if not code:
        return None
    r = requests.post(
        f"{BASE_URL}/api/auth/admin/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS, "totp_code": code},
        timeout=15,
    )
    if r.status_code != 200:
        return None
    return r.json().get("access_token") or r.json().get("token")


class TestAPIEndpoints:
    def test_finance_funds_state_endpoint(self):
        tok = _login(BIZ_EMAIL, BIZ_PASS)
        if not tok:
            pytest.skip("Business login failed")
        r = requests.get(f"{BASE_URL}/api/business/finance/funds-state",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["by_state", "pending_payout", "in_grace", "in_hold", "disputed", "recent_by_state"]:
            assert k in d, f"missing {k}"
        for s in ["pending_hold", "available", "cleared", "disputed", "refunded", "paid_out"]:
            assert s in d["by_state"]
            assert s in d["recent_by_state"]

    def test_dispute_booking_flow(self):
        """Create a paid-completed booking directly, then dispute via API."""
        user_tok = _login(USER_EMAIL, USER_PASS)
        if not user_tok:
            pytest.skip("User login failed")

        async def _setup():
            # Find user_id
            user = await db.users.find_one({"email": USER_EMAIL})
            if not user:
                return None, None
            bk_id = f"TEST_BK_{uuid.uuid4().hex[:8]}"
            await db.bookings.insert_one({
                "id": bk_id,
                "user_id": user["id"],
                "business_id": "BIZ_FASE3_API",
                "status": AppointmentStatus.COMPLETED,
                "appointment_date": _now_iso(),
                "deposit_paid": True,
                "created_at": _now_iso(),
            })
            tx_id = await _mk_tx(state="available", business_id="BIZ_FASE3_API", booking_id=bk_id)
            # Patch tx user_id
            await db.transactions.update_one({"id": tx_id}, {"$set": {"user_id": user["id"]}})
            return bk_id, tx_id

        bk_id, tx_id = run_async(_setup())
        if not bk_id:
            pytest.skip("Could not create seed booking (no user row)")

        # Dispute with empty reason (should accept with default)
        r = requests.post(
            f"{BASE_URL}/api/bookings/{bk_id}/dispute",
            json={"reason": ""},
            headers={"Authorization": f"Bearer {user_tok}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("funds_state") == "disputed"

        # Verify persisted
        async def _verify():
            tx = await db.transactions.find_one({"id": tx_id}, {"_id": 0})
            bk = await db.bookings.find_one({"id": bk_id}, {"_id": 0})
            return tx, bk
        tx, bk = run_async(_verify())
        assert tx["funds_state"] == "disputed"
        assert bk["has_dispute"] is True
        assert bk.get("dispute_reason")

        # Disputing again should 400 (terminal-ish state)
        r2 = requests.post(
            f"{BASE_URL}/api/bookings/{bk_id}/dispute",
            json={"reason": "again"},
            headers={"Authorization": f"Bearer {user_tok}"},
            timeout=15,
        )
        assert r2.status_code == 400

    def test_admin_disputes_and_resolve(self):
        admin_tok = _admin_login()
        if not admin_tok:
            pytest.skip("Admin login failed - possibly TOTP issue")

        # List
        r = requests.get(f"{BASE_URL}/api/admin/disputes",
                         headers={"Authorization": f"Bearer {admin_tok}"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "disputes" in data and "total" in data

        # Create disputed tx and resolve in favor of business
        async def _seed():
            tx_id = await _mk_tx(state="disputed", business_id="BIZ_ADMIN_RESOLVE")
            return tx_id
        tx_id = run_async(_seed())

        r_ok = requests.post(
            f"{BASE_URL}/api/admin/disputes/{tx_id}/resolve",
            json={"outcome": "favor_business", "reason": "no merit"},
            headers={"Authorization": f"Bearer {admin_tok}"},
            timeout=15,
        )
        assert r_ok.status_code == 200, r_ok.text

        async def _check():
            return await db.transactions.find_one({"id": tx_id}, {"_id": 0})
        tx = run_async(_check())
        assert tx["funds_state"] == "cleared"

        # Invalid outcome
        tx2_id = run_async(_mk_tx(state="disputed", business_id="BIZ_ADMIN_RESOLVE"))
        r_bad = requests.post(
            f"{BASE_URL}/api/admin/disputes/{tx2_id}/resolve",
            json={"outcome": "nonsense"},
            headers={"Authorization": f"Bearer {admin_tok}"},
            timeout=15,
        )
        assert r_bad.status_code == 400

        # favor_client
        tx3_id = run_async(_mk_tx(state="disputed", business_id="BIZ_ADMIN_RESOLVE"))
        r_cli = requests.post(
            f"{BASE_URL}/api/admin/disputes/{tx3_id}/resolve",
            json={"outcome": "favor_client", "reason": "valid"},
            headers={"Authorization": f"Bearer {admin_tok}"},
            timeout=15,
        )
        assert r_cli.status_code == 200
        tx3 = run_async(_check.__wrapped__() if hasattr(_check, "__wrapped__") else db.transactions.find_one({"id": tx3_id}, {"_id": 0}))
        # Fallback
        tx3 = run_async(db.transactions.find_one({"id": tx3_id}, {"_id": 0}))
        assert tx3["funds_state"] == "refunded"
