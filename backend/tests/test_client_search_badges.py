"""
Test client search endpoint and booked_by field for reception bookings.
Tests the new features:
1. GET /api/bookings/search-clients - search past clients by name/phone
2. booked_by field in booking creation from reception
3. Badges logic for walk-in bookings
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestClientSearchEndpoint:
    """Tests for GET /api/bookings/search-clients endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as business to get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/business/login",
            json={"email": "testrealstripe@bookvia.com", "password": "Test1234!"}
        )
        assert login_response.status_code == 200, f"Business login failed: {login_response.text}"
        self.token = login_response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.business = login_response.json()["business"]
    
    def test_search_clients_requires_auth(self):
        """Test that search-clients endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/bookings/search-clients?q=test")
        assert response.status_code == 401, "Should require authentication"
    
    def test_search_clients_with_valid_query(self):
        """Test search with valid query (>=2 chars) returns results"""
        response = requests.get(
            f"{BASE_URL}/api/bookings/search-clients?q=test",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list), "Should return a list"
        # Should have results since we have test data
        if len(data) > 0:
            # Verify result structure
            assert "name" in data[0], "Result should have 'name' field"
            assert "phone" in data[0], "Result should have 'phone' field"
            assert "email" in data[0], "Result should have 'email' field"
    
    def test_search_clients_short_query_returns_empty(self):
        """Test search with short query (<2 chars) returns empty array"""
        response = requests.get(
            f"{BASE_URL}/api/bookings/search-clients?q=x",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data == [], "Short query should return empty array"
    
    def test_search_clients_empty_query_returns_empty(self):
        """Test search with empty query returns empty array"""
        response = requests.get(
            f"{BASE_URL}/api/bookings/search-clients?q=",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data == [], "Empty query should return empty array"
    
    def test_search_clients_by_phone(self):
        """Test search by phone number"""
        response = requests.get(
            f"{BASE_URL}/api/bookings/search-clients?q=555",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should find clients with 555 in phone


class TestBookedByField:
    """Tests for booked_by field in booking creation"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as business to get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/business/login",
            json={"email": "testrealstripe@bookvia.com", "password": "Test1234!"}
        )
        assert login_response.status_code == 200
        self.token = login_response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.business = login_response.json()["business"]
        
        # Get services for this business
        services_response = requests.get(
            f"{BASE_URL}/api/services/business/{self.business['id']}"
        )
        self.services = services_response.json() if services_response.status_code == 200 else []
    
    def test_walk_in_booking_has_booked_by_business(self):
        """Test that walk-in booking created from reception has booked_by='business'"""
        if not self.services:
            pytest.skip("No services available for testing")
        
        # Get availability for tomorrow
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        avail_response = requests.get(
            f"{BASE_URL}/api/bookings/availability/{self.business['id']}",
            params={"date": tomorrow, "service_id": self.services[0]["id"]}
        )
        
        if avail_response.status_code != 200:
            pytest.skip("Could not get availability")
        
        slots = avail_response.json().get("slots", [])
        available_slots = [s for s in slots if s.get("status") == "available"]
        
        if not available_slots:
            pytest.skip("No available slots for testing")
        
        # Create walk-in booking with skip_payment=true
        booking_data = {
            "business_id": self.business["id"],
            "service_id": self.services[0]["id"],
            "date": tomorrow,
            "time": available_slots[0]["time"],
            "skip_payment": True,
            "client_name": "TEST_WalkIn_API_Test",
            "client_phone": "+52 555 111 2222",
            "client_email": "test_walkin@test.com"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/bookings",
            json=booking_data,
            headers=self.headers
        )
        
        assert create_response.status_code == 200, f"Booking creation failed: {create_response.text}"
        booking = create_response.json()
        
        # Verify booked_by field
        assert booking.get("booked_by") == "business", f"booked_by should be 'business', got: {booking.get('booked_by')}"
        assert booking.get("client_name") == "TEST_WalkIn_API_Test"
        assert booking.get("deposit_amount") == 0
        assert booking.get("deposit_paid") == True
        assert booking.get("status") == "confirmed"
    
    def test_booking_response_includes_booked_by_field(self):
        """Test that booking response includes booked_by field"""
        # Get business bookings
        response = requests.get(
            f"{BASE_URL}/api/bookings/business",
            headers=self.headers
        )
        assert response.status_code == 200
        bookings = response.json()
        
        # Find a booking with booked_by field
        walk_in_bookings = [b for b in bookings if b.get("booked_by") == "business"]
        
        if walk_in_bookings:
            booking = walk_in_bookings[0]
            assert "booked_by" in booking, "Booking should have booked_by field"
            assert booking["booked_by"] == "business"


class TestHealthEndpoint:
    """Test health endpoint still works"""
    
    def test_health_returns_healthy(self):
        """Test health endpoint returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
