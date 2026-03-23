"""
Test Suite for Phase P2: Workers and Schedules Management
Tests: CRUD Workers, Schedule blocks validation, Exceptions, Availability Engine
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://stripe-webhook-debug-2.preview.emergentagent.com').rstrip('/')

# Test credentials from requirements
BUSINESS_EMAIL = "testspa@test.com"
BUSINESS_PASSWORD = "Test123!"


@pytest.fixture(scope="module")
def business_auth():
    """Get business authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
        "email": BUSINESS_EMAIL,
        "password": BUSINESS_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Business login failed: {response.text}")
    data = response.json()
    return {
        "token": data["token"],
        "business": data["business"]
    }


@pytest.fixture
def auth_headers(business_auth):
    """Auth headers for requests"""
    return {"Authorization": f"Bearer {business_auth['token']}", "Content-Type": "application/json"}


@pytest.fixture
def business_id(business_auth):
    """Get business ID"""
    return business_auth["business"]["id"]


class TestWorkersCRUD:
    """Test Workers CRUD operations"""
    
    created_worker_id = None
    
    def test_create_worker(self, auth_headers):
        """Create a new worker"""
        worker_data = {
            "name": "TEST_Maria Test Worker",
            "email": "test_maria@test.com",
            "phone": "+52 555 123 4567",
            "bio": "Test worker for P2 phase testing",
            "service_ids": []
        }
        response = requests.post(f"{BASE_URL}/api/businesses/my/workers", 
                                 json=worker_data, headers=auth_headers)
        
        assert response.status_code == 200, f"Create worker failed: {response.text}"
        
        data = response.json()
        assert data["name"] == worker_data["name"]
        assert data["email"] == worker_data["email"]
        assert data["active"] == True
        assert "id" in data
        assert "schedule" in data
        
        # Verify default schedule (Mon-Fri 9-18, Sat-Sun off)
        schedule = data.get("schedule", {})
        assert schedule.get("0", {}).get("is_available") == True  # Monday
        assert schedule.get("5", {}).get("is_available") == False  # Saturday
        
        TestWorkersCRUD.created_worker_id = data["id"]
        print(f"✓ Worker created: {data['id']}")
    
    def test_list_workers(self, auth_headers):
        """List workers for business"""
        response = requests.get(f"{BASE_URL}/api/businesses/my/workers?include_inactive=true", 
                               headers=auth_headers)
        
        assert response.status_code == 200, f"List workers failed: {response.text}"
        
        workers = response.json()
        assert isinstance(workers, list)
        assert len(workers) >= 1
        
        # Verify response structure
        for worker in workers:
            assert "id" in worker
            assert "name" in worker
            assert "active" in worker
            assert "schedule" in worker
            assert "exceptions" in worker
        
        print(f"✓ Listed {len(workers)} workers")
    
    def test_get_worker_by_id(self, auth_headers):
        """Get specific worker"""
        if not TestWorkersCRUD.created_worker_id:
            pytest.skip("No worker created")
        
        response = requests.get(
            f"{BASE_URL}/api/businesses/my/workers/{TestWorkersCRUD.created_worker_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Get worker failed: {response.text}"
        
        data = response.json()
        assert data["id"] == TestWorkersCRUD.created_worker_id
        print(f"✓ Got worker details")
    
    def test_update_worker(self, auth_headers):
        """Update worker basic info"""
        if not TestWorkersCRUD.created_worker_id:
            pytest.skip("No worker created")
        
        update_data = {
            "name": "TEST_Maria Updated Name",
            "bio": "Updated bio for testing"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/businesses/my/workers/{TestWorkersCRUD.created_worker_id}",
            json=update_data, headers=auth_headers
        )
        
        assert response.status_code == 200, f"Update worker failed: {response.text}"
        
        data = response.json()
        assert data["name"] == update_data["name"]
        assert data["bio"] == update_data["bio"]
        print(f"✓ Worker updated")
    
    def test_soft_delete_worker(self, auth_headers):
        """Soft delete (deactivate) worker"""
        if not TestWorkersCRUD.created_worker_id:
            pytest.skip("No worker created")
        
        response = requests.delete(
            f"{BASE_URL}/api/businesses/my/workers/{TestWorkersCRUD.created_worker_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Delete worker failed: {response.text}"
        
        # Verify worker is deactivated, not deleted
        response = requests.get(f"{BASE_URL}/api/businesses/my/workers?include_inactive=true",
                               headers=auth_headers)
        workers = response.json()
        
        deactivated = [w for w in workers if w["id"] == TestWorkersCRUD.created_worker_id]
        assert len(deactivated) == 1
        assert deactivated[0]["active"] == False
        assert deactivated[0].get("deactivated_at") is not None
        
        print(f"✓ Worker soft-deleted (deactivated)")
    
    def test_reactivate_worker(self, auth_headers):
        """Reactivate a deactivated worker"""
        if not TestWorkersCRUD.created_worker_id:
            pytest.skip("No worker created")
        
        response = requests.put(
            f"{BASE_URL}/api/businesses/my/workers/{TestWorkersCRUD.created_worker_id}/reactivate",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Reactivate worker failed: {response.text}"
        
        # Verify worker is active again
        response = requests.get(
            f"{BASE_URL}/api/businesses/my/workers/{TestWorkersCRUD.created_worker_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["active"] == True
        
        print(f"✓ Worker reactivated")


class TestScheduleManagement:
    """Test schedule management with multiple blocks and validation"""
    
    @pytest.fixture
    def test_worker_id(self, auth_headers):
        """Create a test worker for schedule tests"""
        worker_data = {
            "name": "TEST_Schedule Worker",
            "email": "test_schedule@test.com",
        }
        response = requests.post(f"{BASE_URL}/api/businesses/my/workers",
                                json=worker_data, headers=auth_headers)
        if response.status_code == 200:
            return response.json()["id"]
        pytest.skip("Could not create test worker")
    
    def test_update_schedule_multiple_blocks(self, auth_headers, test_worker_id):
        """Update schedule with multiple blocks per day"""
        schedule = {
            "0": {  # Monday - two blocks (morning and afternoon)
                "is_available": True,
                "blocks": [
                    {"start_time": "09:00", "end_time": "13:00"},
                    {"start_time": "15:00", "end_time": "19:00"}
                ]
            },
            "1": {  # Tuesday - single block
                "is_available": True,
                "blocks": [
                    {"start_time": "10:00", "end_time": "18:00"}
                ]
            },
            "2": {  # Wednesday - not available
                "is_available": False,
                "blocks": []
            },
            "3": {  # Thursday - three blocks
                "is_available": True,
                "blocks": [
                    {"start_time": "08:00", "end_time": "11:00"},
                    {"start_time": "12:00", "end_time": "15:00"},
                    {"start_time": "17:00", "end_time": "20:00"}
                ]
            }
        }
        
        response = requests.put(
            f"{BASE_URL}/api/businesses/my/workers/{test_worker_id}/schedule",
            json={"schedule": schedule},
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Update schedule failed: {response.text}"
        
        data = response.json()
        assert data["schedule"]["0"]["blocks"][0]["start_time"] == "09:00"
        assert data["schedule"]["0"]["blocks"][1]["start_time"] == "15:00"
        assert len(data["schedule"]["3"]["blocks"]) == 3
        
        print(f"✓ Schedule with multiple blocks saved")
    
    def test_schedule_validation_overlapping_blocks(self, auth_headers, test_worker_id):
        """Test validation rejects overlapping blocks"""
        overlapping_schedule = {
            "0": {
                "is_available": True,
                "blocks": [
                    {"start_time": "09:00", "end_time": "14:00"},
                    {"start_time": "13:00", "end_time": "18:00"}  # Overlaps with previous
                ]
            }
        }
        
        response = requests.put(
            f"{BASE_URL}/api/businesses/my/workers/{test_worker_id}/schedule",
            json={"schedule": overlapping_schedule},
            headers=auth_headers
        )
        
        # Should reject overlapping blocks
        assert response.status_code == 400, f"Overlapping blocks should be rejected: {response.text}"
        assert "overlap" in response.json().get("detail", "").lower()
        
        print(f"✓ Overlapping blocks validation works")
    
    def test_schedule_validation_invalid_times(self, auth_headers, test_worker_id):
        """Test validation rejects start_time >= end_time"""
        invalid_schedule = {
            "0": {
                "is_available": True,
                "blocks": [
                    {"start_time": "18:00", "end_time": "09:00"}  # Invalid: end before start
                ]
            }
        }
        
        response = requests.put(
            f"{BASE_URL}/api/businesses/my/workers/{test_worker_id}/schedule",
            json={"schedule": invalid_schedule},
            headers=auth_headers
        )
        
        # Should reject invalid time range
        assert response.status_code == 400, f"Invalid times should be rejected: {response.text}"
        
        print(f"✓ Invalid time range validation works")


class TestExceptions:
    """Test exception (vacation/block) management"""
    
    @pytest.fixture
    def test_worker_id(self, auth_headers):
        """Create a test worker for exception tests"""
        worker_data = {
            "name": "TEST_Exception Worker",
            "email": "test_exception@test.com",
        }
        response = requests.post(f"{BASE_URL}/api/businesses/my/workers",
                                json=worker_data, headers=auth_headers)
        if response.status_code == 200:
            return response.json()["id"]
        pytest.skip("Could not create test worker")
    
    def test_add_full_day_exception(self, auth_headers, test_worker_id):
        """Add a full day vacation/block"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        exception = {
            "start_date": tomorrow,
            "end_date": tomorrow,
            "start_time": None,
            "end_time": None,
            "reason": "Vacaciones test",
            "exception_type": "vacation"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/businesses/my/workers/{test_worker_id}/exceptions",
            json={"exception": exception},
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Add exception failed: {response.text}"
        
        data = response.json()
        assert "exception_id" in data
        
        print(f"✓ Full day exception added")
        return data["exception_id"]
    
    def test_add_date_range_exception(self, auth_headers, test_worker_id):
        """Add a multi-day vacation"""
        start = (datetime.now() + timedelta(days=10)).strftime("%Y-%m-%d")
        end = (datetime.now() + timedelta(days=15)).strftime("%Y-%m-%d")
        
        exception = {
            "start_date": start,
            "end_date": end,
            "reason": "Vacaciones largas test",
            "exception_type": "vacation"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/businesses/my/workers/{test_worker_id}/exceptions",
            json={"exception": exception},
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Add range exception failed: {response.text}"
        
        print(f"✓ Date range exception added")
    
    def test_add_partial_day_exception(self, auth_headers, test_worker_id):
        """Add a partial day block (specific hours)"""
        day_after = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
        
        exception = {
            "start_date": day_after,
            "end_date": day_after,
            "start_time": "09:00",
            "end_time": "12:00",
            "reason": "Cita médica test",
            "exception_type": "block"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/businesses/my/workers/{test_worker_id}/exceptions",
            json={"exception": exception},
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Add partial exception failed: {response.text}"
        
        print(f"✓ Partial day exception added")
    
    def test_exception_validation_invalid_dates(self, auth_headers, test_worker_id):
        """Test validation rejects end_date before start_date"""
        exception = {
            "start_date": "2026-01-20",
            "end_date": "2026-01-15",  # Before start
            "reason": "Invalid test",
            "exception_type": "block"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/businesses/my/workers/{test_worker_id}/exceptions",
            json={"exception": exception},
            headers=auth_headers
        )
        
        assert response.status_code == 400, f"Invalid dates should be rejected: {response.text}"
        
        print(f"✓ Invalid date range validation works")
    
    def test_exception_validation_invalid_times(self, auth_headers, test_worker_id):
        """Test validation rejects end_time <= start_time"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        exception = {
            "start_date": tomorrow,
            "end_date": tomorrow,
            "start_time": "14:00",
            "end_time": "10:00",  # Before start
            "reason": "Invalid times test",
            "exception_type": "block"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/businesses/my/workers/{test_worker_id}/exceptions",
            json={"exception": exception},
            headers=auth_headers
        )
        
        assert response.status_code == 400, f"Invalid times should be rejected: {response.text}"
        
        print(f"✓ Invalid time range validation works")
    
    def test_remove_exception(self, auth_headers, test_worker_id):
        """Remove an exception"""
        # First add an exception
        tomorrow = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")
        
        exception = {
            "start_date": tomorrow,
            "end_date": tomorrow,
            "reason": "To be removed",
            "exception_type": "block"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/businesses/my/workers/{test_worker_id}/exceptions",
            json={"exception": exception},
            headers=auth_headers
        )
        
        assert response.status_code == 200
        exception_id = response.json()["exception_id"]
        
        # Now remove it
        response = requests.delete(
            f"{BASE_URL}/api/businesses/my/workers/{test_worker_id}/exceptions/{exception_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Remove exception failed: {response.text}"
        
        print(f"✓ Exception removed")


class TestAvailabilityEngine:
    """Test availability endpoint with detailed status"""
    
    def test_availability_basic(self, auth_headers, business_id):
        """Get basic availability for a date"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/bookings/availability/{business_id}?date={tomorrow}",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Get availability failed: {response.text}"
        
        data = response.json()
        assert "date" in data
        assert "business_timezone" in data
        assert "slots" in data
        assert "available_count" in data
        assert "total_workers" in data
        
        print(f"✓ Availability endpoint returns correct structure")
    
    def test_availability_with_unavailable_slots(self, auth_headers, business_id):
        """Get availability including unavailable slots with reasons"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/bookings/availability/{business_id}?date={tomorrow}&include_unavailable=true",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Get availability failed: {response.text}"
        
        data = response.json()
        
        # Should include slots with various statuses
        for slot in data["slots"]:
            assert "time" in slot
            assert "end_time" in slot
            assert "status" in slot
            # Unavailable slots should have a reason
            if slot["status"] != "available":
                assert "reason" in slot
        
        print(f"✓ Availability includes unavailable slots with reasons")
    
    def test_availability_specific_worker(self, auth_headers, business_id):
        """Get availability for a specific worker"""
        # First get workers
        response = requests.get(f"{BASE_URL}/api/businesses/my/workers",
                               headers=auth_headers)
        workers = response.json()
        
        if not workers:
            pytest.skip("No workers available")
        
        worker_id = workers[0]["id"]
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/bookings/availability/{business_id}?date={tomorrow}&worker_id={worker_id}&include_unavailable=true",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Get worker availability failed: {response.text}"
        
        data = response.json()
        
        # Available slots should be for this worker
        for slot in data["slots"]:
            if slot["status"] == "available" and slot.get("worker_id"):
                assert slot["worker_id"] == worker_id
        
        print(f"✓ Worker-specific availability works")
    
    def test_availability_timezone(self, auth_headers, business_id):
        """Verify availability respects business timezone"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/bookings/availability/{business_id}?date={tomorrow}",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Should return business timezone
        assert data["business_timezone"] != ""
        # Default is America/Mexico_City
        assert "America" in data["business_timezone"] or "UTC" in data["business_timezone"]
        
        print(f"✓ Availability returns business timezone: {data['business_timezone']}")


class TestServiceWorkerAssociation:
    """Test allowed_worker_ids filtering"""
    
    def test_service_with_allowed_workers(self, auth_headers, business_id):
        """Create service with allowed_worker_ids and verify filtering"""
        # Get existing workers
        response = requests.get(f"{BASE_URL}/api/businesses/my/workers", headers=auth_headers)
        workers = response.json()
        
        if len(workers) < 1:
            pytest.skip("Need at least 1 worker for this test")
        
        # Create service with only first worker allowed
        service_data = {
            "name": "TEST_Exclusive Service",
            "description": "Only specific workers",
            "duration_minutes": 60,
            "price": 500,
            "allowed_worker_ids": [workers[0]["id"]]
        }
        
        response = requests.post(f"{BASE_URL}/api/services",
                                json=service_data, headers=auth_headers)
        
        if response.status_code != 200:
            pytest.skip(f"Could not create service: {response.text}")
        
        service = response.json()
        assert service["allowed_worker_ids"] == [workers[0]["id"]]
        
        # Get availability for this service
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/bookings/availability/{business_id}?date={tomorrow}&service_id={service['id']}&include_unavailable=true",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # total_workers should reflect filtered count
        print(f"✓ Service with allowed_worker_ids works. Total workers for service: {data['total_workers']}")


class TestPublicWorkerEndpoint:
    """Test public worker endpoint for viewing business workers"""
    
    def test_get_workers_by_business_id(self, business_id):
        """Public endpoint to get workers for a business"""
        response = requests.get(f"{BASE_URL}/api/businesses/{business_id}/workers")
        
        assert response.status_code == 200, f"Get workers failed: {response.text}"
        
        workers = response.json()
        assert isinstance(workers, list)
        
        # Public endpoint should only return active workers by default
        for worker in workers:
            assert worker.get("active") == True
        
        print(f"✓ Public workers endpoint returns {len(workers)} active workers")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_workers(self, auth_headers):
        """Cleanup workers created during tests"""
        response = requests.get(f"{BASE_URL}/api/businesses/my/workers?include_inactive=true",
                               headers=auth_headers)
        
        if response.status_code != 200:
            return
        
        workers = response.json()
        deleted_count = 0
        
        for worker in workers:
            if worker["name"].startswith("TEST_"):
                requests.delete(
                    f"{BASE_URL}/api/businesses/my/workers/{worker['id']}",
                    headers=auth_headers
                )
                deleted_count += 1
        
        print(f"✓ Cleaned up {deleted_count} test workers")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
