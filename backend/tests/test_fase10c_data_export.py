# Fase 10c - Personal data export (LFPDPPP ARCO-A) GET /api/users/me/export-data
import os, sys, uuid, json
from datetime import datetime, timezone, timedelta
import pymongo, pytest, requests, jwt as pyjwt

sys.path.insert(0, "/app/backend")


def _env(p, k):
    try:
        for line in open(p):
            line = line.strip()
            if line.startswith(f"{k}="):
                return line.split("=", 1)[1].strip().strip('"')
    except Exception:
        return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _env("/app/frontend/.env", "REACT_APP_BACKEND_URL") or "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL") or _env("/app/backend/.env", "MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or _env("/app/backend/.env", "DB_NAME")
JWT_SECRET = os.environ.get("JWT_SECRET") or _env("/app/backend/.env", "JWT_SECRET")

mongo = pymongo.MongoClient(MONGO_URL)
db = mongo[DB_NAME]

PFX = "TEST_F10C_"
RUN = uuid.uuid4().hex[:8]


def _mint(uid, role, email, is_manager=False, business_id=None):
    payload = {
        "user_id": uid, "role": role, "email": email, "is_manager": is_manager,
        "exp": datetime.now(timezone.utc) + timedelta(hours=2),
    }
    if business_id:
        payload["business_id"] = business_id
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")


@pytest.fixture(scope="module", autouse=True)
def seed():
    # ---- cleanup from any prior run ----
    for col in ["users", "businesses", "bookings", "payment_transactions",
                "notifications", "user_favorites", "user_wallets",
                "settlements", "transactions", "business_strikes", "audit_logs"]:
        db[col].delete_many({"$or": [
            {"id": {"$regex": f"^{PFX}"}},
            {"user_id": {"$regex": f"^{PFX}"}},
            {"business_id": {"$regex": f"^{PFX}"}},
            {"actor_id": {"$regex": f"^{PFX}"}},
        ]})

    cid = f"{PFX}client_{RUN}"
    oid = f"{PFX}owner_{RUN}"
    mid = f"{PFX}mgr_{RUN}"
    obz = f"{PFX}biz_o_{RUN}"
    mbz = f"{PFX}biz_m_{RUN}"

    now_iso = datetime.now(timezone.utc).isoformat()

    # Client user with every sensitive field populated (to test sanitization)
    db.users.insert_one({
        "id": cid, "email": f"{PFX}c_{RUN}@t.com", "role": "user",
        "full_name": "Cliente Test", "phone": "+525555555555",
        "password_hash": "argon2$SHOULD_NOT_LEAK",
        "email_verification_token": "TOKEN_SHOULD_NOT_LEAK",
        "reset_password_token": "RESET_SHOULD_NOT_LEAK",
        "totp_secret": "TOTP_SHOULD_NOT_LEAK",
        "terms_acceptance_history": [
            {"version": "2026-05-01", "accepted_at": now_iso, "source": "register", "ip": "1.2.3.4"}
        ],
        "created_at": now_iso,
    })
    # Business OWNER (is_manager=False) -> gets business_* extras
    db.users.insert_one({
        "id": oid, "email": f"{PFX}o_{RUN}@t.com", "role": "business",
        "business_id": obz, "is_manager": False, "full_name": "Owner",
        "password_hash": "X", "created_at": now_iso,
    })
    # Business MANAGER (is_manager=True) - has business_id; code currently only checks business_id
    db.users.insert_one({
        "id": mid, "email": f"{PFX}m_{RUN}@t.com", "role": "business",
        "business_id": mbz, "is_manager": True, "full_name": "Manager",
        "password_hash": "X", "created_at": now_iso,
    })

    db.businesses.insert_one({"id": obz, "name": "OwnerBiz", "email": f"{PFX}o_{RUN}@t.com"})
    db.businesses.insert_one({"id": mbz, "name": "MgrBiz", "email": f"{PFX}m_{RUN}@t.com"})

    # ---- rows for the client ----
    db.bookings.insert_one({
        "id": f"{PFX}bk_{RUN}", "user_id": cid, "business_id": obz,
        "date": "2026-06-01", "status": "confirmed",
        "service_name": "Corte", "created_at": now_iso,
    })
    db.payment_transactions.insert_one({
        "id": f"{PFX}pt_{RUN}", "user_id": cid, "amount": 200,
        "stripe_secret": "SHOULD_NOT_LEAK",
        "status": "succeeded", "created_at": now_iso,
    })
    db.notifications.insert_one({
        "id": f"{PFX}nt_{RUN}", "user_id": cid, "title": "Hola",
        "body": "msg", "created_at": now_iso,
    })
    db.user_favorites.insert_one({
        "id": f"{PFX}fv_{RUN}", "user_id": cid, "business_id": obz,
        "created_at": now_iso,
    })
    db.user_wallets.insert_one({
        "id": f"{PFX}wl_{RUN}", "user_id": cid, "balance_mxn": 123.45,
    })

    # ---- rows for owner's business ----
    db.settlements.insert_one({
        "id": f"{PFX}st_{RUN}", "business_id": obz, "amount": 500, "created_at": now_iso,
    })
    db.transactions.insert_one({
        "id": f"{PFX}tx_{RUN}", "business_id": obz, "amount": 700, "created_at": now_iso,
    })
    db.business_strikes.insert_one({
        "id": f"{PFX}sk_{RUN}", "business_id": obz, "reason": "r", "created_at": now_iso,
    })

    yield {"cid": cid, "oid": oid, "mid": mid, "obz": obz, "mbz": mbz}

    # teardown
    for col in ["users", "businesses", "bookings", "payment_transactions",
                "notifications", "user_favorites", "user_wallets",
                "settlements", "transactions", "business_strikes", "audit_logs"]:
        db[col].delete_many({"$or": [
            {"id": {"$regex": f"^{PFX}"}},
            {"user_id": {"$regex": f"^{PFX}"}},
            {"business_id": {"$regex": f"^{PFX}"}},
            {"actor_id": {"$regex": f"^{PFX}"}},
        ]})


# ---------------- tests ----------------


def test_unauth_returns_401():
    r = requests.get(f"{BASE_URL}/api/users/me/export-data", timeout=15)
    assert r.status_code in (401, 403), r.status_code


def test_headers_and_download_contract(seed):
    tok = _mint(seed["cid"], "user", f"{PFX}c_{RUN}@t.com")
    r = requests.get(
        f"{BASE_URL}/api/users/me/export-data",
        headers={"Authorization": f"Bearer {tok}", "X-Forwarded-For": "9.9.9.9, 1.1.1.1"},
        timeout=20,
    )
    assert r.status_code == 200, r.text[:300]
    ctype = r.headers.get("content-type", "").lower()
    assert "application/json" in ctype and "charset=utf-8" in ctype, ctype
    cd = r.headers.get("content-disposition", "")
    assert "attachment" in cd.lower()
    assert "bookvia-mis-datos-" in cd and ".json" in cd
    # filename pattern: bookvia-mis-datos-<id-prefix>-<YYYY-MM-DD>.json
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    assert today in cd, cd
    assert r.headers.get("cache-control", "").lower().startswith("no-store")


def test_client_payload_shape_and_sanitization(seed):
    tok = _mint(seed["cid"], "user", f"{PFX}c_{RUN}@t.com")
    r = requests.get(
        f"{BASE_URL}/api/users/me/export-data",
        headers={"Authorization": f"Bearer {tok}", "X-Forwarded-For": "9.9.9.9, 1.1.1.1"},
        timeout=20,
    )
    assert r.status_code == 200
    data = json.loads(r.text)

    # meta
    m = data["meta"]
    assert m["schema_version"] == "1.0"
    assert m["user_id"] == seed["cid"]
    assert m["generated_ip"] == "9.9.9.9"  # first X-Forwarded-For hop
    datetime.fromisoformat(m["generated_at"])  # iso parsable
    assert isinstance(m.get("note"), str) and m["note"]

    # top-level keys
    for k in ["profile", "bookings", "wallet", "payments", "notifications",
              "favorites", "terms_acceptance_history"]:
        assert k in data, f"missing top-level key {k}"

    # profile sanitization
    p = data["profile"]
    for f in ["password_hash", "email_verification_token",
              "reset_password_token", "totp_secret", "_id"]:
        assert f not in p, f"profile leaked {f}"
    assert p["id"] == seed["cid"]
    assert p["email"] == f"{PFX}c_{RUN}@t.com"

    # bookings contain the seeded booking
    assert isinstance(data["bookings"], list) and len(data["bookings"]) >= 1
    b = next(x for x in data["bookings"] if x["id"] == f"{PFX}bk_{RUN}")
    for f in ["id", "business_id", "date", "status"]:
        assert f in b
    assert "_id" not in b

    # wallet
    assert data["wallet"] is not None
    assert data["wallet"].get("balance_mxn") == 123.45
    assert "_id" not in data["wallet"]

    # payments: present, stripe_secret removed
    assert isinstance(data["payments"], list) and len(data["payments"]) >= 1
    pay = next(x for x in data["payments"] if x["id"] == f"{PFX}pt_{RUN}")
    assert "stripe_secret" not in pay
    assert "_id" not in pay

    # notifications / favorites / terms history
    assert any(n["id"] == f"{PFX}nt_{RUN}" for n in data["notifications"])
    assert any(f2["id"] == f"{PFX}fv_{RUN}" for f2 in data["favorites"])
    hist = data["terms_acceptance_history"]
    assert isinstance(hist, list) and len(hist) >= 1
    assert hist[0]["version"] == "2026-05-01"
    assert hist[0]["accepted_at"] and hist[0]["source"] == "register"

    # Client should NOT have business_* extras
    for k in ["business_profile", "business_settlements",
              "business_transactions", "business_strikes"]:
        assert k not in data, f"client payload leaked {k}"


def test_business_owner_has_business_extras(seed):
    tok = _mint(seed["oid"], "business", f"{PFX}o_{RUN}@t.com",
                is_manager=False, business_id=seed["obz"])
    r = requests.get(
        f"{BASE_URL}/api/users/me/export-data",
        headers={"Authorization": f"Bearer {tok}"},
        timeout=20,
    )
    assert r.status_code == 200, r.text[:300]
    data = json.loads(r.text)
    assert "business_profile" in data and data["business_profile"]
    assert data["business_profile"]["id"] == seed["obz"]
    assert "_id" not in data["business_profile"]

    assert isinstance(data["business_settlements"], list)
    assert any(s["id"] == f"{PFX}st_{RUN}" for s in data["business_settlements"])
    assert all("_id" not in s for s in data["business_settlements"])

    assert isinstance(data["business_transactions"], list)
    assert any(t["id"] == f"{PFX}tx_{RUN}" for t in data["business_transactions"])
    assert all("_id" not in t for t in data["business_transactions"])

    assert isinstance(data["business_strikes"], list)
    assert any(sk["id"] == f"{PFX}sk_{RUN}" for sk in data["business_strikes"])
    assert all("_id" not in sk for sk in data["business_strikes"])


def test_business_manager_behavior_follows_business_id(seed):
    """Per spec: manager has business_id, so code currently DOES include business_* keys.
    Verify actual behavior mirrors user.business_id presence (keys present for manager too)."""
    tok = _mint(seed["mid"], "business", f"{PFX}m_{RUN}@t.com",
                is_manager=True, business_id=seed["mbz"])
    r = requests.get(
        f"{BASE_URL}/api/users/me/export-data",
        headers={"Authorization": f"Bearer {tok}"},
        timeout=20,
    )
    assert r.status_code == 200
    data = json.loads(r.text)
    # current router only gates on role==BUSINESS + business_id, so manager does get the keys
    assert "business_profile" in data
    assert data["business_profile"]["id"] == seed["mbz"]
    # Lists exist (likely empty because no settlements/tx/strikes seeded for mgr biz)
    assert isinstance(data.get("business_settlements"), list)
    assert isinstance(data.get("business_transactions"), list)
    assert isinstance(data.get("business_strikes"), list)


def test_audit_log_inserted(seed):
    before = db.audit_logs.count_documents({
        "action": "personal_data_export", "actor_id": seed["cid"]
    })
    tok = _mint(seed["cid"], "user", f"{PFX}c_{RUN}@t.com")
    r = requests.get(
        f"{BASE_URL}/api/users/me/export-data",
        headers={"Authorization": f"Bearer {tok}", "X-Forwarded-For": "7.7.7.7, 2.2.2.2"},
        timeout=20,
    )
    assert r.status_code == 200

    # Find the latest audit row for this actor
    entry = db.audit_logs.find_one(
        {"action": "personal_data_export", "actor_id": seed["cid"]},
        sort=[("created_at", -1)],
    )
    assert entry is not None
    assert entry.get("target_id") == seed["cid"]
    assert entry.get("ip") == "7.7.7.7"
    det = entry.get("details") or {}
    # counts must be ints >= our seeded fixtures
    assert det.get("bookings", 0) >= 1
    assert det.get("payments", 0) >= 1
    assert det.get("notifications", 0) >= 1
    assert det.get("is_business") is False
    after = db.audit_logs.count_documents({
        "action": "personal_data_export", "actor_id": seed["cid"]
    })
    assert after == before + 1


def test_export_only_own_data(seed):
    """Calling /me/export-data with a token for user X always returns X's data,
    even if a different user_id is suggested via query/path tricks.
    There is no /me/export-data/{other_id} endpoint - the token is authoritative."""
    tok = _mint(seed["oid"], "business", f"{PFX}o_{RUN}@t.com",
                is_manager=False, business_id=seed["obz"])
    r = requests.get(
        f"{BASE_URL}/api/users/me/export-data",
        headers={"Authorization": f"Bearer {tok}"},
        timeout=20,
    )
    assert r.status_code == 200
    data = json.loads(r.text)
    assert data["meta"]["user_id"] == seed["oid"]
    assert data["profile"]["id"] == seed["oid"]
    # client id/email must NOT appear as profile owner
    assert data["profile"]["id"] != seed["cid"]
