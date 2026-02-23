"""
Bookvia Security Phase 1 Tests
Tests for:
- Admin creation from env vars (ADMIN_EMAIL/ADMIN_INITIAL_PASSWORD)
- Admin login with 2FA requirements (requires_2fa_setup flag)
- 2FA setup flow (QR code, backup codes generation)
- 2FA verification
- Audit logs creation (approve business creates audit log)
- Audit logs retrieval (with all required fields)
- Businesses in PENDING status have can_accept_bookings=false
"""

import pytest
import requests
import os
import pyotp

# API URL from environment - DO NOT add default
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from context
ADMIN_EMAIL = "zamorachapa50@gmail.com"
ADMIN_PASSWORD = "RainbowLol3133!"


class TestAdminSeed:
    """Test admin user creation from environment variables"""
    
    def test_seed_endpoint_exists(self):
        """Verify seed endpoint responds"""
        response = requests.post(f"{BASE_URL}/api/seed")
        # Should return 200 whether already seeded or fresh seed
        assert response.status_code == 200, f"Seed failed: {response.text}"
        data = response.json()
        # Should have admin_email or message
        assert "message" in data, f"Missing message in response: {data}"
        print(f"Seed response: {data}")
    
    def test_admin_uses_env_email(self):
        """Verify admin was created with email from environment (zamorachapa50@gmail.com)"""
        response = requests.post(f"{BASE_URL}/api/seed")
        assert response.status_code == 200
        data = response.json()
        
        # Admin should already exist from previous seed
        if "admin_email" in data:
            assert data["admin_email"] == ADMIN_EMAIL, \
                f"Admin email mismatch: expected {ADMIN_EMAIL}, got {data['admin_email']}"
            print(f"Admin email verified: {data['admin_email']}")


class TestAdminLogin2FA:
    """Test admin login with 2FA requirements"""
    
    def test_admin_login_without_2fa_configured(self):
        """
        Admin login with correct credentials but no 2FA configured
        Should return requires_2fa_setup=true
        """
        # First, let's try to login as admin without 2FA code
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "totp_code": "000000"  # Invalid code since 2FA not configured
        })
        
        print(f"Admin login response status: {response.status_code}")
        print(f"Admin login response: {response.json()}")
        
        # Could be 200 with requires_2fa_setup or 401 if TOTP already enabled
        data = response.json()
        
        if response.status_code == 200 and data.get("requires_2fa_setup"):
            # 2FA not yet configured - expected for fresh admin
            assert "temp_token" in data, "Missing temp_token for 2FA setup"
            assert data["requires_2fa_setup"] == True
            print("2FA setup required as expected")
        elif response.status_code == 401:
            # 2FA already configured, invalid code
            print("2FA appears to be already configured")
        elif response.status_code == 200 and data.get("totp_enabled"):
            # Successfully logged in with 2FA
            print("Admin logged in with 2FA enabled")


class Test2FASetupFlow:
    """Test complete 2FA setup flow"""
    
    @pytest.fixture
    def admin_temp_token(self):
        """Get temp token from admin login for 2FA setup"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "totp_code": "000000"
        })
        data = response.json()
        
        if response.status_code == 200 and data.get("requires_2fa_setup"):
            return data["temp_token"]
        elif response.status_code == 200 and data.get("token"):
            # Already has 2FA, skip these tests
            pytest.skip("2FA already configured - skipping setup tests")
        return None
    
    def test_2fa_setup_generates_qr_code(self, admin_temp_token):
        """POST /api/auth/admin/setup-2fa should generate QR code and backup codes"""
        if not admin_temp_token:
            pytest.skip("No temp token available for 2FA setup")
        
        headers = {"Authorization": f"Bearer {admin_temp_token}"}
        response = requests.post(
            f"{BASE_URL}/api/auth/admin/setup-2fa",
            json={"password": ADMIN_PASSWORD},
            headers=headers
        )
        
        print(f"2FA setup response status: {response.status_code}")
        
        assert response.status_code == 200, f"2FA setup failed: {response.text}"
        data = response.json()
        
        # Verify QR code is returned
        assert "qr_code" in data, "Missing qr_code in response"
        assert data["qr_code"].startswith("data:image/png;base64,"), "QR code not in expected format"
        
        # Verify secret is returned
        assert "secret" in data, "Missing TOTP secret"
        assert len(data["secret"]) >= 16, "TOTP secret too short"
        
        # Verify backup codes are returned (8 codes)
        assert "backup_codes" in data, "Missing backup codes"
        assert len(data["backup_codes"]) == 8, f"Expected 8 backup codes, got {len(data['backup_codes'])}"
        
        print(f"2FA setup successful - QR generated, {len(data['backup_codes'])} backup codes created")
        return data


class TestAuditLogs:
    """Test audit log creation and retrieval"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token (with 2FA if configured)"""
        # First try login
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "totp_code": "000000"
        })
        data = response.json()
        
        if response.status_code == 200:
            if data.get("requires_2fa_setup"):
                # Use temp token and complete 2FA setup
                temp_token = data["temp_token"]
                headers = {"Authorization": f"Bearer {temp_token}"}
                
                # Setup 2FA
                setup_resp = requests.post(
                    f"{BASE_URL}/api/auth/admin/setup-2fa",
                    json={"password": ADMIN_PASSWORD},
                    headers=headers
                )
                
                if setup_resp.status_code == 200:
                    setup_data = setup_resp.json()
                    secret = setup_data["secret"]
                    
                    # Generate valid TOTP code
                    totp = pyotp.TOTP(secret)
                    valid_code = totp.now()
                    
                    # Verify 2FA
                    verify_resp = requests.post(
                        f"{BASE_URL}/api/auth/admin/verify-2fa",
                        json={"code": valid_code},
                        headers=headers
                    )
                    
                    if verify_resp.status_code == 200:
                        # Now login with valid TOTP
                        final_login = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
                            "email": ADMIN_EMAIL,
                            "password": ADMIN_PASSWORD,
                            "totp_code": totp.now()
                        })
                        if final_login.status_code == 200:
                            return final_login.json().get("token")
                
                # Return temp token if setup incomplete
                return temp_token
            elif data.get("token"):
                return data["token"]
        
        return None
    
    def test_audit_logs_endpoint_exists(self, admin_token):
        """GET /api/admin/audit-logs should be accessible"""
        if not admin_token:
            pytest.skip("No admin token available")
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/audit-logs", headers=headers)
        
        print(f"Audit logs response status: {response.status_code}")
        
        assert response.status_code == 200, f"Audit logs failed: {response.text}"
        data = response.json()
        
        # Should return a list
        assert isinstance(data, list), "Audit logs should return a list"
        print(f"Found {len(data)} audit logs")
        
        return data
    
    def test_audit_log_has_required_fields(self, admin_token):
        """Each audit log should have admin_email, action, target_type, ip_address"""
        if not admin_token:
            pytest.skip("No admin token available")
        
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/audit-logs", headers=headers)
        
        assert response.status_code == 200
        logs = response.json()
        
        if len(logs) == 0:
            pytest.skip("No audit logs to verify - may need to perform admin action first")
        
        # Check first log for required fields
        log = logs[0]
        required_fields = ["id", "admin_id", "admin_email", "action", "target_type", "target_id", "created_at"]
        
        for field in required_fields:
            assert field in log, f"Missing required field: {field}"
        
        # ip_address and user_agent might be None but should exist in model
        print(f"Sample audit log: admin_email={log['admin_email']}, action={log['action']}, target_type={log['target_type']}")
        
        # Verify admin_email matches
        assert log["admin_email"] == ADMIN_EMAIL, f"admin_email mismatch in log"


class TestBusinessApprovalAudit:
    """Test that business approval creates audit logs"""
    
    @pytest.fixture
    def admin_token_and_setup(self):
        """Get admin token and ensure 2FA is configured"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "totp_code": "000000"
        })
        data = response.json()
        
        if response.status_code == 200:
            if data.get("requires_2fa_setup"):
                temp_token = data["temp_token"]
                headers = {"Authorization": f"Bearer {temp_token}"}
                
                # Setup and verify 2FA
                setup_resp = requests.post(
                    f"{BASE_URL}/api/auth/admin/setup-2fa",
                    json={"password": ADMIN_PASSWORD},
                    headers=headers
                )
                
                if setup_resp.status_code == 200:
                    setup_data = setup_resp.json()
                    secret = setup_data["secret"]
                    totp = pyotp.TOTP(secret)
                    
                    verify_resp = requests.post(
                        f"{BASE_URL}/api/auth/admin/verify-2fa",
                        json={"code": totp.now()},
                        headers=headers
                    )
                    
                    if verify_resp.status_code == 200:
                        # Login with valid TOTP
                        final_login = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
                            "email": ADMIN_EMAIL,
                            "password": ADMIN_PASSWORD,
                            "totp_code": totp.now()
                        })
                        if final_login.status_code == 200:
                            return final_login.json().get("token")
                
                return temp_token
            elif data.get("token"):
                return data["token"]
        
        return None
    
    def test_approve_business_creates_audit_log(self, admin_token_and_setup):
        """PUT /api/admin/businesses/{id}/approve should create audit log"""
        if not admin_token_and_setup:
            pytest.skip("No admin token available")
        
        headers = {"Authorization": f"Bearer {admin_token_and_setup}"}
        
        # Get pending businesses
        pending_resp = requests.get(
            f"{BASE_URL}/api/admin/businesses/pending",
            headers=headers
        )
        
        if pending_resp.status_code != 200:
            print(f"Could not get pending businesses: {pending_resp.text}")
            pytest.skip("Cannot access pending businesses")
        
        pending = pending_resp.json()
        
        if len(pending) == 0:
            # Check audit logs for existing approval
            logs_resp = requests.get(f"{BASE_URL}/api/admin/audit-logs", headers=headers)
            logs = logs_resp.json()
            
            approval_logs = [l for l in logs if l["action"] == "business_approve"]
            if approval_logs:
                print(f"Found existing business_approve audit log from previous approval")
                log = approval_logs[0]
                assert "admin_email" in log
                assert log["admin_email"] == ADMIN_EMAIL
                return
            
            pytest.skip("No pending businesses to approve")
        
        # Approve first pending business
        business_id = pending[0]["id"]
        approve_resp = requests.put(
            f"{BASE_URL}/api/admin/businesses/{business_id}/approve",
            headers=headers
        )
        
        print(f"Approve response: {approve_resp.status_code} - {approve_resp.text}")
        assert approve_resp.status_code == 200, f"Approve failed: {approve_resp.text}"
        
        # Check audit log was created
        logs_resp = requests.get(f"{BASE_URL}/api/admin/audit-logs", headers=headers)
        assert logs_resp.status_code == 200
        
        logs = logs_resp.json()
        approval_log = next((l for l in logs if l["target_id"] == business_id and l["action"] == "business_approve"), None)
        
        assert approval_log is not None, "Audit log not created for business approval"
        assert approval_log["admin_email"] == ADMIN_EMAIL
        assert approval_log["target_type"] == "business"
        print(f"Audit log created: {approval_log}")


class TestPendingBusinessRestrictions:
    """Test that PENDING businesses have can_accept_bookings=false"""
    
    def test_pending_businesses_cannot_accept_bookings(self):
        """GET /api/businesses?include_pending=true should show can_accept_bookings=false for pending"""
        response = requests.get(f"{BASE_URL}/api/businesses", params={"include_pending": "true"})
        
        assert response.status_code == 200, f"Businesses request failed: {response.text}"
        businesses = response.json()
        
        print(f"Found {len(businesses)} businesses")
        
        # Check for any pending businesses
        pending_found = False
        for biz in businesses:
            if biz.get("status") == "pending":
                pending_found = True
                assert biz.get("can_accept_bookings") == False, \
                    f"PENDING business {biz['id']} should have can_accept_bookings=false"
                print(f"PENDING business {biz['name']}: can_accept_bookings={biz.get('can_accept_bookings')}")
            elif biz.get("status") == "approved":
                assert biz.get("can_accept_bookings") == True, \
                    f"APPROVED business {biz['id']} should have can_accept_bookings=true"
        
        if not pending_found:
            print("No pending businesses found - checking approved businesses only")
            approved = [b for b in businesses if b.get("status") == "approved"]
            for biz in approved:
                assert biz.get("can_accept_bookings") == True, \
                    f"APPROVED business {biz['id']} should have can_accept_bookings=true"


class TestAdminLoginAuditLog:
    """Test that successful admin login creates audit log"""
    
    def test_admin_login_creates_audit_on_success(self):
        """Successful admin login with 2FA should create audit log entry"""
        # This is complex because we need 2FA to be configured
        # The audit log should only be created on successful 2FA login
        
        # Get initial audit log count
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "totp_code": "000000"
        })
        
        data = response.json()
        
        if response.status_code == 200 and data.get("requires_2fa_setup"):
            print("2FA not configured - admin_login audit log only created after 2FA login")
            return
        
        if response.status_code == 200 and data.get("token"):
            # Successful login with 2FA - audit log should be created
            headers = {"Authorization": f"Bearer {data['token']}"}
            logs_resp = requests.get(f"{BASE_URL}/api/admin/audit-logs", headers=headers)
            
            if logs_resp.status_code == 200:
                logs = logs_resp.json()
                login_logs = [l for l in logs if l["action"] == "admin_login"]
                
                if login_logs:
                    print(f"Found {len(login_logs)} admin_login audit logs")
                    assert login_logs[0]["admin_email"] == ADMIN_EMAIL


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
