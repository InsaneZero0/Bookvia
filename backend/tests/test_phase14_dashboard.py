"""Phase 14: Business Dashboard activation + metrics tests."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://marketplace-test-21.preview.emergentagent.com").rstrip("/")
BIZ_EMAIL = "testbiz_dashboard@test.com"
BIZ_PASS = "TestBiz123!"
USER_EMAIL = "test@test.com"
USER_PASS = "test123"


@pytest.fixture(scope="module")
def biz_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": BIZ_EMAIL, "password": BIZ_PASS}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Biz login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def user_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": USER_EMAIL, "password": USER_PASS}, timeout=15)
    if r.status_code != 200:
        return None
    return r.json().get("token") or r.json().get("access_token")


def test_profile_completion_requires_auth():
    r = requests.get(f"{BASE_URL}/api/businesses/my/profile-completion", timeout=15)
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


def test_profile_completion_requires_business_role(user_token):
    if not user_token:
        pytest.skip("no user token")
    r = requests.get(f"{BASE_URL}/api/businesses/my/profile-completion",
                     headers={"Authorization": f"Bearer {user_token}"}, timeout=15)
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


def test_profile_completion_shape(biz_token):
    r = requests.get(f"{BASE_URL}/api/businesses/my/profile-completion",
                     headers={"Authorization": f"Bearer {biz_token}"}, timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    data = r.json()
    for k in ["percentage", "done_count", "total_count", "items", "is_complete"]:
        assert k in data, f"missing {k}"
    assert data["total_count"] == 7
    assert isinstance(data["items"], list) and len(data["items"]) == 7
    keys = {it["key"] for it in data["items"]}
    assert keys == {"cover", "photos", "services", "description", "hours", "team", "kyc"}
    for it in data["items"]:
        for k in ("key", "done", "label_es", "label_en", "action_path"):
            assert k in it
    assert data["percentage"] == round((data["done_count"] / 7) * 100)
    assert data["is_complete"] == (data["percentage"] == 100)


def test_dashboard_summary_new_fields(biz_token):
    r = requests.get(f"{BASE_URL}/api/businesses/my/dashboard-summary",
                     headers={"Authorization": f"Bearer {biz_token}"}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    # legacy
    for k in ["today", "week", "month", "new_reviews"]:
        assert k in d
    # new
    for k in ["profile_views_30d", "bookings_30d", "conversion_pct", "top_services"]:
        assert k in d, f"missing new field {k}"
    assert isinstance(d["profile_views_30d"], int)
    assert isinstance(d["bookings_30d"], int)
    assert isinstance(d["conversion_pct"], (int, float))
    assert isinstance(d["top_services"], list)


def test_profile_view_tracking_anon():
    # Get a business id via slug (marketplace-test-21? unknown). Use search to get one.
    r = requests.get(f"{BASE_URL}/api/businesses?limit=1", timeout=15)
    assert r.status_code == 200
    arr = r.json()
    if not arr:
        pytest.skip("no public business available")
    bid = arr[0]["id"]
    # anon hit
    r2 = requests.get(f"{BASE_URL}/api/businesses/{bid}", timeout=15)
    assert r2.status_code == 200


def test_business_stats_detail_today(biz_token):
    r = requests.get(f"{BASE_URL}/api/bookings/business/stats-detail?stat_type=today",
                     headers={"Authorization": f"Bearer {biz_token}"}, timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    d = r.json()
    for k in ("bookings", "count", "total_revenue"):
        assert k in d, f"missing {k}"


@pytest.mark.parametrize("stat", ["today", "pending", "revenue", "total"])
def test_business_stats_detail_all_types(biz_token, stat):
    r = requests.get(f"{BASE_URL}/api/bookings/business/stats-detail?stat_type={stat}",
                     headers={"Authorization": f"Bearer {biz_token}"}, timeout=15)
    assert r.status_code == 200, f"{stat}: {r.status_code} {r.text[:300]}"
    d = r.json()
    assert "bookings" in d and "count" in d


def test_business_stats_detail_invalid(biz_token):
    r = requests.get(f"{BASE_URL}/api/bookings/business/stats-detail?stat_type=bogus",
                     headers={"Authorization": f"Bearer {biz_token}"}, timeout=15)
    assert r.status_code == 400
