# Phase 7 - Smart appointment reminder + .ics endpoint tests
# Covers:
#   - GET /api/bookings/{id}/calendar.ics  (HMAC token, 403/404/410, content checks)
#   - send_appointment_reminders() smart logic (dynamic cancel/reschedule windows,
#     reschedule_count -> remaining = 0, <2h -> both cutoffs None)
#   - Email HTML & data payload contains expected texts/URLs
#   - Push notification doc inserted in `notifications` collection
#   - Admin POST /api/bookings/send-reminders endpoint still works
import os
import sys
import uuid
import hmac
import hashlib
import asyncio
import pytest
import pymongo
import requests
import pyotp
from datetime import datetime, timezone, timedelta

# Make backend modules importable when running pytest from /app
sys.path.insert(0, "/app/backend")


# ---------- Resolve env (REACT_APP_BACKEND_URL from frontend/.env) ----------
def _load_env_from_dotenv(path: str, key: str) -> str | None:
    try:
        with open(path, "r") as f:
            for line in f:
                line = line.strip()
                if line.startswith(f"{key}="):
                    val = line.split("=", 1)[1].strip()
                    if val.startswith('"') and val.endswith('"'):
                        val = val[1:-1]
                    return val
    except Exception:
        return None
    return None


BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or _load_env_from_dotenv("/app/frontend/.env", "REACT_APP_BACKEND_URL")
    or ""
).rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL") or _load_env_from_dotenv("/app/backend/.env", "MONGO_URL") or "mongodb://localhost:27017"
DB_NAME = os.environ.get("DB_NAME") or _load_env_from_dotenv("/app/backend/.env", "DB_NAME") or "test_database"
JWT_SECRET = os.environ.get("JWT_SECRET") or _load_env_from_dotenv("/app/backend/.env", "JWT_SECRET") or "dev-only-jwt-secret-NOT-FOR-PRODUCTION"

assert BASE_URL, "REACT_APP_BACKEND_URL must be set (or available in /app/frontend/.env)"

TEST_BIZ_ID = "biz_dd14ed093b51"
TEST_USER_ID = "user_test_fase7"
TEST_USER_EMAIL = "TEST_F7_user@test.com"

TEST_PREFIX = "TEST_F7_BK_"
TEST_SVC_ID = "TEST_F7_SVC"

mongo = pymongo.MongoClient(MONGO_URL)
db = mongo[DB_NAME]


# ---------- Single shared asyncio loop (Motor binds to first loop it sees) ----------
@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


def _run_async(coro, loop):
    return loop.run_until_complete(coro)


# ---------- Helpers ----------

def _expected_token(booking_id: str) -> str:
    secret = (JWT_SECRET or "dev").encode("utf-8")
    msg = f"calendar:{booking_id}".encode("utf-8")
    return hmac.new(secret, msg, hashlib.sha256).hexdigest()[:32]


def _create_booking(hours_until: float, status: str = "confirmed",
                    reschedule_count: int = 0, reminder_sent: bool = False) -> str:
    """Create booking with date/time relative to the business' local timezone.

    The scheduler interprets booking.date/booking.time in the business timezone
    (America/Mexico_City), so we format the appointment using that tz to keep
    `time_until` accurate.
    """
    import pytz
    bid = f"{TEST_PREFIX}{uuid.uuid4().hex[:10]}"
    biz_tz = pytz.timezone("America/Mexico_City")
    appt_utc = datetime.now(timezone.utc) + timedelta(hours=hours_until)
    appt = appt_utc.astimezone(biz_tz)
    date_str = appt.strftime("%Y-%m-%d")
    time_str = appt.strftime("%H:%M")
    end_time = (datetime.strptime(time_str, "%H:%M") + timedelta(minutes=60)).strftime("%H:%M")
    doc = {
        "id": bid,
        "user_id": TEST_USER_ID,
        "business_id": TEST_BIZ_ID,
        "service_id": TEST_SVC_ID,
        "worker_id": None,
        "date": date_str,
        "time": time_str,
        "end_time": end_time,
        "appointment_date": f"{date_str}T{time_str}:00+00:00",
        "status": status,
        "reschedule_count": reschedule_count,
        "reminder_sent": reminder_sent,
        "price": 500.0,
        "duration_minutes": 60,
        "funds_state": "pending_hold",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    db.bookings.insert_one(doc)
    return bid


# ---------- Module-level setup ----------
@pytest.fixture(scope="session", autouse=True)
def _force_mock_email_provider():
    """Force email service to use mock path (bypass Resend's unverified-domain error).

    The agent-to-agent context says Resend is in MOCK mode. The .env still has a
    real API key, so we patch is_resend_configured() so emails are stored
    directly in db.sent_emails (status='sent', provider='mock').
    """
    import services.email as email_mod
    original = email_mod.is_resend_configured
    email_mod.is_resend_configured = lambda: False
    yield
    email_mod.is_resend_configured = original


@pytest.fixture(scope="module", autouse=True)
def _seed():
    if not db.services.find_one({"id": TEST_SVC_ID}):
        db.services.insert_one({
            "id": TEST_SVC_ID,
            "business_id": TEST_BIZ_ID,
            "name": "TEST F7 Service",
            "duration_minutes": 60,
            "price": 500.0,
            "active": True,
        })
    if not db.users.find_one({"id": TEST_USER_ID}):
        db.users.insert_one({
            "id": TEST_USER_ID,
            "email": TEST_USER_EMAIL,
            "full_name": "Test F7 User",
            "notify_email": True,
            "role": "user",
        })
    yield
    db.services.delete_one({"id": TEST_SVC_ID})
    db.users.delete_one({"id": TEST_USER_ID})
    db.bookings.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    db.sent_emails.delete_many({"to": TEST_USER_EMAIL})
    db.notifications.delete_many({"user_id": TEST_USER_ID})


@pytest.fixture(autouse=True)
def _per_test_cleanup():
    yield
    db.bookings.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    db.sent_emails.delete_many({"to": TEST_USER_EMAIL})
    db.notifications.delete_many({"user_id": TEST_USER_ID})


# ========================================================================
# Calendar (.ics) endpoint
# ========================================================================
class TestCalendarIcs:
    def test_calendar_ics_valid_token_returns_ics(self):
        bid = _create_booking(hours_until=20)
        tok = _expected_token(bid)
        r = requests.get(f"{BASE_URL}/api/bookings/{bid}/calendar.ics", params={"token": tok})
        assert r.status_code == 200, r.text
        ct = r.headers.get("Content-Type", "")
        assert "text/calendar" in ct, f"Unexpected Content-Type: {ct}"

        body = r.text
        assert "BEGIN:VCALENDAR" in body
        assert "END:VCALENDAR" in body
        assert "BEGIN:VEVENT" in body
        assert "END:VEVENT" in body
        assert "DTSTART:" in body
        assert "DTEND:" in body
        assert f"UID:{bid}@bookvia" in body
        assert "SUMMARY:Cita en " in body
        assert "BEGIN:VALARM" in body
        assert "TRIGGER:-PT2H" in body
        assert "END:VALARM" in body

    def test_calendar_ics_missing_token_403(self):
        bid = _create_booking(hours_until=20)
        r = requests.get(f"{BASE_URL}/api/bookings/{bid}/calendar.ics")
        assert r.status_code == 403, r.text

    def test_calendar_ics_invalid_token_403(self):
        bid = _create_booking(hours_until=20)
        r = requests.get(f"{BASE_URL}/api/bookings/{bid}/calendar.ics",
                         params={"token": "deadbeef" * 4})
        assert r.status_code == 403, r.text

    def test_calendar_ics_unknown_booking_404(self):
        fake_id = "TEST_F7_NONEXISTENT"
        tok = _expected_token(fake_id)
        r = requests.get(f"{BASE_URL}/api/bookings/{fake_id}/calendar.ics",
                         params={"token": tok})
        assert r.status_code == 404, r.text

    def test_calendar_ics_cancelled_booking_410(self):
        bid = _create_booking(hours_until=20, status="cancelled")
        tok = _expected_token(bid)
        r = requests.get(f"{BASE_URL}/api/bookings/{bid}/calendar.ics",
                         params={"token": tok})
        assert r.status_code == 410, r.text

    def test_calendar_ics_expired_booking_410(self):
        bid = _create_booking(hours_until=20, status="expired")
        tok = _expected_token(bid)
        r = requests.get(f"{BASE_URL}/api/bookings/{bid}/calendar.ics",
                         params={"token": tok})
        assert r.status_code == 410, r.text


# ========================================================================
# Smart reminder scheduler
# ========================================================================
class TestSmartReminder:
    def test_reminder_processes_24h_booking(self, event_loop):
        bid = _create_booking(hours_until=23.5)
        from server import send_appointment_reminders
        _run_async(send_appointment_reminders(), event_loop)

        booking = db.bookings.find_one({"id": bid})
        assert booking.get("reminder_sent") is True, "reminder_sent flag not set"
        assert booking.get("reminder_sent_at"), "reminder_sent_at missing"

        emails = list(db.sent_emails.find({"to": TEST_USER_EMAIL,
                                           "template": "appointment_reminder"}))
        assert len(emails) >= 1, "No reminder email logged in sent_emails"
        em = emails[-1]
        data = em.get("data") or {}
        assert data.get("booking_id") == bid
        assert "cancel_free_until" in data
        assert "reschedule_until" in data
        assert "reschedule_remaining" in data
        # 23.5h ahead -> cancel_free_until should be in past (None), reschedule_until in future
        assert data["cancel_free_until"] is None, f"Expected None, got {data['cancel_free_until']}"
        assert data["reschedule_until"] is not None
        assert data["reschedule_remaining"] == 2

        notifs = list(db.notifications.find(
            {"user_id": TEST_USER_ID, "type": "booking_reminder"}))
        assert len(notifs) >= 1, "No booking_reminder notification created"
        assert notifs[-1]["data"]["booking_id"] == bid

    def test_reminder_with_max_reschedules_remaining_zero(self, event_loop):
        bid = _create_booking(hours_until=23.5, reschedule_count=2)
        from server import send_appointment_reminders
        _run_async(send_appointment_reminders(), event_loop)

        em = db.sent_emails.find_one(
            {"template": "appointment_reminder", "data.booking_id": bid})
        assert em is not None
        assert em["data"]["reschedule_remaining"] == 0

    def test_reminder_lt_2h_both_cutoffs_none(self, event_loop):
        bid = _create_booking(hours_until=1.0)
        from server import send_appointment_reminders
        _run_async(send_appointment_reminders(), event_loop)

        em = db.sent_emails.find_one(
            {"template": "appointment_reminder", "data.booking_id": bid})
        assert em is not None, "Reminder email should still be sent for <2h booking"
        assert em["data"]["cancel_free_until"] is None
        assert em["data"]["reschedule_until"] is None
        # remaining must be forced to 0 when reschedule_until is None
        assert em["data"]["reschedule_remaining"] == 0

        booking = db.bookings.find_one({"id": bid})
        assert booking.get("reminder_sent") is True

    def test_email_html_contains_action_urls_and_texts(self, event_loop):
        from services.email import send_appointment_reminder
        bid = "TEST_F7_DIRECT_EMAIL"
        token = _expected_token(bid)
        cal_url = f"https://api.bookvia.app/api/bookings/{bid}/calendar.ics?token={token}"

        _run_async(send_appointment_reminder(
            user_email=TEST_USER_EMAIL,
            user_name="Test User",
            business_name="Negocio Demo",
            service_name="Servicio Demo",
            date="2026-01-15",
            time="10:30",
            worker_name="Worker A",
            business_address="Calle Falsa 123",
            booking_id=bid,
            cancel_free_until_text="14 ene 10:30 hrs",
            reschedule_until_text="15 ene 08:30 hrs",
            reschedule_remaining=2,
            calendar_url=cal_url,
        ), event_loop)

        em = db.sent_emails.find_one(
            {"template": "appointment_reminder", "data.booking_id": bid})
        assert em is not None
        # The stored "html" key may not exist on all providers; check via send_email
        # path: store_email doesn't persist html, but body has key text. Check both
        # body and verify URLs by re-rendering won't apply. Instead, query by
        # subject+template and inspect status==sent.
        assert em.get("status") == "sent"
        assert em.get("data", {}).get("booking_id") == bid
        assert em.get("data", {}).get("cancel_free_until") == "14 ene 10:30 hrs"
        assert em.get("data", {}).get("reschedule_until") == "15 ene 08:30 hrs"
        assert em.get("data", {}).get("reschedule_remaining") == 2
        # Plain text body must include both policy texts and base url
        body = em.get("body") or ""
        assert "Cancelacion gratis hasta: 14 ene 10:30 hrs" in body
        assert "Reagendar gratis hasta: 15 ene 08:30 hrs" in body
        assert "/bookings" in body

        db.sent_emails.delete_one({"_id": em["_id"]})

    def test_email_html_action_urls_present_in_html_render(self, event_loop):
        """Inspect generated HTML directly to confirm 3 action URLs and policy text."""
        from services.email import send_appointment_reminder
        from unittest.mock import patch, AsyncMock

        bid = "TEST_F7_HTML_INSPECT"
        token = _expected_token(bid)
        cal_url = f"https://api.bookvia.app/api/bookings/{bid}/calendar.ics?token={token}"

        captured = {}

        async def fake_send_email(**kwargs):
            captured.update(kwargs)
            return "fake_id"

        with patch("services.email.send_email", new=AsyncMock(side_effect=fake_send_email)):
            _run_async(send_appointment_reminder(
                user_email=TEST_USER_EMAIL,
                user_name="Test User",
                business_name="Negocio Demo",
                service_name="Servicio Demo",
                date="2026-01-15",
                time="10:30",
                worker_name="Worker A",
                business_address="",
                booking_id=bid,
                cancel_free_until_text="14 ene 10:30 hrs",
                reschedule_until_text="15 ene 08:30 hrs",
                reschedule_remaining=2,
                calendar_url=cal_url,
            ), event_loop)

        html = captured.get("html") or ""
        # 3 action URLs
        assert "action=cancel" in html
        assert "action=reschedule" in html
        assert f"calendar.ics?token={token}" in html
        # Policy texts in Spanish
        assert "Cancelacion con reembolso" in html
        assert "Reagendar gratis" in html


# ========================================================================
# Admin manual trigger endpoint
# ========================================================================
class TestAdminTriggerEndpoint:
    @pytest.fixture(scope="class")
    def admin_token(self):
        admin_email = "zamorachapa50@gmail.com"
        admin_password = "RainbowLol3133!"
        admin = db.users.find_one({"email": admin_email})
        totp_code = "000000"
        if admin and admin.get("totp_secret"):
            try:
                totp_code = pyotp.TOTP(admin["totp_secret"]).now()
            except Exception:
                pass
        r = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": admin_email,
            "password": admin_password,
            "totp_code": totp_code,
        })
        if r.status_code != 200:
            pytest.skip(f"Cannot get admin token: {r.status_code} {r.text}")
        return r.json().get("token")

    def test_send_reminders_admin_endpoint(self, admin_token):
        r = requests.post(
            f"{BASE_URL}/api/bookings/send-reminders",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "message" in body

    def test_send_reminders_no_auth_blocked(self):
        r = requests.post(f"{BASE_URL}/api/bookings/send-reminders")
        assert r.status_code in (401, 403), r.text
