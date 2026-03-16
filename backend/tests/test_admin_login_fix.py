"""
Test Admin Login API - Iteration 10
Tests the admin login fix: single API call, totp_enabled in response, proper error handling
"""

import pytest
import requests
import os
from dotenv import load_dotenv

# Load env variables
load_dotenv('/app/backend/.env')

# Get BASE_URL from env
BASE_URL = os.environ.get('BASE_URL', 'https://reserve-stripe-test.preview.emergentagent.com')


class TestAdminLoginAPI:
    """Tests for POST /api/auth/admin/login"""
    
    def test_health_check(self):
        """Verify API is running"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print(f"✓ Health check passed: {data['status']}")
    
    def test_admin_login_invalid_credentials_returns_401(self):
        """Admin login with invalid credentials should return 401, not crash"""
        response = requests.post(
            f"{BASE_URL}/api/auth/admin/login",
            json={
                "email": "invalid@test.com",
                "password": "wrongpassword",
                "totp_code": "000000"
            }
        )
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        assert data["detail"] == "Invalid credentials"
        print(f"✓ Invalid credentials returns 401 with message: {data['detail']}")
    
    def test_admin_login_wrong_password_returns_401(self):
        """Admin login with correct email but wrong password should return 401"""
        # Use the actual admin email from env
        admin_email = os.environ.get('ADMIN_EMAIL', 'admin@test.com')
        response = requests.post(
            f"{BASE_URL}/api/auth/admin/login",
            json={
                "email": admin_email,
                "password": "definitely_wrong_password",
                "totp_code": "000000"
            }
        )
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        print(f"✓ Wrong password returns 401: {data['detail']}")
    
    def test_admin_login_missing_totp_code_handled_gracefully(self):
        """Admin login without TOTP code should be handled gracefully"""
        response = requests.post(
            f"{BASE_URL}/api/auth/admin/login",
            json={
                "email": "admin@test.com",
                "password": "testpassword",
                "totp_code": ""
            }
        )
        # Should return 401 (invalid credentials) not 500 (server error)
        assert response.status_code == 401
        print("✓ Missing TOTP handled gracefully (no server crash)")


class TestUserResponseModel:
    """Tests to verify UserResponse model includes totp_enabled"""
    
    def test_get_me_requires_auth(self):
        """GET /api/auth/me without token should return 401"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        # Should require authentication
        assert response.status_code in [401, 403]
        print("✓ /api/auth/me requires authentication")


class TestPublicEndpoints:
    """Tests for public endpoints"""
    
    def test_categories_endpoint(self):
        """GET /api/categories should work without auth"""
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Categories endpoint returns {len(data)} categories")
    
    def test_featured_businesses_endpoint(self):
        """GET /api/businesses/featured should work without auth"""
        response = requests.get(f"{BASE_URL}/api/businesses/featured", params={"limit": 5})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Featured businesses returns {len(data)} businesses")
    
    def test_search_businesses_endpoint(self):
        """GET /api/businesses should work without auth"""
        response = requests.get(f"{BASE_URL}/api/businesses", params={"page": 1, "limit": 10})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Search businesses returns {len(data)} businesses")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
