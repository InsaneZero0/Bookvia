"""
Test City Selector Feature - Backend API Tests
Tests for the dynamic city selector in user and business registration forms.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCitiesAPI:
    """Tests for GET /api/cities endpoint"""
    
    def test_cities_mx_returns_20_cities(self):
        """GET /api/cities?country_code=MX returns 20 Mexican cities"""
        response = requests.get(f"{BASE_URL}/api/cities?country_code=MX")
        assert response.status_code == 200
        cities = response.json()
        assert len(cities) == 20, f"Expected 20 MX cities, got {len(cities)}"
        # Verify some expected cities
        city_names = [c['name'] for c in cities]
        assert 'Ciudad de México' in city_names
        assert 'Guadalajara' in city_names
        assert 'Monterrey' in city_names
        print(f"✓ MX cities: {len(cities)} cities returned")
    
    def test_cities_co_returns_10_cities(self):
        """GET /api/cities?country_code=CO returns 10 Colombian cities"""
        response = requests.get(f"{BASE_URL}/api/cities?country_code=CO")
        assert response.status_code == 200
        cities = response.json()
        assert len(cities) == 10, f"Expected 10 CO cities, got {len(cities)}"
        city_names = [c['name'] for c in cities]
        assert 'Bogotá' in city_names
        assert 'Medellín' in city_names
        assert 'Cali' in city_names
        print(f"✓ CO cities: {len(cities)} cities returned")
    
    def test_cities_es_returns_8_cities(self):
        """GET /api/cities?country_code=ES returns 8 Spanish cities"""
        response = requests.get(f"{BASE_URL}/api/cities?country_code=ES")
        assert response.status_code == 200
        cities = response.json()
        assert len(cities) == 8, f"Expected 8 ES cities, got {len(cities)}"
        city_names = [c['name'] for c in cities]
        assert 'Madrid' in city_names
        assert 'Barcelona' in city_names
        print(f"✓ ES cities: {len(cities)} cities returned")
    
    def test_cities_us_returns_10_cities(self):
        """GET /api/cities?country_code=US returns 10 US cities"""
        response = requests.get(f"{BASE_URL}/api/cities?country_code=US")
        assert response.status_code == 200
        cities = response.json()
        assert len(cities) == 10, f"Expected 10 US cities, got {len(cities)}"
        city_names = [c['name'] for c in cities]
        assert 'New York' in city_names
        assert 'Los Angeles' in city_names
        print(f"✓ US cities: {len(cities)} cities returned")
    
    def test_cities_case_insensitive(self):
        """Country code is case insensitive"""
        response_upper = requests.get(f"{BASE_URL}/api/cities?country_code=MX")
        response_lower = requests.get(f"{BASE_URL}/api/cities?country_code=mx")
        assert response_upper.status_code == 200
        assert response_lower.status_code == 200
        assert len(response_upper.json()) == len(response_lower.json())
        print("✓ Country code is case insensitive")
    
    def test_cities_structure(self):
        """Cities have required fields: name, slug, country_code, state"""
        response = requests.get(f"{BASE_URL}/api/cities?country_code=MX")
        assert response.status_code == 200
        cities = response.json()
        assert len(cities) > 0
        city = cities[0]
        assert 'name' in city
        assert 'slug' in city
        assert 'country_code' in city
        assert 'state' in city
        print(f"✓ City structure verified: {list(city.keys())}")
    
    def test_cities_default_country_mx(self):
        """Default country is MX when no country_code provided"""
        response = requests.get(f"{BASE_URL}/api/cities")
        assert response.status_code == 200
        cities = response.json()
        # Should return MX cities by default
        if len(cities) > 0:
            assert cities[0]['country_code'] == 'MX'
        print("✓ Default country is MX")


class TestUserRegistrationWithCity:
    """Tests for user registration with city field"""
    
    def test_register_accepts_city_field(self):
        """POST /api/auth/register accepts city field"""
        import uuid
        unique_email = f"test_city_{uuid.uuid4().hex[:8]}@test.com"
        
        payload = {
            "email": unique_email,
            "password": "Test1234!",
            "full_name": "Test City User",
            "phone": "+521234567890",
            "country": "MX",
            "city": "Ciudad de México",
            "birth_date": "1990-01-15",
            "gender": "male",
            "preferred_language": "es"
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        assert 'token' in data
        assert 'user' in data
        print(f"✓ User registration with city field accepted")
    
    def test_register_accepts_custom_city(self):
        """POST /api/auth/register accepts custom city not in list"""
        import uuid
        unique_email = f"test_custom_city_{uuid.uuid4().hex[:8]}@test.com"
        
        payload = {
            "email": unique_email,
            "password": "Test1234!",
            "full_name": "Test Custom City User",
            "phone": "+521234567891",
            "country": "MX",
            "city": "Mi Ciudad Personalizada",  # Custom city not in list
            "birth_date": "1990-01-15",
            "gender": "female",
            "preferred_language": "es"
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        assert 'token' in data
        print(f"✓ User registration with custom city accepted")


class TestSeedIdempotency:
    """Tests for seed endpoint idempotency"""
    
    def test_seed_idempotent(self):
        """Running seed twice doesn't duplicate cities"""
        # Get initial count
        response1 = requests.get(f"{BASE_URL}/api/cities?country_code=MX")
        initial_count = len(response1.json())
        
        # Run seed
        seed_response = requests.post(f"{BASE_URL}/api/seed")
        assert seed_response.status_code == 200
        
        # Get count after seed
        response2 = requests.get(f"{BASE_URL}/api/cities?country_code=MX")
        after_count = len(response2.json())
        
        assert initial_count == after_count, f"Cities duplicated: {initial_count} -> {after_count}"
        print(f"✓ Seed is idempotent: {initial_count} cities before and after")


class TestAllCountryCities:
    """Test cities for all supported countries"""
    
    @pytest.mark.parametrize("country_code,expected_min", [
        ("MX", 20),
        ("US", 10),
        ("CO", 10),
        ("AR", 8),
        ("CL", 6),
        ("PE", 6),
        ("EC", 5),
        ("ES", 8),
        ("GT", 4),
        ("SV", 3),
        ("HN", 3),
        ("CR", 4),
        ("PA", 3),
        ("VE", 5),
        ("BR", 8),
        ("DO", 3),
        ("CU", 2),
        ("PY", 2),
        ("UY", 2),
        ("BO", 3),
        ("NI", 2),
        ("CA", 5),
    ])
    def test_country_cities_count(self, country_code, expected_min):
        """Each country has expected number of cities"""
        response = requests.get(f"{BASE_URL}/api/cities?country_code={country_code}")
        assert response.status_code == 200
        cities = response.json()
        assert len(cities) >= expected_min, f"{country_code}: Expected >= {expected_min} cities, got {len(cities)}"
        print(f"✓ {country_code}: {len(cities)} cities")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
