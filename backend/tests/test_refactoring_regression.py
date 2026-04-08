"""
Regression tests for Bookvia backend refactoring.
Tests that all endpoints work correctly after splitting server.py into routers.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://marketplace-test-21.preview.emergentagent.com')

# Test credentials from test_credentials.md
USER_EMAIL = "cliente@bookvia.com"
USER_PASSWORD = "Test1234!"
BUSINESS_EMAIL = "testrealstripe@bookvia.com"
BUSINESS_PASSWORD = "Test1234!"
NOSUB_EMAIL = "nosub@test.com"
NOSUB_PASSWORD = "Test1234!"


class TestHealthAndSystem:
    """Test system endpoints"""
    
    def test_health_endpoint(self):
        """GET /api/health returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["database"] == "connected"
        print(f"✓ Health check passed: {data['status']}, DB: {data['database']}")
    
    def test_categories_endpoint(self):
        """GET /api/categories returns list of categories"""
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        # Verify category structure
        cat = data[0]
        assert "id" in cat
        assert "name_es" in cat or "slug" in cat
        print(f"✓ Categories endpoint returned {len(data)} categories")


class TestUserAuth:
    """Test user authentication endpoints"""
    
    def test_user_login_success(self):
        """POST /api/auth/login with valid credentials returns token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == USER_EMAIL
        print(f"✓ User login successful for {USER_EMAIL}")
        return data["token"]
    
    def test_user_login_invalid_credentials(self):
        """POST /api/auth/login with invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "invalid@test.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials correctly rejected with 401")
    
    def test_get_current_user_profile(self):
        """GET /api/auth/me with valid token returns user profile"""
        # First login to get token
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["token"]
        
        # Get profile
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == USER_EMAIL
        print(f"✓ User profile retrieved: {data['email']}")
    
    def test_get_my_bookings(self):
        """GET /api/bookings/my with user token returns bookings list"""
        # Login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["token"]
        
        # Get bookings
        response = requests.get(
            f"{BASE_URL}/api/bookings/my",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ User bookings retrieved: {len(data)} bookings")


class TestBusinessAuth:
    """Test business authentication endpoints"""
    
    def test_business_login_success(self):
        """POST /api/auth/business/login with valid credentials returns token"""
        response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": BUSINESS_EMAIL,
            "password": BUSINESS_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "business" in data
        print(f"✓ Business login successful for {BUSINESS_EMAIL}")
        return data["token"]
    
    def test_business_login_invalid_credentials(self):
        """POST /api/auth/business/login with invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": "invalid@business.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid business credentials correctly rejected with 401")
    
    def test_business_login_no_subscription(self):
        """POST /api/auth/business/login blocks nosub@test.com with subscription_required"""
        response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": NOSUB_EMAIL,
            "password": NOSUB_PASSWORD
        })
        assert response.status_code == 403
        data = response.json()
        assert data["detail"] == "subscription_required"
        print(f"✓ Business without subscription correctly blocked: {data['detail']}")
    
    def test_get_business_bookings(self):
        """GET /api/bookings/business with business token returns bookings"""
        # Login
        login_response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": BUSINESS_EMAIL,
            "password": BUSINESS_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["token"]
        
        # Get bookings
        response = requests.get(
            f"{BASE_URL}/api/bookings/business",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Business bookings retrieved: {len(data)} bookings")


class TestGoogleAuth:
    """Test Google authentication endpoints"""
    
    def test_google_session_rejects_invalid(self):
        """POST /api/auth/google/session rejects invalid session_id"""
        response = requests.post(f"{BASE_URL}/api/auth/google/session", json={
            "session_id": "invalid-session-id-12345"
        })
        # Should return 401 for invalid session
        assert response.status_code == 401
        print("✓ Invalid Google session correctly rejected")
    
    def test_google_session_missing_session_id(self):
        """POST /api/auth/google/session rejects missing session_id"""
        response = requests.post(f"{BASE_URL}/api/auth/google/session", json={})
        assert response.status_code == 400
        data = response.json()
        assert "session_id" in data["detail"].lower()
        print("✓ Missing session_id correctly rejected")


class TestSubscriptionFlow:
    """Test subscription endpoints"""
    
    def test_create_subscription_for_nosub_business(self):
        """POST /api/auth/business/create-subscription works for nosub@test.com"""
        response = requests.post(f"{BASE_URL}/api/auth/business/create-subscription", json={
            "email": NOSUB_EMAIL,
            "origin_url": BASE_URL
        })
        # Should return 200 with Stripe checkout URL
        assert response.status_code == 200
        data = response.json()
        assert "url" in data
        assert "session_id" in data
        assert "checkout.stripe.com" in data["url"] or "stripe" in data["url"].lower()
        print(f"✓ Subscription checkout created for {NOSUB_EMAIL}")
    
    def test_create_subscription_missing_email(self):
        """POST /api/auth/business/create-subscription rejects missing email"""
        response = requests.post(f"{BASE_URL}/api/auth/business/create-subscription", json={})
        assert response.status_code == 400
        print("✓ Missing email correctly rejected")
    
    def test_create_subscription_nonexistent_business(self):
        """POST /api/auth/business/create-subscription returns 404 for non-existent business"""
        response = requests.post(f"{BASE_URL}/api/auth/business/create-subscription", json={
            "email": "nonexistent@business.com"
        })
        assert response.status_code == 404
        print("✓ Non-existent business correctly returns 404")


class TestBusinessSearch:
    """Test business search endpoints"""
    
    def test_search_businesses(self):
        """GET /api/businesses/search returns search results"""
        # The endpoint is actually GET /api/businesses (not /search)
        response = requests.get(f"{BASE_URL}/api/businesses")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Business search returned {len(data)} results")
    
    def test_search_businesses_with_query(self):
        """GET /api/businesses with query parameter"""
        response = requests.get(f"{BASE_URL}/api/businesses", params={"query": "test"})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Business search with query returned {len(data)} results")
    
    def test_featured_businesses(self):
        """GET /api/businesses/featured returns featured businesses"""
        response = requests.get(f"{BASE_URL}/api/businesses/featured")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Featured businesses returned {len(data)} results")


class TestBusinessDashboard:
    """Test business dashboard endpoints"""
    
    def test_business_dashboard(self):
        """GET /api/businesses/me/dashboard returns dashboard data"""
        # Login
        login_response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": BUSINESS_EMAIL,
            "password": BUSINESS_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["token"]
        
        # Get dashboard
        response = requests.get(
            f"{BASE_URL}/api/businesses/me/dashboard",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "business" in data
        assert "stats" in data
        assert "subscription" in data
        print(f"✓ Business dashboard retrieved successfully")


class TestRouterIntegration:
    """Test that all routers are properly integrated"""
    
    def test_auth_router_prefix(self):
        """Verify auth router is mounted at /api/auth"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        assert response.status_code == 200
        print("✓ Auth router correctly mounted at /api/auth")
    
    def test_businesses_router_prefix(self):
        """Verify businesses router is mounted at /api/businesses"""
        response = requests.get(f"{BASE_URL}/api/businesses")
        assert response.status_code == 200
        print("✓ Businesses router correctly mounted at /api/businesses")
    
    def test_bookings_router_prefix(self):
        """Verify bookings router is mounted at /api/bookings"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        token = login_response.json()["token"]
        
        response = requests.get(
            f"{BASE_URL}/api/bookings/my",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        print("✓ Bookings router correctly mounted at /api/bookings")
    
    def test_categories_router_prefix(self):
        """Verify categories router is mounted at /api/categories"""
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200
        print("✓ Categories router correctly mounted at /api/categories")
    
    def test_system_router_health(self):
        """Verify system router health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        print("✓ System router health endpoint working")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
