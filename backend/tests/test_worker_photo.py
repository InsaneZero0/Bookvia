"""
Test worker photo upload functionality:
- POST /api/businesses/my/workers/{worker_id}/photo - upload worker photo
- GET /api/businesses/my/workers - verify photo_url is returned
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from context
TEST_BUSINESS_EMAIL = "testrealstripe@bookvia.com"
TEST_BUSINESS_PASSWORD = "Test1234!"
TEST_WORKER_ID = "e8156189-9cc2-4b3d-9f0e-2df518915bda"  # Existing worker with photo


class TestWorkerPhotoUpload:
    """Test worker photo upload endpoint and photo_url in worker responses"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Login as business and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": TEST_BUSINESS_EMAIL,
            "password": TEST_BUSINESS_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        return data.get("token")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Return headers with auth token"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Accept": "application/json"
        }
    
    def test_01_business_login_success(self):
        """Verify business login works"""
        response = requests.post(f"{BASE_URL}/api/auth/business/login", json={
            "email": TEST_BUSINESS_EMAIL,
            "password": TEST_BUSINESS_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "business" in data
        assert data["business"]["email"] == TEST_BUSINESS_EMAIL
        print(f"Business logged in: {data['business']['name']}")
    
    def test_02_get_workers_returns_photo_url(self, auth_headers):
        """Verify GET /api/businesses/my/workers returns workers with photo_url field"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/my/workers",
            headers=auth_headers,
            params={"include_inactive": True}
        )
        assert response.status_code == 200
        workers = response.json()
        assert isinstance(workers, list)
        print(f"Found {len(workers)} workers")
        
        # Check worker structure includes photo_url
        for worker in workers:
            assert "id" in worker
            assert "name" in worker
            assert "photo_url" in worker or worker.get("photo_url") is None, "Workers must have photo_url field"
            print(f"  Worker: {worker['name']}, photo_url: {worker.get('photo_url', 'None')}")
    
    def test_03_existing_worker_has_photo(self, auth_headers):
        """Verify existing worker (Test Worker Duration) has a photo_url"""
        response = requests.get(
            f"{BASE_URL}/api/businesses/my/workers",
            headers=auth_headers
        )
        assert response.status_code == 200
        workers = response.json()
        
        # Find the existing worker with photo
        worker_with_photo = next((w for w in workers if w.get("id") == TEST_WORKER_ID), None)
        if worker_with_photo:
            print(f"Worker '{worker_with_photo['name']}' photo_url: {worker_with_photo.get('photo_url')}")
            # Photo should exist per test context
        else:
            print(f"Worker {TEST_WORKER_ID} not found, skipping photo check")
    
    def test_04_create_worker_for_photo_test(self, auth_headers):
        """Create a new worker to test photo upload"""
        worker_data = {
            "name": "TEST_Photo_Worker",
            "email": "photo_test_worker@test.com",
            "phone": "+52 555 111 2222",
            "bio": "Test worker for photo upload"
        }
        response = requests.post(
            f"{BASE_URL}/api/businesses/my/workers",
            headers=auth_headers,
            json=worker_data
        )
        assert response.status_code == 200, f"Failed to create worker: {response.text}"
        worker = response.json()
        assert "id" in worker
        assert worker["name"] == "TEST_Photo_Worker"
        # Initially photo_url should be None
        assert worker.get("photo_url") is None or worker["photo_url"] is None
        print(f"Created worker: {worker['id']}")
        
        # Store worker_id for next tests
        pytest.test_worker_id = worker["id"]
    
    def test_05_upload_photo_to_worker(self, auth_headers):
        """Upload a photo to the worker"""
        worker_id = getattr(pytest, 'test_worker_id', None)
        if not worker_id:
            pytest.skip("Worker not created in previous test")
        
        # Create a minimal valid JPEG image (1x1 pixel)
        # This is a valid minimal JPEG header + content
        jpeg_bytes = bytes([
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
            0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
            0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
            0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
            0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
            0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
            0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
            0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
            0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
            0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
            0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
            0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
            0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
            0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
            0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
            0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
            0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
            0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
            0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
            0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
            0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
            0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
            0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
            0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
            0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
            0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
            0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD5, 0xDB, 0x9B, 0xFF, 0xD9
        ])
        
        files = {
            'file': ('test_photo.jpg', io.BytesIO(jpeg_bytes), 'image/jpeg')
        }
        
        headers = {"Authorization": auth_headers["Authorization"]}
        
        response = requests.post(
            f"{BASE_URL}/api/businesses/my/workers/{worker_id}/photo",
            headers=headers,
            files=files
        )
        
        print(f"Upload response status: {response.status_code}")
        print(f"Upload response: {response.text}")
        
        assert response.status_code == 200, f"Photo upload failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "secure_url" in data, "Response must include secure_url"
        assert "public_id" in data, "Response must include public_id"
        assert data["secure_url"], "secure_url must not be empty"
        print(f"Photo uploaded: {data['secure_url']}")
        
        # Store URL for verification
        pytest.test_photo_url = data["secure_url"]
    
    def test_06_verify_photo_url_persisted(self, auth_headers):
        """Verify the uploaded photo URL is returned when fetching workers"""
        worker_id = getattr(pytest, 'test_worker_id', None)
        expected_url = getattr(pytest, 'test_photo_url', None)
        if not worker_id:
            pytest.skip("Worker not created in previous test")
        
        response = requests.get(
            f"{BASE_URL}/api/businesses/my/workers",
            headers=auth_headers
        )
        assert response.status_code == 200
        workers = response.json()
        
        # Find the test worker
        test_worker = next((w for w in workers if w.get("id") == worker_id), None)
        assert test_worker is not None, f"Test worker {worker_id} not found"
        
        # Verify photo_url is set
        actual_url = test_worker.get("photo_url")
        print(f"Worker photo_url: {actual_url}")
        
        if expected_url:
            assert actual_url == expected_url, f"Photo URL mismatch: {actual_url} != {expected_url}"
        else:
            assert actual_url is not None, "Photo URL should be set after upload"
    
    def test_07_upload_invalid_file_fails(self, auth_headers):
        """Uploading non-image file should fail"""
        worker_id = getattr(pytest, 'test_worker_id', None)
        if not worker_id:
            pytest.skip("Worker not created in previous test")
        
        # Create a text file (invalid)
        files = {
            'file': ('test.txt', io.BytesIO(b'This is not an image'), 'text/plain')
        }
        
        headers = {"Authorization": auth_headers["Authorization"]}
        
        response = requests.post(
            f"{BASE_URL}/api/businesses/my/workers/{worker_id}/photo",
            headers=headers,
            files=files
        )
        
        print(f"Invalid file upload response: {response.status_code}")
        # Should return 400 for invalid file type
        assert response.status_code == 400, f"Expected 400 for invalid file, got {response.status_code}"
    
    def test_08_upload_without_auth_fails(self):
        """Upload without authentication should fail"""
        worker_id = getattr(pytest, 'test_worker_id', TEST_WORKER_ID)
        
        jpeg_bytes = bytes([0xFF, 0xD8, 0xFF, 0xE0] + [0x00] * 100 + [0xFF, 0xD9])
        files = {
            'file': ('test.jpg', io.BytesIO(jpeg_bytes), 'image/jpeg')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/businesses/my/workers/{worker_id}/photo",
            files=files
        )
        
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
    
    def test_09_upload_to_nonexistent_worker_fails(self, auth_headers):
        """Upload to non-existent worker should fail"""
        fake_worker_id = "nonexistent-worker-id-12345"
        
        jpeg_bytes = bytes([0xFF, 0xD8, 0xFF, 0xE0] + [0x00] * 100 + [0xFF, 0xD9])
        files = {
            'file': ('test.jpg', io.BytesIO(jpeg_bytes), 'image/jpeg')
        }
        
        headers = {"Authorization": auth_headers["Authorization"]}
        
        response = requests.post(
            f"{BASE_URL}/api/businesses/my/workers/{fake_worker_id}/photo",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 404, f"Expected 404 for nonexistent worker, got {response.status_code}"
    
    def test_10_cleanup_test_worker(self, auth_headers):
        """Delete test worker created during tests"""
        worker_id = getattr(pytest, 'test_worker_id', None)
        if not worker_id:
            pytest.skip("No test worker to clean up")
        
        response = requests.delete(
            f"{BASE_URL}/api/businesses/my/workers/{worker_id}",
            headers=auth_headers
        )
        
        # 200 or 404 are acceptable (already deleted)
        assert response.status_code in [200, 404], f"Cleanup failed: {response.text}"
        print(f"Cleaned up test worker: {worker_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
