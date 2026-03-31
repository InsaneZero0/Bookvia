"""
Test country_code filter on business search endpoint
Tests the navbar country selector backend integration
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://marketplace-test-21.preview.emergentagent.com')

class TestCountryCodeFilter:
    """Tests for GET /api/businesses?country_code=XX endpoint"""
    
    def test_businesses_filter_by_mexico(self):
        """Test that country_code=MX returns only Mexican businesses"""
        response = requests.get(f"{BASE_URL}/api/businesses?country_code=MX")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 5, f"Expected 5 MX businesses, got {len(data)}"
        
        # Verify all returned businesses have country_code=MX
        for business in data:
            assert business.get("country_code") == "MX", f"Business {business.get('name')} has country_code {business.get('country_code')}"
    
    def test_businesses_filter_by_japan_empty(self):
        """Test that country_code=JP returns empty list (no businesses in Japan)"""
        response = requests.get(f"{BASE_URL}/api/businesses?country_code=JP")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0, f"Expected 0 JP businesses, got {len(data)}"
    
    def test_businesses_filter_by_colombia_empty(self):
        """Test that country_code=CO returns empty list (businesses exist but are pending)"""
        response = requests.get(f"{BASE_URL}/api/businesses?country_code=CO")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0, f"Expected 0 CO businesses (pending status), got {len(data)}"
    
    def test_businesses_filter_case_insensitive(self):
        """Test that country_code filter is case insensitive"""
        response_upper = requests.get(f"{BASE_URL}/api/businesses?country_code=MX")
        response_lower = requests.get(f"{BASE_URL}/api/businesses?country_code=mx")
        
        assert response_upper.status_code == 200
        assert response_lower.status_code == 200
        
        data_upper = response_upper.json()
        data_lower = response_lower.json()
        
        assert len(data_upper) == len(data_lower), "Case sensitivity issue in country_code filter"
    
    def test_businesses_without_country_filter(self):
        """Test that without country_code filter, all approved businesses are returned"""
        response = requests.get(f"{BASE_URL}/api/businesses")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        # Should return all approved businesses regardless of country
        assert len(data) >= 5, f"Expected at least 5 businesses without filter, got {len(data)}"
    
    def test_business_response_includes_country_code(self):
        """Test that business response includes country_code field"""
        response = requests.get(f"{BASE_URL}/api/businesses?country_code=MX&limit=1")
        assert response.status_code == 200
        
        data = response.json()
        assert len(data) > 0, "No businesses returned"
        
        business = data[0]
        assert "country_code" in business, "country_code field missing from business response"
        assert "country" in business, "country field missing from business response"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
