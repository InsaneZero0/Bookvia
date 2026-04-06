"""
Test Password Reset Feature - Bookvia
Tests for forgot-password and reset-password endpoints
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://marketplace-test-21.preview.emergentagent.com').rstrip('/')

# Test credentials
TEST_USER_EMAIL = "testverify@bookvia.com"
BUSINESS_EMAIL = "testrealstripe@bookvia.com"
BUSINESS_PASSWORD = "Test1234!"


class TestPasswordResetBackend:
    """Backend API tests for password reset feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    # ==================== FORGOT PASSWORD TESTS ====================
    
    def test_forgot_password_existing_email(self):
        """POST /api/auth/forgot-password with existing email returns generic message and generates token"""
        response = self.session.post(f"{BASE_URL}/api/auth/forgot-password", json={
            "email": TEST_USER_EMAIL
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should return generic message (doesn't reveal if email exists)
        assert "message" in data
        assert "instrucciones" in data["message"].lower() or "correo" in data["message"].lower()
        print(f"✓ Forgot password with existing email returns: {data['message']}")
    
    def test_forgot_password_nonexistent_email(self):
        """POST /api/auth/forgot-password with non-existent email returns same generic message (security)"""
        fake_email = f"nonexistent_{uuid.uuid4().hex[:8]}@bookvia.com"
        response = self.session.post(f"{BASE_URL}/api/auth/forgot-password", json={
            "email": fake_email
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should return same generic message (doesn't reveal if email exists)
        assert "message" in data
        assert "instrucciones" in data["message"].lower() or "correo" in data["message"].lower()
        print(f"✓ Forgot password with non-existent email returns same generic message: {data['message']}")
    
    def test_forgot_password_empty_email(self):
        """POST /api/auth/forgot-password with empty email returns 400"""
        response = self.session.post(f"{BASE_URL}/api/auth/forgot-password", json={
            "email": ""
        })
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("✓ Forgot password with empty email returns 400")
    
    def test_forgot_password_no_email(self):
        """POST /api/auth/forgot-password without email field returns 400"""
        response = self.session.post(f"{BASE_URL}/api/auth/forgot-password", json={})
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("✓ Forgot password without email field returns 400")
    
    # ==================== RESET PASSWORD TESTS ====================
    
    def test_reset_password_invalid_token(self):
        """POST /api/auth/reset-password with invalid token returns 400"""
        response = self.session.post(f"{BASE_URL}/api/auth/reset-password", json={
            "token": "invalid-token-12345",
            "password": "NewPassword123!"
        })
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data
        print(f"✓ Reset password with invalid token returns 400: {data['detail']}")
    
    def test_reset_password_short_password(self):
        """POST /api/auth/reset-password with password < 6 chars returns 400"""
        response = self.session.post(f"{BASE_URL}/api/auth/reset-password", json={
            "token": "some-token",
            "password": "12345"  # Only 5 chars
        })
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data
        # Should mention password length
        assert "6" in data["detail"] or "caracteres" in data["detail"].lower()
        print(f"✓ Reset password with short password returns 400: {data['detail']}")
    
    def test_reset_password_missing_token(self):
        """POST /api/auth/reset-password without token returns 400"""
        response = self.session.post(f"{BASE_URL}/api/auth/reset-password", json={
            "password": "NewPassword123!"
        })
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("✓ Reset password without token returns 400")
    
    def test_reset_password_missing_password(self):
        """POST /api/auth/reset-password without password returns 400"""
        response = self.session.post(f"{BASE_URL}/api/auth/reset-password", json={
            "token": "some-token"
        })
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("✓ Reset password without password returns 400")
    
    # ==================== BUSINESS LOGIN STILL WORKS ====================
    
    def test_business_login_still_works(self):
        """POST /api/auth/business/login with business credentials still works"""
        response = self.session.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": BUSINESS_EMAIL,
            "password": BUSINESS_PASSWORD
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "token" in data
        assert "business" in data
        print(f"✓ Business login still works for {BUSINESS_EMAIL}")


class TestPasswordResetFullFlow:
    """
    Full flow test: forgot-password → get token from DB → reset-password → login with new password
    This requires MongoDB access to get the reset token
    """
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_full_reset_flow_with_db_token(self):
        """
        Full password reset flow:
        1. Create test user
        2. Call forgot-password
        3. Get token from DB
        4. Call reset-password with valid token
        5. Login with new password works
        6. Login with old password fails
        7. Token cannot be reused
        """
        import pymongo
        
        # Connect to MongoDB
        mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
        db_name = os.environ.get('DB_NAME', 'test_database')
        client = pymongo.MongoClient(mongo_url)
        db = client[db_name]
        
        # Create unique test user
        test_email = f"testreset_{uuid.uuid4().hex[:8]}@bookvia.com"
        old_password = "OldPassword123!"
        new_password = "NewPassword456!"
        
        # Register test user
        register_response = self.session.post(f"{BASE_URL}/api/auth/register", json={
            "email": test_email,
            "password": old_password,
            "full_name": "Test Reset User",
            "phone": "+521234567890"
        })
        
        if register_response.status_code != 200:
            pytest.skip(f"Could not create test user: {register_response.text}")
        
        # Mark email as verified so we can test login
        db.users.update_one({"email": test_email}, {"$set": {"email_verified": True}})
        
        print(f"✓ Created test user: {test_email}")
        
        # Step 1: Call forgot-password
        forgot_response = self.session.post(f"{BASE_URL}/api/auth/forgot-password", json={
            "email": test_email
        })
        assert forgot_response.status_code == 200
        print("✓ Called forgot-password endpoint")
        
        # Step 2: Get token from DB
        user = db.users.find_one({"email": test_email})
        assert user is not None, "User not found in DB"
        reset_token = user.get("password_reset_token")
        assert reset_token is not None, "Reset token not generated"
        print(f"✓ Got reset token from DB: {reset_token[:8]}...")
        
        # Step 3: Reset password with valid token
        reset_response = self.session.post(f"{BASE_URL}/api/auth/reset-password", json={
            "token": reset_token,
            "password": new_password
        })
        assert reset_response.status_code == 200, f"Reset failed: {reset_response.text}"
        print("✓ Password reset successful")
        
        # Step 4: Login with new password works
        login_new_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": test_email,
            "password": new_password
        })
        assert login_new_response.status_code == 200, f"Login with new password failed: {login_new_response.text}"
        print("✓ Login with new password works")
        
        # Step 5: Login with old password fails
        login_old_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": test_email,
            "password": old_password
        })
        assert login_old_response.status_code == 401, f"Login with old password should fail, got {login_old_response.status_code}"
        print("✓ Login with old password fails (as expected)")
        
        # Step 6: Token cannot be reused
        reuse_response = self.session.post(f"{BASE_URL}/api/auth/reset-password", json={
            "token": reset_token,
            "password": "AnotherPassword789!"
        })
        assert reuse_response.status_code == 400, f"Token reuse should fail, got {reuse_response.status_code}"
        print("✓ Token cannot be reused (as expected)")
        
        # Cleanup: Delete test user
        db.users.delete_one({"email": test_email})
        print(f"✓ Cleaned up test user: {test_email}")
        
        client.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
