"""
Test Payment Checkout Status Endpoint with Fallback Logic - Simplified
Tests the P0 bug fix: GET /api/payments/checkout/status/{session_id}
Uses existing test business (fbb3d0e3-37f2-417b-8cfa-b7fbf24f1ee0) for faster testing
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Existing test business from previous iterations
EXISTING_BUSINESS_ID = "fbb3d0e3-37f2-417b-8cfa-b7fbf24f1ee0"


@pytest.fixture(scope="module")
def session():
    """Shared requests session"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def test_user_token(session):
    """Create a new test user and return token"""
    unique_id = str(uuid.uuid4())[:8]
    email = f"test_payment_{unique_id}@bookvia.com"
    password = "Test1234!"
    
    register_resp = session.post(f"{BASE_URL}/api/auth/register", json={
        "email": email,
        "password": password,
        "full_name": "Test Payment User",
        "phone": f"+5212345{unique_id}",
        "role": "user"
    })
    
    if register_resp.status_code in [200, 201]:
        return register_resp.json()["token"]
    
    pytest.skip(f"Could not create test user: {register_resp.text}")


@pytest.fixture(scope="module")
def existing_business_token(session):
    """Login with existing test business"""
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "testrealstripe@bookvia.com",
        "password": "Test1234!"
    })
    if login_resp.status_code == 200:
        return login_resp.json()["token"]
    pytest.skip("Could not login with existing test business")


@pytest.fixture(scope="module")
def existing_user_token(session):
    """Login with existing test user"""
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "test@example.com",
        "password": "test123456"
    })
    if login_resp.status_code == 200:
        return login_resp.json()["token"]
    pytest.skip("Could not login with existing test user")


@pytest.fixture(scope="module")
def admin_token(session):
    """Get admin token"""
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "zamorachapa50@gmail.com",
        "password": "RainbowLol3133!"
    })
    if login_resp.status_code == 200:
        return login_resp.json()["token"]
    pytest.skip("Could not login as admin")


@pytest.fixture(scope="module")
def service_id(session):
    """Get a service from existing business"""
    services_resp = session.get(f"{BASE_URL}/api/services/business/{EXISTING_BUSINESS_ID}")
    if services_resp.status_code == 200:
        services = services_resp.json()
        if services:
            return services[0]["id"]
    pytest.skip("No services found for existing business")


@pytest.fixture(scope="module")
def worker_id(session, existing_business_token):
    """Get a worker from existing business"""
    # Workers endpoint is at /businesses/{business_id}/workers
    workers_resp = session.get(f"{BASE_URL}/api/businesses/{EXISTING_BUSINESS_ID}/workers")
    if workers_resp.status_code == 200:
        workers = workers_resp.json()
        if workers:
            return workers[0]["id"]
    pytest.skip("No workers found for existing business")


# ============ TESTS ============

class TestHealthAndBasics:
    """Basic health and auth tests"""
    
    def test_health_check(self, session):
        """Test API is healthy"""
        resp = session.get(f"{BASE_URL}/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        print("PASSED: Health check")
    
    def test_deposit_checkout_requires_auth(self, session):
        """Test deposit checkout requires authentication"""
        checkout_resp = session.post(f"{BASE_URL}/api/payments/deposit/checkout", json={
            "booking_id": "some-booking-id"
        })
        assert checkout_resp.status_code == 401
        print("PASSED: Deposit checkout requires auth")
    
    def test_deposit_checkout_invalid_booking(self, session, test_user_token):
        """Test deposit checkout with invalid booking returns 404"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        checkout_resp = session.post(f"{BASE_URL}/api/payments/deposit/checkout", headers=headers, json={
            "booking_id": "nonexistent-booking-id"
        })
        assert checkout_resp.status_code == 404
        print("PASSED: Invalid booking returns 404")
    
    def test_deposit_checkout_requires_booking_id(self, session, test_user_token):
        """Test deposit checkout requires booking_id"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        checkout_resp = session.post(f"{BASE_URL}/api/payments/deposit/checkout", headers=headers, json={})
        assert checkout_resp.status_code == 422
        print("PASSED: Missing booking_id returns 422")
    
    def test_checkout_status_invalid_session(self, session, test_user_token):
        """Test checkout status with invalid session returns error"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        status_resp = session.get(f"{BASE_URL}/api/payments/checkout/status/invalid_session_id", headers=headers)
        assert status_resp.status_code == 400
        print("PASSED: Invalid session returns 400 error")


class TestWebhookEndpoint:
    """Test Stripe webhook endpoint"""
    
    def test_webhook_endpoint_exists(self, session):
        """Test webhook endpoint exists and accepts POST"""
        resp = session.post(f"{BASE_URL}/api/webhook/stripe", json={})
        assert resp.status_code != 404, "Webhook endpoint not found"
        print(f"PASSED: Webhook endpoint exists (status: {resp.status_code})")
    
    def test_webhook_handles_invalid_event(self, session):
        """Test webhook handles invalid event gracefully"""
        resp = session.post(f"{BASE_URL}/api/webhook/stripe", json={
            "type": "invalid.event",
            "data": {}
        })
        assert resp.status_code != 500, f"Webhook crashed on invalid event: {resp.text}"
        print(f"PASSED: Webhook handles invalid event (status: {resp.status_code})")


class TestBookingCreationFlow:
    """Test booking creation and payment flow"""
    
    def test_create_booking_hold_status(self, session, test_user_token, service_id, worker_id):
        """Test creating a booking results in HOLD status"""
        headers = {"Authorization": f"Bearer {test_user_token}"}
        
        # Get a future date
        future_date = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")
        
        booking_resp = session.post(f"{BASE_URL}/api/bookings", headers=headers, json={
            "business_id": EXISTING_BUSINESS_ID,
            "service_id": service_id,
            "worker_id": worker_id,
            "date": future_date,
            "time": "11:00",
            "notes": "Test booking for payment testing"
        })
        
        assert booking_resp.status_code in [200, 201], f"Failed to create booking: {booking_resp.text}"
        booking = booking_resp.json()
        
        assert booking["status"] == "hold", f"Expected status 'hold', got '{booking['status']}'"
        assert booking["deposit_paid"] == False
        assert "hold_expires_at" in booking
        
        # Store for later tests
        TestBookingCreationFlow.test_booking_id = booking["id"]
        print(f"PASSED: Created booking {booking['id']} with status 'hold'")
    
    def test_create_deposit_checkout(self, session, test_user_token):
        """Test creating deposit checkout session"""
        if not hasattr(TestBookingCreationFlow, 'test_booking_id'):
            pytest.skip("No test booking available")
        
        headers = {"Authorization": f"Bearer {test_user_token}"}
        booking_id = TestBookingCreationFlow.test_booking_id
        
        checkout_resp = session.post(f"{BASE_URL}/api/payments/deposit/checkout", headers=headers, json={
            "booking_id": booking_id
        })
        
        assert checkout_resp.status_code == 200, f"Failed to create checkout: {checkout_resp.text}"
        checkout = checkout_resp.json()
        
        assert "url" in checkout, "Missing checkout URL"
        assert "session_id" in checkout, "Missing session_id"
        assert checkout["session_id"].startswith("cs_"), f"Invalid session_id format: {checkout['session_id']}"
        
        # Store session_id for later tests
        TestBookingCreationFlow.stripe_session_id = checkout["session_id"]
        print(f"PASSED: Created checkout session {checkout['session_id']}")
    
    def test_checkout_status_endpoint_returns_data(self, session, test_user_token):
        """Test checkout status endpoint returns correct data"""
        if not hasattr(TestBookingCreationFlow, 'stripe_session_id'):
            pytest.skip("No stripe session available")
        
        headers = {"Authorization": f"Bearer {test_user_token}"}
        session_id = TestBookingCreationFlow.stripe_session_id
        
        status_resp = session.get(f"{BASE_URL}/api/payments/checkout/status/{session_id}", headers=headers)
        
        assert status_resp.status_code == 200, f"Failed to get checkout status: {status_resp.text}"
        status = status_resp.json()
        
        # Verify response structure
        assert "status" in status, "Missing 'status' field"
        assert "payment_status" in status, "Missing 'payment_status' field"
        assert "amount_total" in status, "Missing 'amount_total' field"
        assert "currency" in status, "Missing 'currency' field"
        assert "transaction_id" in status, "Missing 'transaction_id' field"
        assert "booking_id" in status, "Missing 'booking_id' field"
        
        # Since we haven't paid, status should be unpaid
        assert status["payment_status"] == "unpaid", f"Expected 'unpaid', got '{status['payment_status']}'"
        
        print(f"PASSED: Checkout status endpoint returns correct data structure")
    
    def test_my_bookings_shows_hold_booking(self, session, test_user_token):
        """Test user's bookings endpoint shows the hold booking"""
        if not hasattr(TestBookingCreationFlow, 'test_booking_id'):
            pytest.skip("No test booking available")
        
        headers = {"Authorization": f"Bearer {test_user_token}"}
        
        bookings_resp = session.get(f"{BASE_URL}/api/bookings/my", headers=headers)
        
        assert bookings_resp.status_code == 200, f"Failed to get bookings: {bookings_resp.text}"
        bookings = bookings_resp.json()
        
        # Find our test booking
        test_booking_id = TestBookingCreationFlow.test_booking_id
        found = next((b for b in bookings if b["id"] == test_booking_id), None)
        
        assert found is not None, f"Test booking {test_booking_id} not found in user's bookings"
        assert found["status"] == "hold", f"Expected status 'hold', got '{found['status']}'"
        
        print(f"PASSED: User's bookings shows hold booking")
    
    def test_idempotent_checkout_creation(self, session, test_user_token):
        """Test creating checkout for same booking returns existing session"""
        if not hasattr(TestBookingCreationFlow, 'test_booking_id'):
            pytest.skip("No test booking available")
        
        headers = {"Authorization": f"Bearer {test_user_token}"}
        booking_id = TestBookingCreationFlow.test_booking_id
        
        # Create checkout again
        checkout_resp = session.post(f"{BASE_URL}/api/payments/deposit/checkout", headers=headers, json={
            "booking_id": booking_id
        })
        
        assert checkout_resp.status_code == 200, f"Failed to create checkout: {checkout_resp.text}"
        checkout = checkout_resp.json()
        
        # Should return existing session
        assert checkout.get("existing") == True or checkout["session_id"] == TestBookingCreationFlow.stripe_session_id, \
            "Expected existing session to be returned"
        
        print("PASSED: Idempotent checkout creation returns existing session")


class TestBusinessSkipPayment:
    """Test business can create bookings without payment"""
    
    def test_business_skip_payment_booking(self, session, existing_business_token, service_id, worker_id):
        """Test business can create booking with skip_payment=true"""
        headers = {"Authorization": f"Bearer {existing_business_token}"}
        
        future_date = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")
        
        booking_resp = session.post(f"{BASE_URL}/api/bookings", headers=headers, json={
            "business_id": EXISTING_BUSINESS_ID,
            "service_id": service_id,
            "worker_id": worker_id,
            "date": future_date,
            "time": "15:00",
            "notes": "Business created booking",
            "skip_payment": True,
            "client_name": "Walk-in Client",
            "client_phone": "+521234567890"
        })
        
        assert booking_resp.status_code in [200, 201], f"Failed to create booking: {booking_resp.text}"
        booking = booking_resp.json()
        
        # Business bookings with skip_payment should be confirmed directly
        assert booking["status"] == "confirmed", f"Expected status 'confirmed', got '{booking['status']}'"
        assert booking["deposit_paid"] == True
        
        TestBusinessSkipPayment.biz_booking_id = booking["id"]
        print(f"PASSED: Business created confirmed booking with skip_payment")
    
    def test_business_dashboard_shows_stats(self, session, existing_business_token):
        """Test business dashboard shows stats including confirmed bookings"""
        headers = {"Authorization": f"Bearer {existing_business_token}"}
        
        stats_resp = session.get(f"{BASE_URL}/api/businesses/me/dashboard", headers=headers)
        
        assert stats_resp.status_code == 200, f"Failed to get dashboard: {stats_resp.text}"
        data = stats_resp.json()
        
        # Verify stats structure
        assert "stats" in data, "Missing 'stats' in dashboard response"
        assert "total_appointments" in data["stats"], "Missing total_appointments stat"
        assert "today_appointments" in data["stats"], "Missing today_appointments stat"
        
        print(f"PASSED: Business dashboard shows stats")


class TestExistingUserFlow:
    """Test with existing users from previous iterations"""
    
    def test_existing_user_can_view_bookings(self, session, existing_user_token):
        """Test existing user can view their bookings"""
        headers = {"Authorization": f"Bearer {existing_user_token}"}
        
        bookings_resp = session.get(f"{BASE_URL}/api/bookings/my", headers=headers)
        
        assert bookings_resp.status_code == 200, f"Failed to get bookings: {bookings_resp.text}"
        print("PASSED: Existing user can view bookings")
    
    def test_existing_business_can_view_bookings(self, session, existing_business_token):
        """Test existing business can view their bookings"""
        headers = {"Authorization": f"Bearer {existing_business_token}"}
        
        bookings_resp = session.get(f"{BASE_URL}/api/bookings/business", headers=headers)
        
        assert bookings_resp.status_code == 200, f"Failed to get bookings: {bookings_resp.text}"
        print("PASSED: Existing business can view bookings")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
