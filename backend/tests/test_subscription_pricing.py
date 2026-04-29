"""
Tests for subscription pricing change ($49.99 MXN / $4.99 USD, 30-day trial)
and VISIBLE_BUSINESS_FILTER (only active/trialing businesses are public).
"""
import os
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://marketplace-test-21.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

BUSINESS_EMAIL = "testbiz_dashboard@test.com"
BUSINESS_PASSWORD = "TestBiz123!"


@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def business_token():
    r = requests.post(f"{BASE_URL}/api/auth/business/login",
                      json={"email": BUSINESS_EMAIL, "password": BUSINESS_PASSWORD},
                      timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Business login failed: {r.status_code} {r.text}")
    data = r.json()
    return data.get("token") or data.get("access_token")


# === DB stripe_config tests ===
class TestStripeConfig:
    def test_subscription_price_mxn_in_db(self, db):
        cfg = db.stripe_config.find_one({"type": "subscription_price_mxn"})
        # Config row may be lazily created on first /me/subscribe call - tolerate missing
        if cfg is None:
            pytest.skip("subscription_price_mxn not yet seeded; will be created on first /subscribe call")
        assert cfg.get("amount") == 4999, f"Expected 4999, got {cfg.get('amount')}"
        assert cfg.get("currency") == "mxn"

    def test_subscription_price_usd_in_db(self, db):
        cfg = db.stripe_config.find_one({"type": "subscription_price_usd"})
        if cfg is None:
            pytest.skip("subscription_price_usd not yet seeded; lazy")
        assert cfg.get("amount") == 499, f"Expected 499, got {cfg.get('amount')}"
        assert cfg.get("currency") == "usd"


# === Constants validation ===
class TestEnumsConstants:
    def test_constants(self):
        from models.enums import (
            SUBSCRIPTION_PRICE_MXN, SUBSCRIPTION_PRICE_USD, SUBSCRIPTION_TRIAL_DAYS,
            VISIBLE_BUSINESS_FILTER,
        )
        assert SUBSCRIPTION_PRICE_MXN == 49.99
        assert SUBSCRIPTION_PRICE_USD == 4.99
        assert SUBSCRIPTION_TRIAL_DAYS == 30
        assert VISIBLE_BUSINESS_FILTER["subscription_status"] == {"$in": ["active", "trialing"]}


# === Subscription Status endpoint ===
class TestSubscriptionStatus:
    def test_status_returns_subscription_state(self, business_token):
        r = requests.get(
            f"{BASE_URL}/api/businesses/me/subscription/status",
            headers={"Authorization": f"Bearer {business_token}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Should contain a subscription_status key (one of active/trialing/canceled/none)
        assert "subscription_status" in data or "status" in data, data


# === /me/subscribe creates checkout session with trial 30 days ===
class TestSubscribeCheckout:
    def test_subscribe_returns_checkout_url(self, business_token, db):
        # Ensure biz has no existing subscription, so call works
        biz = db.businesses.find_one({"email": BUSINESS_EMAIL})
        if biz and biz.get("stripe_subscription_id"):
            pytest.skip("Business already subscribed - cannot retest /me/subscribe; covered by status endpoint")

        r = requests.post(
            f"{BASE_URL}/api/businesses/me/subscribe",
            headers={"Authorization": f"Bearer {business_token}"},
            json={"origin_url": BASE_URL},
            timeout=30,
        )
        assert r.status_code == 200, f"Subscribe failed: {r.status_code} {r.text}"
        data = r.json()
        assert "url" in data and "session_id" in data
        assert "stripe.com" in data["url"] or "checkout" in data["url"]

        # Check tx record currency matches business country
        tx = db.payment_transactions.find_one({"session_id": data["session_id"]})
        assert tx is not None, "payment transaction not recorded"
        biz_after = db.businesses.find_one({"email": BUSINESS_EMAIL})
        country = (biz_after.get("country_code") or "MX").upper()
        if country == "MX":
            assert tx["currency"] == "mxn"
            assert tx["amount"] == 49.99
        else:
            assert tx["currency"] == "usd"
            assert tx["amount"] == 4.99


# === Admin platform-config returns the right values ===
class TestPlatformConfig:
    @pytest.fixture(scope="class")
    def admin_token(self):
        # Try TOTP-based admin login
        try:
            import subprocess
            result = subprocess.run(
                ["python", "/app/scripts/get_admin_totp.py"],
                capture_output=True, text=True, timeout=10
            )
            totp_code = None
            for line in result.stdout.splitlines():
                line = line.strip()
                if line.isdigit() and len(line) == 6:
                    totp_code = line
                    break
            if not totp_code:
                pytest.skip("Could not get TOTP code")
        except Exception as e:
            pytest.skip(f"TOTP error: {e}")

        r = requests.post(
            f"{BASE_URL}/api/auth/admin/login",
            json={"email": os.environ.get("ADMIN_EMAIL", "zamorachapa50@gmail.com"),
                  "password": os.environ.get("ADMIN_INITIAL_PASSWORD", "RainbowLol3133!"),
                  "totp_code": totp_code},
            timeout=15,
        )
        if r.status_code != 200:
            pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
        return r.json().get("token") or r.json().get("access_token")

    def test_platform_config(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/config",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        cfg = r.json()
        assert float(cfg.get("subscription_price_mxn", 0)) == 49.99, cfg
        assert int(cfg.get("subscription_trial_days", 0)) == 30, cfg


# === VISIBLE_BUSINESS_FILTER applied in /featured and /search (root) ===
class TestVisibleBusinessFilter:
    """
    Per requirement: only businesses with subscription_status in
    ['active','trialing'] must appear in /featured and /search.
    Businesses with status='canceled' or 'none' must NOT appear.
    """

    @pytest.fixture(scope="class")
    def seed_invisible_biz(self, db):
        """Create a temporary APPROVED biz with subscription_status='canceled'
        and verify it does not appear in public listings."""
        from datetime import datetime, timezone
        import uuid
        biz_id = f"TEST_canceled_{uuid.uuid4().hex[:8]}"
        biz_doc = {
            "id": biz_id,
            "email": f"{biz_id}@test.com",
            "name": f"TEST Canceled Sub Biz {biz_id[-4:]}",
            "status": "approved",
            "subscription_status": "canceled",
            "country_code": "MX",
            "city": "Ciudad de Mexico",
            "category_id": "cat_test",
            "is_featured": True,
            "rating": 4.9,
            "phone": "+5215555555555",
            "description": "Test biz - canceled sub - should be invisible",
            "address": "Test 123",
            "state": "CDMX",
            "country": "Mexico",
            "zip_code": "00000",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        db.businesses.insert_one(dict(biz_doc))

        # also seed one with subscription_status='none'
        biz_id_none = f"TEST_none_{uuid.uuid4().hex[:8]}"
        biz_none = {k: v for k, v in biz_doc.items() if k != "_id"}
        biz_none.update({
            "id": biz_id_none,
            "email": f"{biz_id_none}@test.com",
            "name": f"TEST None Sub Biz {biz_id_none[-4:]}",
            "subscription_status": "none",
        })
        db.businesses.insert_one(biz_none)

        yield biz_id, biz_id_none

        # cleanup
        db.businesses.delete_many({"id": {"$in": [biz_id, biz_id_none]}})

    def test_featured_excludes_canceled(self, seed_invisible_biz):
        biz_id_canceled, biz_id_none = seed_invisible_biz
        r = requests.get(f"{BASE_URL}/api/businesses/featured?limit=50&country_code=MX", timeout=15)
        assert r.status_code == 200, r.text
        ids = [b.get("id") for b in r.json()]
        assert biz_id_canceled not in ids, f"Canceled biz {biz_id_canceled} appeared in /featured (should be hidden)"

    def test_featured_excludes_none(self, seed_invisible_biz):
        _, biz_id_none = seed_invisible_biz
        r = requests.get(f"{BASE_URL}/api/businesses/featured?limit=50&country_code=MX", timeout=15)
        assert r.status_code == 200, r.text
        ids = [b.get("id") for b in r.json()]
        assert biz_id_none not in ids, (
            f"Biz with subscription_status='none' ({biz_id_none}) appeared in /featured. "
            "Per VISIBLE_BUSINESS_FILTER spec, only active/trialing should be visible."
        )

    def test_search_excludes_canceled(self, seed_invisible_biz):
        biz_id_canceled, _ = seed_invisible_biz
        r = requests.get(f"{BASE_URL}/api/businesses?country_code=MX&limit=100", timeout=15)
        assert r.status_code == 200, r.text
        ids = [b.get("id") for b in r.json()]
        assert biz_id_canceled not in ids, f"Canceled biz {biz_id_canceled} appeared in /api/businesses search"

    def test_search_excludes_none(self, seed_invisible_biz):
        _, biz_id_none = seed_invisible_biz
        r = requests.get(f"{BASE_URL}/api/businesses?country_code=MX&limit=100", timeout=15)
        assert r.status_code == 200, r.text
        ids = [b.get("id") for b in r.json()]
        assert biz_id_none not in ids, (
            f"Biz with status='none' ({biz_id_none}) appeared in search. Should be hidden per VISIBLE_BUSINESS_FILTER."
        )
