"""
Test Admin Panel New Features: Rankings, Alerts, Cities Management
Tests for iteration 62 - 3 new functionalities added to admin panel
"""
import pytest
import requests
import os
import subprocess
import sys

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
ADMIN_EMAIL = "zamorachapa50@gmail.com"
ADMIN_PASSWORD = "RainbowLol3133!"


def get_totp_code():
    """Get TOTP code using the helper script"""
    result = subprocess.run(
        [sys.executable, '/app/scripts/get_admin_totp.py'],
        capture_output=True, text=True, cwd='/app/backend'
    )
    return result.stdout.strip()


@pytest.fixture(scope="module")
def admin_token():
    """Get admin auth token with TOTP"""
    totp_code = get_totp_code()
    response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
        "totp_code": totp_code
    })
    if response.status_code != 200:
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    return response.json().get("token")


@pytest.fixture
def auth_headers(admin_token):
    """Headers with admin auth token"""
    return {"Authorization": f"Bearer {admin_token}"}


# ============ RANKINGS TESTS ============

class TestRankings:
    """Test GET /api/admin/rankings endpoint"""
    
    def test_rankings_returns_all_categories(self, auth_headers):
        """Rankings endpoint returns top_by_bookings, top_by_rating, top_cities, top_categories"""
        response = requests.get(f"{BASE_URL}/api/admin/rankings", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "top_by_bookings" in data, "Missing top_by_bookings"
        assert "top_by_rating" in data, "Missing top_by_rating"
        assert "top_cities" in data, "Missing top_cities"
        assert "top_categories" in data, "Missing top_categories"
        
        # Verify arrays
        assert isinstance(data["top_by_bookings"], list), "top_by_bookings should be a list"
        assert isinstance(data["top_by_rating"], list), "top_by_rating should be a list"
        assert isinstance(data["top_cities"], list), "top_cities should be a list"
        assert isinstance(data["top_categories"], list), "top_categories should be a list"
        print(f"Rankings returned: {len(data['top_by_bookings'])} by bookings, {len(data['top_by_rating'])} by rating, {len(data['top_cities'])} cities, {len(data['top_categories'])} categories")
    
    def test_rankings_business_structure(self, auth_headers):
        """Verify business ranking items have expected fields"""
        response = requests.get(f"{BASE_URL}/api/admin/rankings", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        if data["top_by_bookings"]:
            biz = data["top_by_bookings"][0]
            assert "id" in biz, "Business should have id"
            assert "name" in biz, "Business should have name"
            assert "booking_count" in biz, "Business should have booking_count"
            print(f"Top business by bookings: {biz['name']} with {biz['booking_count']} bookings")
    
    def test_rankings_city_structure(self, auth_headers):
        """Verify city ranking items have expected fields"""
        response = requests.get(f"{BASE_URL}/api/admin/rankings", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        if data["top_cities"]:
            city = data["top_cities"][0]
            assert "city" in city, "City item should have city name"
            assert "businesses" in city, "City item should have businesses count"
            assert "bookings" in city, "City item should have bookings count"
            print(f"Top city: {city['city']} with {city['businesses']} businesses, {city['bookings']} bookings")
    
    def test_rankings_category_structure(self, auth_headers):
        """Verify category ranking items have expected fields"""
        response = requests.get(f"{BASE_URL}/api/admin/rankings", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        if data["top_categories"]:
            cat = data["top_categories"][0]
            assert "category" in cat, "Category item should have category name"
            assert "businesses" in cat, "Category item should have businesses count"
            assert "bookings" in cat, "Category item should have bookings count"
            print(f"Top category: {cat['category']} with {cat['businesses']} businesses")
    
    def test_rankings_requires_admin_auth(self):
        """Rankings endpoint requires admin authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/rankings")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("Rankings correctly requires admin auth")


# ============ ALERTS TESTS ============

class TestAlerts:
    """Test GET /api/admin/alerts endpoint"""
    
    def test_alerts_returns_array(self, auth_headers):
        """Alerts endpoint returns alerts array with total count"""
        response = requests.get(f"{BASE_URL}/api/admin/alerts", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "alerts" in data, "Response should have alerts array"
        assert "total" in data, "Response should have total count"
        assert isinstance(data["alerts"], list), "alerts should be a list"
        print(f"Alerts returned: {data['total']} total alerts")
    
    def test_alerts_structure(self, auth_headers):
        """Verify alert items have expected fields (type, severity, title, detail, count)"""
        response = requests.get(f"{BASE_URL}/api/admin/alerts", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        if data["alerts"]:
            alert = data["alerts"][0]
            assert "type" in alert, "Alert should have type"
            assert "severity" in alert, "Alert should have severity"
            assert "title" in alert, "Alert should have title"
            assert "detail" in alert, "Alert should have detail"
            assert "count" in alert, "Alert should have count"
            
            # Verify severity is valid
            assert alert["severity"] in ["info", "warning", "critical"], f"Invalid severity: {alert['severity']}"
            print(f"Alert: {alert['type']} - {alert['title']} (severity: {alert['severity']})")
    
    def test_alerts_types(self, auth_headers):
        """Verify known alert types are returned"""
        response = requests.get(f"{BASE_URL}/api/admin/alerts", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        alert_types = [a["type"] for a in data["alerts"]]
        known_types = ["pending_business", "open_tickets", "bad_reviews", "past_due_subs", "no_subscription", "held_payments"]
        
        for alert in data["alerts"]:
            assert alert["type"] in known_types, f"Unknown alert type: {alert['type']}"
        
        print(f"Alert types found: {alert_types}")
    
    def test_alerts_requires_admin_auth(self):
        """Alerts endpoint requires admin authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/alerts")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("Alerts correctly requires admin auth")


# ============ CITIES TESTS ============

class TestCities:
    """Test Cities management endpoints"""
    
    def test_cities_list_returns_paginated(self, auth_headers):
        """GET /api/admin/cities returns paginated cities with business_count"""
        response = requests.get(f"{BASE_URL}/api/admin/cities", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "cities" in data, "Response should have cities array"
        assert "total" in data, "Response should have total count"
        assert "page" in data, "Response should have page number"
        assert "pages" in data, "Response should have pages count"
        
        print(f"Cities: {data['total']} total, page {data['page']}/{data['pages']}")
    
    def test_cities_structure(self, auth_headers):
        """Verify city items have expected fields including business_count"""
        response = requests.get(f"{BASE_URL}/api/admin/cities", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        if data["cities"]:
            city = data["cities"][0]
            assert "name" in city, "City should have name"
            assert "slug" in city, "City should have slug"
            assert "business_count" in city, "City should have business_count"
            assert "active" in city, "City should have active status"
            print(f"City: {city['name']} (slug: {city['slug']}, businesses: {city['business_count']}, active: {city['active']})")
    
    def test_cities_search(self, auth_headers):
        """Cities endpoint supports search parameter"""
        # First get a city name to search for
        response = requests.get(f"{BASE_URL}/api/admin/cities", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        if data["cities"]:
            city_name = data["cities"][0]["name"][:3]  # First 3 chars
            
            # Search for it
            search_response = requests.get(
                f"{BASE_URL}/api/admin/cities",
                params={"search": city_name},
                headers=auth_headers
            )
            assert search_response.status_code == 200
            search_data = search_response.json()
            print(f"Search for '{city_name}' returned {search_data['total']} cities")
    
    def test_cities_active_filter(self, auth_headers):
        """Cities endpoint supports active_only filter"""
        # Test active_only=true
        response = requests.get(
            f"{BASE_URL}/api/admin/cities",
            params={"active_only": "true"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # All returned cities should be active
        for city in data["cities"]:
            assert city["active"] == True, f"City {city['name']} should be active"
        
        print(f"Active cities filter: {data['total']} active cities")
    
    def test_cities_inactive_filter(self, auth_headers):
        """Cities endpoint supports active_only=false filter"""
        response = requests.get(
            f"{BASE_URL}/api/admin/cities",
            params={"active_only": "false"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # All returned cities should be inactive
        for city in data["cities"]:
            assert city["active"] == False, f"City {city['name']} should be inactive"
        
        print(f"Inactive cities filter: {data['total']} inactive cities")
    
    def test_cities_toggle_deactivate(self, auth_headers):
        """PUT /api/admin/cities/{slug}/toggle can deactivate a city"""
        # Get a city to toggle
        response = requests.get(f"{BASE_URL}/api/admin/cities", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        if not data["cities"]:
            pytest.skip("No cities to test toggle")
        
        # Find an active city
        active_city = None
        for city in data["cities"]:
            if city["active"]:
                active_city = city
                break
        
        if not active_city:
            pytest.skip("No active cities to deactivate")
        
        city_slug = active_city["slug"]
        
        # Deactivate it
        toggle_response = requests.put(
            f"{BASE_URL}/api/admin/cities/{city_slug}/toggle",
            params={"active": False},
            headers=auth_headers
        )
        assert toggle_response.status_code == 200, f"Expected 200, got {toggle_response.status_code}: {toggle_response.text}"
        
        toggle_data = toggle_response.json()
        assert toggle_data["active"] == False, "City should be deactivated"
        assert toggle_data["slug"] == city_slug, "Response should include city slug"
        print(f"Deactivated city: {city_slug}")
        
        # Reactivate it to restore state
        reactivate_response = requests.put(
            f"{BASE_URL}/api/admin/cities/{city_slug}/toggle",
            params={"active": True},
            headers=auth_headers
        )
        assert reactivate_response.status_code == 200
        print(f"Reactivated city: {city_slug}")
    
    def test_cities_toggle_activate(self, auth_headers):
        """PUT /api/admin/cities/{slug}/toggle can activate a city"""
        # First deactivate a city, then activate it
        response = requests.get(f"{BASE_URL}/api/admin/cities", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        if not data["cities"]:
            pytest.skip("No cities to test toggle")
        
        city_slug = data["cities"][0]["slug"]
        original_active = data["cities"][0]["active"]
        
        # Deactivate first
        requests.put(
            f"{BASE_URL}/api/admin/cities/{city_slug}/toggle",
            params={"active": False},
            headers=auth_headers
        )
        
        # Now activate
        toggle_response = requests.put(
            f"{BASE_URL}/api/admin/cities/{city_slug}/toggle",
            params={"active": True},
            headers=auth_headers
        )
        assert toggle_response.status_code == 200
        
        toggle_data = toggle_response.json()
        assert toggle_data["active"] == True, "City should be activated"
        print(f"Activated city: {city_slug}")
    
    def test_cities_toggle_nonexistent(self, auth_headers):
        """Toggle returns 404 for non-existent city"""
        response = requests.put(
            f"{BASE_URL}/api/admin/cities/nonexistent-city-slug-12345/toggle",
            params={"active": True},
            headers=auth_headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("Toggle correctly returns 404 for non-existent city")
    
    def test_cities_requires_admin_auth(self):
        """Cities endpoints require admin authentication"""
        # GET cities
        response = requests.get(f"{BASE_URL}/api/admin/cities")
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        
        # PUT toggle
        response = requests.put(f"{BASE_URL}/api/admin/cities/test-slug/toggle", params={"active": True})
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        
        print("Cities endpoints correctly require admin auth")


# ============ REGRESSION TESTS ============

class TestRegression:
    """Regression tests for existing admin endpoints"""
    
    def test_admin_stats(self, auth_headers):
        """GET /api/admin/stats still works"""
        response = requests.get(f"{BASE_URL}/api/admin/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        assert "businesses" in data
        assert "bookings" in data
        print(f"Stats: {data['businesses']['total']} businesses, {data['users']['total']} users")
    
    def test_admin_businesses_all(self, auth_headers):
        """GET /api/admin/businesses/all still works"""
        response = requests.get(f"{BASE_URL}/api/admin/businesses/all", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "businesses" in data
        assert "total" in data
        print(f"Businesses: {data['total']} total")
    
    def test_admin_tickets(self, auth_headers):
        """GET /api/admin/tickets still works"""
        response = requests.get(f"{BASE_URL}/api/admin/tickets", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "tickets" in data
        assert "total" in data
        print(f"Tickets: {data['total']} total")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
