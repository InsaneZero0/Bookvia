"""
Tests for CitySelector showDemand feature and SearchPage empty state improvements
- CitySelector: showDemand prop triggers fetch to /api/cities?with_businesses=true
- CitySelector: Cities with businesses show green badge with count
- CitySelector: Cities are sorted by demand (most businesses first) when showDemand=true
- SearchPage: Dynamic empty state messages based on city/query filters
- SearchPage: 'Limpiar filtros' button and CTA to register business
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCitiesWithBusinessesAPI:
    """Test /api/cities?with_businesses=true endpoint for CitySelector showDemand"""
    
    def test_cities_with_businesses_returns_only_cities_with_businesses(self):
        """GET /api/cities?country_code=MX&with_businesses=true returns only cities with businesses"""
        response = requests.get(f"{BASE_URL}/api/cities?country_code=MX&with_businesses=true")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # All returned cities should have business_count > 0
        for city in data:
            assert 'business_count' in city
            assert city['business_count'] > 0
            assert 'name' in city
            assert 'slug' in city
        
        print(f"PASSED: Cities with businesses endpoint returns {len(data)} cities with businesses")
    
    def test_cities_with_businesses_sorted_by_demand(self):
        """Cities should be sorted by business_count descending (most businesses first)"""
        response = requests.get(f"{BASE_URL}/api/cities?country_code=MX&with_businesses=true")
        assert response.status_code == 200
        
        data = response.json()
        if len(data) > 1:
            # Check that cities are sorted by business_count descending
            for i in range(len(data) - 1):
                assert data[i]['business_count'] >= data[i+1]['business_count'], \
                    f"Cities not sorted by demand: {data[i]['name']} ({data[i]['business_count']}) should be >= {data[i+1]['name']} ({data[i+1]['business_count']})"
        
        print(f"PASSED: Cities sorted by demand (business_count descending)")
    
    def test_cities_with_businesses_includes_cdmx(self):
        """CDMX should be in the list with 3 businesses"""
        response = requests.get(f"{BASE_URL}/api/cities?country_code=MX&with_businesses=true")
        assert response.status_code == 200
        
        data = response.json()
        cdmx = next((c for c in data if c['name'] == 'CDMX'), None)
        
        assert cdmx is not None, "CDMX should be in cities with businesses"
        assert cdmx['business_count'] >= 3, f"CDMX should have at least 3 businesses, got {cdmx['business_count']}"
        
        print(f"PASSED: CDMX found with {cdmx['business_count']} businesses")
    
    def test_regular_cities_endpoint_returns_all_cities(self):
        """GET /api/cities?country_code=MX (without with_businesses) returns all seeded cities"""
        response = requests.get(f"{BASE_URL}/api/cities?country_code=MX")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 3, "Should return more cities than just those with businesses"
        
        # Check that cities include state field (for auto-fill feature)
        for city in data:
            assert 'name' in city
            # state field should be present for auto-fill functionality
            if 'state' in city:
                print(f"  City {city['name']} has state: {city.get('state', 'N/A')}")
        
        print(f"PASSED: Regular cities endpoint returns {len(data)} cities")
    
    def test_cities_include_state_for_autofill(self):
        """Cities should include state field for auto-fill functionality in CitySelector"""
        response = requests.get(f"{BASE_URL}/api/cities?country_code=MX")
        assert response.status_code == 200
        
        data = response.json()
        cities_with_state = [c for c in data if c.get('state')]
        
        # At least some cities should have state field
        assert len(cities_with_state) > 0, "Some cities should have state field for auto-fill"
        
        print(f"PASSED: {len(cities_with_state)} cities have state field for auto-fill")


class TestSearchPageEmptyState:
    """Test search endpoint for empty state scenarios"""
    
    def test_search_with_city_and_query_no_results(self):
        """Search with city=Monterrey&query=Fitness should return empty array"""
        response = requests.get(f"{BASE_URL}/api/businesses?city=Monterrey&query=Fitness")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0, "Should return empty array for Monterrey + Fitness"
        
        print("PASSED: Search with city=Monterrey&query=Fitness returns empty array")
    
    def test_search_with_only_city_no_results(self):
        """Search with only city filter (no businesses in that city) returns empty"""
        response = requests.get(f"{BASE_URL}/api/businesses?city=Monterrey")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0, "Should return empty array for Monterrey (no businesses)"
        
        print("PASSED: Search with city=Monterrey returns empty array")
    
    def test_search_with_only_query_no_results(self):
        """Search with only query filter (no matching businesses) returns empty"""
        response = requests.get(f"{BASE_URL}/api/businesses?query=NonExistentService12345")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0, "Should return empty array for non-existent query"
        
        print("PASSED: Search with non-existent query returns empty array")
    
    def test_search_with_city_that_has_businesses(self):
        """Search with city=CDMX should return businesses"""
        response = requests.get(f"{BASE_URL}/api/businesses?city=CDMX")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "CDMX should have businesses"
        
        print(f"PASSED: Search with city=CDMX returns {len(data)} businesses")
    
    def test_search_without_filters_returns_all(self):
        """Search without filters returns all businesses"""
        response = requests.get(f"{BASE_URL}/api/businesses")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "Should return all businesses"
        
        print(f"PASSED: Search without filters returns {len(data)} businesses")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
