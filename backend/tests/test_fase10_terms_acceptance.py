# Fase 10 - Terms & Conditions versioned acceptance
# Verifies:
#   - GET /api/terms/version (public): returns current version + summary + URLs
#   - GET /api/terms/me: requires auth; reports up_to_date flag correctly
#   - POST /api/terms/accept with empty body: accepts current version, persists it
#   - POST /api/terms/accept with wrong version: 409
#   - Business OWNER (is_manager=False) accepting updates db.businesses too
#   - Business MANAGER (is_manager=True) accepting only updates db.users
#   - Unauthenticated access to /terms/me and /terms/accept returns 401/403
#   - POST /api/auth/register stamps new clients with TERMS_VERSION + accepted_at
#   - POST /api/auth/business/register stamps BOTH db.users and db.businesses
import os
import sys
import time
import uuid
from datetime import datetime, timezone, timedelta

import pymongo
import pytest
import requests
import jwt as pyjwt

sys.path.insert(0, "/app/backend")


def _env(path: str, key: str):
    try:
        with open(path, "r") as f:
            for line in f:
                line = line.strip()
                if line.startswith(f"{key}="):
                    v = line.split("=", 1)[1].strip()
                    if v.startswith('"') and v.endswith('"'):
                        v = v[1:-1]
                    return v
    except Exception:
        return None
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or _env("/app/frontend/.env", "REACT_APP_BACKEND_URL") or "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL") or _env("/app/backend/.env", "MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or _env("/app/backend/.env", "DB_NAME")
JWT_SECRET = os.environ.get("JWT_SECRET") or _env("/app/backend/.env", "JWT_SECRET")

assert BASE_URL, "REACT_APP_BACKEND_URL not set"
assert MONGO_URL and DB_NAME, "MONGO_URL/DB_NAME not set"
assert JWT_SECRET, "JWT_SECRET not set"

mongo = pymongo.MongoClient(MONGO_URL)
db = mongo[DB_NAME]

TEST_PREFIX = "TEST_F10_"
EXPECTED_VERSION = "2026-05-01"

# Unique suffix for email fields used by POST /auth/register so the test can
# be rerun without colliding with residual rows.
RUN_TAG = uuid.uuid4().hex[:8]


def _mint(user_id: str, role: str, email: str, is_manager: bool = False) -> str:
    payload = {
        "user_id": user_id,
        "role": role,
        "email": email,
        "is_manager": is_manager,
        "exp": datetime.now(timezone.utc) + timedelta(hours=2),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")


# ========================== FIXTURES ==========================

@pytest.fixture(scope="module", autouse=True)
def seed_and_cleanup():
    """Create 1 client, 1 business owner (+ business doc), 1 business manager."""
    client_id = f"{TEST_PREFIX}client"
    owner_id = f"{TEST_PREFIX}owner"
    manager_id = f"{TEST_PREFIX}manager"
    owner_biz_id = f"{TEST_PREFIX}biz_owner"
    manager_biz_id = f"{TEST_PREFIX}biz_manager"

    db.users.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    db.businesses.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    db.users.delete_many({"email": {"$regex": f"{RUN_TAG}"}})
    db.businesses.delete_many({"email": {"$regex": f"{RUN_TAG}"}})

    # Client - never accepted T&C
    db.users.insert_one({
        "id": client_id,
        "email": f"{TEST_PREFIX}client@test.com",
        "role": "user",
        "full_name": "Test Client",
    })

    # Business owner (is_manager absent / false)
    db.users.insert_one({
        "id": owner_id,
        "email": f"{TEST_PREFIX}owner@test.com",
        "role": "business",
        "business_id": owner_biz_id,
        "is_manager": False,
        "full_name": "Test Owner",
    })
    db.businesses.insert_one({
        "id": owner_biz_id,
        "name": "TEST_F10 Owner Business",
        "email": f"{TEST_PREFIX}owner@test.com",
    })

    # Business manager (is_manager=True) tied to a different business
    db.users.insert_one({
        "id": manager_id,
        "email": f"{TEST_PREFIX}manager@test.com",
        "role": "business",
        "business_id": manager_biz_id,
        "is_manager": True,
        "full_name": "Test Manager",
    })
    db.businesses.insert_one({
        "id": manager_biz_id,
        "name": "TEST_F10 Manager Business",
        "email": f"{TEST_PREFIX}manager@test.com",
    })

    yield {
        "client_id": client_id,
        "owner_id": owner_id,
        "manager_id": manager_id,
        "owner_biz_id": owner_biz_id,
        "manager_biz_id": manager_biz_id,
    }

    # Teardown
    db.users.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    db.businesses.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    db.users.delete_many({"email": {"$regex": f"{RUN_TAG}"}})
    db.businesses.delete_many({"email": {"$regex": f"{RUN_TAG}"}})


# ========================== PUBLIC VERSION ENDPOINT ==========================

def test_version_endpoint_public_and_shape():
    r = requests.get(f"{BASE_URL}/api/terms/version", timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["version"] == EXPECTED_VERSION
    assert isinstance(body.get("summary"), str) and len(body["summary"]) > 0
    assert body["terms_url"] == "/terms"
    assert body["privacy_url"] == "/privacy"


# ========================== AUTH GATES ==========================

def test_me_requires_auth():
    r = requests.get(f"{BASE_URL}/api/terms/me", timeout=10)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code} {r.text}"


def test_accept_requires_auth():
    r = requests.post(f"{BASE_URL}/api/terms/accept", json={}, timeout=10)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code} {r.text}"


# ========================== /terms/me FOR NEW USER ==========================

def test_me_before_accept_reports_not_up_to_date(seed_and_cleanup):
    tok = _mint(seed_and_cleanup["client_id"], "user",
                f"{TEST_PREFIX}client@test.com")
    r = requests.get(f"{BASE_URL}/api/terms/me",
                     headers={"Authorization": f"Bearer {tok}"}, timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["current_version"] == EXPECTED_VERSION
    assert body["accepted_version"] is None
    assert body["accepted_at"] is None
    assert body["up_to_date"] is False


# ========================== ACCEPT FLOWS ==========================

def test_client_accept_empty_body_persists(seed_and_cleanup):
    client_id = seed_and_cleanup["client_id"]
    tok = _mint(client_id, "user", f"{TEST_PREFIX}client@test.com")
    r = requests.post(f"{BASE_URL}/api/terms/accept",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={}, timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["version"] == EXPECTED_VERSION
    assert isinstance(body["accepted_at"], str) and len(body["accepted_at"]) > 0
    # Verify persistence in Mongo
    u = db.users.find_one({"id": client_id}, {"_id": 0})
    assert u["accepted_terms_version"] == EXPECTED_VERSION
    assert u["accepted_terms_at"] == body["accepted_at"]

    # After accept, /me should be up_to_date
    r2 = requests.get(f"{BASE_URL}/api/terms/me",
                      headers={"Authorization": f"Bearer {tok}"}, timeout=10)
    assert r2.status_code == 200
    b2 = r2.json()
    assert b2["accepted_version"] == EXPECTED_VERSION
    assert b2["up_to_date"] is True


def test_accept_wrong_version_409(seed_and_cleanup):
    tok = _mint(seed_and_cleanup["client_id"], "user",
                f"{TEST_PREFIX}client@test.com")
    r = requests.post(f"{BASE_URL}/api/terms/accept",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={"version": "2999-01-01"}, timeout=10)
    assert r.status_code == 409, r.text
    assert "mismatch" in (r.json().get("detail") or "").lower() \
        or "version" in (r.json().get("detail") or "").lower()


def test_business_owner_accept_mirrors_on_business_doc(seed_and_cleanup):
    owner_id = seed_and_cleanup["owner_id"]
    biz_id = seed_and_cleanup["owner_biz_id"]
    # Ensure business doc starts clean
    db.businesses.update_one({"id": biz_id},
                             {"$unset": {"accepted_terms_version": "",
                                         "accepted_terms_at": ""}})

    tok = _mint(owner_id, "business", f"{TEST_PREFIX}owner@test.com",
                is_manager=False)
    r = requests.post(f"{BASE_URL}/api/terms/accept",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={}, timeout=10)
    assert r.status_code == 200, r.text

    u = db.users.find_one({"id": owner_id}, {"_id": 0})
    b = db.businesses.find_one({"id": biz_id}, {"_id": 0})
    assert u["accepted_terms_version"] == EXPECTED_VERSION
    assert b.get("accepted_terms_version") == EXPECTED_VERSION
    assert b.get("accepted_terms_at") == u["accepted_terms_at"]


def test_business_manager_accept_only_updates_user(seed_and_cleanup):
    mgr_id = seed_and_cleanup["manager_id"]
    biz_id = seed_and_cleanup["manager_biz_id"]
    db.businesses.update_one({"id": biz_id},
                             {"$unset": {"accepted_terms_version": "",
                                         "accepted_terms_at": ""}})

    tok = _mint(mgr_id, "business", f"{TEST_PREFIX}manager@test.com",
                is_manager=True)
    r = requests.post(f"{BASE_URL}/api/terms/accept",
                      headers={"Authorization": f"Bearer {tok}"},
                      json={}, timeout=10)
    assert r.status_code == 200, r.text

    u = db.users.find_one({"id": mgr_id}, {"_id": 0})
    b = db.businesses.find_one({"id": biz_id}, {"_id": 0})
    assert u["accepted_terms_version"] == EXPECTED_VERSION
    assert "accepted_terms_version" not in b, \
        f"Manager should NOT mirror on business doc, got {b.get('accepted_terms_version')}"


# ========================== REGISTER STAMPS VERSION ==========================

def test_register_user_stamps_terms_version():
    email = f"TEST_F10_reg_{RUN_TAG}@test.com"
    payload = {
        "email": email,
        "password": "TestPass123!",
        "full_name": "Test F10 Register",
        "phone": "+525512345678",
        "country": "MX",
        "city": "CDMX",
        "birth_date": "1990-01-01",
        "gender": "other",
        "preferred_language": "es",
    }
    r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    u = db.users.find_one({"email": email}, {"_id": 0})
    assert u is not None, "user not created in Mongo"
    assert u.get("accepted_terms_version") == EXPECTED_VERSION
    assert isinstance(u.get("accepted_terms_at"), str) and "T" in u["accepted_terms_at"]


def test_register_business_stamps_terms_version_on_user_and_business():
    email = f"TEST_F10_bizreg_{RUN_TAG}@test.com"
    # Pick an existing category so category_id validation (if any) passes;
    # fall back to a placeholder string if none exists.
    cat = db.categories.find_one({}, {"_id": 0, "id": 1})
    category_id = (cat or {}).get("id") or "generic"

    payload = {
        "name": "TEST F10 Biz",
        "email": email,
        "password": "TestPass123!",
        "phone": "+525512345679",
        "description": "Test business created by fase10 test",
        "category_id": category_id,
        "address": "Calle Falsa 123",
        "city": "CDMX",
        "state": "CDMX",
        "country": "MX",
        "zip_code": "01000",
        "rfc": "XAXX010101000",
        "clabe": "012345678901234567",
        "legal_name": "Test F10 Business SA de CV",
        "owner_birth_date": "1985-01-01",
        "timezone": "America/Mexico_City",
        "plan_type": "basic",
    }
    r = requests.post(f"{BASE_URL}/api/auth/business/register",
                      json=payload, timeout=20)
    assert r.status_code == 200, f"business register failed: {r.status_code} {r.text}"
    body = r.json()
    business_id = body.get("business_id")
    assert business_id, "no business_id returned"

    u = db.users.find_one({"email": email}, {"_id": 0})
    b = db.businesses.find_one({"id": business_id}, {"_id": 0})
    assert u is not None and b is not None
    assert u.get("accepted_terms_version") == EXPECTED_VERSION
    assert isinstance(u.get("accepted_terms_at"), str)
    assert b.get("accepted_terms_version") == EXPECTED_VERSION
    assert isinstance(b.get("accepted_terms_at"), str)
