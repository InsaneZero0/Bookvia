# Fase 10b - Terms acceptance history, grace period, gate (409 terms_outdated), admin history.
import os, sys, uuid, asyncio, importlib
from datetime import datetime, timezone, timedelta
import pymongo, pytest, requests, jwt as pyjwt
from fastapi import HTTPException

sys.path.insert(0, "/app/backend")

def _env(p, k):
    try:
        for line in open(p):
            line = line.strip()
            if line.startswith(f"{k}="):
                v = line.split("=", 1)[1].strip().strip('"')
                return v
    except Exception:
        return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env("/app/frontend/.env","REACT_APP_BACKEND_URL") or "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL") or _env("/app/backend/.env","MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or _env("/app/backend/.env","DB_NAME")
JWT_SECRET = os.environ.get("JWT_SECRET") or _env("/app/backend/.env","JWT_SECRET") or "dev-only-jwt-secret-NOT-FOR-PRODUCTION"

mongo = pymongo.MongoClient(MONGO_URL); db = mongo[DB_NAME]
PFX = "TEST_F10B_"
EXPECTED = "2026-05-01"
RUN = uuid.uuid4().hex[:8]


def _mint(uid, role, email, is_manager=False):
    return pyjwt.encode({"user_id":uid,"role":role,"email":email,"is_manager":is_manager,
                         "exp":datetime.now(timezone.utc)+timedelta(hours=2)}, JWT_SECRET, algorithm="HS256")


@pytest.fixture(scope="module", autouse=True)
def seed():
    db.users.delete_many({"id":{"$regex":f"^{PFX}"}})
    db.businesses.delete_many({"id":{"$regex":f"^{PFX}"}})
    db.users.delete_many({"email":{"$regex":RUN}})
    db.businesses.delete_many({"email":{"$regex":RUN}})

    cid=f"{PFX}client"; oid=f"{PFX}owner"; mid=f"{PFX}mgr"
    obz=f"{PFX}biz_o"; mbz=f"{PFX}biz_m"
    db.users.insert_one({"id":cid,"email":f"{PFX}c@t.com","role":"user","full_name":"C"})
    db.users.insert_one({"id":oid,"email":f"{PFX}o@t.com","role":"business","business_id":obz,"is_manager":False,"full_name":"O"})
    db.users.insert_one({"id":mid,"email":f"{PFX}m@t.com","role":"business","business_id":mbz,"is_manager":True,"full_name":"M"})
    db.businesses.insert_one({"id":obz,"name":"OB","email":f"{PFX}o@t.com"})
    db.businesses.insert_one({"id":mbz,"name":"MB","email":f"{PFX}m@t.com"})
    yield {"cid":cid,"oid":oid,"mid":mid,"obz":obz,"mbz":mbz}
    db.users.delete_many({"id":{"$regex":f"^{PFX}"}})
    db.businesses.delete_many({"id":{"$regex":f"^{PFX}"}})
    db.users.delete_many({"email":{"$regex":RUN}})
    db.businesses.delete_many({"email":{"$regex":RUN}})


def test_version_new_fields():
    r = requests.get(f"{BASE_URL}/api/terms/version", timeout=10).json()
    assert r["version"] == EXPECTED
    assert r["published_at"] == "2026-05-01T00:00:00+00:00"
    assert r["grace_period_days"] == 7
    assert r["grace_period_ends_at"] == "2026-05-08T00:00:00+00:00"
    assert isinstance(r["is_hard_block_now"], bool)
    cl = r["changelog"]
    assert isinstance(cl, list) and len(cl) >= 1
    e = cl[0]
    assert e["version"] == "2026-05-01"
    assert e.get("summary_es") and e.get("summary_en")


def test_me_has_grace_fields(seed):
    tok = _mint(seed["cid"], "user", f"{PFX}c@t.com")
    r = requests.get(f"{BASE_URL}/api/terms/me", headers={"Authorization":f"Bearer {tok}"}).json()
    assert "grace_period_ends_at" in r and "is_hard_block" in r and "published_at" in r
    # During grace (now < 2026-05-08), is_hard_block must be False even if up_to_date=False
    now_in_grace = datetime.now(timezone.utc) < datetime.fromisoformat("2026-05-08T00:00:00+00:00")
    if r["up_to_date"] is False and now_in_grace:
        assert r["is_hard_block"] is False


def test_accept_creates_history_with_ip_ua_source(seed):
    tok = _mint(seed["cid"], "user", f"{PFX}c@t.com")
    h = {"Authorization":f"Bearer {tok}", "X-Forwarded-For":"203.0.113.45, 10.0.0.1",
         "User-Agent":"Mozilla/5.0 TestBrowser"}
    r = requests.post(f"{BASE_URL}/api/terms/accept", headers=h, json={"source":"booking_checkout"})
    assert r.status_code == 200, r.text
    u = db.users.find_one({"id":seed["cid"]}, {"_id":0})
    hist = u.get("terms_acceptance_history") or []
    assert len(hist) >= 1
    last = hist[-1]
    assert last["version"] == EXPECTED
    assert last["ip"] == "203.0.113.45"
    assert "TestBrowser" in last["user_agent"]
    assert last["source"] == "booking_checkout"

    # default source = re_accept when omitted
    r2 = requests.post(f"{BASE_URL}/api/terms/accept", headers={"Authorization":f"Bearer {tok}"}, json={})
    assert r2.status_code == 200
    u2 = db.users.find_one({"id":seed["cid"]}, {"_id":0})
    assert u2["terms_acceptance_history"][-1]["source"] == "re_accept"

    # UA truncated to 255
    long_ua = "X" * 500
    r3 = requests.post(f"{BASE_URL}/api/terms/accept",
                       headers={"Authorization":f"Bearer {tok}", "User-Agent": long_ua}, json={})
    assert r3.status_code == 200
    u3 = db.users.find_one({"id":seed["cid"]}, {"_id":0})
    assert len(u3["terms_acceptance_history"][-1]["user_agent"]) == 255


def test_owner_accept_pushes_history_on_business(seed):
    db.businesses.update_one({"id":seed["obz"]}, {"$unset":{"terms_acceptance_history":""}})
    tok = _mint(seed["oid"], "business", f"{PFX}o@t.com", is_manager=False)
    r = requests.post(f"{BASE_URL}/api/terms/accept", headers={"Authorization":f"Bearer {tok}"}, json={})
    assert r.status_code == 200
    b = db.businesses.find_one({"id":seed["obz"]}, {"_id":0})
    assert (b.get("terms_acceptance_history") or [])[-1]["version"] == EXPECTED


def test_manager_accept_does_not_touch_business(seed):
    db.businesses.update_one({"id":seed["mbz"]}, {"$unset":{"terms_acceptance_history":""}})
    tok = _mint(seed["mid"], "business", f"{PFX}m@t.com", is_manager=True)
    r = requests.post(f"{BASE_URL}/api/terms/accept", headers={"Authorization":f"Bearer {tok}"}, json={})
    assert r.status_code == 200
    b = db.businesses.find_one({"id":seed["mbz"]}, {"_id":0})
    assert "terms_acceptance_history" not in b or not b.get("terms_acceptance_history")


def test_me_history_endpoint(seed):
    tok = _mint(seed["cid"], "user", f"{PFX}c@t.com")
    r = requests.get(f"{BASE_URL}/api/terms/me/history", headers={"Authorization":f"Bearer {tok}"})
    assert r.status_code == 200
    body = r.json()
    assert "count" in body and "history" in body
    assert body["count"] == len(body["history"]) and body["count"] >= 1


def test_me_history_legacy_user_returns_empty():
    legacy_id = f"{PFX}legacy"
    db.users.delete_one({"id":legacy_id})
    db.users.insert_one({"id":legacy_id,"email":f"{PFX}legacy@t.com","role":"user","full_name":"L"})
    tok = _mint(legacy_id, "user", f"{PFX}legacy@t.com")
    r = requests.get(f"{BASE_URL}/api/terms/me/history", headers={"Authorization":f"Bearer {tok}"}).json()
    assert r == {"count":0, "history":[]}


def test_register_stamps_history():
    email = f"TEST_F10B_reg_{RUN}@t.com"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={
        "email":email,"password":"TestPass123!","full_name":"R","phone":"+525512345678",
        "country":"MX","city":"CDMX","birth_date":"1990-01-01","gender":"other","preferred_language":"es"
    }, headers={"X-Forwarded-For":"198.51.100.7"}, timeout=20)
    assert r.status_code == 200, r.text
    u = db.users.find_one({"email":email}, {"_id":0})
    h = u.get("terms_acceptance_history") or []
    assert len(h) == 1
    assert h[0]["source"] == "register"
    assert h[0]["version"] == EXPECTED
    assert h[0]["ip"] and h[0]["ip"] != "None"


def test_business_register_stamps_history_on_both():
    email = f"TEST_F10B_bizreg_{RUN}@t.com"
    cat = db.categories.find_one({}, {"_id":0,"id":1}) or {}
    r = requests.post(f"{BASE_URL}/api/auth/business/register", json={
        "name":"TF10B Biz","email":email,"password":"TestPass123!","phone":"+525512345679",
        "description":"d","category_id":cat.get("id") or "generic","address":"x","city":"CDMX",
        "state":"CDMX","country":"MX","zip_code":"01000","rfc":"XAXX010101000",
        "clabe":"012345678901234567","legal_name":"TF10B SA","owner_birth_date":"1985-01-01",
        "timezone":"America/Mexico_City","plan_type":"basic"
    }, headers={"X-Forwarded-For":"198.51.100.99"}, timeout=25)
    assert r.status_code == 200, r.text
    bid = r.json()["business_id"]
    u = db.users.find_one({"email":email}, {"_id":0})
    b = db.businesses.find_one({"id":bid}, {"_id":0})
    for doc in (u, b):
        h = doc.get("terms_acceptance_history") or []
        assert len(h) == 1
        assert h[0]["source"] == "business_register"
        assert h[0]["version"] == EXPECTED
        assert h[0]["ip"]


# ============ GATE TESTING (require_terms_up_to_date) ============

def test_require_terms_up_to_date_no_block_during_grace(seed):
    """During grace period, helper should NOT raise even if user is outdated."""
    from routers import terms as terms_mod
    db.users.update_one({"id":seed["cid"]}, {"$set":{"accepted_terms_version":"2025-01-01"}})
    # Force grace active by overriding _hard_block_active
    orig = terms_mod._hard_block_active
    terms_mod._hard_block_active = lambda: False
    try:
        asyncio.get_event_loop().run_until_complete(terms_mod.require_terms_up_to_date(seed["cid"]))
    finally:
        terms_mod._hard_block_active = orig


def test_require_terms_up_to_date_raises_409_when_hard_block(seed):
    """Hard-block ON + outdated user => HTTPException 409 terms_outdated."""
    from routers import terms as terms_mod
    db.users.update_one({"id":seed["cid"]}, {"$set":{"accepted_terms_version":"2025-01-01"}})
    orig = terms_mod._hard_block_active
    terms_mod._hard_block_active = lambda: True
    try:
        with pytest.raises(HTTPException) as exc:
            asyncio.get_event_loop().run_until_complete(terms_mod.require_terms_up_to_date(seed["cid"]))
        assert exc.value.status_code == 409
        d = exc.value.detail
        assert isinstance(d, dict)
        assert d.get("code") == "terms_outdated"
        assert d.get("current_version") == EXPECTED
        assert d.get("message")
    finally:
        terms_mod._hard_block_active = orig


def test_require_terms_up_to_date_passes_when_user_up_to_date(seed):
    """Hard-block ON but user current => no raise."""
    from routers import terms as terms_mod
    db.users.update_one({"id":seed["cid"]}, {"$set":{"accepted_terms_version":EXPECTED}})
    orig = terms_mod._hard_block_active
    terms_mod._hard_block_active = lambda: True
    try:
        asyncio.get_event_loop().run_until_complete(terms_mod.require_terms_up_to_date(seed["cid"]))
    finally:
        terms_mod._hard_block_active = orig


def test_bookings_router_uses_require_terms_up_to_date():
    """Verify bookings.create_booking imports/calls the gate helper."""
    src = open("/app/backend/routers/bookings.py").read()
    assert "require_terms_up_to_date" in src, "bookings router doesn't call the T&C gate"


def test_businesses_router_uses_gate_on_legal_docs():
    src = open("/app/backend/routers/businesses.py").read()
    assert "require_terms_up_to_date" in src, "businesses router doesn't call the T&C gate"


# ============ ADMIN HISTORY ENDPOINT ============

def test_admin_history_unauthenticated_blocked():
    r = requests.get(f"{BASE_URL}/api/admin/users/anyid/terms-history")
    assert r.status_code in (401, 403)


def test_admin_history_404_for_unknown_user():
    admin = db.users.find_one({"role":"admin"}, {"_id":0,"id":1,"email":1})
    if not admin:
        pytest.skip("no admin in db")
    tok = _mint(admin["id"], "admin", admin["email"])
    r = requests.get(f"{BASE_URL}/api/admin/users/__nope__/terms-history",
                     headers={"Authorization":f"Bearer {tok}"})
    assert r.status_code == 404


def test_admin_history_returns_user_record(seed):
    admin = db.users.find_one({"role":"admin"}, {"_id":0,"id":1,"email":1})
    if not admin:
        pytest.skip("no admin in db")
    tok = _mint(admin["id"], "admin", admin["email"])
    r = requests.get(f"{BASE_URL}/api/admin/users/{seed['cid']}/terms-history",
                     headers={"Authorization":f"Bearer {tok}"})
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["user_id"] == seed["cid"]
    assert b["email"] == f"{PFX}c@t.com"
    assert "history" in b and isinstance(b["history"], list)
    assert "current_accepted_version" in b
    assert "current_accepted_at" in b
    assert "full_name" in b and "role" in b
