"""
Helper utilities.
"""
import uuid
import re
from datetime import datetime, timezone


def generate_id() -> str:
    """Generate a unique ID"""
    return str(uuid.uuid4())


def generate_slug(name: str) -> str:
    """Generate a URL-friendly slug from a name"""
    slug = name.lower()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'[\s_]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    return slug.strip('-')


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
