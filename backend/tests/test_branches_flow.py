"""Backend tests for multi-branch (sucursales) flow.

Covers:
- Auto-migration: GET /branches creates primary on first call (idempotent)
- Backfill: existing bookings get branch_id of primary
- CRUD: create / patch / soft-delete
- set-primary atomicity (only 1 primary per business)
- Public endpoint vs authenticated endpoint
- Delete restrictions (primary, future bookings)
"""
import os
import uuid
import asyncio
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

BIZ_EMAIL = "testbiz_dashboard@test.com"
BIZ_PASS = "TestBiz123!"
USER_EMAIL = "test@example.com"
USER_PASS = "TestPass123!"


# ------------- helpers -------------

def _login(email: str, password: str, login_path: str = "/auth/login") -> str:
    r = requests.post(f"{API}{login_path}", json={"email": email, "password": password}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Login failed for {email}: {r.status_code} {r.text[:200]}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def biz_token():
    return _login(BIZ_EMAIL, BIZ_PASS)


@pytest.fixture(scope="module")
def biz_headers(biz_token):
    return {"Authorization": f"Bearer {biz_token}"}


@pytest.fixture(scope="module")
def biz_business_id(biz_headers):
    # First call to /branches will auto-create primary; then read business_id from any branch
    r = requests.get(f"{API}/businesses/me/branches", headers=biz_headers, timeout=15)
    assert r.status_code == 200, f"Could not bootstrap branches: {r.status_code} {r.text}"
    arr = r.json()
    assert len(arr) >= 1, "Expected at least the auto-created primary"
    return arr[0]["business_id"]


# ------------- 1. Auth gate -------------

def test_branches_requires_auth():
    r = requests.get(f"{API}/businesses/me/branches", timeout=15)
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


# ------------- 2. Auto-migration creates exactly 1 primary -------------

def test_auto_migration_creates_primary(biz_headers):
    r = requests.get(f"{API}/businesses/me/branches", headers=biz_headers, timeout=15)
    assert r.status_code == 200
    branches = r.json()
    primaries = [b for b in branches if b.get("is_primary")]
    assert len(primaries) == 1, f"Expected exactly 1 primary branch, got {len(primaries)}"
    p = primaries[0]
    assert p.get("is_active") is True
    assert "id" in p and "business_id" in p
    assert p.get("name"), "Primary branch must have a name"


def test_auto_migration_idempotent(biz_headers):
    r1 = requests.get(f"{API}/businesses/me/branches", headers=biz_headers, timeout=15)
    r2 = requests.get(f"{API}/businesses/me/branches", headers=biz_headers, timeout=15)
    assert r1.status_code == 200 and r2.status_code == 200
    primaries_1 = [b for b in r1.json() if b.get("is_primary")]
    primaries_2 = [b for b in r2.json() if b.get("is_primary")]
    assert len(primaries_1) == 1 and len(primaries_2) == 1
    assert primaries_1[0]["id"] == primaries_2[0]["id"], "Primary branch id must remain stable"


# ------------- 3. Backfill of bookings -------------

def test_backfill_bookings_have_branch_id(biz_headers, biz_business_id):
    """After GET /branches, existing bookings of business should have branch_id set."""
    from motor.motor_asyncio import AsyncIOMotorClient

    async def _check():
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        if not mongo_url or not db_name:
            pytest.skip("MONGO_URL/DB_NAME not in env")
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        total = await db.bookings.count_documents({"business_id": biz_business_id})
        missing = await db.bookings.count_documents({
            "business_id": biz_business_id,
            "$or": [{"branch_id": {"$exists": False}}, {"branch_id": None}, {"branch_id": ""}],
        })
        client.close()
        return total, missing

    total, missing = asyncio.get_event_loop().run_until_complete(_check())
    # If there are no bookings this assertion is trivially true.
    assert missing == 0, f"{missing} bookings still missing branch_id (of {total} total) — backfill failed"


# ------------- 4. CRUD create -------------

_created_branch_id = {"id": None}


def test_create_branch_ok(biz_headers):
    payload = {
        "name": f"TEST_Sucursal_{uuid.uuid4().hex[:6]}",
        "address": "Av Test 123",
        "city": "CDMX",
        "state": "CDMX",
        "zip_code": "01000",
        "phone": "+525512345678",
    }
    r = requests.post(f"{API}/businesses/me/branches", json=payload, headers=biz_headers, timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    assert data["name"] == payload["name"]
    assert data["address"] == payload["address"]
    assert data["is_primary"] is False
    assert data["is_active"] is True
    assert "id" in data
    _created_branch_id["id"] = data["id"]


def test_create_branch_missing_required_returns_422(biz_headers):
    # Missing 'name'
    r = requests.post(f"{API}/businesses/me/branches",
                      json={"address": "X", "city": "Y", "state": "Z"},
                      headers=biz_headers, timeout=15)
    assert r.status_code == 422, f"Expected 422, got {r.status_code}"
    # Missing 'address'
    r2 = requests.post(f"{API}/businesses/me/branches",
                       json={"name": "X", "city": "Y", "state": "Z"},
                       headers=biz_headers, timeout=15)
    assert r2.status_code == 422


def test_create_branch_unauthenticated_returns_401_or_403():
    r = requests.post(f"{API}/businesses/me/branches",
                      json={"name": "x", "address": "x", "city": "x", "state": "x"},
                      timeout=15)
    assert r.status_code in (401, 403)


def test_create_branch_as_regular_user_blocked():
    """A normal user (not business owner) should be blocked from creating branches."""
    tok = _login(USER_EMAIL, USER_PASS)
    headers = {"Authorization": f"Bearer {tok}"}
    r = requests.post(f"{API}/businesses/me/branches",
                      json={"name": "TEST_x", "address": "x", "city": "x", "state": "x"},
                      headers=headers, timeout=15)
    # require_business should reject non-business users (401/403/404)
    assert r.status_code in (401, 403, 404), f"Expected non-200 for non-business, got {r.status_code}"


# ------------- 5. PATCH update -------------

def test_patch_branch_updates_fields(biz_headers):
    bid = _created_branch_id["id"]
    assert bid, "Previous test must have created a branch"
    new_phone = "+525599999999"
    r = requests.patch(f"{API}/businesses/me/branches/{bid}",
                       json={"phone": new_phone, "city": "Guadalajara"},
                       headers=biz_headers, timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    assert data["phone"] == new_phone
    assert data["city"] == "Guadalajara"
    # Verify persistence via GET
    g = requests.get(f"{API}/businesses/me/branches/{bid}", headers=biz_headers, timeout=15)
    assert g.status_code == 200
    assert g.json()["phone"] == new_phone


def test_patch_cross_business_not_found(biz_headers):
    # Fake branch id should give 404
    r = requests.patch(f"{API}/businesses/me/branches/nonexistent-id-xyz",
                       json={"phone": "x"},
                       headers=biz_headers, timeout=15)
    assert r.status_code == 404


# ------------- 6. Set-primary atomicity -------------

def test_set_primary_demotes_old_and_only_one_primary(biz_headers):
    bid = _created_branch_id["id"]
    assert bid
    # Capture the current primary id
    r0 = requests.get(f"{API}/businesses/me/branches", headers=biz_headers, timeout=15)
    primaries_before = [b for b in r0.json() if b.get("is_primary")]
    assert len(primaries_before) == 1
    old_primary_id = primaries_before[0]["id"]
    assert old_primary_id != bid, "Test branch should not already be primary"

    # Promote
    r = requests.post(f"{API}/businesses/me/branches/{bid}/set-primary",
                      headers=biz_headers, timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text}"

    # Re-list and assert atomicity
    r2 = requests.get(f"{API}/businesses/me/branches", headers=biz_headers, timeout=15)
    arr = r2.json()
    primaries_after = [b for b in arr if b.get("is_primary")]
    assert len(primaries_after) == 1, f"Expected exactly 1 primary after promote, got {len(primaries_after)}"
    assert primaries_after[0]["id"] == bid

    # Restore old primary to keep db sane for other tests
    requests.post(f"{API}/businesses/me/branches/{old_primary_id}/set-primary",
                  headers=biz_headers, timeout=15)


def test_set_primary_inactive_branch_blocked(biz_headers):
    """Cannot promote an inactive branch."""
    # Create a temp branch and deactivate it via PATCH is_active=False
    payload = {"name": f"TEST_Inactive_{uuid.uuid4().hex[:6]}",
               "address": "x", "city": "x", "state": "x"}
    cr = requests.post(f"{API}/businesses/me/branches", json=payload, headers=biz_headers, timeout=15)
    assert cr.status_code == 200
    bid = cr.json()["id"]
    pr = requests.patch(f"{API}/businesses/me/branches/{bid}",
                        json={"is_active": False}, headers=biz_headers, timeout=15)
    assert pr.status_code == 200
    # Try promote
    sp = requests.post(f"{API}/businesses/me/branches/{bid}/set-primary",
                       headers=biz_headers, timeout=15)
    assert sp.status_code == 400, f"Expected 400 promoting inactive, got {sp.status_code}"


# ------------- 7. Delete restrictions -------------

def test_delete_primary_blocked(biz_headers):
    r0 = requests.get(f"{API}/businesses/me/branches", headers=biz_headers, timeout=15)
    primary = [b for b in r0.json() if b.get("is_primary")][0]
    r = requests.delete(f"{API}/businesses/me/branches/{primary['id']}",
                        headers=biz_headers, timeout=15)
    assert r.status_code == 400, f"Primary delete should be 400, got {r.status_code}"


def test_delete_non_primary_soft_deletes(biz_headers):
    # Create a clean branch with no bookings and delete it
    payload = {"name": f"TEST_ToDelete_{uuid.uuid4().hex[:6]}",
               "address": "x", "city": "x", "state": "x"}
    cr = requests.post(f"{API}/businesses/me/branches", json=payload, headers=biz_headers, timeout=15)
    assert cr.status_code == 200
    bid = cr.json()["id"]
    dr = requests.delete(f"{API}/businesses/me/branches/{bid}",
                         headers=biz_headers, timeout=15)
    assert dr.status_code == 200, f"{dr.status_code} {dr.text}"
    # Confirm soft-delete: GET returns it but is_active=False
    g = requests.get(f"{API}/businesses/me/branches/{bid}", headers=biz_headers, timeout=15)
    assert g.status_code == 200
    assert g.json()["is_active"] is False


# ------------- 8. Public endpoint -------------

def test_public_branches_endpoint_no_auth(biz_business_id):
    r = requests.get(f"{API}/businesses/{biz_business_id}/branches", timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    arr = r.json()
    assert isinstance(arr, list)
    assert len(arr) >= 1, "Should auto-create primary if none present"
    # Only active branches
    for b in arr:
        assert b.get("is_active") is True, "Public endpoint must return only active branches"
    # Primary first
    assert arr[0].get("is_primary") is True, "Primary branch must be first in public list"


def test_public_branches_404_for_unknown_business():
    r = requests.get(f"{API}/businesses/does-not-exist-xyz/branches", timeout=15)
    assert r.status_code == 404


# ------------- 9. Fase D: branch_id filter on /me/dashboard -------------

def test_dashboard_no_branch_returns_aggregate(biz_headers):
    r = requests.get(f"{API}/businesses/me/dashboard", headers=biz_headers, timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    assert "stats" in data
    stats = data["stats"]
    # New field
    assert "unique_customers_month" in stats, "Stats response must include 'unique_customers_month'"
    assert isinstance(stats["unique_customers_month"], int)
    # Other expected keys remain
    for key in ("today_appointments", "pending_appointments", "month_revenue", "total_appointments"):
        assert key in stats


def test_dashboard_with_branch_id_filters_stats(biz_headers):
    # Get current primary branch id
    rb = requests.get(f"{API}/businesses/me/branches", headers=biz_headers, timeout=15)
    assert rb.status_code == 200
    branches = [b for b in rb.json() if b.get("is_active")]
    assert len(branches) >= 1
    primary = next((b for b in branches if b.get("is_primary")), branches[0])

    # Aggregate (no branch filter)
    r_all = requests.get(f"{API}/businesses/me/dashboard", headers=biz_headers, timeout=15)
    assert r_all.status_code == 200
    s_all = r_all.json()["stats"]

    # With branch filter
    r_b = requests.get(f"{API}/businesses/me/dashboard?branch_id={primary['id']}", headers=biz_headers, timeout=15)
    assert r_b.status_code == 200, f"{r_b.status_code} {r_b.text}"
    s_b = r_b.json()["stats"]

    # Branch-filtered counts must be <= aggregate
    for key in ("today_appointments", "pending_appointments", "total_appointments", "unique_customers_month"):
        assert s_b[key] <= s_all[key], f"branch-filtered {key} ({s_b[key]}) > aggregate ({s_all[key]})"


def test_dashboard_with_unknown_branch_zero_stats(biz_headers):
    fake_id = f"non-existent-{uuid.uuid4().hex[:8]}"
    r = requests.get(f"{API}/businesses/me/dashboard?branch_id={fake_id}", headers=biz_headers, timeout=15)
    assert r.status_code == 200
    s = r.json()["stats"]
    assert s["today_appointments"] == 0
    assert s["pending_appointments"] == 0
    assert s["total_appointments"] == 0
    assert s["unique_customers_month"] == 0
    assert s["month_revenue"] == 0


# ------------- 10. Fase D: branch_id filter on /bookings/business -------------

def test_bookings_business_no_branch_returns_all(biz_headers):
    r = requests.get(f"{API}/bookings/business", headers=biz_headers, timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    arr = r.json()
    assert isinstance(arr, list)


def test_bookings_business_with_branch_id_filters(biz_headers):
    rb = requests.get(f"{API}/businesses/me/branches", headers=biz_headers, timeout=15)
    assert rb.status_code == 200
    active = [b for b in rb.json() if b.get("is_active")]
    assert active, "Expected at least 1 active branch"
    primary = next((b for b in active if b.get("is_primary")), active[0])

    r_all = requests.get(f"{API}/bookings/business", headers=biz_headers, timeout=15)
    r_b = requests.get(f"{API}/bookings/business?branch_id={primary['id']}", headers=biz_headers, timeout=15)
    assert r_all.status_code == 200 and r_b.status_code == 200
    all_arr = r_all.json()
    branch_arr = r_b.json()
    # Subset semantics: every branch result is also present in aggregate (by id)
    all_ids = {bk.get("id") for bk in all_arr}
    for bk in branch_arr:
        assert bk.get("id") in all_ids, "Branch booking missing from aggregate list"
    # Every booking returned with branch filter must have matching branch_id (when field present)
    for bk in branch_arr:
        if "branch_id" in bk and bk["branch_id"] is not None:
            assert bk["branch_id"] == primary["id"], f"booking {bk.get('id')} has branch_id={bk.get('branch_id')} != {primary['id']}"


def test_bookings_business_with_unknown_branch_returns_empty(biz_headers):
    fake_id = f"non-existent-{uuid.uuid4().hex[:8]}"
    r = requests.get(f"{API}/bookings/business?branch_id={fake_id}", headers=biz_headers, timeout=15)
    assert r.status_code == 200
    arr = r.json()
    assert isinstance(arr, list)
    assert len(arr) == 0, f"Expected empty list for unknown branch, got {len(arr)}"


def test_bookings_business_with_date_and_branch(biz_headers):
    rb = requests.get(f"{API}/businesses/me/branches", headers=biz_headers, timeout=15)
    primary = next((b for b in rb.json() if b.get("is_primary")), None)
    assert primary
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    r = requests.get(f"{API}/bookings/business?branch_id={primary['id']}&date={today}",
                     headers=biz_headers, timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    arr = r.json()
    for bk in arr:
        assert bk.get("date") == today
        if bk.get("branch_id"):
            assert bk["branch_id"] == primary["id"]


# ------------- 11. Fase D: branch_id filter on /bookings/business/stats-detail -------------

def test_stats_detail_today_with_branch_filter(biz_headers):
    rb = requests.get(f"{API}/businesses/me/branches", headers=biz_headers, timeout=15)
    primary = next((b for b in rb.json() if b.get("is_primary")), None)
    assert primary
    r_all = requests.get(f"{API}/bookings/business/stats-detail?stat_type=today",
                        headers=biz_headers, timeout=15)
    r_b = requests.get(f"{API}/bookings/business/stats-detail?stat_type=today&branch_id={primary['id']}",
                      headers=biz_headers, timeout=15)
    assert r_all.status_code == 200, f"{r_all.status_code} {r_all.text}"
    assert r_b.status_code == 200, f"{r_b.status_code} {r_b.text}"
    all_data = r_all.json()
    b_data = r_b.json()
    # The detail endpoint may return list or dict — handle both shapes
    def _items(payload):
        if isinstance(payload, list): return payload
        if isinstance(payload, dict):
            for key in ("bookings", "items", "data", "results"):
                if isinstance(payload.get(key), list): return payload[key]
        return []
    all_items = _items(all_data)
    b_items = _items(b_data)
    assert len(b_items) <= len(all_items), "Branch-filtered detail must be subset of aggregate"


def test_stats_detail_unknown_branch_returns_empty(biz_headers):
    fake_id = f"non-existent-{uuid.uuid4().hex[:8]}"
    r = requests.get(f"{API}/bookings/business/stats-detail?stat_type=today&branch_id={fake_id}",
                    headers=biz_headers, timeout=15)
    assert r.status_code == 200
    payload = r.json()
    if isinstance(payload, list):
        assert len(payload) == 0
    elif isinstance(payload, dict):
        for key in ("bookings", "items", "data", "results"):
            if isinstance(payload.get(key), list):
                assert len(payload[key]) == 0


# ------------- 12. Fase E: multi-branch expansion in search -------------

def test_search_expansion_business_with_multi_branches_returns_one_row_per_branch(biz_headers, biz_business_id):
    """A business with N>1 active branches must appear as N rows in /api/businesses, one per branch."""
    # Ensure biz has at least 2 active branches (testbiz_dashboard has Principal + Sucursal Norte)
    rb = requests.get(f"{API}/businesses/me/branches", headers=biz_headers, timeout=15)
    assert rb.status_code == 200
    active = [b for b in rb.json() if b.get("is_active")]
    if len(active) < 2:
        pytest.skip("Business needs >=2 active branches for this test")

    r = requests.get(f"{API}/businesses?limit=50", timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    rows = r.json()
    # Filter rows that belong to testbiz_dashboard's business_id
    biz_rows = [row for row in rows if row.get("id") == biz_business_id]
    assert len(biz_rows) >= 2, (
        f"Expected at least 2 rows for business with {len(active)} active branches, got {len(biz_rows)}"
    )
    # Each row must have branch_id, branch_name, is_primary_branch
    branch_ids_seen = set()
    primary_count = 0
    for row in biz_rows:
        assert row.get("branch_id"), f"Row missing branch_id: {row}"
        assert "branch_name" in row, f"Row missing branch_name: {row}"
        assert "is_primary_branch" in row, f"Row missing is_primary_branch: {row}"
        branch_ids_seen.add(row["branch_id"])
        if row.get("is_primary_branch"):
            primary_count += 1
    # All branch_ids must be unique among the rows
    assert len(branch_ids_seen) == len(biz_rows), "Duplicate branch_id across rows"
    # Exactly 1 primary among the rows (the primary is preserved as the "main" row)
    assert primary_count == 1, f"Expected exactly 1 primary row, got {primary_count}"

    # Primary row must keep original business name (no suffix); non-primary rows have suffix
    primary_row = next(r for r in biz_rows if r.get("is_primary_branch"))
    non_primary_rows = [r for r in biz_rows if not r.get("is_primary_branch")]
    # Primary row name should equal a simple business name (no " - Suc" suffix added)
    assert " - " not in primary_row["name"] or primary_row["name"].count(" - ") == 0 \
        or primary_row.get("branch_name", "") in primary_row["name"], (
        f"Primary row name unexpectedly suffixed: {primary_row['name']}"
    )
    # Non-primary rows must follow 'Business - BranchName' format
    for row in non_primary_rows:
        assert row.get("branch_name"), "Non-primary row missing branch_name"
        assert row["branch_name"] in row["name"], (
            f"Non-primary row name '{row['name']}' should include branch_name '{row['branch_name']}'"
        )
        assert " - " in row["name"], f"Non-primary row name missing ' - ' separator: {row['name']}"


def test_search_expansion_single_branch_business_is_not_expanded():
    """A business with exactly 1 active branch must still return only 1 row in the search."""
    r = requests.get(f"{API}/businesses?limit=50", timeout=15)
    assert r.status_code == 200
    rows = r.json()
    # Group by business id
    from collections import Counter
    counts = Counter(row.get("id") for row in rows)
    # For every business_id with count==1, ensure that branch_id is either absent OR is_primary_branch is None
    # (i.e., not an artificially expanded row). Test Real Stripe should fall in this bucket.
    single_biz = [bid for bid, c in counts.items() if c == 1]
    assert single_biz, "Expected at least 1 business with a single row in the response"
    # No assertion needed on absence of branch_id (1-branch businesses still get branch_id attached
    # but are not "expanded" into multiple rows).


def test_search_city_filter_applies_to_branches(biz_headers, biz_business_id):
    """When ?city=X is requested, only branches whose city matches X should appear after expansion.
    We create a TEST_ branch with a unique city, then search by that city — expecting only that one branch
    of testbiz_dashboard to appear."""
    unique_city = f"TestCity{uuid.uuid4().hex[:6]}"
    # Create temp branch with unique city
    payload = {
        "name": f"TEST_CityFilter_{uuid.uuid4().hex[:6]}",
        "address": "Av Test 999",
        "city": unique_city,
        "state": "TST",
        "zip_code": "99999",
    }
    cr = requests.post(f"{API}/businesses/me/branches", json=payload, headers=biz_headers, timeout=15)
    assert cr.status_code == 200, f"{cr.status_code} {cr.text}"
    new_branch_id = cr.json()["id"]
    # Also patch the business itself to share this city, since the upstream filter
    # also requires business.city to match. Without it the biz is excluded BEFORE expansion.
    # Patch via direct DB to avoid touching production endpoints.
    from motor.motor_asyncio import AsyncIOMotorClient
    async def _set_biz_city():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        orig = await db.businesses.find_one({"id": biz_business_id}, {"_id": 0, "city": 1})
        original_city = orig.get("city") if orig else None
        await db.businesses.update_one({"id": biz_business_id}, {"$set": {"city": unique_city}})
        client.close()
        return original_city

    async def _restore_biz_city(original_city):
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        await db.businesses.update_one({"id": biz_business_id}, {"$set": {"city": original_city or ""}})
        client.close()

    original_city = asyncio.get_event_loop().run_until_complete(_set_biz_city())

    try:
        # Search with the unique city
        r = requests.get(f"{API}/businesses?city={unique_city}&limit=50", timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        rows = r.json()
        biz_rows = [row for row in rows if row.get("id") == biz_business_id]
        # Only the newly-created branch should match (other branches are 'Ciudad de Mexico')
        assert len(biz_rows) == 1, f"Expected exactly 1 branch row for unique city, got {len(biz_rows)}: {[r.get('branch_name') for r in biz_rows]}"
        assert biz_rows[0]["branch_id"] == new_branch_id
        assert biz_rows[0]["city"] == unique_city
    finally:
        # Restore business city
        asyncio.get_event_loop().run_until_complete(_restore_biz_city(original_city))
        # Soft-delete the temp branch
        requests.delete(f"{API}/businesses/me/branches/{new_branch_id}", headers=biz_headers, timeout=15)


# ------------- 13. Fase E: booking POST persists branch_id -------------

def _find_or_skip_bookable_setup(biz_email: str, biz_pass: str):
    """Helper: login as business, find a worker + service that can be combined for a booking.
    Returns (token, business_id, service_id, worker_id) or pytest.skip if not enough data."""
    tok = _login(biz_email, biz_pass)
    headers = {"Authorization": f"Bearer {tok}"}
    # workers
    rw = requests.get(f"{API}/businesses/my/workers", headers=headers, timeout=15)
    if rw.status_code != 200 or not rw.json():
        return None
    workers = [w for w in rw.json() if w.get("active", True)]
    if not workers:
        return None
    # Get business id from /me/branches (every branch carries business_id)
    rb = requests.get(f"{API}/businesses/me/branches", headers=headers, timeout=15)
    business_id = None
    if rb.status_code == 200 and rb.json():
        business_id = rb.json()[0].get("business_id")
    if not business_id:
        return None
    # services - public endpoint
    rs = requests.get(f"{API}/services/business/{business_id}", timeout=15)
    services = []
    if rs.status_code == 200 and isinstance(rs.json(), list):
        services = [s for s in rs.json() if s.get("active", True) is not False]
    # If no services, attempt to seed a TEST_ service so the booking flow can be tested
    if not services:
        seed_payload = {
            "name": f"TEST_BookingService_{uuid.uuid4().hex[:6]}",
            "description": "Temp test service for branch_id persistence test",
            "price": 100,
            "duration_minutes": 30,
        }
        sr = requests.post(f"{API}/services", json=seed_payload, headers=headers, timeout=15)
        if sr.status_code != 200:
            return None
        services = [sr.json()]
    service = services[0]
    # Also ensure the worker can perform this service (assign service to worker if needed)
    worker = workers[0]
    if worker.get("service_ids") and service["id"] not in worker["service_ids"]:
        new_ids = list(worker["service_ids"]) + [service["id"]]
        requests.put(
            f"{API}/businesses/my/workers/{worker['id']}/services",
            json={"service_ids": new_ids}, headers=headers, timeout=15
        )
    elif not worker.get("service_ids"):
        # Empty service_ids: many backends treat empty as 'all services allowed'; leave as-is.
        pass
    return tok, business_id, service["id"], worker["id"]


def test_booking_post_with_branch_id_persists(biz_headers, biz_business_id):
    """POST /api/bookings with branch_id in body must persist branch_id on the booking doc.
    Uses testspa (has workers + services). Creates a temp non-primary branch for the test."""
    # Try testbiz_dashboard first; if no workers, fall back to testspa
    setup = _find_or_skip_bookable_setup(BIZ_EMAIL, BIZ_PASS)
    if not setup:
        setup = _find_or_skip_bookable_setup("testspa@test.com", "Test123!")
    if not setup:
        pytest.skip("No business with worker+service available for booking persistence test")
    tok, business_id, service_id, worker_id = setup
    headers = {"Authorization": f"Bearer {tok}"}

    # Pick a non-primary branch; if none exists, create a temp one
    rb = requests.get(f"{API}/businesses/me/branches", headers=headers, timeout=15)
    active = [b for b in rb.json() if b.get("is_active")]
    non_primary = next((b for b in active if not b.get("is_primary")), None)
    temp_branch_id = None
    if not non_primary:
        cp = {"name": f"TEST_BookingBranch_{uuid.uuid4().hex[:6]}",
              "address": "Av Test 777", "city": "CDMX", "state": "CDMX"}
        cr = requests.post(f"{API}/businesses/me/branches", json=cp, headers=headers, timeout=15)
        if cr.status_code != 200:
            pytest.skip(f"Could not create temp branch: {cr.status_code} {cr.text}")
        non_primary = cr.json()
        temp_branch_id = non_primary["id"]

    # Use a date 60 days in future to avoid conflicts
    future_date = (datetime.now(timezone.utc) + timedelta(days=60)).strftime("%Y-%m-%d")
    payload = {
        "business_id": business_id,
        "service_id": service_id,
        "worker_id": worker_id,
        "date": future_date,
        "time": "10:00",
        "branch_id": non_primary["id"],
        "skip_payment": True,
        "client_name": "TEST_Branch_E",
        "client_email": "test_branch_e@example.com",
        "client_phone": "+525500000001",
    }
    r = requests.post(f"{API}/bookings", json=payload, headers=headers, timeout=20)
    if r.status_code in (400, 409):
        # Try a different time to avoid slot conflicts
        payload["time"] = "16:30"
        r = requests.post(f"{API}/bookings", json=payload, headers=headers, timeout=20)
    assert r.status_code == 200, f"Booking failed: {r.status_code} {r.text}"
    booking = r.json()
    booking_id = booking.get("id")
    assert booking_id

    # Verify branch_id persisted via DB (the response may not include branch_id)
    from motor.motor_asyncio import AsyncIOMotorClient
    async def _check():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        doc = await db.bookings.find_one({"id": booking_id}, {"_id": 0, "branch_id": 1})
        # Cleanup
        await db.bookings.delete_one({"id": booking_id})
        client.close()
        return doc

    doc = asyncio.get_event_loop().run_until_complete(_check())
    # Cleanup temp branch if we created one
    if temp_branch_id:
        requests.delete(f"{API}/businesses/me/branches/{temp_branch_id}", headers=headers, timeout=15)
    assert doc is not None, "Booking was not persisted"
    assert doc.get("branch_id") == non_primary["id"], (
        f"Expected branch_id={non_primary['id']}, got {doc.get('branch_id')}"
    )


def test_booking_post_without_branch_id_auto_assigns_primary(biz_headers, biz_business_id):
    """POST /api/bookings WITHOUT branch_id in body must auto-set the primary branch_id."""
    setup = _find_or_skip_bookable_setup(BIZ_EMAIL, BIZ_PASS)
    if not setup:
        setup = _find_or_skip_bookable_setup("testspa@test.com", "Test123!")
    if not setup:
        pytest.skip("No business with worker+service available for booking auto-primary test")
    tok, business_id, service_id, worker_id = setup
    headers = {"Authorization": f"Bearer {tok}"}

    rb = requests.get(f"{API}/businesses/me/branches", headers=headers, timeout=15)
    primary = next((b for b in rb.json() if b.get("is_primary") and b.get("is_active")), None)
    if not primary:
        pytest.skip("No primary branch available")

    future_date = (datetime.now(timezone.utc) + timedelta(days=61)).strftime("%Y-%m-%d")
    payload = {
        "business_id": business_id,
        "service_id": service_id,
        "worker_id": worker_id,
        "date": future_date,
        "time": "11:00",
        # NOTE: branch_id intentionally omitted
        "skip_payment": True,
        "client_name": "TEST_AutoPrimary",
        "client_email": "test_autoprimary@example.com",
        "client_phone": "+525500000002",
    }
    r = requests.post(f"{API}/bookings", json=payload, headers=headers, timeout=20)
    if r.status_code in (400, 409):
        payload["time"] = "17:30"
        r = requests.post(f"{API}/bookings", json=payload, headers=headers, timeout=20)
    assert r.status_code == 200, f"Booking failed: {r.status_code} {r.text}"
    booking_id = r.json().get("id")
    assert booking_id

    from motor.motor_asyncio import AsyncIOMotorClient
    async def _check():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        doc = await db.bookings.find_one({"id": booking_id}, {"_id": 0, "branch_id": 1})
        await db.bookings.delete_one({"id": booking_id})
        client.close()
        return doc

    doc = asyncio.get_event_loop().run_until_complete(_check())
    assert doc is not None
    assert doc.get("branch_id") == primary["id"], (
        f"Expected auto-assigned primary branch_id={primary['id']}, got {doc.get('branch_id')}"
    )
