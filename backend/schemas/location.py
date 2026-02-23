"""
Country and location schemas for multi-country support.
"""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List


class CountryConfig(BaseModel):
    """Country configuration"""
    model_config = ConfigDict(extra="ignore")
    code: str  # ISO 3166-1 alpha-2: "MX", "US", "ES"
    name_es: str
    name_en: str
    currency_code: str  # ISO 4217: "MXN", "USD", "EUR"
    default_language: str = "es"  # "es", "en"
    timezone_default: str  # IANA timezone: "America/Mexico_City"
    phone_prefix: str  # "+52", "+1"
    active: bool = True


class CityResponse(BaseModel):
    """City response"""
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    slug: str
    country_code: str
    state: Optional[str] = None
    business_count: int = 0
    active: bool = True


class CityCreate(BaseModel):
    """City creation"""
    name: str
    slug: Optional[str] = None  # Auto-generated if not provided
    country_code: str = "MX"
    state: Optional[str] = None


# Default countries configuration
DEFAULT_COUNTRIES = [
    {
        "code": "MX",
        "name_es": "México",
        "name_en": "Mexico",
        "currency_code": "MXN",
        "default_language": "es",
        "timezone_default": "America/Mexico_City",
        "phone_prefix": "+52",
        "active": True
    },
    {
        "code": "US",
        "name_es": "Estados Unidos",
        "name_en": "United States",
        "currency_code": "USD",
        "default_language": "en",
        "timezone_default": "America/New_York",
        "phone_prefix": "+1",
        "active": False  # Not active yet
    },
    {
        "code": "ES",
        "name_es": "España",
        "name_en": "Spain",
        "currency_code": "EUR",
        "default_language": "es",
        "timezone_default": "Europe/Madrid",
        "phone_prefix": "+34",
        "active": False  # Not active yet
    }
]
