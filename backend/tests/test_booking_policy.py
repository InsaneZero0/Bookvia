# Test booking policy field (cancellation_days) in business registration
# Tests for iteration 14: Booking policy redesign

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBookingPolicyBackend:
    """Test cancellation_days field in business registration endpoint"""
    
    def test_health_check(self):
        """Verify API is healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✓ API health check passed")
    
    def test_business_register_with_deposit_and_cancellation_days(self):
        """Test business registration with requires_deposit=true and cancellation_days"""
        timestamp = int(time.time() * 1000)
        payload = {
            "name": f"TEST_Spa With Deposit {timestamp}",
            "email": f"test_deposit_{timestamp}@example.com",
            "password": "testpassword123",
            "phone": "+52 55 1234 5678",
            "description": "Test spa with deposit requirement",
            "category_id": "cat-belleza",
            "address": "Calle Test 123",
            "city": "CDMX",
            "state": "Ciudad de México",
            "country": "MX",
            "zip_code": "06000",
            "rfc": "SPP010101AAA",
            "legal_name": "Test Spa SA de CV",
            "clabe": "012345678901234567",
            "requires_deposit": True,
            "deposit_amount": 150,
            "cancellation_days": 3
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/business/register", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "token" in data, "Token not returned"
        assert "business" in data, "Business not returned"
        
        business = data["business"]
        assert business["requires_deposit"] == True, f"Expected requires_deposit=True, got {business['requires_deposit']}"
        assert business["deposit_amount"] == 150.0, f"Expected deposit_amount=150, got {business['deposit_amount']}"
        assert business["cancellation_days"] == 3, f"Expected cancellation_days=3, got {business['cancellation_days']}"
        
        print(f"✓ Business registered with deposit: requires_deposit={business['requires_deposit']}, deposit_amount={business['deposit_amount']}, cancellation_days={business['cancellation_days']}")
    
    def test_business_register_without_deposit_with_cancellation_days(self):
        """Test business registration with requires_deposit=false and cancellation_days"""
        timestamp = int(time.time() * 1000)
        payload = {
            "name": f"TEST_Spa No Deposit {timestamp}",
            "email": f"test_nodeposit_{timestamp}@example.com",
            "password": "testpassword123",
            "phone": "+52 55 9876 5432",
            "description": "Test spa without deposit requirement",
            "category_id": "cat-belleza",
            "address": "Avenida Test 456",
            "city": "Guadalajara",
            "state": "Jalisco",
            "country": "MX",
            "zip_code": "44100",
            "rfc": "TNP010101BBB",
            "legal_name": "Test No Deposit SA de CV",
            "clabe": "012345678901234568",
            "requires_deposit": False,
            "deposit_amount": 50,
            "cancellation_days": 2
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/business/register", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        business = data["business"]
        
        assert business["requires_deposit"] == False, f"Expected requires_deposit=False, got {business['requires_deposit']}"
        assert business["cancellation_days"] == 2, f"Expected cancellation_days=2, got {business['cancellation_days']}"
        
        print(f"✓ Business registered without deposit: requires_deposit={business['requires_deposit']}, cancellation_days={business['cancellation_days']}")
    
    def test_business_register_default_cancellation_days(self):
        """Test that default cancellation_days is 1 when not provided"""
        timestamp = int(time.time() * 1000)
        payload = {
            "name": f"TEST_Spa Default {timestamp}",
            "email": f"test_default_{timestamp}@example.com",
            "password": "testpassword123",
            "phone": "+52 55 1111 2222",
            "description": "Test spa with default cancellation days",
            "category_id": "cat-belleza",
            "address": "Default Street 789",
            "city": "Monterrey",
            "state": "Nuevo León",
            "country": "MX",
            "zip_code": "64000",
            "rfc": "TDF010101CCC",
            "legal_name": "Test Default SA de CV",
            "clabe": "012345678901234569"
            # Not providing cancellation_days - should default to 1
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/business/register", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        business = data["business"]
        
        assert business["cancellation_days"] == 1, f"Expected default cancellation_days=1, got {business['cancellation_days']}"
        assert business["requires_deposit"] == False, f"Expected default requires_deposit=False, got {business['requires_deposit']}"
        
        print(f"✓ Business registered with defaults: cancellation_days={business['cancellation_days']}, requires_deposit={business['requires_deposit']}")

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
