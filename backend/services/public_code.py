"""
Public business/client code generator.

Formats:
  - BV-XXXXX  for businesses (Bookvia)
  - CL-XXXXX  for clients (Cliente)

5 alphanumeric chars, uppercase, no ambiguous characters.
Excluded: 0/O, 1/I/L, S/5 to avoid confusion when dictating by phone.

Combinations: 28^5 = ~17.2M codes per prefix.
"""
import secrets
import logging

logger = logging.getLogger(__name__)

_ALPHABET = "ABCDEFGHJKMNPQRTUVWXYZ234679"  # 28 chars
_BUSINESS_PREFIX = "BV-"
_CLIENT_PREFIX = "CL-"
_LENGTH = 5
_MAX_RETRIES = 8


def _random_body() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(_LENGTH))


async def generate_unique_public_code(db) -> str:
    """Generate a unique BV-XXXXX code for a business."""
    for attempt in range(_MAX_RETRIES):
        code = f"{_BUSINESS_PREFIX}{_random_body()}"
        existing = await db.businesses.find_one({"public_code": code}, {"_id": 1})
        if not existing:
            return code
        logger.warning(f"BV public_code collision attempt {attempt + 1}: {code}")
    raise RuntimeError(f"Could not generate unique BV code after {_MAX_RETRIES} attempts")


async def generate_unique_user_code(db) -> str:
    """Generate a unique CL-XXXXX code for a client/user."""
    for attempt in range(_MAX_RETRIES):
        code = f"{_CLIENT_PREFIX}{_random_body()}"
        existing = await db.users.find_one({"public_code": code}, {"_id": 1})
        if not existing:
            return code
        logger.warning(f"CL public_code collision attempt {attempt + 1}: {code}")
    raise RuntimeError(f"Could not generate unique CL code after {_MAX_RETRIES} attempts")


def is_valid_public_code(code: str) -> bool:
    """Validate format: BV-XXXXX or CL-XXXXX where X in alphabet."""
    if not code or not isinstance(code, str):
        return False
    code = code.strip().upper()
    if not (code.startswith(_BUSINESS_PREFIX) or code.startswith(_CLIENT_PREFIX)):
        return False
    body = code[3:]
    if len(body) != _LENGTH:
        return False
    return all(c in _ALPHABET for c in body)


def normalize_public_code(code: str) -> str:
    """Uppercase + ensure prefix. Defaults to BV- if no prefix and 5 chars."""
    if not code:
        return ""
    code = code.strip().upper().replace(" ", "")
    if not code.startswith((_BUSINESS_PREFIX, _CLIENT_PREFIX)) and len(code) == _LENGTH:
        code = _BUSINESS_PREFIX + code
    return code
