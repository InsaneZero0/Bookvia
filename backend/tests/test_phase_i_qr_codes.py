"""
Phase I — Branded QR codes for businesses (backend tests).

Covers:
- Public PNG endpoints (qr.png, qr-card.png) — content-type, size, decodable URL
- 404 for unknown business id
- ?ref=qr tracking via qr_scans collection
- Admin-only endpoints: scans/summary, qr/businesses (auth, search, days param)
"""
import os
import sys
import time
import pytest
import requests
from io import BytesIO

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # fall back to frontend/.env
    with open('/app/frontend/.env') as f:
        for ln in f:
            if ln.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = ln.split('=', 1)[1].strip().rstrip('/')

API = f"{BASE_URL}/api"
APPROVED_BIZ_ID = "fbb3d0e3-37f2-417b-8cfa-b7fbf24f1ee0"
APPROVED_BIZ_SLUG = "test-real-stripe-fbb3d0e3"
UNKNOWN_BIZ_ID = "00000000-0000-0000-0000-000000000000"


@pytest.fixture(scope="session")
def admin_token():
    sys.path.insert(0, '/app/backend')
    from core.security import create_token
    return create_token('bc12d4ed-f1c4-42bf-bae8-2f2731b54190', 'admin', 'zamorachapa50@gmail.com')


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# --- Public QR PNG endpoint ---
class TestPublicQRPng:
    def test_qr_png_returns_valid_png(self):
        r = requests.get(f"{API}/businesses/{APPROVED_BIZ_ID}/qr.png", timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("image/png")
        # PNG magic
        assert r.content[:8] == b"\x89PNG\r\n\x1a\n"
        assert len(r.content) > 5000, f"too small: {len(r.content)}"

    def test_qr_decodes_to_slug_with_ref_qr(self):
        r = requests.get(f"{API}/businesses/{APPROVED_BIZ_ID}/qr.png", timeout=30)
        assert r.status_code == 200
        try:
            from pyzbar.pyzbar import decode
            from PIL import Image
        except ImportError:
            pytest.skip("pyzbar/PIL not available")
        img = Image.open(BytesIO(r.content))
        results = decode(img)
        assert results, "No QR could be decoded from PNG"
        url = results[0].data.decode("utf-8")
        assert APPROVED_BIZ_SLUG in url, f"slug not in QR URL: {url}"
        assert "ref=qr" in url, f"ref=qr missing: {url}"

    def test_qr_png_404_for_unknown(self):
        r = requests.get(f"{API}/businesses/{UNKNOWN_BIZ_ID}/qr.png", timeout=15)
        assert r.status_code == 404


# --- Printable QR card ---
class TestQRCard:
    def test_qr_card_png_valid_with_attachment(self):
        r = requests.get(f"{API}/businesses/{APPROVED_BIZ_ID}/qr-card.png", timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("image/png")
        assert r.content[:8] == b"\x89PNG\r\n\x1a\n"
        assert len(r.content) > 5000
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower(), f"missing attachment header: {cd}"

    def test_qr_card_404_for_unknown(self):
        r = requests.get(f"{API}/businesses/{UNKNOWN_BIZ_ID}/qr-card.png", timeout=15)
        assert r.status_code == 404


# --- ?ref=qr tracking ---
class TestQRScanTracking:
    def test_three_scans_recorded_and_reflected_in_summary(self, admin_headers):
        # baseline
        r0 = requests.get(f"{API}/admin/qr/scans/summary?days=1", headers=admin_headers, timeout=15)
        assert r0.status_code == 200, r0.text[:200]
        baseline = r0.json().get("by_business", {}).get(APPROVED_BIZ_ID, 0)
        baseline_total = r0.json().get("total_scans", 0)

        # 3 scans via slug with ref=qr
        for _ in range(3):
            rs = requests.get(f"{API}/businesses/slug/{APPROVED_BIZ_SLUG}?ref=qr", timeout=15)
            assert rs.status_code == 200, rs.text[:200]
        time.sleep(0.5)

        r1 = requests.get(f"{API}/admin/qr/scans/summary?days=1", headers=admin_headers, timeout=15)
        assert r1.status_code == 200
        after = r1.json().get("by_business", {}).get(APPROVED_BIZ_ID, 0)
        after_total = r1.json().get("total_scans", 0)
        assert after >= baseline + 3, f"baseline={baseline}, after={after}"
        assert after_total >= baseline_total + 3


# --- Admin endpoints ---
class TestAdminQREndpoints:
    def test_scans_summary_requires_auth(self):
        r = requests.get(f"{API}/admin/qr/scans/summary", timeout=15)
        assert r.status_code in (401, 403)

    def test_scans_summary_with_token(self, admin_headers):
        r = requests.get(f"{API}/admin/qr/scans/summary?days=30", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "total_scans" in data
        assert "by_business" in data
        assert "days" in data and data["days"] == 30
        assert isinstance(data["total_scans"], int)
        assert isinstance(data["by_business"], dict)

    def test_qr_businesses_requires_auth(self):
        r = requests.get(f"{API}/admin/qr/businesses", timeout=15)
        assert r.status_code in (401, 403)

    def test_qr_businesses_returns_items(self, admin_headers):
        r = requests.get(f"{API}/admin/qr/businesses?days=30", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and "count" in data
        assert isinstance(data["items"], list)
        assert data["count"] >= 1, "expected at least 1 approved business with slug"
        # Find our seed biz
        found = None
        for it in data["items"]:
            assert it.get("slug"), "all items must have non-empty slug"
            assert "qr_png_url" in it
            assert "qr_card_url" in it
            assert "public_code" in it
            assert "scans" in it and isinstance(it["scans"], int)
            assert it["qr_png_url"].endswith("/qr.png")
            assert it["qr_card_url"].endswith("/qr-card.png")
            if it["id"] == APPROVED_BIZ_ID:
                found = it
        assert found is not None, "seed approved business not in list"

    def test_qr_businesses_q_filter(self, admin_headers):
        r = requests.get(
            f"{API}/admin/qr/businesses?q=test-real-stripe",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200
        items = r.json()["items"]
        # All returned must match
        assert len(items) >= 1
        assert any(APPROVED_BIZ_SLUG in (it.get("slug") or "") for it in items)

    def test_qr_businesses_days_param(self, admin_headers):
        r = requests.get(f"{API}/admin/qr/businesses?days=7", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert r.json().get("days") == 7
