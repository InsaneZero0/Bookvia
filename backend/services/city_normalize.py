"""Canonical city name normalization.

Bookvia stores `city` on every business as a plain string. Without
normalization the catalog accumulates duplicates like "Nuevo Laredo",
"NUEVO LAREDO", "nuevo laredo", "Ciudad de México" vs "Ciudad de Mexico",
each of which splits search results and confuses the dropdown.

`normalize_city_name(raw, db)` canonicalizes a free-text city against the
seeded `cities` collection:

1. Trim + collapse internal whitespace.
2. Strip diacritics so "México" and "Mexico" match.
3. If a row in `db.cities` matches case + accent-insensitively, return that
   row's `name` (the canonical Title Case spelling from `data/cities.py`).
4. Otherwise return the trimmed input in Title Case (best-effort fallback).

This is intentionally cheap (one indexed regex lookup) and async-safe so it
can be called inline from business register / update / admin migrations.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Optional

_WHITESPACE_RE = re.compile(r"\s+")


def _strip_diacritics(value: str) -> str:
    """Remove accents so "México" → "Mexico" for matching purposes."""
    return "".join(
        ch for ch in unicodedata.normalize("NFKD", value)
        if not unicodedata.combining(ch)
    )


def _strip_and_collapse(value: str) -> str:
    return _WHITESPACE_RE.sub(" ", value.strip())


def city_match_key(value: Optional[str]) -> str:
    """Return the deduplication key for a free-text city string.

    Lowercased, whitespace-collapsed, diacritic-stripped. Two strings that
    return the same key are considered the same city.
    """
    if not value:
        return ""
    return _strip_diacritics(_strip_and_collapse(str(value))).lower()


async def normalize_city_name(raw: Optional[str], db) -> str:
    """Return the canonical city name for `raw`, or an empty string."""
    if not raw:
        return ""
    cleaned = _strip_and_collapse(str(raw))
    if not cleaned:
        return ""
    target_key = city_match_key(cleaned)
    # Pull the small catalog once; ~hundreds of rows so this is cheap and
    # gives us accent-insensitive matching that pure regex can't express.
    candidates = await db.cities.find(
        {},
        {"_id": 0, "name": 1},
    ).to_list(2000)
    for row in candidates:
        if city_match_key(row.get("name")) == target_key:
            return row["name"]
    # Catalog miss — Title Case fallback so future docs at least share casing
    return cleaned.title()
