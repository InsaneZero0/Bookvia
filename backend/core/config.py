"""
Application configuration and environment variables.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# =============================================================================
# ENVIRONMENT
# =============================================================================
ENV = os.environ.get("ENV", "development")
IS_DEVELOPMENT = ENV == "development"
IS_STAGING = ENV == "staging"
IS_PRODUCTION = ENV == "production"

# =============================================================================
# BASE URL (for sitemap, emails, etc.)
# =============================================================================
# Priority: BASE_URL env var > REACT_APP_BACKEND_URL > default
BASE_URL = os.environ.get("BASE_URL") or os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")
# Remove trailing slash if present
BASE_URL = BASE_URL.rstrip("/")

# =============================================================================
# DATABASE
# =============================================================================
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

# Fail fast if database not configured
if not MONGO_URL:
    raise ValueError("MONGO_URL environment variable is required")
if not DB_NAME:
    raise ValueError("DB_NAME environment variable is required")

# =============================================================================
# SECURITY
# =============================================================================
JWT_SECRET = os.environ.get("JWT_SECRET")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Production requires a proper JWT secret
if IS_PRODUCTION and (not JWT_SECRET or JWT_SECRET == "change-me-in-production"):
    raise ValueError("JWT_SECRET must be set to a secure value in production")
elif not JWT_SECRET:
    JWT_SECRET = "dev-only-jwt-secret-NOT-FOR-PRODUCTION"

# =============================================================================
# CORS
# =============================================================================
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*")

# =============================================================================
# ADMIN (created on startup)
# =============================================================================
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL")
ADMIN_INITIAL_PASSWORD = os.environ.get("ADMIN_INITIAL_PASSWORD")

# =============================================================================
# SMS - Twilio
# =============================================================================
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER")

def is_twilio_configured() -> bool:
    """Check if Twilio credentials are configured"""
    return all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER])

# Auto-detect SMS provider: use Twilio if configured, otherwise mock
SMS_PROVIDER = "twilio" if is_twilio_configured() else "mock"

# =============================================================================
# EMAIL - Resend
# =============================================================================
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "noreply@bookvia.com")

def is_resend_configured() -> bool:
    """Check if Resend credentials are configured"""
    return bool(RESEND_API_KEY)

# Auto-detect email provider: use Resend if configured, otherwise mock
EMAIL_PROVIDER = "resend" if is_resend_configured() else "mock"

# =============================================================================
# STRIPE
# =============================================================================
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET")

def is_stripe_configured() -> bool:
    """Check if Stripe is configured"""
    return bool(STRIPE_API_KEY)

def is_stripe_live() -> bool:
    """Check if Stripe is in live mode (not test)"""
    return STRIPE_API_KEY and STRIPE_API_KEY.startswith("sk_live_")

# =============================================================================
# BUSINESS SETTINGS
# =============================================================================
MIN_DEPOSIT_AMOUNT = 50.0  # MXN
COMMISSION_RATE = 0.08  # 8%
HOLD_EXPIRATION_MINUTES = 30
SMS_CODE_EXPIRATION_MINUTES = 5
SMS_MAX_ATTEMPTS_PER_HOUR = 3

# =============================================================================
# STARTUP VALIDATION
# =============================================================================
def validate_production_config():
    """Validate that all required production configs are present"""
    errors = []
    
    if not is_twilio_configured():
        errors.append("WARNING: Twilio not configured - SMS will be mocked")
    
    if not is_resend_configured():
        errors.append("WARNING: Resend not configured - Emails will be mocked")
    
    if not is_stripe_configured():
        errors.append("WARNING: Stripe not configured - Payments disabled")
    elif not is_stripe_live():
        errors.append("INFO: Stripe in test mode")
    
    return errors

def get_config_status() -> dict:
    """Get current configuration status for health checks"""
    return {
        "env": ENV,
        "base_url": BASE_URL,
        "database": "connected" if MONGO_URL else "not configured",
        "sms": "twilio" if is_twilio_configured() else "mock",
        "email": "resend" if is_resend_configured() else "mock",
        "stripe": "live" if is_stripe_live() else ("test" if is_stripe_configured() else "not configured"),
        "admin_configured": bool(ADMIN_EMAIL),
    }
