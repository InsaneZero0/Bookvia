"""
Google Auth Integration Tests for Bookvia
Tests the Emergent Google Auth integration endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://marketplace-test-21.preview.emergentagent.com').rstrip('/')


class TestGoogleAuthEndpoint:
    """Tests for POST /api/auth/google/session endpoint"""
    
    def test_google_session_invalid_session_id_returns_401(self):
        """Invalid session_id should return 401 Unauthorized"""
        response = requests.post(
            f"{BASE_URL}/api/auth/google/session",
            json={"session_id": "invalid_test_session_12345"},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        assert "invalida" in data["detail"].lower() or "invalid" in data["detail"].lower()
    
    def test_google_session_missing_session_id_returns_400(self):
        """Missing session_id should return 400 Bad Request"""
        response = requests.post(
            f"{BASE_URL}/api/auth/google/session",
            json={},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        assert "session_id" in data["detail"].lower()
    
    def test_google_session_empty_session_id_returns_400(self):
        """Empty session_id should return 400 Bad Request"""
        response = requests.post(
            f"{BASE_URL}/api/auth/google/session",
            json={"session_id": ""},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data


class TestNormalAuthRegression:
    """Regression tests to ensure normal auth flows still work after Google Auth integration"""
    
    def test_user_login_still_works(self):
        """Normal user email login should still work"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "cliente@bookvia.com", "password": "Test1234!"},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == "cliente@bookvia.com"
        assert data["user"]["role"] == "user"
    
    def test_business_login_still_works(self):
        """Normal business email login should still work"""
        response = requests.post(
            f"{BASE_URL}/api/auth/business/login",
            json={"email": "testrealstripe@bookvia.com", "password": "Test1234!"},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "business" in data
        assert data["business"]["email"] == "testrealstripe@bookvia.com"
    
    def test_invalid_user_credentials_returns_401(self):
        """Invalid credentials should return 401"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "nonexistent@test.com", "password": "wrongpassword"},
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 401


class TestHealthCheck:
    """Basic health check to ensure API is running"""
    
    def test_health_endpoint(self):
        """Health endpoint should return healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ["healthy", "degraded"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
