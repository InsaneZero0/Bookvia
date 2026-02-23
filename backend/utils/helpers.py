"""
Helper utilities.
"""
import uuid
import re
import unicodedata
from datetime import datetime, timezone


def generate_id() -> str:
    """Generate a unique ID"""
    return str(uuid.uuid4())


def normalize_text(text: str) -> str:
    """
    Normalize text by removing accents and special characters.
    Examples:
        - "Guadalajara" -> "guadalajara"
        - "Uñas" -> "unas"
        - "México" -> "mexico"
        - "Café" -> "cafe"
    """
    # Normalize unicode characters (NFD separates accents from letters)
    normalized = unicodedata.normalize('NFD', text)
    # Remove accent marks (category 'Mn' = Mark, Nonspacing)
    without_accents = ''.join(c for c in normalized if unicodedata.category(c) != 'Mn')
    # Replace ñ specifically (it survives NFD normalization)
    without_accents = without_accents.replace('ñ', 'n').replace('Ñ', 'N')
    return without_accents.lower()


def generate_slug(name: str) -> str:
    """
    Generate a URL-friendly slug from a name.
    Rules:
        - Lowercase
        - No accents (normalized)
        - Hyphens instead of spaces
        - Only alphanumeric and hyphens
    Examples:
        - "Test Spa & Beauty" -> "test-spa-beauty"
        - "Salón de Uñas María" -> "salon-de-unas-maria"
        - "México City" -> "mexico-city"
    """
    # Normalize (remove accents)
    slug = normalize_text(name)
    # Remove non-alphanumeric except spaces and hyphens
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    # Replace spaces and underscores with hyphens
    slug = re.sub(r'[\s_]+', '-', slug)
    # Remove multiple consecutive hyphens
    slug = re.sub(r'-+', '-', slug)
    return slug.strip('-')


def generate_unique_slug(name: str, existing_slugs: list) -> str:
    """
    Generate a unique slug, adding suffix if collision exists.
    Examples:
        - "test-spa" with existing ["test-spa"] -> "test-spa-2"
        - "test-spa" with existing ["test-spa", "test-spa-2"] -> "test-spa-3"
    """
    base_slug = generate_slug(name)
    if base_slug not in existing_slugs:
        return base_slug
    
    counter = 2
    while f"{base_slug}-{counter}" in existing_slugs:
        counter += 1
    
    return f"{base_slug}-{counter}"


def now_utc() -> datetime:
    """Get current UTC datetime"""
    return datetime.now(timezone.utc)


def now_iso() -> str:
    """Get current UTC datetime as ISO string"""
    return datetime.now(timezone.utc).isoformat()


def amount_to_cents(amount: float) -> int:
    """Convert amount to cents (for ledger)"""
    return int(round(amount * 100))


def cents_to_amount(cents: int) -> float:
    """Convert cents to amount"""
    return cents / 100


def calculate_bayesian_rating(
    rating_sum: float,
    review_count: int,
    global_avg: float = 3.5,
    min_reviews: int = 5
) -> float:
    """Calculate Bayesian average rating"""
    if review_count == 0:
        return 0.0
    return (min_reviews * global_avg + rating_sum) / (min_reviews + review_count)


def safe_int(value, default: int = 0) -> int:
    """Safely convert to int"""
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


def safe_float(value, default: float = 0.0) -> float:
    """Safely convert to float"""
    try:
        return float(value)
    except (ValueError, TypeError):
        return default
