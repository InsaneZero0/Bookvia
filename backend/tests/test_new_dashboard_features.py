"""
Test suite for 3 new dashboard features:
1. User stats endpoint (GET /api/users/my-stats)
2. Business dashboard summary (GET /api/businesses/my/dashboard-summary)
3. Admin custom reports (GET /api/admin/reports/custom)
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestUserStats:
    """Test GET /api/users/my-stats endpoint"""
    
    def test_user_stats_requires_auth(self):
        """User stats endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/users/my-stats")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASSED: User stats requires auth")
    
    def test_user_stats_returns_expected_fields(self, user_token):
        """User stats returns all expected fields"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.get(f"{BASE_URL}/api/users/my-stats", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        expected_fields = [
            "total_bookings", "completed", "upcoming", "total_spent",
            "reviews_given", "avg_rating_given", "favorite_service",
            "member_since", "recent_completed"
        ]
        for field in expected_fields:
            assert field in data, f"Missing field: {field}"
        
        # Validate types
        assert isinstance(data["total_bookings"], int)
        assert isinstance(data["completed"], int)
        assert isinstance(data["upcoming"], int)
        assert isinstance(data["total_spent"], (int, float))
        assert isinstance(data["reviews_given"], int)
        assert isinstance(data["avg_rating_given"], (int, float))
        assert isinstance(data["recent_completed"], list)
        
        print(f"PASSED: User stats returns all fields - total_bookings={data['total_bookings']}, total_spent={data['total_spent']}")


class TestBusinessDashboardSummary:
    """Test GET /api/businesses/my/dashboard-summary endpoint"""
    
    def test_dashboard_summary_requires_business_auth(self):
        """Dashboard summary requires business authentication"""
        response = requests.get(f"{BASE_URL}/api/businesses/my/dashboard-summary")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASSED: Dashboard summary requires business auth")
    
    def test_dashboard_summary_returns_expected_structure(self, business_token):
        """Dashboard summary returns today, week, month summaries"""
        headers = {"Authorization": f"Bearer {business_token}"}
        response = requests.get(f"{BASE_URL}/api/businesses/my/dashboard-summary", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check top-level keys
        assert "today" in data, "Missing 'today' key"
        assert "week" in data, "Missing 'week' key"
        assert "month" in data, "Missing 'month' key"
        assert "new_reviews" in data, "Missing 'new_reviews' key"
        
        # Check today structure
        today = data["today"]
        assert "bookings" in today, "Missing today.bookings"
        assert "completed" in today, "Missing today.completed"
        assert "revenue" in today, "Missing today.revenue"
        
        # Check week structure
        week = data["week"]
        assert "bookings" in week, "Missing week.bookings"
        assert "revenue" in week, "Missing week.revenue"
        assert "change_pct" in week, "Missing week.change_pct"
        
        # Check month structure
        month = data["month"]
        assert "bookings" in month, "Missing month.bookings"
        assert "revenue" in month, "Missing month.revenue"
        assert "unique_clients" in month, "Missing month.unique_clients"
        
        print(f"PASSED: Dashboard summary structure - today={today['bookings']} bookings, week={week['bookings']} bookings, month={month['bookings']} bookings")


class TestAdminCustomReports:
    """Test GET /api/admin/reports/custom endpoint"""
    
    def test_custom_reports_requires_admin_auth(self):
        """Custom reports endpoint requires admin authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/reports/custom")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASSED: Custom reports requires admin auth")
    
    def test_custom_reports_default_params(self, admin_token):
        """Custom reports works with default parameters (last 30 days)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/reports/custom", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check top-level keys
        assert "filters" in data, "Missing 'filters' key"
        assert "summary" in data, "Missing 'summary' key"
        assert "daily_chart" in data, "Missing 'daily_chart' key"
        assert "top_businesses" in data, "Missing 'top_businesses' key"
        assert "top_cities" in data, "Missing 'top_cities' key"
        
        print(f"PASSED: Custom reports default params - summary has {len(data['summary'])} fields")
    
    def test_custom_reports_summary_fields(self, admin_token):
        """Custom reports summary contains all expected fields"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/reports/custom", headers=headers)
        assert response.status_code == 200
        
        summary = response.json()["summary"]
        expected_fields = [
            "total_bookings", "completed", "confirmed", "cancelled",
            "cancel_rate", "revenue", "unique_users", "unique_businesses",
            "new_users", "new_businesses"
        ]
        for field in expected_fields:
            assert field in summary, f"Missing summary field: {field}"
        
        print(f"PASSED: Summary fields - total_bookings={summary['total_bookings']}, revenue={summary['revenue']}")
    
    def test_custom_reports_with_date_filter(self, admin_token):
        """Custom reports accepts date_from and date_to filters"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        date_from = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        date_to = datetime.now().strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/admin/reports/custom",
            params={"date_from": date_from, "date_to": date_to},
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["filters"]["date_from"] == date_from
        assert data["filters"]["date_to"] == date_to
        
        print(f"PASSED: Date filter works - from={date_from}, to={date_to}")
    
    def test_custom_reports_with_city_filter(self, admin_token):
        """Custom reports accepts city filter"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.get(
            f"{BASE_URL}/api/admin/reports/custom",
            params={"city": "Mexico"},
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["filters"]["city"] == "Mexico"
        
        print(f"PASSED: City filter works - city=Mexico")
    
    def test_custom_reports_with_category_filter(self, admin_token):
        """Custom reports accepts category filter"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.get(
            f"{BASE_URL}/api/admin/reports/custom",
            params={"category": "Barberia"},
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["filters"]["category"] == "Barberia"
        
        print(f"PASSED: Category filter works - category=Barberia")
    
    def test_custom_reports_daily_chart_structure(self, admin_token):
        """Custom reports daily_chart has correct structure"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/reports/custom", headers=headers)
        assert response.status_code == 200
        
        daily_chart = response.json()["daily_chart"]
        assert isinstance(daily_chart, list), "daily_chart should be a list"
        
        if len(daily_chart) > 0:
            item = daily_chart[0]
            assert "date" in item, "Missing date in daily_chart item"
            assert "bookings" in item, "Missing bookings in daily_chart item"
            assert "revenue" in item, "Missing revenue in daily_chart item"
        
        print(f"PASSED: Daily chart structure - {len(daily_chart)} days")
    
    def test_custom_reports_top_businesses_structure(self, admin_token):
        """Custom reports top_businesses has correct structure"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/reports/custom", headers=headers)
        assert response.status_code == 200
        
        top_businesses = response.json()["top_businesses"]
        assert isinstance(top_businesses, list), "top_businesses should be a list"
        
        if len(top_businesses) > 0:
            item = top_businesses[0]
            assert "business_id" in item, "Missing business_id"
            assert "name" in item, "Missing name"
            assert "city" in item, "Missing city"
            assert "bookings" in item, "Missing bookings"
        
        print(f"PASSED: Top businesses structure - {len(top_businesses)} businesses")
    
    def test_custom_reports_top_cities_structure(self, admin_token):
        """Custom reports top_cities has correct structure"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/reports/custom", headers=headers)
        assert response.status_code == 200
        
        top_cities = response.json()["top_cities"]
        assert isinstance(top_cities, list), "top_cities should be a list"
        
        if len(top_cities) > 0:
            item = top_cities[0]
            assert "city" in item, "Missing city"
            assert "bookings" in item, "Missing bookings"
        
        print(f"PASSED: Top cities structure - {len(top_cities)} cities")


# ============ Fixtures ============

@pytest.fixture(scope="module")
def admin_token():
    """Get admin token with TOTP"""
    import subprocess
    
    # Get TOTP code
    result = subprocess.run(
        ["python3", "/app/scripts/get_admin_totp.py"],
        capture_output=True, text=True
    )
    totp_code = result.stdout.strip()
    
    if not totp_code or not totp_code.isdigit():
        pytest.skip("Could not get TOTP code for admin login")
    
    # Login
    response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
        "email": "zamorachapa50@gmail.com",
        "password": "RainbowLol3133!",
        "totp_code": totp_code
    })
    
    if response.status_code != 200:
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    
    token = response.json().get("token")
    if not token:
        pytest.skip("No token in admin login response")
    
    print(f"Admin token obtained successfully")
    return token


@pytest.fixture(scope="module")
def user_token():
    """Get test user token - user already verified in DB"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "testuser_stats@test.com",
        "password": "TestPass123!"
    })
    
    if response.status_code == 200:
        token = response.json().get("token")
        print(f"User token obtained for testuser_stats@test.com")
        return token
    
    pytest.skip(f"Could not get user token: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def business_token():
    """Get business token - business user already created and verified in DB"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "testbiz_dashboard@test.com",
        "password": "TestBiz123!"
    })
    
    if response.status_code == 200:
        token = response.json().get("token")
        print(f"Business token obtained for testbiz_dashboard@test.com")
        return token
    
    pytest.skip(f"Could not get business token: {response.status_code} - {response.text}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
