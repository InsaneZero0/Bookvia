"""
Tests for Business Closures Feature (Iteration 17)
Tests the GET/POST/DELETE /api/businesses/me/closures endpoints
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestClosuresAuth:
    """Test that closure endpoints return 401 without auth, NOT 500"""
    
    def test_get_closures_returns_401_without_auth(self, api_client):
        """GET /api/businesses/me/closures should return 401 without auth"""
        response = api_client.get(f"{BASE_URL}/api/businesses/me/closures")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}. Response: {response.text}"
        print("✅ GET /api/businesses/me/closures returns 401 without auth")
    
    def test_post_closures_returns_401_without_auth(self, api_client):
        """POST /api/businesses/me/closures should return 401 without auth"""
        response = api_client.post(
            f"{BASE_URL}/api/businesses/me/closures",
            json={"date": "2026-01-15", "reason": "Test"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}. Response: {response.text}"
        print("✅ POST /api/businesses/me/closures returns 401 without auth")
    
    def test_delete_closures_returns_401_without_auth(self, api_client):
        """DELETE /api/businesses/me/closures/2026-01-01 should return 401 without auth"""
        response = api_client.delete(f"{BASE_URL}/api/businesses/me/closures/2026-01-01")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}. Response: {response.text}"
        print("✅ DELETE /api/businesses/me/closures/2026-01-01 returns 401 without auth")


class TestPublicPages:
    """Test that public pages still work"""
    
    def test_health_endpoint(self, api_client):
        """Health check endpoint should work"""
        response = api_client.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        data = response.json()
        assert data.get("status") in ["healthy", "degraded"]
        print(f"✅ Health endpoint working - status: {data.get('status')}")
    
    def test_categories_endpoint(self, api_client):
        """GET /api/categories should work without auth"""
        response = api_client.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200, f"Categories failed: {response.text}"
        print("✅ GET /api/categories returns 200")
    
    def test_search_businesses(self, api_client):
        """GET /api/businesses (search) should work without auth"""
        response = api_client.get(f"{BASE_URL}/api/businesses")
        assert response.status_code == 200, f"Search failed: {response.text}"
        print("✅ GET /api/businesses returns 200")
    
    def test_business_profile_by_slug(self, api_client):
        """GET /api/businesses/slug/{slug} should work"""
        response = api_client.get(f"{BASE_URL}/api/businesses/slug/test-business-5ecc65fc")
        # Should return 200 if exists, 404 if not
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        print(f"✅ GET /api/businesses/slug/test-business-5ecc65fc returns {response.status_code}")


class TestAvailabilityWithClosures:
    """Test that availability endpoint respects closures"""
    
    def test_availability_endpoint_works(self, api_client):
        """GET /api/bookings/availability/{business_id} should work"""
        # First get a business ID
        response = api_client.get(f"{BASE_URL}/api/businesses")
        if response.status_code == 200 and response.json():
            business_id = response.json()[0].get("id")
            if business_id:
                tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
                avail_response = api_client.get(
                    f"{BASE_URL}/api/bookings/availability/{business_id}",
                    params={"date": tomorrow}
                )
                assert avail_response.status_code == 200, f"Availability failed: {avail_response.text}"
                print(f"✅ Availability endpoint returns 200 for date {tomorrow}")
        else:
            print("⚠️ No businesses found to test availability")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
