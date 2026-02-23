"""
SEO Router - Sitemap, robots.txt, and dynamic meta tags.

Public routes (served from root, no /api prefix):
- GET /sitemap.xml
- GET /robots.txt

API routes (prefixed with /api):
- GET /api/seo/meta/{page_type}/{slug}
- GET /api/seo/cities/{country_code}
- GET /api/seo/countries
"""
from fastapi import APIRouter, Request
from fastapi.responses import Response, PlainTextResponse
from datetime import datetime, timezone
from typing import Optional, List
import xml.etree.ElementTree as ET
import os

from motor.motor_asyncio import AsyncIOMotorClient

# Use server.py's db connection since we're still transitioning
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
db_name = os.environ.get('DB_NAME', 'test_database')
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

ENV = os.environ.get('ENV', 'development')
IS_PRODUCTION = ENV == 'production'

seo_router = APIRouter(tags=["SEO"])

# Base URL for sitemap
BASE_URL = "https://bookvia.com"  # Will be overridden by request host in production


def get_base_url(request: Request) -> str:
    """Get base URL from request"""
    if IS_PRODUCTION:
        return f"https://{request.headers.get('host', 'bookvia.com')}"
    return str(request.base_url).rstrip('/')


async def generate_sitemap_xml(base_url: str) -> str:
    """
    Generate dynamic sitemap.xml with all pages.
    
    Structure:
    - /{country} (country home)
    - /{country}/{city} (city home)
    - /{country}/{city}/{category} (category listing)
    - /{country}/{city}/{business-slug} (business detail)
    """
    # Create root element
    urlset = ET.Element("urlset")
    urlset.set("xmlns", "http://www.sitemaps.org/schemas/sitemap/0.9")
    
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Get active countries
    countries = await db.countries.find({"active": True}, {"_id": 0}).to_list(100)
    if not countries:
        countries = [{"code": "MX"}]  # Default to Mexico
    
    for country in countries:
        country_code = country["code"].lower()
        
        # Country home page
        url = ET.SubElement(urlset, "url")
        ET.SubElement(url, "loc").text = f"{base_url}/{country_code}"
        ET.SubElement(url, "lastmod").text = now
        ET.SubElement(url, "changefreq").text = "daily"
        ET.SubElement(url, "priority").text = "1.0"
        
        # Get cities for this country
        cities = await db.cities.find(
            {"country_code": country_code.upper(), "active": True},
            {"_id": 0}
        ).to_list(500)
        
        for city in cities:
            city_slug = city.get("slug", city["name"].lower().replace(" ", "-"))
            
            # City home page
            url = ET.SubElement(urlset, "url")
            ET.SubElement(url, "loc").text = f"{base_url}/{country_code}/{city_slug}"
            ET.SubElement(url, "lastmod").text = now
            ET.SubElement(url, "changefreq").text = "daily"
            ET.SubElement(url, "priority").text = "0.9"
            
            # Get categories
            categories = await db.categories.find({"active": {"$ne": False}}, {"_id": 0}).to_list(100)
            
            for category in categories:
                cat_slug = category.get("slug", "")
                if cat_slug:
                    # Category listing page
                    url = ET.SubElement(urlset, "url")
                    ET.SubElement(url, "loc").text = f"{base_url}/{country_code}/{city_slug}/{cat_slug}"
                    ET.SubElement(url, "lastmod").text = now
                    ET.SubElement(url, "changefreq").text = "daily"
                    ET.SubElement(url, "priority").text = "0.8"
        
        # Get businesses for this country
        businesses = await db.businesses.find(
            {"country_code": country_code.upper(), "status": "approved"},
            {"_id": 0, "slug": 1, "city": 1, "updated_at": 1, "created_at": 1}
        ).to_list(10000)
        
        for biz in businesses:
            if biz.get("slug"):
                city_slug = biz.get("city", "").lower().replace(" ", "-")
                biz_updated = biz.get("updated_at", biz.get("created_at", now))
                if isinstance(biz_updated, str):
                    biz_updated = biz_updated[:10]
                else:
                    biz_updated = now
                
                # Business detail page
                url = ET.SubElement(urlset, "url")
                ET.SubElement(url, "loc").text = f"{base_url}/{country_code}/{city_slug}/{biz['slug']}"
                ET.SubElement(url, "lastmod").text = biz_updated
                ET.SubElement(url, "changefreq").text = "weekly"
                ET.SubElement(url, "priority").text = "0.7"
    
    # Convert to string
    return ET.tostring(urlset, encoding="unicode", xml_declaration=True)


@seo_router.get("/sitemap.xml", response_class=Response)
async def get_sitemap(request: Request):
    """Generate and return sitemap.xml"""
    base_url = get_base_url(request)
    xml_content = await generate_sitemap_xml(base_url)
    return Response(
        content=xml_content,
        media_type="application/xml",
        headers={"Cache-Control": "public, max-age=3600"}  # Cache 1 hour
    )


@seo_router.get("/robots.txt", response_class=PlainTextResponse)
async def get_robots(request: Request):
    """Generate robots.txt"""
    base_url = get_base_url(request)
    
    content = f"""# Bookvia Robots.txt
User-agent: *
Allow: /

# Sitemap
Sitemap: {base_url}/sitemap.xml

# Disallow admin and API
Disallow: /admin
Disallow: /api/
Disallow: /dashboard
Disallow: /business/dashboard
Disallow: /business/finance
Disallow: /business/team

# Disallow auth pages
Disallow: /login
Disallow: /register
Disallow: /business/register

# Allow SEO pages
Allow: /mx/
Allow: /us/
Allow: /es/
"""
    return PlainTextResponse(
        content=content,
        headers={"Cache-Control": "public, max-age=86400"}  # Cache 24 hours
    )


@seo_router.get("/api/seo/meta/{page_type}/{slug}")
async def get_page_meta(page_type: str, slug: str, country: str = "mx", city: Optional[str] = None):
    """
    Get dynamic meta tags for a page.
    
    page_type: "country", "city", "category", "business"
    slug: The slug of the entity
    """
    meta = {
        "title": "Bookvia - Reserva servicios profesionales",
        "description": "Encuentra y reserva los mejores servicios profesionales cerca de ti.",
        "og_title": "Bookvia",
        "og_description": "Reserva servicios profesionales",
        "og_image": "/og-default.png",
        "canonical": f"/{country}",
        "keywords": "reservas, citas, servicios, profesionales"
    }
    
    country_upper = country.upper()
    
    if page_type == "country":
        country_doc = await db.countries.find_one({"code": country_upper}, {"_id": 0})
        if country_doc:
            country_name = country_doc.get("name_es", country_upper)
            meta.update({
                "title": f"Bookvia {country_name} - Reserva servicios profesionales",
                "description": f"Encuentra y reserva los mejores servicios profesionales en {country_name}.",
                "og_title": f"Bookvia {country_name}",
                "og_description": f"Reserva servicios profesionales en {country_name}",
                "canonical": f"/{country}",
                "keywords": f"reservas, citas, servicios, {country_name}"
            })
    
    elif page_type == "city":
        city_doc = await db.cities.find_one({"slug": slug, "country_code": country_upper}, {"_id": 0})
        if city_doc:
            city_name = city_doc.get("name", slug)
            meta.update({
                "title": f"Servicios profesionales en {city_name} | Bookvia",
                "description": f"Reserva citas con los mejores profesionales en {city_name}. Belleza, salud, bienestar y más.",
                "og_title": f"Bookvia {city_name}",
                "og_description": f"Servicios profesionales en {city_name}",
                "canonical": f"/{country}/{slug}",
                "keywords": f"reservas {city_name}, citas {city_name}, servicios {city_name}"
            })
    
    elif page_type == "category":
        category = await db.categories.find_one({"slug": slug}, {"_id": 0})
        if category:
            cat_name = category.get("name_es", slug)
            city_name = city or "tu ciudad"
            meta.update({
                "title": f"{cat_name} en {city_name} | Bookvia",
                "description": f"Encuentra los mejores servicios de {cat_name.lower()} en {city_name}. Reserva online fácil y rápido.",
                "og_title": f"{cat_name} - Bookvia",
                "og_description": f"Servicios de {cat_name.lower()} en {city_name}",
                "canonical": f"/{country}/{city}/{slug}" if city else f"/{country}/categorias/{slug}",
                "keywords": f"{cat_name.lower()}, {city_name}, reservas, citas"
            })
    
    elif page_type == "business":
        business = await db.businesses.find_one({"slug": slug}, {"_id": 0})
        if business:
            biz_name = business.get("name", slug)
            biz_city = business.get("city", "")
            biz_desc = business.get("description", "")[:160]
            meta.update({
                "title": f"{biz_name} - {biz_city} | Bookvia",
                "description": biz_desc or f"Reserva una cita en {biz_name}, {biz_city}. Agenda online fácil y rápido.",
                "og_title": biz_name,
                "og_description": biz_desc or f"Reserva en {biz_name}",
                "og_image": business.get("logo_url") or business.get("photos", [None])[0] or "/og-default.png",
                "canonical": f"/{country}/{biz_city.lower().replace(' ', '-')}/{slug}",
                "keywords": f"{biz_name}, {biz_city}, reservas, citas"
            })
    
    return meta


@seo_router.get("/api/seo/cities/{country_code}")
async def get_cities_for_country(country_code: str):
    """Get all cities for a country (for sitemap/navigation)"""
    cities = await db.cities.find(
        {"country_code": country_code.upper(), "active": True},
        {"_id": 0}
    ).sort("business_count", -1).to_list(500)
    return cities


@seo_router.get("/api/seo/countries")
async def get_active_countries():
    """Get all active countries"""
    countries = await db.countries.find({"active": True}, {"_id": 0}).to_list(100)
    if not countries:
        # Return default Mexico if no countries configured
        return [{
            "code": "MX",
            "name_es": "México",
            "name_en": "Mexico",
            "currency_code": "MXN",
            "default_language": "es",
            "timezone_default": "America/Mexico_City",
            "phone_prefix": "+52",
            "active": True
        }]
    return countries
