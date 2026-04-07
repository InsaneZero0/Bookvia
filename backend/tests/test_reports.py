"""
Test suite for Business Reports/Analytics endpoint
Tests GET /api/businesses/my/reports with different period filters
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
BUSINESS_EMAIL = "testrealstripe@bookvia.com"
BUSINESS_PASSWORD = "Test1234!"
REGULAR_USER_EMAIL = "cliente@bookvia.com"
REGULAR_USER_PASSWORD = "Test1234!"


class TestReportsEndpoint:
    """Tests for GET /api/businesses/my/reports endpoint"""
    
    @pytest.fixture(scope="class")
    def business_token(self):
        """Get business owner authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": BUSINESS_EMAIL,
            "password": BUSINESS_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Business login failed: {response.status_code} - {response.text}")
    
    @pytest.fixture(scope="class")
    def regular_user_token(self):
        """Get regular user authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": REGULAR_USER_EMAIL,
            "password": REGULAR_USER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip(f"User login failed: {response.status_code} - {response.text}")
    
    def test_reports_requires_authentication(self):
        """Test that reports endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/businesses/my/reports")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASSED: Reports endpoint requires authentication (401)")
    
    def test_reports_requires_business_auth(self, regular_user_token):
        """Test that reports endpoint requires business authentication, not regular user"""
        headers = {"Authorization": f"Bearer {regular_user_token}"}
        response = requests.get(f"{BASE_URL}/api/businesses/my/reports", headers=headers)
        # Should return 403 or 401 since regular user is not a business
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASSED: Reports endpoint rejects regular user auth")
    
    def test_reports_default_period_month(self, business_token):
        """Test reports with default period (month/30 days)"""
        headers = {"Authorization": f"Bearer {business_token}"}
        response = requests.get(f"{BASE_URL}/api/businesses/my/reports", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "period" in data, "Response missing 'period' field"
        assert data["period"] == "month", f"Expected period 'month', got '{data['period']}'"
        
        # Verify summary structure
        assert "summary" in data, "Response missing 'summary' field"
        summary = data["summary"]
        required_summary_fields = [
            "total_bookings", "completed", "confirmed", "cancelled",
            "cancel_rate", "revenue", "revenue_change", "bookings_change",
            "cancelled_by_user", "cancelled_by_business"
        ]
        for field in required_summary_fields:
            assert field in summary, f"Summary missing '{field}' field"
        
        # Verify daily_chart structure
        assert "daily_chart" in data, "Response missing 'daily_chart' field"
        assert isinstance(data["daily_chart"], list), "daily_chart should be a list"
        if len(data["daily_chart"]) > 0:
            chart_item = data["daily_chart"][0]
            assert "date" in chart_item, "Chart item missing 'date'"
            assert "revenue" in chart_item, "Chart item missing 'revenue'"
            assert "bookings" in chart_item, "Chart item missing 'bookings'"
        
        # Verify top_services structure
        assert "top_services" in data, "Response missing 'top_services' field"
        assert isinstance(data["top_services"], list), "top_services should be a list"
        
        # Verify top_clients structure
        assert "top_clients" in data, "Response missing 'top_clients' field"
        assert isinstance(data["top_clients"], list), "top_clients should be a list"
        
        # Verify peak_hours structure
        assert "peak_hours" in data, "Response missing 'peak_hours' field"
        assert isinstance(data["peak_hours"], list), "peak_hours should be a list"
        
        # Verify peak_days structure
        assert "peak_days" in data, "Response missing 'peak_days' field"
        assert isinstance(data["peak_days"], list), "peak_days should be a list"
        assert len(data["peak_days"]) == 7, f"peak_days should have 7 items (Mon-Sun), got {len(data['peak_days'])}"
        
        print(f"PASSED: Reports with default period (month) - {summary['total_bookings']} bookings, ${summary['revenue']} revenue")
    
    def test_reports_period_week(self, business_token):
        """Test reports with week period (7 days)"""
        headers = {"Authorization": f"Bearer {business_token}"}
        response = requests.get(f"{BASE_URL}/api/businesses/my/reports?period=week", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["period"] == "week", f"Expected period 'week', got '{data['period']}'"
        assert "summary" in data
        assert "daily_chart" in data
        # Week period should have up to 7 days in chart
        assert len(data["daily_chart"]) <= 7, f"Week chart should have <=7 items, got {len(data['daily_chart'])}"
        
        print(f"PASSED: Reports with period=week - {data['summary']['total_bookings']} bookings")
    
    def test_reports_period_quarter(self, business_token):
        """Test reports with quarter period (90 days)"""
        headers = {"Authorization": f"Bearer {business_token}"}
        response = requests.get(f"{BASE_URL}/api/businesses/my/reports?period=quarter", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["period"] == "quarter", f"Expected period 'quarter', got '{data['period']}'"
        assert "summary" in data
        assert "daily_chart" in data
        # Quarter period chart is capped at 30 days for display
        assert len(data["daily_chart"]) <= 30, f"Quarter chart should have <=30 items, got {len(data['daily_chart'])}"
        
        print(f"PASSED: Reports with period=quarter - {data['summary']['total_bookings']} bookings")
    
    def test_reports_period_year(self, business_token):
        """Test reports with year period (365 days)"""
        headers = {"Authorization": f"Bearer {business_token}"}
        response = requests.get(f"{BASE_URL}/api/businesses/my/reports?period=year", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["period"] == "year", f"Expected period 'year', got '{data['period']}'"
        assert "summary" in data
        assert "daily_chart" in data
        
        print(f"PASSED: Reports with period=year - {data['summary']['total_bookings']} bookings")
    
    def test_reports_top_services_structure(self, business_token):
        """Test that top_services has correct structure when data exists"""
        headers = {"Authorization": f"Bearer {business_token}"}
        response = requests.get(f"{BASE_URL}/api/businesses/my/reports?period=month", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data["top_services"]) > 0:
            service = data["top_services"][0]
            assert "name" in service, "Service missing 'name'"
            assert "bookings" in service, "Service missing 'bookings'"
            assert "revenue" in service, "Service missing 'revenue'"
            print(f"PASSED: Top services structure verified - {len(data['top_services'])} services found")
        else:
            print("PASSED: Top services structure verified (no services in period)")
    
    def test_reports_top_clients_structure(self, business_token):
        """Test that top_clients has correct structure when data exists"""
        headers = {"Authorization": f"Bearer {business_token}"}
        response = requests.get(f"{BASE_URL}/api/businesses/my/reports?period=month", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data["top_clients"]) > 0:
            client = data["top_clients"][0]
            assert "name" in client, "Client missing 'name'"
            assert "email" in client, "Client missing 'email'"
            assert "visits" in client, "Client missing 'visits'"
            assert "total_spent" in client, "Client missing 'total_spent'"
            print(f"PASSED: Top clients structure verified - {len(data['top_clients'])} clients found")
        else:
            print("PASSED: Top clients structure verified (no clients in period)")
    
    def test_reports_peak_hours_structure(self, business_token):
        """Test that peak_hours has correct structure"""
        headers = {"Authorization": f"Bearer {business_token}"}
        response = requests.get(f"{BASE_URL}/api/businesses/my/reports?period=month", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data["peak_hours"]) > 0:
            hour = data["peak_hours"][0]
            assert "hour" in hour, "Peak hour missing 'hour'"
            assert "bookings" in hour, "Peak hour missing 'bookings'"
            # Hour should be in format "HH:00"
            assert ":00" in hour["hour"], f"Hour format should be 'HH:00', got '{hour['hour']}'"
            print(f"PASSED: Peak hours structure verified - {len(data['peak_hours'])} peak hours found")
        else:
            print("PASSED: Peak hours structure verified (no peak hours in period)")
    
    def test_reports_peak_days_structure(self, business_token):
        """Test that peak_days has correct structure with all 7 days"""
        headers = {"Authorization": f"Bearer {business_token}"}
        response = requests.get(f"{BASE_URL}/api/businesses/my/reports?period=month", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        
        assert len(data["peak_days"]) == 7, f"Should have 7 days, got {len(data['peak_days'])}"
        
        expected_days = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"]
        for i, day in enumerate(data["peak_days"]):
            assert "day" in day, f"Day {i} missing 'day'"
            assert "bookings" in day, f"Day {i} missing 'bookings'"
            assert day["day"] == expected_days[i], f"Expected day '{expected_days[i]}', got '{day['day']}'"
        
        print(f"PASSED: Peak days structure verified - all 7 days present")
    
    def test_reports_summary_numeric_values(self, business_token):
        """Test that summary values are numeric and non-negative"""
        headers = {"Authorization": f"Bearer {business_token}"}
        response = requests.get(f"{BASE_URL}/api/businesses/my/reports?period=month", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        summary = data["summary"]
        
        # Check numeric fields are non-negative
        assert summary["total_bookings"] >= 0, "total_bookings should be >= 0"
        assert summary["completed"] >= 0, "completed should be >= 0"
        assert summary["confirmed"] >= 0, "confirmed should be >= 0"
        assert summary["cancelled"] >= 0, "cancelled should be >= 0"
        assert summary["cancel_rate"] >= 0, "cancel_rate should be >= 0"
        assert summary["revenue"] >= 0, "revenue should be >= 0"
        
        # Verify cancelled breakdown adds up
        assert summary["cancelled_by_user"] + summary["cancelled_by_business"] <= summary["cancelled"], \
            "Cancelled breakdown should not exceed total cancelled"
        
        print(f"PASSED: Summary numeric values verified")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
