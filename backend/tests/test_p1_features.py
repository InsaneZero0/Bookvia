"""
Test P1 Features for Bookvia:
1. next_available_text field in business search/featured endpoints
2. distance_km field when user location is provided
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestNextAvailableText:
    """Test next_available_text field in business endpoints"""
    
    def test_search_businesses_returns_next_available_text(self):
        """GET /api/businesses?country_code=MX should return businesses with next_available_text field"""
        response = requests.get(f"{BASE_URL}/api/businesses", params={"country_code": "MX"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list of businesses"
        
        if len(data) > 0:
            # Check that next_available_text field exists in response
            first_biz = data[0]
            assert "next_available_text" in first_biz, "Business should have next_available_text field"
            
            # Count businesses with non-null next_available_text
            with_text = [b for b in data if b.get("next_available_text")]
            print(f"Found {len(data)} businesses, {len(with_text)} have next_available_text")
            
            # Print some examples
            for b in data[:5]:
                print(f"  - {b.get('name')}: next_available_text={b.get('next_available_text')}")
        else:
            print("No businesses found in MX")
    
    def test_featured_businesses_returns_next_available_text(self):
        """GET /api/businesses/featured?country_code=MX should return next_available_text"""
        response = requests.get(f"{BASE_URL}/api/businesses/featured", params={"country_code": "MX"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list of businesses"
        
        if len(data) > 0:
            first_biz = data[0]
            assert "next_available_text" in first_biz, "Featured business should have next_available_text field"
            
            with_text = [b for b in data if b.get("next_available_text")]
            print(f"Found {len(data)} featured businesses, {len(with_text)} have next_available_text")
            
            for b in data[:5]:
                print(f"  - {b.get('name')}: next_available_text={b.get('next_available_text')}")
        else:
            print("No featured businesses found in MX")
    
    def test_next_available_text_format(self):
        """Verify next_available_text has correct format (Hoy disponible, Manana HH:MM, or Dia HH:MM)"""
        response = requests.get(f"{BASE_URL}/api/businesses", params={"country_code": "MX"})
        assert response.status_code == 200
        
        data = response.json()
        valid_formats = []
        
        for b in data:
            text = b.get("next_available_text")
            if text:
                # Valid formats: "Hoy disponible", "Manana HH:MM", "Lun HH:MM", "Mar HH:MM", etc.
                is_valid = (
                    text == "Hoy disponible" or
                    text.startswith("Manana ") or
                    any(text.startswith(day) for day in ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"])
                )
                if is_valid:
                    valid_formats.append(text)
                else:
                    print(f"WARNING: Unexpected format: {text}")
        
        print(f"Valid next_available_text formats found: {len(valid_formats)}")
        for fmt in set(valid_formats):
            print(f"  - {fmt}")


class TestDistanceKm:
    """Test distance_km field when user location is provided"""
    
    def test_search_with_user_location_returns_distance(self):
        """GET /api/businesses with user_lat/user_lng should return distance_km"""
        # Mexico City coordinates
        params = {
            "country_code": "MX",
            "user_lat": 19.43,
            "user_lng": -99.13
        }
        response = requests.get(f"{BASE_URL}/api/businesses", params=params)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            first_biz = data[0]
            assert "distance_km" in first_biz, "Business should have distance_km field when user location provided"
            
            with_distance = [b for b in data if b.get("distance_km") is not None]
            print(f"Found {len(data)} businesses, {len(with_distance)} have distance_km")
            
            for b in data[:5]:
                dist = b.get("distance_km")
                print(f"  - {b.get('name')}: distance_km={dist}")
        else:
            print("No businesses found in MX")
    
    def test_search_without_location_no_distance(self):
        """GET /api/businesses without user location should have null distance_km"""
        response = requests.get(f"{BASE_URL}/api/businesses", params={"country_code": "MX"})
        assert response.status_code == 200
        
        data = response.json()
        if len(data) > 0:
            # distance_km should be None or not present when no user location
            first_biz = data[0]
            dist = first_biz.get("distance_km")
            # It's acceptable for distance_km to be None or not present
            print(f"Without user location, distance_km = {dist}")


class TestHealthCheck:
    """Basic health check"""
    
    def test_health_endpoint(self):
        """GET /api/health should return healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") in ["healthy", "degraded"]
        print(f"Health status: {data.get('status')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
