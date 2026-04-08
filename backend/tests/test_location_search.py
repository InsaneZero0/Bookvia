"""
Test Location Search Feature in Business Registration
Tests:
1. POST /api/auth/business/register accepts latitude and longitude
2. BusinessCreate schema has latitude/longitude as Optional[float]
3. Nominatim API integration (external API - just verify frontend can call it)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def test_category_id(api_client):
    """Get a valid category ID for testing"""
    response = api_client.get(f"{BASE_URL}/api/categories")
    assert response.status_code == 200
    categories = response.json()
    if categories:
        return categories[0]["id"]
    pytest.skip("No categories available for testing")


class TestBusinessRegistrationWithLocation:
    """Test business registration with latitude/longitude fields"""
    
    def test_business_register_with_lat_lng(self, api_client, test_category_id):
        """Test that business registration accepts latitude and longitude"""
        unique_id = str(uuid.uuid4())[:8]
        
        register_data = {
            "name": f"TEST_Location_Business_{unique_id}",
            "email": f"test_location_{unique_id}@example.com",
            "password": "Test1234!",
            "phone": "+525512345678",
            "description": "Test business with location coordinates",
            "category_id": test_category_id,
            "address": "Paseo de la Reforma 222",
            "city": "Ciudad de México",
            "state": "Ciudad de México",
            "country": "MX",
            "zip_code": "06600",
            "latitude": 19.4326,  # Mexico City coordinates
            "longitude": -99.1332,
            "rfc": "XAXX010101000",
            "legal_name": f"Test Location Business {unique_id} SA de CV",
            "clabe": "012345678901234567",
            "requires_deposit": False,
            "cancellation_days": 1
        }
        
        response = api_client.post(f"{BASE_URL}/api/auth/business/register", json=register_data)
        
        # Should succeed (201 or 200)
        assert response.status_code in [200, 201], f"Registration failed: {response.text}"
        
        data = response.json()
        assert "business_id" in data or "message" in data
        print(f"✓ Business registration with lat/lng succeeded: {data}")
        
        # Cleanup - delete the test business
        if "business_id" in data:
            business_id = data["business_id"]
            # Note: No direct delete endpoint, but business is in pending status
            print(f"✓ Test business created with ID: {business_id}")
    
    def test_business_register_without_lat_lng(self, api_client, test_category_id):
        """Test that business registration works without latitude/longitude (optional fields)"""
        unique_id = str(uuid.uuid4())[:8]
        
        register_data = {
            "name": f"TEST_NoLocation_Business_{unique_id}",
            "email": f"test_nolocation_{unique_id}@example.com",
            "password": "Test1234!",
            "phone": "+525512345678",
            "description": "Test business without location coordinates",
            "category_id": test_category_id,
            "address": "Calle Test 123",
            "city": "Guadalajara",
            "state": "Jalisco",
            "country": "MX",
            "zip_code": "44100",
            # No latitude/longitude - should still work
            "rfc": "XAXX010101001",
            "legal_name": f"Test NoLocation Business {unique_id} SA de CV",
            "clabe": "012345678901234568",
            "requires_deposit": False,
            "cancellation_days": 1
        }
        
        response = api_client.post(f"{BASE_URL}/api/auth/business/register", json=register_data)
        
        # Should succeed even without lat/lng
        assert response.status_code in [200, 201], f"Registration without lat/lng failed: {response.text}"
        
        data = response.json()
        assert "business_id" in data or "message" in data
        print(f"✓ Business registration without lat/lng succeeded: {data}")
    
    def test_business_register_with_null_lat_lng(self, api_client, test_category_id):
        """Test that business registration accepts null latitude/longitude"""
        unique_id = str(uuid.uuid4())[:8]
        
        register_data = {
            "name": f"TEST_NullLocation_Business_{unique_id}",
            "email": f"test_nulllocation_{unique_id}@example.com",
            "password": "Test1234!",
            "phone": "+525512345678",
            "description": "Test business with null location coordinates",
            "category_id": test_category_id,
            "address": "Calle Null 456",
            "city": "Monterrey",
            "state": "Nuevo León",
            "country": "MX",
            "zip_code": "64000",
            "latitude": None,  # Explicitly null
            "longitude": None,
            "rfc": "XAXX010101002",
            "legal_name": f"Test NullLocation Business {unique_id} SA de CV",
            "clabe": "012345678901234569",
            "requires_deposit": False,
            "cancellation_days": 1
        }
        
        response = api_client.post(f"{BASE_URL}/api/auth/business/register", json=register_data)
        
        # Should succeed with null lat/lng
        assert response.status_code in [200, 201], f"Registration with null lat/lng failed: {response.text}"
        
        data = response.json()
        assert "business_id" in data or "message" in data
        print(f"✓ Business registration with null lat/lng succeeded: {data}")


class TestNominatimAPI:
    """Test Nominatim API availability (external service)"""
    
    def test_nominatim_search_available(self, api_client):
        """Test that Nominatim API is accessible"""
        # This tests the external API that the frontend uses
        response = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "format": "json",
                "q": "Reforma 222 Ciudad de Mexico",
                "limit": 5,
                "countrycodes": "mx",
                "addressdetails": 1
            },
            headers={"Accept-Language": "es", "User-Agent": "BookviaTest/1.0"}
        )
        
        assert response.status_code == 200, f"Nominatim API not available: {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Nominatim should return a list"
        
        if len(data) > 0:
            result = data[0]
            assert "lat" in result, "Result should have lat"
            assert "lon" in result, "Result should have lon"
            assert "display_name" in result, "Result should have display_name"
            print(f"✓ Nominatim API returned {len(data)} results")
            print(f"  First result: {result.get('display_name', '')[:80]}...")
        else:
            print("⚠ Nominatim returned no results (may be rate limited)")


class TestBusinessSchemaValidation:
    """Test that BusinessCreate schema properly validates lat/lng"""
    
    def test_invalid_latitude_type(self, api_client, test_category_id):
        """Test that invalid latitude type is rejected"""
        unique_id = str(uuid.uuid4())[:8]
        
        register_data = {
            "name": f"TEST_InvalidLat_Business_{unique_id}",
            "email": f"test_invalidlat_{unique_id}@example.com",
            "password": "Test1234!",
            "phone": "+525512345678",
            "description": "Test business with invalid latitude",
            "category_id": test_category_id,
            "address": "Calle Invalid 789",
            "city": "Puebla",
            "state": "Puebla",
            "country": "MX",
            "zip_code": "72000",
            "latitude": "not_a_number",  # Invalid type
            "longitude": -99.1332,
            "rfc": "XAXX010101003",
            "legal_name": f"Test InvalidLat Business {unique_id} SA de CV",
            "clabe": "012345678901234570",
            "requires_deposit": False,
            "cancellation_days": 1
        }
        
        response = api_client.post(f"{BASE_URL}/api/auth/business/register", json=register_data)
        
        # Should fail validation
        assert response.status_code == 422, f"Expected 422 for invalid latitude type, got {response.status_code}"
        print("✓ Invalid latitude type correctly rejected with 422")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
