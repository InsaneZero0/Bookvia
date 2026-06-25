"""
Tests for the business photos sanitization fix (iteration 107).

Validates:
  - GET /api/businesses/{id} rewrites stored photo URLs to BASE_URL
  - GET /api/businesses/{id} excludes URLs whose business_photos doc is
    soft-deleted (is_deleted=true)
  - /api/files/{storage_path} returns 200 image for live photos
  - /api/files/{storage_path} returns 404 for soft-deleted photos
  - Featured / search endpoints also expose sanitized photos
  - Regression: CORS for Capacitor still works

Hits http://localhost:8001 directly to bypass Cloudflare caching/rewrites
on the public preview host.
"""
import os
import re
import requests
import pytest

INTERNAL_URL = "http://localhost:8001"
BIZ_ID = "fbb3d0e3-37f2-417b-8cfa-b7fbf24f1ee0"

# Loaded from backend/.env at runtime so tests adapt to env changes
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
BASE_URL = (os.environ.get("BASE_URL") or "").rstrip("/")
EXPECTED_HOST = re.sub(r"^https?://", "", BASE_URL) if BASE_URL else None


# --------------------- helpers ---------------------

def _extract_url(photo):
    if isinstance(photo, str):
        return photo
    if isinstance(photo, dict):
        return photo.get("url") or photo.get("secure_url") or photo.get("src")
    return None


def _local_files_url(public_url: str) -> str:
    """Map a public BASE_URL/api/files/... URL to the internal localhost one
    so we never go through Cloudflare during the test."""
    marker = "/api/files/"
    idx = public_url.find(marker)
    assert idx != -1, f"URL is not an /api/files/ url: {public_url!r}"
    path = public_url[idx + len(marker):]
    return f"{INTERNAL_URL}/api/files/{path}"


# --------------------- detail endpoint ---------------------

class TestBusinessDetailPhotos:

    def test_detail_returns_photos_with_current_base_url_host(self):
        r = requests.get(f"{INTERNAL_URL}/api/businesses/{BIZ_ID}", timeout=10)
        assert r.status_code == 200, r.text[:300]
        detail = r.json()
        assert "photos" in detail and isinstance(detail["photos"], list)
        assert len(detail["photos"]) >= 1, "Expected at least one live photo"

        if not EXPECTED_HOST:
            pytest.skip("BASE_URL not set in env -- skip host-rewrite check")

        for p in detail["photos"]:
            url = _extract_url(p)
            assert url, f"Bad photo entry: {p!r}"
            # Stale host must NOT leak through
            assert "reserve-stripe-test.preview.emergentagent.com" not in url, (
                f"Stale obsolete host leaked: {url}")
            # Should match current BASE_URL host (or be an external/cloudinary URL,
            # but for this business they are all /api/files/* internal)
            assert EXPECTED_HOST in url, (
                f"Photo URL host not rewritten to BASE_URL ({EXPECTED_HOST}): {url}")

    def test_detail_photos_only_reference_live_storage(self):
        """No URL in photos[] should reference a soft-deleted business_photos doc."""
        # The known deleted storage_path on this business (per DB inspection)
        DELETED_PATH = (
            "bookvia/businesses/fbb3d0e3-37f2-417b-8cfa-b7fbf24f1ee0/"
            "7a99b07f-e559-4e42-a7b3-b9b15cd7fa26.jfif"
        )
        r = requests.get(f"{INTERNAL_URL}/api/businesses/{BIZ_ID}", timeout=10)
        assert r.status_code == 200
        for p in r.json().get("photos") or []:
            url = _extract_url(p) or ""
            assert DELETED_PATH not in url, (
                f"Soft-deleted photo leaked into response: {url}")

    def test_each_returned_photo_url_is_accessible(self):
        r = requests.get(f"{INTERNAL_URL}/api/businesses/{BIZ_ID}", timeout=10)
        assert r.status_code == 200
        photos = r.json().get("photos") or []
        assert photos, "No photos returned"

        for p in photos:
            url = _extract_url(p)
            assert url
            # Hit it through localhost to avoid Cloudflare cache/HEAD oddities
            local = _local_files_url(url)
            resp = requests.get(local, timeout=15)
            assert resp.status_code == 200, (
                f"Photo URL not accessible ({resp.status_code}): {local}")
            ctype = resp.headers.get("content-type", "")
            assert ctype.startswith(("image/", "application/octet-stream")), (
                f"Unexpected content-type {ctype!r} for {local}")
            assert len(resp.content) > 0, f"Empty body for {local}"


# --------------------- serve_file / deleted photo ---------------------

class TestServeFile:

    def test_deleted_photo_returns_404(self):
        deleted_path = (
            "bookvia/businesses/fbb3d0e3-37f2-417b-8cfa-b7fbf24f1ee0/"
            "7a99b07f-e559-4e42-a7b3-b9b15cd7fa26.jfif"
        )
        r = requests.get(f"{INTERNAL_URL}/api/files/{deleted_path}", timeout=10)
        assert r.status_code == 404, (
            f"Soft-deleted photo MUST return 404, got {r.status_code}")

    def test_unknown_path_returns_404(self):
        r = requests.get(
            f"{INTERNAL_URL}/api/files/bookvia/businesses/none/nope.jpg",
            timeout=10,
        )
        assert r.status_code == 404

    def test_storage_path_lookup_returns_200_for_live_photo(self):
        # The first doc uses `storage_path` (not `public_id`) — the fix is
        # specifically that serve_file now finds these.
        live_storage_path = (
            "bookvia/businesses/fbb3d0e3-37f2-417b-8cfa-b7fbf24f1ee0/"
            "0854a886-e94d-4c93-aa3a-5918dbf0c27d.jfif"
        )
        r = requests.get(
            f"{INTERNAL_URL}/api/files/{live_storage_path}", timeout=15)
        assert r.status_code == 200, (
            f"Live photo (storage_path lookup) returned {r.status_code}")
        assert r.headers.get("content-type", "").startswith(
            ("image/", "application/octet-stream"))
        assert len(r.content) > 0


# --------------------- list / featured / search ---------------------

class TestListingPhotos:

    def test_list_businesses_does_not_expose_stale_host(self):
        r = requests.get(f"{INTERNAL_URL}/api/businesses?limit=10", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and data
        for b in data:
            for p in b.get("photos") or []:
                url = _extract_url(p) or ""
                assert "reserve-stripe-test.preview.emergentagent.com" not in url, (
                    f"Stale host leaked in /businesses listing on {b.get('id')}: {url}")
                if EXPECTED_HOST and "/api/files/" in url:
                    assert EXPECTED_HOST in url, (
                        f"Listing photo URL host not rewritten: {url}")

    def test_featured_mx_does_not_expose_stale_host(self):
        r = requests.get(
            f"{INTERNAL_URL}/api/businesses/featured?country_code=MX&limit=8",
            timeout=10,
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert isinstance(data, list)
        for b in data:
            for p in b.get("photos") or []:
                url = _extract_url(p) or ""
                assert "reserve-stripe-test.preview.emergentagent.com" not in url, (
                    f"Stale host leaked in featured on {b.get('id')}: {url}")
                if EXPECTED_HOST and "/api/files/" in url:
                    assert EXPECTED_HOST in url

    def test_featured_mx_photo_urls_accessible(self):
        r = requests.get(
            f"{INTERNAL_URL}/api/businesses/featured?country_code=MX&limit=8",
            timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        photos_checked = 0
        for b in data:
            for p in (b.get("photos") or [])[:2]:  # cap per business
                url = _extract_url(p)
                if not url or "/api/files/" not in url:
                    continue
                local = _local_files_url(url)
                resp = requests.get(local, timeout=15)
                assert resp.status_code == 200, (
                    f"Featured photo url not accessible ({resp.status_code}): {local}")
                photos_checked += 1
        # At least one photo across featured should have been validated
        assert photos_checked >= 1, "No photo URLs validated in featured response"


# --------------------- CORS regression (iteration 106) ---------------------

class TestCORSRegression:

    def test_cors_https_localhost_origin_still_echoed(self):
        r = requests.get(
            f"{INTERNAL_URL}/api/businesses",
            headers={"Origin": "https://localhost"},
            timeout=10,
        )
        assert r.status_code == 200
        acao = r.headers.get("access-control-allow-origin")
        assert acao == "https://localhost", f"Expected origin echo, got {acao!r}"
        assert r.headers.get(
            "access-control-allow-credentials", "").lower() == "true"
