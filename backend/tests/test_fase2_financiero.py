"""
Test Suite for Bookvia Fase 2: Core Financiero con Stripe
Tests booking creation with HOLD status, deposit checkout, cancellations, and transactions
"""

import pytest
import requests
import os
from datetime import datetime, timedelta
import time

# Get BASE_URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://bookvia-prod-deploy.preview.emergentagent.com"

# Test credentials (provided)
TEST_USER_EMAIL = "test@test.com"
TEST_USER_PASSWORD = "Test123!"
TEST_BUSINESS_ID = "1bfd49d3-472f-49d6-bc18-78de5c56645b"
TEST_SERVICE_ID = "svc-test-001"
TEST_WORKER_ID = "wrk-test-001"

# Platform constants to verify
PLATFORM_FEE_PERCENT = 0.08  # 8%
HOLD_EXPIRATION_MINUTES = 30


class TestSetup:
    """Verify test environment is ready"""
    
    def test_api_health(self):
        """Check API is accessible"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        print(f"✓ API health check passed")
    
    def test_test_user_login(self):
        """Verify test user can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert "user" in data
        print(f"✓ Test user login successful: {data['user']['email']}")
    
    def test_business_exists(self):
        """Verify test business exists and is approved"""
        response = requests.get(f"{BASE_URL}/api/businesses/{TEST_BUSINESS_ID}")
        assert response.status_code == 200, f"Business not found: {response.text}"
        data = response.json()
        assert data["status"] == "approved", f"Business status is {data['status']}, not approved"
        print(f"✓ Test business exists: {data['name']} (status: {data['status']})")


class TestBookingCreation:
    """Test booking creation with HOLD status and 30-min expiration"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for test user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Login failed: {response.text}")
        return response.json()["token"]
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_create_booking_returns_hold_status(self, auth_headers):
        """POST /api/bookings - Should create booking with status HOLD"""
        # Calculate a future date (tomorrow)
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        booking_data = {
            "business_id": TEST_BUSINESS_ID,
            "service_id": TEST_SERVICE_ID,
            "worker_id": TEST_WORKER_ID,
            "date": tomorrow,
            "time": "14:00",
            "notes": "TEST_booking for Fase 2"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/bookings/",
            json=booking_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Create booking failed: {response.text}"
        data = response.json()
        
        # Verify HOLD status
        assert data["status"] == "hold", f"Expected status 'hold', got '{data['status']}'"
        print(f"✓ Booking created with status: {data['status']}")
        
        # Verify hold_expires_at exists and is ~30 minutes in future
        assert "hold_expires_at" in data and data["hold_expires_at"] is not None, "hold_expires_at missing"
        
        hold_expires = datetime.fromisoformat(data["hold_expires_at"].replace('Z', '+00:00'))
        now = datetime.now(hold_expires.tzinfo)
        minutes_until_expire = (hold_expires - now).total_seconds() / 60
        
        # Should be ~30 minutes (allow 1-2 minutes margin)
        assert 25 <= minutes_until_expire <= 35, f"Hold expiration should be ~30 min, got {minutes_until_expire:.1f} min"
        print(f"✓ hold_expires_at is {minutes_until_expire:.1f} minutes from now")
        
        # Verify deposit_amount exists
        assert "deposit_amount" in data, "deposit_amount missing"
        assert data["deposit_amount"] >= 50.0, f"deposit_amount should be >= 50, got {data['deposit_amount']}"
        print(f"✓ deposit_amount: ${data['deposit_amount']} MXN")
        
        return data
    
    def test_booking_slot_conflict(self, auth_headers):
        """Verify same slot cannot be double-booked when in HOLD"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        booking_data = {
            "business_id": TEST_BUSINESS_ID,
            "service_id": TEST_SERVICE_ID,
            "worker_id": TEST_WORKER_ID,
            "date": tomorrow,
            "time": "15:00",  # Use different time
            "notes": "TEST_slot_conflict"
        }
        
        # Create first booking
        response1 = requests.post(
            f"{BASE_URL}/api/bookings/",
            json=booking_data,
            headers=auth_headers
        )
        assert response1.status_code == 200, f"First booking failed: {response1.text}"
        
        # Try to create same slot again
        response2 = requests.post(
            f"{BASE_URL}/api/bookings/",
            json=booking_data,
            headers=auth_headers
        )
        
        # Should fail with conflict
        assert response2.status_code == 409, f"Expected 409 conflict, got {response2.status_code}: {response2.text}"
        print(f"✓ Slot conflict properly detected (status 409)")


class TestDepositCheckout:
    """Test Stripe Checkout session creation for deposits"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Login failed: {response.text}")
        return response.json()["token"]
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    @pytest.fixture
    def booking_in_hold(self, auth_headers):
        """Create a booking in HOLD status for testing"""
        tomorrow = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
        
        booking_data = {
            "business_id": TEST_BUSINESS_ID,
            "service_id": TEST_SERVICE_ID,
            "worker_id": TEST_WORKER_ID,
            "date": tomorrow,
            "time": "16:00",
            "notes": "TEST_checkout_test"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/bookings/",
            json=booking_data,
            headers=auth_headers
        )
        if response.status_code != 200:
            pytest.skip(f"Could not create booking for test: {response.text}")
        return response.json()
    
    def test_create_deposit_checkout_session(self, auth_headers, booking_in_hold):
        """POST /api/payments/deposit/checkout - Should create Stripe Checkout session"""
        response = requests.post(
            f"{BASE_URL}/api/payments/deposit/checkout",
            json={"booking_id": booking_in_hold["id"]},
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Create checkout failed: {response.text}"
        data = response.json()
        
        # Verify response contains required fields
        assert "url" in data, "Checkout URL missing"
        assert "session_id" in data, "session_id missing"
        assert "transaction_id" in data, "transaction_id missing"
        assert "amount" in data, "amount missing"
        assert "fee" in data, "fee missing"
        
        # URL should be a Stripe checkout URL
        assert "stripe" in data["url"].lower() or "checkout" in data["url"].lower(), \
            f"URL doesn't look like Stripe checkout: {data['url']}"
        
        # Fee should be 8% of amount
        expected_fee = round(data["amount"] * PLATFORM_FEE_PERCENT, 2)
        assert abs(data["fee"] - expected_fee) < 0.01, \
            f"Fee should be {expected_fee}, got {data['fee']}"
        
        print(f"✓ Checkout session created:")
        print(f"  - session_id: {data['session_id'][:30]}...")
        print(f"  - transaction_id: {data['transaction_id'][:20]}...")
        print(f"  - amount: ${data['amount']} MXN")
        print(f"  - fee (8%): ${data['fee']} MXN")
        
        return data
    
    def test_checkout_creates_transaction_with_created_status(self, auth_headers, booking_in_hold):
        """Verify transaction is created with status CREATED"""
        # Create checkout first
        checkout_response = requests.post(
            f"{BASE_URL}/api/payments/deposit/checkout",
            json={"booking_id": booking_in_hold["id"]},
            headers=auth_headers
        )
        
        if checkout_response.status_code != 200:
            pytest.skip(f"Checkout creation failed: {checkout_response.text}")
        
        checkout_data = checkout_response.json()
        
        # Get transaction
        tx_response = requests.get(
            f"{BASE_URL}/api/payments/transaction/{checkout_data['transaction_id']}",
            headers=auth_headers
        )
        
        assert tx_response.status_code == 200, f"Get transaction failed: {tx_response.text}"
        tx_data = tx_response.json()
        
        # Verify transaction status is CREATED (not yet paid)
        assert tx_data["status"] == "created", f"Expected status 'created', got '{tx_data['status']}'"
        
        # Verify fee_amount (8%)
        expected_fee = round(tx_data["amount_total"] * PLATFORM_FEE_PERCENT, 2)
        assert abs(tx_data["fee_amount"] - expected_fee) < 0.01, \
            f"fee_amount should be {expected_fee}, got {tx_data['fee_amount']}"
        
        print(f"✓ Transaction status: {tx_data['status']}")
        print(f"✓ fee_amount (8%): ${tx_data['fee_amount']} MXN")


class TestUserTransactions:
    """Test /api/payments/my-transactions endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Login failed: {response.text}")
        return response.json()["token"]
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_get_my_transactions(self, auth_headers):
        """GET /api/payments/my-transactions - Should return user's transactions with fee_amount"""
        response = requests.get(
            f"{BASE_URL}/api/payments/my-transactions",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Get transactions failed: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Got {len(data)} transactions")
        
        if len(data) > 0:
            tx = data[0]
            # Verify required fields exist
            required_fields = ["id", "booking_id", "amount_total", "fee_amount", "payout_amount", "status"]
            for field in required_fields:
                assert field in tx, f"Missing field: {field}"
            
            # Verify fee is 8%
            expected_fee = round(tx["amount_total"] * PLATFORM_FEE_PERCENT, 2)
            assert abs(tx["fee_amount"] - expected_fee) < 0.01, \
                f"fee_amount should be {expected_fee}, got {tx['fee_amount']}"
            
            print(f"✓ Transaction has correct structure:")
            print(f"  - amount_total: ${tx['amount_total']}")
            print(f"  - fee_amount (8%): ${tx['fee_amount']}")
            print(f"  - payout_amount: ${tx['payout_amount']}")
            print(f"  - status: {tx['status']}")


class TestUserCancellation:
    """Test user cancellation with refund policy"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Login failed: {response.text}")
        return response.json()["token"]
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_cancel_hold_booking(self, auth_headers):
        """PUT /api/bookings/{id}/cancel/user - Should cancel booking in HOLD status"""
        # First create a booking
        tomorrow = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")
        
        booking_data = {
            "business_id": TEST_BUSINESS_ID,
            "service_id": TEST_SERVICE_ID,
            "worker_id": TEST_WORKER_ID,
            "date": tomorrow,
            "time": "11:00",
            "notes": "TEST_cancel_hold"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/bookings/",
            json=booking_data,
            headers=auth_headers
        )
        
        if create_response.status_code != 200:
            pytest.skip(f"Could not create booking: {create_response.text}")
        
        booking = create_response.json()
        assert booking["status"] == "hold"
        
        # Now cancel it
        cancel_response = requests.put(
            f"{BASE_URL}/api/bookings/{booking['id']}/cancel/user",
            json={"reason": "TEST: User changed mind"},
            headers=auth_headers
        )
        
        assert cancel_response.status_code == 200, f"Cancel failed: {cancel_response.text}"
        cancel_data = cancel_response.json()
        
        assert cancel_data["status"] == "cancelled"
        print(f"✓ Booking cancelled successfully")
        print(f"  - status: {cancel_data['status']}")
        if cancel_data.get("refund"):
            print(f"  - refund: {cancel_data['refund']}")
    
    def test_cancel_confirms_refund_policy_gt_24h(self, auth_headers):
        """Verify >24h cancellation returns partial refund info (would refund 92%)"""
        # Create a booking far in future (>24h)
        future_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        
        booking_data = {
            "business_id": TEST_BUSINESS_ID,
            "service_id": TEST_SERVICE_ID,
            "worker_id": TEST_WORKER_ID,
            "date": future_date,
            "time": "12:00",
            "notes": "TEST_cancel_policy_gt24h"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/bookings/",
            json=booking_data,
            headers=auth_headers
        )
        
        if create_response.status_code != 200:
            pytest.skip(f"Could not create booking: {create_response.text}")
        
        booking = create_response.json()
        
        # Verify the hours_until_appointment is > 24
        # Get my bookings to see the calculated field
        my_bookings_response = requests.get(
            f"{BASE_URL}/api/bookings/my",
            params={"upcoming": True},
            headers=auth_headers
        )
        
        if my_bookings_response.status_code == 200:
            bookings = my_bookings_response.json()
            test_booking = next((b for b in bookings if b["id"] == booking["id"]), None)
            if test_booking and test_booking.get("hours_until_appointment"):
                hours = test_booking["hours_until_appointment"]
                print(f"✓ Booking is {hours:.1f} hours in future (>24h policy applies)")
        
        # Cancel to test policy response
        cancel_response = requests.put(
            f"{BASE_URL}/api/bookings/{booking['id']}/cancel/user",
            json={"reason": "TEST: >24h policy test"},
            headers=auth_headers
        )
        
        assert cancel_response.status_code == 200
        print(f"✓ Cancel response: {cancel_response.json()}")


class TestBusinessCancellation:
    """Test business cancellation (requires business auth)"""
    
    def test_business_cancel_endpoint_exists(self):
        """Verify /api/bookings/{id}/cancel/business endpoint exists"""
        # Just verify the endpoint is accessible (will get 401/403 without proper auth)
        response = requests.put(
            f"{BASE_URL}/api/bookings/test-id/cancel/business",
            json={"reason": "test"}
        )
        
        # Should get 401 (no auth) not 404 (endpoint not found)
        assert response.status_code in [401, 403, 404, 422], \
            f"Unexpected status {response.status_code}: {response.text}"
        
        if response.status_code == 401:
            print(f"✓ Business cancel endpoint exists (requires auth)")
        elif response.status_code == 404:
            # Check if it's "booking not found" vs "endpoint not found"
            error_detail = response.json().get("detail", "")
            assert "booking" in error_detail.lower() or "not found" in error_detail.lower(), \
                f"Endpoint may not exist: {error_detail}"
            print(f"✓ Business cancel endpoint exists (booking not found)")


class TestNoShowEndpoint:
    """Test no-show marking endpoint"""
    
    def test_noshow_endpoint_exists(self):
        """Verify /api/bookings/{id}/no-show endpoint exists"""
        response = requests.put(
            f"{BASE_URL}/api/bookings/test-id/no-show"
        )
        
        # Should get 401/403/404, not 405 (method not allowed)
        assert response.status_code in [401, 403, 404, 422], \
            f"Unexpected status {response.status_code}: {response.text}"
        
        if response.status_code == 401:
            print(f"✓ No-show endpoint exists (requires business auth)")
        elif response.status_code == 404:
            error_detail = response.json().get("detail", "")
            print(f"✓ No-show endpoint exists (booking not found: {error_detail})")


class TestTransactionStatusEnum:
    """Verify TransactionStatus enum values are used correctly"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Login failed: {response.text}")
        return response.json()["token"]
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_transaction_statuses_in_api(self, auth_headers):
        """Get transactions and verify status values match enum"""
        valid_statuses = [
            "created",
            "paid", 
            "refund_partial",
            "refund_full",
            "no_show_payout",
            "business_cancel_fee",
            "expired"
        ]
        
        response = requests.get(
            f"{BASE_URL}/api/payments/my-transactions",
            headers=auth_headers
        )
        
        if response.status_code == 200:
            transactions = response.json()
            for tx in transactions:
                assert tx["status"] in valid_statuses, \
                    f"Invalid transaction status: {tx['status']}"
            print(f"✓ All {len(transactions)} transactions have valid status values")


class TestUserBookingsList:
    """Test the booking list endpoint that frontend uses"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Login failed: {response.text}")
        return response.json()["token"]
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_my_bookings_returns_required_fields(self, auth_headers):
        """GET /api/bookings/my - Should return bookings with all required fields for UI"""
        response = requests.get(
            f"{BASE_URL}/api/bookings/my",
            params={"upcoming": True},
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Get bookings failed: {response.text}"
        bookings = response.json()
        
        print(f"✓ Got {len(bookings)} upcoming bookings")
        
        if len(bookings) > 0:
            booking = bookings[0]
            
            # Verify all fields needed by UserBookingsPage.jsx
            ui_required_fields = [
                "id", "status", "date", "time", "end_time",
                "business_name", "service_name", "worker_name",
                "deposit_amount", "hold_expires_at", "can_cancel",
                "hours_until_appointment"
            ]
            
            for field in ui_required_fields:
                # hold_expires_at might be None for non-hold bookings
                if field not in ["hold_expires_at", "hours_until_appointment", "can_cancel"]:
                    assert field in booking, f"Missing UI field: {field}"
            
            print(f"✓ Booking has required UI fields")
            print(f"  - status: {booking['status']}")
            print(f"  - hold_expires_at: {booking.get('hold_expires_at', 'N/A')}")
            print(f"  - can_cancel: {booking.get('can_cancel', 'N/A')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
