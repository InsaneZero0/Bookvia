# Phase 9 - Day-20 settlements + SPEI CSV export
# Covers:
#   - generate_settlements_day20(force=False) skips when day != 20
#   - generate_settlements_day20(force=True) creates 1 settlement per business,
#     stamps tx with settlement_id, copies clabe/legal_name/rfc, etc.
#   - Idempotency: second run does NOT create duplicates
#   - payout_hold=true => skipped
#   - Email logged with template='settlement_notification'
#   - Notification for OWNER (not manager) with type='settlement_ready'
#   - GET /api/admin/settlements/{period_key}/export-spei.csv (headers, content,
#     attachment filename, status filter, escaping)
#   - Auth: no token => 401/403; client/business token => 403
#   - Scheduler registered at startup (logs)
import os
import sys
import asyncio
import pytest
import pymongo
import requests
import jwt as pyjwt
from datetime import datetime, timezone, timedelta

sys.path.insert(0, "/app/backend")


def _env(path: str, key: str):
    try:
        with open(path, "r") as f:
            for line in f:
                line = line.strip()
                if line.startswith(f"{key}="):
                    v = line.split("=", 1)[1].strip()
                    if v.startswith('"') and v.endswith('"'):
                        v = v[1:-1]
                    return v
    except Exception:
        return None
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or _env("/app/frontend/.env", "REACT_APP_BACKEND_URL") or "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL") or _env("/app/backend/.env", "MONGO_URL") or "mongodb://localhost:27017"
DB_NAME = os.environ.get("DB_NAME") or _env("/app/backend/.env", "DB_NAME") or "test_database"
JWT_SECRET = os.environ.get("JWT_SECRET") or _env("/app/backend/.env", "JWT_SECRET")

assert BASE_URL, "REACT_APP_BACKEND_URL not set"
assert JWT_SECRET, "JWT_SECRET not set"

mongo = pymongo.MongoClient(MONGO_URL)
db = mongo[DB_NAME]

# ---- Seed identifiers ----
TEST_PREFIX = "TEST_F9_"
BIZ_A_ID = f"{TEST_PREFIX}biz_a"          # Normal: 2 cleared tx
BIZ_B_ID = f"{TEST_PREFIX}biz_b"          # payout_hold=True
BIZ_COMMA_ID = f"{TEST_PREFIX}biz_comma"  # name with comma/quote, 1 cleared tx
OWNER_A_ID = f"{TEST_PREFIX}owner_a"
MANAGER_A_ID = f"{TEST_PREFIX}mgr_a"
OWNER_B_ID = f"{TEST_PREFIX}owner_b"
OWNER_COMMA_ID = f"{TEST_PREFIX}owner_comma"
CLIENT_ID = f"{TEST_PREFIX}client"
ADMIN_EMAIL = "zamorachapa50@gmail.com"

# Use a non-day-20 reference month so period_key is unique to this test (avoid collisions)
RUN_DATE = datetime(2026, 5, 20, 12, 0, 0, tzinfo=timezone.utc)
PERIOD_KEY = "2026-05-D20"


def _mint(user_id: str, role: str, email: str, is_manager: bool = False) -> str:
    payload = {
        "user_id": user_id, "role": role, "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=2),
    }
    if is_manager:
        payload["is_manager"] = True
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _new_biz(bid, name, owner_id, payout_hold=False, legal_name=None):
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "id": bid, "name": name, "email": f"{bid}@test.com", "phone": "5550000000",
        "user_id": owner_id, "status": "approved", "subscription_status": "active",
        "country_code": "MX", "city": "TestCity",
        "rfc": "TESTR800101ABC", "clabe": "012345678901234567",
        "legal_name": legal_name or f"{name} SA de CV",
        "ine_url": "https://x/i.jpg", "proof_of_address_url": "https://x/p.jpg",
        "bank_proof_url": "https://x/b.pdf",
        "documents_verified": True, "documents_verified_at": now_iso,
        "category_id": "", "description": "", "address": "calle 1",
        "state": "MX", "country": "MX", "zip_code": "00000",
        "payout_hold": payout_hold,
        "created_at": now_iso,
    }


def _new_tx(tx_id, biz_id, booking_id, amount):
    return {
        "id": tx_id, "business_id": biz_id, "booking_id": booking_id,
        "user_id": CLIENT_ID, "status": "paid",
        "amount": amount + 30, "business_amount": float(amount),
        "platform_fee": 30.0, "currency": "MXN",
        "funds_state": "cleared",
        # NOTE: settlement_id intentionally absent
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


@pytest.fixture(scope="module", autouse=True)
def _seed():
    # Clean any prior run
    db.businesses.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    db.users.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    db.transactions.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    db.settlements.delete_many({"period_key": PERIOD_KEY})
    db.notifications.delete_many({"user_id": {"$regex": f"^{TEST_PREFIX}"}})
    db.sent_emails.delete_many({"to": {"$regex": f"^{TEST_PREFIX}"}})

    # Businesses
    db.businesses.insert_many([
        _new_biz(BIZ_A_ID, "TEST F9 Biz A", OWNER_A_ID),
        _new_biz(BIZ_B_ID, "TEST F9 Biz B", OWNER_B_ID, payout_hold=True),
        _new_biz(
            BIZ_COMMA_ID,
            'TEST, "F9" Comma Biz',
            OWNER_COMMA_ID,
            legal_name='Legal, "with" commas SA',
        ),
    ])

    # Users: owner + manager for biz A; owners for B and Comma
    db.users.insert_many([
        {"id": OWNER_A_ID, "email": f"{OWNER_A_ID}@test.com", "role": "business",
         "full_name": "Owner A", "business_id": BIZ_A_ID, "is_manager": False},
        {"id": MANAGER_A_ID, "email": f"{MANAGER_A_ID}@test.com", "role": "business",
         "full_name": "Mgr A", "business_id": BIZ_A_ID, "is_manager": True},
        {"id": OWNER_B_ID, "email": f"{OWNER_B_ID}@test.com", "role": "business",
         "full_name": "Owner B", "business_id": BIZ_B_ID, "is_manager": False},
        {"id": OWNER_COMMA_ID, "email": f"{OWNER_COMMA_ID}@test.com", "role": "business",
         "full_name": "Owner C", "business_id": BIZ_COMMA_ID, "is_manager": False},
        {"id": CLIENT_ID, "email": f"{CLIENT_ID}@test.com", "role": "user",
         "full_name": "Client"},
    ])

    # Transactions:
    # - Biz A: 2 cleared tx (different bookings) => 1 settlement, booking_count=2
    # - Biz B (payout_hold): 1 cleared tx => skipped
    # - Biz Comma: 1 cleared tx => 1 settlement
    db.transactions.insert_many([
        _new_tx(f"{TEST_PREFIX}tx_a1", BIZ_A_ID, f"{TEST_PREFIX}bk_a1", 100.50),
        _new_tx(f"{TEST_PREFIX}tx_a2", BIZ_A_ID, f"{TEST_PREFIX}bk_a2", 200.00),
        _new_tx(f"{TEST_PREFIX}tx_b1", BIZ_B_ID, f"{TEST_PREFIX}bk_b1", 75.00),
        _new_tx(f"{TEST_PREFIX}tx_c1", BIZ_COMMA_ID, f"{TEST_PREFIX}bk_c1", 50.00),
    ])

    # Decoy: a tx that already has settlement_id (must NOT be picked up)
    decoy = _new_tx(f"{TEST_PREFIX}tx_decoy", BIZ_A_ID, f"{TEST_PREFIX}bk_decoy", 999.0)
    decoy["settlement_id"] = "OLD_PAID_SETTLEMENT"
    db.transactions.insert_one(decoy)

    yield

    # Teardown
    db.businesses.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    db.users.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    db.transactions.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    db.settlements.delete_many({"period_key": PERIOD_KEY})
    db.notifications.delete_many({"user_id": {"$regex": f"^{TEST_PREFIX}"}})
    db.sent_emails.delete_many({"to": {"$regex": f"^{TEST_PREFIX}"}})


@pytest.fixture(scope="module")
def admin_token():
    import pyotp
    admin = db.users.find_one({"email": ADMIN_EMAIL})
    if not admin or not admin.get("totp_secret"):
        pytest.skip("Admin not seeded with totp_secret")
    code = pyotp.TOTP(admin["totp_secret"]).now()
    r = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
        "email": ADMIN_EMAIL, "password": "RainbowLol3133!", "totp_code": code,
    })
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def owner_token():
    return _mint(OWNER_A_ID, "business", f"{OWNER_A_ID}@test.com")


@pytest.fixture(scope="module")
def client_token():
    return _mint(CLIENT_ID, "user", f"{CLIENT_ID}@test.com")


# ============================================================
# 1. Direct call: generate_settlements_day20() - core logic
# ============================================================
class TestGenerateDay20Direct:
    def test_skipped_when_not_day20_and_no_force(self):
        from routers.admin import generate_settlements_day20
        not20 = datetime(2026, 5, 15, 12, 0, 0, tzinfo=timezone.utc)
        result = asyncio.get_event_loop().run_until_complete(
            generate_settlements_day20(run_date=not20, force=False)
        )
        assert result["skipped"] is True
        assert "day=15" in result["reason"]
        assert result["settlements"] == []

    def test_force_creates_settlements_and_stamps_txs(self):
        from routers.admin import generate_settlements_day20
        result = asyncio.get_event_loop().run_until_complete(
            generate_settlements_day20(run_date=RUN_DATE, force=True, admin_id="TEST_ADMIN")
        )
        assert result["skipped"] is False
        assert result["period"] == PERIOD_KEY
        # Biz A and Biz Comma => 2 created; Biz B skipped (payout_hold)
        assert result["settlements_created"] == 2

        # Verify per-business outcomes
        per_biz = {r["business_id"]: r for r in result["settlements"]}
        assert BIZ_A_ID in per_biz and BIZ_COMMA_ID in per_biz
        assert per_biz[BIZ_B_ID]["skipped"] is True
        assert per_biz[BIZ_B_ID]["reason"] == "payout_hold"

        # Biz A settlement: 100.50 + 200.00 = 300.50, 2 bookings
        sa = db.settlements.find_one({"business_id": BIZ_A_ID, "period_key": PERIOD_KEY})
        assert sa is not None
        assert round(sa["total_amount"], 2) == 300.50
        assert round(sa["payout_amount"], 2) == 300.50
        assert sa["booking_count"] == 2
        assert sa["status"] == "pending"
        assert sa["clabe"] == "012345678901234567"
        assert sa["legal_name"] == "TEST F9 Biz A SA de CV"
        assert sa["rfc"] == "TESTR800101ABC"
        assert set(sa["transaction_ids"]) == {f"{TEST_PREFIX}tx_a1", f"{TEST_PREFIX}tx_a2"}

        # Transactions tagged with settlement_id (so not re-included next run)
        for txid in [f"{TEST_PREFIX}tx_a1", f"{TEST_PREFIX}tx_a2"]:
            tx = db.transactions.find_one({"id": txid})
            assert tx["settlement_id"] == sa["id"]
            assert tx["settlement_period"] == PERIOD_KEY

        # Decoy tx must keep its OLD_PAID_SETTLEMENT (not modified)
        decoy = db.transactions.find_one({"id": f"{TEST_PREFIX}tx_decoy"})
        assert decoy["settlement_id"] == "OLD_PAID_SETTLEMENT"

        # Biz B (payout_hold): no settlement, tx unchanged
        sb = db.settlements.find_one({"business_id": BIZ_B_ID, "period_key": PERIOD_KEY})
        assert sb is None
        tx_b = db.transactions.find_one({"id": f"{TEST_PREFIX}tx_b1"})
        assert "settlement_id" not in tx_b or not tx_b.get("settlement_id")

    def test_idempotent_second_run(self):
        from routers.admin import generate_settlements_day20
        # Capture before
        before = db.settlements.count_documents({"period_key": PERIOD_KEY})
        result = asyncio.get_event_loop().run_until_complete(
            generate_settlements_day20(run_date=RUN_DATE, force=True, admin_id="TEST_ADMIN")
        )
        # Should NOT create more (txs already have settlement_id)
        assert result["settlements_created"] == 0
        after = db.settlements.count_documents({"period_key": PERIOD_KEY})
        assert before == after

    def test_email_logged_for_each_settled_biz(self):
        # Email should have been mock-stored with template='settlement_notification'
        em_a = db.sent_emails.find_one({
            "template": "settlement_notification", "to": f"{BIZ_A_ID}@test.com",
        })
        assert em_a is not None
        d = em_a["data"]
        assert d["business_name"] == "TEST F9 Biz A"
        assert round(float(d["amount_mxn"]), 2) == 300.50
        assert d["period_key"] == PERIOD_KEY
        assert d["booking_count"] == 2
        assert d["settlement_id"]

        em_c = db.sent_emails.find_one({
            "template": "settlement_notification", "to": f"{BIZ_COMMA_ID}@test.com",
        })
        assert em_c is not None
        # Biz B (payout_hold) should NOT receive email
        em_b = db.sent_emails.find_one({
            "template": "settlement_notification", "to": f"{BIZ_B_ID}@test.com",
        })
        assert em_b is None

    def test_push_notification_to_owner_not_manager(self):
        # Owner A should have a notification with type='settlement_ready'
        notif_owner = db.notifications.find_one({
            "user_id": OWNER_A_ID, "type": "settlement_ready",
        })
        assert notif_owner is not None, "Owner notification missing"
        assert notif_owner["data"]["settlement_id"]
        assert notif_owner["data"]["period_key"] == PERIOD_KEY
        assert round(float(notif_owner["data"]["amount_mxn"]), 2) == 300.50

        # Manager A must NOT receive a settlement notification
        notif_mgr = db.notifications.find_one({
            "user_id": MANAGER_A_ID, "type": "settlement_ready",
        })
        assert notif_mgr is None, "Manager should NOT get settlement notification"


# ============================================================
# 2. HTTP endpoint: POST /api/admin/settlements/generate-day20
# ============================================================
class TestGenerateEndpointAuth:
    def test_no_token_unauthorized(self):
        r = requests.post(f"{BASE_URL}/api/admin/settlements/generate-day20")
        assert r.status_code in (401, 403), r.text

    def test_client_token_forbidden(self, client_token):
        r = requests.post(
            f"{BASE_URL}/api/admin/settlements/generate-day20",
            headers={"Authorization": f"Bearer {client_token}"},
        )
        assert r.status_code == 403

    def test_business_token_forbidden(self, owner_token):
        r = requests.post(
            f"{BASE_URL}/api/admin/settlements/generate-day20",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert r.status_code == 403


class TestGenerateEndpointBehavior:
    def test_without_force_skipped_when_not_day20(self, admin_token):
        # If today is the 20th, test still asserts a valid response shape
        r = requests.post(
            f"{BASE_URL}/api/admin/settlements/generate-day20",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        today = datetime.now(timezone.utc).day
        if today != 20:
            assert body["skipped"] is True
            assert body["reason"].startswith("day=")
        else:
            assert body["skipped"] is False

    def test_with_force_runs(self, admin_token):
        # By now all our seeded txs already have settlement_id from direct call,
        # so this run will just be a no-op (skipped:false but 0 created).
        r = requests.post(
            f"{BASE_URL}/api/admin/settlements/generate-day20?force=true",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["skipped"] is False
        assert "period" in body and body["period"]
        assert "settlements_created" in body


# ============================================================
# 3. CSV export endpoint
# ============================================================
class TestExportSpeiCsv:
    def test_no_token_unauthorized(self):
        r = requests.get(f"{BASE_URL}/api/admin/settlements/{PERIOD_KEY}/export-spei.csv")
        assert r.status_code in (401, 403)

    def test_client_token_forbidden(self, client_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/settlements/{PERIOD_KEY}/export-spei.csv",
            headers={"Authorization": f"Bearer {client_token}"},
        )
        assert r.status_code == 403

    def test_csv_headers_and_content(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/settlements/{PERIOD_KEY}/export-spei.csv",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        assert "text/csv" in r.headers.get("content-type", "")
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd
        assert f"bookvia-spei-{PERIOD_KEY}.csv" in cd

        body = r.text
        lines = body.strip().split("\r\n")
        header = lines[0]
        for col in ["Beneficiario", "CLABE", "RFC", "Monto", "Concepto",
                    "Referencia", "Email", "Citas", "Folio"]:
            assert col in header

        # Should include Biz A (300.50, 2 citas) and Biz Comma (50.00, 1)
        joined = "\r\n".join(lines[1:])
        assert "300.50" in joined
        assert "50.00" in joined
        assert "012345678901234567" in joined  # CLABE
        assert "TESTR800101ABC" in joined       # RFC
        # Biz B excluded (payout_hold => no settlement)
        # No row containing Biz B email
        assert f"{BIZ_B_ID}@test.com" not in joined

    def test_csv_escapes_commas_and_quotes(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/settlements/{PERIOD_KEY}/export-spei.csv",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        body = r.text
        # Biz Comma legal_name = 'Legal, "with" commas SA'
        # Properly escaped: "Legal, ""with"" commas SA"
        assert '"Legal, ""with"" commas SA"' in body

    def test_status_filter_pending_default(self, admin_token):
        # Mark Biz A's settlement as paid; default filter=pending should exclude it
        sa = db.settlements.find_one({"business_id": BIZ_A_ID, "period_key": PERIOD_KEY})
        assert sa is not None
        db.settlements.update_one({"id": sa["id"]}, {"$set": {"status": "paid"}})
        try:
            # Default (pending only)
            r = requests.get(
                f"{BASE_URL}/api/admin/settlements/{PERIOD_KEY}/export-spei.csv",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            assert r.status_code == 200
            body = r.text
            # Biz A's row (300.50) should NOT be present anymore
            assert "300.50" not in body
            # Biz Comma still pending => present
            assert "50.00" in body

            # status_filter=all => Biz A returns again
            r2 = requests.get(
                f"{BASE_URL}/api/admin/settlements/{PERIOD_KEY}/export-spei.csv?status_filter=all",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            assert r2.status_code == 200
            assert "300.50" in r2.text
        finally:
            db.settlements.update_one({"id": sa["id"]}, {"$set": {"status": "pending"}})


# ============================================================
# 4. Scheduler registered at startup
# ============================================================
class TestScheduler:
    def test_scheduler_logged_in_supervisor_logs(self):
        # Look for the startup log line
        log_paths = [
            "/var/log/supervisor/backend.out.log",
            "/var/log/supervisor/backend.err.log",
        ]
        found = False
        for p in log_paths:
            if not os.path.exists(p):
                continue
            try:
                with open(p, "r", errors="ignore") as f:
                    if "Settlement day-20 scheduler started" in f.read():
                        found = True
                        break
            except Exception:
                continue
        assert found, "Scheduler startup log not found"

    def test_scheduler_task_registered_in_startup(self):
        # Source-level guarantee: server.startup_event creates the task
        with open("/app/backend/server.py", "r") as f:
            src = f.read()
        assert "settlement_day20_scheduler" in src
        assert "asyncio.create_task(settlement_day20_scheduler())" in src
