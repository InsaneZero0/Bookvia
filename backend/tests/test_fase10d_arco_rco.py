# Fase 10d - ARCO Rectificacion-Cancelacion-Oposicion (LFPDPPP)
# Tests:
#   POST /api/users/me/marketing-consent  (Oposicion)
#   DELETE /api/users/me/account          (Cancelacion soft-delete)
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta

import bcrypt
import pymongo
import pytest
import requests
import jwt as pyjwt

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

PFX = "TEST_F10D_"
RUN = uuid.uuid4().hex[:8]


def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _mint(uid, role, email, is_manager=False, business_id=None):
    payload = {
        "user_id": uid, "role": role, "email": email, "is_manager": is_manager,
        "exp": datetime.now(timezone.utc) + timedelta(hours=2),
    }
    if business_id:
        payload["business_id"] = business_id
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _new_user(suffix, role="user", is_manager=False, business_id=None,
              password="Secret#123", extras=None):
    uid = f"{PFX}{suffix}_{RUN}_{uuid.uuid4().hex[:6]}"
    email = f"{PFX}{suffix}_{uuid.uuid4().hex[:6]}@t.com"
    doc = {
        "id": uid,
        "email": email,
        "role": role,
        "full_name": f"User {suffix}",
        "phone": "+525555555555",
        "password_hash": _hash(password),
        "active": True,
        "email_verified": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if is_manager:
        doc["is_manager"] = True
    if business_id:
        doc["business_id"] = business_id
    if extras:
        doc.update(extras)
    db.users.insert_one(doc)
    token = _mint(uid, role, email, is_manager=is_manager, business_id=business_id)
    return {"id": uid, "email": email, "password": password, "token": token}


def _cleanup():
    for col in ["users", "businesses", "bookings", "payment_transactions",
                "notifications", "user_favorites", "user_wallets", "audit_logs"]:
        db[col].delete_many({"$or": [
            {"id": {"$regex": f"^{PFX}"}},
            {"user_id": {"$regex": f"^{PFX}"}},
            {"business_id": {"$regex": f"^{PFX}"}},
            {"actor_id": {"$regex": f"^{PFX}"}},
            {"target_id": {"$regex": f"^{PFX}"}},
            {"email": {"$regex": f"^{PFX}"}},
            {"email": {"$regex": f"^deleted_{PFX}"}},
        ]})


@pytest.fixture(scope="module", autouse=True)
def _setup_teardown():
    _cleanup()
    yield
    _cleanup()


# ------------------------ MARKETING CONSENT (Oposicion) ------------------------


def test_marketing_consent_requires_auth():
    r = requests.post(f"{BASE_URL}/api/users/me/marketing-consent",
                      json={"opt_out": True}, timeout=15)
    assert r.status_code in (401, 403), r.status_code


def test_marketing_consent_opt_out_true_persists():
    u = _new_user("mkt_opt_out")
    r = requests.post(
        f"{BASE_URL}/api/users/me/marketing-consent",
        json={"opt_out": True},
        headers={"Authorization": f"Bearer {u['token']}"},
        timeout=15,
    )
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert body.get("ok") is True
    assert body.get("marketing_opt_out") is True

    doc = db.users.find_one({"id": u["id"]})
    assert doc.get("marketing_opt_out") is True
    # Timestamp is iso parsable
    ts = doc.get("marketing_opt_out_at")
    assert isinstance(ts, str) and ts
    datetime.fromisoformat(ts)


def test_marketing_consent_opt_out_false_persists():
    u = _new_user("mkt_opt_in")
    # First opt-out then opt back in
    requests.post(
        f"{BASE_URL}/api/users/me/marketing-consent",
        json={"opt_out": True},
        headers={"Authorization": f"Bearer {u['token']}"}, timeout=15,
    )
    r = requests.post(
        f"{BASE_URL}/api/users/me/marketing-consent",
        json={"opt_out": False},
        headers={"Authorization": f"Bearer {u['token']}"}, timeout=15,
    )
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert body == {"ok": True, "marketing_opt_out": False}
    doc = db.users.find_one({"id": u["id"]})
    assert doc.get("marketing_opt_out") is False


# ------------------------ DELETE ACCOUNT (Cancelacion) -------------------------


def test_delete_account_requires_auth():
    r = requests.delete(
        f"{BASE_URL}/api/users/me/account",
        json={"password": "x", "confirmation": "ELIMINAR"},
        timeout=15,
    )
    assert r.status_code in (401, 403), r.status_code


def test_delete_wrong_confirmation_returns_400():
    u = _new_user("del_wrong_conf")
    r = requests.delete(
        f"{BASE_URL}/api/users/me/account",
        json={"password": u["password"], "confirmation": "DELETE"},
        headers={"Authorization": f"Bearer {u['token']}"}, timeout=15,
    )
    assert r.status_code == 400, r.text[:200]
    assert "ELIMINAR" in r.text

    # User must NOT be flagged as deleted
    doc = db.users.find_one({"id": u["id"]})
    assert not doc.get("account_deleted")
    assert doc.get("email") == u["email"]


def test_delete_wrong_password_returns_401():
    u = _new_user("del_wrong_pw")
    r = requests.delete(
        f"{BASE_URL}/api/users/me/account",
        json={"password": "WRONG_PASSWORD!!", "confirmation": "ELIMINAR"},
        headers={"Authorization": f"Bearer {u['token']}"}, timeout=15,
    )
    assert r.status_code == 401, r.text[:200]
    doc = db.users.find_one({"id": u["id"]})
    assert not doc.get("account_deleted")


def test_delete_business_owner_blocked():
    biz_id = f"{PFX}biz_{RUN}_{uuid.uuid4().hex[:6]}"
    db.businesses.insert_one({"id": biz_id, "name": "TestBiz",
                              "email": f"{PFX}owner_{biz_id}@t.com"})
    u = _new_user("del_owner", role="business", is_manager=False, business_id=biz_id)
    r = requests.delete(
        f"{BASE_URL}/api/users/me/account",
        json={"password": u["password"], "confirmation": "ELIMINAR"},
        headers={"Authorization": f"Bearer {u['token']}"}, timeout=15,
    )
    assert r.status_code == 400, r.text[:200]
    txt = r.text.lower()
    assert "duen" in txt or "negocio" in txt
    doc = db.users.find_one({"id": u["id"]})
    assert not doc.get("account_deleted")


def test_delete_business_manager_allowed():
    biz_id = f"{PFX}bizm_{RUN}_{uuid.uuid4().hex[:6]}"
    db.businesses.insert_one({"id": biz_id, "name": "TestBizM",
                              "email": f"{PFX}mgr_{biz_id}@t.com"})
    u = _new_user("del_mgr", role="business", is_manager=True, business_id=biz_id)
    r = requests.delete(
        f"{BASE_URL}/api/users/me/account",
        json={"password": u["password"], "confirmation": "ELIMINAR"},
        headers={"Authorization": f"Bearer {u['token']}"}, timeout=15,
    )
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert body.get("ok") is True
    doc = db.users.find_one({"id": u["id"]})
    assert doc.get("account_deleted") is True


def test_delete_blocked_by_active_bookings():
    u = _new_user("del_with_bookings")
    db.bookings.insert_one({
        "id": f"{PFX}bk_active_{uuid.uuid4().hex[:6]}",
        "user_id": u["id"], "business_id": f"{PFX}biz_x",
        "status": "confirmed", "date": "2026-12-01",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    db.bookings.insert_one({
        "id": f"{PFX}bk_pend_{uuid.uuid4().hex[:6]}",
        "user_id": u["id"], "business_id": f"{PFX}biz_x",
        "status": "pending", "date": "2026-12-05",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    r = requests.delete(
        f"{BASE_URL}/api/users/me/account",
        json={"password": u["password"], "confirmation": "ELIMINAR"},
        headers={"Authorization": f"Bearer {u['token']}"}, timeout=15,
    )
    assert r.status_code == 400, r.text[:200]
    detail = r.json().get("detail", "")
    assert "2" in detail and "activa" in detail.lower()
    doc = db.users.find_one({"id": u["id"]})
    assert not doc.get("account_deleted")


def test_delete_blocked_by_wallet_balance():
    u = _new_user("del_with_wallet")
    db.user_wallets.insert_one({
        "id": f"{PFX}wl_{uuid.uuid4().hex[:6]}",
        "user_id": u["id"], "balance_mxn": 50.50,
    })
    r = requests.delete(
        f"{BASE_URL}/api/users/me/account",
        json={"password": u["password"], "confirmation": "ELIMINAR"},
        headers={"Authorization": f"Bearer {u['token']}"}, timeout=15,
    )
    assert r.status_code == 400, r.text[:200]
    detail = r.json().get("detail", "")
    assert "50.50" in detail or "saldo" in detail.lower()
    doc = db.users.find_one({"id": u["id"]})
    assert not doc.get("account_deleted")


def test_delete_success_full_redaction_and_side_effects():
    u = _new_user("del_ok", extras={
        "photo_url": "https://x/y.jpg",
        "saved_cards": [{"last4": "4242"}],
        "favorites": ["fav1"],
        "stripe_customer_id": "cus_123",
    })
    # Seed companion data
    fav_id = f"{PFX}fv_{uuid.uuid4().hex[:6]}"
    not_id = f"{PFX}nt_{uuid.uuid4().hex[:6]}"
    bk_done_id = f"{PFX}bk_done_{uuid.uuid4().hex[:6]}"
    pt_id = f"{PFX}pt_{uuid.uuid4().hex[:6]}"
    wallet_id = f"{PFX}wl_zero_{uuid.uuid4().hex[:6]}"
    db.user_favorites.insert_one({"id": fav_id, "user_id": u["id"],
                                  "business_id": "bz_z"})
    db.notifications.insert_one({"id": not_id, "user_id": u["id"],
                                 "title": "x", "body": "y"})
    db.bookings.insert_one({"id": bk_done_id, "user_id": u["id"],
                            "business_id": "bz_z", "status": "completed",
                            "date": "2025-01-01"})
    db.payment_transactions.insert_one({"id": pt_id, "user_id": u["id"],
                                        "amount": 100, "status": "succeeded"})
    db.user_wallets.insert_one({"id": wallet_id, "user_id": u["id"],
                                "balance_mxn": 0})

    audit_before = db.audit_logs.count_documents({
        "action": "account_deleted_by_user", "actor_id": u["id"],
    })

    r = requests.delete(
        f"{BASE_URL}/api/users/me/account",
        json={"password": u["password"], "confirmation": "ELIMINAR"},
        headers={"Authorization": f"Bearer {u['token']}",
                 "X-Forwarded-For": "9.9.9.9, 1.1.1.1"},
        timeout=20,
    )
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert body.get("ok") is True
    assert "deleted_at" in body
    datetime.fromisoformat(body["deleted_at"])

    # ---- redaction ----
    doc = db.users.find_one({"id": u["id"]})
    assert doc is not None
    assert doc.get("account_deleted") is True
    assert doc.get("account_deleted_at") and isinstance(doc["account_deleted_at"], str)
    datetime.fromisoformat(doc["account_deleted_at"])
    assert doc.get("account_deleted_ip") == "9.9.9.9"
    assert doc.get("email") == f"deleted_{u['id']}@bookvia.deleted"
    assert doc.get("full_name") == "[Cuenta eliminada]"
    assert doc.get("phone") == ""
    assert doc.get("photo_url") is None
    assert doc.get("favorites") == []
    assert doc.get("saved_cards") == []
    assert doc.get("active") is False
    assert doc.get("email_verified") is False
    # password hash MUST be different from the original (random replacement)
    assert doc.get("password_hash") and doc["password_hash"] != _hash(u["password"])
    # And original password must NOT verify against the new hash
    assert not bcrypt.checkpw(u["password"].encode(), doc["password_hash"].encode())

    # ---- companion data purge ----
    assert db.user_favorites.count_documents({"id": fav_id}) == 0
    assert db.user_favorites.count_documents({"user_id": u["id"]}) == 0
    assert db.notifications.count_documents({"id": not_id}) == 0
    assert db.notifications.count_documents({"user_id": u["id"]}) == 0

    # ---- preserved data ----
    # Bookings NOT touched
    assert db.bookings.count_documents({"id": bk_done_id}) == 1
    # Payment transactions NOT touched
    assert db.payment_transactions.count_documents({"id": pt_id}) == 1
    # Wallet doc NOT deleted (kept zero)
    assert db.user_wallets.count_documents({"id": wallet_id}) == 1

    # ---- audit log ----
    audit_after = db.audit_logs.count_documents({
        "action": "account_deleted_by_user", "actor_id": u["id"],
    })
    assert audit_after == audit_before + 1
    entry = db.audit_logs.find_one(
        {"action": "account_deleted_by_user", "actor_id": u["id"]},
        sort=[("created_at", -1)],
    )
    assert entry is not None
    assert entry.get("target_id") == u["id"]
    assert entry.get("ip") == "9.9.9.9"


def test_login_blocked_post_delete():
    u = _new_user("del_login")
    # Delete the account
    r = requests.delete(
        f"{BASE_URL}/api/users/me/account",
        json={"password": u["password"], "confirmation": "ELIMINAR"},
        headers={"Authorization": f"Bearer {u['token']}"}, timeout=20,
    )
    assert r.status_code == 200, r.text[:300]

    # Login with original email -> 401 (no user has that email anymore)
    r1 = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": u["email"], "password": u["password"]},
        timeout=15,
    )
    assert r1.status_code == 401, r1.text[:200]

    # Login with redacted email + original password -> 401 (random hash)
    redacted = f"deleted_{u['id']}@bookvia.deleted"
    r2 = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": redacted, "password": u["password"]},
        timeout=15,
    )
    assert r2.status_code == 401, r2.text[:200]
