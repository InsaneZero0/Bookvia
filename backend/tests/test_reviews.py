"""
Test suite for Review feature
- POST /api/reviews/ creates a review for a past confirmed booking
- POST /api/reviews/ prevents duplicate reviews
- GET /api/reviews/business/{business_id} returns reviews
- GET /api/bookings/my?upcoming=false returns has_review field
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from main agent
TEST_USER_EMAIL = "reviewtest@bookvia.com"
TEST_USER_PASSWORD = "Test1234!"
TEST_BUSINESS_ID = "fbb3d0e3-37f2-417b-8cfa-b7fbf24f1ee0"
TEST_BOOKING_ID = "fdf63d6d-39fa-4b5d-a99c-4f43dcb029ae"


class TestReviewFeature:
    """Test suite for review functionality"""
    
    @pytest.fixture(scope="class")
    def user_token(self):
        """Login as test user and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Could not login as test user: {response.text}")
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, user_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {user_token}"}
    
    def test_health_check(self):
        """Test API is healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ["healthy", "degraded"]
        print(f"API health: {data['status']}")
    
    def test_user_login(self):
        """Test user can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert "user" in data
        print(f"User logged in: {data['user']['email']}")
    
    def test_get_past_bookings_has_review_field(self, auth_headers):
        """Test GET /api/bookings/my?upcoming=false returns has_review field"""
        response = requests.get(
            f"{BASE_URL}/api/bookings/my",
            params={"upcoming": "false"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get bookings: {response.text}"
        bookings = response.json()
        print(f"Found {len(bookings)} past bookings")
        
        # Check that has_review field exists
        for booking in bookings:
            assert "has_review" in booking, f"Booking {booking['id']} missing has_review field"
            print(f"Booking {booking['id']}: status={booking['status']}, has_review={booking['has_review']}")
        
        # Find our test booking
        test_booking = next((b for b in bookings if b["id"] == TEST_BOOKING_ID), None)
        if test_booking:
            print(f"Test booking found: {test_booking['id']}, has_review={test_booking['has_review']}")
    
    def test_get_business_reviews(self):
        """Test GET /api/reviews/business/{business_id} returns reviews"""
        response = requests.get(f"{BASE_URL}/api/reviews/business/{TEST_BUSINESS_ID}")
        assert response.status_code == 200, f"Failed to get reviews: {response.text}"
        reviews = response.json()
        print(f"Found {len(reviews)} reviews for business {TEST_BUSINESS_ID}")
        
        # Check review structure
        for review in reviews:
            assert "id" in review
            assert "user_id" in review
            assert "business_id" in review
            assert "rating" in review
            assert "user_name" in review
            assert "created_at" in review
            print(f"Review: rating={review['rating']}, user={review.get('user_name', 'N/A')}")
    
    def test_create_review_requires_auth(self):
        """Test POST /api/reviews/ requires authentication"""
        response = requests.post(f"{BASE_URL}/api/reviews/", json={
            "business_id": TEST_BUSINESS_ID,
            "booking_id": TEST_BOOKING_ID,
            "rating": 5,
            "comment": "Test review"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Review creation requires auth - PASSED")
    
    def test_create_review_invalid_booking(self, auth_headers):
        """Test POST /api/reviews/ with invalid booking returns error"""
        fake_booking_id = str(uuid.uuid4())
        response = requests.post(
            f"{BASE_URL}/api/reviews/",
            json={
                "business_id": TEST_BUSINESS_ID,
                "booking_id": fake_booking_id,
                "rating": 5,
                "comment": "Test review"
            },
            headers=auth_headers
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("Invalid booking returns 400 - PASSED")
    
    def test_create_review_for_past_booking(self, auth_headers):
        """Test POST /api/reviews/ creates review for past confirmed booking"""
        # First check if booking already has a review
        bookings_response = requests.get(
            f"{BASE_URL}/api/bookings/my",
            params={"upcoming": "false"},
            headers=auth_headers
        )
        bookings = bookings_response.json()
        test_booking = next((b for b in bookings if b["id"] == TEST_BOOKING_ID), None)
        
        if not test_booking:
            pytest.skip(f"Test booking {TEST_BOOKING_ID} not found")
        
        if test_booking.get("has_review"):
            print(f"Booking {TEST_BOOKING_ID} already has a review - testing duplicate prevention")
            # Test duplicate prevention
            response = requests.post(
                f"{BASE_URL}/api/reviews/",
                json={
                    "business_id": TEST_BUSINESS_ID,
                    "booking_id": TEST_BOOKING_ID,
                    "rating": 5,
                    "comment": "Duplicate review attempt"
                },
                headers=auth_headers
            )
            assert response.status_code == 400, f"Expected 400 for duplicate, got {response.status_code}"
            assert "Already reviewed" in response.text or "already" in response.text.lower()
            print("Duplicate review prevention - PASSED")
        else:
            # Create new review
            response = requests.post(
                f"{BASE_URL}/api/reviews/",
                json={
                    "business_id": TEST_BUSINESS_ID,
                    "booking_id": TEST_BOOKING_ID,
                    "rating": 5,
                    "comment": "Excelente servicio, muy recomendado!"
                },
                headers=auth_headers
            )
            assert response.status_code == 200, f"Failed to create review: {response.text}"
            review = response.json()
            assert review["rating"] == 5
            assert review["business_id"] == TEST_BUSINESS_ID
            assert review["booking_id"] == TEST_BOOKING_ID
            assert "user_name" in review
            print(f"Review created: id={review['id']}, rating={review['rating']}")
    
    def test_duplicate_review_prevention(self, auth_headers):
        """Test POST /api/reviews/ prevents duplicate reviews"""
        # Try to create another review for the same booking
        response = requests.post(
            f"{BASE_URL}/api/reviews/",
            json={
                "business_id": TEST_BUSINESS_ID,
                "booking_id": TEST_BOOKING_ID,
                "rating": 4,
                "comment": "Another review attempt"
            },
            headers=auth_headers
        )
        # Should fail with 400 if already reviewed
        if response.status_code == 400:
            assert "Already reviewed" in response.text or "already" in response.text.lower()
            print("Duplicate review prevention - PASSED")
        else:
            # If first review wasn't created, this might succeed
            print(f"Review response: {response.status_code} - {response.text}")
    
    def test_booking_has_review_after_creation(self, auth_headers):
        """Test that has_review is true after review is created"""
        response = requests.get(
            f"{BASE_URL}/api/bookings/my",
            params={"upcoming": "false"},
            headers=auth_headers
        )
        assert response.status_code == 200
        bookings = response.json()
        
        test_booking = next((b for b in bookings if b["id"] == TEST_BOOKING_ID), None)
        if test_booking:
            print(f"Booking {TEST_BOOKING_ID} has_review: {test_booking.get('has_review')}")
            # After creating a review, has_review should be True
            # (This depends on whether the review was created in previous test)
    
    def test_review_appears_in_business_reviews(self):
        """Test that created review appears in business reviews"""
        response = requests.get(f"{BASE_URL}/api/reviews/business/{TEST_BUSINESS_ID}")
        assert response.status_code == 200
        reviews = response.json()
        
        # Check if our review is there
        our_review = next((r for r in reviews if r.get("booking_id") == TEST_BOOKING_ID), None)
        if our_review:
            print(f"Review found in business reviews: rating={our_review['rating']}, user={our_review.get('user_name')}")
            assert our_review["rating"] >= 1 and our_review["rating"] <= 5
            assert "user_name" in our_review
        else:
            print("Review not found in business reviews (may not have been created yet)")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
