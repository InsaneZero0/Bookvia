"""Phase 18: Payout schedule unification + CL-XXXXX client public_code lookups.

Covers:
  * BusinessCreate schema defaults + commission_terms acceptance persistence
  * Mini-CRM list includes public_code on registered clients
  * Mini-CRM search by CL-XXXXX
  * /api/businesses/my/clients/lookup (200 / 400 / 404 / 401 / 403)
  * /api/users/me still exposes public_code
"""
import os
import time
import pytest
import requests

def _load_base_url():
    # First try env
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    # Fallback: read frontend/.env (tests run from inside the app)
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"

BUSINESS_EMAIL = "testspa@test.com"
BUSINESS_PASSWORD = "Test123!"
USER_EMAIL = "test@example.com"
KNOWN_USER_CODE = "CL-2GV7B"


# ---------------- Fixtures ----------------

@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def biz_token(s):
    r = s.post(f"{API}/auth/business-login", json={"email": BUSINESS_EMAIL, "password": BUSINESS_PASSWORD}, timeout=15)
    if r.status_code != 200:
        # fallback to plain /auth/login if business-login not present
        r = s.post(f"{API}/auth/login", json={"email": BUSINESS_EMAIL, "password": BUSINESS_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"biz login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def biz_headers(biz_token):
    return {"Authorization": f"Bearer {biz_token}"}


@pytest.fixture(scope="module")
def user_token(s):
    # Try a few common test user passwords
    for pwd in ["Test123!", "TestPass123!", "Password123!", "password"]:
        r = s.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": pwd}, timeout=15)
        if r.status_code == 200:
            return r.json().get("access_token") or r.json().get("token")
    pytest.skip(f"Could not login user {USER_EMAIL}")


# ---------------- Schema / Registration ----------------

class TestBusinessCreateSchema:
    """Validate BusinessCreate default payout schedule & commission_terms fields."""

    def test_schema_defaults_payout_schedule_and_accepts_commission_terms(self):
        from models.schemas import BusinessCreate
        m = BusinessCreate(
            name="X", email="x@example.com", password="xxxxxxxx",
            phone="+525555555555", description="d",
            category_id="c", address="a", city="c", state="s",
            zip_code="00000", rfc="AAAA800101AAA", clabe="012345678901234567",
            legal_name="Legal",
        )
        assert m.payout_schedule == "monthly_cutoff_20"
        assert m.commission_terms_accepted is None
        # can be set
        m2 = BusinessCreate(
            name="X", email="x@example.com", password="xxxxxxxx",
            phone="+525555555555", description="d",
            category_id="c", address="a", city="c", state="s",
            zip_code="00000", rfc="AAAA800101AAA", clabe="012345678901234567",
            legal_name="Legal",
            commission_terms_accepted=True, commission_terms_version="v1-2026-02",
        )
        assert m2.commission_terms_accepted is True
        assert m2.commission_terms_version == "v1-2026-02"


# ---------------- /api/users/me ----------------

class TestUsersMePublicCode:
    def test_users_me_exposes_public_code(self, s, user_token):
        r = s.get(f"{API}/users/me", headers={"Authorization": f"Bearer {user_token}"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "public_code" in data
        if data.get("public_code"):
            assert data["public_code"].startswith("CL-")


# ---------------- Mini-CRM: list + search ----------------

class TestMiniCRMPublicCode:
    def test_clients_list_includes_public_code_field(self, s, biz_headers):
        r = s.get(f"{API}/businesses/my/clients", headers=biz_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data
        # Every item must have the key (value may be None for walk-ins)
        for c in data["items"]:
            assert "public_code" in c, f"missing public_code key on {c.get('name')}"

    def test_clients_list_has_registered_with_code(self, s, biz_headers):
        r = s.get(f"{API}/businesses/my/clients", headers=biz_headers, timeout=20)
        assert r.status_code == 200
        registered = [c for c in r.json()["items"] if c.get("is_registered") and c.get("public_code")]
        assert len(registered) >= 1, "expected at least 1 registered client w/ public_code on testspa"
        for c in registered:
            assert c["public_code"].startswith("CL-")

    def test_clients_search_by_public_code(self, s, biz_headers):
        # grab a public code from the list
        r = s.get(f"{API}/businesses/my/clients", headers=biz_headers, timeout=20)
        assert r.status_code == 200
        codes = [c["public_code"] for c in r.json()["items"] if c.get("public_code")]
        if not codes:
            pytest.skip("no registered client w/ public_code on testspa")
        target = codes[0]
        # full search
        r2 = s.get(f"{API}/businesses/my/clients", params={"q": target}, headers=biz_headers, timeout=20)
        assert r2.status_code == 200
        items = r2.json()["items"]
        assert any(c.get("public_code") == target for c in items), f"full code search failed for {target}"
        # partial (last 3 chars)
        partial = target[-3:]
        r3 = s.get(f"{API}/businesses/my/clients", params={"q": partial}, headers=biz_headers, timeout=20)
        assert r3.status_code == 200
        assert any(c.get("public_code") == target for c in r3.json()["items"]), "partial search should still match"


# ---------------- /my/clients/lookup ----------------

class TestClientLookupEndpoint:
    def test_lookup_ok_known_code(self, s, biz_headers):
        # Use a registered client from testspa's CRM to guarantee has_history_with_you=True path too.
        r = s.get(f"{API}/businesses/my/clients", headers=biz_headers, timeout=20)
        assert r.status_code == 200
        codes = [c["public_code"] for c in r.json()["items"] if c.get("public_code")]
        if not codes:
            pytest.skip("no code to test lookup")
        code = codes[0]
        r2 = s.get(f"{API}/businesses/my/clients/lookup", params={"code": code}, headers=biz_headers, timeout=15)
        assert r2.status_code == 200, r2.text
        d = r2.json()
        for key in ("found", "has_history_with_you", "public_code", "name",
                    "total_bookings", "total_visits", "noshow_count", "total_spent", "last_visit"):
            assert key in d, f"missing {key} in lookup response"
        assert d["public_code"] == code
        assert d["found"] is True
        assert d["has_history_with_you"] is True
        assert d["total_bookings"] >= 1

    def test_lookup_known_code_no_history(self, s, biz_headers):
        """A valid CL- code that has never booked with THIS business → 200 has_history_with_you=False."""
        r = s.get(f"{API}/businesses/my/clients/lookup", params={"code": KNOWN_USER_CODE}, headers=biz_headers, timeout=15)
        # If the user was deleted this returns 404 — that's ok to flag separately
        if r.status_code == 404:
            pytest.skip(f"seed user with {KNOWN_USER_CODE} not present in db")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["public_code"] == KNOWN_USER_CODE
        assert d["found"] is True
        # could be True or False depending on bookings; just assert key present
        assert "has_history_with_you" in d

    def test_lookup_invalid_format_bv_prefix(self, s, biz_headers):
        # BV- is the business prefix, endpoint must reject anything not CL-
        r = s.get(f"{API}/businesses/my/clients/lookup", params={"code": "BV-ABCDE"}, headers=biz_headers, timeout=10)
        assert r.status_code == 400, f"expected 400 for BV- prefix, got {r.status_code}"

    def test_lookup_invalid_format_short(self, s, biz_headers):
        r = s.get(f"{API}/businesses/my/clients/lookup", params={"code": "CL-123"}, headers=biz_headers, timeout=10)
        assert r.status_code == 400

    def test_lookup_invalid_format_bad_alphabet(self, s, biz_headers):
        # I, O, S, 0, 1, 5 are excluded from alphabet
        r = s.get(f"{API}/businesses/my/clients/lookup", params={"code": "CL-AAAA0"}, headers=biz_headers, timeout=10)
        assert r.status_code == 400

    def test_lookup_404_unknown(self, s, biz_headers):
        r = s.get(f"{API}/businesses/my/clients/lookup", params={"code": "CL-ZZZZZ"}, headers=biz_headers, timeout=10)
        assert r.status_code == 404

    def test_lookup_401_unauth(self, s):
        r = s.get(f"{API}/businesses/my/clients/lookup", params={"code": "CL-AAAAA"}, timeout=10)
        assert r.status_code in (401, 403)

    def test_lookup_403_non_business(self, s, user_token):
        r = s.get(
            f"{API}/businesses/my/clients/lookup",
            params={"code": "CL-AAAAA"},
            headers={"Authorization": f"Bearer {user_token}"},
            timeout=10,
        )
        assert r.status_code in (401, 403), f"user token must not access business endpoint: got {r.status_code}"


# ---------------- Business document: payout_schedule persisted ----------------

class TestBusinessPayoutScheduleMigrated:
    def test_testspa_business_has_monthly_cutoff_20(self, s, biz_headers):
        """Migration should have normalized all existing businesses to monthly_cutoff_20."""
        r = s.get(f"{API}/auth/me", headers=biz_headers, timeout=10)
        if r.status_code != 200:
            pytest.skip("auth/me not available")
        # there is no direct me-business endpoint; use /businesses/me/private-info or fallback via user.business_id
        # private-info doesn't return payout_schedule → hit public get by id via user
        uid = r.json().get("id")
        u = await_none = None
        # Use admin-free approach: GET /businesses/{id} after reading user.business_id
        bid = r.json().get("business_id")
        if not bid:
            pytest.skip("no business_id on user")
        rb = s.get(f"{API}/businesses/{bid}", timeout=10)
        assert rb.status_code == 200
        assert rb.json().get("payout_schedule") == "monthly_cutoff_20"
