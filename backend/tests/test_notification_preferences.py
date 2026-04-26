"""
Tests for notification preference toggles (notify_email, notify_sms)
on user (PUT /api/users/me) and business (PUT /api/businesses/me).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://marketplace-test-21.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

USER_EMAIL = "testuser_stats@test.com"
USER_PASSWORD = "TestPass123!"
BIZ_EMAIL = "testbiz_dashboard@test.com"
BIZ_PASSWORD = "TestBiz123!"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def user_token():
    r = requests.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"User login failed: {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def biz_token():
    # business owners use business/login or unified-login
    r = requests.post(f"{API}/auth/business/login", json={"email": BIZ_EMAIL, "password": BIZ_PASSWORD}, timeout=20)
    if r.status_code != 200:
        # fallback to unified
        r = requests.post(f"{API}/auth/unified-login", json={"email": BIZ_EMAIL, "password": BIZ_PASSWORD}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Business login failed: {r.status_code} {r.text}")
    return r.json()["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- USER notification preferences ----------
class TestUserNotificationPrefs:
    def test_get_me_returns_notify_defaults(self, user_token):
        # First reset to true (so legacy + default state validation works each run)
        requests.put(f"{API}/users/me", json={"notify_email": True, "notify_sms": True}, headers=auth(user_token), timeout=20)
        r = requests.get(f"{API}/auth/me", headers=auth(user_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "notify_email" in data, "notify_email missing in /auth/me response"
        assert "notify_sms" in data, "notify_sms missing in /auth/me response"
        assert data["notify_email"] is True
        assert data["notify_sms"] is True

    def test_put_users_me_set_sms_false(self, user_token):
        r = requests.put(f"{API}/users/me", json={"notify_sms": False}, headers=auth(user_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["notify_sms"] is False
        assert data["notify_email"] is True  # unchanged

        # GET to verify persistence
        r2 = requests.get(f"{API}/auth/me", headers=auth(user_token), timeout=20)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["notify_sms"] is False
        assert d2["notify_email"] is True

    def test_put_users_me_set_both_false(self, user_token):
        r = requests.put(f"{API}/users/me", json={"notify_email": False, "notify_sms": False}, headers=auth(user_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["notify_email"] is False
        assert data["notify_sms"] is False

        r2 = requests.get(f"{API}/auth/me", headers=auth(user_token), timeout=20)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["notify_email"] is False
        assert d2["notify_sms"] is False

    def test_put_users_me_restore_both_true(self, user_token):
        r = requests.put(f"{API}/users/me", json={"notify_email": True, "notify_sms": True}, headers=auth(user_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["notify_email"] is True
        assert d["notify_sms"] is True


# ---------- BUSINESS notification preferences ----------
class TestBusinessNotificationPrefs:
    def test_private_info_returns_notify_fields(self, biz_token):
        # ensure defaults
        requests.put(f"{API}/businesses/me", json={"notify_email": True, "notify_sms": True}, headers=auth(biz_token), timeout=20)
        r = requests.get(f"{API}/businesses/me/private-info", headers=auth(biz_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "notify_email" in data, "notify_email missing in /businesses/me/private-info"
        assert "notify_sms" in data, "notify_sms missing in /businesses/me/private-info"
        assert data["notify_email"] is True
        assert data["notify_sms"] is True

    def test_put_businesses_me_set_sms_false(self, biz_token):
        r = requests.put(f"{API}/businesses/me", json={"notify_sms": False}, headers=auth(biz_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("notify_sms") is False
        assert data.get("notify_email") is True

        # Verify persistence via private-info
        r2 = requests.get(f"{API}/businesses/me/private-info", headers=auth(biz_token), timeout=20)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["notify_sms"] is False
        assert d2["notify_email"] is True

    def test_put_businesses_me_restore(self, biz_token):
        r = requests.put(f"{API}/businesses/me", json={"notify_email": True, "notify_sms": True}, headers=auth(biz_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d.get("notify_email") is True
        assert d.get("notify_sms") is True


# ---------- Twilio SMS helper smoke test (regression) ----------
class TestSmsHelper:
    def test_send_booking_confirmation_sms_callable(self):
        """Verify SMS helper can be imported and called without raising.
        Trial-mode unverified numbers will fallback-log; that's expected."""
        import asyncio
        import sys
        sys.path.insert(0, "/app/backend")
        try:
            from services.sms import send_booking_confirmation_sms
        except Exception as e:
            pytest.fail(f"Failed to import send_booking_confirmation_sms: {e}")

        async def _run():
            # Call with a verified Trial number per problem statement
            return await send_booking_confirmation_sms(
                phone="+528671206233",
                user_name="TestUser",
                business_name="TEST BIZ",
                date="2026-01-15",
                time="10:00",
            )

        try:
            result = asyncio.get_event_loop().run_until_complete(_run()) if False else asyncio.run(_run())
        except Exception as e:
            pytest.fail(f"send_booking_confirmation_sms raised: {e}")
        # Should return a truthy/falsy SID string or False (fallback). Just must not raise.
        assert result is True or result is False or isinstance(result, str)
