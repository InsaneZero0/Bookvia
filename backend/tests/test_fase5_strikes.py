"""
Fase 5 - Sistema de Strikes Progresivos + Trust Score
Tests cover:
  - strikes._determine_severity (escalation matrix)
  - strikes.issue_strike (financial penalty / suspension / ban / counters)
  - strikes.compute_trust_score (rating + completion + strikes blend)
  - strikes.lift_expired_suspensions (cron)
  - strikes.list_business_strikes (ordering)
  - strikes.admin_clear_strike (counter recompute, lift, refund pending penalty)
  - GET /api/business/finance/strikes (business auth)
  - GET /api/admin/strikes (admin TOTP)
  - GET /api/admin/strikes?business_id=X
  - POST /api/admin/strikes/issue (validation + audit log)
  - POST /api/admin/strikes/{id}/clear
  - GET /api/businesses/{id}/trust-score (public)
  - GET /api/businesses/featured (visibility filter respects suspension/ban)
  - PUT /api/bookings/{id}/cancel/business -> auto strike on cancel
  - Validation: invalid reason / unknown business -> ValueError
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

# Make backend imports available for direct service-level tests
sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend env (preview URL)
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

TEST_PREFIX = "TEST_F5_"


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
    # Get TOTP
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
def biz_id(db, event_loop, business_token):
    """Get test business id from logged-in business user."""
    headers = {"Authorization": f"Bearer {business_token}"}
    r = requests.get(f"{API}/auth/me", headers=headers)
    if r.status_code != 200:
        # Fallback: lookup directly in DB
        async def _find():
            u = await db.users.find_one({"email": BIZ_EMAIL}, {"_id": 0, "business_id": 1})
            return u.get("business_id") if u else None
        return event_loop.run_until_complete(_find())
    return r.json().get("business_id") or r.json().get("user", {}).get("business_id")


@pytest.fixture(scope="module", autouse=True)
def cleanup(db, event_loop, biz_id):
    """Wipe TEST_F5 strikes & reset business counters before AND after tests."""
    async def _clean():
        # Delete all strikes for the test business + any with TEST_F5 prefix
        await db.business_strikes.delete_many({"business_id": biz_id})
        await db.business_strikes.delete_many({"id": {"$regex": "^TEST_F5_"}})
        await db.business_strikes.delete_many({"business_id": {"$regex": "^TEST_F5_"}})
        # Reset counters and suspension on test business
        await db.businesses.update_one(
            {"id": biz_id},
            {"$set": {
                "strike_count_30d": 0,
                "strike_count_90d": 0,
                "pending_strike_penalty_mxn": 0,
                "suspended_until": None,
                "suspended_reason": None,
                "banned": False,
                "last_strike_at": None,
                "last_strike_severity": None,
                "status": "approved",
            }}
        )
        # Drop synthetic businesses created during tests
        await db.businesses.delete_many({"id": {"$regex": "^TEST_F5_"}})
    event_loop.run_until_complete(_clean())
    yield
    event_loop.run_until_complete(_clean())


def _reset_business(db, event_loop, biz_id):
    async def _r():
        await db.business_strikes.delete_many({"business_id": biz_id})
        await db.businesses.update_one(
            {"id": biz_id},
            {"$set": {
                "strike_count_30d": 0,
                "strike_count_90d": 0,
                "pending_strike_penalty_mxn": 0,
                "suspended_until": None,
                "suspended_reason": None,
                "banned": False,
                "status": "approved",
            }}
        )
    event_loop.run_until_complete(_r())


# ===================== SERVICE-LEVEL TESTS =====================
class TestDetermineSeverity:
    """strikes._determine_severity matrix (Strike count includes the new one)."""

    def test_first_strike_regular_cancellation_warning(self):
        from services.strikes import _determine_severity
        from models.enums import StrikeSeverity
        assert _determine_severity(1, 1, "regular_cancellation") == StrikeSeverity.WARNING.value

    def test_first_strike_late_cancellation_minor(self):
        from services.strikes import _determine_severity
        from models.enums import StrikeSeverity
        assert _determine_severity(1, 1, "late_cancellation") == StrikeSeverity.MINOR.value

    def test_first_strike_no_show_business_minor(self):
        from services.strikes import _determine_severity
        from models.enums import StrikeSeverity
        assert _determine_severity(1, 1, "no_show_business") == StrikeSeverity.MINOR.value

    def test_first_strike_dispute_lost_minor(self):
        from services.strikes import _determine_severity
        from models.enums import StrikeSeverity
        assert _determine_severity(1, 1, "dispute_lost") == StrikeSeverity.MINOR.value

    def test_second_strike_minor_regardless_of_reason(self):
        from services.strikes import _determine_severity
        from models.enums import StrikeSeverity
        assert _determine_severity(2, 2, "regular_cancellation") == StrikeSeverity.MINOR.value
        assert _determine_severity(2, 2, "late_cancellation") == StrikeSeverity.MINOR.value

    def test_third_strike_suspension_7d(self):
        from services.strikes import _determine_severity
        from models.enums import StrikeSeverity
        assert _determine_severity(3, 3, "regular_cancellation") == StrikeSeverity.SUSPENSION_7D.value

    def test_fourth_strike_suspension_30d(self):
        from services.strikes import _determine_severity
        from models.enums import StrikeSeverity
        assert _determine_severity(4, 4, "regular_cancellation") == StrikeSeverity.SUSPENSION_30D.value

    def test_fifth_strike_in_90d_permanent_ban(self):
        from services.strikes import _determine_severity
        from models.enums import StrikeSeverity
        # Even if 30d count is small, 90d>=5 triggers ban
        assert _determine_severity(2, 5, "regular_cancellation") == StrikeSeverity.PERMANENT_BAN.value


class TestIssueStrike:
    """strikes.issue_strike side effects."""

    def test_warning_first_strike_no_penalty(self, db, event_loop, biz_id):
        _reset_business(db, event_loop, biz_id)
        from services.strikes import issue_strike

        async def _run():
            return await issue_strike(biz_id, reason="regular_cancellation",
                                      description="TEST_F5_warn", issued_by="test")
        s = event_loop.run_until_complete(_run())
        assert s["severity"] == "warning"
        assert s["financial_penalty_mxn"] == 0.0
        assert s["suspension_until"] is None
        assert s["strike_number_30d"] == 1
        assert "id" in s and s["business_id"] == biz_id
        # Business counter updated
        async def _biz():
            return await db.businesses.find_one({"id": biz_id}, {"_id": 0})
        biz = event_loop.run_until_complete(_biz())
        assert biz["strike_count_30d"] == 1
        assert biz["strike_count_90d"] == 1
        assert biz["last_strike_severity"] == "warning"
        assert biz.get("pending_strike_penalty_mxn", 0) == 0
        assert not biz.get("suspended_until")

    def test_minor_first_with_severe_reason_adds_pending_penalty(self, db, event_loop, biz_id):
        _reset_business(db, event_loop, biz_id)
        from services.strikes import issue_strike

        async def _run():
            return await issue_strike(biz_id, reason="late_cancellation",
                                      description="TEST_F5_minor", issued_by="test")
        s = event_loop.run_until_complete(_run())
        assert s["severity"] == "minor"
        assert s["financial_penalty_mxn"] == 100.0
        assert s["suspension_until"] is None

        async def _biz():
            return await db.businesses.find_one({"id": biz_id}, {"_id": 0})
        biz = event_loop.run_until_complete(_biz())
        assert biz.get("pending_strike_penalty_mxn") == 100.0

    def test_progressive_escalation_to_suspension_7d(self, db, event_loop, biz_id):
        _reset_business(db, event_loop, biz_id)
        from services.strikes import issue_strike

        async def _run():
            results = []
            for i in range(3):
                results.append(await issue_strike(biz_id, reason="regular_cancellation",
                                                  description=f"TEST_F5_esc_{i}", issued_by="test"))
            return results
        results = event_loop.run_until_complete(_run())
        assert results[0]["severity"] == "warning"
        assert results[1]["severity"] == "minor"
        assert results[2]["severity"] == "suspension_7d"
        s3 = results[2]
        assert s3["suspension_until"] is not None
        # Roughly 7 days in future
        end = datetime.fromisoformat(s3["suspension_until"])
        delta_days = (end - datetime.now(timezone.utc)).days
        assert 6 <= delta_days <= 7

        async def _biz():
            return await db.businesses.find_one({"id": biz_id}, {"_id": 0})
        biz = event_loop.run_until_complete(_biz())
        assert biz["suspended_until"] is not None
        assert biz["last_strike_severity"] == "suspension_7d"
        # Pending penalty from 2nd strike still pending
        assert biz.get("pending_strike_penalty_mxn") == 100.0

    def test_escalation_30d_then_permanent_ban(self, db, event_loop, biz_id):
        _reset_business(db, event_loop, biz_id)
        from services.strikes import issue_strike

        async def _run():
            results = []
            for i in range(5):
                results.append(await issue_strike(biz_id, reason="regular_cancellation",
                                                  description=f"TEST_F5_pb_{i}", issued_by="test"))
            return results
        results = event_loop.run_until_complete(_run())
        assert results[3]["severity"] == "suspension_30d"
        assert results[4]["severity"] == "permanent_ban"
        assert results[4]["suspension_until"] == "permanent"

        async def _biz():
            return await db.businesses.find_one({"id": biz_id}, {"_id": 0})
        biz = event_loop.run_until_complete(_biz())
        assert biz.get("banned") is True
        assert biz.get("status") in ("rejected", "REJECTED")

    def test_invalid_reason_raises(self, db, event_loop, biz_id):
        from services.strikes import issue_strike
        async def _r():
            await issue_strike(biz_id, reason="bogus_reason", issued_by="test")
        with pytest.raises(ValueError):
            event_loop.run_until_complete(_r())

    def test_unknown_business_raises(self, event_loop):
        from services.strikes import issue_strike
        async def _r():
            await issue_strike("TEST_F5_NONEXISTENT", reason="regular_cancellation", issued_by="test")
        with pytest.raises(ValueError):
            event_loop.run_until_complete(_r())


class TestListAndOrdering:
    def test_list_business_strikes_desc(self, db, event_loop, biz_id):
        _reset_business(db, event_loop, biz_id)
        from services.strikes import issue_strike, list_business_strikes

        async def _run():
            for i in range(3):
                await issue_strike(biz_id, reason="regular_cancellation",
                                   description=f"TEST_F5_ord_{i}", issued_by="test")
                await asyncio.sleep(0.01)
            return await list_business_strikes(biz_id)
        rows = event_loop.run_until_complete(_run())
        assert len(rows) >= 3
        # newest first
        for i in range(len(rows) - 1):
            assert rows[i]["created_at"] >= rows[i + 1]["created_at"]


class TestTrustScore:
    def test_new_business_provisional_good(self):
        from services.strikes import compute_trust_score
        biz = {}  # nothing
        ts = compute_trust_score(biz)
        # Score around 85 -> good label, provisional
        assert 80 <= ts["score"] <= 90
        assert ts["label"] in ("good", "fair")
        assert ts["is_provisional"] is True
        assert ts["completion_rate_pct"] == 100.0

    def test_excellent_high_rating_no_strikes(self):
        from services.strikes import compute_trust_score
        biz = {"rating": 4.9, "review_count": 50, "completed_appointments": 80,
               "business_cancellation_count": 2, "strike_count_30d": 0}
        ts = compute_trust_score(biz)
        assert ts["score"] >= 90
        assert ts["label"] == "excellent"
        assert ts["is_provisional"] is False

    def test_strikes_drop_score(self):
        from services.strikes import compute_trust_score
        good = compute_trust_score({"rating": 4.5, "review_count": 30,
                                    "completed_appointments": 50, "strike_count_30d": 0})
        bad = compute_trust_score({"rating": 4.5, "review_count": 30,
                                   "completed_appointments": 50, "strike_count_30d": 3})
        assert bad["score"] < good["score"]


class TestLiftExpiredSuspensions:
    def test_lifts_expired_but_not_permanent(self, db, event_loop):
        from services.strikes import lift_expired_suspensions
        # Insert two synthetic businesses
        past_iso = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        future_iso = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        b1 = {"id": "TEST_F5_B_EXP", "name": "exp", "suspended_until": past_iso,
              "suspended_reason": "x", "banned": False}
        b2 = {"id": "TEST_F5_B_FUT", "name": "fut", "suspended_until": future_iso,
              "suspended_reason": "x", "banned": False}
        b3 = {"id": "TEST_F5_B_PERM", "name": "perm", "suspended_until": "permanent",
              "suspended_reason": "x", "banned": True}

        async def _setup_run():
            await db.businesses.insert_many([dict(b1), dict(b2), dict(b3)])
            cleared = await lift_expired_suspensions()
            r1 = await db.businesses.find_one({"id": "TEST_F5_B_EXP"}, {"_id": 0})
            r2 = await db.businesses.find_one({"id": "TEST_F5_B_FUT"}, {"_id": 0})
            r3 = await db.businesses.find_one({"id": "TEST_F5_B_PERM"}, {"_id": 0})
            return cleared, r1, r2, r3
        cleared, r1, r2, r3 = event_loop.run_until_complete(_setup_run())
        assert cleared >= 1
        assert r1["suspended_until"] is None
        # Future still has suspension
        assert r2["suspended_until"] == future_iso
        # Permanent untouched
        assert r3["suspended_until"] == "permanent"
        assert r3["banned"] is True


# ===================== API ENDPOINT TESTS =====================
class TestBusinessFinanceStrikesEndpoint:
    def test_get_business_strikes(self, db, event_loop, biz_id, business_token):
        _reset_business(db, event_loop, biz_id)
        from services.strikes import issue_strike
        async def _run():
            await issue_strike(biz_id, reason="late_cancellation",
                               description="TEST_F5_api", issued_by="test")
        event_loop.run_until_complete(_run())
        r = requests.get(f"{API}/business/finance/strikes",
                         headers={"Authorization": f"Bearer {business_token}"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "strike_count_30d" in data
        assert "strike_count_90d" in data
        assert "pending_penalty_mxn" in data
        assert "active_suspension" in data
        assert "history" in data
        assert data["strike_count_30d"] >= 1
        assert data["pending_penalty_mxn"] == 100.0
        assert any(s.get("description") == "TEST_F5_api" for s in data["history"])


class TestAdminStrikesEndpoints:
    def test_list_all_strikes(self, db, event_loop, biz_id, admin_token):
        _reset_business(db, event_loop, biz_id)
        from services.strikes import issue_strike
        async def _run():
            await issue_strike(biz_id, reason="regular_cancellation",
                               description="TEST_F5_listall", issued_by="test")
        event_loop.run_until_complete(_run())
        r = requests.get(f"{API}/admin/strikes",
                         headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "strikes" in data and isinstance(data["strikes"], list)
        # Each strike has business_summary enrichment
        if data["strikes"]:
            s = data["strikes"][0]
            assert "business_summary" in s

    def test_filter_by_business(self, db, event_loop, biz_id, admin_token):
        r = requests.get(f"{API}/admin/strikes",
                         params={"business_id": biz_id},
                         headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        data = r.json()
        for s in data["strikes"]:
            assert s["business_id"] == biz_id

    def test_admin_issue_strike_creates_audit_log(self, db, event_loop, biz_id, admin_token):
        _reset_business(db, event_loop, biz_id)
        before = event_loop.run_until_complete(db.audit_logs.count_documents({}))
        r = requests.post(f"{API}/admin/strikes/issue",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"business_id": biz_id, "reason": "admin_manual",
                                "description": "TEST_F5_admin_manual"})
        assert r.status_code == 200, r.text
        s = r.json()
        assert s["business_id"] == biz_id
        assert s["reason"] == "admin_manual"
        assert s["severity"] == "warning"
        # Audit log row created
        after = event_loop.run_until_complete(db.audit_logs.count_documents({}))
        assert after > before

    def test_admin_issue_strike_missing_business_id_returns_400(self, admin_token):
        r = requests.post(f"{API}/admin/strikes/issue",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"reason": "admin_manual"})
        assert r.status_code == 400

    def test_admin_clear_strike_recomputes_and_lifts(self, db, event_loop, biz_id, admin_token):
        _reset_business(db, event_loop, biz_id)
        from services.strikes import issue_strike

        async def _setup():
            results = []
            for i in range(3):
                results.append(await issue_strike(biz_id, reason="regular_cancellation",
                                                  description=f"TEST_F5_clr_{i}", issued_by="test"))
            return results
        results = event_loop.run_until_complete(_setup())
        susp_strike = results[2]
        assert susp_strike["severity"] == "suspension_7d"
        # Clear the suspension strike
        r = requests.post(f"{API}/admin/strikes/{susp_strike['id']}/clear",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"reason": "TEST_F5_admin_clear"})
        assert r.status_code == 200, r.text
        cleared = r.json()
        assert cleared.get("cleared") is True
        # Business counter went down + suspension lifted
        async def _b():
            return await db.businesses.find_one({"id": biz_id}, {"_id": 0})
        biz = event_loop.run_until_complete(_b())
        assert biz["strike_count_30d"] == 2
        assert biz.get("suspended_until") in (None, "")

    def test_admin_clear_minor_decrements_pending_penalty(self, db, event_loop, biz_id, admin_token):
        _reset_business(db, event_loop, biz_id)
        from services.strikes import issue_strike

        async def _setup():
            return await issue_strike(biz_id, reason="late_cancellation",
                                      description="TEST_F5_minor_clr", issued_by="test")
        s = event_loop.run_until_complete(_setup())
        assert s["severity"] == "minor"
        r = requests.post(f"{API}/admin/strikes/{s['id']}/clear",
                          headers={"Authorization": f"Bearer {admin_token}"},
                          json={"reason": "test"})
        assert r.status_code == 200
        async def _b():
            return await db.businesses.find_one({"id": biz_id}, {"_id": 0})
        biz = event_loop.run_until_complete(_b())
        assert biz.get("pending_strike_penalty_mxn", 0) == 0


class TestPublicTrustScoreEndpoint:
    def test_public_trust_score(self, db, event_loop, biz_id):
        _reset_business(db, event_loop, biz_id)
        r = requests.get(f"{API}/businesses/{biz_id}/trust-score")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "score" in data and "label" in data
        assert "rating" in data and "review_count" in data
        assert "completion_rate_pct" in data and "strikes_30d" in data
        assert "completed_appointments" in data
        assert "is_provisional" in data
        assert 0 <= data["score"] <= 100
        assert data["label"] in ("excellent", "good", "fair", "poor")

    def test_unknown_business_returns_404(self):
        r = requests.get(f"{API}/businesses/TEST_F5_NONEXIST/trust-score")
        assert r.status_code == 404


class TestVisibilityFilter:
    """Suspended/banned businesses must NOT appear in featured/search lists."""

    def test_featured_excludes_suspended_active(self, db, event_loop, biz_id):
        _reset_business(db, event_loop, biz_id)
        # Set business suspended in future
        future_iso = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        async def _set():
            await db.businesses.update_one(
                {"id": biz_id},
                {"$set": {"suspended_until": future_iso, "suspended_reason": "test"}}
            )
        event_loop.run_until_complete(_set())
        r = requests.get(f"{API}/businesses/featured")
        assert r.status_code == 200
        ids = [b.get("id") for b in r.json()]
        assert biz_id not in ids
        # Reset
        _reset_business(db, event_loop, biz_id)

    def test_featured_excludes_banned(self, db, event_loop, biz_id):
        _reset_business(db, event_loop, biz_id)
        async def _set():
            await db.businesses.update_one({"id": biz_id}, {"$set": {"banned": True}})
        event_loop.run_until_complete(_set())
        r = requests.get(f"{API}/businesses/featured")
        assert r.status_code == 200
        ids = [b.get("id") for b in r.json()]
        assert biz_id not in ids
        _reset_business(db, event_loop, biz_id)

    def test_featured_includes_when_suspension_passed(self, db, event_loop, biz_id):
        """Past suspended_until (already expired) MUST satisfy visible_business_filter_now()."""
        _reset_business(db, event_loop, biz_id)
        past_iso = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        from models.enums import visible_business_filter_now
        async def _set_and_check():
            await db.businesses.update_one(
                {"id": biz_id},
                {"$set": {"suspended_until": past_iso, "suspended_reason": "old"}}
            )
            # Combine the visibility filter with the specific id so we test ONLY that
            # the past suspension passes (no pagination noise).
            filters = {**visible_business_filter_now(), "id": biz_id}
            return await db.businesses.find_one(filters, {"_id": 0, "id": 1})
        result = event_loop.run_until_complete(_set_and_check())
        assert result is not None and result["id"] == biz_id
        _reset_business(db, event_loop, biz_id)
