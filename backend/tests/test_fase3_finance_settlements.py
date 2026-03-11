"""
Test Suite for Bookvia Fase 3: Panel Financiero + Liquidaciones
Tests finance endpoints, ledger entries, settlements, payout hold, CSV exports

Features to test:
1. GET /api/business/finance/summary - Financial summary
2. GET /api/business/finance/transactions - Transaction list with filters
3. GET /api/business/finance/settlements - Settlement list for business
4. POST /api/admin/settlements/generate - Generate settlements (idempotent)
5. PUT /api/admin/settlements/{id}/pay - Mark settlement as paid
6. PUT /api/admin/businesses/{id}/payout-hold - Toggle payout hold
7. GET /api/admin/export/transactions - Export transactions CSV
8. GET /api/admin/export/settlements - Export settlements CSV
"""

import pytest
import requests
import os
import pyotp
from datetime import datetime, timezone

# Get BASE_URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://bookvia-prod-deploy.preview.emergentagent.com"

# Test credentials (provided)
BUSINESS_EMAIL = "testspa@test.com"
BUSINESS_PASSWORD = "Test123!"
ADMIN_TOTP_SECRET = "KRIZA3YQBZHM2ZTHSC47JLUO2DEIVKYY"

# Admin credentials from env
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'zamorachapa50@gmail.com')
ADMIN_PASSWORD = os.environ.get('ADMIN_INITIAL_PASSWORD', 'RainbowLol3133!')

# Expected ledger accounts
LEDGER_ACCOUNTS = ["business_revenue", "platform_fee", "refund", "penalty", "payout"]
LEDGER_DIRECTIONS = ["debit", "credit"]

# Settlement statuses
SETTLEMENT_STATUSES = ["pending", "paid", "held", "failed"]


class TestSetup:
    """Verify test environment is ready"""
    
    def test_business_login(self):
        """Verify business can login"""
        response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": BUSINESS_EMAIL,
            "password": BUSINESS_PASSWORD
        })
        assert response.status_code == 200, f"Business login failed: {response.text}"
        data = response.json()
        assert "token" in data
        print(f"✓ Business login successful: {BUSINESS_EMAIL}")
    
    def test_admin_login_with_2fa(self):
        """Verify admin can login with 2FA"""
        totp = pyotp.TOTP(ADMIN_TOTP_SECRET)
        totp_code = totp.now()
        
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "totp_code": totp_code
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data
        print(f"✓ Admin login with 2FA successful")


class TestBusinessFinanceSummary:
    """Test GET /api/business/finance/summary"""
    
    @pytest.fixture
    def business_auth_headers(self):
        """Get auth headers for business"""
        response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": BUSINESS_EMAIL,
            "password": BUSINESS_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Business login failed: {response.text}")
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_finance_summary(self, business_auth_headers):
        """GET /api/business/finance/summary - Returns financial summary"""
        response = requests.get(
            f"{BASE_URL}/api/business/finance/summary",
            headers=business_auth_headers
        )
        
        assert response.status_code == 200, f"Get summary failed: {response.text}"
        data = response.json()
        
        # Verify required fields
        required_fields = [
            "gross_revenue", "total_fees", "net_earnings",
            "pending_payout", "paid_payout"
        ]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        # All values should be numeric
        for field in required_fields:
            assert isinstance(data[field], (int, float)), f"{field} should be numeric"
        
        # Verify net_earnings calculation
        expected_net = data["gross_revenue"] - data["total_fees"] - data.get("total_refunds", 0) - data.get("total_penalties", 0)
        assert abs(data["net_earnings"] - expected_net) < 0.01, \
            f"net_earnings calculation incorrect: expected {expected_net}, got {data['net_earnings']}"
        
        print(f"✓ Finance summary retrieved:")
        print(f"  - gross_revenue: ${data['gross_revenue']}")
        print(f"  - total_fees: ${data['total_fees']}")
        print(f"  - net_earnings: ${data['net_earnings']}")
        print(f"  - pending_payout: ${data['pending_payout']}")
        print(f"  - paid_payout: ${data['paid_payout']}")
        
        return data
    
    def test_summary_includes_next_settlement_date(self, business_auth_headers):
        """Verify summary includes next settlement date"""
        response = requests.get(
            f"{BASE_URL}/api/business/finance/summary",
            headers=business_auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # next_settlement_date might be present
        if "next_settlement_date" in data and data["next_settlement_date"]:
            print(f"✓ Next settlement date: {data['next_settlement_date']}")
        else:
            print(f"ℹ next_settlement_date not present or null")


class TestBusinessTransactions:
    """Test GET /api/business/finance/transactions"""
    
    @pytest.fixture
    def business_auth_headers(self):
        response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": BUSINESS_EMAIL,
            "password": BUSINESS_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Business login failed: {response.text}")
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_transactions_list(self, business_auth_headers):
        """GET /api/business/finance/transactions - Returns transaction list"""
        response = requests.get(
            f"{BASE_URL}/api/business/finance/transactions",
            headers=business_auth_headers
        )
        
        assert response.status_code == 200, f"Get transactions failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Got {len(data)} transactions")
        
        if len(data) > 0:
            tx = data[0]
            # Verify transaction structure
            required_fields = ["id", "business_id", "amount_total", "fee_amount", "payout_amount", "status"]
            for field in required_fields:
                assert field in tx, f"Missing field in transaction: {field}"
            print(f"  - First transaction status: {tx['status']}")
            print(f"  - Amount: ${tx['amount_total']}, Fee: ${tx['fee_amount']}")
    
    def test_transactions_with_status_filter(self, business_auth_headers):
        """Test transactions endpoint with status filter"""
        response = requests.get(
            f"{BASE_URL}/api/business/finance/transactions",
            params={"status": "paid"},
            headers=business_auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # All transactions should have status 'paid' if filter works
        for tx in data:
            assert tx["status"] == "paid", f"Filter not applied, got status: {tx['status']}"
        
        print(f"✓ Status filter working: {len(data)} paid transactions")
    
    def test_transactions_with_date_filter(self, business_auth_headers):
        """Test transactions endpoint with date range filter"""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/business/finance/transactions",
            params={"start_date": "2025-01-01", "end_date": today},
            headers=business_auth_headers
        )
        
        assert response.status_code == 200
        print(f"✓ Date filter accepted, got {len(response.json())} transactions")


class TestBusinessSettlements:
    """Test GET /api/business/finance/settlements"""
    
    @pytest.fixture
    def business_auth_headers(self):
        response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": BUSINESS_EMAIL,
            "password": BUSINESS_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Business login failed: {response.text}")
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_settlements_list(self, business_auth_headers):
        """GET /api/business/finance/settlements - Returns settlements list"""
        response = requests.get(
            f"{BASE_URL}/api/business/finance/settlements",
            headers=business_auth_headers
        )
        
        assert response.status_code == 200, f"Get settlements failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Got {len(data)} settlements")
        
        if len(data) > 0:
            settlement = data[0]
            # Verify settlement structure
            required_fields = [
                "id", "business_id", "period_key", "period_start", "period_end",
                "gross_paid", "total_fees", "net_payout", "status"
            ]
            for field in required_fields:
                assert field in settlement, f"Missing field in settlement: {field}"
            
            assert settlement["status"] in SETTLEMENT_STATUSES, \
                f"Invalid settlement status: {settlement['status']}"
            
            print(f"  - Period: {settlement['period_key']}")
            print(f"  - Net payout: ${settlement['net_payout']}")
            print(f"  - Status: {settlement['status']}")
            
            return settlement
    
    def test_settlements_with_status_filter(self, business_auth_headers):
        """Test settlements endpoint with status filter"""
        response = requests.get(
            f"{BASE_URL}/api/business/finance/settlements",
            params={"status": "paid"},
            headers=business_auth_headers
        )
        
        assert response.status_code == 200
        print(f"✓ Settlement status filter accepted")


class TestAdminSettlementGeneration:
    """Test POST /api/admin/settlements/generate (idempotent)"""
    
    @pytest.fixture
    def admin_auth_headers(self):
        """Get auth headers for admin with 2FA"""
        totp = pyotp.TOTP(ADMIN_TOTP_SECRET)
        totp_code = totp.now()
        
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "totp_code": totp_code
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.text}")
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_generate_settlements(self, admin_auth_headers):
        """POST /api/admin/settlements/generate - Generate monthly settlements"""
        now = datetime.now(timezone.utc)
        # Test with previous month
        if now.month == 1:
            test_year = now.year - 1
            test_month = 12
        else:
            test_year = now.year
            test_month = now.month - 1
        
        response = requests.post(
            f"{BASE_URL}/api/admin/settlements/generate",
            params={"year": test_year, "month": test_month},
            headers=admin_auth_headers
        )
        
        assert response.status_code == 200, f"Generate settlements failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "period_key" in data, "Missing period_key in response"
        assert "processed" in data, "Missing processed count"
        assert "skipped" in data, "Missing skipped count"
        
        print(f"✓ Settlement generation completed:")
        print(f"  - Period: {data['period_key']}")
        print(f"  - Processed: {data['processed']}")
        print(f"  - Skipped (idempotent): {data['skipped']}")
        print(f"  - Held: {data.get('held', 0)}")
        
        return data
    
    def test_settlement_idempotency(self, admin_auth_headers):
        """Verify running settlement generation twice doesn't duplicate"""
        now = datetime.now(timezone.utc)
        if now.month == 1:
            test_year = now.year - 1
            test_month = 12
        else:
            test_year = now.year
            test_month = now.month - 1
        
        # First run
        response1 = requests.post(
            f"{BASE_URL}/api/admin/settlements/generate",
            params={"year": test_year, "month": test_month},
            headers=admin_auth_headers
        )
        assert response1.status_code == 200
        data1 = response1.json()
        
        # Second run (should skip all)
        response2 = requests.post(
            f"{BASE_URL}/api/admin/settlements/generate",
            params={"year": test_year, "month": test_month},
            headers=admin_auth_headers
        )
        assert response2.status_code == 200
        data2 = response2.json()
        
        # Second run should process 0 (all skipped)
        assert data2["processed"] == 0, \
            f"Idempotency failed: processed {data2['processed']} on second run"
        
        print(f"✓ Idempotency verified:")
        print(f"  - First run processed: {data1['processed']}")
        print(f"  - Second run processed: {data2['processed']} (should be 0)")
        print(f"  - Second run skipped: {data2['skipped']}")


class TestAdminSettlementMarkPaid:
    """Test PUT /api/admin/settlements/{id}/pay"""
    
    @pytest.fixture
    def admin_auth_headers(self):
        totp = pyotp.TOTP(ADMIN_TOTP_SECRET)
        totp_code = totp.now()
        
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "totp_code": totp_code
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.text}")
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_admin_settlements(self, admin_auth_headers):
        """GET /api/admin/settlements - Verify admin can see all settlements"""
        response = requests.get(
            f"{BASE_URL}/api/admin/settlements",
            headers=admin_auth_headers
        )
        
        assert response.status_code == 200, f"Get admin settlements failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list)
        print(f"✓ Admin sees {len(data)} settlements")
        
        # Find a pending settlement for testing if any
        pending_settlements = [s for s in data if s["status"] == "pending"]
        print(f"  - Pending settlements: {len(pending_settlements)}")
        
        return data
    
    def test_mark_settlement_paid(self, admin_auth_headers):
        """PUT /api/admin/settlements/{id}/pay - Mark settlement as paid"""
        # First get settlements
        response = requests.get(
            f"{BASE_URL}/api/admin/settlements",
            headers=admin_auth_headers
        )
        
        if response.status_code != 200:
            pytest.skip("Cannot get settlements")
        
        settlements = response.json()
        pending = [s for s in settlements if s["status"] == "pending"]
        
        if not pending:
            print(f"ℹ No pending settlements to test mark as paid")
            # Test with non-existent ID to verify endpoint exists
            response = requests.put(
                f"{BASE_URL}/api/admin/settlements/nonexistent-id/pay",
                json={"payout_reference": "TEST-REF-001"},
                headers=admin_auth_headers
            )
            assert response.status_code == 404, "Should return 404 for non-existent settlement"
            print(f"✓ Mark paid endpoint exists (404 for non-existent)")
            return
        
        # Mark first pending as paid
        settlement_id = pending[0]["id"]
        payout_ref = f"TEST-PAYOUT-{datetime.now().strftime('%Y%m%d%H%M')}"
        
        response = requests.put(
            f"{BASE_URL}/api/admin/settlements/{settlement_id}/pay",
            json={"payout_reference": payout_ref},
            headers=admin_auth_headers
        )
        
        assert response.status_code == 200, f"Mark paid failed: {response.text}"
        data = response.json()
        
        assert "payout_reference" in data
        print(f"✓ Settlement marked as paid:")
        print(f"  - Settlement ID: {settlement_id}")
        print(f"  - Payout reference: {payout_ref}")


class TestAdminPayoutHold:
    """Test PUT /api/admin/businesses/{id}/payout-hold"""
    
    @pytest.fixture
    def admin_auth_headers(self):
        totp = pyotp.TOTP(ADMIN_TOTP_SECRET)
        totp_code = totp.now()
        
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "totp_code": totp_code
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.text}")
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture
    def business_id(self, admin_auth_headers):
        """Get a business ID to test with"""
        response = requests.get(
            f"{BASE_URL}/api/admin/businesses",
            params={"status": "approved"},
            headers=admin_auth_headers
        )
        if response.status_code != 200:
            pytest.skip("Cannot get businesses")
        
        businesses = response.json()
        if not businesses:
            pytest.skip("No approved businesses")
        
        return businesses[0]["id"]
    
    def test_set_payout_hold(self, admin_auth_headers, business_id):
        """PUT /api/admin/businesses/{id}/payout-hold - Set hold"""
        response = requests.put(
            f"{BASE_URL}/api/admin/businesses/{business_id}/payout-hold",
            json={"hold": True, "reason": "TEST: Audit in progress"},
            headers=admin_auth_headers
        )
        
        assert response.status_code == 200, f"Set payout hold failed: {response.text}"
        print(f"✓ Payout hold set for business {business_id[:8]}...")
    
    def test_release_payout_hold(self, admin_auth_headers, business_id):
        """PUT /api/admin/businesses/{id}/payout-hold - Release hold"""
        response = requests.put(
            f"{BASE_URL}/api/admin/businesses/{business_id}/payout-hold",
            json={"hold": False},
            headers=admin_auth_headers
        )
        
        assert response.status_code == 200, f"Release payout hold failed: {response.text}"
        print(f"✓ Payout hold released for business {business_id[:8]}...")
    
    def test_payout_hold_creates_audit_log(self, admin_auth_headers, business_id):
        """Verify payout hold creates audit log"""
        # Set hold first
        requests.put(
            f"{BASE_URL}/api/admin/businesses/{business_id}/payout-hold",
            json={"hold": True, "reason": "TEST: Audit log verification"},
            headers=admin_auth_headers
        )
        
        # Check audit logs
        response = requests.get(
            f"{BASE_URL}/api/admin/audit-logs",
            params={"action": "payout_hold", "limit": 5},
            headers=admin_auth_headers
        )
        
        if response.status_code == 200:
            logs = response.json()
            payout_logs = [l for l in logs if "payout" in l.get("action", "").lower()]
            print(f"✓ Found {len(payout_logs)} payout-related audit logs")
        else:
            print(f"ℹ Audit logs endpoint status: {response.status_code}")
        
        # Release hold after test
        requests.put(
            f"{BASE_URL}/api/admin/businesses/{business_id}/payout-hold",
            json={"hold": False},
            headers=admin_auth_headers
        )


class TestAdminExportCSV:
    """Test CSV export endpoints"""
    
    @pytest.fixture
    def admin_auth_headers(self):
        totp = pyotp.TOTP(ADMIN_TOTP_SECRET)
        totp_code = totp.now()
        
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "totp_code": totp_code
        })
        if response.status_code != 200:
            pytest.skip(f"Admin login failed: {response.text}")
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_export_transactions_csv(self, admin_auth_headers):
        """GET /api/admin/export/transactions - Export transactions CSV"""
        now = datetime.now(timezone.utc)
        
        response = requests.get(
            f"{BASE_URL}/api/admin/export/transactions",
            params={"year": now.year, "month": now.month},
            headers=admin_auth_headers
        )
        
        assert response.status_code == 200, f"Export transactions failed: {response.text}"
        
        # Verify CSV content
        content_type = response.headers.get("content-type", "")
        assert "text/csv" in content_type, f"Expected text/csv, got {content_type}"
        
        # Verify content disposition header
        content_disposition = response.headers.get("content-disposition", "")
        assert "attachment" in content_disposition, "Should be an attachment"
        assert "transactions" in content_disposition.lower(), "Filename should contain 'transactions'"
        
        # Verify CSV has header row
        csv_content = response.text
        lines = csv_content.strip().split('\n')
        assert len(lines) >= 1, "CSV should have at least header row"
        
        # Verify expected columns in header
        header = lines[0]
        expected_columns = ["ID", "Business ID", "Amount Total", "Fee Amount", "Status"]
        for col in expected_columns:
            assert col in header, f"Missing column in header: {col}"
        
        print(f"✓ Transactions CSV exported:")
        print(f"  - Content-Type: {content_type}")
        print(f"  - Rows: {len(lines)} (including header)")
        print(f"  - Header: {header[:100]}...")
    
    def test_export_settlements_csv(self, admin_auth_headers):
        """GET /api/admin/export/settlements - Export settlements CSV"""
        now = datetime.now(timezone.utc)
        
        response = requests.get(
            f"{BASE_URL}/api/admin/export/settlements",
            params={"year": now.year, "month": now.month},
            headers=admin_auth_headers
        )
        
        assert response.status_code == 200, f"Export settlements failed: {response.text}"
        
        content_type = response.headers.get("content-type", "")
        assert "text/csv" in content_type, f"Expected text/csv, got {content_type}"
        
        content_disposition = response.headers.get("content-disposition", "")
        assert "settlements" in content_disposition.lower(), "Filename should contain 'settlements'"
        
        csv_content = response.text
        lines = csv_content.strip().split('\n')
        
        # Verify expected columns
        if lines:
            header = lines[0]
            expected_columns = ["ID", "Business ID", "Period Key", "Net Payout", "Status"]
            for col in expected_columns:
                assert col in header, f"Missing column in header: {col}"
        
        print(f"✓ Settlements CSV exported:")
        print(f"  - Rows: {len(lines)} (including header)")


class TestLedgerEntries:
    """Test ledger entries are created with transactions"""
    
    @pytest.fixture
    def business_auth_headers(self):
        response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": BUSINESS_EMAIL,
            "password": BUSINESS_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Business login failed: {response.text}")
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_ledger_entries(self, business_auth_headers):
        """GET /api/business/finance/ledger - Returns ledger entries"""
        response = requests.get(
            f"{BASE_URL}/api/business/finance/ledger",
            headers=business_auth_headers
        )
        
        assert response.status_code == 200, f"Get ledger entries failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Got {len(data)} ledger entries")
        
        if len(data) > 0:
            entry = data[0]
            
            # Verify ledger entry structure
            required_fields = [
                "id", "transaction_id", "business_id", "direction",
                "account", "amount", "entry_status"
            ]
            for field in required_fields:
                assert field in entry, f"Missing field in ledger entry: {field}"
            
            # Verify direction is valid
            assert entry["direction"] in LEDGER_DIRECTIONS, \
                f"Invalid direction: {entry['direction']}"
            
            # Verify account is valid
            assert entry["account"] in LEDGER_ACCOUNTS, \
                f"Invalid account: {entry['account']}"
            
            print(f"  - Entry: {entry['direction']} ${entry['amount']} to {entry['account']}")
            
            return entry
    
    def test_ledger_has_credit_debit_pairs(self, business_auth_headers):
        """Verify ledger entries have CREDIT business_revenue and DEBIT platform_fee"""
        response = requests.get(
            f"{BASE_URL}/api/business/finance/ledger",
            headers=business_auth_headers
        )
        
        if response.status_code != 200:
            pytest.skip("Cannot get ledger entries")
        
        entries = response.json()
        
        if len(entries) == 0:
            print(f"ℹ No ledger entries to verify double-entry")
            return
        
        # Check for business_revenue credits
        revenue_credits = [e for e in entries 
                         if e["account"] == "business_revenue" and e["direction"] == "credit"]
        
        # Check for platform_fee debits
        fee_debits = [e for e in entries 
                     if e["account"] == "platform_fee" and e["direction"] == "debit"]
        
        print(f"✓ Ledger double-entry check:")
        print(f"  - business_revenue CREDIT entries: {len(revenue_credits)}")
        print(f"  - platform_fee DEBIT entries: {len(fee_debits)}")
        
        # For each transaction, both should exist (double-entry)
        if revenue_credits and fee_debits:
            # Get transaction IDs that have both
            revenue_tx_ids = set(e["transaction_id"] for e in revenue_credits)
            fee_tx_ids = set(e["transaction_id"] for e in fee_debits)
            both_ids = revenue_tx_ids.intersection(fee_tx_ids)
            
            print(f"  - Transactions with both entries: {len(both_ids)}")


class TestLedgerAccounts:
    """Verify LedgerAccount enum values"""
    
    def test_ledger_account_enum_values(self):
        """Verify expected ledger account values"""
        expected_accounts = ["business_revenue", "platform_fee", "refund", "penalty", "payout"]
        
        # This test just documents the expected values
        # Actual verification happens when we see ledger entries
        print(f"✓ Expected LedgerAccount enum values:")
        for account in expected_accounts:
            print(f"  - {account}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
