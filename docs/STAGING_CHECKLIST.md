# Bookvia - Staging Deployment Checklist

## Pre-Deployment Checklist

### 1. Environment Variables

#### Required Variables (App won't start without these)
| Variable | Description | Example |
|----------|-------------|---------|
| `MONGO_URL` | MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/` |
| `DB_NAME` | Database name | `bookvia_staging` |
| `JWT_SECRET` | Secure JWT secret (min 32 chars) | Use `openssl rand -hex 32` |
| `ENV` | Environment mode | `staging` or `production` |

#### Optional Variables (Auto-mocked if missing)
| Variable | Description | Behavior if Missing |
|----------|-------------|---------------------|
| `TWILIO_ACCOUNT_SID` | Twilio account | SMS mocked, codes stored in DB |
| `TWILIO_AUTH_TOKEN` | Twilio auth | SMS mocked, codes stored in DB |
| `TWILIO_PHONE_NUMBER` | Twilio phone | SMS mocked, codes stored in DB |
| `RESEND_API_KEY` | Resend API key | Emails mocked, stored in DB |
| `STRIPE_API_KEY` | Stripe secret key | Payments disabled |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook | Webhooks won't verify |

#### Recommended Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `BASE_URL` | Public URL for sitemap/emails | Auto-detected from request |
| `CORS_ORIGINS` | Allowed origins | `*` (set specific domain in prod) |
| `FROM_EMAIL` | Sender email | `noreply@bookvia.com` |
| `ADMIN_EMAIL` | Admin account email | None (manual creation) |
| `ADMIN_INITIAL_PASSWORD` | Admin initial password | None |

---

### 2. Mock Auto-Disable Logic

The app **automatically** detects if external services are configured:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Service │ Auto-Detection Logic                    │ Result            │
├─────────────────────────────────────────────────────────────────────────┤
│ SMS     │ TWILIO_* all present?                   │ Twilio : Mock     │
│ Email   │ RESEND_API_KEY present?                 │ Resend : Mock     │
│ Stripe  │ STRIPE_API_KEY present?                 │ Enabled : Disabled│
└─────────────────────────────────────────────────────────────────────────┘
```

**No manual switching required** - just add the credentials and restart.

---

### 3. What Happens if Credentials are Missing?

| Service | Missing Credentials | Behavior |
|---------|---------------------|----------|
| **Database** | MONGO_URL not set | ❌ App fails to start with clear error |
| **JWT** | JWT_SECRET missing in prod | ❌ App fails to start with clear error |
| **SMS (Twilio)** | Any TWILIO_* missing | ⚠️ Mock mode: codes logged + stored in DB |
| **Email (Resend)** | RESEND_API_KEY missing | ⚠️ Mock mode: emails stored in `email_logs` collection |
| **Stripe** | STRIPE_API_KEY missing | ⚠️ Payments disabled, bookings without deposit only |

#### Checking Mock Status
```bash
# Check current configuration status
curl https://your-domain.com/api/health

# Response includes:
{
  "status": "healthy",
  "config": {
    "env": "staging",
    "sms": "mock",      // or "twilio"
    "email": "mock",    // or "resend"
    "stripe": "test"    // or "live" or "not configured"
  }
}
```

---

### 4. Logging

#### Development Mode (`ENV=development`)
- Colored, human-readable logs
- DEBUG level enabled
- Format: `2024-02-23 10:30:00 | INFO     | module.function:42 | Message`

#### Production/Staging Mode (`ENV=staging` or `ENV=production`)
- JSON structured logs (for log aggregators)
- INFO level minimum
- Format: `{"timestamp":"...","level":"INFO","message":"...","module":"..."}`

#### View Logs
```bash
# Supervisor logs
tail -f /var/log/supervisor/backend.out.log
tail -f /var/log/supervisor/backend.err.log

# Combined
tail -f /var/log/supervisor/backend.*.log
```

---

### 5. SEO URLs Configuration

#### Sitemap & Robots.txt Access

| URL | Source | Notes |
|-----|--------|-------|
| `/robots.txt` | Frontend static file | Points to `/api/seo/sitemap.xml` |
| `/api/seo/sitemap.xml` | Backend dynamic | Full sitemap with all pages |
| `/api/seo/robots.txt` | Backend dynamic | Alternative robots.txt |

#### Production Nginx/Ingress Config (Optional)
For direct `/sitemap.xml` access, add to your nginx config:
```nginx
location = /sitemap.xml {
    proxy_pass http://backend:8001/api/seo/sitemap.xml;
}

location = /robots.txt {
    proxy_pass http://backend:8001/api/seo/robots.txt;
}
```

---

### 6. Database Seeding

After first deployment, run these seeds:

```bash
# Seed categories (required for business registration)
curl -X POST https://your-domain.com/api/seed

# Seed countries and cities (required for SEO pages)
curl -X POST https://your-domain.com/api/seed/countries
```

---

### 7. Deployment Verification Checklist

Run these checks after deployment:

```bash
BASE_URL="https://your-domain.com"

# 1. Health check
curl $BASE_URL/api/health

# 2. Check SEO endpoints
curl $BASE_URL/api/seo/countries
curl $BASE_URL/api/seo/cities/MX
curl $BASE_URL/api/seo/sitemap.xml | head -20

# 3. Check rate limiting headers
curl -I $BASE_URL/api/health | grep -i ratelimit

# 4. Test frontend loads
curl -s $BASE_URL | grep -o '<title>.*</title>'

# 5. Test SEO pages
curl -s $BASE_URL/mx | grep -o '<title>.*</title>'
```

---

### 8. Post-Deployment Tasks

- [ ] Verify admin can login at `/admin/login`
- [ ] Configure 2FA for admin account
- [ ] Test business registration flow
- [ ] Test booking flow (with test Stripe)
- [ ] Verify SMS codes are being sent (or check `sms_logs` if mocked)
- [ ] Verify emails are being sent (or check `email_logs` if mocked)
- [ ] Submit sitemap to Google Search Console
- [ ] Set up monitoring/alerts

---

## Quick Reference

### Environment Summary
```
development → Colored logs, relaxed validation, mocks default
staging     → JSON logs, production validation, auto-detect services
production  → JSON logs, strict validation, auto-detect services
```

### Files Created
- `/app/backend/.env.production.template` - Backend env template
- `/app/frontend/.env.production.template` - Frontend env template
- `/app/docs/STAGING_CHECKLIST.md` - This document
