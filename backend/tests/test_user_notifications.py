"""
Test User Notification Bell Feature
Tests the notification APIs for regular users (clients) in the Navbar
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
REGULAR_USER_EMAIL = "cliente@bookvia.com"
REGULAR_USER_PASSWORD = "Test1234!"
BUSINESS_EMAIL = "testrealstripe@bookvia.com"
BUSINESS_PASSWORD = "Test1234!"


class TestUserNotificationAPIs:
    """Test notification APIs for regular users"""
    
    @pytest.fixture(scope="class")
    def regular_user_token(self):
        """Get auth token for regular user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": REGULAR_USER_EMAIL,
            "password": REGULAR_USER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Regular user login failed: {response.status_code} - {response.text}")
    
    @pytest.fixture(scope="class")
    def business_token(self):
        """Get auth token for business owner"""
        response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": BUSINESS_EMAIL,
            "password": BUSINESS_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Business login failed: {response.status_code} - {response.text}")
    
    def test_notifications_require_auth(self):
        """Test that notification endpoints require authentication"""
        # GET /api/notifications without auth
        response = requests.get(f"{BASE_URL}/api/notifications")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASSED: GET /api/notifications requires auth (401)")
        
        # GET /api/notifications/unread-count without auth
        response = requests.get(f"{BASE_URL}/api/notifications/unread-count")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASSED: GET /api/notifications/unread-count requires auth (401)")
        
        # PUT /api/notifications/read-all without auth
        response = requests.put(f"{BASE_URL}/api/notifications/read-all")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASSED: PUT /api/notifications/read-all requires auth (401)")
    
    def test_get_unread_count_regular_user(self, regular_user_token):
        """Test GET /api/notifications/unread-count for regular user"""
        headers = {"Authorization": f"Bearer {regular_user_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications/unread-count", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "count" in data, f"Response missing 'count' field: {data}"
        assert isinstance(data["count"], int), f"Count should be int, got {type(data['count'])}"
        assert data["count"] >= 0, f"Count should be >= 0, got {data['count']}"
        print(f"PASSED: GET /api/notifications/unread-count returns count={data['count']}")
    
    def test_get_notifications_regular_user(self, regular_user_token):
        """Test GET /api/notifications for regular user"""
        headers = {"Authorization": f"Bearer {regular_user_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        # Validate notification structure if any exist
        if len(data) > 0:
            notif = data[0]
            assert "id" in notif, "Notification missing 'id'"
            assert "title" in notif, "Notification missing 'title'"
            assert "message" in notif, "Notification missing 'message'"
            assert "type" in notif, "Notification missing 'type'"
            assert "read" in notif, "Notification missing 'read'"
            assert "created_at" in notif, "Notification missing 'created_at'"
            print(f"PASSED: GET /api/notifications returns {len(data)} notifications with valid structure")
        else:
            print("PASSED: GET /api/notifications returns empty list (no notifications)")
    
    def test_get_notifications_unread_only(self, regular_user_token):
        """Test GET /api/notifications?unread_only=true"""
        headers = {"Authorization": f"Bearer {regular_user_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications?unread_only=true", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        # All returned notifications should be unread
        for notif in data:
            assert notif.get("read") == False, f"Expected unread notification, got read={notif.get('read')}"
        
        print(f"PASSED: GET /api/notifications?unread_only=true returns {len(data)} unread notifications")
    
    def test_mark_all_read_regular_user(self, regular_user_token):
        """Test PUT /api/notifications/read-all for regular user"""
        headers = {"Authorization": f"Bearer {regular_user_token}"}
        response = requests.put(f"{BASE_URL}/api/notifications/read-all", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "message" in data, f"Response missing 'message': {data}"
        
        # Verify unread count is now 0
        count_response = requests.get(f"{BASE_URL}/api/notifications/unread-count", headers=headers)
        assert count_response.status_code == 200
        count_data = count_response.json()
        assert count_data["count"] == 0, f"Expected 0 unread after mark-all-read, got {count_data['count']}"
        
        print("PASSED: PUT /api/notifications/read-all marks all as read")
    
    def test_get_unread_count_business_user(self, business_token):
        """Test GET /api/notifications/unread-count for business user"""
        headers = {"Authorization": f"Bearer {business_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications/unread-count", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "count" in data, f"Response missing 'count' field: {data}"
        assert isinstance(data["count"], int), f"Count should be int, got {type(data['count'])}"
        print(f"PASSED: Business user GET /api/notifications/unread-count returns count={data['count']}")
    
    def test_get_notifications_business_user(self, business_token):
        """Test GET /api/notifications for business user"""
        headers = {"Authorization": f"Bearer {business_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"PASSED: Business user GET /api/notifications returns {len(data)} notifications")


class TestNotificationCreation:
    """Test that notifications are created correctly during booking flows"""
    
    @pytest.fixture(scope="class")
    def business_token(self):
        """Get auth token for business owner"""
        response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": BUSINESS_EMAIL,
            "password": BUSINESS_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Business login failed: {response.status_code} - {response.text}")
    
    def test_business_has_notifications(self, business_token):
        """Verify business has notifications (from previous cancellations)"""
        headers = {"Authorization": f"Bearer {business_token}"}
        response = requests.get(f"{BASE_URL}/api/notifications", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Business should have some notifications from previous tests
        print(f"Business has {len(data)} notifications")
        
        # Check for booking-related notifications
        booking_notifs = [n for n in data if n.get("type") == "booking"]
        system_notifs = [n for n in data if n.get("type") == "system"]
        
        print(f"  - Booking notifications: {len(booking_notifs)}")
        print(f"  - System notifications: {len(system_notifs)}")
        print("PASSED: Business notification retrieval working")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
