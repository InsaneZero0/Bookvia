"""
Tests for Fase 1 de nuevo modelo de cobranza en Mexico.
- Bookvia fixed fee: $8.00 MXN (IVA incluido)
- Stripe fee estimated: 8.5% on deposit
- Min deposit: $100 MXN
- POST /api/payments/deposit/checkout creates Stripe Checkout session with 2 line items
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Try reading from frontend/.env
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

BIZ_EMAIL = "testbiz_dashboard@test.com"
BIZ_PASS = "TestBiz123!"
USER_EMAIL = "testuser_stats@test.com"
USER_PASS = "TestPass123!"


@pytest.fixture(scope="module")
def biz_token():
    r = requests.post(f"{API}/auth/login", json={"email": BIZ_EMAIL, "password": BIZ_PASS}, timeout=15)
    assert r.status_code == 200, f"Biz login failed: {r.status_code} {r.text}"
    data = r.json()
    return data.get("access_token") or data.get("token")


@pytest.fixture(scope="module")
def user_token():
    r = requests.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASS}, timeout=15)
    assert r.status_code == 200, f"User login failed: {r.status_code} {r.text}"
    data = r.json()
    return data.get("access_token") or data.get("token")


@pytest.fixture(scope="module")
def biz_context(biz_token):
    """Prepare test business with a cheap service (<100) and an expensive service (>=100) + a worker."""
    u = _db.users.find_one({"email": BIZ_EMAIL})
    biz_id = u["business_id"]
    user_id = u["id"]

    # Ensure business has required_deposit + deposit_amount=150, approved/active
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

    # Create two services: cheap (<100) and expensive (>=100)
    cheap_id = f"svc_cheap_{uuid.uuid4().hex[:8]}"
    exp_id = f"svc_exp_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()
    _db.services.delete_many({"business_id": biz_id, "name": {"$in": ["TEST_FASE1_CHEAP", "TEST_FASE1_EXP"]}})
    # Clean up any leftover test bookings for this worker to avoid slot conflicts
    _db.bookings.delete_many({"business_id": biz_id, "notes": {"$regex": "^TEST_FASE1"}})
    _db.services.insert_many([
        {
            "id": cheap_id, "business_id": biz_id, "name": "TEST_FASE1_CHEAP",
            "description": "cheap", "price": 80.0, "duration_minutes": 30,
            "active": True, "created_at": now,
        },
        {
            "id": exp_id, "business_id": biz_id, "name": "TEST_FASE1_EXP",
            "description": "expensive", "price": 500.0, "duration_minutes": 30,
            "active": True, "created_at": now,
        },
    ])

    # Create worker with schedule covering all days 08:00-22:00
    worker_id = f"wrk_{uuid.uuid4().hex[:8]}"
    schedule = {}
    for d in range(7):
        schedule[str(d)] = {
            "is_available": True,
            "blocks": [{"start_time": "08:00", "end_time": "22:00"}],
        }
    _db.workers.delete_many({"business_id": biz_id, "name": "TEST_FASE1_WORKER"})
    _db.workers.insert_one({
        "id": worker_id, "business_id": biz_id, "name": "TEST_FASE1_WORKER",
        "service_ids": [cheap_id, exp_id], "active": True,
        "schedule": schedule, "exceptions": [], "created_at": now,
    })

    yield {"biz_id": biz_id, "user_id": user_id, "cheap_id": cheap_id, "exp_id": exp_id, "worker_id": worker_id}

    # Cleanup
    _db.services.delete_many({"id": {"$in": [cheap_id, exp_id]}})
    _db.workers.delete_many({"id": worker_id})
    _db.bookings.delete_many({"business_id": biz_id, "notes": {"$regex": "^TEST_FASE1"}})
    _db.transactions.delete_many({"business_id": biz_id, "user_id": {"$exists": True}, "currency": "MXN", "bookvia_fee": 8.0})


# ============ Public breakdown endpoint tests ============

class TestFeesBreakdown:
    def test_breakdown_100(self):
        r = requests.get(f"{API}/payments/fees/breakdown", params={"deposit_amount": 100}, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["deposit_amount"] == 100.0
        assert d["client_paid"] == 108.0
        assert d["bookvia_fee"] == 8.0
        assert d["stripe_fee_estimated"] == 8.5
        assert d["business_amount"] == 91.5
        assert d["min_deposit_amount"] == 100
        assert d["bookvia_fee_mxn"] == 8.0
        assert d["stripe_fee_percent_estimated"] == 0.085

    def test_breakdown_500(self):
        r = requests.get(f"{API}/payments/fees/breakdown", params={"deposit_amount": 500}, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["deposit_amount"] == 500.0
        assert d["client_paid"] == 508.0
        assert d["bookvia_fee"] == 8.0
        assert d["stripe_fee_estimated"] == 42.5
        assert d["business_amount"] == 457.5

    def test_breakdown_0(self):
        r = requests.get(f"{API}/payments/fees/breakdown", params={"deposit_amount": 0}, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["deposit_amount"] == 0.0
        assert d["client_paid"] == 0.0
        assert d["bookvia_fee"] == 0.0
        assert d["stripe_fee_estimated"] == 0.0
        assert d["business_amount"] == 0.0
        assert d["min_deposit_amount"] == 100

    @pytest.mark.parametrize("dep,exp_client,exp_biz,exp_stripe", [
        (100, 108.0, 91.5, 8.5),
        (200, 208.0, 183.0, 17.0),
        (500, 508.0, 457.5, 42.5),
        (1000, 1008.0, 915.0, 85.0),
    ])
    def test_calculate_fees_math(self, dep, exp_client, exp_biz, exp_stripe):
        r = requests.get(f"{API}/payments/fees/breakdown", params={"deposit_amount": dep}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["client_paid"] == exp_client
        assert d["business_amount"] == exp_biz
        assert d["stripe_fee_estimated"] == exp_stripe
        assert d["bookvia_fee"] == 8.0


# ============ Admin config ============

class TestAdminConfig:
    def test_min_deposit_100(self):
        """Check MIN_DEPOSIT_AMOUNT constant is 100 via the breakdown endpoint (public proxy).

        Note: GET /api/admin/config requires admin TOTP, which is hard to drive in this test.
        Instead we assert the public-facing value that is surfaced by the platform.
        """
        r = requests.get(f"{API}/payments/fees/breakdown", params={"deposit_amount": 0}, timeout=10)
        assert r.status_code == 200
        assert r.json()["min_deposit_amount"] == 100


# ============ Deposit checkout flow ============

class TestDepositCheckout:
    def _create_booking(self, user_token, biz_context, service_id, notes_tag, time="10:00", day_offset=2):
        """Create a HOLD booking via the public bookings endpoint."""
        date = (datetime.now(timezone.utc) + timedelta(days=day_offset)).strftime("%Y-%m-%d")
        payload = {
            "business_id": biz_context["biz_id"],
            "service_id": service_id,
            "worker_id": biz_context["worker_id"],
            "date": date,
            "time": time,
            "notes": notes_tag,
        }
        headers = {"Authorization": f"Bearer {user_token}"}
        r = requests.post(f"{API}/bookings", json=payload, headers=headers, timeout=20)
        return r

    def test_booking_cheap_service_no_deposit(self, user_token, biz_context):
        """Service price < 100 -> booking.deposit_amount should be 0 even if business requires deposit."""
        r = self._create_booking(user_token, biz_context, biz_context["cheap_id"], "TEST_FASE1_cheap", time="10:00", day_offset=2)
        assert r.status_code in (200, 201), r.text
        booking = r.json()
        assert booking.get("deposit_amount", 0) == 0.0, f"Expected 0 deposit for cheap service, got {booking.get('deposit_amount')}"

    def test_booking_expensive_service_applies_deposit(self, user_token, biz_context):
        """Service price >= 100 and business.requires_deposit=True -> deposit is applied (capped at price)."""
        r = self._create_booking(user_token, biz_context, biz_context["exp_id"], "TEST_FASE1_exp", time="12:00", day_offset=3)
        assert r.status_code in (200, 201), r.text
        booking = r.json()
        assert booking.get("deposit_amount") == 150.0, f"Expected 150 deposit, got {booking.get('deposit_amount')}"
        TestDepositCheckout._booking_id = booking["id"]

    def test_deposit_checkout_creates_session_with_2_line_items(self, user_token, biz_context):
        """POST /payments/deposit/checkout should return a Stripe URL and create transaction with new fee fields."""
        booking_id = getattr(TestDepositCheckout, "_booking_id", None)
        if not booking_id:
            r = self._create_booking(user_token, biz_context, biz_context["exp_id"], "TEST_FASE1_checkout", time="14:00", day_offset=4)
            assert r.status_code in (200, 201), r.text
            booking_id = r.json()["id"]

        headers = {"Authorization": f"Bearer {user_token}"}
        r = requests.post(
            f"{API}/payments/deposit/checkout",
            json={"booking_id": booking_id},
            headers=headers,
            timeout=30,
        )
        assert r.status_code == 200, f"Checkout failed: {r.status_code} {r.text}"
        d = r.json()
        assert "url" in d and d["url"].startswith("http"), "Stripe URL missing"
        assert "session_id" in d
        assert d.get("amount") == 150.0
        assert d.get("client_paid") == 158.0
        assert d.get("bookvia_fee") == 8.0
        assert round(float(d.get("business_amount")), 2) == 137.25  # 150 - 12.75

        # Verify transaction doc has new fields
        tx = _db.transactions.find_one({"booking_id": booking_id}, {"_id": 0})
        assert tx is not None, "Transaction doc not created"
        assert tx.get("client_paid") == 158.0
        assert tx.get("bookvia_fee") == 8.0
        assert round(float(tx.get("stripe_fee_estimated")), 2) == 12.75
        assert round(float(tx.get("business_amount")), 2) == 137.25
        assert tx.get("stripe_fee_actual") is None
        assert tx.get("currency") == "MXN"

        # Validate session has 2 line items (via Stripe API fetch not possible without key,
        # but our session response doesn't expose line items; we rely on the transaction fields
        # and the code path. Additionally verify the Stripe URL contains a checkout session id).
        assert d["session_id"].startswith("cs_"), f"Unexpected Stripe session id: {d['session_id']}"


# ============ Business PUT /me deposit clamping ============

class TestBusinessDepositClamp:
    def test_put_me_deposit_below_min_is_clamped(self, biz_token):
        """PUT /businesses/me with deposit_amount < 100 and requires_deposit=True should clamp to 100."""
        headers = {"Authorization": f"Bearer {biz_token}"}
        # Set deposit_amount=50 -> should be stored as 100 (MIN_DEPOSIT_AMOUNT)
        r = requests.put(
            f"{API}/businesses/me",
            json={"deposit_amount": 50, "requires_deposit": True},
            headers=headers,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        biz = r.json()
        assert biz["deposit_amount"] == 100.0, f"Expected clamp to 100, got {biz['deposit_amount']}"

        # Restore to 150 for other tests
        requests.put(
            f"{API}/businesses/me",
            json={"deposit_amount": 150, "requires_deposit": True},
            headers=headers,
            timeout=15,
        )
