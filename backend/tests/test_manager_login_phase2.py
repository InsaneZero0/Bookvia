"""
Test Manager Login Phase 2 - Administrator Login System
Tests for:
- POST /api/auth/business/manager-login (login with PIN)
- GET /api/auth/business/managers (get managers list for login dropdown)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
BUSINESS_EMAIL = "testrealstripe@bookvia.com"
BUSINESS_PASSWORD = "Test1234!"
MANAGER_WORKER_ID = "e8156189-9cc2-4b3d-9f0e-2df518915bda"  # Test Worker Duration
MANAGER_PIN = "1234"


class TestManagerLoginEndpoints:
    """Test manager login endpoints for Phase 2"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    # ========== GET /api/auth/business/managers Tests ==========
    
    def test_get_managers_with_valid_email(self):
        """GET /api/auth/business/managers with valid business email returns managers list"""
        response = self.session.get(
            f"{BASE_URL}/api/auth/business/managers",
            params={"email": BUSINESS_EMAIL}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Should have at least one manager (Test Worker Duration)
        if len(data) > 0:
            manager = data[0]
            assert "id" in manager, "Manager should have id"
            assert "name" in manager, "Manager should have name"
            assert "has_pin" in manager, "Manager should have has_pin field"
            print(f"Found {len(data)} manager(s): {[m['name'] for m in data]}")
    
    def test_get_managers_with_nonexistent_email(self):
        """GET /api/auth/business/managers with non-existent email returns empty list"""
        response = self.session.get(
            f"{BASE_URL}/api/auth/business/managers",
            params={"email": "noexiste@test.com"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) == 0, "Should return empty list for non-existent business"
        print("Correctly returned empty list for non-existent email")
    
    def test_get_managers_without_email_param(self):
        """GET /api/auth/business/managers without email param should handle gracefully"""
        response = self.session.get(f"{BASE_URL}/api/auth/business/managers")
        # Should either return 422 (validation error) or empty list
        assert response.status_code in [200, 422], f"Expected 200 or 422, got {response.status_code}"
        print(f"Response without email param: {response.status_code}")
    
    # ========== POST /api/auth/business/manager-login Tests ==========
    
    def test_manager_login_success(self):
        """POST /api/auth/business/manager-login with correct credentials returns token and manager info"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/business/manager-login",
            json={
                "business_email": BUSINESS_EMAIL,
                "worker_id": MANAGER_WORKER_ID,
                "pin": MANAGER_PIN
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify token is returned
        assert "token" in data, "Response should contain token"
        assert len(data["token"]) > 0, "Token should not be empty"
        
        # Verify business info is returned
        assert "business" in data, "Response should contain business"
        assert data["business"]["email"] == BUSINESS_EMAIL, "Business email should match"
        
        # Verify manager info is returned
        assert "manager" in data, "Response should contain manager"
        manager = data["manager"]
        assert manager["worker_id"] == MANAGER_WORKER_ID, "Worker ID should match"
        assert "worker_name" in manager, "Manager should have worker_name"
        assert "permissions" in manager, "Manager should have permissions"
        assert manager["is_manager"] == True, "is_manager should be True"
        
        # Verify permissions structure
        permissions = manager["permissions"]
        assert isinstance(permissions, dict), "Permissions should be a dict"
        print(f"Manager login successful: {manager['worker_name']}")
        print(f"Permissions: {permissions}")
    
    def test_manager_login_wrong_pin(self):
        """POST /api/auth/business/manager-login with wrong PIN returns 401"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/business/manager-login",
            json={
                "business_email": BUSINESS_EMAIL,
                "worker_id": MANAGER_WORKER_ID,
                "pin": "9999"  # Wrong PIN
            }
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Response should contain error detail"
        print(f"Correctly rejected wrong PIN: {data['detail']}")
    
    def test_manager_login_nonexistent_business(self):
        """POST /api/auth/business/manager-login with non-existent business returns 401"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/business/manager-login",
            json={
                "business_email": "noexiste@test.com",
                "worker_id": MANAGER_WORKER_ID,
                "pin": MANAGER_PIN
            }
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("Correctly rejected non-existent business")
    
    def test_manager_login_nonexistent_worker(self):
        """POST /api/auth/business/manager-login with non-existent worker returns 401"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/business/manager-login",
            json={
                "business_email": BUSINESS_EMAIL,
                "worker_id": "00000000-0000-0000-0000-000000000000",  # Non-existent
                "pin": MANAGER_PIN
            }
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("Correctly rejected non-existent worker")
    
    def test_manager_login_non_manager_worker(self):
        """POST /api/auth/business/manager-login with non-manager worker returns 401"""
        # First, get the business token to find a non-manager worker
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/business/login",
            json={"email": BUSINESS_EMAIL, "password": BUSINESS_PASSWORD}
        )
        
        if login_response.status_code == 200:
            token = login_response.json()["token"]
            headers = {"Authorization": f"Bearer {token}"}
            
            # Get workers
            workers_response = self.session.get(
                f"{BASE_URL}/api/businesses/my/workers",
                headers=headers
            )
            
            if workers_response.status_code == 200:
                workers = workers_response.json()
                # Find a non-manager worker
                non_manager = next((w for w in workers if not w.get("is_manager")), None)
                
                if non_manager:
                    # Try to login as non-manager
                    response = self.session.post(
                        f"{BASE_URL}/api/auth/business/manager-login",
                        json={
                            "business_email": BUSINESS_EMAIL,
                            "worker_id": non_manager["id"],
                            "pin": "1234"
                        }
                    )
                    assert response.status_code == 401, f"Expected 401 for non-manager, got {response.status_code}"
                    print(f"Correctly rejected non-manager worker: {non_manager['name']}")
                else:
                    print("No non-manager workers found to test - skipping")
                    pytest.skip("No non-manager workers available")
            else:
                pytest.skip("Could not get workers list")
        else:
            pytest.skip("Could not login as business owner")
    
    def test_manager_login_returns_correct_permissions(self):
        """POST /api/auth/business/manager-login returns correct permissions for the manager"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/business/manager-login",
            json={
                "business_email": BUSINESS_EMAIL,
                "worker_id": MANAGER_WORKER_ID,
                "pin": MANAGER_PIN
            }
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        permissions = data["manager"]["permissions"]
        
        # According to test requirements, Test Worker Duration has these permissions:
        # complete_bookings=true, reschedule_bookings=true, cancel_bookings=false,
        # block_clients=false, view_client_data=true, edit_services=false,
        # edit_profile=false, view_reports=false
        
        expected_permissions = {
            "complete_bookings": True,
            "reschedule_bookings": True,
            "cancel_bookings": False,
            "block_clients": False,
            "view_client_data": True,
            "edit_services": False,
            "edit_profile": False,
            "view_reports": False
        }
        
        for perm, expected_value in expected_permissions.items():
            actual_value = permissions.get(perm)
            assert actual_value == expected_value, f"Permission {perm}: expected {expected_value}, got {actual_value}"
        
        print(f"All permissions verified correctly: {permissions}")


class TestBusinessOwnerLogin:
    """Test that business owner login still works correctly"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_owner_login_success(self):
        """POST /api/auth/business/login with owner credentials works"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/business/login",
            json={"email": BUSINESS_EMAIL, "password": BUSINESS_PASSWORD}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "business" in data, "Response should contain business"
        
        # Owner login should NOT have manager field
        assert "manager" not in data or data.get("manager") is None, "Owner login should not have manager field"
        
        print(f"Owner login successful for: {data['business']['name']}")
    
    def test_owner_login_wrong_password(self):
        """POST /api/auth/business/login with wrong password returns 401"""
        response = self.session.post(
            f"{BASE_URL}/api/auth/business/login",
            json={"email": BUSINESS_EMAIL, "password": "WrongPassword123!"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Correctly rejected wrong password for owner login")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
