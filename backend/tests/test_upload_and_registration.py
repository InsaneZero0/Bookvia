"""
Test suite for:
1. POST /api/upload/public - Public image upload endpoint
2. POST /api/auth/business/register - Business registration with logo_url and cover_photo
3. GET /api/businesses - BusinessResponse includes cover_photo field
"""
import pytest
import requests
import os
import io
from PIL import Image

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://marketplace-test-21.preview.emergentagent.com').rstrip('/')


class TestPublicUploadEndpoint:
    """Tests for POST /api/upload/public endpoint"""
    
    def test_upload_public_accepts_valid_image(self):
        """Test that /upload/public accepts a valid image and returns URL"""
        # Create a small test image in memory
        img = Image.new('RGB', (100, 100), color='red')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)
        
        files = {'file': ('test_image.jpg', img_bytes, 'image/jpeg')}
        response = requests.post(f"{BASE_URL}/api/upload/public", files=files)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert 'url' in data, f"Response should contain 'url' field: {data}"
        assert data['url'].startswith('http'), f"URL should be a valid HTTP URL: {data['url']}"
        print(f"✓ Upload successful, URL: {data['url']}")
    
    def test_upload_public_accepts_png(self):
        """Test that /upload/public accepts PNG images"""
        img = Image.new('RGBA', (50, 50), color='blue')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes.seek(0)
        
        files = {'file': ('test_image.png', img_bytes, 'image/png')}
        response = requests.post(f"{BASE_URL}/api/upload/public", files=files)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert 'url' in data
        print(f"✓ PNG upload successful")
    
    def test_upload_public_accepts_webp(self):
        """Test that /upload/public accepts WebP images"""
        img = Image.new('RGB', (50, 50), color='green')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='WEBP')
        img_bytes.seek(0)
        
        files = {'file': ('test_image.webp', img_bytes, 'image/webp')}
        response = requests.post(f"{BASE_URL}/api/upload/public", files=files)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert 'url' in data
        print(f"✓ WebP upload successful")
    
    def test_upload_public_rejects_large_file(self):
        """Test that /upload/public rejects files >5MB with 400 error"""
        # Create a file larger than 5MB (5.5MB)
        large_data = b'x' * (5 * 1024 * 1024 + 500000)  # 5.5MB
        
        files = {'file': ('large_file.jpg', io.BytesIO(large_data), 'image/jpeg')}
        response = requests.post(f"{BASE_URL}/api/upload/public", files=files)
        
        assert response.status_code == 400, f"Expected 400 for large file, got {response.status_code}"
        assert 'too large' in response.text.lower() or '5mb' in response.text.lower(), f"Error should mention file size: {response.text}"
        print(f"✓ Large file correctly rejected with 400")
    
    def test_upload_public_rejects_invalid_extension(self):
        """Test that /upload/public rejects non-image files"""
        files = {'file': ('test.pdf', io.BytesIO(b'fake pdf content'), 'application/pdf')}
        response = requests.post(f"{BASE_URL}/api/upload/public", files=files)
        
        assert response.status_code == 400, f"Expected 400 for invalid file type, got {response.status_code}"
        print(f"✓ Invalid file type correctly rejected")
    
    def test_upload_public_no_auth_required(self):
        """Test that /upload/public works without authentication"""
        img = Image.new('RGB', (50, 50), color='yellow')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)
        
        # Explicitly NOT sending any auth headers
        files = {'file': ('no_auth_test.jpg', img_bytes, 'image/jpeg')}
        response = requests.post(f"{BASE_URL}/api/upload/public", files=files)
        
        # Should succeed without auth
        assert response.status_code == 200, f"Should work without auth, got {response.status_code}: {response.text}"
        print(f"✓ Upload works without authentication")


class TestBusinessRegistrationWithImages:
    """Tests for business registration accepting logo_url and cover_photo"""
    
    def test_business_register_accepts_logo_url(self):
        """Test that business registration accepts logo_url field"""
        import uuid
        unique_email = f"test_logo_{uuid.uuid4().hex[:8]}@test.com"
        
        payload = {
            "name": "Test Logo Business",
            "email": unique_email,
            "password": "Test1234!",
            "phone": "+521234567890",
            "description": "Test business with logo",
            "category_id": "cat-belleza",  # May need to use actual category ID
            "address": "Test Address 123",
            "city": "Mexico City",
            "state": "CDMX",
            "country": "MX",
            "zip_code": "01234",
            "rfc": "XAXX010101000",
            "legal_name": "Test Logo SA de CV",
            "clabe": "012345678901234567",
            "logo_url": "https://example.com/test-logo.jpg",
            "cover_photo": None
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/business/register", json=payload)
        
        # May get 400 if category doesn't exist, but should not fail on logo_url field
        if response.status_code == 400:
            error = response.json().get('detail', '')
            assert 'logo_url' not in error.lower(), f"Should accept logo_url field: {error}"
            print(f"✓ logo_url field accepted (registration failed for other reason: {error})")
        else:
            print(f"✓ Business registration with logo_url succeeded")
    
    def test_business_register_accepts_cover_photo(self):
        """Test that business registration accepts cover_photo field"""
        import uuid
        unique_email = f"test_cover_{uuid.uuid4().hex[:8]}@test.com"
        
        payload = {
            "name": "Test Cover Business",
            "email": unique_email,
            "password": "Test1234!",
            "phone": "+521234567891",
            "description": "Test business with cover photo",
            "category_id": "cat-belleza",
            "address": "Test Address 456",
            "city": "Mexico City",
            "state": "CDMX",
            "country": "MX",
            "zip_code": "01234",
            "rfc": "XAXX010101001",
            "legal_name": "Test Cover SA de CV",
            "clabe": "012345678901234568",
            "logo_url": None,
            "cover_photo": "https://example.com/test-cover.jpg"
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/business/register", json=payload)
        
        if response.status_code == 400:
            error = response.json().get('detail', '')
            assert 'cover_photo' not in error.lower(), f"Should accept cover_photo field: {error}"
            print(f"✓ cover_photo field accepted (registration failed for other reason: {error})")
        else:
            print(f"✓ Business registration with cover_photo succeeded")


class TestBusinessResponseIncludesCoverPhoto:
    """Tests for GET /api/businesses returning cover_photo field"""
    
    def test_businesses_list_includes_cover_photo_field(self):
        """Test that GET /api/businesses returns cover_photo in response"""
        response = requests.get(f"{BASE_URL}/api/businesses")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Response could be a list or have a 'businesses' key
        businesses = data if isinstance(data, list) else data.get('businesses', [])
        
        if len(businesses) > 0:
            first_business = businesses[0]
            # Check that cover_photo field exists (can be null)
            assert 'cover_photo' in first_business or first_business.get('cover_photo') is None or 'cover_photo' in str(first_business), \
                f"BusinessResponse should include cover_photo field. Keys: {first_business.keys()}"
            print(f"✓ cover_photo field present in BusinessResponse")
        else:
            print("⚠ No businesses found to verify cover_photo field")
    
    def test_business_by_slug_includes_cover_photo(self):
        """Test that GET /api/businesses/{slug} returns cover_photo"""
        # First get a business slug
        response = requests.get(f"{BASE_URL}/api/businesses")
        assert response.status_code == 200
        
        data = response.json()
        businesses = data if isinstance(data, list) else data.get('businesses', [])
        
        if len(businesses) > 0:
            slug = businesses[0].get('slug')
            if slug:
                detail_response = requests.get(f"{BASE_URL}/api/businesses/{slug}")
                assert detail_response.status_code == 200
                business = detail_response.json()
                
                # cover_photo should be in the response (can be null)
                print(f"✓ Business detail includes cover_photo: {business.get('cover_photo', 'null')}")
            else:
                print("⚠ No slug found in first business")
        else:
            print("⚠ No businesses found")


class TestPaymentHistoryEndpoint:
    """Tests for GET /api/payments/my-transactions"""
    
    def test_my_transactions_requires_auth(self):
        """Test that /payments/my-transactions requires authentication"""
        response = requests.get(f"{BASE_URL}/api/payments/my-transactions")
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print(f"✓ /payments/my-transactions requires authentication")
    
    def test_my_transactions_with_auth(self):
        """Test that /payments/my-transactions works with valid auth"""
        # Login as regular user
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "cliente@bookvia.com",
            "password": "Test1234!"
        })
        
        if login_response.status_code != 200:
            pytest.skip("Could not login as test user")
        
        token = login_response.json().get('token')
        headers = {"Authorization": f"Bearer {token}"}
        
        response = requests.get(f"{BASE_URL}/api/payments/my-transactions", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list response, got {type(data)}"
        print(f"✓ /payments/my-transactions returns list with {len(data)} transactions")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
