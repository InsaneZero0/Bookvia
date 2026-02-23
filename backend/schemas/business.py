"""
Business schemas.
"""
from pydantic import BaseModel, ConfigDict, EmailStr
from typing import Optional, List


class BusinessCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: str
    description: str
    category_id: str
    address: str
    city: str
    state: str
    country: str = "MX"
    zip_code: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    timezone: str = "America/Mexico_City"
    # Legal documents
    ine_url: Optional[str] = None
    rfc: str
    proof_of_address_url: Optional[str] = None
    clabe: str
    legal_name: str
    # Business settings
    requires_deposit: bool = False
    deposit_amount: float = 50.0
    min_time_between_appointments: int = 0
    service_radius_km: Optional[float] = None
    plan_type: str = "basic"


class BusinessResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    email: str
    phone: str
    phone_verified: bool = False
    description: str
    category_id: str
    category_name: Optional[str] = None
    address: str
    city: str
    state: str
    country: str
    zip_code: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    timezone: str = "America/Mexico_City"
    status: str = "pending"
    rating: float = 0.0
    review_count: int = 0
    completed_appointments: int = 0
    badges: List[str] = []
    requires_deposit: bool = False
    deposit_amount: float = 50.0
    min_time_between_appointments: int = 0
    photos: List[str] = []
    logo_url: Optional[str] = None
    slug: str
    created_at: str
    is_featured: bool = False
    plan_type: str = "basic"
    trial_ends_at: Optional[str] = None
    can_accept_bookings: bool = True


class BusinessUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    timezone: Optional[str] = None
    requires_deposit: Optional[bool] = None
    deposit_amount: Optional[float] = None
    min_time_between_appointments: Optional[int] = None
    service_radius_km: Optional[float] = None
    photos: Optional[List[str]] = None
    logo_url: Optional[str] = None


class CategoryCreate(BaseModel):
    name_es: str
    name_en: str
    slug: str
    icon: Optional[str] = None
    image_url: Optional[str] = None
    parent_id: Optional[str] = None


class CategoryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name_es: str
    name_en: str
    slug: str
    icon: Optional[str] = None
    image_url: Optional[str] = None
    parent_id: Optional[str] = None
    business_count: int = 0


class SearchQuery(BaseModel):
    q: Optional[str] = None
    category_id: Optional[str] = None
    city: Optional[str] = None
    min_rating: Optional[float] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    sort_by: Optional[str] = "rating"
    page: int = 1
    limit: int = 20
