"""Tests for /api/businesses search redesign: top_services + min_price + regression."""
import os, requests, pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://marketplace-test-21.preview.emergentagent.com').rstrip('/')

@pytest.fixture
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s

def test_search_mx_returns_top_services_and_min_price(client):
    r = client.get(f"{BASE_URL}/api/businesses?country_code=MX&limit=5", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1, "Expected at least 1 MX business"
    for b in data:
        assert "top_services" in b, f"missing top_services on {b.get('name')}"
        assert isinstance(b["top_services"], list)
        assert len(b["top_services"]) <= 3
        assert "min_price" in b
        if b["top_services"]:
            for s in b["top_services"]:
                assert "name" in s and "price" in s
            prices = [s["price"] for s in b["top_services"] if s.get("price")]
            if len(prices) >= 2:
                assert prices == sorted(prices), f"top_services not ASC for {b['name']}: {prices}"
            if b.get("min_price") is not None and prices:
                assert b["min_price"] == min(prices)

def test_search_mx_test_real_stripe_has_3_services_starting_at_150(client):
    r = client.get(f"{BASE_URL}/api/businesses?country_code=MX&limit=20", timeout=30)
    assert r.status_code == 200
    data = r.json()
    targets = [b for b in data if "real" in (b.get("name") or "").lower() and "stripe" in (b.get("name") or "").lower()]
    if not targets:
        pytest.skip("Test Real Stripe business not in this env")
    b = targets[0]
    assert len(b["top_services"]) == 3
    assert b["min_price"] == 150 or b["top_services"][0]["price"] == 150

def test_search_mx_regression_legacy_fields_present(client):
    r = client.get(f"{BASE_URL}/api/businesses?country_code=MX&limit=5", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    required = ["id", "name", "slug", "photos", "rating", "review_count", "city", "country_code"]
    for b in data:
        for f in required:
            assert f in b, f"missing field {f} in {b.get('name')}"

def test_search_us_empty_array_no_error(client):
    r = client.get(f"{BASE_URL}/api/businesses?country_code=US&limit=5", timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    # Per request: US has 0 businesses -> empty array, not error
    assert data == [] or all(b.get("country_code") == "US" for b in data)
