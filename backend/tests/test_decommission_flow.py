"""Tests for Admin Decommission + Reactivate flow.

Creates a throwaway test business directly in MongoDB so we never touch real
production data. Uses admin JWT minted via core.security to bypass TOTP.
"""
import os
import sys
import uuid
import asyncio
import pytest
import requests

# Allow `import core.*` when run from /app/backend/tests
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from core.security import create_token  # noqa: E402
from core.database import db  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://marketplace-test-21.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    async def _get():
        admin = await db.users.find_one({"email": "zamorachapa50@gmail.com"})
        assert admin, "admin user not found in DB"
        return create_token(admin["id"], admin.get("role", "admin"), admin["email"])
    return asyncio.get_event_loop().run_until_complete(_get())


@pytest.fixture(scope="module")
def client_token():
    """Login as regular customer to test 403 path."""
    r = requests.post(f"{API}/auth/login", json={
        "email": "test@example.com",
        "password": "TestPass123!",
    }, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"client login failed: {r.status_code} {r.text}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def test_business():
    """Create an isolated throwaway approved business directly in mongo."""
    biz_id = f"TEST_DECOM_{uuid.uuid4().hex[:10]}"
    doc = {
        "id": biz_id,
        "name": f"TEST DECOM {biz_id[-6:]}",
        "slug": biz_id.lower(),
        "user_id": None,  # no real owner -> email skipped automatically
        "status": "approved",
        "category": "salon",
        "city": "TestCity",
        "country": "MX",
        "requires_deposit": False,
        "is_test": True,
    }

    async def _create():
        await db.businesses.insert_one(doc)
    asyncio.get_event_loop().run_until_complete(_create())

    yield doc

    async def _cleanup():
        await db.businesses.delete_one({"id": biz_id})
    try:
        asyncio.get_event_loop().run_until_complete(_cleanup())
    except Exception:
        pass


# ---------- Tests ----------
def test_status_endpoint_alive():
    r = requests.get(f"{API}/status", timeout=10)
    assert r.status_code == 200


def test_non_admin_decommission_forbidden(client_token, test_business):
    """Regular user must NOT be able to decommission."""
    r = requests.post(
        f"{API}/admin/businesses/{test_business['id']}/decommission",
        json={"reason": "owner_request", "note": "x", "send_email": False, "export_data": False},
        headers={"Authorization": f"Bearer {client_token}"},
        timeout=15,
    )
    assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code} body={r.text[:200]}"


def test_non_admin_reactivate_forbidden(client_token, test_business):
    r = requests.post(
        f"{API}/admin/businesses/{test_business['id']}/reactivate",
        headers={"Authorization": f"Bearer {client_token}"},
        timeout=15,
    )
    assert r.status_code in (401, 403)


def test_decommission_returns_csv_and_filename(admin_token, test_business):
    r = requests.post(
        f"{API}/admin/businesses/{test_business['id']}/decommission",
        json={
            "reason": "owner_request",
            "note": "automated test",
            "send_email": False,
            "export_data": True,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=30,
    )
    assert r.status_code == 200, f"unexpected: {r.status_code} {r.text[:300]}"
    body = r.json()
    assert body.get("message") == "Business decommissioned"
    assert body.get("email_sent") is False
    assert isinstance(body.get("export_csv"), str) and len(body["export_csv"]) > 0
    assert body.get("csv_filename", "").endswith(".csv")
    assert "SERVICES" in body["export_csv"]  # CSV header marker
    assert "BOOKINGS" in body["export_csv"]


def test_business_now_decommissioned_in_db(admin_token, test_business):
    """Verify persistence by reading via admin /businesses list."""
    async def _read():
        b = await db.businesses.find_one({"id": test_business["id"]})
        return b
    fresh = asyncio.get_event_loop().run_until_complete(_read())
    assert fresh is not None
    assert fresh.get("status") == "decommissioned"
    assert fresh.get("decommission_reason") == "owner_request"
    assert fresh.get("decommissioned_at")


def test_double_decommission_rejected(admin_token, test_business):
    r = requests.post(
        f"{API}/admin/businesses/{test_business['id']}/decommission",
        json={"reason": "owner_request", "send_email": False, "export_data": False},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert r.status_code == 400


def test_reactivate_restores_approved(admin_token, test_business):
    r = requests.post(
        f"{API}/admin/businesses/{test_business['id']}/reactivate",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert r.status_code == 200

    async def _read():
        return await db.businesses.find_one({"id": test_business["id"]})
    fresh = asyncio.get_event_loop().run_until_complete(_read())
    assert fresh.get("status") == "approved"
    assert fresh.get("reactivated_at")
    # Unset fields should be gone
    assert "decommission_reason" not in fresh or fresh.get("decommission_reason") is None


def test_decommission_unknown_business_404(admin_token):
    r = requests.post(
        f"{API}/admin/businesses/NOPE_DOES_NOT_EXIST/decommission",
        json={"reason": "owner_request", "send_email": False, "export_data": False},
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=15,
    )
    assert r.status_code == 404


def test_share_business_and_notification_regressions(client_token):
    """Quick regression: nav notif bell endpoint + business listing still work."""
    h = {"Authorization": f"Bearer {client_token}"}
    n = requests.get(f"{API}/notifications", headers=h, timeout=10)
    assert n.status_code == 200
    # businesses list (may be empty due to ENFORCE_STRIPE_CONNECT_GATE — that's OK)
    b = requests.get(f"{API}/businesses", timeout=10)
    assert b.status_code == 200
