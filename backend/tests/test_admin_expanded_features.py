"""
Test Admin Panel Expanded Features:
1. Categories CRUD (GET, POST, PUT, DELETE)
2. Platform Config (GET, PUT)
3. Support Tickets (GET list, GET stats, GET detail, POST respond, PUT close)
"""
import pytest
import requests
import os
import subprocess

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://marketplace-test-21.preview.emergentagent.com').rstrip('/')

def get_admin_totp():
    """Get TOTP code for admin login"""
    result = subprocess.run(
        ['python', '/app/scripts/get_admin_totp.py'],
        capture_output=True, text=True, cwd='/app/backend'
    )
    return result.stdout.strip()

@pytest.fixture(scope="module")
def admin_token():
    """Get admin auth token"""
    totp_code = get_admin_totp()
    response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
        "email": "zamorachapa50@gmail.com",
        "password": "RainbowLol3133!",
        "totp_code": totp_code
    })
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return response.json()["token"]

@pytest.fixture(scope="module")
def admin_headers(admin_token):
    """Headers with admin auth"""
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ============ CATEGORIES CRUD TESTS ============

class TestCategoriesCRUD:
    """Test category management endpoints"""
    
    def test_get_categories_returns_list_with_business_count(self, admin_headers):
        """GET /api/admin/categories returns all categories with business_count"""
        response = requests.get(f"{BASE_URL}/api/admin/categories", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should have existing categories from seed
        assert len(data) >= 1
        # Each category should have business_count
        for cat in data:
            assert "id" in cat
            assert "name_es" in cat
            assert "name_en" in cat
            assert "slug" in cat
            assert "icon" in cat
            assert "business_count" in cat
            assert isinstance(cat["business_count"], int)
        print(f"✓ GET /api/admin/categories - returned {len(data)} categories with business_count")
    
    def test_create_category_success(self, admin_headers):
        """POST /api/admin/categories creates new category"""
        new_cat = {
            "name_es": "TEST Categoria Nueva",
            "name_en": "TEST New Category",
            "slug": "test-nueva-categoria",
            "icon": "TestTube"
        }
        response = requests.post(f"{BASE_URL}/api/admin/categories", json=new_cat, headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["name_es"] == new_cat["name_es"]
        assert data["name_en"] == new_cat["name_en"]
        assert data["slug"] == new_cat["slug"]
        assert data["icon"] == new_cat["icon"]
        assert "id" in data
        # Store for cleanup
        TestCategoriesCRUD.created_cat_id = data["id"]
        print(f"✓ POST /api/admin/categories - created category id={data['id']}")
    
    def test_create_category_duplicate_slug_fails(self, admin_headers):
        """POST /api/admin/categories rejects duplicate slug"""
        dup_cat = {
            "name_es": "Duplicado",
            "name_en": "Duplicate",
            "slug": "test-nueva-categoria",  # Same slug as above
            "icon": "Copy"
        }
        response = requests.post(f"{BASE_URL}/api/admin/categories", json=dup_cat, headers=admin_headers)
        assert response.status_code == 400
        assert "slug already exists" in response.json()["detail"].lower()
        print("✓ POST /api/admin/categories - rejects duplicate slug")
    
    def test_update_category_success(self, admin_headers):
        """PUT /api/admin/categories/{id} updates category"""
        cat_id = getattr(TestCategoriesCRUD, 'created_cat_id', None)
        if not cat_id:
            pytest.skip("No category created to update")
        
        update_data = {"name_es": "TEST Categoria Actualizada", "icon": "Sparkles"}
        response = requests.put(f"{BASE_URL}/api/admin/categories/{cat_id}", json=update_data, headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["name_es"] == "TEST Categoria Actualizada"
        assert data["icon"] == "Sparkles"
        print(f"✓ PUT /api/admin/categories/{cat_id} - updated category")
    
    def test_update_category_not_found(self, admin_headers):
        """PUT /api/admin/categories/{id} returns 404 for non-existent"""
        response = requests.put(f"{BASE_URL}/api/admin/categories/nonexistent123", json={"name_es": "Test"}, headers=admin_headers)
        assert response.status_code == 404
        print("✓ PUT /api/admin/categories - 404 for non-existent category")
    
    def test_delete_category_success(self, admin_headers):
        """DELETE /api/admin/categories/{id} deletes category with no businesses"""
        cat_id = getattr(TestCategoriesCRUD, 'created_cat_id', None)
        if not cat_id:
            pytest.skip("No category created to delete")
        
        response = requests.delete(f"{BASE_URL}/api/admin/categories/{cat_id}", headers=admin_headers)
        assert response.status_code == 200
        assert "deleted" in response.json()["message"].lower()
        print(f"✓ DELETE /api/admin/categories/{cat_id} - deleted category")
    
    def test_delete_category_with_businesses_fails(self, admin_headers):
        """DELETE /api/admin/categories/{id} blocks if businesses use it"""
        # First get a category that has businesses
        response = requests.get(f"{BASE_URL}/api/admin/categories", headers=admin_headers)
        cats = response.json()
        cat_with_biz = next((c for c in cats if c.get("business_count", 0) > 0), None)
        
        if not cat_with_biz:
            pytest.skip("No category with businesses to test deletion block")
        
        response = requests.delete(f"{BASE_URL}/api/admin/categories/{cat_with_biz['id']}", headers=admin_headers)
        assert response.status_code == 400
        assert "cannot delete" in response.json()["detail"].lower()
        print(f"✓ DELETE /api/admin/categories - blocks deletion when businesses use it")
    
    def test_categories_requires_admin_auth(self):
        """Categories endpoints require admin authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/categories")
        assert response.status_code in [401, 403]
        print("✓ GET /api/admin/categories - requires admin auth")


# ============ PLATFORM CONFIG TESTS ============

class TestPlatformConfig:
    """Test platform configuration endpoints"""
    
    def test_get_config_returns_defaults(self, admin_headers):
        """GET /api/admin/config returns platform configuration"""
        response = requests.get(f"{BASE_URL}/api/admin/config", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        # Check expected fields - at minimum platform_fee_percent should exist
        assert "platform_fee_percent" in data
        # Validate types for fields that exist
        assert isinstance(data["platform_fee_percent"], (int, float))
        if "subscription_price_mxn" in data:
            assert isinstance(data["subscription_price_mxn"], (int, float))
        if "subscription_trial_days" in data:
            assert isinstance(data["subscription_trial_days"], int)
        if "min_deposit_amount" in data:
            assert isinstance(data["min_deposit_amount"], (int, float))
        print(f"✓ GET /api/admin/config - returned config: fee={data['platform_fee_percent']}")
    
    def test_update_config_success(self, admin_headers):
        """PUT /api/admin/config updates configuration"""
        # First get current config
        get_resp = requests.get(f"{BASE_URL}/api/admin/config", headers=admin_headers)
        original = get_resp.json()
        
        # Update with new values
        update_data = {
            "platform_fee_percent": 0.10,
            "subscription_price_mxn": 49.00,
            "subscription_trial_days": 14,
            "min_deposit_amount": 75.0
        }
        response = requests.put(f"{BASE_URL}/api/admin/config", json=update_data, headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["platform_fee_percent"] == 0.10
        assert data["subscription_price_mxn"] == 49.00
        assert data["subscription_trial_days"] == 14
        assert data["min_deposit_amount"] == 75.0
        assert "updated_at" in data
        assert "updated_by" in data
        print("✓ PUT /api/admin/config - updated configuration")
        
        # Restore original values
        restore_data = {
            "platform_fee_percent": original.get("platform_fee_percent", 0.08),
            "subscription_price_mxn": original.get("subscription_price_mxn", 39.00),
            "subscription_trial_days": original.get("subscription_trial_days", 30),
            "min_deposit_amount": original.get("min_deposit_amount", 50.0)
        }
        requests.put(f"{BASE_URL}/api/admin/config", json=restore_data, headers=admin_headers)
        print("✓ Config restored to original values")
    
    def test_update_config_validates_fee_range(self, admin_headers):
        """PUT /api/admin/config validates fee must be 0-50%"""
        # Fee too high
        response = requests.put(f"{BASE_URL}/api/admin/config", json={"platform_fee_percent": 0.60}, headers=admin_headers)
        assert response.status_code == 400
        assert "fee" in response.json()["detail"].lower()
        print("✓ PUT /api/admin/config - rejects fee > 50%")
        
        # Negative fee
        response = requests.put(f"{BASE_URL}/api/admin/config", json={"platform_fee_percent": -0.05}, headers=admin_headers)
        assert response.status_code == 400
        print("✓ PUT /api/admin/config - rejects negative fee")
    
    def test_update_config_validates_negative_values(self, admin_headers):
        """PUT /api/admin/config rejects negative prices/days"""
        response = requests.put(f"{BASE_URL}/api/admin/config", json={"subscription_price_mxn": -10}, headers=admin_headers)
        assert response.status_code == 400
        print("✓ PUT /api/admin/config - rejects negative price")
        
        response = requests.put(f"{BASE_URL}/api/admin/config", json={"subscription_trial_days": -5}, headers=admin_headers)
        assert response.status_code == 400
        print("✓ PUT /api/admin/config - rejects negative trial days")
    
    def test_config_requires_admin_auth(self):
        """Config endpoints require admin authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/config")
        assert response.status_code in [401, 403]
        print("✓ GET /api/admin/config - requires admin auth")


# ============ SUPPORT TICKETS TESTS ============

class TestSupportTickets:
    """Test support ticket management endpoints"""
    
    def test_get_tickets_returns_paginated_list(self, admin_headers):
        """GET /api/admin/tickets returns paginated tickets"""
        response = requests.get(f"{BASE_URL}/api/admin/tickets", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert "tickets" in data
        assert "total" in data
        assert "page" in data
        assert "pages" in data
        assert isinstance(data["tickets"], list)
        print(f"✓ GET /api/admin/tickets - returned {len(data['tickets'])} tickets, total={data['total']}")
    
    def test_get_tickets_with_status_filter(self, admin_headers):
        """GET /api/admin/tickets filters by status"""
        response = requests.get(f"{BASE_URL}/api/admin/tickets?status=open", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        # All returned tickets should be open
        for ticket in data["tickets"]:
            assert ticket["status"] == "open"
        print(f"✓ GET /api/admin/tickets?status=open - filtered {len(data['tickets'])} open tickets")
    
    def test_get_tickets_with_search(self, admin_headers):
        """GET /api/admin/tickets supports search"""
        response = requests.get(f"{BASE_URL}/api/admin/tickets?search=test", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert "tickets" in data
        print(f"✓ GET /api/admin/tickets?search=test - search returned {len(data['tickets'])} results")
    
    def test_get_ticket_stats(self, admin_headers):
        """GET /api/admin/tickets/stats returns counts"""
        response = requests.get(f"{BASE_URL}/api/admin/tickets/stats", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert "open" in data
        assert "in_progress" in data
        assert "closed" in data
        assert "total" in data
        assert isinstance(data["open"], int)
        assert isinstance(data["in_progress"], int)
        assert isinstance(data["closed"], int)
        assert data["total"] == data["open"] + data["in_progress"] + data["closed"]
        print(f"✓ GET /api/admin/tickets/stats - open={data['open']}, in_progress={data['in_progress']}, closed={data['closed']}")
    
    def test_get_ticket_detail(self, admin_headers):
        """GET /api/admin/tickets/{id} returns single ticket with messages"""
        # First get a ticket ID
        list_resp = requests.get(f"{BASE_URL}/api/admin/tickets", headers=admin_headers)
        tickets = list_resp.json()["tickets"]
        
        if not tickets:
            pytest.skip("No tickets to test detail endpoint")
        
        ticket_id = tickets[0]["id"]
        response = requests.get(f"{BASE_URL}/api/admin/tickets/{ticket_id}", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == ticket_id
        assert "subject" in data
        assert "status" in data
        assert "messages" in data
        assert isinstance(data["messages"], list)
        print(f"✓ GET /api/admin/tickets/{ticket_id} - returned ticket with {len(data['messages'])} messages")
        # Store for respond/close tests
        TestSupportTickets.test_ticket_id = ticket_id
        TestSupportTickets.test_ticket_status = data["status"]
    
    def test_get_ticket_detail_not_found(self, admin_headers):
        """GET /api/admin/tickets/{id} returns 404 for non-existent"""
        response = requests.get(f"{BASE_URL}/api/admin/tickets/nonexistent123", headers=admin_headers)
        assert response.status_code == 404
        print("✓ GET /api/admin/tickets/{id} - 404 for non-existent ticket")
    
    def test_respond_to_ticket(self, admin_headers):
        """POST /api/admin/tickets/{id}/respond adds admin reply"""
        ticket_id = getattr(TestSupportTickets, 'test_ticket_id', None)
        if not ticket_id:
            pytest.skip("No ticket ID available for respond test")
        
        response = requests.post(
            f"{BASE_URL}/api/admin/tickets/{ticket_id}/respond",
            json={"message": "TEST: Admin response to ticket"},
            headers=admin_headers
        )
        assert response.status_code == 200
        assert "sent" in response.json()["message"].lower() or "response" in response.json()["message"].lower()
        
        # Verify message was added
        detail_resp = requests.get(f"{BASE_URL}/api/admin/tickets/{ticket_id}", headers=admin_headers)
        ticket = detail_resp.json()
        assert any("TEST: Admin response" in m.get("message", "") for m in ticket["messages"])
        assert ticket["status"] == "in_progress"  # Status should change to in_progress
        print(f"✓ POST /api/admin/tickets/{ticket_id}/respond - added admin reply, status=in_progress")
    
    def test_respond_to_ticket_not_found(self, admin_headers):
        """POST /api/admin/tickets/{id}/respond returns 404 for non-existent"""
        response = requests.post(
            f"{BASE_URL}/api/admin/tickets/nonexistent123/respond",
            json={"message": "Test"},
            headers=admin_headers
        )
        assert response.status_code == 404
        print("✓ POST /api/admin/tickets/{id}/respond - 404 for non-existent ticket")
    
    def test_close_ticket(self, admin_headers):
        """PUT /api/admin/tickets/{id}/close closes a ticket"""
        ticket_id = getattr(TestSupportTickets, 'test_ticket_id', None)
        if not ticket_id:
            pytest.skip("No ticket ID available for close test")
        
        response = requests.put(f"{BASE_URL}/api/admin/tickets/{ticket_id}/close", headers=admin_headers)
        assert response.status_code == 200
        assert "closed" in response.json()["message"].lower()
        
        # Verify ticket is closed
        detail_resp = requests.get(f"{BASE_URL}/api/admin/tickets/{ticket_id}", headers=admin_headers)
        ticket = detail_resp.json()
        assert ticket["status"] == "closed"
        assert "closed_at" in ticket
        print(f"✓ PUT /api/admin/tickets/{ticket_id}/close - ticket closed")
    
    def test_close_ticket_not_found(self, admin_headers):
        """PUT /api/admin/tickets/{id}/close returns 404 for non-existent"""
        response = requests.put(f"{BASE_URL}/api/admin/tickets/nonexistent123/close", headers=admin_headers)
        assert response.status_code == 404
        print("✓ PUT /api/admin/tickets/{id}/close - 404 for non-existent ticket")
    
    def test_tickets_requires_admin_auth(self):
        """Tickets endpoints require admin authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/tickets")
        assert response.status_code in [401, 403]
        print("✓ GET /api/admin/tickets - requires admin auth")


# ============ REGRESSION TESTS ============

class TestAdminRegression:
    """Regression tests for existing admin functionality"""
    
    def test_admin_stats_still_works(self, admin_headers):
        """GET /api/admin/stats returns stats (regression)"""
        response = requests.get(f"{BASE_URL}/api/admin/stats", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        assert "businesses" in data
        assert "bookings" in data
        print("✓ GET /api/admin/stats - regression passed")
    
    def test_admin_businesses_all_still_works(self, admin_headers):
        """GET /api/admin/businesses/all returns businesses (regression)"""
        response = requests.get(f"{BASE_URL}/api/admin/businesses/all", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert "businesses" in data
        assert "total" in data
        print(f"✓ GET /api/admin/businesses/all - regression passed, {data['total']} businesses")
    
    def test_admin_users_all_still_works(self, admin_headers):
        """GET /api/admin/users/all returns users (regression)"""
        response = requests.get(f"{BASE_URL}/api/admin/users/all", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        assert "total" in data
        print(f"✓ GET /api/admin/users/all - regression passed, {data['total']} users")
    
    def test_admin_reviews_all_still_works(self, admin_headers):
        """GET /api/admin/reviews/all returns reviews (regression)"""
        response = requests.get(f"{BASE_URL}/api/admin/reviews/all", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert "reviews" in data
        assert "total" in data
        print(f"✓ GET /api/admin/reviews/all - regression passed, {data['total']} reviews")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
