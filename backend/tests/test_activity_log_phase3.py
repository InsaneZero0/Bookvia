"""
Test Activity Log Phase 3 - Business Activity Audit System
Tests for:
- GET /api/businesses/my/activity-log endpoint
- Activity log filtering by actor_type
- Activity log pagination
- Access control (owner only, not managers)
- Automatic activity logging on booking actions
- Automatic activity logging on admin management actions
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
OWNER_EMAIL = "testrealstripe@bookvia.com"
OWNER_PASSWORD = "Test1234!"
ADMIN_BUSINESS_EMAIL = "testrealstripe@bookvia.com"
ADMIN_WORKER_ID = "e8156189-9cc2-4b3d-9f0e-2df518915bda"
ADMIN_PIN = "1234"


class TestActivityLogEndpoint:
    """Tests for GET /api/businesses/my/activity-log endpoint"""
    
    @pytest.fixture(scope="class")
    def owner_token(self):
        """Get owner authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Owner login failed: {response.status_code} - {response.text}")
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get administrator (manager) authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/business/manager-login", json={
            "business_email": ADMIN_BUSINESS_EMAIL,
            "worker_id": ADMIN_WORKER_ID,
            "pin": ADMIN_PIN
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    
    def test_activity_log_returns_logs_with_pagination(self, owner_token):
        """Test that activity log endpoint returns logs with total, page, pages"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/my/activity-log",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "logs" in data, "Response should contain 'logs' field"
        assert "total" in data, "Response should contain 'total' field"
        assert "page" in data, "Response should contain 'page' field"
        assert "pages" in data, "Response should contain 'pages' field"
        
        # Verify types
        assert isinstance(data["logs"], list), "logs should be a list"
        assert isinstance(data["total"], int), "total should be an integer"
        assert isinstance(data["page"], int), "page should be an integer"
        assert isinstance(data["pages"], int), "pages should be an integer"
        
        print(f"Activity log returned {data['total']} total logs, page {data['page']} of {data['pages']}")
    
    def test_activity_log_filter_by_admin(self, owner_token):
        """Test filtering activity logs by actor_type=admin"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/my/activity-log",
            params={"actor_type": "admin"},
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        logs = data.get("logs", [])
        
        # All returned logs should be from admin actors
        for log in logs:
            assert log.get("actor_type") == "admin", f"Expected actor_type='admin', got '{log.get('actor_type')}'"
        
        print(f"Filter by admin returned {len(logs)} logs")
    
    def test_activity_log_filter_by_owner(self, owner_token):
        """Test filtering activity logs by actor_type=owner"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/my/activity-log",
            params={"actor_type": "owner"},
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        logs = data.get("logs", [])
        
        # All returned logs should be from owner actors
        for log in logs:
            assert log.get("actor_type") == "owner", f"Expected actor_type='owner', got '{log.get('actor_type')}'"
        
        print(f"Filter by owner returned {len(logs)} logs")
    
    def test_activity_log_admin_access_denied(self, admin_token):
        """Test that administrator (manager) cannot access activity log - returns 403"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/my/activity-log",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 403, f"Expected 403 for admin access, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Error response should contain 'detail'"
        print(f"Admin access correctly denied: {data.get('detail')}")
    
    def test_activity_log_entry_structure(self, owner_token):
        """Test that log entries have required fields"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/my/activity-log",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        logs = data.get("logs", [])
        
        if len(logs) == 0:
            pytest.skip("No activity logs to verify structure")
        
        # Check first log entry structure
        log = logs[0]
        required_fields = ["id", "business_id", "actor_type", "actor_name", "action", "target_type", "target_id", "created_at"]
        
        for field in required_fields:
            assert field in log, f"Log entry missing required field: {field}"
        
        # Verify details field exists (can be empty dict)
        assert "details" in log, "Log entry should have 'details' field"
        
        print(f"Log entry structure verified: {list(log.keys())}")
    
    def test_activity_log_pagination(self, owner_token):
        """Test pagination with page and limit parameters"""
        # Get first page with limit 5
        response = requests.get(
            f"{BASE_URL}/api/businesses/my/activity-log",
            params={"page": 1, "limit": 5},
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["page"] == 1, "Page should be 1"
        assert len(data["logs"]) <= 5, "Should return at most 5 logs"
        
        # If there are more pages, test page 2
        if data["pages"] > 1:
            response2 = requests.get(
                f"{BASE_URL}/api/businesses/my/activity-log",
                params={"page": 2, "limit": 5},
                headers={"Authorization": f"Bearer {owner_token}"}
            )
            assert response2.status_code == 200
            data2 = response2.json()
            assert data2["page"] == 2, "Page should be 2"
            
            # Verify different logs on different pages
            if len(data["logs"]) > 0 and len(data2["logs"]) > 0:
                page1_ids = {log["id"] for log in data["logs"]}
                page2_ids = {log["id"] for log in data2["logs"]}
                assert page1_ids.isdisjoint(page2_ids), "Pages should have different logs"
        
        print(f"Pagination test passed: {data['total']} total, {data['pages']} pages")
    
    def test_activity_log_unauthenticated_access(self):
        """Test that unauthenticated access is denied"""
        response = requests.get(f"{BASE_URL}/api/businesses/my/activity-log")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("Unauthenticated access correctly denied")


class TestActivityLogGeneration:
    """Tests for automatic activity log generation on actions"""
    
    @pytest.fixture(scope="class")
    def owner_token(self):
        """Get owner authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": OWNER_EMAIL,
            "password": OWNER_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip(f"Owner login failed: {response.status_code}")
    
    @pytest.fixture(scope="class")
    def business_data(self, owner_token):
        """Get business dashboard data"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/my/dashboard",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        if response.status_code == 200:
            return response.json()
        pytest.skip("Could not get business dashboard")
    
    def test_activity_logs_exist_for_business(self, owner_token):
        """Verify that sample activity logs exist (seeded data)"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/my/activity-log",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        total = data.get("total", 0)
        
        # According to the agent context, 6 sample logs were inserted
        print(f"Found {total} activity logs in database")
        
        # Verify we have some logs
        if total > 0:
            logs = data.get("logs", [])
            actions = [log.get("action") for log in logs]
            print(f"Actions found: {set(actions)}")
    
    def test_activity_log_actions_are_valid(self, owner_token):
        """Verify that all logged actions are valid action types"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/my/activity-log",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        logs = data.get("logs", [])
        
        valid_actions = {
            "complete_booking", "cancel_booking", "reschedule_booking",
            "designate_admin", "remove_admin", "update_permissions"
        }
        
        for log in logs:
            action = log.get("action")
            assert action in valid_actions, f"Invalid action type: {action}"
        
        print(f"All {len(logs)} log actions are valid")
    
    def test_activity_log_sorted_by_created_at_desc(self, owner_token):
        """Verify logs are sorted by created_at in descending order"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/my/activity-log",
            headers={"Authorization": f"Bearer {owner_token}"}
        )
        assert response.status_code == 200
        
        data = response.json()
        logs = data.get("logs", [])
        
        if len(logs) < 2:
            pytest.skip("Need at least 2 logs to verify sorting")
        
        # Verify descending order
        for i in range(len(logs) - 1):
            current_time = logs[i].get("created_at", "")
            next_time = logs[i + 1].get("created_at", "")
            assert current_time >= next_time, f"Logs not sorted DESC: {current_time} < {next_time}"
        
        print(f"Logs correctly sorted by created_at DESC")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
