"""
Public business code generator.

Format: BV-XXXXX (5 alphanumeric chars, uppercase, no ambiguous characters)
Excluded: 0/O, 1/I/L, S/5 to avoid confusion when dictating by phone.

Combinations: 28^5 = ~17.2M codes.
"""
import secrets
import logging

logger = logging.getLogger(__name__)

# Letters and digits without ambiguous characters
_ALPHABET = "ABCDEFGHJKMNPQRTUVWXYZ234679"  # 28 chars
_PREFIX = "BV-"
_LENGTH = 5
_MAX_RETRIES = 8


def _random_code() -> str:
    body = "".join(secrets.choice(_ALPHABET) for _ in range(_LENGTH))
    return f"{_PREFIX}{body}"


async def generate_unique_public_code(db) -> str:
    """
    Generate a unique BV-XXXXX code by checking against existing codes.
    Retries on collision. Raises if exhausted (extremely unlikely with 17M space).
    """
    for attempt in range(_MAX_RETRIES):
        code = _random_code()
        existing = await db.businesses.find_one({"public_code": code}, {"_id": 1})
        if not existing:
            return code
        logger.warning(f"public_code collision attempt {attempt + 1}: {code}")
    
    raise RuntimeError(f"Could not generate unique public_code after {_MAX_RETRIES} attempts")


def is_valid_public_code(code: str) -> bool:
    """Validate format: BV-XXXXX where X in alphabet."""
    if not code or not isinstance(code, str):
        return False
    code = code.strip().upper()
    if not code.startswith(_PREFIX):
        return False
    body = code[len(_PREFIX):]
    if len(body) != _LENGTH:
        return False
    return all(c in _ALPHABET for c in body)


def normalize_public_code(code: str) -> str:
    """Uppercase + add BV- prefix if missing."""
    if not code:
        return ""
    code = code.strip().upper().replace(" ", "")
    if not code.startswith(_PREFIX) and len(code) == _LENGTH:
        code = _PREFIX + code
    return code
