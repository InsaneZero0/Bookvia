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
│   └── dependencies.py    # Auth dependencies
├── models/
│   └── enums.py           # All enums
├── schemas/
│   ├── auth.py            # User auth schemas
│   ├── business.py        # Business schemas
│   ├── worker.py          # Worker schemas
│   ├── booking.py         # Booking schemas
│   └── finance.py         # Finance schemas
├── services/
│   ├── sms.py             # SMS service (Twilio/mock)
│   ├── email.py           # Email service (Resend/mock)
│   └── notifications.py   # Internal notifications
├── utils/
│   └── helpers.py         # Utility functions
└── docs/
    └── ENV_VARIABLES.md   # Environment documentation
```

#### SMS Service (Twilio Ready)
- ✅ Mock mode in development
- ✅ Rate limiting (3 attempts/hour per phone)
- ✅ Code expiration (5 minutes)
- ✅ Error logging
- ✅ Production requires credentials (503 if missing)

#### Email Service (Resend Ready)
- ✅ Mock mode stores in `sent_emails` collection
- ✅ Admin can view at `/api/admin/emails`
- ✅ Templates: booking confirmation, worker assignment, cancellation

#### Worker Notifications
- ✅ Email notification on booking confirmation (mock)
- ✅ Internal notification in dashboard

---

## Upcoming Tasks

### Phase P4 - SEO & Optimization (P1 Priority)
- [ ] Implement friendly URLs
- [ ] Generate dynamic sitemap.xml
- [ ] Implement dynamic meta-tags

### Future Tasks (P2-P3 Priority)
- [ ] Automatic Payouts via Stripe Connect
- [ ] Push notifications
- [ ] Mobile app

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
