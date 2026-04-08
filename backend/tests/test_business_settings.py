"""
Test Business Settings Page API endpoints
Tests for /api/businesses/me/private-info and related endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://marketplace-test-21.preview.emergentagent.com')

# Test credentials
BUSINESS_EMAIL = "testrealstripe@bookvia.com"
BUSINESS_PASSWORD = "Test1234!"


class TestBusinessSettingsAPI:
    """Test Business Settings API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as business owner"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as business owner
        response = self.session.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": BUSINESS_EMAIL,
            "password": BUSINESS_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get("token")
        assert self.token, "No token received"
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
    def test_health_endpoint(self):
        """Test health endpoint is accessible"""
        response = self.session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("SUCCESS: Health endpoint working")
    
    def test_get_private_info(self):
        """Test GET /api/businesses/me/private-info returns correct data"""
        response = self.session.get(f"{BASE_URL}/api/businesses/me/private-info")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        
        # Verify required fields exist
        assert "name" in data, "Missing 'name' field"
        assert "email" in data, "Missing 'email' field"
        assert "phone" in data, "Missing 'phone' field"
        assert "description" in data, "Missing 'description' field"
        assert "rfc" in data, "Missing 'rfc' field"
        assert "legal_name" in data, "Missing 'legal_name' field"
        assert "clabe" in data, "Missing 'clabe' field"
        assert "subscription_status" in data, "Missing 'subscription_status' field"
        
        # Verify data values
        assert data["email"] == BUSINESS_EMAIL, f"Email mismatch: {data['email']}"
        assert data["name"] == "Test Real Stripe", f"Name mismatch: {data['name']}"
        
        print(f"SUCCESS: Private info returned correctly")
        print(f"  - Name: {data['name']}")
        print(f"  - Email: {data['email']}")
        print(f"  - RFC: {data['rfc']}")
        print(f"  - CLABE: {data['clabe']}")
        print(f"  - Subscription: {data['subscription_status']}")
    
    def test_get_dashboard(self):
        """Test GET /api/businesses/me/dashboard returns business data"""
        response = self.session.get(f"{BASE_URL}/api/businesses/me/dashboard")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "business" in data, "Missing 'business' field"
        assert "stats" in data, "Missing 'stats' field"
        assert "subscription" in data, "Missing 'subscription' field"
        
        business = data["business"]
        assert business["name"] == "Test Real Stripe"
        assert business["latitude"] is not None, "Missing latitude"
        assert business["longitude"] is not None, "Missing longitude"
        
        print(f"SUCCESS: Dashboard data returned correctly")
        print(f"  - Business: {business['name']}")
        print(f"  - Location: {business.get('latitude')}, {business.get('longitude')}")
    
    def test_get_blacklist(self):
        """Test GET /api/businesses/me/blacklist returns list"""
        response = self.session.get(f"{BASE_URL}/api/businesses/me/blacklist")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Blacklist should be a list"
        print(f"SUCCESS: Blacklist returned {len(data)} entries")
    
    def test_update_business_info(self):
        """Test PUT /api/businesses/me updates business info"""
        # Get current description
        response = self.session.get(f"{BASE_URL}/api/businesses/me/private-info")
        original_desc = response.json().get("description", "")
        
        # Update description
        new_desc = "Test description updated by pytest"
        response = self.session.put(f"{BASE_URL}/api/businesses/me", json={
            "description": new_desc
        })
        assert response.status_code == 200, f"Update failed: {response.text}"
        
        # Verify update
        response = self.session.get(f"{BASE_URL}/api/businesses/me/private-info")
        assert response.json()["description"] == new_desc
        
        # Restore original
        self.session.put(f"{BASE_URL}/api/businesses/me", json={
            "description": original_desc
        })
        
        print("SUCCESS: Business info update works correctly")
    
    def test_private_info_requires_owner(self):
        """Test that managers cannot access private info"""
        # This test verifies the endpoint returns 403 for managers
        # We'll test with a manager login if available
        # For now, just verify the endpoint exists and requires auth
        
        # Test without auth
        session = requests.Session()
        response = session.get(f"{BASE_URL}/api/businesses/me/private-info")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("SUCCESS: Private info requires authentication")


class TestBlacklistAPI:
    """Test Blacklist/Vetos API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as business owner"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        response = self.session.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": BUSINESS_EMAIL,
            "password": BUSINESS_PASSWORD
        })
        assert response.status_code == 200
        self.token = response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_add_and_remove_blacklist_entry(self):
        """Test adding and removing a blacklist entry"""
        test_email = "test_blacklist_pytest@example.com"
        
        # Add to blacklist
        response = self.session.post(f"{BASE_URL}/api/businesses/me/blacklist", json={
            "email": test_email,
            "reason": "Test entry from pytest"
        })
        assert response.status_code == 200, f"Add failed: {response.text}"
        
        entry = response.json()
        assert entry["email"] == test_email.lower()
        entry_id = entry["id"]
        print(f"SUCCESS: Added blacklist entry {entry_id}")
        
        # Verify in list
        response = self.session.get(f"{BASE_URL}/api/businesses/me/blacklist")
        entries = response.json()
        found = any(e["id"] == entry_id for e in entries)
        assert found, "Entry not found in blacklist"
        
        # Remove from blacklist
        response = self.session.delete(f"{BASE_URL}/api/businesses/me/blacklist/{entry_id}")
        assert response.status_code == 200, f"Remove failed: {response.text}"
        print(f"SUCCESS: Removed blacklist entry {entry_id}")
        
        # Verify removed
        response = self.session.get(f"{BASE_URL}/api/businesses/me/blacklist")
        entries = response.json()
        found = any(e["id"] == entry_id for e in entries)
        assert not found, "Entry still in blacklist after removal"
        print("SUCCESS: Blacklist add/remove cycle complete")
    
    def test_blacklist_requires_identifier(self):
        """Test that blacklist requires at least one identifier"""
        response = self.session.post(f"{BASE_URL}/api/businesses/me/blacklist", json={
            "reason": "No identifier provided"
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("SUCCESS: Blacklist validation works - requires identifier")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
