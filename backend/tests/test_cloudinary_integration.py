"""
Backend tests for Cloudinary Integration (iteration 21).
Tests the new image upload system with Cloudinary/Emergent Storage fallback:
1. POST /api/businesses/me/photos - upload gallery photo (returns url, public_id, id, original_filename)
2. POST /api/businesses/me/logo - upload logo (returns secure_url, public_id)
3. GET /api/businesses/me/photos - returns list of photos with url field
4. DELETE /api/businesses/me/photos/{photo_id} - deletes photo
5. POST /api/upload/image - generic image upload endpoint (requires auth)
6. POST /api/businesses/me/photos with .jfif file - accepts application/octet-stream

Note: In preview env, Cloudinary is NOT configured - uses Emergent Object Storage fallback.
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "testrealstripe@bookvia.com"
TEST_PASSWORD = "Test1234!"

# 1x1 pixel PNG image for testing
TEST_PNG = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01'
    b'\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde'
    b'\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01'
    b'\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
)

# Minimal JPEG for testing
TEST_JPEG = bytes([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
    0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
    0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
    0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0xFF, 0xC4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00,
    0x7F, 0xFF, 0xD9
])


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for test business"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        timeout=30
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Return headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}"}


class TestHealthAndAuth:
    """Basic health check and authentication tests"""

    def test_health_check(self):
        """GET /api/health should return 200"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=30)
        assert response.status_code == 200
        assert response.json().get("status") == "healthy"
        print("✓ GET /api/health returns 200 healthy")

    def test_login_success(self):
        """POST /api/auth/login with valid credentials returns token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            timeout=30
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_EMAIL
        print(f"✓ Login successful for {TEST_EMAIL}")


class TestGalleryPhotoUpload:
    """Test POST /api/businesses/me/photos - gallery photo upload"""

    def test_upload_photo_requires_auth(self):
        """POST /api/businesses/me/photos returns 401 without auth"""
        response = requests.post(
            f"{BASE_URL}/api/businesses/me/photos",
            files={"file": ("test.png", TEST_PNG, "image/png")},
            timeout=30
        )
        assert response.status_code == 401
        print("✓ POST /api/businesses/me/photos returns 401 without auth")

    def test_upload_photo_success(self, auth_headers):
        """POST /api/businesses/me/photos returns url, public_id, id, original_filename"""
        response = requests.post(
            f"{BASE_URL}/api/businesses/me/photos",
            headers=auth_headers,
            files={"file": ("test_gallery.png", TEST_PNG, "image/png")},
            timeout=60
        )
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "url" in data, f"Missing 'url' in response: {data}"
        assert "public_id" in data, f"Missing 'public_id' in response: {data}"
        assert "id" in data, f"Missing 'id' in response: {data}"
        assert "original_filename" in data, f"Missing 'original_filename' in response: {data}"
        
        # Verify values
        assert data["original_filename"] == "test_gallery.png"
        assert len(data["url"]) > 10
        assert len(data["public_id"]) > 0
        assert len(data["id"]) > 0
        
        print(f"✓ POST /api/businesses/me/photos returns correct structure:")
        print(f"  - url: {data['url'][:60]}...")
        print(f"  - public_id: {data['public_id']}")
        print(f"  - id: {data['id']}")
        print(f"  - original_filename: {data['original_filename']}")
        
        # Store for cleanup
        pytest.uploaded_photo_id = data["id"]

    def test_upload_jfif_file(self, auth_headers):
        """POST /api/businesses/me/photos accepts .jfif files (application/octet-stream)"""
        # Use the same JPEG bytes but with .jfif extension and octet-stream
        response = requests.post(
            f"{BASE_URL}/api/businesses/me/photos",
            headers=auth_headers,
            files={"file": ("test_file.jfif", TEST_JPEG, "application/octet-stream")},
            timeout=60
        )
        assert response.status_code == 200, f"JFIF upload failed: {response.text}"
        data = response.json()
        assert "url" in data
        assert "original_filename" in data
        assert data["original_filename"] == "test_file.jfif"
        print(f"✓ POST /api/businesses/me/photos accepts .jfif files with application/octet-stream")
        
        # Store for cleanup
        pytest.uploaded_jfif_id = data["id"]

    def test_upload_rejects_invalid_format(self, auth_headers):
        """POST /api/businesses/me/photos rejects non-image files"""
        response = requests.post(
            f"{BASE_URL}/api/businesses/me/photos",
            headers=auth_headers,
            files={"file": ("test.txt", b"not an image", "text/plain")},
            timeout=30
        )
        assert response.status_code == 400, f"Expected 400 but got {response.status_code}: {response.text}"
        print("✓ POST /api/businesses/me/photos rejects non-image files with 400")


class TestGetPhotos:
    """Test GET /api/businesses/me/photos"""

    def test_get_photos_requires_auth(self):
        """GET /api/businesses/me/photos returns 401 without auth"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/me/photos",
            timeout=30
        )
        assert response.status_code == 401
        print("✓ GET /api/businesses/me/photos returns 401 without auth")

    def test_get_photos_returns_list(self, auth_headers):
        """GET /api/businesses/me/photos returns list of photos with url field"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/me/photos",
            headers=auth_headers,
            timeout=30
        )
        assert response.status_code == 200, f"Failed to get photos: {response.text}"
        data = response.json()
        
        assert isinstance(data, list), f"Expected list but got: {type(data)}"
        
        if len(data) > 0:
            photo = data[0]
            assert "url" in photo, f"Missing 'url' in photo: {photo}"
            assert "id" in photo, f"Missing 'id' in photo: {photo}"
            print(f"✓ GET /api/businesses/me/photos returns {len(data)} photos with url field")
        else:
            print("✓ GET /api/businesses/me/photos returns empty list (no photos yet)")


class TestDeletePhoto:
    """Test DELETE /api/businesses/me/photos/{photo_id}"""

    def test_delete_photo_requires_auth(self):
        """DELETE /api/businesses/me/photos/{id} returns 401 without auth"""
        response = requests.delete(
            f"{BASE_URL}/api/businesses/me/photos/fake-id",
            timeout=30
        )
        assert response.status_code == 401
        print("✓ DELETE /api/businesses/me/photos/{id} returns 401 without auth")

    def test_delete_nonexistent_photo(self, auth_headers):
        """DELETE /api/businesses/me/photos/{id} returns 404 for non-existent photo"""
        response = requests.delete(
            f"{BASE_URL}/api/businesses/me/photos/nonexistent-id-12345",
            headers=auth_headers,
            timeout=30
        )
        assert response.status_code == 404
        print("✓ DELETE /api/businesses/me/photos/{id} returns 404 for non-existent photo")

    def test_delete_uploaded_photo(self, auth_headers):
        """DELETE /api/businesses/me/photos/{id} deletes the photo successfully"""
        # Get list of photos to find one to delete
        response = requests.get(
            f"{BASE_URL}/api/businesses/me/photos",
            headers=auth_headers,
            timeout=30
        )
        photos = response.json()
        
        # Find a test photo (with test in filename or recently uploaded)
        photo_to_delete = None
        for photo in photos:
            if "test" in photo.get("original_filename", "").lower():
                photo_to_delete = photo
                break
        
        if not photo_to_delete:
            pytest.skip("No test photos to delete")
            return
            
        # Delete the photo
        response = requests.delete(
            f"{BASE_URL}/api/businesses/me/photos/{photo_to_delete['id']}",
            headers=auth_headers,
            timeout=30
        )
        assert response.status_code == 200, f"Delete failed: {response.text}"
        data = response.json()
        assert "message" in data
        print(f"✓ DELETE /api/businesses/me/photos/{photo_to_delete['id']} deleted successfully")


class TestLogoUpload:
    """Test POST /api/businesses/me/logo"""

    def test_upload_logo_requires_auth(self):
        """POST /api/businesses/me/logo returns 401 without auth"""
        response = requests.post(
            f"{BASE_URL}/api/businesses/me/logo",
            files={"file": ("logo.png", TEST_PNG, "image/png")},
            timeout=30
        )
        assert response.status_code == 401
        print("✓ POST /api/businesses/me/logo returns 401 without auth")

    def test_upload_logo_success(self, auth_headers):
        """POST /api/businesses/me/logo returns secure_url, public_id"""
        response = requests.post(
            f"{BASE_URL}/api/businesses/me/logo",
            headers=auth_headers,
            files={"file": ("test_logo.jpg", TEST_JPEG, "image/jpeg")},
            timeout=60
        )
        assert response.status_code == 200, f"Logo upload failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "secure_url" in data, f"Missing 'secure_url' in response: {data}"
        assert "public_id" in data, f"Missing 'public_id' in response: {data}"
        
        assert len(data["secure_url"]) > 10
        assert len(data["public_id"]) > 0
        
        print(f"✓ POST /api/businesses/me/logo returns correct structure:")
        print(f"  - secure_url: {data['secure_url'][:60]}...")
        print(f"  - public_id: {data['public_id']}")

    def test_upload_logo_rejects_invalid_format(self, auth_headers):
        """POST /api/businesses/me/logo rejects non-image files"""
        response = requests.post(
            f"{BASE_URL}/api/businesses/me/logo",
            headers=auth_headers,
            files={"file": ("logo.pdf", b"not an image", "application/pdf")},
            timeout=30
        )
        assert response.status_code == 400
        print("✓ POST /api/businesses/me/logo rejects non-image files with 400")


class TestGenericUploadEndpoint:
    """Test POST /api/upload/image - generic upload endpoint"""

    def test_generic_upload_requires_auth(self):
        """POST /api/upload/image returns 401 without auth"""
        response = requests.post(
            f"{BASE_URL}/api/upload/image",
            files={"file": ("image.png", TEST_PNG, "image/png")},
            timeout=30
        )
        assert response.status_code == 401
        print("✓ POST /api/upload/image returns 401 without auth")

    def test_generic_upload_returns_503_without_cloudinary(self, auth_headers):
        """POST /api/upload/image returns 503 when Cloudinary not configured (expected in preview)"""
        response = requests.post(
            f"{BASE_URL}/api/upload/image",
            headers=auth_headers,
            files={"file": ("test.png", TEST_PNG, "image/png")},
            timeout=30
        )
        # In preview env without Cloudinary, should return 503
        # This is expected behavior - Cloudinary fallback is only for specific endpoints
        if response.status_code == 503:
            print("✓ POST /api/upload/image returns 503 (Cloudinary not configured - expected in preview)")
        elif response.status_code == 200:
            data = response.json()
            assert "secure_url" in data
            print("✓ POST /api/upload/image works with Cloudinary configured")
        else:
            pytest.fail(f"Unexpected status: {response.status_code}: {response.text}")


class TestFileValidation:
    """Test file validation rules"""

    def test_file_size_validation(self, auth_headers):
        """Large files should be rejected"""
        # Create a file larger than 5MB
        large_file = b'x' * (6 * 1024 * 1024)  # 6MB
        response = requests.post(
            f"{BASE_URL}/api/businesses/me/photos",
            headers=auth_headers,
            files={"file": ("large.png", large_file, "image/png")},
            timeout=60
        )
        # Should return 400 or 413 for file too large
        assert response.status_code in [400, 413], f"Expected 400/413 but got {response.status_code}"
        print(f"✓ Large files (>5MB) are rejected with status {response.status_code}")


class TestBusinessDashboardLogoDisplay:
    """Verify logo_url is included in dashboard response"""

    def test_dashboard_includes_logo_url(self, auth_headers):
        """GET /api/businesses/me/dashboard includes logo_url in business object"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/me/dashboard",
            headers=auth_headers,
            timeout=30
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "business" in data, f"Missing 'business' in response: {data}"
        business = data["business"]
        
        # logo_url should exist (may be null if no logo uploaded)
        assert "logo_url" in business, f"Missing 'logo_url' in business: {business}"
        
        if business["logo_url"]:
            print(f"✓ Dashboard includes logo_url: {business['logo_url'][:60]}...")
        else:
            print("✓ Dashboard includes logo_url field (currently null)")

    def test_dashboard_includes_photos_array(self, auth_headers):
        """GET /api/businesses/me/dashboard includes photos array"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/me/dashboard",
            headers=auth_headers,
            timeout=30
        )
        assert response.status_code == 200
        data = response.json()
        business = data["business"]
        
        assert "photos" in business, f"Missing 'photos' in business: {business}"
        assert isinstance(business["photos"], list)
        
        print(f"✓ Dashboard includes photos array with {len(business['photos'])} photos")


class TestServeFiles:
    """Test /api/files/{path} endpoint for Emergent storage fallback"""

    def test_serve_nonexistent_file(self):
        """GET /api/files/{path} returns 404 for non-existent files"""
        response = requests.get(
            f"{BASE_URL}/api/files/nonexistent/path/file.jpg",
            timeout=30
        )
        assert response.status_code == 404
        print("✓ GET /api/files/{nonexistent} returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
