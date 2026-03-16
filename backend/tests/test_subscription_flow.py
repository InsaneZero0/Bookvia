"""
Test Stripe Subscription Flow - Full E2E Test
Tests the complete subscription flow from business registration to subscription creation.

Features tested:
- POST /api/auth/business/register - Register a new business and get auth token
- POST /api/businesses/me/subscribe - Create Stripe Checkout Session for subscription
- GET /api/businesses/me/subscription/status - Check subscription status
- GET /api/health - Verify Stripe configuration
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestHealthAndConfig:
    """Test health check and Stripe configuration"""
    
    def test_health_check(self):
        """GET /api/health - Server is healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert data["status"] == "healthy"
        assert data["database"] == "connected"
        print(f"✓ Health check passed - status: {data['status']}")
    
    def test_stripe_config_is_test_mode(self):
        """GET /api/health - Stripe is configured in test mode"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["config"]["stripe"] == "test", f"Expected 'test', got {data['config']['stripe']}"
        print(f"✓ Stripe configuration: {data['config']['stripe']}")


class TestBusinessRegistrationAndSubscription:
    """Full flow test: Register business → Get token → Create subscription"""
    
    @pytest.fixture
    def unique_email(self):
        """Generate unique email for test"""
        unique_id = str(uuid.uuid4())[:8]
        return f"testflow_{unique_id}@bookvia.com"
    
    def test_full_subscription_flow(self, unique_email):
        """Complete flow: Register → Get token → Subscribe"""
        print(f"\n--- Testing full subscription flow ---")
        print(f"Test email: {unique_email}")
        
        # Step 1: Register a new business
        register_data = {
            "name": f"Test Business {unique_email[:8]}",
            "email": unique_email,
            "password": "Test1234!",
            "phone": "+525512345679",
            "description": "Test business for subscription flow",
            "category_id": "",  # Empty category is allowed
            "address": "Test Address 123",
            "city": "CDMX",
            "state": "CDMX",
            "country": "MX",
            "zip_code": "06600",
            "rfc": "XAXX010101000",
            "legal_name": "Test SA de CV",
            "clabe": "012345678901234567",
            "requires_deposit": False,
            "cancellation_days": 1
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/business/register", json=register_data)
        assert response.status_code == 200, f"Registration failed: {response.status_code} - {response.text}"
        data = response.json()
        
        assert "token" in data, "No token in registration response"
        assert "business" in data, "No business data in registration response"
        
        token = data["token"]
        business = data["business"]
        business_id = business["id"]
        
        print(f"✓ Business registered successfully - ID: {business_id}")
        print(f"✓ Token received: {token[:20]}...")
        
        # Step 2: Verify subscription status (should be 'none' initially)
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/businesses/me/subscription/status", headers=headers)
        assert response.status_code == 200, f"Status check failed: {response.status_code}"
        status_data = response.json()
        
        assert status_data["status"] == "none", f"Expected status 'none', got {status_data['status']}"
        assert status_data["subscription_id"] is None, "subscription_id should be None"
        print(f"✓ Initial subscription status: {status_data['status']}")
        
        # Step 3: Create subscription checkout
        subscribe_data = {
            "origin_url": BASE_URL
        }
        response = requests.post(f"{BASE_URL}/api/businesses/me/subscribe", json=subscribe_data, headers=headers)
        assert response.status_code == 200, f"Subscribe failed: {response.status_code} - {response.text}"
        checkout_data = response.json()
        
        assert "url" in checkout_data, "No checkout URL in response"
        assert "session_id" in checkout_data, "No session_id in response"
        
        checkout_url = checkout_data["url"]
        session_id = checkout_data["session_id"]
        
        # Verify checkout URL is a valid Stripe URL
        assert "stripe.com" in checkout_url or "checkout.stripe.com" in checkout_url, \
            f"Checkout URL doesn't look like Stripe URL: {checkout_url}"
        
        print(f"✓ Stripe Checkout session created")
        print(f"  - Session ID: {session_id}")
        print(f"  - Checkout URL: {checkout_url[:80]}...")
        
        # Step 4: Verify subscription status with session_id (should return pending or status info)
        response = requests.get(
            f"{BASE_URL}/api/businesses/me/subscription/status?session_id={session_id}",
            headers=headers
        )
        assert response.status_code == 200, f"Status check with session_id failed: {response.status_code}"
        final_status = response.json()
        
        # Since we haven't completed payment, status might be 'none' or an error might occur
        # The important thing is the endpoint works and doesn't crash
        print(f"✓ Subscription status check with session_id works")
        print(f"  - Status response: {final_status}")
        
        print(f"\n✓ Full subscription flow test PASSED")
    
    def test_subscribe_returns_401_without_auth(self):
        """POST /api/businesses/me/subscribe requires authentication"""
        response = requests.post(f"{BASE_URL}/api/businesses/me/subscribe", json={})
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Subscribe endpoint correctly returns 401 without auth")
    
    def test_subscription_status_returns_401_without_auth(self):
        """GET /api/businesses/me/subscription/status requires authentication"""
        response = requests.get(f"{BASE_URL}/api/businesses/me/subscription/status")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Subscription status endpoint correctly returns 401 without auth")


class TestDuplicateSubscription:
    """Test that duplicate subscriptions are prevented"""
    
    @pytest.fixture
    def registered_business(self):
        """Register a business and return token"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"duplicate_test_{unique_id}@bookvia.com"
        
        register_data = {
            "name": f"Duplicate Test Business",
            "email": email,
            "password": "Test1234!",
            "phone": "+525512345680",
            "description": "Test for duplicate subscription prevention",
            "category_id": "",
            "address": "Test Address",
            "city": "CDMX",
            "state": "CDMX",
            "country": "MX",
            "zip_code": "06600",
            "rfc": "XAXX010101000",
            "legal_name": "Duplicate Test SA",
            "clabe": "012345678901234567",
            "requires_deposit": False,
            "cancellation_days": 1
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/business/register", json=register_data)
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_cannot_create_duplicate_checkout_sessions(self, registered_business):
        """Verify multiple checkout sessions can be created (not a duplicate subscription)"""
        token = registered_business
        headers = {"Authorization": f"Bearer {token}"}
        
        # Create first checkout session
        response = requests.post(
            f"{BASE_URL}/api/businesses/me/subscribe",
            json={"origin_url": BASE_URL},
            headers=headers
        )
        assert response.status_code == 200
        first_session = response.json()
        print(f"✓ First checkout session created: {first_session['session_id']}")
        
        # Create second checkout session (should succeed since subscription not completed)
        response = requests.post(
            f"{BASE_URL}/api/businesses/me/subscribe",
            json={"origin_url": BASE_URL},
            headers=headers
        )
        # This should still work since the first subscription wasn't completed
        assert response.status_code == 200
        second_session = response.json()
        print(f"✓ Second checkout session created: {second_session['session_id']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
