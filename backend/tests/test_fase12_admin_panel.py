"""
Phase 12 Admin Panel Coverage Tests
Validates the 7 new admin endpoints introduced for ops gaps:
- GET  /admin/platform/pnl
- POST /admin/platform/reconcile-stripe
- GET  /admin/platform/reconciliation-issues
- GET  /admin/security/locked-accounts
- POST /admin/security/unlock
- GET  /admin/terms/stats
- GET  /admin/terms/pending-users
- GET  /admin/compliance/arco-events
- GET  /admin/finance/refunds
- GET  /admin/stripe/webhook-events

Pre-existing admin endpoints (regression):
- GET  /admin/stats
- GET  /admin/businesses/all
- GET  /admin/settlements
"""
import os
import time
import asyncio
import pyotp
import pytest
import requests
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env", override=False)

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "zamorachapa50@gmail.com"
ADMIN_PASSWORD = "RainbowLol3133!"
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "bookvia")


# ------------------------------ helpers ------------------------------

async def _get_totp():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    admin = await db.users.find_one({"email": ADMIN_EMAIL}, {"_id": 0, "totp_secret": 1})
    client.close()
    return pyotp.TOTP(admin["totp_secret"]).now() if admin and admin.get("totp_secret") else None


def _admin_login_with_retry(max_retries=4):
    """Admin /login is rate-limited. Backoff on 429."""
    last = None
    for i in range(max_retries):
        totp = asyncio.get_event_loop().run_until_complete(_get_totp())
        r = requests.post(
            f"{BASE_URL}/api/auth/admin/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "totp_code": totp},
            timeout=15,
        )
        last = r
        if r.status_code == 200:
            j = r.json()
            return j.get("access_token") or j.get("token")
        if r.status_code == 429:
            time.sleep(15)
            continue
        break
    pytest.skip(f"Admin login unavailable: {last.status_code if last else 'no response'} {last.text if last else ''}")


# ------------------------------ fixtures ------------------------------

@pytest.fixture(scope="session")
def admin_token():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not set")
    return _admin_login_with_retry()


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ------------------------------ AUTH GATE ------------------------------

class TestAuthGate:
    """Every new endpoint must reject unauthenticated callers."""
    @pytest.mark.parametrize("method,path", [
        ("GET",  "/api/admin/platform/pnl"),
        ("POST", "/api/admin/platform/reconcile-stripe"),
        ("GET",  "/api/admin/platform/reconciliation-issues"),
        ("GET",  "/api/admin/security/locked-accounts"),
        ("POST", "/api/admin/security/unlock"),
        ("GET",  "/api/admin/terms/stats"),
        ("GET",  "/api/admin/terms/pending-users"),
        ("GET",  "/api/admin/compliance/arco-events"),
        ("GET",  "/api/admin/finance/refunds"),
        ("GET",  "/api/admin/stripe/webhook-events"),
    ])
    def test_no_token_rejected(self, method, path):
        r = requests.request(method, f"{BASE_URL}{path}", json={}, timeout=10)
        assert r.status_code in (401, 403), f"{method} {path} -> {r.status_code} {r.text[:200]}"


# ------------------------------ P&L ------------------------------

class TestPlatformPnl:
    def test_pnl_default(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/platform/pnl", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("gross_income_bookvia", "bookvia_fee_income", "fee_margin",
                  "refund_amount_total", "coverage_pct"):
            assert k in data, f"missing key {k} in {list(data.keys())}"

    def test_pnl_days_param(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/platform/pnl?days=7",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data.get("gross_income_bookvia"), (int, float))


# ----------------------- RECONCILIATION -----------------------

class TestReconciliation:
    def test_reconciliation_issues_shape(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/platform/reconciliation-issues?limit=10",
                         headers=admin_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and "count" in data
        assert isinstance(data["items"], list)

    def test_reconcile_stripe_bad_date(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/platform/reconcile-stripe?date=not-a-date",
                          headers=admin_headers, timeout=20)
        assert r.status_code == 400
        assert "YYYY-MM-DD" in r.text

    def test_reconcile_stripe_ok_or_graceful_fail(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/platform/reconcile-stripe",
                          headers=admin_headers, timeout=30)
        # Service is designed to return 200 with ok:true|false (no 5xx leak)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "ok" in data


# ----------------------- SECURITY (lockouts) -----------------------

class TestSecurityLockouts:
    """Insert a synthetic lockout doc, list it, then unlock via API."""
    LOCKOUT_KEY = "TEST_F12B_1.2.3.4|brute_target@test.com"

    @pytest.fixture(autouse=True)
    def _seed_and_clean(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        client = AsyncIOMotorClient(MONGO_URL, io_loop=loop)
        db = client[DB_NAME]
        future = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
        loop.run_until_complete(db.brute_force_attempts.delete_many({"_id": self.LOCKOUT_KEY}))
        loop.run_until_complete(db.brute_force_attempts.insert_one({
            "_id": self.LOCKOUT_KEY,
            "ip": "1.2.3.4",
            "email": "brute_target@test.com",
            "attempts": [datetime.now(timezone.utc).isoformat()] * 10,
            "last_at": datetime.now(timezone.utc).isoformat(),
            "locked_until": future,
        }))
        yield
        loop.run_until_complete(db.brute_force_attempts.delete_many({"_id": self.LOCKOUT_KEY}))
        loop.run_until_complete(
            db.audit_logs.delete_many({"target_id": self.LOCKOUT_KEY})
        )
        client.close()
        loop.close()

    def test_locked_accounts_lists_seeded(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/security/locked-accounts",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data and "count" in data
        keys = [it["key"] for it in data["items"]]
        assert self.LOCKOUT_KEY in keys, f"seeded key not present in {keys[:5]}..."
        item = next(it for it in data["items"] if it["key"] == self.LOCKOUT_KEY)
        for fld in ("key", "ip", "email", "last_attempt_at", "locked_until"):
            assert fld in item

    def test_unlock_404_for_unknown_key(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/security/unlock",
                          headers=admin_headers, json={"key": "TEST_F12B_DOES_NOT_EXIST"},
                          timeout=15)
        assert r.status_code == 404

    def test_unlock_removes_entry_and_audits(self, admin_headers):
        # 1) DELETE via API
        r = requests.post(f"{BASE_URL}/api/admin/security/unlock",
                          headers=admin_headers, json={"key": self.LOCKOUT_KEY},
                          timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("key") == self.LOCKOUT_KEY

        # 2) verify gone in /locked-accounts
        r2 = requests.get(f"{BASE_URL}/api/admin/security/locked-accounts",
                          headers=admin_headers, timeout=15)
        assert r2.status_code == 200
        keys = [it["key"] for it in r2.json()["items"]]
        assert self.LOCKOUT_KEY not in keys

        # 3) audit log written
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        client = AsyncIOMotorClient(MONGO_URL, io_loop=loop)
        db = client[DB_NAME]
        audit = loop.run_until_complete(db.audit_logs.find_one(
            {"action": "security_unlock", "target_id": self.LOCKOUT_KEY}
        ))
        client.close()
        loop.close()
        assert audit is not None, "audit log row not created on unlock"


# ----------------------- TERMS STATS -----------------------

class TestTermsStats:
    def test_terms_stats_shape(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/terms/stats",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "current_version" in data
        assert "users" in data and "businesses" in data
        for blk in ("users", "businesses"):
            for k in ("total", "accepted_current", "pending", "acceptance_pct"):
                assert k in data[blk], f"{blk}.{k} missing"
        assert "grace_period_ends_at" in data
        assert isinstance(data["users"]["total"], int)

    def test_pending_users_shape(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/terms/pending-users?limit=5",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert isinstance(data["items"], list)


# ----------------------- ARCO EVENTS -----------------------

class TestArcoEvents:
    def test_arco_events_shape(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/compliance/arco-events?limit=20",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("count", "summary", "items"):
            assert k in data
        assert "personal_data_export" in data["summary"]
        assert "account_deleted_by_user" in data["summary"]
        # If items present each must be one of the two actions
        for it in data["items"]:
            assert it.get("action") in ("personal_data_export", "account_deleted_by_user")


# ----------------------- REFUNDS AUDIT -----------------------

class TestRefundsAudit:
    def test_refunds_shape(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/finance/refunds?limit=20",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("count", "total_refunded_mxn", "items"):
            assert k in data
        assert isinstance(data["total_refunded_mxn"], (int, float))


# ----------------------- STRIPE WEBHOOK EVENTS -----------------------

class TestWebhookEventsLog:
    def test_webhook_events_shape(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/stripe/webhook-events?limit=20",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "count" in data and "items" in data
        for it in data["items"]:
            for k in ("event_id", "event_type", "received_at"):
                assert k in it


# ----------------------- REGRESSION: existing admin endpoints -----------------------

class TestExistingAdminEndpointsRegression:
    def test_admin_stats(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/stats", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text

    def test_admin_businesses_all(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/businesses/all",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text

    def test_admin_settlements(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/settlements",
                         headers=admin_headers, timeout=15)
        # endpoint may take optional params; 200 expected
        assert r.status_code == 200, r.text
