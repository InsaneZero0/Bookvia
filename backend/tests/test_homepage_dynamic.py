"""
Test Homepage Dynamic Content - Cities and Featured Businesses by Country
Tests the dynamic filtering of homepage content based on selected country.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCitiesEndpoint:
    """Test GET /api/cities endpoint with country_code filter"""
    
    def test_cities_mx_returns_mexican_cities(self):
        """MX country code should return 10 Mexican cities"""
        response = requests.get(f"{BASE_URL}/api/cities?country_code=MX")
        assert response.status_code == 200
        
        cities = response.json()
        assert isinstance(cities, list)
        assert len(cities) == 10, f"Expected 10 Mexican cities, got {len(cities)}"
        
        # Verify all cities have MX country code
        for city in cities:
            assert city.get("country_code") == "MX", f"City {city.get('name')} has wrong country_code"
            assert "name" in city
            assert "slug" in city
    
    def test_cities_us_returns_empty(self):
        """US country code should return empty list (no US cities seeded)"""
        response = requests.get(f"{BASE_URL}/api/cities?country_code=US")
        assert response.status_code == 200
        
        cities = response.json()
        assert isinstance(cities, list)
        assert len(cities) == 0, f"Expected 0 US cities, got {len(cities)}"
    
    def test_cities_default_is_mx(self):
        """Default country code should be MX"""
        response = requests.get(f"{BASE_URL}/api/cities")
        assert response.status_code == 200
        
        cities = response.json()
        assert len(cities) == 10, "Default should return Mexican cities"
    
    def test_cities_case_insensitive(self):
        """Country code should be case insensitive"""
        response_upper = requests.get(f"{BASE_URL}/api/cities?country_code=MX")
        response_lower = requests.get(f"{BASE_URL}/api/cities?country_code=mx")
        
        assert response_upper.status_code == 200
        assert response_lower.status_code == 200
        
        cities_upper = response_upper.json()
        cities_lower = response_lower.json()
        
        assert len(cities_upper) == len(cities_lower)


class TestFeaturedBusinessesEndpoint:
    """Test GET /api/businesses/featured endpoint with country_code filter"""
    
    def test_featured_mx_returns_mexican_businesses(self):
        """MX country code should return Mexican businesses"""
        response = requests.get(f"{BASE_URL}/api/businesses/featured?country_code=MX")
        assert response.status_code == 200
        
        businesses = response.json()
        assert isinstance(businesses, list)
        assert len(businesses) > 0, "Expected at least 1 Mexican business"
        
        # Verify all businesses have MX country code
        for biz in businesses:
            assert biz.get("country_code") == "MX", f"Business {biz.get('name')} has wrong country_code"
    
    def test_featured_us_returns_empty(self):
        """US country code should return empty list (no US businesses)"""
        response = requests.get(f"{BASE_URL}/api/businesses/featured?country_code=US")
        assert response.status_code == 200
        
        businesses = response.json()
        assert isinstance(businesses, list)
        assert len(businesses) == 0, f"Expected 0 US businesses, got {len(businesses)}"
    
    def test_featured_limit_parameter(self):
        """Limit parameter should work correctly"""
        response = requests.get(f"{BASE_URL}/api/businesses/featured?country_code=MX&limit=3")
        assert response.status_code == 200
        
        businesses = response.json()
        assert len(businesses) <= 3
    
    def test_featured_case_insensitive(self):
        """Country code should be case insensitive"""
        response_upper = requests.get(f"{BASE_URL}/api/businesses/featured?country_code=MX")
        response_lower = requests.get(f"{BASE_URL}/api/businesses/featured?country_code=mx")
        
        assert response_upper.status_code == 200
        assert response_lower.status_code == 200
        
        biz_upper = response_upper.json()
        biz_lower = response_lower.json()
        
        assert len(biz_upper) == len(biz_lower)


class TestBusinessSearchEndpoint:
    """Test GET /api/businesses endpoint with country_code filter"""
    
    def test_search_mx_returns_mexican_businesses(self):
        """MX country code should filter to Mexican businesses only"""
        response = requests.get(f"{BASE_URL}/api/businesses?country_code=MX")
        assert response.status_code == 200
        
        businesses = response.json()
        assert isinstance(businesses, list)
        
        for biz in businesses:
            assert biz.get("country_code") == "MX"
    
    def test_search_us_returns_empty(self):
        """US country code should return empty (no approved US businesses)"""
        response = requests.get(f"{BASE_URL}/api/businesses?country_code=US")
        assert response.status_code == 200
        
        businesses = response.json()
        assert len(businesses) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
