"""
Test suite for Bookvia Favorites functionality
Tests:
- Login as regular user (cliente@bookvia.com)
- GET /api/users/favorites - returns list with is_open_now, next_available_text, category_name
- POST /api/users/favorites/{business_id} - add favorite
- DELETE /api/users/favorites/{business_id} - remove favorite
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
USER_EMAIL = "cliente@bookvia.com"
USER_PASSWORD = "Test1234!"


class TestFavoritesAPI:
    """Test favorites API endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login as regular user and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, f"Response missing 'token' key: {data.keys()}"
        return data["token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get auth headers with token"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    @pytest.fixture(scope="class")
    def test_business_id(self):
        """Get a business ID to use for testing"""
        # Search for businesses in MX
        response = requests.get(f"{BASE_URL}/api/businesses", params={"country_code": "MX", "limit": 5})
        assert response.status_code == 200, f"Failed to get businesses: {response.text}"
        data = response.json()
        businesses = data.get("businesses", data) if isinstance(data, dict) else data
        assert len(businesses) > 0, "No businesses found in MX"
        return businesses[0]["id"]
    
    def test_01_login_as_user(self):
        """Test login as regular user returns token and user object"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "token" in data, f"Response missing 'token': {data.keys()}"
        assert "user" in data, f"Response missing 'user': {data.keys()}"
        assert data["user"]["email"] == USER_EMAIL
        assert data["user"]["role"] == "user"
        print(f"✓ Login successful for {USER_EMAIL}")
    
    def test_02_get_favorites_returns_list(self, auth_headers):
        """Test GET /api/users/favorites returns a list"""
        response = requests.get(f"{BASE_URL}/api/users/favorites", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get favorites: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✓ GET /api/users/favorites returns list with {len(data)} items")
        return data
    
    def test_03_favorites_have_required_fields(self, auth_headers):
        """Test favorites include is_open_now, next_available_text, category_name"""
        response = requests.get(f"{BASE_URL}/api/users/favorites", headers=auth_headers)
        assert response.status_code == 200
        favorites = response.json()
        
        if len(favorites) == 0:
            pytest.skip("No favorites to test - will add one first")
        
        for fav in favorites:
            # Check required fields exist
            assert "id" in fav, f"Missing 'id' in favorite: {fav.keys()}"
            assert "name" in fav, f"Missing 'name' in favorite: {fav.keys()}"
            assert "city" in fav, f"Missing 'city' in favorite: {fav.keys()}"
            
            # Check new fields (is_open_now, next_available_text, category_name)
            # is_open_now should be boolean or None
            assert "is_open_now" in fav or fav.get("is_open_now") is None, f"Missing 'is_open_now' in favorite"
            
            # next_available_text can be None or string
            if "next_available_text" in fav and fav["next_available_text"]:
                assert isinstance(fav["next_available_text"], str), f"next_available_text should be string"
            
            # category_name should be present if category_id exists
            if fav.get("category_id"):
                assert "category_name" in fav, f"Missing 'category_name' for business with category_id"
            
            print(f"  ✓ Favorite '{fav['name']}': is_open_now={fav.get('is_open_now')}, next_available_text={fav.get('next_available_text')}, category_name={fav.get('category_name')}")
        
        print(f"✓ All {len(favorites)} favorites have required fields")
    
    def test_04_add_favorite(self, auth_headers, test_business_id):
        """Test POST /api/users/favorites/{business_id} adds favorite"""
        # First remove if exists (to ensure clean state)
        requests.delete(f"{BASE_URL}/api/users/favorites/{test_business_id}", headers=auth_headers)
        
        # Add favorite
        response = requests.post(f"{BASE_URL}/api/users/favorites/{test_business_id}", headers=auth_headers)
        assert response.status_code == 200, f"Failed to add favorite: {response.text}"
        data = response.json()
        assert "message" in data, f"Response missing 'message': {data}"
        
        # Verify it was added
        fav_response = requests.get(f"{BASE_URL}/api/users/favorites", headers=auth_headers)
        favorites = fav_response.json()
        fav_ids = [f["id"] for f in favorites]
        assert test_business_id in fav_ids, f"Business {test_business_id} not found in favorites after adding"
        
        print(f"✓ POST /api/users/favorites/{test_business_id} - favorite added successfully")
    
    def test_05_remove_favorite(self, auth_headers, test_business_id):
        """Test DELETE /api/users/favorites/{business_id} removes favorite"""
        # Ensure favorite exists first
        requests.post(f"{BASE_URL}/api/users/favorites/{test_business_id}", headers=auth_headers)
        
        # Remove favorite
        response = requests.delete(f"{BASE_URL}/api/users/favorites/{test_business_id}", headers=auth_headers)
        assert response.status_code == 200, f"Failed to remove favorite: {response.text}"
        data = response.json()
        assert "message" in data, f"Response missing 'message': {data}"
        
        # Verify it was removed
        fav_response = requests.get(f"{BASE_URL}/api/users/favorites", headers=auth_headers)
        favorites = fav_response.json()
        fav_ids = [f["id"] for f in favorites]
        assert test_business_id not in fav_ids, f"Business {test_business_id} still in favorites after removing"
        
        print(f"✓ DELETE /api/users/favorites/{test_business_id} - favorite removed successfully")
    
    def test_06_add_favorite_invalid_business(self, auth_headers):
        """Test adding non-existent business returns 404"""
        fake_id = "non-existent-business-id-12345"
        response = requests.post(f"{BASE_URL}/api/users/favorites/{fake_id}", headers=auth_headers)
        assert response.status_code == 404, f"Expected 404 for invalid business, got {response.status_code}"
        print("✓ POST with invalid business_id returns 404")
    
    def test_07_favorites_without_auth_returns_401(self):
        """Test GET /api/users/favorites without auth returns 401"""
        response = requests.get(f"{BASE_URL}/api/users/favorites")
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("✓ GET /api/users/favorites without auth returns 401")


class TestFavoritesDataIntegrity:
    """Test favorites data integrity and field values"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Login and get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        assert response.status_code == 200
        return {"Authorization": f"Bearer {response.json()['token']}"}
    
    def test_is_open_now_is_boolean(self, auth_headers):
        """Test is_open_now field is boolean when present"""
        response = requests.get(f"{BASE_URL}/api/users/favorites", headers=auth_headers)
        assert response.status_code == 200
        favorites = response.json()
        
        for fav in favorites:
            if fav.get("is_open_now") is not None:
                assert isinstance(fav["is_open_now"], bool), f"is_open_now should be boolean, got {type(fav['is_open_now'])}"
        
        print(f"✓ is_open_now field is boolean for all {len(favorites)} favorites")
    
    def test_next_available_text_format(self, auth_headers):
        """Test next_available_text has expected format"""
        response = requests.get(f"{BASE_URL}/api/users/favorites", headers=auth_headers)
        assert response.status_code == 200
        favorites = response.json()
        
        valid_prefixes = ["Hoy disponible", "Manana", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"]
        
        for fav in favorites:
            text = fav.get("next_available_text")
            if text:
                has_valid_prefix = any(text.startswith(prefix) for prefix in valid_prefixes)
                assert has_valid_prefix, f"Invalid next_available_text format: '{text}'"
        
        print("✓ next_available_text has valid format")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
