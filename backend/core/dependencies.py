"""
FastAPI dependencies for authentication and authorization.
"""
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, List

from core.security import decode_token, TokenData
from core.database import db
from models.enums import UserRole

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Optional[TokenData]:
    if not credentials:
        return None
    return decode_token(credentials.credentials)


async def require_auth(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> TokenData:
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    token_data = decode_token(credentials.credentials)
    if not token_data:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return token_data


async def require_admin(token_data: TokenData = Depends(require_auth)) -> TokenData:
    if token_data.role not in [UserRole.ADMIN, UserRole.STAFF]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return token_data


async def require_super_admin(token_data: TokenData = Depends(require_auth)) -> TokenData:
    if token_data.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Super admin access required")
    return token_data


async def require_business(token_data: TokenData = Depends(require_auth)) -> TokenData:
    if token_data.role not in [UserRole.BUSINESS, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Business access required")
    return token_data


async def check_staff_permission(token_data: TokenData, permission: str):
    """Check if staff user has a specific permission. Super admin bypasses all checks."""
    if token_data.role == UserRole.ADMIN:
        return True
    if token_data.role == UserRole.STAFF:
        user = await db.users.find_one({"id": token_data.user_id}, {"_id": 0, "staff_permissions": 1})
        if user and permission in (user.get("staff_permissions") or []):
            return True
        raise HTTPException(status_code=403, detail=f"Permission '{permission}' required")
    raise HTTPException(status_code=403, detail="Admin access required")
