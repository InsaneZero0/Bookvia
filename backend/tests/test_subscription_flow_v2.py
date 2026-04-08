"""
Test suite for Business Subscription Flow - Iteration 53
Tests the new registration flow where subscription payment is the LAST step.
Business cannot login without paying subscription first.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCreateSubscriptionEndpoint:
    """Tests for POST /api/auth/business/create-subscription"""
    
    def test_create_subscription_missing_email(self):
        """Should return 400 for missing email"""
        response = requests.post(
            f"{BASE_URL}/api/auth/business/create-subscription",
            json={}
        )
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        print(f"✓ Missing email returns 400: {data['detail']}")
    
    def test_create_subscription_empty_email(self):
        """Should return 400 for empty email"""
        response = requests.post(
            f"{BASE_URL}/api/auth/business/create-subscription",
            json={"email": ""}
        )
        assert response.status_code == 400
        print("✓ Empty email returns 400")
    
    def test_create_subscription_nonexistent_business(self):
        """Should return 404 for non-existent business"""
        response = requests.post(
            f"{BASE_URL}/api/auth/business/create-subscription",
            json={"email": "nonexistent_business_12345@test.com"}
        )
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        print(f"✓ Non-existent business returns 404: {data['detail']}")
    
    def test_create_subscription_valid_business_no_subscription(self):
        """Should return Stripe checkout URL for valid business with subscription_status='none'"""
        # nosub@test.com is the test business with subscription_status='none'
        response = requests.post(
            f"{BASE_URL}/api/auth/business/create-subscription",
            json={
                "email": "nosub@test.com",
                "origin_url": BASE_URL
            }
        )
        # Should return 200 with checkout URL
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "url" in data, f"Response should contain 'url': {data}"
        assert "session_id" in data, f"Response should contain 'session_id': {data}"
        assert "stripe.com" in data["url"] or "checkout" in data["url"], f"URL should be Stripe checkout: {data['url']}"
        print(f"✓ Valid business returns Stripe checkout URL: {data['url'][:50]}...")
    
    def test_create_subscription_business_already_subscribed(self):
        """Should return 400 for business that already has subscription"""
        # testrealstripe@bookvia.com has subscription_status='trialing'
        response = requests.post(
            f"{BASE_URL}/api/auth/business/create-subscription",
            json={
                "email": "testrealstripe@bookvia.com",
                "origin_url": BASE_URL
            }
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data
        print(f"✓ Already subscribed business returns 400: {data['detail']}")


class TestVerifySubscriptionEndpoint:
    """Tests for POST /api/auth/business/verify-subscription"""
    
    def test_verify_subscription_missing_session_id(self):
        """Should return 400 for missing session_id"""
        response = requests.post(
            f"{BASE_URL}/api/auth/business/verify-subscription",
            json={}
        )
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        print(f"✓ Missing session_id returns 400: {data['detail']}")
    
    def test_verify_subscription_empty_session_id(self):
        """Should return 400 for empty session_id"""
        response = requests.post(
            f"{BASE_URL}/api/auth/business/verify-subscription",
            json={"session_id": ""}
        )
        assert response.status_code == 400
        print("✓ Empty session_id returns 400")
    
    def test_verify_subscription_invalid_session_id(self):
        """Should return 400 for invalid session_id"""
        response = requests.post(
            f"{BASE_URL}/api/auth/business/verify-subscription",
            json={"session_id": "invalid_session_12345"}
        )
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        print(f"✓ Invalid session_id returns 400: {data['detail']}")


class TestBusinessLoginSubscriptionCheck:
    """Tests for POST /api/auth/business/login - subscription_required check"""
    
    def test_login_business_without_subscription(self):
        """Should return 403 with detail='subscription_required' for business with subscription_status='none'"""
        response = requests.post(
            f"{BASE_URL}/api/auth/business/login",
            json={
                "email": "nosub@test.com",
                "password": "Test1234!"
            }
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("detail") == "subscription_required", f"Expected detail='subscription_required', got: {data}"
        print(f"✓ Business without subscription returns 403 subscription_required")
    
    def test_login_business_with_subscription(self):
        """Should login normally for business with subscription_status='trialing'"""
        response = requests.post(
            f"{BASE_URL}/api/auth/business/login",
            json={
                "email": "testrealstripe@bookvia.com",
                "password": "Test1234!"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "token" in data, f"Response should contain 'token': {data}"
        assert "business" in data, f"Response should contain 'business': {data}"
        print(f"✓ Business with subscription logs in successfully")
    
    def test_login_business_invalid_credentials(self):
        """Should return 401 for invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/business/login",
            json={
                "email": "nosub@test.com",
                "password": "WrongPassword123!"
            }
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("✓ Invalid credentials returns 401")


class TestNormalUserLogin:
    """Tests to ensure normal user login still works"""
    
    def test_normal_user_login(self):
        """Normal user login should work without subscription check"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": "cliente@bookvia.com",
                "password": "Test1234!"
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "token" in data
        assert "user" in data
        print("✓ Normal user login works correctly")


class TestHealthCheck:
    """Basic health check"""
    
    def test_health_endpoint(self):
        """Health endpoint should return healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") in ("healthy", "degraded")
        print(f"✓ Health check: {data.get('status')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
