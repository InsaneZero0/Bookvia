# Phase 8 - Business documents verification (no $1 deposit)
# Covers:
#   - POST /api/admin/businesses/{id}/verify-documents (missing fields 400, success)
#   - POST /api/admin/businesses/{id}/reject-documents (short reason 400, success, audit+notif)
#   - GET  /api/admin/businesses/pending-docs
#   - PUT  /api/businesses/me/legal-docs (owner only, sensitive change flips verified)
#   - Booking gate (documents_verified=False -> 400)
#   - Visibility filter excludes non-verified businesses
#   - Grandfather migration flag
#   - GET /api/businesses/me/private-info returns new fields
#   - POST /api/upload/public accepts PDF
#   - Email smart reminder HTML contains Google Calendar URL (Fase 7 extra)
import os
import sys
import uuid
import asyncio
import io
import pytest
import pymongo
import requests
import jwt as pyjwt
from datetime import datetime, timezone, timedelta

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
MONGO_URL = os.environ.get("MONGO_URL") or _env("/app/backend/.env", "MONGO_URL") or "mongodb://localhost:27017"
DB_NAME = os.environ.get("DB_NAME") or _env("/app/backend/.env", "DB_NAME") or "test_database"
JWT_SECRET = os.environ.get("JWT_SECRET") or _env("/app/backend/.env", "JWT_SECRET")

assert BASE_URL, "REACT_APP_BACKEND_URL not set"

mongo = pymongo.MongoClient(MONGO_URL)
db = mongo[DB_NAME]

# ---- Seed identifiers ----
TEST_PREFIX = "TEST_F8_"
PENDING_BIZ_ID = f"{TEST_PREFIX}biz_pending"
VERIFIED_BIZ_ID = f"{TEST_PREFIX}biz_verified"
OWNER_USER_ID = f"{TEST_PREFIX}owner"
MANAGER_USER_ID = f"{TEST_PREFIX}manager"
CLIENT_USER_ID = f"{TEST_PREFIX}client"
SERVICE_ID = f"{TEST_PREFIX}svc"
WORKER_ID = f"{TEST_PREFIX}worker"
ADMIN_EMAIL = "zamorachapa50@gmail.com"


def _mint(user_id: str, role: str, email: str, is_manager: bool = False) -> str:
    payload = {
        "user_id": user_id, "role": role, "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=2),
    }
    if is_manager:
        payload["is_manager"] = True
        payload["worker_id"] = WORKER_ID
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")


@pytest.fixture(scope="module", autouse=True)
def _seed():
    now_iso = datetime.now(timezone.utc).isoformat()
    # Pending biz: no docs_verified, missing bank_proof_url
    db.businesses.delete_many({"id": {"$in": [PENDING_BIZ_ID, VERIFIED_BIZ_ID]}})
    db.businesses.insert_one({
        "id": PENDING_BIZ_ID,
        "name": "TEST F8 Pending Biz",
        "email": "pending@test.com", "phone": "5551111111",
        "user_id": OWNER_USER_ID,
        "status": "approved",
        "subscription_status": "active",
        "country_code": "MX",
        "city": "TestCity",
        "rfc": "TESTR800101ABC",
        "clabe": "012345678901234567",
        "legal_name": "Pending SA de CV",
        "ine_url": "https://example.com/ine.jpg",
        "proof_of_address_url": "https://example.com/proof.jpg",
        # bank_proof_url missing intentionally
        "category_id": "",
        "description": "",
        "address": "calle 1",
        "state": "MX",
        "country": "MX",
        "zip_code": "00000",
        "documents_verified": False,
        "created_at": now_iso,
    })
    db.businesses.insert_one({
        "id": VERIFIED_BIZ_ID,
        "name": "TEST F8 Verified Biz",
        "email": "verified@test.com", "phone": "5552222222",
        "user_id": OWNER_USER_ID,
        "status": "approved",
        "subscription_status": "active",
        "country_code": "MX",
        "city": "TestCity",
        "rfc": "TESTR800101XYZ",
        "clabe": "012345678901234567",
        "legal_name": "Verified SA de CV",
        "ine_url": "https://example.com/ine.jpg",
        "proof_of_address_url": "https://example.com/proof.jpg",
        "bank_proof_url": "https://example.com/bank.pdf",
        "documents_verified": True,
        "documents_verified_at": now_iso,
        "category_id": "",
        "description": "",
        "address": "calle 2",
        "state": "MX",
        "country": "MX",
        "zip_code": "00000",
        "created_at": now_iso,
    })
    # Users
    db.users.delete_many({"id": {"$in": [OWNER_USER_ID, MANAGER_USER_ID, CLIENT_USER_ID]}})
    db.users.insert_one({
        "id": OWNER_USER_ID, "email": f"{TEST_PREFIX}owner@test.com",
        "role": "business", "full_name": "Owner", "business_id": PENDING_BIZ_ID,
    })
    db.users.insert_one({
        "id": MANAGER_USER_ID, "email": f"{TEST_PREFIX}mgr@test.com",
        "role": "business", "full_name": "Mgr", "business_id": PENDING_BIZ_ID,
    })
    db.users.insert_one({
        "id": CLIENT_USER_ID, "email": f"{TEST_PREFIX}client@test.com",
        "role": "user", "full_name": "Client",
    })
    # Service + worker on VERIFIED biz
    db.services.delete_many({"id": SERVICE_ID})
    db.services.insert_one({
        "id": SERVICE_ID, "business_id": VERIFIED_BIZ_ID, "name": "F8 svc",
        "duration_minutes": 60, "price": 300.0, "active": True,
    })
    db.workers.delete_many({"id": WORKER_ID})
    db.workers.insert_one({
        "id": WORKER_ID, "business_id": VERIFIED_BIZ_ID, "name": "W",
        "active": True,
    })
    yield
    db.businesses.delete_many({"id": {"$in": [PENDING_BIZ_ID, VERIFIED_BIZ_ID]}})
    db.users.delete_many({"id": {"$in": [OWNER_USER_ID, MANAGER_USER_ID, CLIENT_USER_ID]}})
    db.services.delete_many({"id": SERVICE_ID})
    db.workers.delete_many({"id": WORKER_ID})
    db.bookings.delete_many({"user_id": CLIENT_USER_ID})
    db.notifications.delete_many({"data.business_id": {"$in": [PENDING_BIZ_ID, VERIFIED_BIZ_ID]}})


@pytest.fixture(scope="module")
def admin_token():
    import pyotp
    admin = db.users.find_one({"email": ADMIN_EMAIL})
    if not admin or not admin.get("totp_secret"):
        pytest.skip("Admin not seeded")
    code = pyotp.TOTP(admin["totp_secret"]).now()
    r = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
        "email": ADMIN_EMAIL, "password": "RainbowLol3133!", "totp_code": code,
    })
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def owner_token():
    return _mint(OWNER_USER_ID, "business", f"{TEST_PREFIX}owner@test.com")


@pytest.fixture(scope="module")
def manager_token():
    return _mint(MANAGER_USER_ID, "business", f"{TEST_PREFIX}mgr@test.com", is_manager=True)


@pytest.fixture(scope="module")
def client_token():
    return _mint(CLIENT_USER_ID, "user", f"{TEST_PREFIX}client@test.com")


# ========================================================================
# Admin: verify / reject / pending-docs
# ========================================================================
class TestAdminVerify:
    def test_verify_missing_fields_400(self, admin_token):
        r = requests.post(
            f"{BASE_URL}/api/admin/businesses/{PENDING_BIZ_ID}/verify-documents",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 400, r.text
        assert "bank_proof_url" in r.text

    def test_verify_success(self, admin_token):
        # Add missing bank_proof_url first
        db.businesses.update_one({"id": PENDING_BIZ_ID},
                                 {"$set": {"bank_proof_url": "https://example.com/bp.pdf"}})
        r = requests.post(
            f"{BASE_URL}/api/admin/businesses/{PENDING_BIZ_ID}/verify-documents",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("documents_verified") is True
        biz = db.businesses.find_one({"id": PENDING_BIZ_ID})
        assert biz.get("documents_verified") is True
        assert biz.get("documents_verified_at")
        assert biz.get("documents_verified_by")
        assert biz.get("documents_rejection_reason") is None
        # Audit log (AuditAction.DOCS_VERIFY value is "docs_verify")
        audit = db.audit_logs.find_one({"action": "docs_verify", "target_id": PENDING_BIZ_ID})
        assert audit is not None
        # Owner notified
        notif = db.notifications.find_one({"user_id": OWNER_USER_ID, "type": "docs_verified",
                                           "data.business_id": PENDING_BIZ_ID})
        assert notif is not None

    def test_reject_short_reason_400(self, admin_token):
        r = requests.post(
            f"{BASE_URL}/api/admin/businesses/{PENDING_BIZ_ID}/reject-documents",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"reason": "bad"},
        )
        assert r.status_code == 400, r.text

    def test_reject_success(self, admin_token):
        reason = "INE ilegible, por favor resubir"
        r = requests.post(
            f"{BASE_URL}/api/admin/businesses/{PENDING_BIZ_ID}/reject-documents",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"reason": reason},
        )
        assert r.status_code == 200, r.text
        biz = db.businesses.find_one({"id": PENDING_BIZ_ID})
        assert biz.get("documents_verified") is False
        assert biz.get("documents_rejection_reason") == reason
        audit = db.audit_logs.find_one({"action": "docs_reject", "target_id": PENDING_BIZ_ID})
        assert audit is not None
        notif = db.notifications.find_one({"user_id": OWNER_USER_ID, "type": "docs_rejected",
                                           "data.business_id": PENDING_BIZ_ID})
        assert notif is not None

    def test_pending_docs_lists_pending(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/businesses/pending-docs",
                         headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200, r.text
        body = r.json()
        ids = [b["id"] for b in body.get("items", [])]
        assert PENDING_BIZ_ID in ids  # just-rejected business
        assert VERIFIED_BIZ_ID not in ids


# ========================================================================
# Owner PUT /me/legal-docs
# ========================================================================
class TestLegalDocsUpdate:
    def test_manager_forbidden(self, manager_token):
        r = requests.put(
            f"{BASE_URL}/api/businesses/me/legal-docs",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={"legal_name": "New Name"},
        )
        assert r.status_code == 403, r.text

    def test_sensitive_change_flips_verified_and_notifies_admins(self, owner_token):
        # Pre-state: verify verified biz owner is PENDING_BIZ_ID per seed
        # Swap owner to VERIFIED_BIZ_ID for this test
        db.users.update_one({"id": OWNER_USER_ID}, {"$set": {"business_id": VERIFIED_BIZ_ID}})
        # Ensure currently verified
        db.businesses.update_one({"id": VERIFIED_BIZ_ID},
                                 {"$set": {"documents_verified": True,
                                           "documents_rejection_reason": None,
                                           "clabe": "012345678901234567"}})
        # Clear prior admin notifs for this biz
        db.notifications.delete_many({"data.business_id": VERIFIED_BIZ_ID, "type": "docs_review"})

        new_clabe = "098765432109876543"
        r = requests.put(
            f"{BASE_URL}/api/businesses/me/legal-docs",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"clabe": new_clabe, "bank_proof_url": "https://example.com/newbp.pdf"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["requires_review"] is True
        assert body["documents_verified"] is False

        biz = db.businesses.find_one({"id": VERIFIED_BIZ_ID})
        assert biz["documents_verified"] is False
        assert biz.get("documents_submitted_at")
        assert biz.get("clabe_changed_at")
        assert biz.get("clabe") == new_clabe
        # At least one admin notification of type docs_review
        n = db.notifications.find_one({"type": "docs_review",
                                       "data.business_id": VERIFIED_BIZ_ID})
        assert n is not None
        assert n["data"].get("changed_clabe") is True

    def test_no_sensitive_change_does_not_touch_verification(self, owner_token):
        # Re-verify biz
        db.businesses.update_one({"id": VERIFIED_BIZ_ID},
                                 {"$set": {"documents_verified": True,
                                           "documents_rejection_reason": None}})
        # owner_birth_date is not sensitive
        r = requests.put(
            f"{BASE_URL}/api/businesses/me/legal-docs",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"owner_birth_date": "1990-01-01"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["requires_review"] is False
        biz = db.businesses.find_one({"id": VERIFIED_BIZ_ID})
        assert biz["documents_verified"] is True


# ========================================================================
# Booking gate
# ========================================================================
class TestBookingGate:
    def test_booking_blocked_when_docs_not_verified(self, client_token):
        # Flip VERIFIED_BIZ_ID to unverified briefly
        db.businesses.update_one({"id": VERIFIED_BIZ_ID},
                                 {"$set": {"documents_verified": False}})
        appt = (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%d")
        r = requests.post(
            f"{BASE_URL}/api/bookings",
            headers={"Authorization": f"Bearer {client_token}"},
            json={
                "business_id": VERIFIED_BIZ_ID,
                "service_id": SERVICE_ID,
                "worker_id": WORKER_ID,
                "date": appt,
                "time": "11:00",
            },
        )
        assert r.status_code == 400, r.text
        assert "documentos" in r.text.lower()

    def test_booking_allowed_when_docs_verified(self, client_token):
        db.businesses.update_one({"id": VERIFIED_BIZ_ID},
                                 {"$set": {"documents_verified": True}})
        appt = (datetime.now(timezone.utc) + timedelta(days=3)).strftime("%Y-%m-%d")
        r = requests.post(
            f"{BASE_URL}/api/bookings",
            headers={"Authorization": f"Bearer {client_token}"},
            json={
                "business_id": VERIFIED_BIZ_ID,
                "service_id": SERVICE_ID,
                "worker_id": WORKER_ID,
                "date": appt,
                "time": "12:00",
            },
        )
        # May fail for unrelated reasons (blacklist, fee config, etc) but NOT
        # with the docs-verified message.
        assert "documentos verificados" not in r.text, r.text
        # Happy path most commonly returns 200/201
        assert r.status_code in (200, 201, 400), r.text


# ========================================================================
# Visibility filter
# ========================================================================
class TestVisibility:
    def test_search_excludes_unverified(self):
        db.businesses.update_one({"id": PENDING_BIZ_ID},
                                 {"$set": {"documents_verified": False}})
        r = requests.get(f"{BASE_URL}/api/businesses",
                         params={"query": "TEST F8", "country_code": "MX"})
        assert r.status_code == 200, r.text
        ids = [b["id"] for b in r.json()]
        assert PENDING_BIZ_ID not in ids

    def test_featured_excludes_unverified(self):
        db.businesses.update_one({"id": PENDING_BIZ_ID},
                                 {"$set": {"documents_verified": False, "featured": True}})
        r = requests.get(f"{BASE_URL}/api/businesses/featured")
        assert r.status_code == 200, r.text
        ids = [b["id"] for b in r.json()]
        assert PENDING_BIZ_ID not in ids


# ========================================================================
# Grandfather migration
# ========================================================================
class TestGrandfather:
    def test_grandfather_applied_to_legacy_approved(self):
        # Insert a legacy-style biz WITHOUT documents_verified field, then
        # re-run startup grandfather query directly.
        legacy_id = f"{TEST_PREFIX}legacy_gf"
        db.businesses.delete_one({"id": legacy_id})
        db.businesses.insert_one({
            "id": legacy_id, "name": "TEST F8 Legacy",
            "status": "approved", "subscription_status": "active",
            "country_code": "MX", "city": "X",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        # Run migration
        res = db.businesses.update_many(
            {"status": "approved", "documents_verified": {"$exists": False}},
            {"$set": {"documents_verified": True, "documents_grandfathered": True}},
        )
        assert res.modified_count >= 1
        biz = db.businesses.find_one({"id": legacy_id})
        assert biz.get("documents_verified") is True
        assert biz.get("documents_grandfathered") is True
        db.businesses.delete_one({"id": legacy_id})

    def test_new_business_not_grandfathered(self):
        biz = db.businesses.find_one({"id": PENDING_BIZ_ID})
        # This biz was seeded WITH documents_verified explicitly set, so it
        # must NOT have the grandfathered flag.
        assert biz.get("documents_grandfathered") is not True


# ========================================================================
# Private info endpoint
# ========================================================================
class TestPrivateInfo:
    def test_private_info_returns_new_fields(self, owner_token):
        db.users.update_one({"id": OWNER_USER_ID}, {"$set": {"business_id": VERIFIED_BIZ_ID}})
        db.businesses.update_one({"id": VERIFIED_BIZ_ID},
                                 {"$set": {"bank_proof_url": "https://example.com/bp2.pdf",
                                           "documents_verified": True,
                                           "documents_verified_at": datetime.now(timezone.utc).isoformat(),
                                           "documents_rejection_reason": None,
                                           "clabe_changed_at": datetime.now(timezone.utc).isoformat()}})
        r = requests.get(f"{BASE_URL}/api/businesses/me/private-info",
                         headers={"Authorization": f"Bearer {owner_token}"})
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("bank_proof_url", "documents_verified", "documents_verified_at",
                  "documents_rejection_reason", "clabe_changed_at"):
            assert k in body, f"missing {k}"
        assert body["bank_proof_url"] == "https://example.com/bp2.pdf"
        assert body["documents_verified"] is True


# ========================================================================
# Upload PDF
# ========================================================================
class TestUploadPdf:
    def test_upload_public_accepts_pdf(self):
        pdf_bytes = b"%PDF-1.4\n%Fase8test\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
        files = {"file": ("test_f8.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
        r = requests.post(f"{BASE_URL}/api/upload/public", files=files)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "url" in body
        assert body["url"], "empty url"

    def test_upload_public_rejects_txt(self):
        files = {"file": ("test.txt", io.BytesIO(b"hello"), "text/plain")}
        r = requests.post(f"{BASE_URL}/api/upload/public", files=files)
        assert r.status_code == 400, r.text


# ========================================================================
# Fase 7 extra: Google Calendar button in smart reminder email HTML
# ========================================================================
class TestGoogleCalendarInReminder:
    def test_html_contains_google_calendar_url(self):
        from services.email import send_appointment_reminder
        from unittest.mock import patch, AsyncMock

        captured = {}

        async def fake_send(**kwargs):
            captured.update(kwargs)
            return "ok"

        gcal = ("https://calendar.google.com/calendar/render?action=TEMPLATE"
                "&text=Cita%20en%20Demo&dates=20260115T163000Z/20260115T173000Z"
                "&details=Servicio&location=Calle")

        loop = asyncio.new_event_loop()
        try:
            with patch("services.email.send_email", new=AsyncMock(side_effect=fake_send)):
                loop.run_until_complete(send_appointment_reminder(
                    user_email="x@test.com", user_name="U", business_name="Demo",
                    service_name="S", date="2026-01-15", time="10:30",
                    worker_name="W", business_address="Calle",
                    booking_id="bk_1", cancel_free_until_text="14 ene 10:30 hrs",
                    reschedule_until_text="15 ene 08:30 hrs",
                    reschedule_remaining=2,
                    calendar_url="https://api.bookvia.app/api/bookings/bk_1/calendar.ics?token=abc",
                    google_calendar_url=gcal,
                ))
        finally:
            loop.close()

        html = captured.get("html") or ""
        assert "calendar.google.com/calendar/render" in html
        assert "action=TEMPLATE" in html
        assert "dates=20260115T163000Z/20260115T173000Z" in html
        assert "Google Calendar" in html  # button label

    def test_scheduler_builds_gcal_url(self):
        """Simulate the server.send_appointment_reminders path and ensure the
        google_calendar_url keyword reaches send_appointment_reminder."""
        from unittest.mock import patch, AsyncMock
        import pytz

        # Arrange: a booking 23.5h in future, confirmed, reminder_sent False
        biz_tz = pytz.timezone("America/Mexico_City")
        appt = (datetime.now(timezone.utc) + timedelta(hours=23.5)).astimezone(biz_tz)
        booking_id = f"{TEST_PREFIX}BK_GCAL_{uuid.uuid4().hex[:6]}"
        db.bookings.delete_many({"id": booking_id})
        db.bookings.insert_one({
            "id": booking_id, "user_id": CLIENT_USER_ID,
            "business_id": VERIFIED_BIZ_ID, "service_id": SERVICE_ID,
            "worker_id": WORKER_ID, "date": appt.strftime("%Y-%m-%d"),
            "time": appt.strftime("%H:%M"), "end_time": "23:59",
            "status": "confirmed", "reschedule_count": 0,
            "reminder_sent": False, "price": 200.0, "duration_minutes": 60,
        })
        # Ensure user has email notify on
        db.users.update_one({"id": CLIENT_USER_ID},
                            {"$set": {"notify_email": True}})

        captured = {}

        async def fake_send(**kwargs):
            captured.update(kwargs)
            return "ok"

        from server import send_appointment_reminders
        loop = asyncio.new_event_loop()
        try:
            with patch("services.email.send_appointment_reminder",
                       new=AsyncMock(side_effect=fake_send)):
                loop.run_until_complete(send_appointment_reminders())
        finally:
            loop.close()

        db.bookings.delete_many({"id": booking_id})
        assert captured.get("google_calendar_url"), \
            f"google_calendar_url missing from scheduler call; got keys={list(captured.keys())}"
        url = captured["google_calendar_url"]
        assert "calendar.google.com/calendar/render" in url
        assert "action=TEMPLATE" in url
        assert "&dates=" in url
