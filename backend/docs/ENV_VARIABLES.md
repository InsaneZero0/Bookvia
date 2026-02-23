# Environment Variables Documentation

## Overview
This document describes all environment variables required for Bookvia API.

---

## Database

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGO_URL` | Yes | `mongodb://localhost:27017` | MongoDB connection string |
| `DB_NAME` | Yes | `bookvia_dev` | Database name |

---

## Authentication & Security

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | - | Secret key for JWT signing (use strong random string in production) |
| `ENV` | No | `development` | Environment: `development` or `production` |
| `CORS_ORIGINS` | No | `*` | Comma-separated list of allowed CORS origins |

---

## Admin Account

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ADMIN_EMAIL` | No | - | Initial admin email (created on startup if set) |
| `ADMIN_INITIAL_PASSWORD` | No | - | Initial admin password |

---

## SMS - Twilio Integration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TWILIO_ACCOUNT_SID` | Production only | - | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Production only | - | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Production only | - | Twilio phone number (format: +1234567890) |
| `SMS_PROVIDER` | No | `mock` | SMS provider: `mock` or `twilio` |

### SMS Behavior:
- **Development (`ENV=development`)**: SMS is mocked and logged. Verification codes returned in response for testing.
- **Production (`ENV=production`)**: Requires valid Twilio credentials. Returns error 503 if not configured.
- **Rate Limiting**: Maximum 3 SMS per phone number per hour.
- **Code Expiration**: 5 minutes.

### Setup Twilio:
1. Create account at https://www.twilio.com
2. Get Account SID and Auth Token from Console
3. Buy a phone number
4. Set environment variables

---

## Email - Resend Integration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RESEND_API_KEY` | Production only | - | Resend API key |
| `FROM_EMAIL` | No | `noreply@bookvia.com` | Sender email address |
| `EMAIL_PROVIDER` | No | `mock` | Email provider: `mock` or `resend` |

### Email Behavior:
- **Development**: Emails are mocked, logged to console, and stored in `sent_emails` collection.
- **Production**: Requires valid Resend API key. Falls back to mock with warning if not configured.
- **Admin Dashboard**: View all sent emails at `/api/admin/emails`.

### Setup Resend:
1. Create account at https://resend.com
2. Verify your domain
3. Get API key from dashboard
4. Set environment variables

---

## Payments - Stripe Integration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STRIPE_API_KEY` | Yes (for payments) | - | Stripe Secret Key |
| `STRIPE_WEBHOOK_SECRET` | Yes (for webhooks) | - | Stripe Webhook Signing Secret |

---

## Example .env File

```bash
# Database
MONGO_URL="mongodb://localhost:27017"
DB_NAME="bookvia_dev"

# Security
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
ENV="development"
CORS_ORIGINS="http://localhost:3000,https://yourapp.com"

# Admin
ADMIN_EMAIL="admin@bookvia.com"
ADMIN_INITIAL_PASSWORD="InitialPassword123!"

# SMS (Twilio) - Required for production
# TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxx"
# TWILIO_AUTH_TOKEN="xxxxxxxxxxxxxxxx"
# TWILIO_PHONE_NUMBER="+15551234567"
# SMS_PROVIDER="twilio"

# Email (Resend) - Required for production
# RESEND_API_KEY="re_xxxxxxxxxx"
# FROM_EMAIL="noreply@bookvia.com"
# EMAIL_PROVIDER="resend"

# Stripe
STRIPE_API_KEY="sk_test_xxxxxxxxx"
STRIPE_WEBHOOK_SECRET="whsec_xxxxxxxxx"
```

---

## API Endpoints for Testing

### SMS
- `POST /api/auth/phone/send-code` - Send verification code
- `POST /api/auth/phone/verify` - Verify code (requires auth)

### Email (Admin)
- `GET /api/admin/emails` - View sent emails (requires admin auth)

### Health Check
- `GET /api/health` - Check API status
