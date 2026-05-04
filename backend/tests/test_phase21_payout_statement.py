"""Phase 21 — Payout statement (estado de cuenta) PDF tests.

Covers:
- GET /api/businesses/me/settlements — owner sees own settlements list.
- GET /api/businesses/me/settlements/{id}/statement.pdf — owner happy path.
- Ownership enforcement: cross-business returns 404; bogus id returns 404.
- GET /api/admin/settlements/{id}/statement.pdf — admin can download any.
- Audit log persistence with action=payout_statement_download (owner+admin).
- X-Statement-Hash matches sha-256 in PDF (deterministic).
- Backward compat: legal-file endpoint still returns valid PDF (Phase 20).
"""
import os
import re
import pyotp
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
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

OWNER_EMAIL = "testspa@test.com"
OWNER_PWD = "Test123!"
OTHER_EMAIL = "testbiz_dashboard@test.com"
OTHER_PWD = "TestBiz123!"
ADMIN_EMAIL = "zamorachapa50@gmail.com"
ADMIN_PWD = "RainbowLol3133!"

KNOWN_SETTLEMENT_ID = "e77e2cdc-8358-47d8-93fc-c68acabe58a2"


@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def mongo():
    return MongoClient(MONGO_URL)[DB_NAME]


def _login(http, email, pwd):
    r = http.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd})
    if r.status_code != 200:
        return None
    return r.json().get("token")


@pytest.fixture(scope="module")
def owner_token(http):
    tok = _login(http, OWNER_EMAIL, OWNER_PWD)
    if not tok:
        pytest.skip("Cannot login owner")
    return tok


@pytest.fixture(scope="module")
def other_token(http):
    tok = _login(http, OTHER_EMAIL, OTHER_PWD)
    if not tok:
        pytest.skip("Cannot login other business")
    return tok


@pytest.fixture(scope="module")
def admin_token(http, mongo):
    user = mongo.users.find_one({"email": ADMIN_EMAIL})
    if not user or not user.get("totp_secret"):
        pytest.skip("Admin TOTP missing")
    code = pyotp.TOTP(user["totp_secret"]).now()
    r = http.post(
        f"{BASE_URL}/api/auth/admin/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PWD, "totp_code": code},
    )
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("token")


# ---------------------------------------------------------- list settlements
class TestListMySettlements:
    def test_owner_lists_their_settlements(self, http, owner_token):
        r = http.get(
            f"{BASE_URL}/api/businesses/me/settlements",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert "items" in body and isinstance(body["items"], list)
        assert body["count"] == len(body["items"])
        assert len(body["items"]) >= 1
        item = body["items"][0]
        for k in ("id", "period_key", "net_amount", "booking_count",
                  "transaction_count", "status", "created_at"):
            assert k in item, f"missing field {k}"
        assert isinstance(item["net_amount"], (int, float))

    def test_unauthenticated_rejected(self, http):
        r = http.get(f"{BASE_URL}/api/businesses/me/settlements")
        assert r.status_code in (401, 403)

    def test_other_business_no_overlap(self, http, owner_token, other_token):
        r1 = http.get(
            f"{BASE_URL}/api/businesses/me/settlements",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        r2 = http.get(
            f"{BASE_URL}/api/businesses/me/settlements",
            headers={"Authorization": f"Bearer {other_token}"},
        )
        assert r1.status_code == 200 and r2.status_code == 200
        ids1 = {x["id"] for x in r1.json()["items"]}
        ids2 = {x["id"] for x in r2.json()["items"]}
        assert ids1.isdisjoint(ids2)


# ---------------------------------------------------------- owner download
class TestOwnerDownload:
    def test_owner_download_known_settlement(self, http, owner_token, mongo):
        r = http.get(
            f"{BASE_URL}/api/businesses/me/settlements/{KNOWN_SETTLEMENT_ID}/statement.pdf",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        h = r.headers.get("x-statement-hash")
        assert h and re.fullmatch(r"[0-9a-f]{64}", h)
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 30 * 1024

        # Filename should include rfc + period_key
        cd = r.headers.get("content-disposition", "")
        assert "estado_de_cuenta" in cd.lower()
        assert "MX-2026-02" in cd or "2026-02" in cd

        # Audit log persisted with by=owner
        audit = mongo.audit_logs.find_one(
            {"action": "payout_statement_download",
             "target_id": KNOWN_SETTLEMENT_ID,
             "details.by": "owner"},
            sort=[("created_at", -1)],
        )
        assert audit is not None, "owner audit log missing"

    def test_owner_download_deterministic_hash(self, http, owner_token):
        r1 = http.get(
            f"{BASE_URL}/api/businesses/me/settlements/{KNOWN_SETTLEMENT_ID}/statement.pdf",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        r2 = http.get(
            f"{BASE_URL}/api/businesses/me/settlements/{KNOWN_SETTLEMENT_ID}/statement.pdf",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert r1.status_code == r2.status_code == 200
        # Hash should match across two downloads (same settlement data)
        assert r1.headers.get("x-statement-hash") == r2.headers.get("x-statement-hash")

    def test_owner_blocked_on_other_business_settlement(self, http, other_token):
        # KNOWN_SETTLEMENT_ID belongs to testspa, not testbiz_dashboard → 404
        r = http.get(
            f"{BASE_URL}/api/businesses/me/settlements/{KNOWN_SETTLEMENT_ID}/statement.pdf",
            headers={"Authorization": f"Bearer {other_token}"},
        )
        assert r.status_code == 404, f"expected 404, got {r.status_code}"

    def test_owner_404_on_bogus_id(self, http, owner_token):
        r = http.get(
            f"{BASE_URL}/api/businesses/me/settlements/does-not-exist-xyz/statement.pdf",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert r.status_code == 404

    def test_unauthenticated_rejected(self, http):
        r = http.get(
            f"{BASE_URL}/api/businesses/me/settlements/{KNOWN_SETTLEMENT_ID}/statement.pdf"
        )
        assert r.status_code in (401, 403)


# ---------------------------------------------------------- admin download
class TestAdminDownload:
    def test_admin_can_download_any_business_statement(self, http, admin_token, mongo):
        r = http.get(
            f"{BASE_URL}/api/admin/settlements/{KNOWN_SETTLEMENT_ID}/statement.pdf",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.headers.get("x-statement-hash")
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 30 * 1024

        audit = mongo.audit_logs.find_one(
            {"action": "payout_statement_download",
             "target_id": KNOWN_SETTLEMENT_ID,
             "details.by": "admin"},
            sort=[("created_at", -1)],
        )
        assert audit is not None, "admin audit log missing"

    def test_admin_404_on_bogus_id(self, http, admin_token):
        r = http.get(
            f"{BASE_URL}/api/admin/settlements/missing-xyz/statement.pdf",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 404

    def test_business_owner_blocked_from_admin_route(self, http, owner_token):
        r = http.get(
            f"{BASE_URL}/api/admin/settlements/{KNOWN_SETTLEMENT_ID}/statement.pdf",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert r.status_code in (401, 403)


# ---------------------------------------------------------- pdf content
class TestPdfContent:
    def test_pdf_has_period_label_and_deposit_date(self, http, owner_token):
        """RCA: the service splits period_key by '-' and takes [:2]. With db
        keys like 'MX-2026-02' this yields y='MX', m='2026' which makes the
        period label render as 'del 1 al 20 de 2026 de MX' and the deposit
        date as '—'. This test asserts the EXPECTED human-readable strings
        appear in the PDF text. If it fails, the period_key parsing in
        services/payout_statement.py is broken for the production format.
        """
        r = http.get(
            f"{BASE_URL}/api/businesses/me/settlements/{KNOWN_SETTLEMENT_ID}/statement.pdf",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert r.status_code == 200
        # Use pdfminer to extract text
        try:
            from pdfminer.high_level import extract_text
            import io as _io
            text = extract_text(_io.BytesIO(r.content))
        except ImportError:
            pytest.skip("pdfminer.six not installed")

        # For period_key 'MX-2026-02' the deposit should be 1 de marzo de 2026
        assert "marzo" in text.lower(), \
            f"deposit month not in PDF (period_key parsing likely broken). Snippet: {text[:500]!r}"
        assert "febrero" in text.lower(), \
            f"period month not in PDF. Snippet: {text[:500]!r}"


# ---------------------------------------------------------- backward compat
class TestBackwardCompat:
    def test_legal_file_phase20_still_works(self, http, owner_token):
        r = http.get(
            f"{BASE_URL}/api/businesses/me/legal-file.pdf",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.headers.get("x-legal-file-hash")
        assert len(r.content) > 30 * 1024
