# Bookvia - PRD (Product Requirements Document)

## Original Problem Statement
Plataforma de marketplace de reservas profesionales API-first, escalable, preparada para futura app móvil.

## Core Requirements
- Arquitectura API-first con FastAPI + React + MongoDB
- Sistema de roles: User, Business, Admin
- Autenticación JWT con 2FA obligatorio para admin
- Integración de pagos con Stripe

## User Personas
1. **Usuario Final**: Busca y reserva servicios profesionales
2. **Negocio**: Ofrece servicios, gestiona trabajadores, horarios y finanzas
3. **Admin**: Aprueba negocios, gestiona liquidaciones, supervisa plataforma

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
- Settlement management (PENDING/PAID/HELD)

### Phase P2.5 - Workers & Schedules ✅ COMPLETE (Feb 23, 2026)
- **Worker CRUD**: Create, Read, Update, Soft Delete, Reactivate
- **Schedule Management**: 
  - Multiple blocks per day (morning/afternoon shifts)
  - Overlap validation for schedule blocks
- **Exceptions (Vacations/Blocks)**:
  - Full day and date range exceptions
  - Partial day blocks with specific hours
  - Reason tracking for each exception
- **Availability Engine**:
  - Considers worker schedules, exceptions, existing bookings
  - Returns detailed status and reason per slot
  - Supports business timezone
  - Filters workers by service (allowed_worker_ids)
- **Auto-assignment**: Workers assigned by least load
- **Frontend UI**: Team tab, Calendar tab, dialogs for schedule/exceptions

---

## Upcoming Tasks

### Phase P3 - SEO & Optimization (P1 Priority)
- [ ] Implement friendly URLs
- [ ] Generate dynamic sitemap.xml
- [ ] Implement dynamic meta-tags

### Future Tasks (P2-P3 Priority)
- [ ] Real SMS Integration (replace Twilio mock)
- [ ] Automatic Payouts via Stripe Connect
- [ ] Backend refactoring (split server.py into routers/models/services)

---

## Technical Architecture

```
/app/
├── backend/
│   └── server.py        # Monolith (~3800 lines)
├── frontend/
│   └── src/
│       ├── components/
│       ├── lib/
│       │   ├── api.js   # API client
│       │   ├── auth.js  # Auth context
│       │   └── i18n.js  # Internationalization
│       └── pages/
│           ├── TeamSchedulePage.jsx    # NEW: Workers & Schedules
│           ├── BusinessDashboardPage.jsx
│           ├── BusinessFinancePage.jsx
│           └── ...
└── memory/
    └── PRD.md
```

## Key API Endpoints

### Workers (requires business auth)
- `POST /api/businesses/my/workers` - Create worker
- `GET /api/businesses/my/workers` - List workers (include_inactive param)
- `PUT /api/businesses/my/workers/{id}` - Update worker
- `DELETE /api/businesses/my/workers/{id}` - Soft delete
- `PUT /api/businesses/my/workers/{id}/reactivate` - Reactivate
- `PUT /api/businesses/my/workers/{id}/schedule` - Update schedule
- `POST /api/businesses/my/workers/{id}/exceptions` - Add exception
- `DELETE /api/businesses/my/workers/{id}/exceptions/{exc_id}` - Remove exception

### Availability
- `GET /api/bookings/availability/{business_id}` - Get available slots
  - Params: date, service_id, worker_id, include_unavailable

### Finance
- `GET /api/finance/summary` - Business financial summary
- `POST /api/admin/settlements/generate` - Generate monthly settlements
- `PUT /api/admin/settlements/{id}/hold` - Hold settlement payment

## Database Collections
- `users` - User accounts with roles
- `businesses` - Business profiles with timezone
- `workers` - Worker profiles with schedule and exceptions
- `services` - Services with allowed_worker_ids
- `bookings` - Appointments with HOLD/CONFIRMED status
- `payment_transactions` - Stripe transactions
- `ledger_entries` - Double-entry accounting
- `settlements` - Monthly settlements
- `audit_logs` - Admin action logs

## Mocked Features
- SMS verification (Twilio mock)
- Settlement payouts (manual "mark as paid")

## Test Credentials
- **Business**: testspa@test.com / Test123!
- **Admin**: zamorachapa50@gmail.com / RainbowLol3133!
