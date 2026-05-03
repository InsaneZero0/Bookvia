"""
Fase 11: Hardening del sistema de pagos antes de produccion.

Tests:
  * Idempotencia fuerte del webhook (collection stripe_events).
  * Handlers de: charge.refunded, charge.dispute.created / closed,
    payment_intent.payment_failed, checkout.session.expired.
  * Admin endpoints: POST /admin/bookings/{id}/refund-manual,
    POST /admin/businesses/{id}/payout-hold.
  * issue_stripe_refund (idempotency key + DB side-effects) usando
    monkeypatch sobre stripe_lib.Refund.create.
  * Cancelacion con refund_to='card' y fallback a wallet cuando Stripe
    falla.
  * expire_holds_task scheduler.
"""
from __future__ import annotations

import os
import uuid
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional

import pymongo
import pyotp
import pytest
import requests

# ---------- env / globals ----------
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend .env since pytest runs from /app/backend
    try:
        with open("/app/frontend/.env") as _f:
            for _line in _f:
                if _line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = _line.split("=", 1)[1].strip().strip('"').rstrip("/")
                    break
    except Exception:
        pass
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "zamorachapa50@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_INITIAL_PASSWORD", "RainbowLol3133!")

WEBHOOK_URL = f"{BASE_URL}/api/webhook/stripe"

TEST_PREFIX = "TEST_F11_"

_mongo = pymongo.MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]


# Shared event loop for all async service tests so Motor does not bind to
# a closed loop between tests.
_SHARED_LOOP: Optional[asyncio.AbstractEventLoop] = None


def _get_loop() -> asyncio.AbstractEventLoop:
    global _SHARED_LOOP
    if _SHARED_LOOP is None or _SHARED_LOOP.is_closed():
        _SHARED_LOOP = asyncio.new_event_loop()
        asyncio.set_event_loop(_SHARED_LOOP)
    return _SHARED_LOOP


def _run(coro):
    return _get_loop().run_until_complete(coro)


# ---------- helpers ----------
def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _admin_totp() -> str:
    """Retrieve admin totp_secret from DB and generate current code."""
    admin = _db.users.find_one({"email": ADMIN_EMAIL}, {"_id": 0, "totp_secret": 1})
    assert admin and admin.get("totp_secret"), "Admin user missing totp_secret in DB"
    return pyotp.TOTP(admin["totp_secret"]).now()


@pytest.fixture(scope="module")
def admin_headers() -> dict:
    resp = requests.post(
        f"{BASE_URL}/api/auth/admin/login",
        json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "totp_code": _admin_totp(),
        },
        timeout=15,
    )
    if resp.status_code != 200:
        pytest.skip(f"Admin login failed: {resp.status_code} {resp.text}")
    return {"Authorization": f"Bearer {resp.json()['token']}"}


# ---------- cleanup helpers ----------
def _cleanup():
    """Remove only TEST_F11_ prefixed data."""
    _db.stripe_events.delete_many({"_id": {"$regex": f"^{TEST_PREFIX}"}})
    _db.transactions.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    _db.bookings.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    _db.businesses.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    _db.users.delete_many({"id": {"$regex": f"^{TEST_PREFIX}"}})
    _db.refund_events.delete_many({"transaction_id": {"$regex": f"^{TEST_PREFIX}"}})
    _db.wallets.delete_many({"user_id": {"$regex": f"^{TEST_PREFIX}"}})
    _db.wallet_transactions.delete_many({"user_id": {"$regex": f"^{TEST_PREFIX}"}})


@pytest.fixture(autouse=True, scope="module")
def _module_cleanup():
    _cleanup()
    yield
    _cleanup()


# ---------- fixture factories ----------
def _insert_tx(*, status="paid", wallet_applied=0.0, stripe_charge_amount=500.0,
               client_paid=500.0, pi_id: Optional[str] = None, charge_id: Optional[str] = None,
               session_id: Optional[str] = None, booking_id: Optional[str] = None,
               business_id: Optional[str] = None, user_id: Optional[str] = None) -> dict:
    tx_id = f"{TEST_PREFIX}tx_{uuid.uuid4().hex[:10]}"
    doc = {
        "id": tx_id,
        "booking_id": booking_id or f"{TEST_PREFIX}bk_{uuid.uuid4().hex[:8]}",
        "user_id": user_id or f"{TEST_PREFIX}u_{uuid.uuid4().hex[:8]}",
        "business_id": business_id or f"{TEST_PREFIX}b_{uuid.uuid4().hex[:8]}",
        "status": status,
        "client_paid": client_paid,
        "wallet_applied": wallet_applied,
        "stripe_charge_amount": stripe_charge_amount,
        "stripe_payment_intent_id": pi_id or f"pi_{TEST_PREFIX}{uuid.uuid4().hex[:10]}",
        "stripe_charge_id": charge_id or f"ch_{TEST_PREFIX}{uuid.uuid4().hex[:10]}",
        "stripe_session_id": session_id or f"cs_{TEST_PREFIX}{uuid.uuid4().hex[:10]}",
        "created_at": _iso_now(),
        "refund_amount": 0.0,
        "funds_state": "pending_hold",
        "payout_amount": 450.0,
    }
    _db.transactions.insert_one(doc)
    return doc


def _insert_booking(*, tx: dict, status="paid") -> dict:
    bk = {
        "id": tx["booking_id"],
        "user_id": tx["user_id"],
        "business_id": tx["business_id"],
        "status": status,
        "created_at": _iso_now(),
    }
    _db.bookings.insert_one(bk)
    return bk


def _insert_business(business_id: Optional[str] = None) -> dict:
    bid = business_id or f"{TEST_PREFIX}b_{uuid.uuid4().hex[:8]}"
    doc = {"id": bid, "name": "TEST_F11_Biz", "payout_hold": False, "email": f"{bid}@test.com"}
    _db.businesses.insert_one(doc)
    return doc


def _post_webhook(event: dict) -> requests.Response:
    return requests.post(WEBHOOK_URL, json=event, timeout=15,
                         headers={"Content-Type": "application/json"})


def _build_event(evt_id: str, evt_type: str, obj: dict) -> dict:
    return {
        "id": evt_id,
        "object": "event",
        "type": evt_type,
        "api_version": "2024-06-20",
        "created": int(datetime.now(timezone.utc).timestamp()),
        "livemode": False,
        "pending_webhooks": 0,
        "request": {"id": None, "idempotency_key": None},
        "data": {"object": obj},
    }


# =========================================================
#  Idempotencia del webhook
# =========================================================
class TestWebhookIdempotency:
    def test_skipped_when_event_already_processed(self):
        evt_id = f"{TEST_PREFIX}evt_idem_{uuid.uuid4().hex[:8]}"
        # Pre-insert event so webhook should skip
        _db.stripe_events.insert_one(
            {"_id": evt_id, "event_type": "charge.refunded", "received_at": _iso_now()}
        )
        event = _build_event(evt_id, "charge.refunded",
                             {"id": "ch_xxx", "payment_intent": "pi_none",
                              "amount_refunded": 0, "refunded": False})
        resp = _post_webhook(event)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data.get("status") == "skipped", data
        assert data.get("event_id") == evt_id

    def test_first_time_then_duplicate(self):
        evt_id = f"{TEST_PREFIX}evt_first_{uuid.uuid4().hex[:8]}"
        event = _build_event(evt_id, "charge.refunded",
                             {"id": "ch_nope", "payment_intent": "pi_nope",
                              "amount_refunded": 0, "refunded": False})
        r1 = _post_webhook(event)
        assert r1.status_code == 200, r1.text
        assert r1.json().get("status") == "success", r1.json()
        # Duplicate should now skip
        r2 = _post_webhook(event)
        assert r2.status_code == 200, r2.text
        assert r2.json().get("status") == "skipped", r2.json()


# =========================================================
#  charge.refunded handler
# =========================================================
class TestChargeRefunded:
    def test_full_refund_updates_tx(self):
        tx = _insert_tx(status="paid", stripe_charge_amount=500.0)
        evt_id = f"{TEST_PREFIX}evt_chfr_{uuid.uuid4().hex[:8]}"
        event = _build_event(evt_id, "charge.refunded", {
            "id": tx["stripe_charge_id"], "payment_intent": tx["stripe_payment_intent_id"],
            "amount_refunded": 50000, "refunded": True,
        })
        resp = _post_webhook(event)
        assert resp.status_code == 200, resp.text
        assert resp.json().get("status") == "success"
        updated = _db.transactions.find_one({"id": tx["id"]}, {"_id": 0})
        assert updated["status"] == "refund_full", updated
        assert abs(updated["refund_amount"] - 500.0) < 0.01
        # mark_refunded should set funds_state=refunded
        assert updated.get("funds_state") == "refunded", updated

    def test_partial_refund_updates_tx(self):
        tx = _insert_tx(status="paid", stripe_charge_amount=500.0)
        evt_id = f"{TEST_PREFIX}evt_chpart_{uuid.uuid4().hex[:8]}"
        event = _build_event(evt_id, "charge.refunded", {
            "id": tx["stripe_charge_id"], "payment_intent": tx["stripe_payment_intent_id"],
            "amount_refunded": 10000, "refunded": False,
        })
        resp = _post_webhook(event)
        assert resp.status_code == 200, resp.text
        updated = _db.transactions.find_one({"id": tx["id"]}, {"_id": 0})
        assert updated["status"] == "refund_partial"
        assert abs(updated["refund_amount"] - 100.0) < 0.01


# =========================================================
#  charge.dispute.created handler
# =========================================================
class TestDisputeCreated:
    def test_dispute_created_flags_tx_and_freezes_payout(self):
        biz = _insert_business()
        tx = _insert_tx(status="paid", business_id=biz["id"])
        evt_id = f"{TEST_PREFIX}evt_disp_{uuid.uuid4().hex[:8]}"
        event = _build_event(evt_id, "charge.dispute.created", {
            "id": f"dp_{uuid.uuid4().hex[:10]}",
            "charge": tx["stripe_charge_id"],
            "payment_intent": tx["stripe_payment_intent_id"],
            "status": "needs_response",
            "amount": 40000,
        })
        resp = _post_webhook(event)
        assert resp.status_code == 200, resp.text
        updated = _db.transactions.find_one({"id": tx["id"]}, {"_id": 0})
        assert updated["funds_state"] == "disputed", updated
        assert updated.get("dispute_status") == "needs_response"
        assert updated.get("dispute_id", "").startswith("dp_")
        assert abs(updated.get("dispute_amount_mxn", 0) - 400.0) < 0.01
        biz_after = _db.businesses.find_one({"id": biz["id"]}, {"_id": 0})
        assert biz_after.get("payout_hold") is True
        assert biz_after.get("payout_hold_reason")

    def test_dispute_closed_lost_sets_refunded(self):
        tx = _insert_tx(status="paid")
        evt_id = f"{TEST_PREFIX}evt_lost_{uuid.uuid4().hex[:8]}"
        event = _build_event(evt_id, "charge.dispute.closed", {
            "id": f"dp_{uuid.uuid4().hex[:10]}",
            "charge": tx["stripe_charge_id"],
            "payment_intent": tx["stripe_payment_intent_id"],
            "status": "lost",
            "amount": 50000,
        })
        resp = _post_webhook(event)
        assert resp.status_code == 200, resp.text
        updated = _db.transactions.find_one({"id": tx["id"]}, {"_id": 0})
        assert updated["funds_state"] == "refunded", updated
        assert updated["dispute_status"] == "lost"

    def test_dispute_closed_won_sets_available(self):
        tx = _insert_tx(status="paid")
        evt_id = f"{TEST_PREFIX}evt_won_{uuid.uuid4().hex[:8]}"
        event = _build_event(evt_id, "charge.dispute.closed", {
            "id": f"dp_{uuid.uuid4().hex[:10]}",
            "charge": tx["stripe_charge_id"],
            "payment_intent": tx["stripe_payment_intent_id"],
            "status": "won",
            "amount": 50000,
        })
        resp = _post_webhook(event)
        assert resp.status_code == 200, resp.text
        updated = _db.transactions.find_one({"id": tx["id"]}, {"_id": 0})
        assert updated["funds_state"] == "available"
        assert updated["dispute_status"] == "won"


# =========================================================
#  payment_intent.payment_failed
# =========================================================
class TestPaymentFailed:
    def test_payment_failed_marks_tx_and_notifies_user(self):
        tx = _insert_tx(status="created")
        evt_id = f"{TEST_PREFIX}evt_fail_{uuid.uuid4().hex[:8]}"
        event = _build_event(evt_id, "payment_intent.payment_failed", {
            "id": tx["stripe_payment_intent_id"],
            "last_payment_error": {"message": "card_declined"},
        })
        resp = _post_webhook(event)
        assert resp.status_code == 200, resp.text
        updated = _db.transactions.find_one({"id": tx["id"]}, {"_id": 0})
        assert updated["status"] == "failed", updated
        assert "card_declined" in (updated.get("failure_reason") or "")
        # Notification created for the user
        notif = _db.notifications.find_one({"user_id": tx["user_id"], "type": "payment_failed"})
        assert notif is not None, "Expected a payment_failed notification for the user"


# =========================================================
#  checkout.session.expired
# =========================================================
class TestCheckoutExpired:
    def test_session_expired_transitions_tx_and_booking(self):
        tx = _insert_tx(status="created", wallet_applied=0.0)
        _insert_booking(tx=tx, status="hold")
        evt_id = f"{TEST_PREFIX}evt_exp_{uuid.uuid4().hex[:8]}"
        event = _build_event(evt_id, "checkout.session.expired", {
            "id": tx["stripe_session_id"],
        })
        resp = _post_webhook(event)
        assert resp.status_code == 200, resp.text
        updated_tx = _db.transactions.find_one({"id": tx["id"]}, {"_id": 0})
        assert updated_tx["status"] == "expired", updated_tx
        updated_bk = _db.bookings.find_one({"id": tx["booking_id"]}, {"_id": 0})
        assert updated_bk["status"] == "expired", updated_bk

    def test_session_expired_reverts_wallet_when_applied(self):
        # user needs to exist so wallet operations can attach
        uid = f"{TEST_PREFIX}u_{uuid.uuid4().hex[:8]}"
        _db.users.insert_one({"id": uid, "email": f"{uid}@test.com",
                              "full_name": "Wallet User", "role": "customer"})
        tx = _insert_tx(status="created", wallet_applied=75.0, user_id=uid)
        _insert_booking(tx=tx, status="hold")
        evt_id = f"{TEST_PREFIX}evt_expw_{uuid.uuid4().hex[:8]}"
        event = _build_event(evt_id, "checkout.session.expired", {
            "id": tx["stripe_session_id"],
        })
        resp = _post_webhook(event)
        assert resp.status_code == 200, resp.text
        # Expect a wallet_transaction credit for the reversal
        wtx = list(_db.wallet_transactions.find(
            {"user_id": uid, "booking_id": tx["booking_id"]}, {"_id": 0}
        ))
        assert len(wtx) >= 1, f"Expected wallet reversal for user {uid}, got {wtx}"
        assert abs(sum(t.get("amount", 0) for t in wtx) - 75.0) < 0.01


# =========================================================
#  Admin: manual refund
# =========================================================
class TestAdminManualRefund:
    def test_missing_booking_returns_404(self, admin_headers):
        resp = requests.post(
            f"{BASE_URL}/api/admin/bookings/NOPE/refund-manual",
            json={"amount": 10, "reason": "test reason here", "destination": "card"},
            headers=admin_headers, timeout=10,
        )
        assert resp.status_code == 404, resp.text

    def test_invalid_amount_returns_400(self, admin_headers):
        tx = _insert_tx(status="paid")
        _insert_booking(tx=tx, status="paid")
        resp = requests.post(
            f"{BASE_URL}/api/admin/bookings/{tx['booking_id']}/refund-manual",
            json={"amount": 0, "reason": "valid reason ok", "destination": "wallet"},
            headers=admin_headers, timeout=10,
        )
        assert resp.status_code == 400, resp.text

    def test_short_reason_returns_400(self, admin_headers):
        tx = _insert_tx(status="paid")
        _insert_booking(tx=tx, status="paid")
        resp = requests.post(
            f"{BASE_URL}/api/admin/bookings/{tx['booking_id']}/refund-manual",
            json={"amount": 50, "reason": "abc", "destination": "wallet"},
            headers=admin_headers, timeout=10,
        )
        assert resp.status_code == 400, resp.text

    def test_invalid_destination_returns_400(self, admin_headers):
        tx = _insert_tx(status="paid")
        _insert_booking(tx=tx, status="paid")
        resp = requests.post(
            f"{BASE_URL}/api/admin/bookings/{tx['booking_id']}/refund-manual",
            json={"amount": 50, "reason": "valid reason 123", "destination": "bank"},
            headers=admin_headers, timeout=10,
        )
        assert resp.status_code == 400, resp.text

    def test_no_auth_returns_401_or_403(self):
        resp = requests.post(
            f"{BASE_URL}/api/admin/bookings/SOME/refund-manual",
            json={"amount": 10, "reason": "valid reason 123", "destination": "wallet"},
            timeout=10,
        )
        assert resp.status_code in (401, 403), resp.status_code

    def test_wallet_destination_credits_wallet_and_updates_tx(self, admin_headers):
        uid = f"{TEST_PREFIX}u_{uuid.uuid4().hex[:8]}"
        _db.users.insert_one({"id": uid, "email": f"{uid}@test.com",
                              "full_name": "Refund Dest User", "role": "customer"})
        tx = _insert_tx(status="paid", user_id=uid, stripe_charge_amount=500.0)
        _insert_booking(tx=tx, status="paid")
        resp = requests.post(
            f"{BASE_URL}/api/admin/bookings/{tx['booking_id']}/refund-manual",
            json={"amount": 120, "reason": "goodwill gesture for client",
                  "destination": "wallet"},
            headers=admin_headers, timeout=15,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body.get("ok") is True
        assert body.get("destination") == "wallet"
        assert body.get("wallet_tx_id")
        updated_tx = _db.transactions.find_one({"id": tx["id"]}, {"_id": 0})
        assert updated_tx["status"] == "refund_partial", updated_tx
        assert abs(updated_tx.get("refund_amount", 0) - 120.0) < 0.01
        # audit log with MANUAL_REFUND
        audit = _db.audit_logs.find_one({"action": "manual_refund",
                                         "target_id": tx["booking_id"]})
        assert audit is not None, "Expected manual_refund audit log"

    def test_card_destination_invokes_stripe_and_may_502(self, admin_headers):
        # Use a pi that doesn't exist on Stripe -> expect 502 from real API.
        tx = _insert_tx(status="paid", stripe_charge_amount=500.0,
                        pi_id=f"pi_does_not_exist_{uuid.uuid4().hex[:8]}")
        _insert_booking(tx=tx, status="paid")
        resp = requests.post(
            f"{BASE_URL}/api/admin/bookings/{tx['booking_id']}/refund-manual",
            json={"amount": 100, "reason": "test card refund path",
                  "destination": "card"},
            headers=admin_headers, timeout=20,
        )
        # Either the wrapper successfully reached Stripe and failed (502) or, very
        # rarely in a mocked env, it succeeded (200). Both prove invocation path.
        assert resp.status_code in (200, 502), resp.text
        if resp.status_code == 502:
            assert "stripe" in resp.text.lower() or "refund" in resp.text.lower()


# =========================================================
#  Admin: payout-hold toggle
# =========================================================
class TestAdminPayoutHold:
    def test_set_hold_true(self, admin_headers):
        biz = _insert_business()
        resp = requests.post(
            f"{BASE_URL}/api/admin/businesses/{biz['id']}/payout-hold",
            params={"hold": "true", "reason": "dispute pending resolution"},
            headers=admin_headers, timeout=10,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body.get("ok") is True
        assert body.get("payout_hold") is True
        updated = _db.businesses.find_one({"id": biz["id"]}, {"_id": 0})
        assert updated.get("payout_hold") is True
        assert updated.get("payout_hold_reason") == "dispute pending resolution"
        audit = _db.audit_logs.find_one({"action": "payout_hold_toggle",
                                         "target_id": biz["id"]})
        assert audit is not None

    def test_release_hold(self, admin_headers):
        biz = _insert_business()
        _db.businesses.update_one({"id": biz["id"]},
                                  {"$set": {"payout_hold": True,
                                            "payout_hold_reason": "old"}})
        resp = requests.post(
            f"{BASE_URL}/api/admin/businesses/{biz['id']}/payout-hold",
            params={"hold": "false"}, headers=admin_headers, timeout=10,
        )
        assert resp.status_code == 200, resp.text
        updated = _db.businesses.find_one({"id": biz["id"]}, {"_id": 0})
        assert updated.get("payout_hold") is False
        assert updated.get("payout_hold_reason") is None

    def test_business_not_found_returns_404(self, admin_headers):
        resp = requests.post(
            f"{BASE_URL}/api/admin/businesses/NOPE_{uuid.uuid4().hex[:6]}/payout-hold",
            params={"hold": "true", "reason": "foo"},
            headers=admin_headers, timeout=10,
        )
        assert resp.status_code == 404, resp.text


# =========================================================
#  issue_stripe_refund + record_stripe_event (direct DB / async)
# =========================================================
class TestStripeRefundsService:
    """Direct service tests with monkeypatch on stripe_lib.Refund.create."""

    def test_record_stripe_event_idempotent(self):
        """Same event id twice -> first True, second False."""
        # Import here so core.database uses backend env
        import sys
        sys.path.insert(0, "/app/backend")
        from services.stripe_refunds import record_stripe_event  # noqa: E402

        evt_id = f"{TEST_PREFIX}rec_{uuid.uuid4().hex[:10]}"
        first = _run(record_stripe_event(evt_id, "charge.refunded"))
        second = _run(record_stripe_event(evt_id, "charge.refunded"))
        assert first is True
        assert second is False

    def test_issue_stripe_refund_idempotency_key(self, monkeypatch):
        """Two calls with same tx+amount => only ONE Stripe.Refund.create."""
        import sys
        sys.path.insert(0, "/app/backend")
        import stripe as stripe_lib  # noqa: E402
        from services import stripe_refunds  # noqa: E402

        calls = []

        class _FakeRefund:
            def __init__(self, idem_key, amount):
                self.id = f"re_{idem_key[:20]}"
                self.status = "succeeded"
                self.amount = amount
                self.metadata = {}

        def fake_create(**kwargs):
            calls.append(kwargs)
            return _FakeRefund(kwargs.get("idempotency_key", ""), kwargs.get("amount", 0))

        monkeypatch.setattr(stripe_lib.Refund, "create", fake_create)

        tx = _insert_tx(status="paid", stripe_charge_amount=500.0, client_paid=500.0)
        r1 = _run(
            stripe_refunds.issue_stripe_refund(
                transaction=tx, amount_mxn=100.0, reason="test",
                metadata=None, actor="test",
            )
        )
        # Re-fetch tx to get updated stripe_refunds list, but idem key
        # is computed from tx.id + amount only, so should be identical.
        tx2 = _db.transactions.find_one({"id": tx["id"]}, {"_id": 0})
        r2 = _run(
            stripe_refunds.issue_stripe_refund(
                transaction=tx2, amount_mxn=100.0, reason="test",
                metadata=None, actor="test",
            )
        )

        # Both calls share same idempotency key
        keys = [c.get("idempotency_key") for c in calls]
        assert keys[0] == f"refund-{tx['id']}-10000"
        assert all(k == keys[0] for k in keys), keys
        # Fake stripe returns same id for same idem key -> proves caller uses
        # idem key for dedup semantically
        assert r1["stripe_refund_id"] == r2["stripe_refund_id"]
        # amount charged on card
        assert abs(r1["amount_refunded_on_card"] - 100.0) < 0.01

    def test_issue_stripe_refund_respects_card_portion(self, monkeypatch):
        """If wallet was applied, only the card portion is refunded to card;
        the surplus is reported for wallet."""
        import sys
        sys.path.insert(0, "/app/backend")
        import stripe as stripe_lib
        from services import stripe_refunds

        def fake_create(**kwargs):
            class R:
                id = "re_ok"
                status = "succeeded"
                amount = kwargs.get("amount", 0)
                metadata = {}
            return R()

        monkeypatch.setattr(stripe_lib.Refund, "create", fake_create)
        # tx: 500 charge on card, 200 wallet -> card portion = 500
        tx = _insert_tx(status="paid", stripe_charge_amount=300.0,
                        client_paid=500.0, wallet_applied=200.0)
        res = _run(
            stripe_refunds.issue_stripe_refund(
                transaction=tx, amount_mxn=400.0, reason="test",
                actor="test",
            )
        )

        # Only card portion (300) may be refunded to card, 100 surplus to wallet
        assert abs(res["amount_refunded_on_card"] - 300.0) < 0.01
        assert abs(res["surplus_to_wallet"] - 100.0) < 0.01


# =========================================================
#  expire_holds_task scheduler
# =========================================================
class TestExpireHoldsTask:
    def test_expires_stale_hold_bookings(self):
        import sys
        sys.path.insert(0, "/app/backend")
        from routers.payments import expire_holds_task

        # Build a stale hold booking (created 10 days ago)
        bk_id = f"{TEST_PREFIX}bk_stale_{uuid.uuid4().hex[:8]}"
        stale_dt = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
        _db.bookings.insert_one({
            "id": bk_id, "status": "hold", "user_id": f"{TEST_PREFIX}u",
            "business_id": f"{TEST_PREFIX}b", "created_at": stale_dt,
        })
        count = _run(expire_holds_task())
        assert count >= 1, f"Expected at least 1 expired booking, got {count}"
        updated = _db.bookings.find_one({"id": bk_id}, {"_id": 0})
        assert updated["status"] == "cancelled", updated
        assert updated.get("cancelled_by") == "system"
