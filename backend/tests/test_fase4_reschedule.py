# Phase 4 - Client Reschedule Policy Tests
# Tests for /api/bookings/policies, /api/bookings/{id}/reschedule (client), /reschedule/business
import os
import uuid
import pytest
import pymongo
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

USER_EMAIL = "testuser_stats@test.com"
USER_PASSWORD = "TestPass123!"
BIZ_EMAIL = "testbiz_dashboard@test.com"
BIZ_PASSWORD = "TestBiz123!"

# Business owned by testbiz_dashboard
TEST_BIZ_ID = "biz_dd14ed093b51"
TEST_BIZ_USER_ID = "user_c99007c570b4"

TEST_PREFIX = "TEST_F4_BK_"

mongo = pymongo.MongoClient(MONGO_URL)
db = mongo[DB_NAME]


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def user_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"], r.json()["user"]["id"]


@pytest.fixture(scope="module")
def biz_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": BIZ_EMAIL, "password": BIZ_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"], r.json()["user"]["id"]


@pytest.fixture(scope="module", autouse=True)
def seed_service_and_worker():
    """Ensure TEST_F4 service and worker exist for TEST_BIZ_ID."""
    svc_id = "TEST_F4_SVC"
    wk_id = "TEST_F4_WK"
    if not db.services.find_one({"id": svc_id}):
        db.services.insert_one({
            "id": svc_id,
            "business_id": TEST_BIZ_ID,
            "name": "TEST F4 Service",
            "duration_minutes": 60,
            "price": 500.0,
            "active": True,
        })
    if not db.workers.find_one({"id": wk_id}):
        db.workers.insert_one({
            "id": wk_id,
            "business_id": TEST_BIZ_ID,
            "name": "TEST F4 Worker",
            "active": True,
            "schedule": {str(i): {"is_available": True, "blocks": [{"start_time": "00:00", "end_time": "23:59"}]} for i in range(7)},
        })
    yield svc_id, wk_id
    db.services.delete_one({"id": svc_id})
    db.workers.delete_one({"id": wk_id})


def _create_booking(user_id: str, hours_until: float, status: str = "confirmed",
                    funds_state: str = "pending_hold", reschedule_count: int = 0):
    """Seed a test booking directly."""
    bid = f"{TEST_PREFIX}{uuid.uuid4().hex[:10]}"
    appt = datetime.now(timezone.utc) + timedelta(hours=hours_until)
    date_str = appt.strftime("%Y-%m-%d")
    time_str = appt.strftime("%H:%M")
    end_time = (datetime.strptime(time_str, "%H:%M") + timedelta(minutes=60)).strftime("%H:%M")
    doc = {
        "id": bid,
        "user_id": user_id,
        "business_id": TEST_BIZ_ID,
        "service_id": "TEST_F4_SVC",
        "worker_id": "TEST_F4_WK",
        "date": date_str,
        "time": time_str,
        "end_time": end_time,
        "appointment_date": f"{date_str}T{time_str}:00+00:00",
        "status": status,
        "reschedule_count": reschedule_count,
        "business_reschedule_count": 0,
        "reschedule_history": [],
        "price": 500.0,
        "duration_minutes": 60,
        "funds_state": funds_state,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    db.bookings.insert_one(doc)
    return bid


def _cleanup_bookings():
    db.bookings.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})


@pytest.fixture(autouse=True)
def _per_test_cleanup():
    yield
    _cleanup_bookings()


def _future_dt(hours: float):
    dt = datetime.now(timezone.utc) + timedelta(hours=hours)
    return dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M")


# ---------- TESTS ----------

# Public policies endpoint
class TestPolicies:
    def test_policies_public_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/bookings/policies")
        assert r.status_code == 200
        d = r.json()
        assert d["max_reschedules_per_booking"] == 2
        assert d["reschedule_cutoff_hours"] == 2
        assert d["grace_period_hours"] == 24
        assert d["auto_complete_hours"] == 48
        assert d["min_deposit_amount"] == 100 or d["min_deposit_amount"] == 100.0


# Client reschedule flow
class TestClientReschedule:
    def test_first_reschedule_success(self, user_token):
        token, uid = user_token
        bid = _create_booking(uid, hours_until=48, reschedule_count=0)
        nd, nt = _future_dt(72)
        r = requests.put(
            f"{BASE_URL}/api/bookings/{bid}/reschedule",
            params={"new_date": nd, "new_time": nt},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["reschedule_count"] == 1
        assert d["remaining_reschedules"] == 1
        assert d["new_date"] == nd
        assert d["new_time"] == nt

        # DB verification
        bk = db.bookings.find_one({"id": bid})
        assert bk["reschedule_count"] == 1
        assert bk["date"] == nd
        assert bk["time"] == nt
        assert bk["appointment_date"] == f"{nd}T{nt}:00+00:00"
        assert len(bk["reschedule_history"]) == 1
        assert bk["reschedule_history"][0]["by"] == "user"
        # funds_state not modified
        assert bk["funds_state"] == "pending_hold"

    def test_second_reschedule_success_zero_remaining(self, user_token):
        token, uid = user_token
        bid = _create_booking(uid, hours_until=48, reschedule_count=1)
        nd, nt = _future_dt(72)
        r = requests.put(
            f"{BASE_URL}/api/bookings/{bid}/reschedule",
            params={"new_date": nd, "new_time": nt},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["reschedule_count"] == 2
        assert d["remaining_reschedules"] == 0

    def test_third_reschedule_limit_reached(self, user_token):
        token, uid = user_token
        bid = _create_booking(uid, hours_until=48, reschedule_count=2)
        nd, nt = _future_dt(72)
        r = requests.put(
            f"{BASE_URL}/api/bookings/{bid}/reschedule",
            params={"new_date": nd, "new_time": nt},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 400
        assert "limite" in r.text.lower() or "límite" in r.text.lower() or "2 reagendamientos" in r.text.lower()

    def test_cutoff_less_than_2h(self, user_token):
        token, uid = user_token
        bid = _create_booking(uid, hours_until=1, reschedule_count=0)
        nd, nt = _future_dt(72)
        r = requests.put(
            f"{BASE_URL}/api/bookings/{bid}/reschedule",
            params={"new_date": nd, "new_time": nt},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 400
        assert "2 horas" in r.text or "anticipacion" in r.text.lower() or "anticipación" in r.text.lower()

    def test_new_date_in_past(self, user_token):
        token, uid = user_token
        bid = _create_booking(uid, hours_until=48, reschedule_count=0)
        past = datetime.now(timezone.utc) - timedelta(hours=5)
        r = requests.put(
            f"{BASE_URL}/api/bookings/{bid}/reschedule",
            params={"new_date": past.strftime("%Y-%m-%d"), "new_time": past.strftime("%H:%M")},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 400

    def test_new_date_less_than_1h(self, user_token):
        token, uid = user_token
        bid = _create_booking(uid, hours_until=48, reschedule_count=0)
        nd, nt = _future_dt(0.5)  # 30 min in future
        r = requests.put(
            f"{BASE_URL}/api/bookings/{bid}/reschedule",
            params={"new_date": nd, "new_time": nt},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 400

    def test_invalid_date_format(self, user_token):
        token, uid = user_token
        bid = _create_booking(uid, hours_until=48, reschedule_count=0)
        r = requests.put(
            f"{BASE_URL}/api/bookings/{bid}/reschedule",
            params={"new_date": "not-a-date", "new_time": "25:99"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 400

    def test_other_user_booking_404(self, user_token):
        token, _uid = user_token
        # Create booking belonging to a different user
        bid = _create_booking("some-other-user-id-xyz", hours_until=48)
        nd, nt = _future_dt(72)
        r = requests.put(
            f"{BASE_URL}/api/bookings/{bid}/reschedule",
            params={"new_date": nd, "new_time": nt},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 404

    def test_cancelled_booking_400(self, user_token):
        token, uid = user_token
        bid = _create_booking(uid, hours_until=48, status="cancelled")
        nd, nt = _future_dt(72)
        r = requests.put(
            f"{BASE_URL}/api/bookings/{bid}/reschedule",
            params={"new_date": nd, "new_time": nt},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 400

    def test_completed_booking_400(self, user_token):
        token, uid = user_token
        bid = _create_booking(uid, hours_until=48, status="completed")
        nd, nt = _future_dt(72)
        r = requests.put(
            f"{BASE_URL}/api/bookings/{bid}/reschedule",
            params={"new_date": nd, "new_time": nt},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 400

    def test_notification_created_to_business(self, user_token):
        token, uid = user_token
        bid = _create_booking(uid, hours_until=48, reschedule_count=0)
        nd, nt = _future_dt(72)
        before = db.notifications.count_documents({
            "user_id": TEST_BIZ_USER_ID,
            "title": "Cita reagendada por el cliente",
        })
        r = requests.put(
            f"{BASE_URL}/api/bookings/{bid}/reschedule",
            params={"new_date": nd, "new_time": nt},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200, r.text
        after = db.notifications.count_documents({
            "user_id": TEST_BIZ_USER_ID,
            "title": "Cita reagendada por el cliente",
        })
        assert after == before + 1, f"Notification not created: before={before} after={after}"


# Business reschedule flow
class TestBusinessReschedule:
    def test_business_reschedule_does_not_affect_client_count(self, user_token, biz_token):
        u_tok, uid = user_token
        b_tok, _buid = biz_token
        bid = _create_booking(uid, hours_until=48, reschedule_count=0)
        nd, nt = _future_dt(72)
        r = requests.put(
            f"{BASE_URL}/api/bookings/{bid}/reschedule/business",
            json={"new_date": nd, "new_time": nt},
            headers={"Authorization": f"Bearer {b_tok}"},
        )
        assert r.status_code == 200, r.text

        bk = db.bookings.find_one({"id": bid})
        assert bk["reschedule_count"] == 0  # NOT incremented
        assert bk["business_reschedule_count"] == 1
        assert bk["date"] == nd
        assert bk["time"] == nt
        assert bk["appointment_date"] == f"{nd}T{nt}:00+00:00"
        # History has by='business'
        assert any(h.get("by") == "business" for h in bk["reschedule_history"])
        # funds_state preserved
        assert bk["funds_state"] == "pending_hold"

    def test_client_still_can_reschedule_after_business(self, user_token, biz_token):
        u_tok, uid = user_token
        b_tok, _buid = biz_token
        bid = _create_booking(uid, hours_until=48, reschedule_count=0)
        nd1, nt1 = _future_dt(72)
        r = requests.put(
            f"{BASE_URL}/api/bookings/{bid}/reschedule/business",
            json={"new_date": nd1, "new_time": nt1},
            headers={"Authorization": f"Bearer {b_tok}"},
        )
        assert r.status_code == 200, r.text

        # Now client reschedules twice more - both should succeed (still full quota of 2)
        nd2, nt2 = _future_dt(96)
        r2 = requests.put(
            f"{BASE_URL}/api/bookings/{bid}/reschedule",
            params={"new_date": nd2, "new_time": nt2},
            headers={"Authorization": f"Bearer {u_tok}"},
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["reschedule_count"] == 1
        assert r2.json()["remaining_reschedules"] == 1

        nd3, nt3 = _future_dt(120)
        r3 = requests.put(
            f"{BASE_URL}/api/bookings/{bid}/reschedule",
            params={"new_date": nd3, "new_time": nt3},
            headers={"Authorization": f"Bearer {u_tok}"},
        )
        assert r3.status_code == 200, r3.text
        assert r3.json()["reschedule_count"] == 2
        assert r3.json()["remaining_reschedules"] == 0


# Consecutive legitimate reschedules (idempotency-ish)
class TestConsecutiveReschedules:
    def test_two_consecutive_user_reschedules(self, user_token):
        token, uid = user_token
        bid = _create_booking(uid, hours_until=48, reschedule_count=0, funds_state="captured")
        nd1, nt1 = _future_dt(72)
        r1 = requests.put(
            f"{BASE_URL}/api/bookings/{bid}/reschedule",
            params={"new_date": nd1, "new_time": nt1},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r1.status_code == 200, r1.text
        assert r1.json()["reschedule_count"] == 1

        nd2, nt2 = _future_dt(96)
        r2 = requests.put(
            f"{BASE_URL}/api/bookings/{bid}/reschedule",
            params={"new_date": nd2, "new_time": nt2},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["reschedule_count"] == 2

        bk = db.bookings.find_one({"id": bid})
        # funds_state must remain unchanged
        assert bk["funds_state"] == "captured"
        assert len(bk["reschedule_history"]) == 2
        assert all(h["by"] == "user" for h in bk["reschedule_history"])
