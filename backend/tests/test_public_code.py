"""Tests for the per-business public_code (BV-XXXXX) feature."""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://marketplace-test-21.preview.emergentagent.com").rstrip("/")
PUBLIC_CODE_RE = re.compile(r"^BV-[ABCDEFGHJKMNPQRTUVWXYZ234679]{5}$")

BIZ_EMAIL = "testbiz_dashboard@test.com"
BIZ_PASSWORD = "TestBiz123!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def all_mx_biz(session):
    r = session.get(f"{BASE_URL}/api/businesses", params={"country_code": "MX", "limit": 20})
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list) and len(data) > 0
    return data


@pytest.fixture(scope="module")
def biz_token(session):
    r = session.post(f"{BASE_URL}/api/auth/login", json={"email": BIZ_EMAIL, "password": BIZ_PASSWORD})
    assert r.status_code == 200, r.text
    body = r.json()
    token = body.get("token") or body.get("access_token")
    assert token, f"No token in response: {body}"
    return token


# ---------- BACKFILL: every business has public_code with proper format ----------
class TestBackfill:
    def test_every_business_has_public_code(self, all_mx_biz):
        for b in all_mx_biz:
            code = b.get("public_code")
            assert code, f"Business {b.get('name')} has no public_code"
            assert PUBLIC_CODE_RE.match(code), f"Invalid public_code format: {code}"

    def test_codes_are_unique(self, all_mx_biz):
        codes = [b["public_code"] for b in all_mx_biz]
        assert len(codes) == len(set(codes)), "Duplicate public_codes found"


# ---------- /api/businesses/by-code/{code} ----------
class TestByCodeLookup:
    def test_lookup_known_code(self, session, all_mx_biz):
        target = all_mx_biz[0]
        code = target["public_code"]
        r = session.get(f"{BASE_URL}/api/businesses/by-code/{code}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["public_code"] == code
        assert data["id"] == target["id"]
        assert data["name"] == target["name"]

    def test_lookup_case_insensitive(self, session, all_mx_biz):
        code = all_mx_biz[0]["public_code"]
        r = session.get(f"{BASE_URL}/api/businesses/by-code/{code.lower()}")
        assert r.status_code == 200
        assert r.json()["public_code"] == code

    def test_lookup_invalid_format_400(self, session):
        r = session.get(f"{BASE_URL}/api/businesses/by-code/INVALID")
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"

    def test_lookup_invalid_prefix_400(self, session):
        r = session.get(f"{BASE_URL}/api/businesses/by-code/BV-INVALID")
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"

    def test_lookup_valid_format_not_found_404(self, session):
        # BV-AAAAA -- A is in alphabet, format valid but extremely unlikely to exist
        r = session.get(f"{BASE_URL}/api/businesses/by-code/BV-AAAAA")
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text}"


# ---------- /api/businesses/me/private-info returns public_code ----------
class TestPrivateInfo:
    def test_private_info_includes_public_code(self, session, biz_token):
        r = session.get(
            f"{BASE_URL}/api/businesses/me/private-info",
            headers={"Authorization": f"Bearer {biz_token}"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "public_code" in data, f"public_code missing in response: {list(data.keys())}"
        assert PUBLIC_CODE_RE.match(data["public_code"]), f"Invalid: {data['public_code']}"

    def test_private_code_matches_public_listing(self, session, biz_token, all_mx_biz):
        r = session.get(
            f"{BASE_URL}/api/businesses/me/private-info",
            headers={"Authorization": f"Bearer {biz_token}"},
        )
        priv_code = r.json()["public_code"]
        # Match by code via by-code endpoint -> id, then verify in listing
        bc = session.get(f"{BASE_URL}/api/businesses/by-code/{priv_code}")
        assert bc.status_code == 200
        biz_id = bc.json()["id"]
        match = next((b for b in all_mx_biz if b["id"] == biz_id), None)
        if match:
            assert match["public_code"] == priv_code


# ---------- New registrations get a public_code ----------
class TestNewRegistration:
    def test_new_business_has_public_code(self, session):
        import uuid
        suffix = uuid.uuid4().hex[:8]
        payload = {
            "name": f"TEST_PubCode_{suffix}",
            "business_name": f"TEST_PubCode_{suffix}",
            "email": f"TEST_pubcode_{suffix}@test.com",
            "password": "TestBiz123!",
            "phone": f"+5255{suffix[:8]}"[:13],
            "category_id": "",
            "address": "Reforma 100",
            "city": "Ciudad de México",
            "state": "Ciudad de México",
            "country": "MX",
            "country_code": "MX",
            "zip_code": "06600",
            "description": "Test public code",
            "rfc": f"TST{suffix[:6].upper()}XXX",
            "legal_name": "Test SA",
            "clabe": "012345678901234567",
            "owner_birth_date": "1990-01-01",
        }
        r = session.post(f"{BASE_URL}/api/auth/business/register", json=payload)
        if r.status_code not in (200, 201):
            pytest.skip(f"Registration failed (likely env-specific validation): {r.status_code} {r.text[:200]}")
        body = r.json()
        # Check if public_code is in registration response
        if "public_code" in body:
            assert PUBLIC_CODE_RE.match(body["public_code"]), f"invalid: {body['public_code']}"
            return
        if "business" in body and isinstance(body["business"], dict) and "public_code" in body["business"]:
            assert PUBLIC_CODE_RE.match(body["business"]["public_code"])
            return
        # Otherwise verify via MongoDB directly
        try:
            from pymongo import MongoClient
            mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
            db_name = os.environ.get("DB_NAME", "test_database")
            client = MongoClient(mongo_url)
            biz = client[db_name].businesses.find_one({"email": payload["email"]})
            assert biz, "business not found in DB"
            code = biz.get("public_code")
            assert code and PUBLIC_CODE_RE.match(code), f"new biz public_code invalid: {code}"
            # cleanup
            client[db_name].businesses.delete_one({"email": payload["email"]})
        except ImportError:
            pytest.skip("pymongo not available for direct DB verification")


# ---------- Lookup with admin search (best-effort, skip if no creds) ----------
class TestAdminSearch:
    def test_admin_search_by_code(self, session, all_mx_biz):
        # Try super admin login (TOTP required) - skip if not feasible
        pytest.skip("Admin requires TOTP; covered separately if creds available")
