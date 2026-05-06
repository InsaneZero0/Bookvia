"""
Fase 12: Seguridad P0 + P&L + Reconciliacion Stripe.

Tests:
  * Security headers middleware on public endpoints.
  * Brute-force lockout (10 fails -> 11th returns 429) on
    /api/auth/login, /api/auth/business/login, /api/auth/admin/login.
  * Successful login resets the brute-force counter.
  * GET /api/admin/platform/pnl default & days= param; auth gating.
  * POST /api/admin/platform/reconcile-stripe date validation & error
    capture when Stripe SDK is not really usable.
  * GET /api/admin/platform/reconciliation-issues shape + auth gating.
  * compute_platform_pnl math via inserted TEST_F12_ transactions.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import pymongo
import pyotp
import pytest
import requests

# ---------- env ----------
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as _f:
            for _line in _f:
                if _line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = _line.split("=", 1)[1].strip().strip('"').rstrip("/")
                    break
    except Exception:
        pass
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

# Load backend env explicitly since pytest runs outside backend dir
if not os.environ.get("MONGO_URL"):
    try:
        with open("/app/backend/.env") as _f:
            for _line in _f:
                if "=" in _line and not _line.strip().startswith("#"):
                    k, v = _line.strip().split("=", 1)
                    os.environ.setdefault(k, v.strip('"'))
    except Exception:
        pass

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "zamorachapa50@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_INITIAL_PASSWORD", "RainbowLol3133!")

TEST_PREFIX = "TEST_F12_"

_mongo = pymongo.MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]


# ---------- cleanup ----------
def _cleanup_brute_force():
    _db.brute_force_attempts.delete_many({})


def _cleanup_test_data():
    _db.transactions.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    _db.users.delete_many({"email": {"$regex": f"^{TEST_PREFIX.lower()}"}})
    _db.reconciliation_issues.delete_many({"stripe_charge_id": {"$regex": f"^{TEST_PREFIX}"}})


@pytest.fixture(autouse=True, scope="module")
def _module_cleanup():
    _cleanup_brute_force()
    _cleanup_test_data()
    yield
    _cleanup_brute_force()
    _cleanup_test_data()


# ---------- admin login ----------
def _admin_totp() -> str:
    admin = _db.users.find_one({"email": ADMIN_EMAIL}, {"_id": 0, "totp_secret": 1})
    assert admin and admin.get("totp_secret"), "Admin user missing totp_secret"
    return pyotp.TOTP(admin["totp_secret"]).now()


@pytest.fixture(scope="module")
def admin_token() -> str:
    # Make sure previous fail attempts don't lock out the real admin
    _db.brute_force_attempts.delete_many({})
    # Admin login has a rate limit (5/min prod, 10/min dev) which the
    # brute-force lockout tests may have consumed. Retry with backoff.
    import time
    last = None
    for attempt in range(8):
        r = requests.post(
            f"{BASE_URL}/api/auth/admin/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "totp_code": _admin_totp()},
            timeout=15,
        )
        if r.status_code == 200:
            return r.json()["token"]
        last = r
        if r.status_code == 429:
            time.sleep(10)
            continue
        break
    print(f"[admin_token fixture] admin login failed: status={last.status_code if last else 'n/a'} body={last.text[:500] if last else ''}")
    pytest.skip(f"Admin login failed: {last.status_code if last else 'n/a'}")


@pytest.fixture(scope="module")
def admin_headers(admin_token: str) -> dict:
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- test user ----------
@pytest.fixture
def test_user_reset():
    """Create a TEST_F12_ client user for brute-force-reset flow."""
    email = f"{TEST_PREFIX.lower()}reset_{uuid.uuid4().hex[:6]}@test.com"
    password = "TestPass123!"
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    uid = f"{TEST_PREFIX}u_{uuid.uuid4().hex[:8]}"
    _db.users.insert_one({
        "id": uid,
        "email": email,
        "password_hash": hashed,
        "role": "user",
        "full_name": "Test Reset",
        "phone": "+10000000000",
        "phone_verified": True,
        "email_verified": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    yield {"email": email, "password": password, "id": uid}
    _db.users.delete_one({"id": uid})
    _db.brute_force_attempts.delete_many({"email": email})


# ==============================================================
# 1. SECURITY HEADERS
# ==============================================================
class TestSecurityHeaders:
    def test_health_has_hsts(self):
        r = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert r.status_code == 200
        h = r.headers
        assert h.get("Strict-Transport-Security") == "max-age=63072000; includeSubDomains; preload", \
            f"HSTS header missing/wrong: {h.get('Strict-Transport-Security')}"

    def test_health_has_nosniff_and_frame_deny(self):
        r = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert r.headers.get("X-Content-Type-Options") == "nosniff"
        assert r.headers.get("X-Frame-Options") == "DENY"

    def test_health_has_referrer_policy(self):
        r = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert r.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"

    def test_health_has_permissions_policy(self):
        r = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert "Permissions-Policy" in r.headers

    def test_headers_on_other_endpoint(self):
        # Another public endpoint confirms middleware is global
        r = requests.get(f"{BASE_URL}/api/terms/version", timeout=10)
        # Either 200 or some error, still must carry hardening headers
        assert "Strict-Transport-Security" in r.headers
        assert r.headers.get("X-Frame-Options") == "DENY"


# ==============================================================
# 2. BRUTE-FORCE LOCKOUT
# ==============================================================
class TestBruteForceLockout:
    """
    NOTE: A pre-existing rate_limit middleware (middleware/rate_limit.py)
    enforces 10/min (20/min in dev) on /api/auth/login and 5/min (10/min in
    dev) on /api/auth/admin/login. That middleware triggers BEFORE the
    Fase 12 brute-force lockout (10 attempts in 15 min). Over HTTP we can
    only validate that SOME 429 is returned after repeated failures.
    Brute-force DB state is validated in TestBruteForceDBState below.
    """

    def _run_lockout_sequence(self, url: str, body_factory, max_attempts: int = 25):
        email = f"{TEST_PREFIX.lower()}bf_{uuid.uuid4().hex[:6]}@test.com"
        got_429 = False
        saw_fail = False
        for i in range(max_attempts):
            r = requests.post(url, json=body_factory(email), timeout=10)
            if r.status_code == 429:
                got_429 = True
                break
            saw_fail = True
        return got_429, saw_fail, email

    def test_client_login_lockout(self):
        _cleanup_brute_force()
        got_429, saw_fail, _ = self._run_lockout_sequence(
            f"{BASE_URL}/api/auth/login",
            lambda e: {"email": e, "password": "wrong"},
        )
        assert saw_fail, "never saw a 401 response"
        assert got_429, "expected 429 lockout after repeated failures"
        _cleanup_brute_force()

    def test_business_login_lockout(self):
        _cleanup_brute_force()
        got_429, saw_fail, _ = self._run_lockout_sequence(
            f"{BASE_URL}/api/auth/business/login",
            lambda e: {"email": e, "password": "wrong"},
        )
        assert saw_fail
        assert got_429
        _cleanup_brute_force()

    def test_admin_login_lockout(self):
        _cleanup_brute_force()
        got_429, saw_fail, _ = self._run_lockout_sequence(
            f"{BASE_URL}/api/auth/admin/login",
            lambda e: {"email": e, "password": "wrong", "totp_code": "000000"},
        )
        assert saw_fail
        assert got_429
        _cleanup_brute_force()

    def test_success_resets_counter(self, test_user_reset):
        """Validate clear_login_failures wipes brute_force_attempts doc."""
        _cleanup_brute_force()
        email = test_user_reset["email"]
        pw = test_user_reset["password"]

        # 3 fails only (stay under rate-limit middleware)
        for _ in range(3):
            r = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": email, "password": "wrong"}, timeout=10)
            assert r.status_code == 401

        # Verify attempts were recorded in DB
        doc = _db.brute_force_attempts.find_one({"email": email.lower()})
        assert doc is not None, "no brute-force record after 3 fails"
        assert len(doc.get("attempts", [])) >= 3

        # 1 success -> should clear
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": email, "password": pw}, timeout=10)
        assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"

        # Doc must be gone after clear_login_failures
        doc = _db.brute_force_attempts.find_one({"email": email.lower()})
        assert doc is None, f"brute-force doc still present after successful login: {doc}"
        _cleanup_brute_force()


class TestBruteForceDBState:
    """Directly invokes core.security_hardening helpers to validate the
    lockout logic independent of the HTTP-layer rate limiter."""

    def test_record_and_lockout_via_service(self):
        import sys, asyncio
        sys.path.insert(0, "/app/backend")
        from core.security_hardening import (
            check_brute_force, record_login_failure, clear_login_failures,
            BRUTE_FORCE_MAX_ATTEMPTS,
        )

        class _FakeReq:
            def __init__(self):
                self.headers = {"x-forwarded-for": "203.0.113.42"}
                self.client = type("c", (), {"host": "203.0.113.42"})()

        req = _FakeReq()
        email = f"{TEST_PREFIX.lower()}unit_{uuid.uuid4().hex[:6]}@test.com"

        loop = asyncio.new_event_loop()
        try:
            # Clean any stale doc
            _db.brute_force_attempts.delete_many({"email": email.lower()})

            # 10 failures -> lockout set
            for _ in range(BRUTE_FORCE_MAX_ATTEMPTS):
                loop.run_until_complete(record_login_failure(req, email))

            doc = _db.brute_force_attempts.find_one({"email": email.lower()})
            assert doc is not None
            assert len(doc["attempts"]) >= BRUTE_FORCE_MAX_ATTEMPTS
            assert doc.get("locked_until"), "locked_until should be set"

            # check_brute_force raises 429
            from fastapi import HTTPException
            try:
                loop.run_until_complete(check_brute_force(req, email))
                raise AssertionError("expected HTTPException 429")
            except HTTPException as e:
                assert e.status_code == 429
                assert "Demasiados intentos" in str(e.detail)

            # clear -> doc removed
            loop.run_until_complete(clear_login_failures(req, email))
            assert _db.brute_force_attempts.find_one({"email": email.lower()}) is None
        finally:
            loop.close()
            _db.brute_force_attempts.delete_many({"email": email.lower()})


# ==============================================================
# 3. ADMIN P&L ENDPOINT
# ==============================================================
class TestPlatformPnL:
    def test_pnl_without_token_is_401(self):
        r = requests.get(f"{BASE_URL}/api/admin/platform/pnl", timeout=10)
        assert r.status_code == 401, f"expected 401, got {r.status_code}"

    def test_pnl_with_client_token_is_403(self, test_user_reset):
        # Login as client
        login = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": test_user_reset["email"],
                                    "password": test_user_reset["password"]},
                              timeout=10)
        assert login.status_code == 200
        tk = login.json()["token"]
        r = requests.get(f"{BASE_URL}/api/admin/platform/pnl",
                         headers={"Authorization": f"Bearer {tk}"}, timeout=10)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text[:200]}"

    def test_pnl_default_shape(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/platform/pnl",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("period_start", "period_end", "transaction_count",
                  "bookvia_fee_income", "stripe_fee_estimated_total",
                  "stripe_fee_actual_total", "fee_margin",
                  "gross_income_bookvia", "coverage_pct"):
            assert k in d, f"missing field {k}"

    def test_pnl_clamp_days(self, admin_headers):
        # days<1 should be clamped to at least 1
        r = requests.get(f"{BASE_URL}/api/admin/platform/pnl?days=0",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        r = requests.get(f"{BASE_URL}/api/admin/platform/pnl?days=1000",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # max clamp should be 365 days -> period span approx 365 days
        start = datetime.fromisoformat(d["period_start"].replace("Z", "+00:00"))
        end = datetime.fromisoformat(d["period_end"].replace("Z", "+00:00"))
        delta_days = (end - start).days
        assert 363 <= delta_days <= 366, f"clamp not applied: {delta_days}"

    def test_pnl_math_with_seeded_txs(self, admin_headers):
        # Insert 3 transactions with known values
        now = datetime.now(timezone.utc)
        txs = [
            {"id": f"{TEST_PREFIX}pnl1_{uuid.uuid4().hex[:6]}", "status": "paid",
             "created_at": (now - timedelta(days=1)).isoformat(),
             "bookvia_fee": 8.00, "stripe_fee_estimated": 20.0, "stripe_fee_actual": 19.5,
             "client_paid": 500.0, "refund_amount": 0.0},
            {"id": f"{TEST_PREFIX}pnl2_{uuid.uuid4().hex[:6]}", "status": "paid",
             "created_at": (now - timedelta(days=2)).isoformat(),
             "bookvia_fee": 8.00, "stripe_fee_estimated": 15.0, "stripe_fee_actual": 16.0,  # negative margin
             "client_paid": 400.0, "refund_amount": 0.0},
            {"id": f"{TEST_PREFIX}pnl3_{uuid.uuid4().hex[:6]}", "status": "paid",
             "created_at": (now - timedelta(days=3)).isoformat(),
             "bookvia_fee": 8.00, "stripe_fee_estimated": 10.0, "stripe_fee_actual": 9.0,
             "client_paid": 300.0, "refund_amount": 0.0},
        ]
        _db.transactions.insert_many(txs)

        r = requests.get(f"{BASE_URL}/api/admin/platform/pnl?days=7",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()

        # expected margin = (20+15+10) - (19.5+16+9) = 45 - 44.5 = 0.5
        expected_margin = round((20.0 + 15.0 + 10.0) - (19.5 + 16.0 + 9.0), 2)
        expected_bookvia_income = 8.00 * 3   # only from our seeded, but real DB may have more
        expected_gross_our_txs = expected_bookvia_income + expected_margin

        # The endpoint aggregates ALL paid txs in the window. Verify OUR
        # contribution is reflected by checking totals are >= our expected.
        assert d["transaction_count"] >= 3
        assert d["bookvia_fee_income"] >= expected_bookvia_income - 0.01
        assert d["stripe_fee_estimated_total"] >= 45.0 - 0.01
        assert d["stripe_fee_actual_total"] >= 44.5 - 0.01

        # Validate internal consistency of the HTTP PnL response (which
        # aggregates ALL txs in the window including ours). The service
        # math: fee_margin == estimated - actual; gross == bookvia + margin.
        d2 = r.json()
        assert abs(d2["fee_margin"] -
                   round(d2["stripe_fee_estimated_total"] -
                         d2["stripe_fee_actual_total"], 2)) < 0.02
        assert abs(d2["gross_income_bookvia"] -
                   round(d2["bookvia_fee_income"] + d2["fee_margin"], 2)) < 0.02

        # cleanup our seeded txs done by module teardown


# ==============================================================
# 4. RECONCILE STRIPE ENDPOINT
# ==============================================================
class TestReconcileStripe:
    def test_reconcile_no_token(self):
        r = requests.post(f"{BASE_URL}/api/admin/platform/reconcile-stripe", timeout=10)
        assert r.status_code == 401

    def test_reconcile_bad_date_format(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/platform/reconcile-stripe?date=abc",
                          headers=admin_headers, timeout=15)
        assert r.status_code == 400, r.text
        assert "date format" in r.json().get("detail", "")

    def test_reconcile_default_date(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/platform/reconcile-stripe",
                          headers=admin_headers, timeout=30)
        # Stripe may fail in preview (no real key / mock). Endpoint must
        # capture error and return body, not 500.
        assert r.status_code == 200, f"expected 200 with ok flag, got {r.status_code} {r.text[:300]}"
        d = r.json()
        assert "date" in d
        assert "ok" in d
        if d["ok"]:
            for k in ("stripe_transactions", "matched", "missing", "issues"):
                assert k in d, f"missing field on success: {k}"
        else:
            assert "error" in d

    def test_reconcile_valid_date(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/platform/reconcile-stripe?date=2026-05-01",
                          headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "2026-05-01" in d.get("date", "")
        assert "ok" in d


# ==============================================================
# 5. RECONCILIATION ISSUES ENDPOINT
# ==============================================================
class TestReconciliationIssues:
    def test_issues_no_token(self):
        r = requests.get(f"{BASE_URL}/api/admin/platform/reconciliation-issues", timeout=10)
        assert r.status_code == 401

    def test_issues_shape_empty_ok(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/platform/reconciliation-issues",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "count" in d
        assert "items" in d
        assert isinstance(d["items"], list)
        assert d["count"] == len(d["items"])

    def test_issues_show_inserted(self, admin_headers):
        # Manually insert a TEST_F12_ reconciliation issue and verify it appears
        charge_id = f"{TEST_PREFIX}ch_{uuid.uuid4().hex[:10]}"
        _db.reconciliation_issues.insert_one({
            "stripe_charge_id": charge_id,
            "issue": "missing_tx_for_charge",
            "balance_transaction_id": f"{TEST_PREFIX}btxn_{uuid.uuid4().hex[:8]}",
            "amount": 123.45,
            "date": datetime.now(timezone.utc).isoformat(),
            "detected_at": datetime.now(timezone.utc).isoformat(),
        })
        r = requests.get(f"{BASE_URL}/api/admin/platform/reconciliation-issues",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        found = [i for i in d["items"] if i.get("stripe_charge_id") == charge_id]
        assert found, f"inserted issue not returned. items={d['items'][:3]}"
        assert "_id" not in found[0], "MongoDB _id leaked"
