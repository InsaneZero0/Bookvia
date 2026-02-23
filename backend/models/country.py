"""
Country model for multi-country support.
Default country: Mexico (MX)
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List


class CountryBase(BaseModel):
    """Base country model"""
    code: str = Field(..., min_length=2, max_length=2, description="ISO 3166-1 alpha-2")
    name_es: str
    name_en: str
    currency_code: str = Field(default="MXN", description="ISO 4217 currency code")
    default_language: str = "es"
    timezone_default: str = "America/Mexico_City"
    phone_prefix: str = "+52"
    active: bool = True


class CountryCreate(CountryBase):
    """Create a new country"""
    pass


class CountryResponse(CountryBase):
    """Country response model"""
    model_config = ConfigDict(extra="ignore")


class CityBase(BaseModel):
    """Base city model"""
    country_code: str = "MX"
    name: str
    slug: str
    state: Optional[str] = None
    timezone: Optional[str] = None
    active: bool = True
    business_count: int = 0


class CityCreate(CityBase):
    """Create a new city"""
    pass


class CityResponse(CityBase):
    """City response model"""
    model_config = ConfigDict(extra="ignore")


# Default countries to seed
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
    }
]

# Default Mexican cities to seed
DEFAULT_CITIES_MX = [
    {"country_code": "MX", "name": "Ciudad de México", "slug": "cdmx", "state": "CDMX", "timezone": "America/Mexico_City"},
    {"country_code": "MX", "name": "Guadalajara", "slug": "guadalajara", "state": "Jalisco", "timezone": "America/Mexico_City"},
    {"country_code": "MX", "name": "Monterrey", "slug": "monterrey", "state": "Nuevo León", "timezone": "America/Monterrey"},
    {"country_code": "MX", "name": "Puebla", "slug": "puebla", "state": "Puebla", "timezone": "America/Mexico_City"},
    {"country_code": "MX", "name": "Tijuana", "slug": "tijuana", "state": "Baja California", "timezone": "America/Tijuana"},
    {"country_code": "MX", "name": "León", "slug": "leon", "state": "Guanajuato", "timezone": "America/Mexico_City"},
    {"country_code": "MX", "name": "Cancún", "slug": "cancun", "state": "Quintana Roo", "timezone": "America/Cancun"},
    {"country_code": "MX", "name": "Mérida", "slug": "merida", "state": "Yucatán", "timezone": "America/Merida"},
    {"country_code": "MX", "name": "Querétaro", "slug": "queretaro", "state": "Querétaro", "timezone": "America/Mexico_City"},
    {"country_code": "MX", "name": "San Luis Potosí", "slug": "san-luis-potosi", "state": "San Luis Potosí", "timezone": "America/Mexico_City"},
]
