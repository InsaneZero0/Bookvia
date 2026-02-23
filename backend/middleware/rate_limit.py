"""
Global rate limiting middleware.
Uses in-memory storage for development, Redis can be added for production.
"""
import time
from collections import defaultdict
from typing import Dict, Tuple
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from core.config import IS_PRODUCTION, ENV


class RateLimitStore:
    """Simple in-memory rate limit store"""
    
    def __init__(self):
        self.requests: Dict[str, list] = defaultdict(list)
        self.cleanup_interval = 60  # seconds
        self.last_cleanup = time.time()
    
    def _cleanup_old_requests(self, window_seconds: int):
        """Remove requests older than the window"""
        now = time.time()
        if now - self.last_cleanup < self.cleanup_interval:
            return
        
        cutoff = now - window_seconds
        for key in list(self.requests.keys()):
            self.requests[key] = [ts for ts in self.requests[key] if ts > cutoff]
            if not self.requests[key]:
                del self.requests[key]
        self.last_cleanup = now
    
    def check_rate_limit(self, key: str, max_requests: int, window_seconds: int) -> Tuple[bool, int]:
        """
        Check if request is allowed.
        Returns (is_allowed, remaining_requests)
        """
        now = time.time()
        cutoff = now - window_seconds
        
        # Get valid requests within window
        valid_requests = [ts for ts in self.requests[key] if ts > cutoff]
        self.requests[key] = valid_requests
        
        # Cleanup periodically
        self._cleanup_old_requests(window_seconds)
        
        if len(valid_requests) >= max_requests:
            return False, 0
        
        # Add new request
        self.requests[key].append(now)
        return True, max_requests - len(valid_requests) - 1


# Global rate limit store
rate_limit_store = RateLimitStore()


# Rate limit configurations by path pattern
RATE_LIMITS = {
    # Auth endpoints - stricter limits
    "/api/auth/login": {"max": 10, "window": 60},          # 10/min
    "/api/auth/admin/login": {"max": 5, "window": 60},     # 5/min
    "/api/auth/register": {"max": 5, "window": 300},       # 5/5min
    "/api/auth/phone/send-code": {"max": 3, "window": 300}, # 3/5min
    
    # Payment endpoints - moderate limits
    "/api/payments": {"max": 30, "window": 60},
    "/api/bookings": {"max": 30, "window": 60},
    
    # SEO/Public endpoints - more lenient
    "/sitemap.xml": {"max": 60, "window": 60},
    "/robots.txt": {"max": 60, "window": 60},
    
    # Default for API
    "/api/": {"max": 100, "window": 60},
    
    # Default global
    "default": {"max": 200, "window": 60}
}


def get_rate_limit_config(path: str) -> dict:
    """Get rate limit config for a path"""
    # Check specific paths first
    for pattern, config in RATE_LIMITS.items():
        if pattern != "default" and path.startswith(pattern):
            return config
    
    # Check if it's an API path
    if path.startswith("/api/"):
        return RATE_LIMITS["/api/"]
    
    return RATE_LIMITS["default"]


def get_client_identifier(request: Request) -> str:
    """Get unique identifier for client (IP + optional user)"""
    # Get real IP from X-Forwarded-For for proxied requests
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    else:
        ip = request.client.host if request.client else "unknown"
    
    # Add path for per-endpoint limits
    return f"{ip}:{request.url.path}"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Global rate limiting middleware.
    
    Features:
    - Per-IP rate limiting
    - Different limits for different endpoints
    - Includes rate limit headers in response
    - More lenient in development
    """
    
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks and static files
        path = request.url.path
        if path in ["/api/health", "/health", "/favicon.ico"]:
            return await call_next(request)
        
        # Skip for webhooks (Stripe needs these)
        if "/webhook" in path:
            return await call_next(request)
        
        # Get rate limit config
        config = get_rate_limit_config(path)
        
        # In development, double the limits
        max_requests = config["max"]
        if not IS_PRODUCTION:
            max_requests *= 2
        
        window_seconds = config["window"]
        
        # Check rate limit
        client_key = get_client_identifier(request)
        is_allowed, remaining = rate_limit_store.check_rate_limit(
            client_key, max_requests, window_seconds
        )
        
        if not is_allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Too many requests. Please try again later.",
                    "retry_after": window_seconds
                },
                headers={
                    "Retry-After": str(window_seconds),
                    "X-RateLimit-Limit": str(max_requests),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(time.time()) + window_seconds)
                }
            )
        
        # Process request
        response = await call_next(request)
        
        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(max_requests)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(int(time.time()) + window_seconds)
        
        return response
