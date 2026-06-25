"""
Tests for CORS fix (Capacitor Android) and business listing endpoints.

Tested against http://localhost:8001 (internal) because the preview proxy
(Cloudflare) rewrites CORS headers to `*` which would mask the fix.
"""
import os
import requests
import pytest

INTERNAL_URL = "http://localhost:8001"
PUBLIC_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


# ---------- CORS tests (must run against internal URL) ----------

class TestCORSCapacitor:
    """Validate that the CORS fix returns the specific origin, never `*`,
    so Capacitor Chrome WebView accepts credentialed responses."""

    def test_get_businesses_with_capacitor_origin(self):
        r = requests.get(
            f"{INTERNAL_URL}/api/businesses",
            headers={"Origin": "https://localhost"},
            timeout=10,
        )
        assert r.status_code == 200, r.text[:200]
        acao = r.headers.get("access-control-allow-origin")
        assert acao == "https://localhost", f"Expected echo of origin, got {acao!r}"
        assert acao != "*", "CORS must NOT return '*' when credentials are allowed"
        assert r.headers.get("access-control-allow-credentials", "").lower() == "true"

    def test_preflight_options_capacitor_origin(self):
        r = requests.options(
            f"{INTERNAL_URL}/api/businesses",
            headers={
                "Origin": "https://localhost",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "content-type",
            },
            timeout=10,
        )
        assert r.status_code in (200, 204), f"got {r.status_code}: {r.text[:200]}"
        acao = r.headers.get("access-control-allow-origin")
        assert acao == "https://localhost", f"Expected origin echo, got {acao!r}"

    def test_preflight_options_capacitor_ios_origin(self):
        r = requests.options(
            f"{INTERNAL_URL}/api/businesses",
            headers={
                "Origin": "capacitor://localhost",
                "Access-Control-Request-Method": "GET",
            },
            timeout=10,
        )
        assert r.status_code in (200, 204)
        assert r.headers.get("access-control-allow-origin") == "capacitor://localhost"


# ---------- Businesses endpoints (functional) ----------

class TestBusinessesEndpoints:

    def test_list_businesses_returns_array(self):
        r = requests.get(f"{INTERNAL_URL}/api/businesses", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1, "Expected at least 1 business"

    def test_list_businesses_limit_10_full_shape(self):
        r = requests.get(f"{INTERNAL_URL}/api/businesses?limit=10", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 1
        b = data[0]
        for field in ("name", "photos", "city", "latitude", "longitude",
                      "status", "subscription_status"):
            assert field in b, f"Missing field {field!r} in business response"
        assert isinstance(b["photos"], list)

    def test_featured_returns_at_least_one_for_mx(self):
        r = requests.get(
            f"{INTERNAL_URL}/api/businesses/featured?country_code=MX&limit=8",
            timeout=10,
        )
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1, "Expected at least 1 featured business for MX"

    def test_get_business_detail_has_photos_array(self):
        listing = requests.get(f"{INTERNAL_URL}/api/businesses?limit=10", timeout=10).json()
        # Pick the one with photos (Test Real Stripe is reported to have 8 photos)
        target = next((b for b in listing if b.get("photos")), None)
        assert target is not None, "No business with photos in listing"
        bid = target["id"]

        r = requests.get(f"{INTERNAL_URL}/api/businesses/{bid}", timeout=10)
        assert r.status_code == 200, r.text[:200]
        detail = r.json()
        assert "photos" in detail and isinstance(detail["photos"], list)
        assert len(detail["photos"]) >= 1, "Expected non-empty photos array"

        # Photo entries may be strings or objects {url:...}; normalize
        first = detail["photos"][0]
        url = first if isinstance(first, str) else (
            first.get("url") or first.get("secure_url") or first.get("src")
        )
        assert url and url.startswith(("http://", "https://")), f"Bad photo url: {first!r}"

        head = requests.head(url, timeout=15, allow_redirects=True)
        # Some CDNs disallow HEAD; fall back to GET if needed
        if head.status_code >= 400:
            head = requests.get(url, timeout=15, stream=True)
        assert head.status_code == 200, f"Photo URL not accessible ({head.status_code}): {url}"

    def test_sort_nearest_orders_by_distance(self):
        # User in Nuevo Laredo per problem statement
        user_lat = 27.4769
        user_lng = -99.5164
        r = requests.get(
            f"{INTERNAL_URL}/api/businesses",
            params={"sort": "nearest", "user_lat": user_lat, "user_lng": user_lng, "limit": 50},
            timeout=10,
        )
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert isinstance(data, list) and len(data) >= 1

        # Every result should have the distance_km field
        for b in data:
            assert "distance_km" in b, f"Missing distance_km on business {b.get('id')}"

        # Those with lat/lng should have a numeric distance_km; those without -> None
        with_coords = [b for b in data if b.get("latitude") is not None and b.get("longitude") is not None]
        without_coords = [b for b in data if b.get("latitude") is None or b.get("longitude") is None]

        for b in with_coords:
            assert isinstance(b["distance_km"], (int, float)), \
                f"distance_km should be numeric for {b['id']}, got {b['distance_km']!r}"
        for b in without_coords:
            assert b["distance_km"] is None, \
                f"distance_km should be null for business without coords {b['id']}"

        # Businesses without coords must come AFTER those with coords (sent to end)
        coords_flags = [b["distance_km"] is not None for b in data]
        # All Trues should appear before all Falses
        if True in coords_flags and False in coords_flags:
            last_true = max(i for i, v in enumerate(coords_flags) if v)
            first_false = min(i for i, v in enumerate(coords_flags) if not v)
            assert last_true < first_false, \
                "Businesses without coordinates must be ordered AFTER those with coordinates"

        # Among those with coords, distance_km should be ascending
        dists = [b["distance_km"] for b in with_coords]
        assert dists == sorted(dists), f"distance_km not ascending: {dists}"


# ---------- Categories ----------

class TestCategories:
    def test_categories_returns_list(self):
        r = requests.get(f"{INTERNAL_URL}/api/categories", timeout=10)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1, "Expected at least 1 category for dropdown"
        # Basic shape: each has an id and a localized name (API uses name_es / name_en)
        for c in data[:3]:
            assert "id" in c
            assert any(k in c for k in ("name", "name_es", "name_en")), \
                f"Category missing localized name: {c}"
