"""Phase 20 — Business legal expediente PDF tests.

Covers:
- GET /api/businesses/me/legal-file.pdf — owner happy-path returns valid PDF
  with X-Legal-File-Id + X-Legal-File-Hash and >30KB size.
- Auth gate: non-business users (consumer login) get 403.
- GET /api/businesses/verificar-expediente/{file_id} — public verify with
  valid id returns ok=true with masked rfc + 64-hex hash.
- Public verify with bad id returns ok=false + error message.
- Admin: GET /api/admin/businesses/{biz_id}/legal-file.pdf returns PDF.
- Persistence: db.business_legal_files row inserted per download.
- Audit: db.audit_logs entry with action=legal_file_download (owner+admin).
"""
import os
import re
import pyotp
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fall back to backend frontend env file
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

BUSINESS_OWNER_EMAIL = "testspa@test.com"
BUSINESS_OWNER_PWD = "Test123!"
NO_DEP_EMAIL = "testbiz_dashboard@test.com"
NO_DEP_PWD = "TestBiz123!"
ADMIN_EMAIL = "zamorachapa50@gmail.com"
ADMIN_PWD = "RainbowLol3133!"
CONSUMER_EMAIL = "test@example.com"
CONSUMER_PWD = "TestPass123!"


@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    return c[DB_NAME]


def _login(http, email, pwd):
    r = http.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd})
    if r.status_code != 200:
        return None
    return r.json().get("token")


@pytest.fixture(scope="module")
def owner_login(http):
    r = http.post(f"{BASE_URL}/api/auth/login",
                  json={"email": BUSINESS_OWNER_EMAIL, "password": BUSINESS_OWNER_PWD})
    if r.status_code != 200:
        pytest.skip("Cannot login owner")
    return r.json()


@pytest.fixture(scope="module")
def owner_token(owner_login):
    return owner_login["token"]


@pytest.fixture(scope="module")
def owner_business_id(owner_login):
    biz_id = owner_login.get("user", {}).get("business_id")
    if not biz_id:
        pytest.skip("No business_id on owner login response")
    return biz_id


@pytest.fixture(scope="module")
def admin_token(http, mongo):
    # Read TOTP secret from db
    admin_user = mongo.users.find_one({"email": ADMIN_EMAIL})
    if not admin_user or not admin_user.get("totp_secret"):
        pytest.skip("Admin TOTP secret not present in DB")
    code = pyotp.TOTP(admin_user["totp_secret"]).now()
    r = http.post(f"{BASE_URL}/api/auth/admin/login",
                  json={"email": ADMIN_EMAIL, "password": ADMIN_PWD, "totp_code": code})
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("token")


# --------------------------------------------------------- owner happy path

class TestOwnerLegalFile:

    def test_owner_download_returns_valid_pdf(self, http, owner_token, mongo):
        r = http.get(f"{BASE_URL}/api/businesses/me/legal-file.pdf",
                     headers={"Authorization": f"Bearer {owner_token}"})
        assert r.status_code == 200, r.text[:300]
        assert r.headers.get("content-type", "").startswith("application/pdf")

        file_id = r.headers.get("x-legal-file-id")
        file_hash = r.headers.get("x-legal-file-hash")
        assert file_id, "X-Legal-File-Id header missing"
        assert file_hash, "X-Legal-File-Hash header missing"
        assert re.fullmatch(r"[0-9a-f]{64}", file_hash), "hash must be 64-hex SHA-256"
        assert len(r.content) > 30 * 1024, f"PDF too small: {len(r.content)}"
        assert r.content[:4] == b"%PDF", "not a valid PDF magic header"

        # Persistence — verify db.business_legal_files row exists for this file_id
        row = mongo.business_legal_files.find_one({"id": file_id})
        assert row is not None, "no business_legal_files row persisted"
        assert row.get("content_hash") == file_hash
        assert row.get("pdf_size_bytes") == len(r.content)
        assert row.get("file_version") == "v1-2026-02"
        assert row.get("business_id")

        # Audit log — verify action=legal_file_download persisted
        audit = mongo.audit_logs.find_one(
            {"action": "legal_file_download", "details.file_id": file_id}
        )
        assert audit is not None, "audit log missing for owner download"
        assert audit["details"].get("by") == "owner"

        # store for cross-test reuse
        TestOwnerLegalFile.last_file_id = file_id
        TestOwnerLegalFile.last_hash = file_hash

    def test_consumer_user_rejected(self, http):
        tok = _login(http, CONSUMER_EMAIL, CONSUMER_PWD)
        if not tok:
            pytest.skip("Cannot login consumer test account")
        r = http.get(f"{BASE_URL}/api/businesses/me/legal-file.pdf",
                     headers={"Authorization": f"Bearer {tok}"})
        # require_business should reject non-business roles
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_unauthenticated_rejected(self, http):
        r = http.get(f"{BASE_URL}/api/businesses/me/legal-file.pdf")
        assert r.status_code in (401, 403)


# --------------------------------------------------------- public verify

class TestPublicVerify:

    def test_verify_valid_file_id(self, http, owner_token):
        # First trigger a download to obtain a known file_id
        r = http.get(f"{BASE_URL}/api/businesses/me/legal-file.pdf",
                     headers={"Authorization": f"Bearer {owner_token}"})
        assert r.status_code == 200
        file_id = r.headers.get("x-legal-file-id")
        content_hash = r.headers.get("x-legal-file-hash")

        # Public verify — no auth header
        v = requests.get(f"{BASE_URL}/api/businesses/verificar-expediente/{file_id}")
        assert v.status_code == 200, v.text
        body = v.json()
        assert body["ok"] is True
        assert body["file_id"] == file_id
        assert body["content_hash"] == content_hash
        assert body["file_version"] == "v1-2026-02"
        assert body.get("issued_at")
        # rfc_masked pattern: first 4 chars + bullets + last 3 chars
        assert re.match(r"^.{0,4}••••.{0,3}$", body["rfc_masked"]), body["rfc_masked"]
        assert "legal_name" in body
        assert "public_code" in body

    def test_verify_case_insensitive(self, http, owner_token):
        r = http.get(f"{BASE_URL}/api/businesses/me/legal-file.pdf",
                     headers={"Authorization": f"Bearer {owner_token}"})
        file_id = r.headers.get("x-legal-file-id")
        # try lowercase
        v = requests.get(f"{BASE_URL}/api/businesses/verificar-expediente/{file_id.lower()}")
        assert v.status_code == 200
        assert v.json()["ok"] is True

    def test_verify_bad_id(self):
        v = requests.get(f"{BASE_URL}/api/businesses/verificar-expediente/BADID000000XYZ")
        assert v.status_code == 200
        body = v.json()
        assert body["ok"] is False
        assert "error" in body and body["error"]


# --------------------------------------------------------- admin path

class TestAdminLegalFile:

    def test_admin_downloads_any_business_pdf(self, http, admin_token, owner_business_id, mongo):
        r = http.get(f"{BASE_URL}/api/admin/businesses/{owner_business_id}/legal-file.pdf",
                     headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text[:300]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        file_id = r.headers.get("x-legal-file-id")
        assert file_id
        assert len(r.content) > 30 * 1024
        assert r.content[:4] == b"%PDF"

        # Audit log: by=admin
        audit = mongo.audit_logs.find_one(
            {"action": "legal_file_download", "details.file_id": file_id}
        )
        assert audit is not None
        assert audit["details"].get("by") == "admin"

    def test_business_owner_blocked_from_admin_route(self, http, owner_token, owner_business_id):
        r = http.get(f"{BASE_URL}/api/admin/businesses/{owner_business_id}/legal-file.pdf",
                     headers={"Authorization": f"Bearer {owner_token}"})
        assert r.status_code in (401, 403)


# --------------------------------------------------------- no-deposit business

class TestNoDepositBusiness:

    def test_no_deposit_owner_can_still_download(self, http):
        tok = _login(http, NO_DEP_EMAIL, NO_DEP_PWD)
        if not tok:
            pytest.skip("Cannot login no-deposit owner")
        r = http.get(f"{BASE_URL}/api/businesses/me/legal-file.pdf",
                     headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 30 * 1024
