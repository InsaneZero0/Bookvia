"""Phase 16 — City Waitlist endpoint tests.

Covers:
- Public POST /api/waitlist (create + duplicate detection + 422 validation)
- Public GET /api/waitlist/stats
- Admin GET /api/admin/waitlist (list + filters + pagination)
- Admin GET /api/admin/waitlist/export (CSV)
- Admin DELETE /api/admin/waitlist/{id}
- Admin auth gate (401 without token)
"""
import os
import time
import uuid
import subprocess
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://marketplace-test-21.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "zamorachapa50@gmail.com"
ADMIN_PASSWORD = "RainbowLol3133!"


# --------- helpers ---------

def _admin_token() -> str:
    """Login the super admin and return the JWT (relies on TOTP from db)."""
    out = subprocess.check_output(
        ["python", "/app/scripts/get_admin_totp.py"], text=True
    ).strip()
    totp = out.splitlines()[-1].strip()
    r = requests.post(
        f"{API}/auth/admin/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "totp_code": totp},
        timeout=15,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    body = r.json()
    return body.get("access_token") or body.get("token")


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_admin_token()}"}


@pytest.fixture(scope="module")
def unique_email():
    # Unique per run for create+duplicate tests
    return f"test_waitlist_{uuid.uuid4().hex[:10]}@example.com"


# --------- module: PUBLIC endpoints ---------

class TestWaitlistPublic:
    def test_health(self):
        r = requests.get(f"{API}/health", timeout=10)
        assert r.status_code == 200

    def test_post_waitlist_creates(self, unique_email):
        payload = {
            "email": unique_email,
            "city": "TestCityPhase16",
            "country_code": "MX",
            "source": "search_empty",
        }
        r = requests.post(f"{API}/waitlist", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["already_subscribed"] is False

    def test_post_waitlist_duplicate(self, unique_email):
        payload = {
            "email": unique_email,
            "city": "TestCityPhase16",
            "country_code": "MX",
            "source": "search_empty",
        }
        r = requests.post(f"{API}/waitlist", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["already_subscribed"] is True
        assert "created_at" in body and isinstance(body["created_at"], str)

    def test_post_waitlist_invalid_email_422(self):
        r = requests.post(
            f"{API}/waitlist",
            json={"email": "not-an-email", "city": "Monterrey", "country_code": "MX"},
            timeout=10,
        )
        assert r.status_code == 422

    def test_post_waitlist_missing_city_422(self):
        r = requests.post(
            f"{API}/waitlist",
            json={"email": "valid@example.com", "country_code": "MX"},
            timeout=10,
        )
        assert r.status_code == 422

    def test_post_waitlist_short_city_422(self):
        # city min_length=2
        r = requests.post(
            f"{API}/waitlist",
            json={"email": "valid2@example.com", "city": "x", "country_code": "MX"},
            timeout=10,
        )
        assert r.status_code == 422

    def test_get_stats_public(self):
        r = requests.get(f"{API}/waitlist/stats", params={"country_code": "MX"}, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["country_code"] == "MX"
        assert isinstance(body["total"], int)
        assert isinstance(body["top_cities"], list)
        if body["top_cities"]:
            row = body["top_cities"][0]
            assert "city" in row and "count" in row


# --------- module: ADMIN endpoints ---------

class TestWaitlistAdmin:
    def test_admin_list_requires_auth(self):
        r = requests.get(f"{API}/admin/waitlist", timeout=10)
        assert r.status_code in (401, 403)

    def test_admin_export_requires_auth(self):
        r = requests.get(f"{API}/admin/waitlist/export", timeout=10)
        assert r.status_code in (401, 403)

    def test_admin_list(self, admin_headers, unique_email):
        # Make sure entry exists for our unique email (idempotent post)
        requests.post(
            f"{API}/waitlist",
            json={"email": unique_email, "city": "TestCityPhase16", "country_code": "MX"},
            timeout=10,
        )
        r = requests.get(
            f"{API}/admin/waitlist",
            headers=admin_headers,
            params={"country_code": "MX", "limit": 50, "page": 1},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("total", "page", "limit", "items", "stats"):
            assert k in body, f"missing key {k}"
        assert isinstance(body["items"], list)
        assert body["page"] == 1
        assert body["limit"] == 50
        # _id must NOT leak
        for it in body["items"]:
            assert "_id" not in it
        # stats sub-shape
        assert body["stats"]["country_code"] == "MX"
        assert isinstance(body["stats"]["top_cities"], list)

    def test_admin_list_city_filter(self, admin_headers, unique_email):
        r = requests.get(
            f"{API}/admin/waitlist",
            headers=admin_headers,
            params={"city": "Testcityphase16", "country_code": "MX"},
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        # All returned items must match this city (Title-cased server-side)
        for it in body["items"]:
            assert it["city"] == "Testcityphase16"
        # And our unique email must be visible
        emails = [it["email"] for it in body["items"]]
        assert unique_email in emails

    def test_admin_export_csv(self, admin_headers):
        r = requests.get(
            f"{API}/admin/waitlist/export",
            headers=admin_headers,
            params={"country_code": "MX"},
            timeout=20,
        )
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("text/csv")
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower()
        assert "waitlist" in cd.lower()
        body = r.text
        # Header row
        first_line = body.splitlines()[0]
        assert first_line == "email,city,country_code,category,source,created_at"

    def test_admin_delete_creates_then_removes(self, admin_headers):
        # create dedicated entry
        email = f"test_waitlist_del_{uuid.uuid4().hex[:8]}@example.com"
        requests.post(
            f"{API}/waitlist",
            json={"email": email, "city": "TestDeleteCityPhase16", "country_code": "MX"},
            timeout=10,
        )
        # find its id
        r = requests.get(
            f"{API}/admin/waitlist",
            headers=admin_headers,
            params={"city": "Testdeletecityphase16", "country_code": "MX"},
            timeout=15,
        )
        items = r.json()["items"]
        target = next((i for i in items if i["email"] == email), None)
        assert target is not None
        sid = target["id"]
        # delete
        d = requests.delete(f"{API}/admin/waitlist/{sid}", headers=admin_headers, timeout=10)
        assert d.status_code == 200
        # 404 second time
        d2 = requests.delete(f"{API}/admin/waitlist/{sid}", headers=admin_headers, timeout=10)
        assert d2.status_code == 404

    def test_admin_delete_nonexistent_404(self, admin_headers):
        r = requests.delete(
            f"{API}/admin/waitlist/does-not-exist-{uuid.uuid4().hex[:6]}",
            headers=admin_headers,
            timeout=10,
        )
        assert r.status_code == 404


# --------- cleanup ---------

@pytest.fixture(scope="module", autouse=True)
def cleanup(admin_headers, unique_email):
    yield
    # delete the test entry from list
    try:
        r = requests.get(
            f"{API}/admin/waitlist",
            headers=admin_headers,
            params={"city": "Testcityphase16", "country_code": "MX", "limit": 100},
            timeout=15,
        )
        for it in r.json().get("items", []):
            if it.get("email", "").startswith("test_waitlist_"):
                requests.delete(
                    f"{API}/admin/waitlist/{it['id']}", headers=admin_headers, timeout=10
                )
    except Exception:
        pass
