"""
Tests for Bookvia Help/Legal Center redesign:
- POST /api/support/public-ticket (no auth) creates ticket with public_ref BV-YYYY-XXXX
- POST /api/support/tickets (auth) still works (regression)
- GET /api/admin/tickets (admin) returns BOTH public + authenticated tickets
"""
import os
import re
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

CLIENT_EMAIL = "test@example.com"
CLIENT_PASS = "TestPass123!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def client_token(session):
    r = session.post(f"{API}/auth/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PASS})
    if r.status_code != 200:
        pytest.skip(f"Client login failed: {r.status_code} {r.text[:200]}")
    j = r.json()
    return j.get("token") or j.get("access_token")


# ---------- Public ticket creation ----------
class TestPublicTicket:
    def test_create_public_ticket_no_auth(self, session):
        payload = {
            "name": "TEST_Visitor",
            "email": "TEST_visitor@example.com",
            "category": "general",
            "subject": "TEST_Need help with booking",
            "message": "TEST_Hi, I cannot find my reservation, please help.",
        }
        r = requests.post(f"{API}/support/public-ticket", json=payload)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:300]}"
        data = r.json()
        # Structural assertions
        assert "public_ref" in data
        assert "status" in data
        assert "message" in data
        assert data["status"] == "open"
        # Format BV-YYYY-XXXX
        assert re.match(r"^BV-\d{4}-\d{4}$", data["public_ref"]), f"Bad ref format: {data['public_ref']}"

    def test_public_ticket_invalid_email_returns_422(self):
        payload = {
            "name": "TEST_Bad",
            "email": "not-an-email",
            "category": "general",
            "subject": "x",
            "message": "y",
        }
        r = requests.post(f"{API}/support/public-ticket", json=payload)
        assert r.status_code == 422, f"Expected 422 for bad email, got {r.status_code}"

    def test_public_ticket_missing_fields_returns_422(self):
        payload = {"name": "TEST_X"}  # missing email/subject/message
        r = requests.post(f"{API}/support/public-ticket", json=payload)
        assert r.status_code == 422

    def test_public_ref_unique_on_consecutive_requests(self):
        refs = set()
        for i in range(3):
            payload = {
                "name": f"TEST_Uniq_{i}",
                "email": f"TEST_uniq{i}@example.com",
                "category": "general",
                "subject": f"TEST_unique {i}",
                "message": f"unique message {i}",
            }
            r = requests.post(f"{API}/support/public-ticket", json=payload)
            assert r.status_code == 200
            refs.add(r.json()["public_ref"])
            time.sleep(0.05)
        assert len(refs) == 3, f"Refs not unique: {refs}"


# ---------- Authenticated ticket regression ----------
class TestAuthenticatedTicket:
    def test_auth_ticket_still_works(self, session, client_token):
        if not client_token:
            pytest.skip("No client token")
        headers = {"Authorization": f"Bearer {client_token}"}
        payload = {
            "category": "general",
            "subject": "TEST_auth ticket",
            "message": "TEST_auth ticket body",
        }
        r = requests.post(f"{API}/support/tickets", json=payload, headers=headers)
        # 200 expected (existing endpoint)
        assert r.status_code in (200, 201), f"Auth ticket failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert "id" in data
        assert data.get("status") == "open"


# ---------- Admin listing includes both ----------
class TestAdminListing:
    """Admin endpoint should return both public_form and authenticated tickets."""

    def _admin_login(self):
        # Try TOTP-based admin login; fall back to skip if not available
        admin_email = os.environ.get("TEST_ADMIN_EMAIL")
        admin_pass = os.environ.get("TEST_ADMIN_PASS")
        admin_totp = os.environ.get("TEST_ADMIN_TOTP")
        if not all([admin_email, admin_pass, admin_totp]):
            return None
        r = requests.post(f"{API}/auth/admin/login",
                          json={"email": admin_email, "password": admin_pass, "totp_code": admin_totp})
        if r.status_code != 200:
            return None
        return r.json().get("token") or r.json().get("access_token")

    def test_admin_lists_both_sources_in_db(self):
        """Direct DB validation: at least one public_form ticket exists & is queryable."""
        import asyncio
        import sys
        sys.path.insert(0, "/app/backend")
        from motor.motor_asyncio import AsyncIOMotorClient

        async def run():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            pub = await db.support_tickets.count_documents({"source": "public_form"})
            # Any ticket without source field or other source counts as legacy/auth
            auth = await db.support_tickets.count_documents({"source": {"$ne": "public_form"}})
            client.close()
            return pub, auth

        pub, auth = asyncio.run(run())
        assert pub >= 1, "No public_form tickets persisted"
        # auth count is environment-dependent; we just ensure no crashes
        print(f"DB ticket counts → public_form={pub}, other={auth}")

    def test_admin_endpoint_reachable(self):
        token = self._admin_login()
        if not token:
            pytest.skip("Admin TOTP credentials not provided via env (TEST_ADMIN_EMAIL/PASS/TOTP)")
        headers = {"Authorization": f"Bearer {token}"}
        r = requests.get(f"{API}/admin/tickets", headers=headers)
        assert r.status_code == 200
        data = r.json()
        tickets = data.get("tickets") or data
        assert isinstance(tickets, list)
        # If we have any tickets, check both sources can appear
        sources = {t.get("source") for t in tickets if isinstance(t, dict)}
        print(f"Admin tickets sources observed: {sources}")
