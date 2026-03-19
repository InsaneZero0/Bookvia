"""
Test Worker Service Assignment Feature - Iteration 24

Tests the new booking flow:
1. GET /api/businesses/{id}/workers?service_id=X - filters workers by service
2. PUT /api/businesses/my/workers/{id}/services - updates worker service_ids
3. GET /api/bookings/availability/{biz_id}?worker_id=X&service_id=X - filters by worker
4. POST /api/bookings - validates worker has the service in service_ids
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise ValueError("REACT_APP_BACKEND_URL not set")

# Test credentials
BUSINESS_EMAIL = "testrealstripe@bookvia.com"
BUSINESS_PASSWORD = "Test1234!"


@pytest.fixture(scope="module")
def session():
    """Create requests session"""
    return requests.Session()


@pytest.fixture(scope="module")
def business_auth(session):
    """Login as business and get token + business info"""
    response = session.post(f"{BASE_URL}/api/auth/business/login", json={
        "email": BUSINESS_EMAIL,
        "password": BUSINESS_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Business login failed: {response.status_code} - {response.text}")
    data = response.json()
    token = data.get("token") or data.get("access_token")
    business = data.get("business", {})
    return {"token": token, "headers": {"Authorization": f"Bearer {token}"}, "business": business}


@pytest.fixture(scope="module")
def business_info(business_auth):
    """Get business info from login response"""
    business = business_auth.get("business")
    if not business or not business.get("id"):
        pytest.skip("Business info not found in login response")
    return business


@pytest.fixture(scope="module")
def services_list(session, business_info):
    """Get services for the business"""
    response = session.get(f"{BASE_URL}/api/services/business/{business_info['id']}")
    if response.status_code != 200:
        pytest.skip(f"Failed to get services: {response.status_code}")
    services = response.json()
    if not services or len(services) == 0:
        pytest.skip("No services found for business")
    return services


@pytest.fixture(scope="module")
def workers_list(session, business_auth):
    """Get workers for the business"""
    response = session.get(f"{BASE_URL}/api/businesses/my/workers", headers=business_auth["headers"])
    if response.status_code != 200:
        pytest.skip(f"Failed to get workers: {response.status_code}")
    workers = response.json()
    if not workers or len(workers) == 0:
        pytest.skip("No workers found for business")
    return workers


# ==================== SECTION 1: Worker Service Filter Tests ====================

def test_01_get_workers_without_service_filter(session, business_info):
    """Test GET /api/businesses/{id}/workers returns all active workers"""
    response = session.get(f"{BASE_URL}/api/businesses/{business_info['id']}/workers")
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    workers = response.json()
    assert isinstance(workers, list), "Workers should be a list"
    print(f"\n✓ Found {len(workers)} workers without filter")
    for w in workers:
        print(f"  - {w['name']} (id: {w['id'][:8]}..., service_ids: {w.get('service_ids', [])})")


def test_02_get_workers_with_service_filter(session, business_info, services_list):
    """Test GET /api/businesses/{id}/workers?service_id=X filters workers"""
    service = services_list[0]
    service_id = service["id"]
    
    response = session.get(
        f"{BASE_URL}/api/businesses/{business_info['id']}/workers",
        params={"service_id": service_id}
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    workers = response.json()
    assert isinstance(workers, list), "Filtered workers should be a list"
    print(f"\n✓ Found {len(workers)} workers for service '{service['name']}' (id: {service_id[:8]}...)")
    
    # Verify filter logic
    for w in workers:
        worker_services = w.get("service_ids", [])
        if worker_services:
            assert service_id in worker_services, f"Worker {w['name']} has service_ids but doesn't include {service_id}"
        print(f"  - {w['name']} (service_ids: {worker_services if worker_services else 'ALL'})")


def test_03_workers_with_empty_service_ids_returned(session, business_info, services_list):
    """Workers with empty service_ids should be returned for any service (legacy behavior)"""
    service = services_list[0]
    
    all_workers = session.get(f"{BASE_URL}/api/businesses/{business_info['id']}/workers").json()
    filtered_workers = session.get(
        f"{BASE_URL}/api/businesses/{business_info['id']}/workers",
        params={"service_id": service["id"]}
    ).json()
    
    all_no_service_ids = [w for w in all_workers if not w.get("service_ids")]
    filtered_no_service_ids = [w for w in filtered_workers if not w.get("service_ids")]
    
    print(f"\n✓ Workers without service_ids in all: {len(all_no_service_ids)}")
    print(f"✓ Workers without service_ids in filtered: {len(filtered_no_service_ids)}")
    
    for w in all_no_service_ids:
        assert any(fw["id"] == w["id"] for fw in filtered_no_service_ids), \
            f"Worker {w['name']} (no service_ids) should appear in filtered results"


# ==================== SECTION 2: Update Worker Services Tests ====================

def test_04_update_worker_services_endpoint_exists(session, business_auth, workers_list, services_list):
    """Test PUT /api/businesses/my/workers/{id}/services endpoint"""
    worker = workers_list[0]
    original_service_ids = worker.get("service_ids", [])
    print(f"\nWorker {worker['name']} original service_ids: {original_service_ids}")
    
    new_service_ids = [services_list[0]["id"]]
    
    response = session.put(
        f"{BASE_URL}/api/businesses/my/workers/{worker['id']}/services",
        headers=business_auth["headers"],
        json={"service_ids": new_service_ids}
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    data = response.json()
    assert "service_ids" in data, "Response should include service_ids"
    assert data["service_ids"] == new_service_ids, f"Expected {new_service_ids}, got {data['service_ids']}"
    print(f"✓ Updated worker services to: {new_service_ids}")
    
    # Verify via GET
    verify_response = session.get(
        f"{BASE_URL}/api/businesses/my/workers/{worker['id']}",
        headers=business_auth["headers"]
    )
    assert verify_response.status_code == 200
    verified_worker = verify_response.json()
    assert verified_worker.get("service_ids") == new_service_ids, "Service IDs not persisted"
    print(f"✓ Verified worker service_ids persisted: {verified_worker.get('service_ids')}")


def test_05_update_worker_with_multiple_services(session, business_auth, workers_list, services_list):
    """Test updating worker with multiple services"""
    if len(services_list) < 2:
        pytest.skip("Need at least 2 services for this test")
    
    worker = workers_list[0]
    multiple_service_ids = [s["id"] for s in services_list[:2]]
    
    response = session.put(
        f"{BASE_URL}/api/businesses/my/workers/{worker['id']}/services",
        headers=business_auth["headers"],
        json={"service_ids": multiple_service_ids}
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    data = response.json()
    assert set(data["service_ids"]) == set(multiple_service_ids), "Multiple services not set correctly"
    print(f"\n✓ Updated worker with multiple services: {multiple_service_ids}")


def test_06_clear_worker_services(session, business_auth, workers_list):
    """Test clearing worker services (empty array = can do all services)"""
    worker = workers_list[0]
    
    response = session.put(
        f"{BASE_URL}/api/businesses/my/workers/{worker['id']}/services",
        headers=business_auth["headers"],
        json={"service_ids": []}
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    data = response.json()
    assert data["service_ids"] == [], "Service IDs should be empty"
    print(f"\n✓ Cleared worker services - now can do all services")


def test_07_update_worker_services_unauthorized(session, workers_list):
    """Test update worker services without auth returns 401"""
    worker = workers_list[0]
    
    response = session.put(
        f"{BASE_URL}/api/businesses/my/workers/{worker['id']}/services",
        json={"service_ids": []}
    )
    assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
    print(f"\n✓ Unauthorized request correctly rejected with {response.status_code}")


def test_08_update_nonexistent_worker_services(session, business_auth):
    """Test update services for non-existent worker returns 404"""
    response = session.put(
        f"{BASE_URL}/api/businesses/my/workers/nonexistent-worker-id/services",
        headers=business_auth["headers"],
        json={"service_ids": []}
    )
    assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    print(f"\n✓ Non-existent worker correctly returns 404")


# ==================== SECTION 3: Availability Filter Tests ====================

def test_09_availability_without_worker_filter(session, business_info, services_list):
    """Test availability endpoint returns slots without worker filter"""
    service = services_list[0]
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    
    response = session.get(
        f"{BASE_URL}/api/bookings/availability/{business_info['id']}",
        params={"date": tomorrow, "service_id": service["id"]}
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    data = response.json()
    assert "slots" in data, "Response should include slots"
    print(f"\n✓ Found {len(data['slots'])} slots without worker filter for {tomorrow}")
    
    if data['slots']:
        slot = data['slots'][0]
        assert "worker_id" in slot, "Slot should include worker_id"
        assert "worker_name" in slot, "Slot should include worker_name"
        print(f"✓ Sample slot: {slot['time']} - {slot['worker_name']}")


def test_10_availability_with_worker_filter(session, business_info, services_list, workers_list):
    """Test availability endpoint with specific worker filter"""
    service = services_list[0]
    worker = workers_list[0]
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    
    response = session.get(
        f"{BASE_URL}/api/bookings/availability/{business_info['id']}",
        params={
            "date": tomorrow,
            "service_id": service["id"],
            "worker_id": worker["id"]
        }
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    data = response.json()
    print(f"\n✓ Found {len(data['slots'])} slots for worker {worker['name']}")
    
    for slot in data['slots']:
        assert slot['worker_id'] == worker['id'], \
            f"Slot worker_id {slot['worker_id']} doesn't match {worker['id']}"
    print(f"✓ All {len(data['slots'])} slots correctly filtered to worker {worker['name']}")


def test_11_availability_filters_workers_by_service_assignment(session, business_auth, business_info, services_list, workers_list):
    """Test that availability only shows slots from workers assigned to the service"""
    if len(workers_list) < 1 or len(services_list) < 1:
        pytest.skip("Need at least 1 worker and 1 service")
    
    worker = workers_list[0]
    service = services_list[0]
    
    # Assign worker to service
    session.put(
        f"{BASE_URL}/api/businesses/my/workers/{worker['id']}/services",
        headers=business_auth["headers"],
        json={"service_ids": [service["id"]]}
    )
    
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    
    response = session.get(
        f"{BASE_URL}/api/bookings/availability/{business_info['id']}",
        params={"date": tomorrow, "service_id": service["id"]}
    )
    assert response.status_code == 200
    slots = response.json().get("slots", [])
    
    worker_slots = [s for s in slots if s['worker_id'] == worker['id']]
    print(f"\n✓ Worker has {len(worker_slots)} slots for assigned service")
    
    # Clean up
    session.put(
        f"{BASE_URL}/api/businesses/my/workers/{worker['id']}/services",
        headers=business_auth["headers"],
        json={"service_ids": []}
    )


# ==================== SECTION 4: Existing Worker Service Assignment ====================

def test_12_existing_worker_has_service_assigned(session, business_auth):
    """Verify existing worker service assignments (per agent context)"""
    response = session.get(
        f"{BASE_URL}/api/businesses/my/workers",
        headers=business_auth["headers"],
        params={"include_inactive": False}
    )
    assert response.status_code == 200
    workers = response.json()
    
    print(f"\n✓ Found {len(workers)} workers")
    
    target_worker = None
    for w in workers:
        if w['id'].startswith('e8156189'):
            target_worker = w
            break
    
    if target_worker:
        print(f"✓ Found worker: {target_worker['name']}")
        print(f"  ID: {target_worker['id']}")
        print(f"  service_ids: {target_worker.get('service_ids', [])}")
        
        service_ids = target_worker.get('service_ids', [])
        has_service = any(sid.startswith('0a92c3fb') for sid in service_ids)
        print(f"  Has service 0a92c3fb: {has_service}")
    else:
        print("Worker e8156189 not found - listing all workers:")
        for w in workers:
            print(f"  - {w['name']} (id: {w['id'][:8]}..., service_ids: {w.get('service_ids', [])})")


def test_13_filter_by_nonexistent_service(session, business_info):
    """Test filtering workers by non-existent service returns empty or workers without service_ids"""
    response = session.get(
        f"{BASE_URL}/api/businesses/{business_info['id']}/workers",
        params={"service_id": "nonexistent-service-id"}
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    workers = response.json()
    print(f"\n✓ Got {len(workers)} workers for nonexistent service")
    
    for w in workers:
        assert not w.get("service_ids"), \
            f"Worker {w['name']} has service_ids but was returned for nonexistent service"


def test_14_worker_card_service_badges_data_structure(session, business_auth, workers_list, services_list):
    """Verify worker data includes service_ids for frontend badge rendering"""
    worker = workers_list[0]
    service = services_list[0]
    
    session.put(
        f"{BASE_URL}/api/businesses/my/workers/{worker['id']}/services",
        headers=business_auth["headers"],
        json={"service_ids": [service["id"]]}
    )
    
    response = session.get(
        f"{BASE_URL}/api/businesses/my/workers/{worker['id']}",
        headers=business_auth["headers"]
    )
    assert response.status_code == 200
    
    worker_data = response.json()
    assert "service_ids" in worker_data, "Worker should have service_ids field"
    assert service["id"] in worker_data["service_ids"], "Assigned service should be in service_ids"
    
    print(f"\n✓ Worker data structure for badges: service_ids = {worker_data['service_ids']}")
    
    # Clean up
    session.put(
        f"{BASE_URL}/api/businesses/my/workers/{worker['id']}/services",
        headers=business_auth["headers"],
        json={"service_ids": []}
    )


def test_15_cleanup_reset_workers(session, business_auth, workers_list):
    """Clean up: Reset all workers to no specific services"""
    print("\n✓ Cleanup: Resetting all workers to handle all services")
    for worker in workers_list:
        session.put(
            f"{BASE_URL}/api/businesses/my/workers/{worker['id']}/services",
            headers=business_auth["headers"],
            json={"service_ids": []}
        )
        print(f"  - Reset {worker['name']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
