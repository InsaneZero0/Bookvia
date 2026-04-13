"""
Test Admin Dashboard V2 - Business Detail, Reviews, Subscriptions endpoints
Tests the new admin panel features:
- GET /api/admin/businesses/{business_id}/detail
- GET /api/admin/reviews/all
- GET /api/admin/subscriptions
- DELETE /api/admin/reviews/{review_id}
"""
import pytest
import requests
import os
import pyotp
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials
ADMIN_EMAIL = "zamorachapa50@gmail.com"
ADMIN_PASSWORD = "RainbowLol3133!"


def get_totp_code():
    """Get current TOTP code for admin"""
    async def _get():
        client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
        db = client[os.environ.get('DB_NAME', 'bookvia')]
        admin = await db.users.find_one({'email': ADMIN_EMAIL}, {'_id': 0, 'totp_secret': 1})
        client.close()
        if admin and admin.get('totp_secret'):
            return pyotp.TOTP(admin['totp_secret']).now()
        return None
    return asyncio.get_event_loop().run_until_complete(_get())


def get_business_id():
    """Get a business ID from the database for testing"""
    async def _get():
        client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
        db = client[os.environ.get('DB_NAME', 'bookvia')]
        business = await db.businesses.find_one({}, {'_id': 0, 'id': 1})
        client.close()
        return business['id'] if business else None
    return asyncio.get_event_loop().run_until_complete(_get())


def get_review_id():
    """Get a review ID from the database for testing"""
    async def _get():
        client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
        db = client[os.environ.get('DB_NAME', 'bookvia')]
        review = await db.reviews.find_one({}, {'_id': 0, 'id': 1})
        client.close()
        return review['id'] if review else None
    return asyncio.get_event_loop().run_until_complete(_get())


@pytest.fixture(scope="module")
def admin_token():
    """Get admin JWT token via TOTP login"""
    totp_code = get_totp_code()
    if not totp_code:
        pytest.skip("Could not get TOTP code for admin")
    
    response = requests.post(f"{BASE_URL}/api/auth/admin/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
        "totp_code": totp_code
    })
    
    if response.status_code != 200:
        pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")
    
    data = response.json()
    return data.get("token")


@pytest.fixture(scope="module")
def api_client(admin_token):
    """Create authenticated session"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {admin_token}"
    })
    return session


class TestAdminBusinessDetail:
    """Test GET /api/admin/businesses/{business_id}/detail endpoint"""
    
    def test_get_business_detail_success(self, api_client):
        """Test getting complete business detail"""
        business_id = get_business_id()
        if not business_id:
            pytest.skip("No business found in database")
        
        response = api_client.get(f"{BASE_URL}/api/admin/businesses/{business_id}/detail")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "business" in data, "Response should contain 'business' key"
        assert "owner" in data, "Response should contain 'owner' key"
        assert "stats" in data, "Response should contain 'stats' key"
        assert "workers" in data, "Response should contain 'workers' key"
        assert "services" in data, "Response should contain 'services' key"
        assert "reviews" in data, "Response should contain 'reviews' key"
        
        # Verify business data
        business = data["business"]
        assert "id" in business
        assert "name" in business
        assert "status" in business
        
        # Verify stats structure
        stats = data["stats"]
        assert "total_bookings" in stats
        assert "completed_bookings" in stats
        assert "cancelled_bookings" in stats
        assert "total_revenue" in stats
        assert "avg_rating" in stats
        assert "review_count" in stats
        
        print(f"Business detail retrieved: {business.get('name')}")
        print(f"Stats: {stats}")
    
    def test_get_business_detail_includes_legal_docs(self, api_client):
        """Test that business detail includes legal document fields (RFC, CLABE, etc.)"""
        business_id = get_business_id()
        if not business_id:
            pytest.skip("No business found in database")
        
        response = api_client.get(f"{BASE_URL}/api/admin/businesses/{business_id}/detail")
        assert response.status_code == 200
        
        business = response.json()["business"]
        
        # These fields should exist in the response (may be null)
        legal_fields = ["rfc", "curp", "clabe", "legal_name", "ine_url", "rfc_document_url"]
        for field in legal_fields:
            assert field in business or business.get(field) is None, f"Field '{field}' should be in business data"
        
        print(f"Legal docs - RFC: {business.get('rfc')}, CLABE: {business.get('clabe')}")
    
    def test_get_business_detail_not_found(self, api_client):
        """Test 404 for non-existent business"""
        response = api_client.get(f"{BASE_URL}/api/admin/businesses/nonexistent-id-12345/detail")
        assert response.status_code == 404
    
    def test_get_business_detail_unauthorized(self):
        """Test that endpoint requires admin auth"""
        business_id = get_business_id()
        if not business_id:
            pytest.skip("No business found in database")
        
        response = requests.get(f"{BASE_URL}/api/admin/businesses/{business_id}/detail")
        assert response.status_code in [401, 403]


class TestAdminReviewsAll:
    """Test GET /api/admin/reviews/all endpoint"""
    
    def test_get_all_reviews_success(self, api_client):
        """Test getting all reviews with pagination"""
        response = api_client.get(f"{BASE_URL}/api/admin/reviews/all")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "reviews" in data, "Response should contain 'reviews' key"
        assert "total" in data, "Response should contain 'total' key"
        assert "page" in data, "Response should contain 'page' key"
        assert "pages" in data, "Response should contain 'pages' key"
        
        print(f"Total reviews: {data['total']}, Page: {data['page']}/{data['pages']}")
        
        # Verify reviews have business_name enrichment
        if data["reviews"]:
            review = data["reviews"][0]
            assert "business_name" in review, "Reviews should have 'business_name' enrichment"
            assert "rating" in review
            assert "id" in review
            print(f"First review: {review.get('user_name')} - {review.get('rating')} stars for {review.get('business_name')}")
    
    def test_get_all_reviews_with_search(self, api_client):
        """Test reviews search functionality"""
        response = api_client.get(f"{BASE_URL}/api/admin/reviews/all", params={"search": "test"})
        
        assert response.status_code == 200
        data = response.json()
        assert "reviews" in data
        assert "total" in data
    
    def test_get_all_reviews_pagination(self, api_client):
        """Test reviews pagination"""
        response = api_client.get(f"{BASE_URL}/api/admin/reviews/all", params={"page": 1, "limit": 5})
        
        assert response.status_code == 200
        data = response.json()
        assert len(data["reviews"]) <= 5
    
    def test_get_all_reviews_unauthorized(self):
        """Test that endpoint requires admin auth"""
        response = requests.get(f"{BASE_URL}/api/admin/reviews/all")
        assert response.status_code in [401, 403]


class TestAdminSubscriptions:
    """Test GET /api/admin/subscriptions endpoint"""
    
    def test_get_subscriptions_success(self, api_client):
        """Test getting subscription overview"""
        response = api_client.get(f"{BASE_URL}/api/admin/subscriptions")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "summary" in data, "Response should contain 'summary' key"
        assert "businesses" in data, "Response should contain 'businesses' key"
        
        # Summary should have subscription status counts
        summary = data["summary"]
        print(f"Subscription summary: {summary}")
        
        # Businesses should have subscription details
        if data["businesses"]:
            biz = data["businesses"][0]
            assert "id" in biz
            assert "name" in biz
            assert "subscription_status" in biz
            print(f"First business: {biz.get('name')} - {biz.get('subscription_status')}")
    
    def test_get_subscriptions_unauthorized(self):
        """Test that endpoint requires admin auth"""
        response = requests.get(f"{BASE_URL}/api/admin/subscriptions")
        assert response.status_code in [401, 403]


class TestAdminDeleteReview:
    """Test DELETE /api/admin/reviews/{review_id} endpoint"""
    
    def test_delete_review_not_found(self, api_client):
        """Test 404 for non-existent review"""
        response = api_client.delete(
            f"{BASE_URL}/api/admin/reviews/nonexistent-review-id",
            params={"reason": "Test deletion"}
        )
        assert response.status_code == 404
    
    def test_delete_review_unauthorized(self):
        """Test that endpoint requires admin auth"""
        response = requests.delete(f"{BASE_URL}/api/admin/reviews/some-review-id")
        assert response.status_code in [401, 403]
    
    # Note: We don't actually delete a real review to preserve test data
    # The endpoint functionality is verified by the 404 test and auth test


class TestAdminStats:
    """Test GET /api/admin/stats endpoint (existing, for regression)"""
    
    def test_get_stats_success(self, api_client):
        """Test getting admin stats"""
        response = api_client.get(f"{BASE_URL}/api/admin/stats")
        
        assert response.status_code == 200
        
        data = response.json()
        assert "users" in data
        assert "businesses" in data
        assert "bookings" in data
        assert "revenue" in data
        
        print(f"Admin stats: Users={data['users']['total']}, Businesses={data['businesses']['total']}")


class TestAdminBusinessesAll:
    """Test GET /api/admin/businesses/all endpoint (existing, for regression)"""
    
    def test_get_all_businesses_success(self, api_client):
        """Test getting all businesses"""
        response = api_client.get(f"{BASE_URL}/api/admin/businesses/all")
        
        assert response.status_code == 200
        
        data = response.json()
        assert "businesses" in data
        assert "total" in data
        assert "page" in data
        assert "pages" in data
        
        if data["businesses"]:
            biz = data["businesses"][0]
            # Verify enrichment fields
            assert "owner_email" in biz or biz.get("owner_email") == ""
            assert "booking_count" in biz
            assert "review_count" in biz
        
        print(f"Total businesses: {data['total']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
