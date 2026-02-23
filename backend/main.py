"""
Bookvia API - Main Application Entry Point

This is the new modular entry point. During the refactoring transition,
it imports from both the new modular structure and the legacy server.py.

Environment Variables:
- MONGO_URL: MongoDB connection string
- DB_NAME: Database name
- JWT_SECRET: JWT signing secret
- ENV: "development" or "production"
- TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER: Twilio SMS
- RESEND_API_KEY, FROM_EMAIL: Resend email
- STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET: Stripe payments
- ADMIN_EMAIL, ADMIN_INITIAL_PASSWORD: Initial admin account
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from core.config import CORS_ORIGINS, ENV, IS_DEVELOPMENT

# Create FastAPI app
app = FastAPI(
    title="Bookvia API",
    description="Professional booking marketplace API",
    version="2.0.0",
    docs_url="/docs" if IS_DEVELOPMENT else None,
    redoc_url="/redoc" if IS_DEVELOPMENT else None
)

# Middleware
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["*"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if CORS_ORIGINS == "*" else CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and include routers from legacy server.py
# (will be migrated to individual router files gradually)
from server import (
    auth_router,
    users_router,
    categories_router,
    businesses_router,
    services_router,
    bookings_router,
    reviews_router,
    payments_router,
    notifications_router,
    admin_router
)

app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(users_router, prefix="/api/users", tags=["Users"])
app.include_router(categories_router, prefix="/api/categories", tags=["Categories"])
app.include_router(businesses_router, prefix="/api/businesses", tags=["Businesses"])
app.include_router(services_router, prefix="/api/services", tags=["Services"])
app.include_router(bookings_router, prefix="/api/bookings", tags=["Bookings"])
app.include_router(reviews_router, prefix="/api/reviews", tags=["Reviews"])
app.include_router(payments_router, prefix="/api/payments", tags=["Payments"])
app.include_router(notifications_router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(admin_router, prefix="/api/admin", tags=["Admin"])


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "env": ENV}


# Startup event - create admin if configured
@app.on_event("startup")
async def startup_event():
    from server import ensure_admin_exists
    await ensure_admin_exists()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
