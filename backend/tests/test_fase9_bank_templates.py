# Phase 9 - SPEI bank-specific CSV templates (BBVA, Banorte, Santander, generic)
# Tests:
#   - generic: original 9-column layout, filename suffix -generic.csv
#   - bbva: BBVA Multienlace columns + truncations + 'BBVA' literal + digits-only ref
#   - banorte: BEM columns, Tipo de pago='SPEI', empty Cuenta origen,
#              concepto<=30, beneficiario<=35, alphanumeric ref<=10
#   - santander: SuperNet columns, beneficiario<=50, concepto<=35,
#                alphanumeric ref<=7
#   - CSV escaping for legal_name with commas/quotes works in all banks
#   - Invalid bank (?bank=invent) falls back to generic without error
#   - Audit log SETTLEMENT_GENERATE -> details.bank carries the requested bank
#   - Auth: no token => 401/403; client/business token => 403
import os
import sys
from datetime import datetime, timezone, timedelta

import pymongo
import pytest
import requests
import jwt as pyjwt

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
MONGO_URL = os.environ.get("MONGO_URL") or _env("/app/backend/.env", "MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or _env("/app/backend/.env", "DB_NAME")
JWT_SECRET = os.environ.get("JWT_SECRET") or _env("/app/backend/.env", "JWT_SECRET")

assert BASE_URL, "REACT_APP_BACKEND_URL not set"
assert MONGO_URL and DB_NAME, "MONGO_URL/DB_NAME not set"
assert JWT_SECRET, "JWT_SECRET not set"

mongo = pymongo.MongoClient(MONGO_URL)
db = mongo[DB_NAME]

# Fresh test prefix + period to avoid colliding with iter_81 fixtures
TEST_PREFIX = "TEST_F9B_"
PERIOD_KEY = "2026-07-D20"
ADMIN_EMAIL = "zamorachapa50@gmail.com"

# Two settlements:
#  - PLAIN: simple legal_name, no commas
#  - COMMA: legal_name with commas + quotes for escape testing
BIZ_PLAIN_ID = f"{TEST_PREFIX}biz_plain"
BIZ_COMMA_ID = f"{TEST_PREFIX}biz_comma"
USER_PLAIN_ID = f"{TEST_PREFIX}usr_plain"
USER_COMMA_ID = f"{TEST_PREFIX}usr_comma"
CLIENT_ID = f"{TEST_PREFIX}client"

# Settlement IDs - choose strings whose alnum/digit subsets we can predict
SETTLEMENT_PLAIN_ID = f"{TEST_PREFIX}set-plain-12345"      # digits: 912345 -> alnum: TESTF9Bsetplain12345
SETTLEMENT_COMMA_ID = f"{TEST_PREFIX}set-comma-987"


def _mint(user_id: str, role: str, email: str) -> str:
    payload = {
        "user_id": user_id, "role": role, "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=2),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")


@pytest.fixture(scope="module", autouse=True)
def _seed():
    # Clean any prior run
    db.businesses.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    db.users.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    db.settlements.delete_many({"period_key": PERIOD_KEY})
    db.audit_logs.delete_many({"target_id": PERIOD_KEY, "target_type": "settlement_export"})

    now_iso = datetime.now(timezone.utc).isoformat()

    # Businesses (one plain, one with commas + quotes in legal_name)
    db.businesses.insert_many([
        {
            "id": BIZ_PLAIN_ID, "name": "Plain Biz",
            "email": f"{BIZ_PLAIN_ID}@test.com",
            "user_id": USER_PLAIN_ID,
            "rfc": "PLAR800101ABC", "clabe": "012180001234567891",
            "legal_name": "Plain Biz Sociedad Anonima de Capital Variable Operadora Internacional",
            "status": "approved", "subscription_status": "active",
            "country_code": "MX", "city": "CDMX",
            "created_at": now_iso,
        },
        {
            "id": BIZ_COMMA_ID, "name": "Comma Biz",
            "email": f"{BIZ_COMMA_ID}@test.com",
            "user_id": USER_COMMA_ID,
            "rfc": "COMA800101XYZ", "clabe": "012180009876543219",
            "legal_name": 'Salon, "El Mejor" S.A. de C.V.',
            "status": "approved", "subscription_status": "active",
            "country_code": "MX", "city": "CDMX",
            "created_at": now_iso,
        },
    ])

    db.users.insert_many([
        {"id": USER_PLAIN_ID, "email": f"{USER_PLAIN_ID}@test.com", "role": "business",
         "full_name": "Owner Plain", "business_id": BIZ_PLAIN_ID, "is_manager": False},
        {"id": USER_COMMA_ID, "email": f"{USER_COMMA_ID}@test.com", "role": "business",
         "full_name": "Owner Comma", "business_id": BIZ_COMMA_ID, "is_manager": False},
        {"id": CLIENT_ID, "email": f"{CLIENT_ID}@test.com", "role": "user",
         "full_name": "Client"},
    ])

    db.settlements.insert_many([
        {
            "id": SETTLEMENT_PLAIN_ID,
            "business_id": BIZ_PLAIN_ID,
            "period_key": PERIOD_KEY,
            "total_amount": 1234.56,
            "payout_amount": 1234.56,
            "net_payout": 1234.56,
            "booking_count": 3,
            "transaction_ids": [f"{TEST_PREFIX}tx1", f"{TEST_PREFIX}tx2", f"{TEST_PREFIX}tx3"],
            "clabe": "012180001234567891",
            "legal_name": "Plain Biz Sociedad Anonima de Capital Variable Operadora Internacional",
            "rfc": "PLAR800101ABC",
            "status": "pending",
            "created_at": now_iso,
        },
        {
            "id": SETTLEMENT_COMMA_ID,
            "business_id": BIZ_COMMA_ID,
            "period_key": PERIOD_KEY,
            "total_amount": 89.10,
            "payout_amount": 89.10,
            "net_payout": 89.10,
            "booking_count": 1,
            "transaction_ids": [f"{TEST_PREFIX}txc1"],
            "clabe": "012180009876543219",
            "legal_name": 'Salon, "El Mejor" S.A. de C.V.',
            "rfc": "COMA800101XYZ",
            "status": "pending",
            "created_at": now_iso,
        },
    ])

    yield

    db.businesses.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    db.users.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    db.settlements.delete_many({"period_key": PERIOD_KEY})
    db.audit_logs.delete_many({"target_id": PERIOD_KEY, "target_type": "settlement_export"})


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
def client_token():
    return _mint(CLIENT_ID, "user", f"{CLIENT_ID}@test.com")


@pytest.fixture(scope="module")
def business_token():
    return _mint(USER_PLAIN_ID, "business", f"{USER_PLAIN_ID}@test.com")


def _csv_lines(body: str):
    """Return (header_list, row_lines) - row_lines kept as raw strings (with quoting)."""
    parts = body.strip().split("\r\n")
    return parts[0].split(","), parts[1:]


def _parse_csv_rows(body: str):
    """Tiny CSV parser respecting double-quote escaping (RFC4180)."""
    import csv
    import io
    reader = csv.reader(io.StringIO(body))
    return list(reader)


# ============================================================
# 1. Auth gates
# ============================================================
class TestAuth:
    def test_no_token_unauthorized(self):
        r = requests.get(
            f"{BASE_URL}/api/admin/settlements/{PERIOD_KEY}/export-spei.csv?bank=bbva"
        )
        assert r.status_code in (401, 403), r.text

    def test_client_token_forbidden(self, client_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/settlements/{PERIOD_KEY}/export-spei.csv?bank=bbva",
            headers={"Authorization": f"Bearer {client_token}"},
        )
        assert r.status_code == 403, r.text

    def test_business_token_forbidden(self, business_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/settlements/{PERIOD_KEY}/export-spei.csv?bank=banorte",
            headers={"Authorization": f"Bearer {business_token}"},
        )
        assert r.status_code == 403, r.text


# ============================================================
# 2. Generic bank (default + explicit)
# ============================================================
class TestGenericBank:
    EXPECTED = ["Beneficiario", "CLABE", "RFC", "Monto",
                "Concepto", "Referencia", "Email", "Citas", "Folio"]

    def test_generic_explicit(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/settlements/{PERIOD_KEY}/export-spei.csv?bank=generic",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd
        assert f"bookvia-spei-{PERIOD_KEY}-generic.csv" in cd, cd

        rows = _parse_csv_rows(r.text)
        assert rows[0] == self.EXPECTED

        # Find PLAIN row
        plain = next((row for row in rows[1:] if row[2] == "PLAR800101ABC"), None)
        assert plain is not None, rows
        assert plain[0].startswith("Plain Biz Sociedad")  # legal_name not truncated in generic
        assert plain[1] == "012180001234567891"  # CLABE
        assert plain[3] == "1234.56"  # Monto
        assert "Bookvia" in plain[4]  # Concepto
        assert plain[5] == SETTLEMENT_PLAIN_ID[:20]  # Referencia
        assert plain[6] == f"{BIZ_PLAIN_ID}@test.com"
        assert plain[7] == "3"  # Citas
        assert plain[8] == SETTLEMENT_PLAIN_ID  # Folio

    def test_invalid_bank_falls_back_to_generic(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/settlements/{PERIOD_KEY}/export-spei.csv?bank=invent",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        rows = _parse_csv_rows(r.text)
        assert rows[0] == self.EXPECTED


# ============================================================
# 3. BBVA
# ============================================================
class TestBBVA:
    EXPECTED = ["Banco beneficiario", "Cuenta beneficiario", "Tipo cuenta",
                "Importe", "Concepto", "Referencia numerica",
                "RFC beneficiario", "Beneficiario", "Email"]

    def test_bbva_layout_and_truncation(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/settlements/{PERIOD_KEY}/export-spei.csv?bank=bbva",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        cd = r.headers.get("content-disposition", "")
        assert f"bookvia-spei-{PERIOD_KEY}-bbva.csv" in cd, cd
        assert "text/csv" in r.headers.get("content-type", "")

        rows = _parse_csv_rows(r.text)
        assert rows[0] == self.EXPECTED

        plain = next((row for row in rows[1:] if row[6] == "PLAR800101ABC"), None)
        assert plain is not None

        # 1) Banco beneficiario hardcoded
        assert plain[0] == "BBVA"
        # 2) Cuenta beneficiario = clabe
        assert plain[1] == "012180001234567891"
        # 3) Tipo cuenta = '40' (CLABE)
        assert plain[2] == "40"
        # 4) Importe with 2 decimals
        assert plain[3] == "1234.56"
        # 5) Concepto truncated to <=40 chars
        assert len(plain[4]) <= 40
        assert plain[4].startswith("Bookvia")
        # 6) Referencia numerica - solo digitos extraidos del settlement.id
        ref = plain[5]
        assert ref, "Referencia numerica vacia"
        assert ref.isdigit(), f"Referencia debe ser solo digitos, got: {ref!r}"
        # The settlement.id was f"{TEST_PREFIX}set-plain-12345" => digits "912345"
        digits_full = "".join(c for c in SETTLEMENT_PLAIN_ID if c.isdigit())
        assert ref == digits_full[:len(ref)], (
            f"Referencia '{ref}' debe ser prefijo de digits del settlement.id '{digits_full}'"
        )
        # 7) RFC pass-through
        assert plain[6] == "PLAR800101ABC"
        # 8) Beneficiario truncated to <=40 chars
        assert len(plain[7]) <= 40
        assert plain[7].startswith("Plain Biz")
        # 9) Email pass-through
        assert plain[8] == f"{BIZ_PLAIN_ID}@test.com"

    def test_bbva_csv_escaping_for_comma_legal_name(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/settlements/{PERIOD_KEY}/export-spei.csv?bank=bbva",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        rows = _parse_csv_rows(r.text)
        comma_row = next((row for row in rows[1:] if row[6] == "COMA800101XYZ"), None)
        assert comma_row is not None
        # Beneficiario column (index 7) should contain raw characters after CSV
        # parsing - comma + quotes preserved
        assert "," in comma_row[7]
        assert '"' in comma_row[7]
        assert comma_row[7].startswith('Salon, "El Mejor"')
        # And the raw body contains proper double-quoting
        assert '"Salon, ""El Mejor"" S.A. de C.V."' in r.text


# ============================================================
# 4. Banorte
# ============================================================
class TestBanorte:
    EXPECTED = ["Tipo de pago", "Cuenta origen", "CLABE destino",
                "Importe", "Concepto de pago", "Referencia",
                "RFC beneficiario", "Beneficiario"]

    def test_banorte_layout_and_truncation(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/settlements/{PERIOD_KEY}/export-spei.csv?bank=banorte",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        cd = r.headers.get("content-disposition", "")
        assert f"bookvia-spei-{PERIOD_KEY}-banorte.csv" in cd, cd

        rows = _parse_csv_rows(r.text)
        assert rows[0] == self.EXPECTED

        plain = next((row for row in rows[1:] if row[6] == "PLAR800101ABC"), None)
        assert plain is not None

        assert plain[0] == "SPEI"             # Tipo de pago
        assert plain[1] == ""                 # Cuenta origen vacia
        assert plain[2] == "012180001234567891"  # CLABE destino
        assert plain[3] == "1234.56"          # Importe
        assert len(plain[4]) <= 30, f"Concepto must be <=30, got {len(plain[4])}: {plain[4]!r}"
        # Referencia: alphanumeric, max 10 chars
        ref = plain[5]
        assert ref, "Referencia empty"
        assert len(ref) <= 10
        assert ref.isalnum(), f"Referencia must be alnum, got: {ref!r}"
        # Should be prefix of alnum subset of settlement.id
        alnum_full = "".join(c for c in SETTLEMENT_PLAIN_ID if c.isalnum())
        assert ref == alnum_full[:len(ref)]
        assert plain[6] == "PLAR800101ABC"
        assert len(plain[7]) <= 35, f"Beneficiario must be <=35, got {len(plain[7])}: {plain[7]!r}"

    def test_banorte_escaping(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/settlements/{PERIOD_KEY}/export-spei.csv?bank=banorte",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        # Banorte truncates Beneficiario to 35; raw legal_name 'Salon, "El Mejor" S.A. de C.V.'
        # is 30 chars => fits without truncation. Must be quoted because of comma+quote.
        assert '"Salon, ""El Mejor"" S.A. de C.V."' in r.text


# ============================================================
# 5. Santander
# ============================================================
class TestSantander:
    EXPECTED = ["CLABE", "Beneficiario", "RFC", "Monto",
                "Concepto", "Referencia", "Email"]

    def test_santander_layout_and_truncation(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/settlements/{PERIOD_KEY}/export-spei.csv?bank=santander",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        cd = r.headers.get("content-disposition", "")
        assert f"bookvia-spei-{PERIOD_KEY}-santander.csv" in cd, cd

        rows = _parse_csv_rows(r.text)
        assert rows[0] == self.EXPECTED

        plain = next((row for row in rows[1:] if row[2] == "PLAR800101ABC"), None)
        assert plain is not None

        assert plain[0] == "012180001234567891"  # CLABE
        assert len(plain[1]) <= 50, f"Beneficiario must be <=50, got {len(plain[1])}"
        assert plain[1].startswith("Plain Biz")
        assert plain[2] == "PLAR800101ABC"
        assert plain[3] == "1234.56"
        assert len(plain[4]) <= 35, f"Concepto must be <=35, got {len(plain[4])}: {plain[4]!r}"
        ref = plain[5]
        assert ref, "Referencia empty"
        assert len(ref) <= 7
        assert ref.isalnum(), f"Referencia must be alnum, got: {ref!r}"
        alnum_full = "".join(c for c in SETTLEMENT_PLAIN_ID if c.isalnum())
        assert ref == alnum_full[:len(ref)]
        assert plain[6] == f"{BIZ_PLAIN_ID}@test.com"

    def test_santander_escaping(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/settlements/{PERIOD_KEY}/export-spei.csv?bank=santander",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        assert '"Salon, ""El Mejor"" S.A. de C.V."' in r.text


# ============================================================
# 6. Audit log includes details.bank
# ============================================================
class TestAuditLog:
    def test_audit_log_records_bank(self, admin_token):
        # Snapshot timestamp pre-call
        ts_before = datetime.now(timezone.utc)
        # Call with bank=banorte
        r = requests.get(
            f"{BASE_URL}/api/admin/settlements/{PERIOD_KEY}/export-spei.csv?bank=banorte",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200

        # Look up newest export audit log for this period
        log = db.audit_logs.find_one(
            {
                "target_type": "settlement_export",
                "target_id": PERIOD_KEY,
                "details.bank": "banorte",
            },
            sort=[("created_at", -1)],
        )
        assert log is not None, "Audit log with details.bank=banorte not found"
        # And action == settlement_generate (per code)
        assert log.get("action") in ("settlement_generate", "SETTLEMENT_GENERATE")
        assert log["details"]["bank"] == "banorte"

    def test_audit_log_records_bank_bbva(self, admin_token):
        r = requests.get(
            f"{BASE_URL}/api/admin/settlements/{PERIOD_KEY}/export-spei.csv?bank=bbva",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        log = db.audit_logs.find_one(
            {
                "target_type": "settlement_export",
                "target_id": PERIOD_KEY,
                "details.bank": "bbva",
            },
            sort=[("created_at", -1)],
        )
        assert log is not None
        assert log["details"]["bank"] == "bbva"
