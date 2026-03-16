"""
Test Stripe Subscription Endpoints - Iteration 17

Tests the new subscription endpoints added for business registration Step 5:
- POST /api/businesses/me/subscribe - Create Stripe Checkout Session for subscription
- GET /api/businesses/me/subscription/status - Check subscription status
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSubscriptionEndpoints:
    """Test subscription endpoints authentication requirements"""
    
    def test_subscribe_endpoint_returns_401_without_auth(self):
        """POST /api/businesses/me/subscribe returns 401 without authentication"""
        response = requests.post(f"{BASE_URL}/api/businesses/me/subscribe", json={})
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        data = response.json()
        assert "detail" in data
        assert "Authentication required" in data["detail"]
        print(f"✓ POST /api/businesses/me/subscribe returns 401 without auth")
    
    def test_subscription_status_endpoint_returns_401_without_auth(self):
        """GET /api/businesses/me/subscription/status returns 401 without authentication"""
        response = requests.get(f"{BASE_URL}/api/businesses/me/subscription/status")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        data = response.json()
        assert "detail" in data
        assert "Authentication required" in data["detail"]
        print(f"✓ GET /api/businesses/me/subscription/status returns 401 without auth")
    
    def test_health_endpoint_shows_stripe_config(self):
        """GET /api/health shows Stripe configuration status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert "config" in data
        assert "stripe" in data["config"]
        # Should be 'test' since we're using sk_test_emergent
        assert data["config"]["stripe"] == "test", f"Expected 'test', got {data['config']['stripe']}"
        print(f"✓ Health endpoint shows stripe config: {data['config']['stripe']}")


class TestExistingPagesStillWork:
    """Verify that existing pages and endpoints still work after changes"""
    
    def test_home_page_api_endpoints_work(self):
        """API endpoints for home page still work"""
        # Categories
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200
        print(f"✓ GET /api/categories returns 200")
        
        # Featured businesses
        response = requests.get(f"{BASE_URL}/api/businesses/featured")
        assert response.status_code == 200
        print(f"✓ GET /api/businesses/featured returns 200")
    
    def test_search_page_api_endpoint_works(self):
        """Search API endpoint still works"""
        response = requests.get(f"{BASE_URL}/api/businesses")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/businesses returns 200 with {len(data)} businesses")
    
    def test_business_profile_api_works(self):
        """Business profile by slug endpoint works"""
        # First get a business slug
        response = requests.get(f"{BASE_URL}/api/businesses?limit=1")
        assert response.status_code == 200
        businesses = response.json()
        
        if len(businesses) > 0:
            slug = businesses[0].get("slug")
            if slug:
                response = requests.get(f"{BASE_URL}/api/businesses/slug/{slug}")
                assert response.status_code == 200
                print(f"✓ GET /api/businesses/slug/{slug} returns 200")
            else:
                print("⚠ No slug found in first business")
        else:
            print("⚠ No businesses found to test profile endpoint")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
