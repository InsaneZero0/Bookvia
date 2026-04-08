"""
Test P1 Client Features for Bookvia:
1. Reschedule booking (PUT /api/bookings/{id}/reschedule) - only >24h before, no extra payment
2. Payment history (GET /api/payments/my-transactions) - returns TransactionResponse list
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
USER_EMAIL = "cliente@bookvia.com"
USER_PASSWORD = "Test1234!"

class TestPaymentHistory:
    """Test GET /api/payments/my-transactions endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as regular user
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get("token")
        self.user = data.get("user")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_get_my_transactions_authenticated(self):
        """Test that authenticated user can get their transactions"""
        response = self.session.get(f"{BASE_URL}/api/payments/my-transactions")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"User has {len(data)} transactions")
        
        # If there are transactions, validate structure
        if len(data) > 0:
            tx = data[0]
            print(f"Sample transaction: {tx}")
            # Check required fields from TransactionResponse
            assert "id" in tx, "Transaction should have id"
            assert "status" in tx, "Transaction should have status"
            assert "created_at" in tx, "Transaction should have created_at"
            # Check amount field - backend uses amount_total
            assert "amount_total" in tx or "amount" in tx, "Transaction should have amount_total or amount"
    
    def test_get_my_transactions_unauthenticated(self):
        """Test that unauthenticated request returns 401"""
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/payments/my-transactions")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_get_my_transactions_with_status_filter(self):
        """Test filtering transactions by status"""
        # Test with completed status
        response = self.session.get(f"{BASE_URL}/api/payments/my-transactions", params={"status": "paid"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # All returned transactions should have the filtered status
        for tx in data:
            assert tx.get("status") == "paid", f"Expected status 'paid', got {tx.get('status')}"


class TestRescheduleBooking:
    """Test PUT /api/bookings/{id}/reschedule endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as regular user
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get("token")
        self.user = data.get("user")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_reschedule_endpoint_exists(self):
        """Test that reschedule endpoint exists (even with invalid booking)"""
        # Use a fake booking ID to test endpoint existence
        fake_booking_id = "non-existent-booking-id"
        future_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        
        response = self.session.put(
            f"{BASE_URL}/api/bookings/{fake_booking_id}/reschedule",
            params={"new_date": future_date, "new_time": "10:00"}
        )
        # Should return 404 (booking not found), not 405 (method not allowed)
        assert response.status_code in [404, 400], f"Expected 404 or 400, got {response.status_code}: {response.text}"
        print(f"Reschedule endpoint exists, returned {response.status_code} for non-existent booking")
    
    def test_reschedule_requires_auth(self):
        """Test that reschedule requires authentication"""
        session = requests.Session()
        fake_booking_id = "test-booking-id"
        future_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        
        response = session.put(
            f"{BASE_URL}/api/bookings/{fake_booking_id}/reschedule",
            params={"new_date": future_date, "new_time": "10:00"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
    
    def test_get_user_bookings_for_reschedule(self):
        """Get user's upcoming bookings to find one that can be rescheduled"""
        response = self.session.get(f"{BASE_URL}/api/bookings/my", params={"upcoming": "true"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        bookings = response.json()
        print(f"User has {len(bookings)} upcoming bookings")
        
        # Find a confirmed booking with >24h until appointment
        reschedulable = []
        for b in bookings:
            if b.get("status") == "confirmed" and b.get("hours_until_appointment", 0) > 24:
                reschedulable.append(b)
                print(f"Found reschedulable booking: {b.get('id')} - {b.get('date')} {b.get('time')} - hours_until: {b.get('hours_until_appointment')}")
        
        print(f"Found {len(reschedulable)} reschedulable bookings (confirmed, >24h)")
        
        # This test just verifies we can get bookings - actual reschedule test depends on having a valid booking
        return reschedulable


class TestBookingsAPI:
    """Test bookings API for reschedule-related fields"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as regular user
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_bookings_have_hours_until_appointment(self):
        """Test that bookings include hours_until_appointment field"""
        response = self.session.get(f"{BASE_URL}/api/bookings/my", params={"upcoming": "true"})
        assert response.status_code == 200
        
        bookings = response.json()
        if len(bookings) > 0:
            booking = bookings[0]
            # Check that hours_until_appointment is present
            assert "hours_until_appointment" in booking, "Booking should have hours_until_appointment field"
            print(f"Booking {booking.get('id')} has hours_until_appointment: {booking.get('hours_until_appointment')}")
    
    def test_bookings_have_deposit_paid_field(self):
        """Test that bookings include deposit_paid field"""
        response = self.session.get(f"{BASE_URL}/api/bookings/my", params={"upcoming": "true"})
        assert response.status_code == 200
        
        bookings = response.json()
        if len(bookings) > 0:
            booking = bookings[0]
            # Check that deposit_paid is present
            assert "deposit_paid" in booking, "Booking should have deposit_paid field"
            print(f"Booking {booking.get('id')} has deposit_paid: {booking.get('deposit_paid')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
