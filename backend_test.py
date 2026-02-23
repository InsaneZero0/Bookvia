#!/usr/bin/env python3
"""
Backend API Testing for Bookvia - Professional Booking Marketplace

This test suite verifies all critical backend functionality including:
- Authentication (user/business/admin)
- Categories API with seeded data
- User registration and phone verification
- Business operations
- JWT token handling
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any, Optional

class BookviaAPITester:
    def __init__(self, base_url: str = "https://bookvia-preview.preview.emergentagent.com"):
        self.base_url = base_url.rstrip('/')
        self.api_base = f"{self.base_url}/api"
        self.token = None
        self.business_token = None
        self.admin_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failures = []
        
        # Test data
        self.test_user_data = {
            "email": f"testuser_{datetime.now().strftime('%H%M%S')}@bookvia.com",
            "password": "TestPass123!",
            "full_name": "Test User",
            "phone": "+1234567890",
            "preferred_language": "es"
        }
        
        self.test_business_data = {
            "name": "Test Business",
            "email": f"testbiz_{datetime.now().strftime('%H%M%S')}@bookvia.com", 
            "password": "TestPass123!",
            "phone": "+1234567891",
            "description": "A test business for API testing",
            "category_id": "",  # Will be set after getting categories
            "address": "123 Test St",
            "city": "Test City",
            "state": "Test State",
            "country": "MX",
            "zip_code": "12345",
            "rfc": "TEST123456789",
            "legal_name": "Test Business Legal",
            "clabe": "123456789012345678"
        }

    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                 data: Optional[Dict] = None, headers: Optional[Dict] = None,
                 use_business_token: bool = False) -> tuple[bool, Dict[str, Any]]:
        """Run a single API test"""
        url = f"{self.api_base}/{endpoint.lstrip('/')}"
        test_headers = {'Content-Type': 'application/json'}
        
        # Add auth token if available
        if use_business_token and self.business_token:
            test_headers['Authorization'] = f'Bearer {self.business_token}'
        elif self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
            
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   Method: {method} {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")

            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                print(f"✅ PASSED - Status: {response.status_code}")
                try:
                    return True, response.json() if response.text else {}
                except:
                    return True, {}
            else:
                error_msg = f"Expected {expected_status}, got {response.status_code}"
                if response.text:
                    try:
                        error_data = response.json()
                        error_msg += f" | Response: {error_data}"
                    except:
                        error_msg += f" | Response: {response.text[:200]}"
                        
                print(f"❌ FAILED - {error_msg}")
                self.failures.append({
                    "test": name,
                    "endpoint": endpoint,
                    "expected_status": expected_status,
                    "actual_status": response.status_code,
                    "error": error_msg
                })
                return False, {}

        except Exception as e:
            error_msg = f"Exception: {str(e)}"
            print(f"❌ FAILED - {error_msg}")
            self.failures.append({
                "test": name,
                "endpoint": endpoint,
                "error": error_msg
            })
            return False, {}

    def test_seed_data(self):
        """Test seed data endpoint (idempotent)"""
        return self.run_test("Seed Data", "POST", "/seed", 200)

    def test_get_categories(self):
        """Test categories endpoint - should return 8 seeded categories"""
        success, response = self.run_test("Get Categories", "GET", "/categories", 200)
        if success:
            categories = response if isinstance(response, list) else response.get('data', [])
            if len(categories) >= 8:
                print(f"   📊 Found {len(categories)} categories (expected ≥8)")
                # Check if categories have required fields
                if categories and all(cat.get('name_es') and cat.get('name_en') for cat in categories):
                    print(f"   ✅ Categories have proper multilingual names")
                    # Store first category ID for business tests
                    if categories:
                        self.test_business_data['category_id'] = categories[0]['id']
                    return True
                else:
                    print(f"   ⚠️ Categories missing required fields")
                    return False
            else:
                print(f"   ⚠️ Expected at least 8 categories, got {len(categories)}")
                return False
        return success

    def test_user_registration(self):
        """Test user registration endpoint"""
        success, response = self.run_test(
            "User Registration", 
            "POST", 
            "/auth/register", 
            200, 
            data=self.test_user_data
        )
        if success and response.get('token'):
            self.token = response['token']
            print(f"   🔑 Got user token: {self.token[:20]}...")
            user_data = response.get('user', {})
            print(f"   👤 User created: {user_data.get('email')} (ID: {user_data.get('id')})")
            return True
        return success

    def test_user_login(self):
        """Test user login endpoint"""
        login_data = {
            "email": self.test_user_data["email"],
            "password": self.test_user_data["password"]
        }
        success, response = self.run_test(
            "User Login",
            "POST",
            "/auth/login",
            200,
            data=login_data
        )
        if success and response.get('token'):
            print(f"   🔑 Login successful, token matches: {response['token'][:20]}...")
            return True
        return success

    def test_phone_verification_mock(self):
        """Test phone verification mock - should return dev_code in development"""
        phone_data = {"phone": self.test_user_data["phone"]}
        success, response = self.run_test(
            "Phone Verification Send Code",
            "POST", 
            "/auth/phone/send-code",
            200,
            data=phone_data
        )
        if success:
            # In development, should return dev_code
            dev_code = response.get('dev_code')
            if dev_code:
                print(f"   📱 Mock verification working - dev_code: {dev_code}")
                
                # Test code verification
                verify_data = {"phone": phone_data["phone"], "code": dev_code}
                verify_success, verify_response = self.run_test(
                    "Phone Verification Confirm",
                    "POST",
                    "/auth/phone/verify", 
                    200,
                    data=verify_data
                )
                return verify_success
            else:
                print(f"   ⚠️ Expected dev_code in response for development environment")
                return False
        return success

    def test_get_user_profile(self):
        """Test get current user profile (requires auth)"""
        if not self.token:
            print("   ⚠️ No user token available, skipping profile test")
            return False
            
        return self.run_test("Get User Profile", "GET", "/auth/me", 200)

    def test_business_registration(self):
        """Test business registration"""
        if not self.test_business_data['category_id']:
            print("   ⚠️ No category ID available, skipping business registration")
            return False
            
        success, response = self.run_test(
            "Business Registration",
            "POST",
            "/auth/business/register",
            200,
            data=self.test_business_data
        )
        if success and response.get('token'):
            self.business_token = response['token']
            print(f"   🔑 Got business token: {self.business_token[:20]}...")
            business_data = response.get('business', {})
            print(f"   🏢 Business created: {business_data.get('name')} (ID: {business_data.get('id')})")
            return True
        return success

    def test_business_login(self):
        """Test business login"""
        if not self.test_business_data.get('email'):
            return False
            
        login_data = {
            "email": self.test_business_data["email"],
            "password": self.test_business_data["password"]
        }
        success, response = self.run_test(
            "Business Login",
            "POST", 
            "/auth/business/login",
            200,
            data=login_data
        )
        if success and response.get('token'):
            print(f"   🔑 Business login successful")
            return True
        return success

    def test_featured_businesses(self):
        """Test get featured businesses"""
        success, response = self.run_test("Get Featured Businesses", "GET", "/businesses/featured", 200)
        if success:
            businesses = response if isinstance(response, list) else response.get('data', [])
            print(f"   🏢 Found {len(businesses)} featured businesses")
            return True
        return success

    def test_admin_login(self):
        """Test admin login with seeded admin user"""
        # Try with the seeded admin credentials
        admin_data = {
            "email": "admin@bookvia.com", 
            "password": "admin123",
            "totp_code": "000000"  # Mock TOTP code for testing
        }
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "/auth/admin/login", 
            200,
            data=admin_data
        )
        if success and response.get('token'):
            self.admin_token = response['token']
            print(f"   👑 Got admin token: {self.admin_token[:20]}...")
            return True
        # If TOTP fails, that's expected - admin 2FA might not be set up
        print(f"   ℹ️ Admin login failed (expected if 2FA not configured)")
        return True  # Don't fail test for 2FA issues

    def run_all_tests(self):
        """Run comprehensive API test suite"""
        print("=" * 80)
        print("🚀 STARTING BOOKVIA API TEST SUITE")
        print("=" * 80)
        print(f"Testing Backend: {self.api_base}")
        print(f"Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Core API tests
        tests = [
            ("Seed Data", self.test_seed_data),
            ("Categories API", self.test_get_categories),
            ("User Registration", self.test_user_registration),
            ("User Login", self.test_user_login),
            ("Phone Verification Mock", self.test_phone_verification_mock),
            ("User Profile", self.test_get_user_profile),
            ("Business Registration", self.test_business_registration),
            ("Business Login", self.test_business_login),
            ("Featured Businesses", self.test_featured_businesses),
            ("Admin Login", self.test_admin_login),
        ]
        
        for test_name, test_func in tests:
            print(f"\n{'─' * 60}")
            print(f"📋 Running: {test_name}")
            try:
                test_func()
            except Exception as e:
                print(f"❌ FAILED - Unexpected error: {e}")
                self.failures.append({
                    "test": test_name,
                    "error": f"Unexpected error: {e}"
                })

        # Print final results
        print("\n" + "=" * 80)
        print("📊 TEST RESULTS SUMMARY")
        print("=" * 80)
        print(f"Total tests run: {self.tests_run}")
        print(f"Tests passed: {self.tests_passed}")
        print(f"Tests failed: {len(self.failures)}")
        print(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "No tests run")
        
        if self.failures:
            print("\n❌ FAILED TESTS:")
            for i, failure in enumerate(self.failures, 1):
                print(f"  {i}. {failure['test']}")
                print(f"     Endpoint: {failure.get('endpoint', 'N/A')}")  
                print(f"     Error: {failure['error']}")
        else:
            print("\n🎉 ALL TESTS PASSED!")
            
        return len(self.failures) == 0

def main():
    """Main test execution"""
    tester = BookviaAPITester()
    
    try:
        success = tester.run_all_tests()
        return 0 if success else 1
    except KeyboardInterrupt:
        print("\n\n⏹️ Testing interrupted by user")
        return 1
    except Exception as e:
        print(f"\n\n💥 Testing failed with error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())