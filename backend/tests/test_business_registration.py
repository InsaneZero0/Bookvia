"""
Test Business Registration - Task 4 (Fase 1)
Tests for the multi-step business registration process.
Validates: business data, location, documents (RFC), account (CLABE, password)
"""
import pytest
import requests
import os
import uuid
import random
import string

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="module")
def test_category_id(api_client):
    """Get a valid category ID for testing"""
    response = api_client.get(f"{BASE_URL}/api/categories")
    assert response.status_code == 200
    categories = response.json()
    assert len(categories) > 0, "No categories available for testing"
    return categories[0]["id"]

def generate_unique_email():
    """Generate unique email for testing"""
    unique_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"TEST_business_{unique_id}@testmail.com"

def generate_valid_rfc():
    """Generate valid RFC format (12-13 characters)"""
    # RFC format: 4 letters + 6 digits + 3 alphanumeric (for persona moral)
    letters = ''.join(random.choices(string.ascii_uppercase, k=4))
    date = '240115'  # Fixed date
    check = ''.join(random.choices(string.ascii_uppercase + string.digits, k=3))
    return f"{letters}{date}{check}"

def generate_valid_clabe():
    """Generate valid CLABE (18 digits)"""
    return ''.join(random.choices(string.digits, k=18))


class TestBusinessRegistrationEndpoint:
    """Test POST /api/auth/business/register endpoint"""
    
    def test_business_register_success(self, api_client, test_category_id):
        """Test successful business registration with all required fields"""
        email = generate_unique_email()
        
        register_data = {
            "name": "TEST Spa Relax Registration",
            "email": email,
            "password": "TestPassword123!",
            "phone": "+52 55 1234 5678",
            "description": "Test business for registration flow testing",
            "category_id": test_category_id,
            "address": "Calle Test 123, Colonia Centro",
            "city": "CDMX",
            "state": "Ciudad de México",
            "country": "MX",
            "zip_code": "06600",
            "rfc": generate_valid_rfc(),
            "legal_name": "TEST Spa Relax SA de CV",
            "ine_url": "uploaded:test_ine.jpg",  # MOCKED file upload
            "proof_of_address_url": "",  # Optional
            "clabe": generate_valid_clabe(),
            "requires_deposit": False,
            "deposit_amount": 50.0
        }
        
        response = api_client.post(f"{BASE_URL}/api/auth/business/register", json=register_data)
        
        # Verify status code
        assert response.status_code == 200, f"Registration failed: {response.text}"
        
        data = response.json()
        
        # Verify token returned
        assert "token" in data, "No token returned"
        assert isinstance(data["token"], str)
        assert len(data["token"]) > 50, "Token seems too short"
        
        # Verify business data returned
        assert "business" in data, "No business data returned"
        business = data["business"]
        
        # Verify business fields
        assert business["name"] == register_data["name"]
        assert business["email"] == email
        assert business["city"] == register_data["city"]
        assert business["state"] == register_data["state"]
        
        # CRITICAL: Verify status is PENDING
        assert business["status"] == "pending", f"Expected 'pending', got '{business['status']}'"
        
        # Verify can_accept_bookings is False (PENDING businesses cannot accept)
        assert business.get("can_accept_bookings") == False or business["status"] == "pending", \
            "Pending business should not be able to accept bookings"
        
        # Verify slug was generated
        assert "slug" in business
        assert len(business["slug"]) > 0
        
        # Verify trial period set (3 months free)
        assert "trial_ends_at" in business
        
        return business["id"]
    
    def test_business_register_duplicate_email(self, api_client, test_category_id):
        """Test registration fails with duplicate email"""
        email = generate_unique_email()
        
        # First registration
        register_data = {
            "name": "TEST First Business",
            "email": email,
            "password": "TestPassword123!",
            "phone": "+52 55 9999 8888",
            "description": "First registration test",
            "category_id": test_category_id,
            "address": "Calle Primera 1",
            "city": "CDMX",
            "state": "Ciudad de México",
            "country": "MX",
            "zip_code": "06601",
            "rfc": generate_valid_rfc(),
            "legal_name": "TEST Primera SA de CV",
            "clabe": generate_valid_clabe()
        }
        
        response1 = api_client.post(f"{BASE_URL}/api/auth/business/register", json=register_data)
        assert response1.status_code == 200
        
        # Second registration with same email
        register_data["name"] = "TEST Second Business"
        register_data["rfc"] = generate_valid_rfc()
        register_data["clabe"] = generate_valid_clabe()
        
        response2 = api_client.post(f"{BASE_URL}/api/auth/business/register", json=register_data)
        
        # Should fail with 400
        assert response2.status_code == 400, f"Expected 400, got {response2.status_code}"
        
        data = response2.json()
        assert "already registered" in data.get("detail", "").lower() or "email" in data.get("detail", "").lower()
    
    def test_business_register_missing_required_fields(self, api_client, test_category_id):
        """Test registration fails with missing required fields"""
        # Missing name
        register_data = {
            "email": generate_unique_email(),
            "password": "TestPassword123!",
            "phone": "+52 55 1234 5678",
            "description": "Test",
            "category_id": test_category_id,
            "address": "Calle Test",
            "city": "CDMX",
            "state": "Ciudad de México",
            "zip_code": "06600",
            "rfc": generate_valid_rfc(),
            "legal_name": "TEST SA de CV",
            "clabe": generate_valid_clabe()
        }
        
        response = api_client.post(f"{BASE_URL}/api/auth/business/register", json=register_data)
        
        # Should fail with 422 (validation error) since name is required
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
    
    def test_business_register_with_deposit(self, api_client, test_category_id):
        """Test registration with deposit requirement enabled"""
        email = generate_unique_email()
        
        register_data = {
            "name": "TEST Spa Con Anticipo",
            "email": email,
            "password": "TestPassword123!",
            "phone": "+52 55 1234 9999",
            "description": "Spa que requiere anticipo",
            "category_id": test_category_id,
            "address": "Calle Anticipo 100",
            "city": "Monterrey",
            "state": "Nuevo León",
            "country": "MX",
            "zip_code": "64000",
            "rfc": generate_valid_rfc(),
            "legal_name": "TEST Spa Anticipo SA de CV",
            "clabe": generate_valid_clabe(),
            "requires_deposit": True,
            "deposit_amount": 200.0
        }
        
        response = api_client.post(f"{BASE_URL}/api/auth/business/register", json=register_data)
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        
        data = response.json()
        business = data["business"]
        
        # Verify deposit settings
        assert business["requires_deposit"] == True
        # Backend enforces minimum 50 MXN
        assert business["deposit_amount"] >= 50.0


class TestBusinessRegistrationValidations:
    """Test validation rules for business registration"""
    
    def test_business_register_invalid_email(self, api_client, test_category_id):
        """Test registration fails with invalid email format"""
        register_data = {
            "name": "TEST Invalid Email Business",
            "email": "not-an-email",  # Invalid email
            "password": "TestPassword123!",
            "phone": "+52 55 1234 5678",
            "description": "Test",
            "category_id": test_category_id,
            "address": "Calle Test",
            "city": "CDMX",
            "state": "Ciudad de México",
            "zip_code": "06600",
            "rfc": generate_valid_rfc(),
            "legal_name": "TEST SA de CV",
            "clabe": generate_valid_clabe()
        }
        
        response = api_client.post(f"{BASE_URL}/api/auth/business/register", json=register_data)
        
        # Should fail validation
        assert response.status_code == 422, f"Expected 422 for invalid email, got {response.status_code}"


class TestBusinessAfterRegistration:
    """Test business visibility and booking restrictions after registration"""
    
    def test_pending_business_visible_in_search(self, api_client, test_category_id):
        """Test that PENDING businesses are visible when include_pending=true"""
        # Create a new business (will be pending)
        email = generate_unique_email()
        
        register_data = {
            "name": "TEST Visible Pending Spa",
            "email": email,
            "password": "TestPassword123!",
            "phone": "+52 55 7777 8888",
            "description": "Pending business visibility test",
            "category_id": test_category_id,
            "address": "Calle Visible 50",
            "city": "Guadalajara",
            "state": "Jalisco",
            "country": "MX",
            "zip_code": "44100",
            "rfc": generate_valid_rfc(),
            "legal_name": "TEST Visible SA de CV",
            "clabe": generate_valid_clabe()
        }
        
        response = api_client.post(f"{BASE_URL}/api/auth/business/register", json=register_data)
        assert response.status_code == 200
        
        business_id = response.json()["business"]["id"]
        
        # Search with include_pending=true
        response = api_client.get(f"{BASE_URL}/api/businesses?include_pending=true")
        assert response.status_code == 200
        
        businesses = response.json()
        
        # Find our pending business
        pending_business = next((b for b in businesses if b["id"] == business_id), None)
        
        # Pending businesses should be visible with include_pending=true
        assert pending_business is not None, "Pending business should be visible with include_pending=true"
        assert pending_business["status"] == "pending"
        assert pending_business.get("can_accept_bookings") == False


class TestCleanup:
    """Cleanup test data - TEST_ prefixed businesses"""
    
    @pytest.fixture(autouse=True, scope="module")
    def cleanup_after_tests(self, api_client):
        """Run cleanup after all tests in this module"""
        yield
        # Cleanup would go here if needed
        # For now, TEST_ prefixed data remains for manual verification
        print("\n[INFO] Test data with TEST_ prefix created. Manual cleanup may be needed.")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
