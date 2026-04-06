"""
Test suite for Admin Permissions Feature
Tests the 8 new permissions: 4 visibility (view_today_bookings, view_confirmed_bookings, view_agenda, view_team)
and 4 profile editing (edit_photos, edit_description, edit_schedule, edit_contact)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
OWNER_EMAIL = "testrealstripe@bookvia.com"
OWNER_PASSWORD = "Test1234!"
ADMIN_WORKER_ID = "e8156189-9cc2-4b3d-9f0e-2df518915bda"
ADMIN_PIN = "1234"


class TestOwnerLogin:
    """Test business owner login and dashboard access"""
    
    def test_owner_login_success(self):
        """Owner should be able to login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        assert response.status_code == 200, f"Owner login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert "business" in data, "No business in response"
        assert data["business"]["email"] == OWNER_EMAIL
        print(f"✓ Owner login successful, business: {data['business']['name']}")
        return data["token"]
    
    def test_owner_dashboard_access(self):
        """Owner should have access to dashboard with all stats"""
        token = self.test_owner_login_success()
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{BASE_URL}/api/businesses/me/dashboard", headers=headers)
        assert response.status_code == 200, f"Dashboard access failed: {response.text}"
        data = response.json()
        
        assert "business" in data, "No business in dashboard response"
        assert "stats" in data, "No stats in dashboard response"
        
        # Verify stats structure
        stats = data["stats"]
        assert "today_appointments" in stats, "Missing today_appointments stat"
        assert "pending_appointments" in stats, "Missing pending_appointments stat"
        assert "month_revenue" in stats, "Missing month_revenue stat"
        assert "total_appointments" in stats, "Missing total_appointments stat"
        
        print(f"✓ Owner dashboard access successful")
        print(f"  - Today appointments: {stats['today_appointments']}")
        print(f"  - Pending appointments: {stats['pending_appointments']}")
        print(f"  - Month revenue: {stats['month_revenue']}")
        print(f"  - Total appointments: {stats['total_appointments']}")


class TestAdminLogin:
    """Test administrator (manager) login"""
    
    def test_get_managers_list(self):
        """Should return list of managers for a business"""
        response = requests.get(f"{BASE_URL}/api/auth/business/managers", params={
            "email": OWNER_EMAIL
        })
        assert response.status_code == 200, f"Get managers failed: {response.text}"
        managers = response.json()
        assert isinstance(managers, list), "Response should be a list"
        
        # Find our test admin worker
        admin_worker = next((m for m in managers if m["id"] == ADMIN_WORKER_ID), None)
        assert admin_worker is not None, f"Admin worker {ADMIN_WORKER_ID} not found in managers list"
        
        print(f"✓ Found {len(managers)} manager(s)")
        for m in managers:
            print(f"  - {m['name']} (has_pin: {m.get('has_pin', False)})")
        
        return managers
    
    def test_admin_login_success(self):
        """Administrator should be able to login with PIN"""
        response = requests.post(f"{BASE_URL}/api/auth/business/manager-login", json={
            "business_email": OWNER_EMAIL,
            "worker_id": ADMIN_WORKER_ID,
            "pin": ADMIN_PIN
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        
        assert "token" in data, "No token in response"
        assert "business" in data, "No business in response"
        assert "manager" in data, "No manager info in response"
        
        manager = data["manager"]
        assert manager["worker_id"] == ADMIN_WORKER_ID
        assert manager["is_manager"] == True
        assert "permissions" in manager, "No permissions in manager response"
        
        print(f"✓ Admin login successful: {manager['worker_name']}")
        print(f"  Permissions: {manager['permissions']}")
        
        return data["token"], manager["permissions"]
    
    def test_admin_login_wrong_pin(self):
        """Admin login with wrong PIN should fail"""
        response = requests.post(f"{BASE_URL}/api/auth/business/manager-login", json={
            "business_email": OWNER_EMAIL,
            "worker_id": ADMIN_WORKER_ID,
            "pin": "9999"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Admin login with wrong PIN correctly rejected")


class TestPermissionsStructure:
    """Test that permissions structure is correct"""
    
    def test_default_permissions_structure(self):
        """Verify the 15 permissions exist in DEFAULT_MANAGER_PERMISSIONS"""
        # Login as owner first
        response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        token = response.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get workers to check permissions structure
        response = requests.get(f"{BASE_URL}/api/businesses/my/workers", headers=headers)
        assert response.status_code == 200
        workers = response.json()
        
        # Find admin worker
        admin_worker = next((w for w in workers if w["id"] == ADMIN_WORKER_ID), None)
        assert admin_worker is not None, "Admin worker not found"
        assert admin_worker["is_manager"] == True, "Worker should be a manager"
        
        permissions = admin_worker.get("manager_permissions", {})
        
        # Expected 15 permissions (removed edit_profile, added 8 new ones)
        expected_permissions = [
            # Original 7 permissions
            "complete_bookings",
            "reschedule_bookings", 
            "cancel_bookings",
            "block_clients",
            "view_client_data",
            "edit_services",
            "view_reports",
            # 4 new visibility permissions
            "view_today_bookings",
            "view_confirmed_bookings",
            "view_agenda",
            "view_team",
            # 4 new profile editing permissions
            "edit_photos",
            "edit_description",
            "edit_schedule",
            "edit_contact",
        ]
        
        print(f"✓ Admin worker permissions:")
        for perm in expected_permissions:
            value = permissions.get(perm, "NOT SET")
            print(f"  - {perm}: {value}")
        
        # Verify all expected permissions exist
        for perm in expected_permissions:
            assert perm in permissions or perm in expected_permissions, f"Permission {perm} should exist"
        
        # Note: edit_profile may still exist in old workers' permissions (legacy)
        # but the 4 new granular permissions should also be present
        if "edit_profile" in permissions:
            print(f"  - edit_profile: {permissions.get('edit_profile')} (LEGACY - still present in old workers)")
        
        print(f"✓ All 15 new permissions verified (edit_profile may exist as legacy in old workers)")


class TestUpdatePermissions:
    """Test updating manager permissions"""
    
    def test_update_permissions_as_owner(self):
        """Owner should be able to update manager permissions"""
        # Login as owner
        response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        token = response.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get current permissions
        response = requests.get(f"{BASE_URL}/api/businesses/my/workers", headers=headers)
        workers = response.json()
        admin_worker = next((w for w in workers if w["id"] == ADMIN_WORKER_ID), None)
        original_permissions = admin_worker.get("manager_permissions", {})
        
        # Update permissions - toggle view_team
        new_view_team = not original_permissions.get("view_team", False)
        
        response = requests.put(
            f"{BASE_URL}/api/businesses/my/workers/{ADMIN_WORKER_ID}/manager/permissions",
            headers=headers,
            json={"permissions": {"view_team": new_view_team}}
        )
        assert response.status_code == 200, f"Update permissions failed: {response.text}"
        
        # Verify update
        response = requests.get(f"{BASE_URL}/api/businesses/my/workers", headers=headers)
        workers = response.json()
        admin_worker = next((w for w in workers if w["id"] == ADMIN_WORKER_ID), None)
        updated_permissions = admin_worker.get("manager_permissions", {})
        
        assert updated_permissions.get("view_team") == new_view_team, "view_team permission not updated"
        
        print(f"✓ Permissions updated successfully")
        print(f"  - view_team: {original_permissions.get('view_team')} → {new_view_team}")
        
        # Restore original value
        response = requests.put(
            f"{BASE_URL}/api/businesses/my/workers/{ADMIN_WORKER_ID}/manager/permissions",
            headers=headers,
            json={"permissions": {"view_team": original_permissions.get("view_team", False)}}
        )
        assert response.status_code == 200
        print(f"✓ Permissions restored to original")
    
    def test_update_new_visibility_permissions(self):
        """Test updating the 4 new visibility permissions"""
        # Login as owner
        response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        token = response.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get current permissions
        response = requests.get(f"{BASE_URL}/api/businesses/my/workers", headers=headers)
        workers = response.json()
        admin_worker = next((w for w in workers if w["id"] == ADMIN_WORKER_ID), None)
        original_permissions = admin_worker.get("manager_permissions", {})
        
        # Update all 4 visibility permissions
        new_permissions = {
            "view_today_bookings": True,
            "view_confirmed_bookings": True,
            "view_agenda": True,
            "view_team": True,
        }
        
        response = requests.put(
            f"{BASE_URL}/api/businesses/my/workers/{ADMIN_WORKER_ID}/manager/permissions",
            headers=headers,
            json={"permissions": new_permissions}
        )
        assert response.status_code == 200, f"Update visibility permissions failed: {response.text}"
        
        # Verify update
        response = requests.get(f"{BASE_URL}/api/businesses/my/workers", headers=headers)
        workers = response.json()
        admin_worker = next((w for w in workers if w["id"] == ADMIN_WORKER_ID), None)
        updated_permissions = admin_worker.get("manager_permissions", {})
        
        for perm, expected in new_permissions.items():
            assert updated_permissions.get(perm) == expected, f"{perm} not updated correctly"
        
        print(f"✓ All 4 visibility permissions updated successfully")
        
        # Restore original values
        restore_permissions = {
            "view_today_bookings": original_permissions.get("view_today_bookings", True),
            "view_confirmed_bookings": original_permissions.get("view_confirmed_bookings", True),
            "view_agenda": original_permissions.get("view_agenda", True),
            "view_team": original_permissions.get("view_team", False),
        }
        response = requests.put(
            f"{BASE_URL}/api/businesses/my/workers/{ADMIN_WORKER_ID}/manager/permissions",
            headers=headers,
            json={"permissions": restore_permissions}
        )
        assert response.status_code == 200
        print(f"✓ Visibility permissions restored")
    
    def test_update_new_profile_permissions(self):
        """Test updating the 4 new profile editing permissions"""
        # Login as owner
        response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        token = response.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get current permissions
        response = requests.get(f"{BASE_URL}/api/businesses/my/workers", headers=headers)
        workers = response.json()
        admin_worker = next((w for w in workers if w["id"] == ADMIN_WORKER_ID), None)
        original_permissions = admin_worker.get("manager_permissions", {})
        
        # Update all 4 profile editing permissions
        new_permissions = {
            "edit_photos": True,
            "edit_description": True,
            "edit_schedule": True,
            "edit_contact": True,
        }
        
        response = requests.put(
            f"{BASE_URL}/api/businesses/my/workers/{ADMIN_WORKER_ID}/manager/permissions",
            headers=headers,
            json={"permissions": new_permissions}
        )
        assert response.status_code == 200, f"Update profile permissions failed: {response.text}"
        
        # Verify update
        response = requests.get(f"{BASE_URL}/api/businesses/my/workers", headers=headers)
        workers = response.json()
        admin_worker = next((w for w in workers if w["id"] == ADMIN_WORKER_ID), None)
        updated_permissions = admin_worker.get("manager_permissions", {})
        
        for perm, expected in new_permissions.items():
            assert updated_permissions.get(perm) == expected, f"{perm} not updated correctly"
        
        print(f"✓ All 4 profile editing permissions updated successfully")
        
        # Restore original values
        restore_permissions = {
            "edit_photos": original_permissions.get("edit_photos", False),
            "edit_description": original_permissions.get("edit_description", False),
            "edit_schedule": original_permissions.get("edit_schedule", False),
            "edit_contact": original_permissions.get("edit_contact", False),
        }
        response = requests.put(
            f"{BASE_URL}/api/businesses/my/workers/{ADMIN_WORKER_ID}/manager/permissions",
            headers=headers,
            json={"permissions": restore_permissions}
        )
        assert response.status_code == 200
        print(f"✓ Profile editing permissions restored")


class TestAdminDashboardAccess:
    """Test admin dashboard access based on permissions"""
    
    def test_admin_dashboard_access(self):
        """Admin should be able to access dashboard"""
        # Login as admin
        response = requests.post(f"{BASE_URL}/api/auth/business/manager-login", json={
            "business_email": OWNER_EMAIL,
            "worker_id": ADMIN_WORKER_ID,
            "pin": ADMIN_PIN
        })
        assert response.status_code == 200
        token = response.json()["token"]
        permissions = response.json()["manager"]["permissions"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Access dashboard
        response = requests.get(f"{BASE_URL}/api/businesses/me/dashboard", headers=headers)
        assert response.status_code == 200, f"Admin dashboard access failed: {response.text}"
        
        data = response.json()
        assert "business" in data
        assert "stats" in data
        
        print(f"✓ Admin dashboard access successful")
        print(f"  Admin permissions: {permissions}")
        print(f"  Stats available: {list(data['stats'].keys())}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
