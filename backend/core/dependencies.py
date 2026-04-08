"""
FastAPI dependencies for authentication and authorization.
"""
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional

from core.security import decode_token, TokenData
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
    if token_data.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return token_data


async def require_business(token_data: TokenData = Depends(require_auth)) -> TokenData:
    if token_data.role not in [UserRole.BUSINESS, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Business access required")
    return token_data
