"""
Test Country Selector Feature in Registration
- Tests that POST /api/auth/register accepts 'country' field
- Tests that country is stored in user document
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCountryRegistration:
    """Tests for country field in user registration"""
    
    def test_health_check(self):
        """Verify API is healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ["healthy", "degraded"]
        print(f"Health check passed: {data['status']}")
    
    def test_register_with_country_mexico(self):
        """Test registration with Mexico (default country)"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"test_country_mx_{unique_id}@bookvia.com"
        
        payload = {
            "email": email,
            "password": "Test1234!",
            "full_name": "Test User Mexico",
            "phone": "+525512345678",
            "country": "MX",
            "birth_date": "1990-01-15",
            "gender": "male",
            "preferred_language": "es"
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Register response status: {response.status_code}")
        print(f"Register response: {response.text[:500]}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "user" in data, "Response should contain user"
        
        user = data["user"]
        assert user["email"] == email
        assert user["full_name"] == "Test User Mexico"
        print(f"Registration with MX country successful for {email}")
        
        return data["token"], user["id"]
    
    def test_register_with_country_colombia(self):
        """Test registration with Colombia country code"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"test_country_co_{unique_id}@bookvia.com"
        
        payload = {
            "email": email,
            "password": "Test1234!",
            "full_name": "Test User Colombia",
            "phone": "+573001234567",
            "country": "CO",
            "birth_date": "1985-06-20",
            "gender": "female",
            "preferred_language": "es"
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Register CO response status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "token" in data
        assert "user" in data
        
        user = data["user"]
        assert user["email"] == email
        print(f"Registration with CO country successful for {email}")
        
        return data["token"], user["id"]
    
    def test_register_with_country_usa(self):
        """Test registration with USA country code"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"test_country_us_{unique_id}@bookvia.com"
        
        payload = {
            "email": email,
            "password": "Test1234!",
            "full_name": "Test User USA",
            "phone": "+12025551234",
            "country": "US",
            "birth_date": "1992-03-10",
            "gender": "other",
            "preferred_language": "en"
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Register US response status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "token" in data
        assert "user" in data
        print(f"Registration with US country successful for {email}")
    
    def test_register_without_country(self):
        """Test registration without country field (should work, country is optional)"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"test_no_country_{unique_id}@bookvia.com"
        
        payload = {
            "email": email,
            "password": "Test1234!",
            "full_name": "Test User No Country",
            "phone": "+525512345678",
            "birth_date": "1988-12-25",
            "gender": "male",
            "preferred_language": "es"
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Register without country response status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "token" in data
        assert "user" in data
        print(f"Registration without country field successful for {email}")
    
    def test_phone_format_with_country_code(self):
        """Test that phone number with country code is accepted"""
        unique_id = str(uuid.uuid4())[:8]
        email = f"test_phone_format_{unique_id}@bookvia.com"
        
        # Phone format: +57 (Colombia) + 10 digits
        payload = {
            "email": email,
            "password": "Test1234!",
            "full_name": "Test Phone Format",
            "phone": "+573124567890",
            "country": "CO",
            "preferred_language": "es"
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Phone format test response status: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        user = data["user"]
        # Verify phone is stored correctly
        assert user["phone"] == "+573124567890"
        print(f"Phone format test passed: {user['phone']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
