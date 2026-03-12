"""
Backend tests for Photo Upload/Delete/List endpoints (iteration 12).
Tests new features:
1. POST /api/businesses/me/photos - upload photo (requires auth)
2. GET /api/businesses/me/photos - list photos (requires auth)
3. DELETE /api/businesses/me/photos/{id} - delete photo (requires auth)
4. GET /api/files/{path} - serve file

Since we don't have credentials, we test:
- Endpoints exist (not 404)
- Return 401/403 for unauthenticated requests (not 500)
- /api/files/{path} returns 404 for non-existent files
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPhotoEndpoints:
    """Test photo upload/delete/list endpoints exist and require auth"""
    
    def test_upload_photo_requires_auth(self):
        """POST /api/businesses/me/photos should return 401 without auth"""
        # Create a simple test image (1x1 pixel PNG)
        test_image = (
            b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01'
            b'\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde'
            b'\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01'
            b'\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
        )
        
        response = requests.post(
            f"{BASE_URL}/api/businesses/me/photos",
            files={"file": ("test.png", test_image, "image/png")},
            timeout=30
        )
        
        # Should return 401 (unauthorized), not 404 or 500
        assert response.status_code == 401, f"Expected 401 but got {response.status_code}: {response.text}"
        print(f"✓ POST /api/businesses/me/photos returns 401 without auth")
    
    def test_list_photos_requires_auth(self):
        """GET /api/businesses/me/photos should return 401 without auth"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/me/photos",
            timeout=30
        )
        
        # Should return 401 (unauthorized), not 404 or 500
        assert response.status_code == 401, f"Expected 401 but got {response.status_code}: {response.text}"
        print(f"✓ GET /api/businesses/me/photos returns 401 without auth")
    
    def test_delete_photo_requires_auth(self):
        """DELETE /api/businesses/me/photos/{id} should return 401 without auth"""
        response = requests.delete(
            f"{BASE_URL}/api/businesses/me/photos/fake-id-123",
            timeout=30
        )
        
        # Should return 401 (unauthorized), not 404 or 500
        assert response.status_code == 401, f"Expected 401 but got {response.status_code}: {response.text}"
        print(f"✓ DELETE /api/businesses/me/photos/fake-id-123 returns 401 without auth")
    
    def test_serve_file_returns_404_for_nonexistent(self):
        """GET /api/files/{path} should return 404 for non-existent files"""
        response = requests.get(
            f"{BASE_URL}/api/files/nonexistent/path/file.jpg",
            timeout=30
        )
        
        # Should return 404 for non-existent file
        assert response.status_code == 404, f"Expected 404 but got {response.status_code}: {response.text}"
        print(f"✓ GET /api/files/nonexistent/path returns 404")


class TestBusinessDashboardEndpoint:
    """Test business dashboard endpoint requires auth"""
    
    def test_business_dashboard_requires_auth(self):
        """GET /api/businesses/me/dashboard should return 401 without auth"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/me/dashboard",
            timeout=30
        )
        
        assert response.status_code == 401, f"Expected 401 but got {response.status_code}: {response.text}"
        print(f"✓ GET /api/businesses/me/dashboard returns 401 without auth")


class TestUserEndpoints:
    """Test user endpoints for dashboard features"""
    
    def test_user_me_requires_auth(self):
        """GET /api/auth/me should return 401 without auth"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            timeout=30
        )
        
        assert response.status_code == 401, f"Expected 401 but got {response.status_code}: {response.text}"
        print(f"✓ GET /api/auth/me returns 401 without auth")
    
    def test_user_favorites_requires_auth(self):
        """GET /api/users/favorites should return 401 without auth"""
        response = requests.get(
            f"{BASE_URL}/api/users/favorites",
            timeout=30
        )
        
        assert response.status_code == 401, f"Expected 401 but got {response.status_code}: {response.text}"
        print(f"✓ GET /api/users/favorites returns 401 without auth")
    
    def test_user_bookings_requires_auth(self):
        """GET /api/bookings/my should return 401 without auth"""
        response = requests.get(
            f"{BASE_URL}/api/bookings/my",
            timeout=30
        )
        
        assert response.status_code == 401, f"Expected 401 but got {response.status_code}: {response.text}"
        print(f"✓ GET /api/bookings/my returns 401 without auth")


class TestPublicEndpoints:
    """Test public endpoints still work (regression tests)"""
    
    def test_health_check(self):
        """GET /api/health should return 200"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=30)
        
        assert response.status_code == 200, f"Expected 200 but got {response.status_code}"
        data = response.json()
        assert data.get("status") == "healthy"
        print(f"✓ GET /api/health returns 200 healthy")
    
    def test_business_by_slug(self):
        """GET /api/businesses/slug/{slug} should return 200 for valid slug"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/slug/test-business-5ecc65fc",
            timeout=30
        )
        
        assert response.status_code == 200, f"Expected 200 but got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("slug") == "test-business-5ecc65fc"
        print(f"✓ GET /api/businesses/slug/test-business-5ecc65fc returns 200 with business data")
    
    def test_categories(self):
        """GET /api/categories should return list of categories"""
        response = requests.get(f"{BASE_URL}/api/categories", timeout=30)
        
        assert response.status_code == 200, f"Expected 200 but got {response.status_code}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/categories returns 200 with {len(data)} categories")
    
    def test_featured_businesses(self):
        """GET /api/businesses/featured should return list"""
        response = requests.get(f"{BASE_URL}/api/businesses/featured", timeout=30)
        
        assert response.status_code == 200, f"Expected 200 but got {response.status_code}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/businesses/featured returns 200 with {len(data)} businesses")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
