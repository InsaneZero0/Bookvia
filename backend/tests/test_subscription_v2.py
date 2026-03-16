"""
Test Suite for Subscription Feature Updates - Iteration 20
Tests:
1. Business registration with subscription_status='none' and status='pending'
2. POST /api/businesses/me/subscribe - Creates Stripe Checkout session (requires auth)
3. GET /api/businesses/me/subscription/status - Returns subscription details
4. POST /api/businesses/me/subscription/cancel - Returns 400 if no subscription
5. GET /api/businesses/me/dashboard - Includes subscription field
6. GET /api/businesses - Only shows approved businesses with active/trialing subscription
7. GET /api/businesses/featured - Same visibility filter
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBusinessRegistration:
    """Test business registration creates correct default values"""
    
    def test_register_business_creates_pending_status(self):
        """Business registration should set status='pending' and subscription_status='none'"""
        unique_email = f"test_reg_{uuid.uuid4().hex[:8]}@bookvia.com"
        
        payload = {
            "name": "Test Registration Business",
            "email": unique_email,
            "password": "Test1234!",
            "phone": "+525512345600",
            "description": "Test business for registration",
            "category_id": "",
            "address": "Test Address 123",
            "city": "CDMX",
            "state": "CDMX",
            "country": "MX",
            "zip_code": "06600",
            "rfc": "XAXX010101000",
            "legal_name": "Test SA",
            "clabe": "012345678901234567",
            "requires_deposit": False,
            "cancellation_days": 1
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/business/register", json=payload)
        assert response.status_code == 200, f"Registration failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "Response should include token"
        assert "business" in data, "Response should include business"
        
        business = data["business"]
        # Check default values
        assert business.get("status") == "pending", f"Expected status='pending', got '{business.get('status')}'"
        assert business.get("subscription_status") == "none", f"Expected subscription_status='none', got '{business.get('subscription_status')}'"
        
        # Store token for later tests
        return data["token"], business


class TestSubscriptionEndpoints:
    """Test subscription-related endpoints"""
    
    @pytest.fixture(scope="class")
    def business_auth(self):
        """Register a business and return auth token"""
        unique_email = f"test_sub_{uuid.uuid4().hex[:8]}@bookvia.com"
        
        payload = {
            "name": "Test Subscription Business",
            "email": unique_email,
            "password": "Test1234!",
            "phone": "+525512345601",
            "description": "Test for subscription endpoints",
            "category_id": "",
            "address": "Subscription Test 123",
            "city": "CDMX",
            "state": "CDMX",
            "country": "MX",
            "zip_code": "06600",
            "rfc": "XAXX010101000",
            "legal_name": "Sub Test SA",
            "clabe": "012345678901234567",
            "requires_deposit": False,
            "cancellation_days": 1
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/business/register", json=payload)
        assert response.status_code == 200, f"Registration failed: {response.text}"
        return response.json()["token"]
    
    def test_subscribe_creates_stripe_session(self, business_auth):
        """POST /api/businesses/me/subscribe should create Stripe Checkout session"""
        headers = {"Authorization": f"Bearer {business_auth}"}
        
        response = requests.post(
            f"{BASE_URL}/api/businesses/me/subscribe",
            json={"origin_url": "https://reserve-stripe-test.preview.emergentagent.com"},
            headers=headers
        )
        
        assert response.status_code == 200, f"Subscribe failed: {response.text}"
        
        data = response.json()
        assert "url" in data, "Response should include Stripe checkout URL"
        assert "session_id" in data, "Response should include session_id"
        
        # Verify URL is a valid Stripe URL
        url = data["url"]
        assert "stripe.com" in url or "checkout" in url, f"URL should be Stripe checkout: {url}"
    
    def test_subscribe_requires_auth(self):
        """POST /api/businesses/me/subscribe should return 401 without auth"""
        response = requests.post(
            f"{BASE_URL}/api/businesses/me/subscribe",
            json={"origin_url": "https://test.com"}
        )
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_subscription_status_returns_none_for_new_business(self, business_auth):
        """GET /api/businesses/me/subscription/status should return 'none' for new business"""
        headers = {"Authorization": f"Bearer {business_auth}"}
        
        response = requests.get(
            f"{BASE_URL}/api/businesses/me/subscription/status",
            headers=headers
        )
        
        assert response.status_code == 200, f"Status check failed: {response.text}"
        
        data = response.json()
        assert "status" in data, "Response should include status"
        assert "subscription_status" in data, "Response should include subscription_status"
        assert "current_period_end" in data, "Response should include current_period_end"
        assert "cancel_at_period_end" in data, "Response should include cancel_at_period_end"
        
        # New business has no subscription
        assert data["subscription_status"] == "none" or data["status"] == "none"
    
    def test_subscription_status_requires_auth(self):
        """GET /api/businesses/me/subscription/status should return 401 without auth"""
        response = requests.get(f"{BASE_URL}/api/businesses/me/subscription/status")
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    
    def test_cancel_subscription_returns_400_without_subscription(self, business_auth):
        """POST /api/businesses/me/subscription/cancel should return 400 if no subscription"""
        headers = {"Authorization": f"Bearer {business_auth}"}
        
        response = requests.post(
            f"{BASE_URL}/api/businesses/me/subscription/cancel",
            headers=headers
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Should indicate no active subscription
        assert "detail" in data or "error" in data or "message" in data
    
    def test_cancel_subscription_requires_auth(self):
        """POST /api/businesses/me/subscription/cancel should return 401 without auth"""
        response = requests.post(f"{BASE_URL}/api/businesses/me/subscription/cancel")
        
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"


class TestDashboardSubscription:
    """Test dashboard endpoint includes subscription field"""
    
    @pytest.fixture(scope="class")
    def business_auth(self):
        """Register a business and return auth token"""
        unique_email = f"test_dash_{uuid.uuid4().hex[:8]}@bookvia.com"
        
        payload = {
            "name": "Test Dashboard Business",
            "email": unique_email,
            "password": "Test1234!",
            "phone": "+525512345602",
            "description": "Test for dashboard",
            "category_id": "",
            "address": "Dashboard Test 123",
            "city": "CDMX",
            "state": "CDMX",
            "country": "MX",
            "zip_code": "06600",
            "rfc": "XAXX010101000",
            "legal_name": "Dash Test SA",
            "clabe": "012345678901234567",
            "requires_deposit": False,
            "cancellation_days": 1
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/business/register", json=payload)
        assert response.status_code == 200, f"Registration failed: {response.text}"
        return response.json()["token"]
    
    def test_dashboard_includes_subscription_field(self, business_auth):
        """GET /api/businesses/me/dashboard should include subscription object"""
        headers = {"Authorization": f"Bearer {business_auth}"}
        
        response = requests.get(
            f"{BASE_URL}/api/businesses/me/dashboard",
            headers=headers
        )
        
        assert response.status_code == 200, f"Dashboard failed: {response.text}"
        
        data = response.json()
        assert "business" in data, "Response should include business"
        assert "stats" in data, "Response should include stats"
        assert "subscription" in data, "Response should include subscription object"
        
        subscription = data["subscription"]
        assert "status" in subscription, "Subscription should include status"
        # New business should have 'none' status
        assert subscription["status"] == "none", f"Expected subscription status='none', got '{subscription['status']}'"


class TestBusinessVisibility:
    """Test business visibility filters for search and featured endpoints"""
    
    def test_search_businesses_filters_by_status_and_subscription(self):
        """GET /api/businesses should only return approved businesses with active/trialing subscription"""
        response = requests.get(f"{BASE_URL}/api/businesses")
        
        assert response.status_code == 200, f"Search failed: {response.text}"
        
        businesses = response.json()
        
        # All returned businesses should be approved with active/trialing subscription
        for biz in businesses:
            assert biz.get("status") == "approved", f"Business {biz.get('name')} status should be 'approved', got '{biz.get('status')}'"
            subscription_status = biz.get("subscription_status", "none")
            assert subscription_status in ["active", "trialing"], \
                f"Business {biz.get('name')} subscription_status should be 'active' or 'trialing', got '{subscription_status}'"
    
    def test_featured_businesses_filters_by_status_and_subscription(self):
        """GET /api/businesses/featured should only return approved businesses with active/trialing subscription"""
        response = requests.get(f"{BASE_URL}/api/businesses/featured")
        
        assert response.status_code == 200, f"Featured failed: {response.text}"
        
        businesses = response.json()
        
        # All returned businesses should be approved with active/trialing subscription
        for biz in businesses:
            assert biz.get("status") == "approved", f"Business {biz.get('name')} status should be 'approved', got '{biz.get('status')}'"
            subscription_status = biz.get("subscription_status", "none")
            assert subscription_status in ["active", "trialing"], \
                f"Business {biz.get('name')} subscription_status should be 'active' or 'trialing', got '{subscription_status}'"
    
    def test_new_business_not_visible_in_search(self):
        """A newly registered business should NOT appear in search results"""
        # Register a new business
        unique_email = f"test_vis_{uuid.uuid4().hex[:8]}@bookvia.com"
        unique_name = f"TestVisibility_{uuid.uuid4().hex[:8]}"
        
        payload = {
            "name": unique_name,
            "email": unique_email,
            "password": "Test1234!",
            "phone": "+525512345603",
            "description": "Test visibility business",
            "category_id": "",
            "address": "Visibility Test 123",
            "city": "CDMX",
            "state": "CDMX",
            "country": "MX",
            "zip_code": "06600",
            "rfc": "XAXX010101000",
            "legal_name": "Vis Test SA",
            "clabe": "012345678901234567",
            "requires_deposit": False,
            "cancellation_days": 1
        }
        
        reg_response = requests.post(f"{BASE_URL}/api/auth/business/register", json=payload)
        assert reg_response.status_code == 200, f"Registration failed: {reg_response.text}"
        
        # Search for this business
        search_response = requests.get(f"{BASE_URL}/api/businesses", params={"query": unique_name})
        assert search_response.status_code == 200
        
        businesses = search_response.json()
        
        # The new business should NOT be in results (pending + no subscription)
        business_names = [b.get("name") for b in businesses]
        assert unique_name not in business_names, \
            f"New pending business should not appear in search results"


class TestHealthCheck:
    """Basic health check"""
    
    def test_health_endpoint(self):
        """GET /api/health should return 200"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        
        data = response.json()
        assert data.get("status") == "healthy"
