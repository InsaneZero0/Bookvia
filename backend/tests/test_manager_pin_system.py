"""
Test suite for Manager & PIN System (Phase 1)
Tests owner PIN configuration and manager designation/permissions/PIN features
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
BUSINESS_EMAIL = "testrealstripe@bookvia.com"
BUSINESS_PASSWORD = "Test1234!"


class TestManagerPinSystem:
    """Tests for Manager & PIN System Phase 1"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as business
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": BUSINESS_EMAIL,
            "password": BUSINESS_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get("token")
        self.user = data.get("user")
        assert self.token, "No token received"
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Get workers to find test worker
        workers_res = self.session.get(f"{BASE_URL}/api/businesses/my/workers")
        assert workers_res.status_code == 200
        workers = workers_res.json()
        assert len(workers) > 0, "No workers found for testing"
        self.worker = workers[0]
        self.worker_id = self.worker["id"]
        
        yield
        
        # Cleanup: Remove manager role if set
        try:
            self.session.delete(f"{BASE_URL}/api/businesses/my/workers/{self.worker_id}/manager")
        except:
            pass

    # ==================== Owner PIN Tests ====================
    
    def test_get_pin_status(self):
        """Test GET /api/businesses/me/pin/status returns correct status"""
        response = self.session.get(f"{BASE_URL}/api/businesses/me/pin/status")
        assert response.status_code == 200
        data = response.json()
        assert "has_pin" in data
        assert isinstance(data["has_pin"], bool)
        print(f"✓ PIN status endpoint works, has_pin: {data['has_pin']}")

    def test_set_owner_pin_valid(self):
        """Test POST /api/businesses/me/pin with valid 4-6 digit PIN"""
        response = self.session.post(f"{BASE_URL}/api/businesses/me/pin", json={"pin": "1234"})
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print("✓ Owner PIN set successfully with 4 digits")
        
        # Verify PIN status changed
        status_res = self.session.get(f"{BASE_URL}/api/businesses/me/pin/status")
        assert status_res.json()["has_pin"] == True
        print("✓ PIN status shows has_pin: true")

    def test_set_owner_pin_6_digits(self):
        """Test setting 6-digit PIN"""
        response = self.session.post(f"{BASE_URL}/api/businesses/me/pin", json={"pin": "123456"})
        assert response.status_code == 200
        print("✓ Owner PIN set successfully with 6 digits")

    def test_set_owner_pin_invalid_too_short(self):
        """Test PIN validation - too short (3 digits)"""
        response = self.session.post(f"{BASE_URL}/api/businesses/me/pin", json={"pin": "123"})
        assert response.status_code == 400
        print("✓ Correctly rejected 3-digit PIN")

    def test_set_owner_pin_invalid_too_long(self):
        """Test PIN validation - too long (7 digits)"""
        response = self.session.post(f"{BASE_URL}/api/businesses/me/pin", json={"pin": "1234567"})
        assert response.status_code == 400
        print("✓ Correctly rejected 7-digit PIN")

    def test_set_owner_pin_invalid_non_numeric(self):
        """Test PIN validation - non-numeric"""
        response = self.session.post(f"{BASE_URL}/api/businesses/me/pin", json={"pin": "12ab"})
        assert response.status_code == 400
        print("✓ Correctly rejected non-numeric PIN")

    def test_verify_owner_pin_correct(self):
        """Test PIN verification with correct PIN"""
        # First set a known PIN
        self.session.post(f"{BASE_URL}/api/businesses/me/pin", json={"pin": "9999"})
        
        # Verify with correct PIN
        response = self.session.post(f"{BASE_URL}/api/businesses/me/pin/verify", json={"pin": "9999"})
        assert response.status_code == 200
        data = response.json()
        assert data.get("verified") == True
        print("✓ PIN verification works with correct PIN")

    def test_verify_owner_pin_incorrect(self):
        """Test PIN verification with incorrect PIN"""
        # First set a known PIN
        self.session.post(f"{BASE_URL}/api/businesses/me/pin", json={"pin": "9999"})
        
        # Verify with wrong PIN
        response = self.session.post(f"{BASE_URL}/api/businesses/me/pin/verify", json={"pin": "0000"})
        assert response.status_code == 401
        print("✓ PIN verification correctly rejects wrong PIN")

    # ==================== Manager Designation Tests ====================

    def test_designate_manager(self):
        """Test PUT /api/businesses/my/workers/{id}/manager designates worker as manager"""
        permissions = {
            "complete_bookings": True,
            "reschedule_bookings": True,
            "cancel_bookings": False
        }
        response = self.session.put(
            f"{BASE_URL}/api/businesses/my/workers/{self.worker_id}/manager",
            json={"permissions": permissions}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify response
        assert data["is_manager"] == True
        assert data["manager_permissions"]["complete_bookings"] == True
        assert data["manager_permissions"]["reschedule_bookings"] == True
        assert data["manager_permissions"]["cancel_bookings"] == False
        assert "manager_designated_at" in data
        print(f"✓ Worker {self.worker['name']} designated as manager with custom permissions")

    def test_designate_manager_default_permissions(self):
        """Test manager designation fills in default permissions"""
        # Designate with minimal permissions
        response = self.session.put(
            f"{BASE_URL}/api/businesses/my/workers/{self.worker_id}/manager",
            json={"permissions": {"complete_bookings": True}}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should have all permission keys with defaults
        perms = data["manager_permissions"]
        assert "complete_bookings" in perms
        assert "reschedule_bookings" in perms
        assert "cancel_bookings" in perms
        assert "block_clients" in perms
        assert "view_client_data" in perms
        assert "edit_services" in perms
        assert "edit_profile" in perms
        assert "view_reports" in perms
        print("✓ Manager designation fills in default permissions")

    def test_get_workers_shows_manager_badge(self):
        """Test GET /api/businesses/my/workers returns is_manager and has_manager_pin"""
        # First designate as manager
        self.session.put(
            f"{BASE_URL}/api/businesses/my/workers/{self.worker_id}/manager",
            json={"permissions": {"complete_bookings": True}}
        )
        
        # Get workers
        response = self.session.get(f"{BASE_URL}/api/businesses/my/workers")
        assert response.status_code == 200
        workers = response.json()
        
        manager = next((w for w in workers if w["id"] == self.worker_id), None)
        assert manager is not None
        assert manager["is_manager"] == True
        assert "has_manager_pin" in manager
        assert "manager_permissions" in manager
        print("✓ Workers endpoint returns manager status and permissions")

    # ==================== Manager Permissions Update Tests ====================

    def test_update_manager_permissions(self):
        """Test PUT /api/businesses/my/workers/{id}/manager/permissions updates permissions"""
        # First designate as manager
        self.session.put(
            f"{BASE_URL}/api/businesses/my/workers/{self.worker_id}/manager",
            json={"permissions": {"complete_bookings": True, "view_reports": False}}
        )
        
        # Update permissions
        response = self.session.put(
            f"{BASE_URL}/api/businesses/my/workers/{self.worker_id}/manager/permissions",
            json={"permissions": {"view_reports": True, "edit_services": True}}
        )
        assert response.status_code == 200
        
        # Verify changes
        workers_res = self.session.get(f"{BASE_URL}/api/businesses/my/workers")
        manager = next((w for w in workers_res.json() if w["id"] == self.worker_id), None)
        assert manager["manager_permissions"]["view_reports"] == True
        assert manager["manager_permissions"]["edit_services"] == True
        assert manager["manager_permissions"]["complete_bookings"] == True  # Should be preserved
        print("✓ Manager permissions updated successfully")

    def test_update_permissions_non_manager_fails(self):
        """Test updating permissions for non-manager returns 404"""
        # Ensure worker is not a manager
        self.session.delete(f"{BASE_URL}/api/businesses/my/workers/{self.worker_id}/manager")
        
        response = self.session.put(
            f"{BASE_URL}/api/businesses/my/workers/{self.worker_id}/manager/permissions",
            json={"permissions": {"view_reports": True}}
        )
        assert response.status_code == 404
        print("✓ Correctly rejects permission update for non-manager")

    # ==================== Manager PIN Tests ====================

    def test_set_manager_pin(self):
        """Test POST /api/businesses/my/workers/{id}/manager/pin sets manager PIN"""
        # First designate as manager
        self.session.put(
            f"{BASE_URL}/api/businesses/my/workers/{self.worker_id}/manager",
            json={"permissions": {"complete_bookings": True}}
        )
        
        # Set manager PIN
        response = self.session.post(
            f"{BASE_URL}/api/businesses/my/workers/{self.worker_id}/manager/pin",
            json={"pin": "4321"}
        )
        assert response.status_code == 200
        
        # Verify has_manager_pin is true
        workers_res = self.session.get(f"{BASE_URL}/api/businesses/my/workers")
        manager = next((w for w in workers_res.json() if w["id"] == self.worker_id), None)
        assert manager["has_manager_pin"] == True
        print("✓ Manager PIN set successfully")

    def test_set_manager_pin_invalid(self):
        """Test manager PIN validation"""
        # First designate as manager
        self.session.put(
            f"{BASE_URL}/api/businesses/my/workers/{self.worker_id}/manager",
            json={"permissions": {"complete_bookings": True}}
        )
        
        # Try invalid PIN
        response = self.session.post(
            f"{BASE_URL}/api/businesses/my/workers/{self.worker_id}/manager/pin",
            json={"pin": "12"}  # Too short
        )
        assert response.status_code == 400
        print("✓ Correctly rejects invalid manager PIN")

    def test_set_manager_pin_non_manager_fails(self):
        """Test setting PIN for non-manager returns 404"""
        # Ensure worker is not a manager
        self.session.delete(f"{BASE_URL}/api/businesses/my/workers/{self.worker_id}/manager")
        
        response = self.session.post(
            f"{BASE_URL}/api/businesses/my/workers/{self.worker_id}/manager/pin",
            json={"pin": "1234"}
        )
        assert response.status_code == 404
        print("✓ Correctly rejects PIN set for non-manager")

    # ==================== Remove Manager Tests ====================

    def test_remove_manager(self):
        """Test DELETE /api/businesses/my/workers/{id}/manager removes manager role"""
        # First designate as manager with PIN
        self.session.put(
            f"{BASE_URL}/api/businesses/my/workers/{self.worker_id}/manager",
            json={"permissions": {"complete_bookings": True}}
        )
        self.session.post(
            f"{BASE_URL}/api/businesses/my/workers/{self.worker_id}/manager/pin",
            json={"pin": "1234"}
        )
        
        # Remove manager role
        response = self.session.delete(f"{BASE_URL}/api/businesses/my/workers/{self.worker_id}/manager")
        assert response.status_code == 200
        
        # Verify worker is no longer manager
        workers_res = self.session.get(f"{BASE_URL}/api/businesses/my/workers")
        worker = next((w for w in workers_res.json() if w["id"] == self.worker_id), None)
        assert worker["is_manager"] == False
        assert worker["has_manager_pin"] == False
        assert worker.get("manager_permissions") is None
        print("✓ Manager role removed successfully, PIN and permissions cleared")

    def test_remove_manager_non_existent_worker(self):
        """Test removing manager from non-existent worker returns 404"""
        response = self.session.delete(f"{BASE_URL}/api/businesses/my/workers/non-existent-id/manager")
        assert response.status_code == 404
        print("✓ Correctly returns 404 for non-existent worker")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
