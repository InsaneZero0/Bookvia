"""Phase 15 tests: Mini-CRM (/my/clients*) + map swap (businesses distance_km)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend env file
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

BIZ_EMAIL = "testbiz_dashboard@test.com"
BIZ_PASS = "TestBiz123!"
USER_EMAIL = "testuser_stats@test.com"
USER_PASS = "TestPass123!"


def _login(email, password, kind="user"):
    path = "/api/auth/login" if kind == "user" else "/api/auth/business/login"
    r = requests.post(f"{BASE_URL}{path}", json={"email": email, "password": password}, timeout=15)
    return r


@pytest.fixture(scope="module")
def biz_token():
    r = _login(BIZ_EMAIL, BIZ_PASS, "business")
    if r.status_code != 200:
        # try user-login path (unified) as fallback
        r = _login(BIZ_EMAIL, BIZ_PASS, "user")
    if r.status_code != 200:
        pytest.skip(f"business login failed: {r.status_code} {r.text[:200]}")
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def user_token():
    r = _login(USER_EMAIL, USER_PASS, "user")
    if r.status_code != 200:
        pytest.skip(f"user login failed: {r.status_code}")
    return r.json().get("access_token") or r.json().get("token")


# ----- Mini-CRM endpoints -----

class TestMyClientsAuth:
    def test_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/businesses/my/clients", timeout=15)
        assert r.status_code in (401, 403), f"got {r.status_code}"

    def test_regular_user_forbidden(self, user_token):
        h = {"Authorization": f"Bearer {user_token}"}
        r = requests.get(f"{BASE_URL}/api/businesses/my/clients", headers=h, timeout=15)
        assert r.status_code in (401, 403, 404), f"got {r.status_code}"


class TestMyClientsRead:
    def test_list_shape(self, biz_token):
        h = {"Authorization": f"Bearer {biz_token}"}
        r = requests.get(f"{BASE_URL}/api/businesses/my/clients", headers=h, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "total" in data and "page" in data and "limit" in data
        assert "kpis" in data and "items" in data
        k = data["kpis"]
        for key in ("total_clients", "vip", "new", "inactive"):
            assert key in k
        assert isinstance(data["items"], list)

    def test_filter_params_accepted(self, biz_token):
        h = {"Authorization": f"Bearer {biz_token}"}
        for params in [{"q": "juan"}, {"tag": "vip"}, {"sort": "visits"},
                       {"sort": "spent"}, {"sort": "name"}, {"sort": "recent"},
                       {"page": 1, "limit": 10}]:
            r = requests.get(f"{BASE_URL}/api/businesses/my/clients",
                             headers=h, params=params, timeout=20)
            assert r.status_code == 200, f"params={params} -> {r.status_code} {r.text[:200]}"

    def test_pagination_bounds(self, biz_token):
        h = {"Authorization": f"Bearer {biz_token}"}
        r = requests.get(f"{BASE_URL}/api/businesses/my/clients",
                         headers=h, params={"page": 0, "limit": 999}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["page"] >= 1
        assert d["limit"] <= 200


class TestClientNote:
    def test_upsert_and_read_back(self, biz_token):
        h = {"Authorization": f"Bearer {biz_token}"}
        key = "TEST_pytest_phase15_fakekey"
        note = "TEST nota privada pytest phase15"
        r = requests.put(
            f"{BASE_URL}/api/businesses/my/clients/{key}/note",
            headers=h, json={"note": note}, timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("note") == note
        assert body.get("updated_at")

    def test_note_truncates_at_500(self, biz_token):
        h = {"Authorization": f"Bearer {biz_token}"}
        key = "TEST_pytest_phase15_truncate"
        big = "x" * 800
        r = requests.put(
            f"{BASE_URL}/api/businesses/my/clients/{key}/note",
            headers=h, json={"note": big}, timeout=15,
        )
        assert r.status_code == 200
        assert len(r.json()["note"]) == 500

    def test_note_auth(self, user_token):
        h = {"Authorization": f"Bearer {user_token}"}
        r = requests.put(
            f"{BASE_URL}/api/businesses/my/clients/foo/note",
            headers=h, json={"note": "x"}, timeout=15,
        )
        assert r.status_code in (401, 403, 404)


class TestClientExport:
    def test_csv_download(self, biz_token):
        h = {"Authorization": f"Bearer {biz_token}"}
        r = requests.post(f"{BASE_URL}/api/businesses/my/clients/export",
                          headers=h, timeout=30)
        assert r.status_code == 200, r.text
        assert "text/csv" in r.headers.get("content-type", "")
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower() and "clientes" in cd.lower()
        # Expect header row
        first_line = r.text.splitlines()[0]
        for col in ["name", "email", "phone", "total_visits", "total_spent",
                    "last_visit", "noshow_count", "tags", "private_note"]:
            assert col in first_line

    def test_csv_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/businesses/my/clients/export", timeout=15)
        assert r.status_code in (401, 403)


# ----- Map / distance_km parameter -----

class TestBusinessesDistance:
    def test_distance_km_returned(self):
        # Mexico City coords
        r = requests.get(
            f"{BASE_URL}/api/businesses",
            params={"user_lat": 19.4326, "user_lng": -99.1332, "limit": 5},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        arr = r.json()
        assert isinstance(arr, list)
        if arr:
            keys = set(arr[0].keys())
            assert "distance_km" in keys, f"missing distance_km in {keys}"

    def test_no_location_no_distance(self):
        r = requests.get(f"{BASE_URL}/api/businesses", params={"limit": 3}, timeout=20)
        assert r.status_code == 200
        # distance_km should not be populated as a number
        for b in r.json():
            assert b.get("distance_km") in (None, 0, 0.0) or "distance_km" not in b or b["distance_km"] is None
