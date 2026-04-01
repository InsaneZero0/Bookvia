"""
Test Smart Dropdowns Feature for Hero Section
- City dropdown with search bar showing only cities with businesses
- Service dropdown filtered by selected city
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCitiesWithBusinesses:
    """Test GET /api/cities?with_businesses=true endpoint"""
    
    def test_cities_with_businesses_returns_only_cities_with_businesses(self):
        """Cities with with_businesses=true should only return cities that have approved businesses"""
        response = requests.get(f"{BASE_URL}/api/cities?country_code=MX&with_businesses=true")
        assert response.status_code == 200
        
        cities = response.json()
        assert isinstance(cities, list)
        assert len(cities) > 0, "Should have at least one city with businesses"
        
        # Each city should have business_count > 0
        for city in cities:
            assert "name" in city
            assert "business_count" in city
            assert city["business_count"] > 0, f"City {city['name']} should have business_count > 0"
    
    def test_cities_with_businesses_sorted_by_count(self):
        """Cities should be sorted by business_count descending"""
        response = requests.get(f"{BASE_URL}/api/cities?country_code=MX&with_businesses=true")
        assert response.status_code == 200
        
        cities = response.json()
        if len(cities) > 1:
            counts = [c["business_count"] for c in cities]
            assert counts == sorted(counts, reverse=True), "Cities should be sorted by business_count descending"
    
    def test_cities_with_businesses_has_cdmx(self):
        """CDMX should be in the list with 3 businesses"""
        response = requests.get(f"{BASE_URL}/api/cities?country_code=MX&with_businesses=true")
        assert response.status_code == 200
        
        cities = response.json()
        cdmx = next((c for c in cities if c["name"] == "CDMX"), None)
        assert cdmx is not None, "CDMX should be in the list"
        assert cdmx["business_count"] == 3, "CDMX should have 3 businesses"
    
    def test_cities_without_with_businesses_returns_all_seeded(self):
        """Without with_businesses param, should return all seeded cities"""
        response = requests.get(f"{BASE_URL}/api/cities?country_code=MX")
        assert response.status_code == 200
        
        cities = response.json()
        assert len(cities) >= 3, "Should have at least 3 cities for MX (seeded)"
    
    def test_cities_with_businesses_search_filter(self):
        """Search filter should work with with_businesses"""
        response = requests.get(f"{BASE_URL}/api/cities?country_code=MX&with_businesses=true&q=CDM")
        assert response.status_code == 200
        
        cities = response.json()
        # Should find CDMX
        assert any(c["name"] == "CDMX" for c in cities), "Should find CDMX when searching 'CDM'"


class TestCategoriesFiltering:
    """Test GET /api/categories with city filtering"""
    
    def test_categories_without_city_returns_all(self):
        """Without city filter, should return all categories"""
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200
        
        categories = response.json()
        assert len(categories) >= 8, "Should have at least 8 categories"
    
    def test_categories_with_city_returns_only_matching(self):
        """With city filter, should return only categories with businesses in that city"""
        response = requests.get(f"{BASE_URL}/api/categories?city=CDMX&country_code=MX")
        assert response.status_code == 200
        
        categories = response.json()
        # Should only return categories with business_count > 0
        for cat in categories:
            assert cat["business_count"] > 0, f"Category {cat['name_es']} should have business_count > 0"
    
    def test_categories_cdmx_has_belleza(self):
        """CDMX should have 'Belleza y Estética' category"""
        response = requests.get(f"{BASE_URL}/api/categories?city=CDMX&country_code=MX")
        assert response.status_code == 200
        
        categories = response.json()
        belleza = next((c for c in categories if c["name_es"] == "Belleza y Estética"), None)
        assert belleza is not None, "CDMX should have 'Belleza y Estética' category"
        assert belleza["business_count"] > 0
    
    def test_categories_nonexistent_city_returns_empty(self):
        """Non-existent city should return empty list"""
        response = requests.get(f"{BASE_URL}/api/categories?city=NonExistentCity123&country_code=MX")
        assert response.status_code == 200
        
        categories = response.json()
        assert len(categories) == 0, "Non-existent city should return empty categories"
    
    def test_categories_include_business_count(self):
        """Categories should include business_count field"""
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200
        
        categories = response.json()
        for cat in categories:
            assert "business_count" in cat, f"Category {cat['name_es']} should have business_count field"
            assert isinstance(cat["business_count"], int)


class TestSearchNavigation:
    """Test search page navigation with query params"""
    
    def test_search_with_city_param(self):
        """Search endpoint should accept city parameter"""
        response = requests.get(f"{BASE_URL}/api/businesses?city=CDMX&country_code=MX")
        assert response.status_code == 200
        
        businesses = response.json()
        # All returned businesses should be in CDMX
        for biz in businesses:
            assert biz.get("city", "").upper() == "CDMX", f"Business {biz['name']} should be in CDMX"
    
    def test_search_with_query_param(self):
        """Search endpoint should accept query parameter"""
        response = requests.get(f"{BASE_URL}/api/businesses?query=Belleza")
        assert response.status_code == 200
        
        # Should return businesses matching the query
        assert isinstance(response.json(), list)


class TestIntegration:
    """Integration tests for the full smart dropdown flow"""
    
    def test_full_flow_city_to_categories(self):
        """Test the full flow: get cities with businesses, then get categories for selected city"""
        # Step 1: Get cities with businesses
        cities_response = requests.get(f"{BASE_URL}/api/cities?country_code=MX&with_businesses=true")
        assert cities_response.status_code == 200
        cities = cities_response.json()
        assert len(cities) > 0
        
        # Step 2: Select first city (should be CDMX with most businesses)
        selected_city = cities[0]["name"]
        
        # Step 3: Get categories for that city
        categories_response = requests.get(f"{BASE_URL}/api/categories?city={selected_city}&country_code=MX")
        assert categories_response.status_code == 200
        categories = categories_response.json()
        
        # Should have at least one category
        assert len(categories) > 0, f"City {selected_city} should have at least one category"
        
        # All categories should have business_count > 0
        for cat in categories:
            assert cat["business_count"] > 0
    
    def test_all_cities_option_returns_all_categories(self):
        """When no city is selected (all cities), should return all categories"""
        # Without city filter
        response = requests.get(f"{BASE_URL}/api/categories?country_code=MX")
        assert response.status_code == 200
        
        categories = response.json()
        # Should return all categories (including those with 0 businesses)
        assert len(categories) >= 8


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
