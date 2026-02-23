"""
Application configuration and environment variables.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# Database
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "bookvia_dev")

# Security
JWT_SECRET = os.environ.get("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# CORS
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*")

# Environment
ENV = os.environ.get("ENV", "development")
IS_DEVELOPMENT = ENV == "development"
IS_PRODUCTION = ENV == "production"

# Admin (created on startup)
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL")
ADMIN_INITIAL_PASSWORD = os.environ.get("ADMIN_INITIAL_PASSWORD")

# SMS - Twilio
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER")
SMS_PROVIDER = os.environ.get("SMS_PROVIDER", "mock")  # "twilio" or "mock"

# Email - Resend
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "noreply@bookvia.com")
EMAIL_PROVIDER = os.environ.get("EMAIL_PROVIDER", "mock")  # "resend" or "mock"

# Stripe
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET")

# Business settings
MIN_DEPOSIT_AMOUNT = 50.0  # MXN
COMMISSION_RATE = 0.08  # 8%
HOLD_EXPIRATION_MINUTES = 30
SMS_CODE_EXPIRATION_MINUTES = 5
SMS_MAX_ATTEMPTS_PER_HOUR = 3

def is_twilio_configured() -> bool:
    """Check if Twilio credentials are configured"""
    return all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER])

def is_resend_configured() -> bool:
    """Check if Resend credentials are configured"""
    return bool(RESEND_API_KEY)
