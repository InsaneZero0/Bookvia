# Bookvia - PRD (Product Requirements Document)

## Original Problem Statement
Plataforma de marketplace de reservas profesionales API-first, escalable, preparada para futura app móvil.

## Core Requirements
- Arquitectura API-first con FastAPI + React + MongoDB
- Sistema de roles: User, Business, Admin
- Autenticación JWT con 2FA obligatorio para admin
- Integración de pagos con Stripe

---

## Implementation Status

### Phase P0 - Security & Business Registration ✅ COMPLETE
- Admin creation from env variables
- Password hashing with bcrypt
- 2FA (TOTP) obligatory for admin
- Audit logs
- Business registration with document upload
- Admin panel for business approval

### Phase P1 - Stripe Integration ✅ COMPLETE
- Stripe Checkout for deposits
- Webhooks for payment confirmation
- 30-minute HOLD status for bookings
- 8% commission logic
- Cancellation and no-show handling

### Phase P2 - Financial Panel & Settlements ✅ COMPLETE
- Double-entry ledger system
- Financial dashboard for businesses
- Monthly settlement generation
- Admin panel for payment holds

### Phase P2.5 - Workers & Schedules ✅ COMPLETE (Feb 23, 2026)
- Worker CRUD with soft delete
- Schedule management with multiple blocks
- Exceptions (vacations/blocks) with date ranges
- Availability engine with detailed status
- Auto-assignment by least load

### Phase P3 - Refactor & Stability ✅ COMPLETE (Feb 23, 2026)

#### Backend Refactoring
New modular structure:
```
backend/
├── main.py                 # New entry point (optional)
├── server.py               # Legacy monolith (still used)
├── core/
│   ├── config.py          # Environment configuration
│   ├── database.py        # MongoDB connection
│   ├── security.py        # JWT, password hashing, 2FA
│   ├── logging_config.py  # Structured logging (NEW)
│   └── dependencies.py    # Auth dependencies
├── middleware/
│   ├── __init__.py
│   └── rate_limit.py      # Global rate limiting (NEW)
├── models/
│   ├── enums.py           # All enums
│   └── country.py         # Country model (NEW)
├── routers/
│   └── seo.py             # SEO router (NEW)
├── services/
│   ├── sms.py             # SMS service (Twilio/mock)
│   ├── email.py           # Email service (Resend/mock)
│   └── notifications.py   # Internal notifications
├── utils/
│   └── helpers.py         # Utility functions (with slug generation)
└── tests/
    └── test_p4_seo.py     # SEO tests
```

### Phase P4 - SEO & Multi-Country ✅ COMPLETE (Feb 23, 2026)

#### Multi-Country Architecture
- `country_code` field added to Business model (default: "MX")
- `countries` collection with Mexico as default
- `cities` collection with 10 Mexican cities seeded
- All existing businesses auto-updated with `country_code: "MX"`

#### SEO Implementation
- **Sitemap.xml**: Dynamic generation at `/api/seo/sitemap.xml`
  - 94 URLs: countries, cities, categories, businesses
  - Auto-updates with new content
  - Uses `BASE_URL` env var for correct domain
- **Robots.txt**: 
  - Static at `/robots.txt` (frontend)
  - Dynamic at `/api/seo/robots.txt` (backend)
- **Meta Tags**: Dynamic generation via `/api/seo/meta/{type}/{slug}`
- **Canonical URLs**: Implemented in SEOHead component

#### SEO Pages (Frontend)
- `/mx` - Country page (shows 10 cities + categories)
- `/mx/{city}` - City page (shows all categories)
- `/mx/{city}/{category}` - Category listing page
- `/mx/{city}/{business-slug}` - Business detail (SEO version)

#### Rate Limiting
- Global middleware with per-endpoint limits
- Auth endpoints: 5-10 requests/min
- API endpoints: 100 requests/min
- SEO endpoints: 60 requests/min
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

#### Staging-Ready Features
- Health endpoint: `GET /api/health` with config status
- Logging configured (development: colored, production: JSON structured)
- Rate limiting active
- **Auto-mock detection**: SMS/Email automatically mocked if credentials missing
- Base URL configurable via `BASE_URL` env var

---

### Phase P4.5 - Staging Preparation ✅ COMPLETE (Feb 23, 2026)

#### Environment Configuration
- `BASE_URL` env var for sitemap/email URLs
- Auto-detection of service providers (Twilio, Resend, Stripe)
- Fail-fast validation for required vars (MONGO_URL, DB_NAME, JWT_SECRET in prod)

#### Documentation Created
- `/app/backend/.env.production.template` - Production env template
- `/app/frontend/.env.production.template` - Frontend env template  
- `/app/docs/STAGING_CHECKLIST.md` - Complete deployment guide

#### Health Check Endpoint
```
GET /api/health
{
  "status": "healthy",
  "environment": "development",
  "database": "connected",
  "config": {
    "sms": "mock",
    "email": "mock", 
    "stripe": "test",
    "base_url": "https://..."
  }
}
```

---

## Upcoming Tasks

### Phase P5 - Staging Deployment (P1 Priority)
- [ ] Configure production environment variables
- [ ] Enable real SMS (Twilio) and Email (Resend) services
- [ ] Set up Stripe live mode
- [ ] Configure proper domain for sitemap URLs

### Future Tasks (P2-P3 Priority)
- [ ] Automatic Payouts via Stripe Connect
- [ ] Push notifications
- [ ] Mobile app
- [ ] Multi-language support (English)

---

## Environment Variables

See `/app/backend/docs/ENV_VARIABLES.md`

### Quick Reference:
```bash
# Required
MONGO_URL, DB_NAME, JWT_SECRET

# SMS (Production)
TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER

# Email (Production)
RESEND_API_KEY, FROM_EMAIL

# Payments
STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET
```

## Test Credentials
- **Business**: testspa@test.com / Test123!
- **Admin**: zamorachapa50@gmail.com / RainbowLol3133!

## Mocked Features
- SMS (mock in dev, Twilio in prod)
- Email (mock, stored in DB)
- Settlement payouts (manual)

## API Endpoints Reference

### SEO Endpoints
- `GET /api/seo/countries` - List active countries
- `GET /api/seo/cities/{country_code}` - List cities for country
- `GET /api/seo/categories` - List categories with business counts
- `GET /api/seo/meta/{page_type}/{slug}` - Get meta tags
- `GET /api/seo/businesses/{country}/{city}` - List businesses by location
- `GET /api/seo/business/{country}/{city}/{slug}` - Get business details
- `GET /api/seo/sitemap.xml` - Dynamic sitemap
- `GET /api/seo/robots.txt` - Robots.txt

### Key Changes in P4
- BusinessResponse now includes `country_code` and `city_slug`
- Rate limiting headers on all API responses
- SEO pages accessible at friendly URLs
