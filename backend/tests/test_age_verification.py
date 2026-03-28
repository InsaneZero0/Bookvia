"""
Test Age Verification and Country Fields in Registration APIs
Tests for:
- POST /api/auth/register accepts birth_date and country fields
- POST /api/auth/business/register accepts owner_birth_date field
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestUserRegistrationWithAgeAndCountry:
    """Test user registration with birth_date and country fields"""
    
    def test_register_user_with_birth_date_and_country(self):
        """Test that user registration accepts birth_date and country fields"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "email": f"test_age_{unique_id}@bookvia.com",
            "password": "Test1234!",
            "full_name": "Test Age User",
            "phone": "+525512345678",
            "country": "MX",
            "birth_date": "2000-06-15",  # 25 years old
            "gender": "male",
            "preferred_language": "es"
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        
        # Should succeed
        assert response.status_code == 200, f"Registration failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "No token in response"
        assert "user" in data, "No user in response"
        
        # Verify birth_date is stored
        user = data["user"]
        assert user.get("birth_date") == "2000-06-15", f"birth_date not stored correctly: {user.get('birth_date')}"
        
        print(f"✓ User registration with birth_date and country successful")
        print(f"  Email: {payload['email']}")
        print(f"  Birth date: {user.get('birth_date')}")
    
    def test_register_user_with_different_country(self):
        """Test user registration with Colombia country"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "email": f"test_co_{unique_id}@bookvia.com",
            "password": "Test1234!",
            "full_name": "Test Colombia User",
            "phone": "+573124567890",
            "country": "CO",
            "birth_date": "1995-03-20",
            "preferred_language": "es"
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        
        data = response.json()
        user = data["user"]
        
        # Note: country may not be returned in UserResponse, but should be stored
        print(f"✓ User registration with Colombia country successful")
        print(f"  Email: {payload['email']}")
        print(f"  Country: CO")
    
    def test_register_user_without_birth_date(self):
        """Test that birth_date is optional"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "email": f"test_noage_{unique_id}@bookvia.com",
            "password": "Test1234!",
            "full_name": "Test No Age User",
            "phone": "+525512345678",
            "preferred_language": "es"
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        
        # Should succeed even without birth_date
        assert response.status_code == 200, f"Registration failed: {response.text}"
        
        print(f"✓ User registration without birth_date successful (optional field)")


class TestBusinessRegistrationWithOwnerBirthDate:
    """Test business registration with owner_birth_date field"""
    
    def test_register_business_with_owner_birth_date(self):
        """Test that business registration accepts owner_birth_date field"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "name": f"Test Business {unique_id}",
            "email": f"test_biz_{unique_id}@bookvia.com",
            "password": "Test1234!",
            "phone": "+525512345678",
            "description": "Test business for age verification",
            "category_id": "cat-spa",  # May need to use actual category ID
            "address": "Test Address 123",
            "city": "Ciudad de México",
            "state": "CDMX",
            "country": "MX",
            "zip_code": "01234",
            "rfc": "XAXX010101000",
            "legal_name": f"Test Legal {unique_id}",
            "clabe": "012345678901234567",
            "owner_birth_date": "1990-05-10",  # 35 years old
            "requires_deposit": False
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/business/register", json=payload)
        
        # Should succeed
        assert response.status_code == 200, f"Business registration failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "No token in response"
        assert "business" in data, "No business in response"
        
        print(f"✓ Business registration with owner_birth_date successful")
        print(f"  Business name: {payload['name']}")
        print(f"  Owner birth date: {payload['owner_birth_date']}")
    
    def test_register_business_with_different_country(self):
        """Test business registration with Colombia country"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "name": f"Test Biz CO {unique_id}",
            "email": f"test_bizco_{unique_id}@bookvia.com",
            "password": "Test1234!",
            "phone": "+573124567890",
            "description": "Test business in Colombia",
            "category_id": "cat-spa",
            "address": "Calle 123",
            "city": "Bogotá",
            "state": "Cundinamarca",
            "country": "CO",
            "zip_code": "110111",
            "rfc": "XAXX010101000",
            "legal_name": f"Test Legal CO {unique_id}",
            "clabe": "012345678901234567",
            "owner_birth_date": "1985-08-25",
            "requires_deposit": False
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/business/register", json=payload)
        
        assert response.status_code == 200, f"Business registration failed: {response.text}"
        
        data = response.json()
        business = data["business"]
        
        # Verify country is stored
        assert business.get("country") == "CO", f"Country not stored correctly: {business.get('country')}"
        
        print(f"✓ Business registration with Colombia country successful")
        print(f"  Country: {business.get('country')}")
        print(f"  Country code: {business.get('country_code')}")


class TestHealthCheck:
    """Basic health check"""
    
    def test_api_health(self):
        """Test API is healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        
        data = response.json()
        assert data.get("status") in ["healthy", "degraded"], f"Unexpected status: {data.get('status')}"
        
        print(f"✓ API health check passed: {data.get('status')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
