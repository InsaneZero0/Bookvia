# Bookvia - PRD (Product Requirements Document)

## Project Overview
**Bookvia** - Marketplace de Reservas Profesionales
- Multi-país, multi-idioma (ES/EN), multi-moneda (MXN)
- API-first, preparada para futura app móvil

## Architecture
- **Backend**: FastAPI + MongoDB
- **Frontend**: React + Tailwind + Shadcn/UI
- **Auth**: JWT (user, business, admin) + 2FA TOTP para admin
- **Payments**: Stripe (test keys)
- **Ledger**: Double-entry bookkeeping interno

---

## ✅ COMPLETADO

### Fase 3: Panel Financiero + Liquidaciones (Feb 23, 2026)

#### Sistema de Ledger (Libro Contable) ✅
- `ledger_entries` collection con:
  - `direction`: DEBIT | CREDIT
  - `account`: business_revenue, platform_fee, refund, penalty, payout
  - `amount_cents`: Integer para evitar errores de decimales
  - `entry_status`: posted | reversed
  - `created_by`: system | admin
- Auto-generación al confirmar pago (CREDIT business_revenue, DEBIT platform_fee)
- Auto-generación en refunds y penalties

#### Settlements (Liquidaciones) ✅
- `settlements` collection con:
  - `period_key`: "MX-2026-02"
  - `idempotency_key`: Previene duplicados
  - `held_reason`: Cuando status = HELD
  - Cálculo: net_payout = gross_paid - fees - refunds - penalties
- Estados: PENDING, PAID, HELD, FAILED

#### Panel Financiero Negocio ✅
- `/business/finance` con:
  - Resumen: gross_revenue, total_fees, net_earnings
  - Payouts: pending, paid, held
  - Transacciones con filtros
  - Historial de liquidaciones

#### Control Admin ✅
- `PUT /api/admin/businesses/{id}/payout-hold` - Bloquear/liberar pagos
- `POST /api/admin/settlements/generate` - Generar liquidaciones (idempotente)
- `PUT /api/admin/settlements/{id}/pay` - Marcar como pagado
- `GET /api/admin/export/transactions` - CSV
- `GET /api/admin/export/settlements` - CSV

### Fase 2: Core Financiero (Feb 23, 2026)
- Stripe Checkout + webhooks
- Hold 30 min con countdown
- Comisiones 8%
- Cancelaciones con políticas (>24h, <24h, no-show)
- TransactionStatus: CREATED, PAID, REFUND_PARTIAL, REFUND_FULL, NO_SHOW_PAYOUT, BUSINESS_CANCEL_FEE

### Fase 1: Seguridad (Feb 23, 2026)
- Admin desde env vars
- 2FA TOTP obligatorio
- Audit logs completos
- Registro negocios 4-step

### MVP (Completado)
- Homepage, búsqueda, categorías
- Login/registro
- Sistema de reservas
- Reseñas

---

## Backlog

### P2: Gestión Trabajadores
- [ ] UI para horarios de trabajadores
- [ ] Vacaciones/bloqueos
- [ ] Asignación automática avanzada

### P3: SEO
- [ ] URLs amigables
- [ ] Sitemap dinámico
- [ ] Meta-tags

### P4: Nice to have
- [ ] Cloud storage para fotos
- [ ] Notificaciones push
- [ ] App móvil

---

## API Endpoints

### Finance (Business)
- `GET /api/business/finance/summary`
- `GET /api/business/finance/transactions`
- `GET /api/business/finance/ledger`
- `GET /api/business/finance/settlements`

### Admin Settlements
- `POST /api/admin/settlements/generate?year=X&month=Y`
- `GET /api/admin/settlements`
- `PUT /api/admin/settlements/{id}/pay`
- `PUT /api/admin/businesses/{id}/payout-hold`
- `GET /api/admin/export/transactions?year=X&month=Y`
- `GET /api/admin/export/settlements?year=X&month=Y`

---

## Constants
```python
PLATFORM_FEE_PERCENT = 0.08  # 8%
HOLD_EXPIRATION_MINUTES = 30
MIN_DEPOSIT_AMOUNT = 50.0  # MXN
```

## Test Credentials
- Business: testspa@test.com / Test123!
- Admin: zamorachapa50@gmail.com + TOTP

## Test Reports
- `/app/test_reports/iteration_5.json` - Fase 3 (100% pass)
- `/app/test_reports/iteration_4.json` - Fase 2
- `/app/test_reports/iteration_3.json` - Registro negocios
- `/app/test_reports/iteration_2.json` - Seguridad admin
