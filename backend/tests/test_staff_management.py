"""
Test Staff/Sub-Admin Management Feature
Tests:
- Staff CRUD operations (Super Admin only)
- Staff login without 2FA
- Staff permissions and access control
- My-permissions endpoint
"""
import pytest
import requests
import os
import subprocess
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPER_ADMIN_EMAIL = "zamorachapa50@gmail.com"
SUPER_ADMIN_PASSWORD = "RainbowLol3133!"

# Test staff data
TEST_STAFF_EMAIL = f"test_staff_{int(time.time())}@bookvia.com"
TEST_STAFF_PASSWORD = "StaffPass123!"
TEST_STAFF_NAME = "Test Staff Member"
TEST_STAFF_PERMISSIONS = ["overview", "businesses", "users"]


def get_totp_code():
    """Get TOTP code from script"""
    result = subprocess.run(
        ["python", "/app/scripts/get_admin_totp.py"],
        capture_output=True, text=True
    )
    return result.stdout.strip()


@pytest.fixture(scope="module")
def super_admin_token():
    """Get super admin token with 2FA"""
    totp_code = get_totp_code()
    response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
        "email": SUPER_ADMIN_EMAIL,
        "password": SUPER_ADMIN_PASSWORD,
        "totp_code": totp_code
    })
    assert response.status_code == 200, f"Super admin login failed: {response.text}"
    data = response.json()
    assert "token" in data, "No token in response"
    return data["token"]


@pytest.fixture(scope="module")
def super_admin_headers(super_admin_token):
    """Headers with super admin auth"""
    return {"Authorization": f"Bearer {super_admin_token}"}


class TestStaffCRUD:
    """Test Staff CRUD operations - Super Admin only"""
    
    created_staff_id = None
    
    def test_01_get_staff_list_requires_super_admin(self, super_admin_headers):
        """GET /api/admin/staff requires super admin"""
        response = requests.get(f"{BASE_URL}/api/admin/staff", headers=super_admin_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "staff" in data
        assert "available_permissions" in data
        # Verify available permissions list
        expected_perms = ["overview", "businesses", "users", "reviews", "categories",
                         "rankings", "cities", "config", "support", "reports",
                         "subscriptions", "finance"]
        assert data["available_permissions"] == expected_perms
        print(f"PASSED: GET /api/admin/staff returns staff list and available_permissions")
    
    def test_02_create_staff_member(self, super_admin_headers):
        """POST /api/admin/staff creates a staff member"""
        response = requests.post(f"{BASE_URL}/api/admin/staff", 
            headers=super_admin_headers,
            json={
                "email": TEST_STAFF_EMAIL,
                "password": TEST_STAFF_PASSWORD,
                "full_name": TEST_STAFF_NAME,
                "role_label": "Support Agent",
                "permissions": TEST_STAFF_PERMISSIONS
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["email"] == TEST_STAFF_EMAIL
        assert data["full_name"] == TEST_STAFF_NAME
        assert data["role"] == "staff"
        assert data["role_label"] == "Support Agent"
        assert data["staff_permissions"] == TEST_STAFF_PERMISSIONS
        assert "password_hash" not in data  # Should not expose password
        TestStaffCRUD.created_staff_id = data["id"]
        print(f"PASSED: POST /api/admin/staff creates staff member with id={data['id']}")
    
    def test_03_create_staff_duplicate_email_fails(self, super_admin_headers):
        """POST /api/admin/staff with duplicate email fails"""
        response = requests.post(f"{BASE_URL}/api/admin/staff",
            headers=super_admin_headers,
            json={
                "email": TEST_STAFF_EMAIL,  # Same email
                "password": "AnotherPass123!",
                "full_name": "Another Staff",
                "permissions": ["overview"]
            }
        )
        assert response.status_code == 400
        assert "already in use" in response.json().get("detail", "").lower()
        print("PASSED: Duplicate email rejected")
    
    def test_04_create_staff_invalid_permission_fails(self, super_admin_headers):
        """POST /api/admin/staff with invalid permission fails"""
        response = requests.post(f"{BASE_URL}/api/admin/staff",
            headers=super_admin_headers,
            json={
                "email": f"invalid_perm_{int(time.time())}@test.com",
                "password": "Pass123!",
                "full_name": "Invalid Perm Staff",
                "permissions": ["invalid_permission"]
            }
        )
        assert response.status_code == 400
        assert "invalid permissions" in response.json().get("detail", "").lower()
        print("PASSED: Invalid permission rejected")
    
    def test_05_update_staff_member(self, super_admin_headers):
        """PUT /api/admin/staff/{id} updates staff"""
        assert TestStaffCRUD.created_staff_id, "No staff created"
        response = requests.put(
            f"{BASE_URL}/api/admin/staff/{TestStaffCRUD.created_staff_id}",
            headers=super_admin_headers,
            json={
                "full_name": "Updated Staff Name",
                "role_label": "Senior Support",
                "permissions": ["overview", "businesses", "users", "reviews"]
            }
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["full_name"] == "Updated Staff Name"
        assert data["role_label"] == "Senior Support"
        assert "reviews" in data["staff_permissions"]
        print("PASSED: PUT /api/admin/staff/{id} updates staff member")
    
    def test_06_get_staff_list_shows_created_staff(self, super_admin_headers):
        """Verify created staff appears in list"""
        response = requests.get(f"{BASE_URL}/api/admin/staff", headers=super_admin_headers)
        assert response.status_code == 200
        data = response.json()
        staff_emails = [s["email"] for s in data["staff"]]
        assert TEST_STAFF_EMAIL in staff_emails
        print("PASSED: Created staff appears in staff list")


class TestStaffLogin:
    """Test Staff login without 2FA"""
    
    staff_token = None
    
    def test_01_staff_login_without_totp(self):
        """Staff can login without TOTP code"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": TEST_STAFF_EMAIL,
            "password": TEST_STAFF_PASSWORD,
            "totp_code": "000000"  # Dummy code - staff doesn't need 2FA
        })
        assert response.status_code == 200, f"Staff login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert data.get("totp_enabled") == False  # Staff has no 2FA
        assert data["user"]["role"] == "staff"
        TestStaffLogin.staff_token = data["token"]
        print("PASSED: Staff can login without 2FA")
    
    def test_02_staff_login_wrong_password_fails(self):
        """Staff login with wrong password fails"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": TEST_STAFF_EMAIL,
            "password": "WrongPassword123!",
            "totp_code": "000000"
        })
        assert response.status_code == 401
        print("PASSED: Staff login with wrong password rejected")


class TestStaffPermissions:
    """Test Staff permissions and access control"""
    
    def test_01_staff_my_permissions_endpoint(self):
        """GET /api/admin/my-permissions returns staff permissions"""
        assert TestStaffLogin.staff_token, "No staff token"
        headers = {"Authorization": f"Bearer {TestStaffLogin.staff_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/my-permissions", headers=headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert data["role"] == "staff"
        assert data["is_super_admin"] == False
        assert "permissions" in data
        # Staff should have the permissions we assigned
        for perm in ["overview", "businesses", "users", "reviews"]:
            assert perm in data["permissions"], f"Missing permission: {perm}"
        print(f"PASSED: Staff my-permissions returns correct data: {data}")
    
    def test_02_super_admin_my_permissions(self, super_admin_headers):
        """Super admin gets all permissions"""
        response = requests.get(f"{BASE_URL}/api/admin/my-permissions", headers=super_admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "admin"
        assert data["is_super_admin"] == True
        assert "staff" in data["permissions"]  # Super admin has staff permission
        print(f"PASSED: Super admin my-permissions returns is_super_admin=True")
    
    def test_03_staff_can_access_admin_stats(self):
        """Staff can access general admin endpoints"""
        assert TestStaffLogin.staff_token, "No staff token"
        headers = {"Authorization": f"Bearer {TestStaffLogin.staff_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/stats", headers=headers)
        assert response.status_code == 200, f"Staff cannot access admin stats: {response.text}"
        print("PASSED: Staff can access /api/admin/stats")
    
    def test_04_staff_can_access_businesses_all(self):
        """Staff can access businesses list (has 'businesses' permission)"""
        assert TestStaffLogin.staff_token, "No staff token"
        headers = {"Authorization": f"Bearer {TestStaffLogin.staff_token}"}
        response = requests.get(f"{BASE_URL}/api/admin/businesses/all", headers=headers)
        assert response.status_code == 200, f"Staff cannot access businesses: {response.text}"
        print("PASSED: Staff can access /api/admin/businesses/all")
    
    def test_05_staff_cannot_access_staff_crud(self):
        """Staff CANNOT access staff CRUD endpoints (super admin only)"""
        assert TestStaffLogin.staff_token, "No staff token"
        headers = {"Authorization": f"Bearer {TestStaffLogin.staff_token}"}
        
        # GET staff list
        response = requests.get(f"{BASE_URL}/api/admin/staff", headers=headers)
        assert response.status_code == 403, f"Staff should not access staff list: {response.status_code}"
        
        # POST create staff
        response = requests.post(f"{BASE_URL}/api/admin/staff", headers=headers, json={
            "email": "hacker@test.com",
            "password": "Hack123!",
            "full_name": "Hacker",
            "permissions": []
        })
        assert response.status_code == 403, f"Staff should not create staff: {response.status_code}"
        
        print("PASSED: Staff cannot access staff CRUD endpoints (403)")


class TestStaffPasswordReset:
    """Test staff password reset"""
    
    def test_01_reset_staff_password(self, super_admin_headers):
        """PUT /api/admin/staff/{id}/reset-password resets password"""
        assert TestStaffCRUD.created_staff_id, "No staff created"
        response = requests.put(
            f"{BASE_URL}/api/admin/staff/{TestStaffCRUD.created_staff_id}/reset-password",
            headers=super_admin_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "temporary_password" in data
        assert data["message"] == "Password reset"
        print(f"PASSED: Password reset returns temporary_password: {data['temporary_password'][:8]}...")


class TestStaffDelete:
    """Test staff deletion - run last"""
    
    def test_01_delete_staff_member(self, super_admin_headers):
        """DELETE /api/admin/staff/{id} deletes staff"""
        assert TestStaffCRUD.created_staff_id, "No staff created"
        response = requests.delete(
            f"{BASE_URL}/api/admin/staff/{TestStaffCRUD.created_staff_id}",
            headers=super_admin_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        assert response.json()["message"] == "Staff member deleted"
        print("PASSED: DELETE /api/admin/staff/{id} deletes staff member")
    
    def test_02_deleted_staff_cannot_login(self):
        """Deleted staff cannot login"""
        response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
            "email": TEST_STAFF_EMAIL,
            "password": TEST_STAFF_PASSWORD,
            "totp_code": "000000"
        })
        assert response.status_code == 401, f"Deleted staff should not login: {response.status_code}"
        print("PASSED: Deleted staff cannot login")


class TestAvailablePermissions:
    """Test available permissions endpoint"""
    
    def test_01_get_available_permissions(self, super_admin_headers):
        """GET /api/admin/staff/permissions returns permission list"""
        response = requests.get(f"{BASE_URL}/api/admin/staff/permissions", headers=super_admin_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "permissions" in data
        expected = ["overview", "businesses", "users", "reviews", "categories",
                    "rankings", "cities", "config", "support", "reports",
                    "subscriptions", "finance"]
        assert data["permissions"] == expected
        print(f"PASSED: Available permissions: {data['permissions']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
