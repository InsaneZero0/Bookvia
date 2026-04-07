"""
Test Client History Feature - Iteration 46
Tests the GET /api/businesses/my/client-history/{user_id} endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
BUSINESS_EMAIL = "testrealstripe@bookvia.com"
BUSINESS_PASSWORD = "Test1234!"
REGULAR_USER_EMAIL = "cliente@bookvia.com"
REGULAR_USER_PASSWORD = "Test1234!"
TEST_USER_ID = "b14a5336-bbba-448a-87b6-030fc6115729"  # User with 3 confirmed bookings


class TestClientHistoryEndpoint:
    """Tests for GET /api/businesses/my/client-history/{user_id}"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def get_business_token(self):
        """Login as business owner and get token"""
        response = self.session.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": BUSINESS_EMAIL,
            "password": BUSINESS_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        return None
    
    def get_user_token(self):
        """Login as regular user and get token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": REGULAR_USER_EMAIL,
            "password": REGULAR_USER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        return None
    
    def test_client_history_requires_auth(self):
        """Test that endpoint requires authentication"""
        response = self.session.get(f"{BASE_URL}/api/businesses/my/client-history/{TEST_USER_ID}")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASSED: Endpoint requires authentication (401)")
    
    def test_client_history_rejects_regular_user(self):
        """Test that regular users cannot access client history"""
        token = self.get_user_token()
        if not token:
            pytest.skip("Could not get user token")
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/businesses/my/client-history/{TEST_USER_ID}")
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("PASSED: Regular user rejected (403)")
    
    def test_client_history_returns_correct_structure(self):
        """Test that endpoint returns correct data structure"""
        token = self.get_business_token()
        if not token:
            pytest.skip("Could not get business token")
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/businesses/my/client-history/{TEST_USER_ID}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify required fields exist
        assert "total_visits" in data, "Missing total_visits field"
        assert "total_spent" in data, "Missing total_spent field"
        assert "total_cancelled" in data, "Missing total_cancelled field"
        assert "first_visit" in data, "Missing first_visit field"
        assert "last_visit" in data, "Missing last_visit field"
        assert "history" in data, "Missing history field"
        
        print(f"PASSED: Response structure correct - total_visits={data['total_visits']}, total_spent={data['total_spent']}, total_cancelled={data['total_cancelled']}")
    
    def test_client_history_values_are_correct_types(self):
        """Test that returned values have correct types"""
        token = self.get_business_token()
        if not token:
            pytest.skip("Could not get business token")
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/businesses/my/client-history/{TEST_USER_ID}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Type checks
        assert isinstance(data["total_visits"], int), f"total_visits should be int, got {type(data['total_visits'])}"
        assert isinstance(data["total_spent"], (int, float)), f"total_spent should be numeric, got {type(data['total_spent'])}"
        assert isinstance(data["total_cancelled"], int), f"total_cancelled should be int, got {type(data['total_cancelled'])}"
        assert isinstance(data["history"], list), f"history should be list, got {type(data['history'])}"
        
        # Values should be non-negative
        assert data["total_visits"] >= 0, "total_visits should be non-negative"
        assert data["total_spent"] >= 0, "total_spent should be non-negative"
        assert data["total_cancelled"] >= 0, "total_cancelled should be non-negative"
        
        print(f"PASSED: Value types correct - visits={data['total_visits']}, spent=${data['total_spent']}, cancelled={data['total_cancelled']}")
    
    def test_client_history_list_structure(self):
        """Test that history list items have correct structure"""
        token = self.get_business_token()
        if not token:
            pytest.skip("Could not get business token")
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/businesses/my/client-history/{TEST_USER_ID}")
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data["history"]) > 0:
            item = data["history"][0]
            # Verify history item structure
            assert "service_name" in item, "History item missing service_name"
            assert "date" in item, "History item missing date"
            assert "time" in item, "History item missing time"
            assert "status" in item, "History item missing status"
            assert "amount" in item, "History item missing amount"
            
            print(f"PASSED: History item structure correct - {len(data['history'])} items found")
            print(f"  Sample: {item['service_name']} on {item['date']} at {item['time']} - {item['status']} - ${item['amount']}")
        else:
            print("PASSED: History list structure correct (empty list)")
    
    def test_client_history_nonexistent_user(self):
        """Test response for non-existent user ID"""
        token = self.get_business_token()
        if not token:
            pytest.skip("Could not get business token")
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        fake_user_id = "00000000-0000-0000-0000-000000000000"
        response = self.session.get(f"{BASE_URL}/api/businesses/my/client-history/{fake_user_id}")
        
        # Should return 200 with empty history (user exists but no bookings)
        # or could return 404 if user doesn't exist
        assert response.status_code in [200, 404], f"Expected 200 or 404, got {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            assert data["total_visits"] == 0, "Non-existent user should have 0 visits"
            assert data["total_spent"] == 0, "Non-existent user should have 0 spent"
            print("PASSED: Non-existent user returns empty history")
        else:
            print("PASSED: Non-existent user returns 404")
    
    def test_client_history_first_last_visit_dates(self):
        """Test that first_visit and last_visit dates are valid"""
        token = self.get_business_token()
        if not token:
            pytest.skip("Could not get business token")
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/businesses/my/client-history/{TEST_USER_ID}")
        
        assert response.status_code == 200
        data = response.json()
        
        if data["total_visits"] > 0:
            # If there are visits, dates should be present
            assert data["first_visit"] is not None, "first_visit should not be None when visits > 0"
            assert data["last_visit"] is not None, "last_visit should not be None when visits > 0"
            
            # Dates should be in YYYY-MM-DD format
            import re
            date_pattern = r'^\d{4}-\d{2}-\d{2}$'
            assert re.match(date_pattern, data["first_visit"]), f"first_visit format invalid: {data['first_visit']}"
            assert re.match(date_pattern, data["last_visit"]), f"last_visit format invalid: {data['last_visit']}"
            
            print(f"PASSED: Visit dates valid - first: {data['first_visit']}, last: {data['last_visit']}")
        else:
            print("PASSED: No visits, dates check skipped")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
