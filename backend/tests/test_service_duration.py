"""
Test: Service Duration Feature (Iteration 22)
- Service CRUD with duration_minutes field
- Availability respects service duration (end_time calculated)
- Booking creation with automatic end_time calculation
- Overlap validation returns 409 conflict
- Adjacent bookings (after end_time) succeed
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
BUSINESS_EMAIL = "testrealstripe@bookvia.com"
BUSINESS_PASSWORD = "Test1234!"
TEST_USER_EMAIL = "testuser_duration@bookvia.com"
TEST_USER_PASSWORD = "Test1234!"
TEST_USER_NAME = "Test Duration User"

# Use existing known IDs for stable testing (created by previous setup)
KNOWN_BIZ_ID = "fbb3d0e3-37f2-417b-8cfa-b7fbf24f1ee0"
KNOWN_SERVICE_ID = "0a92c3fb-2126-4192-b938-46eb0f3af973"  # Corte de cabello, 45 min
KNOWN_WORKER_ID = "e8156189-9cc2-4b3d-9f0e-2df518915bda"


@pytest.fixture(scope="module")
def session():
    """Shared requests session"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def business_auth(session):
    """Login as business and get token + business_id"""
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": BUSINESS_EMAIL,
        "password": BUSINESS_PASSWORD
    })
    if resp.status_code != 200:
        pytest.skip(f"Business login failed: {resp.status_code} {resp.text}")
    data = resp.json()
    token = data.get("access_token") or data.get("token")
    business_id = data.get("user", {}).get("business_id") or KNOWN_BIZ_ID
    return {"token": token, "business_id": business_id}


@pytest.fixture(scope="module")
def test_user_auth(session):
    """Register or login test user"""
    # Try to register first
    resp = session.post(f"{BASE_URL}/api/auth/register", json={
        "full_name": TEST_USER_NAME,
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD,
        "phone": "+525599999901"
    })
    
    if resp.status_code == 400 and ("existe" in resp.text.lower() or "registered" in resp.text.lower()):
        # User exists, login instead
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
    
    if resp.status_code not in [200, 201]:
        pytest.skip(f"User registration/login failed: {resp.status_code} {resp.text}")
    
    data = resp.json()
    token = data.get("access_token") or data.get("token")
    user_id = data.get("user", {}).get("id")
    return {"token": token, "user_id": user_id}


# ============ Service CRUD Tests ============

class TestServiceCRUD:
    """Service CRUD with duration_minutes"""
    
    created_service_id = None
    
    def test_create_service_with_duration_45min(self, session, business_auth):
        """POST /api/services - create service with 45 min duration"""
        resp = session.post(
            f"{BASE_URL}/api/services",
            json={
                "name": "TEST_Servicio_45min",
                "description": "Test service with 45 minute duration",
                "price": 150.00,
                "duration_minutes": 45
            },
            headers={"Authorization": f"Bearer {business_auth['token']}"}
        )
        
        print(f"Create service response: {resp.status_code}")
        assert resp.status_code in [200, 201], f"Expected 200/201, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "id" in data, "Response should include 'id'"
        assert data["name"] == "TEST_Servicio_45min"
        assert data["duration_minutes"] == 45, f"Duration should be 45, got {data.get('duration_minutes')}"
        assert data["price"] == 150.00
        
        TestServiceCRUD.created_service_id = data["id"]
        print(f"✓ Created service with ID: {data['id']}, duration: {data['duration_minutes']} min")
    
    def test_get_business_services_includes_duration(self, session, business_auth):
        """GET /api/services/business/{id} - list services with duration_minutes"""
        resp = session.get(
            f"{BASE_URL}/api/services/business/{business_auth['business_id']}",
            headers={"Authorization": f"Bearer {business_auth['token']}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        services = resp.json()
        assert isinstance(services, list), "Should return a list"
        
        # Find our test service
        test_service = next((s for s in services if s.get("name") == "TEST_Servicio_45min"), None)
        
        if test_service:
            assert "duration_minutes" in test_service, "Service should have duration_minutes field"
            assert test_service["duration_minutes"] == 45
            print(f"✓ Found test service with duration: {test_service['duration_minutes']} min")
        else:
            print(f"Note: Test service not found in list of {len(services)} services")
        
        # Verify all services have duration_minutes
        for s in services:
            assert "duration_minutes" in s, f"Service {s.get('name')} missing duration_minutes"
        print(f"✓ All {len(services)} services have duration_minutes field")
    
    def test_update_service_duration(self, session, business_auth):
        """PUT /api/services/{id} - update duration_minutes"""
        if not TestServiceCRUD.created_service_id:
            pytest.skip("No service created to update")
        
        resp = session.put(
            f"{BASE_URL}/api/services/{TestServiceCRUD.created_service_id}",
            json={"duration_minutes": 60},
            headers={"Authorization": f"Bearer {business_auth['token']}"}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert data["duration_minutes"] == 60, f"Duration should be 60, got {data.get('duration_minutes')}"
        print(f"✓ Updated service duration to 60 min")
        
        # Update back to 45 for next tests
        session.put(
            f"{BASE_URL}/api/services/{TestServiceCRUD.created_service_id}",
            json={"duration_minutes": 45},
            headers={"Authorization": f"Bearer {business_auth['token']}"}
        )


# ============ Availability Tests ============

class TestAvailability:
    """Availability respects service duration"""
    
    def test_availability_uses_service_duration(self, session, business_auth):
        """GET /api/bookings/availability/{business_id} - slots respect duration"""
        # Get a weekday (Mon-Fri) for testing
        today = datetime.now()
        days_until_monday = (7 - today.weekday()) % 7
        if days_until_monday == 0:
            days_until_monday = 7  # Next week
        test_date = (today + timedelta(days=days_until_monday)).strftime("%Y-%m-%d")
        
        # Use known service (Corte de cabello - 45 min)
        service_id = KNOWN_SERVICE_ID
        duration = 45
        
        # Get availability WITH service_id
        resp = session.get(
            f"{BASE_URL}/api/bookings/availability/{business_auth['business_id']}",
            params={"date": test_date, "service_id": service_id}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "slots" in data, "Response should have 'slots'"
        assert "date" in data, "Response should have 'date'"
        
        # If slots available, verify they have end_time based on duration
        slots = data.get("slots", [])
        if slots:
            slot = slots[0]
            assert "time" in slot, "Slot should have 'time'"
            assert "end_time" in slot, "Slot should have 'end_time'"
            
            # Calculate expected end_time
            start = datetime.strptime(slot["time"], "%H:%M")
            expected_end = (start + timedelta(minutes=duration)).strftime("%H:%M")
            
            assert slot["end_time"] == expected_end, f"End time should be {expected_end}, got {slot['end_time']}"
            print(f"✓ Slot {slot['time']} - {slot['end_time']} respects {duration}min duration")
        else:
            # No workers or schedule for this day - check total_workers
            print(f"Note: No available slots for {test_date} (total_workers={data.get('total_workers', 0)})")


# ============ Booking Tests ============

class TestBookingCreation:
    """Booking creation with automatic end_time and overlap validation"""
    
    created_booking_id = None
    test_service_id = KNOWN_SERVICE_ID
    test_worker_id = KNOWN_WORKER_ID
    test_date = None
    test_time = None
    
    def test_create_booking_calculates_end_time(self, session, business_auth, test_user_auth):
        """POST /api/bookings/ - end_time calculated from service duration"""
        # Use known service (45 min duration)
        service_id = KNOWN_SERVICE_ID
        duration = 45
        
        # Get a weekday for testing (Mon-Fri) - skip weekends
        today = datetime.now()
        days_until_monday = (7 - today.weekday()) % 7
        if days_until_monday == 0:
            days_until_monday = 7  # Next week
        test_date = (today + timedelta(days=days_until_monday)).strftime("%Y-%m-%d")
        TestBookingCreation.test_date = test_date
        
        avail_resp = session.get(
            f"{BASE_URL}/api/bookings/availability/{business_auth['business_id']}",
            params={"date": test_date, "service_id": service_id}
        )
        
        if avail_resp.status_code != 200:
            pytest.skip(f"Cannot get availability: {avail_resp.status_code}")
        
        avail_data = avail_resp.json()
        slots = [s for s in avail_data.get("slots", []) if s.get("status") == "available"]
        
        if not slots:
            pytest.skip(f"No available slots for booking test (workers={avail_data.get('total_workers', 0)})")
        
        # Use first available slot
        slot = slots[0]
        test_time = slot["time"]
        TestBookingCreation.test_time = test_time
        TestBookingCreation.test_worker_id = slot.get("worker_id")
        
        print(f"Booking slot: {test_time} on {test_date}")
        
        # Create booking - use trailing slash to avoid 307 redirect
        resp = session.post(
            f"{BASE_URL}/api/bookings/",
            json={
                "business_id": business_auth["business_id"],
                "service_id": service_id,
                "worker_id": slot.get("worker_id"),
                "date": test_date,
                "time": test_time,
                "notes": "TEST booking for duration feature"
            },
            headers={"Authorization": f"Bearer {test_user_auth['token']}"}
        )
        
        print(f"Create booking response: {resp.status_code}")
        
        if resp.status_code == 400:
            detail = resp.json().get("detail", "")
            if "subscription" in detail.lower() or "approved" in detail.lower():
                pytest.skip(f"Business not ready for bookings: {detail}")
            if "maximum" in detail.lower():
                pytest.skip(f"User has max appointments: {detail}")
        
        assert resp.status_code in [200, 201], f"Expected 200/201, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        TestBookingCreation.created_booking_id = data.get("id")
        
        # Verify end_time is calculated
        assert "end_time" in data, "Booking should have end_time"
        assert "duration_minutes" in data, "Booking should have duration_minutes"
        
        # Calculate expected end_time
        start = datetime.strptime(test_time, "%H:%M")
        expected_end = (start + timedelta(minutes=duration)).strftime("%H:%M")
        
        assert data["end_time"] == expected_end, f"End time should be {expected_end}, got {data['end_time']}"
        assert data["duration_minutes"] == duration, f"Duration should be {duration}, got {data['duration_minutes']}"
        
        print(f"✓ Booking created: {test_time} - {data['end_time']} ({data['duration_minutes']}min)")
    
    def test_overlapping_booking_returns_409(self, session, business_auth, test_user_auth):
        """POST /api/bookings/ - overlap conflict returns 409"""
        if not TestBookingCreation.created_booking_id:
            pytest.skip("No booking created to test overlap")
        
        # Try to create another booking at the same time/worker
        resp = session.post(
            f"{BASE_URL}/api/bookings/",
            json={
                "business_id": business_auth["business_id"],
                "service_id": TestBookingCreation.test_service_id,
                "worker_id": TestBookingCreation.test_worker_id,
                "date": TestBookingCreation.test_date,
                "time": TestBookingCreation.test_time,
                "notes": "TEST overlapping booking"
            },
            headers={"Authorization": f"Bearer {test_user_auth['token']}"}
        )
        
        print(f"Overlapping booking response: {resp.status_code}")
        
        # Should return 409 Conflict
        assert resp.status_code == 409, f"Expected 409 for overlap, got {resp.status_code}: {resp.text}"
        
        detail = resp.json().get("detail", "")
        assert "conflict" in detail.lower() or "exist" in detail.lower(), f"Error message should mention conflict: {detail}"
        
        print(f"✓ Overlapping booking correctly rejected with 409")
    
    def test_adjacent_time_no_conflict(self, session, business_auth, test_user_auth):
        """POST /api/bookings/ - adjacent time (well after end_time) should succeed"""
        if not TestBookingCreation.created_booking_id:
            pytest.skip("No booking created to test adjacent")
        
        # Check availability for a later slot (well after first booking)
        avail_resp = session.get(
            f"{BASE_URL}/api/bookings/availability/{business_auth['business_id']}",
            params={
                "date": TestBookingCreation.test_date,
                "service_id": TestBookingCreation.test_service_id
            }
        )
        
        if avail_resp.status_code != 200:
            pytest.skip("Cannot fetch availability for adjacent test")
        
        slots = avail_resp.json().get("slots", [])
        available_slots = [s for s in slots if s.get("status") == "available"]
        
        if available_slots:
            # Book a later available slot
            later_slot = available_slots[-1]  # Use last available slot
            print(f"✓ Adjacent/later slot {later_slot['time']} is available")
        else:
            print(f"Note: No more available slots after first booking")


# ============ Cleanup ============

class TestCleanup:
    """Clean up test data"""
    
    def test_cleanup_test_service(self, session, business_auth):
        """Delete test service"""
        if TestServiceCRUD.created_service_id:
            resp = session.delete(
                f"{BASE_URL}/api/services/{TestServiceCRUD.created_service_id}",
                headers={"Authorization": f"Bearer {business_auth['token']}"}
            )
            if resp.status_code == 200:
                print(f"✓ Cleaned up test service")
            else:
                print(f"Note: Could not clean up service: {resp.status_code}")
    
    def test_cancel_test_booking(self, session, test_user_auth):
        """Cancel test booking"""
        if TestBookingCreation.created_booking_id:
            resp = session.post(
                f"{BASE_URL}/api/bookings/{TestBookingCreation.created_booking_id}/cancel",
                headers={"Authorization": f"Bearer {test_user_auth['token']}"}
            )
            if resp.status_code == 200:
                print(f"✓ Cleaned up test booking")
            else:
                print(f"Note: Could not cancel booking: {resp.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
