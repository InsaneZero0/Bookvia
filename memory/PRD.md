# Bookvia - PRD (Product Requirements Document)

## Project Overview
**Bookvia** - Marketplace de Reservas Profesionales (tipo OpenTable multi-industria)
- Plataforma para reservar citas con profesionistas y negocios
- Multi-país, multi-idioma (ES/EN), multi-moneda (MXN)
- API-first, preparada para futura app móvil

## Architecture
- **Backend**: FastAPI (Python) + MongoDB
- **Frontend**: React + Tailwind CSS + Shadcn/UI
- **Auth**: JWT (roles: user, business, admin)
- **2FA**: TOTP obligatorio para admin (pyotp + QR code)
- **Payments**: Stripe (test keys, production-ready)
- **SMS**: Mock (configurable para Twilio)

## User Personas
1. **Usuario Final**: Busca y reserva servicios profesionales
2. **Negocio/Profesional**: Ofrece servicios y gestiona citas
3. **Admin**: Gestiona plataforma, aprueba negocios, auditoría

## Core Requirements (Static)
- Sistema de citas con límite 5 activas por usuario
- 4 cancelaciones = suspensión 15 días
- Reagendar permitido >24h antes
- **Anticipos con comisión 8%** (implementado)
- Verificación telefónica obligatoria
- Aprobación manual de negocios
- Planes: $49.99 MXN/mes (3 meses trial gratis)
- **NO implementar**: Sistema de referidos

---

## What's Been Implemented ✅

### Fase 2: Core Financiero (P1) - COMPLETADA (Feb 23, 2026)

#### Flujo de Anticipo + Hold 30 min ✅
- Booking se crea con estado `HOLD` y `hold_expires_at` a 30 minutos
- Si no se paga: slot se libera automáticamente (task `expire_holds_task`)
- UI muestra countdown en formato MM:SS con barra de progreso
- Botón "Pagar ahora" visible solo en estado HOLD

#### Stripe Checkout + Webhooks ✅
- `POST /api/payments/deposit/checkout` - Crea Stripe Checkout Session
- Webhook `/api/webhook/stripe` - Confirma pagos (SOURCE OF TRUTH)
- Idempotencia: no procesa pagos duplicados
- Metadata incluye: transaction_id, booking_id, user_id, business_id

#### Comisiones 8% y Reglas de Cancelación ✅
- **Comisión fija**: 8% sobre el anticipo (`PLATFORM_FEE_PERCENT = 0.08`)
- **Cliente cancela >24h**: Reembolso parcial (anticipo - 8%), status `REFUND_PARTIAL`
- **Cliente cancela <24h**: Sin reembolso, negocio recibe payout
- **Cliente no-show**: Negocio recibe anticipo - 8%, status `NO_SHOW_PAYOUT`
- **Negocio cancela**: Reembolso 100% al cliente + 8% penalidad al negocio, status `REFUND_FULL` + `BUSINESS_CANCEL_FEE`

#### Modelo DB de Transacciones ✅
Colección `transactions` con:
```javascript
{
  id, booking_id, user_id, business_id,
  stripe_session_id, stripe_payment_intent_id,
  amount_total, fee_amount (8%), payout_amount,
  currency, status (TransactionStatus enum),
  refund_amount, refund_reason, cancelled_by,
  created_at, updated_at, paid_at
}
```

Estados de Transaction (TransactionStatus enum):
- `CREATED` - Checkout creado / hold activo
- `PAID` - Confirmado por webhook
- `REFUND_PARTIAL` - Cliente cancela >24h
- `REFUND_FULL` - Negocio cancela
- `NO_SHOW_PAYOUT` - Cliente no asiste
- `BUSINESS_CANCEL_FEE` - Penalidad al negocio
- `EXPIRED` - Hold expirado sin pago

#### Endpoints y UI ✅
Backend:
- `POST /api/payments/deposit/checkout` - Crear checkout
- `GET /api/payments/checkout/status/{session_id}` - Estado de checkout
- `GET /api/payments/my-transactions` - Transacciones del usuario
- `GET /api/payments/business-transactions` - Transacciones del negocio
- `PUT /api/bookings/{id}/cancel/user` - Cancelación usuario
- `PUT /api/bookings/{id}/cancel/business` - Cancelación negocio
- `PUT /api/bookings/{id}/no-show` - Marcar no-show
- `POST /api/payments/expire-holds` - Expirar holds (admin)

Frontend:
- `/dashboard/bookings` - Mis citas con estados visuales
- `/payment/success` - Página de pago exitoso
- `/payment/cancel` - Página de pago cancelado
- Countdown timer para HOLD
- Badges de colores: HOLD (amber), CONFIRMED (green), CANCELLED (slate), EXPIRED (gray)

---

### Fase 1: Seguridad y Fundamentos (P0) - COMPLETADA (Feb 23, 2026)
- Admin desde variables de entorno (no hardcoded)
- 2FA TOTP obligatorio para admin con QR code
- Logs de auditoría completos (IP, user-agent, detalles)
- Registro de negocios 4-step con documentos
- Panel admin para aprobar/rechazar negocios
- Endpoints de retención de pagos

### Fase MVP (Completada anteriormente)
- Homepage con búsqueda, categorías, featured businesses
- Login/registro de usuario y negocio
- Autenticación JWT con roles
- i18n ES/EN, tema claro/oscuro
- Búsqueda y perfil de negocios
- Sistema de reservas con disponibilidad
- Reseñas con rating bayesiano

---

## Prioritized Backlog

### P2 (Fase 3: Gestión y Operaciones)
- [ ] Job mensual para liquidaciones automáticas a negocios
- [ ] Panel financiero para negocios (ingresos, liquidaciones)
- [ ] Gestión de trabajadores y horarios UI
- [ ] Asignación automática de citas (ya implementada básica)
- [ ] Vacaciones/bloqueos de trabajadores

### P3 (Fase 4: SEO)
- [ ] URLs amigables por ciudad
- [ ] Sitemap dinámico
- [ ] Meta-tags dinámicos
- [ ] Páginas de categoría

### P4 (Nice to have)
- [ ] Fotos de negocio upload a cloud storage
- [ ] Respuesta a reseñas por negocio
- [ ] Notificaciones push/email
- [ ] App móvil

---

## Test Credentials

### Admin
- Email: zamorachapa50@gmail.com
- Password: (en ADMIN_INITIAL_PASSWORD .env)
- 2FA: Requiere configuración en primer login

### Test User
- Email: test@test.com
- Password: Test123!

### Test Business
- ID: 1bfd49d3-472f-49d6-bc18-78de5c56645b
- Service ID: svc-test-001
- Worker ID: wrk-test-001

---

## Key API Endpoints

### Payments (NEW)
- `POST /api/payments/deposit/checkout` - Crear checkout Stripe
- `GET /api/payments/checkout/status/{session_id}` - Estado
- `GET /api/payments/my-transactions` - Mis transacciones
- `GET /api/payments/business-transactions` - Transacciones negocio
- `POST /api/webhook/stripe` - Webhook de Stripe

### Bookings
- `POST /api/bookings/` - Crear booking (estado HOLD)
- `GET /api/bookings/my` - Mis bookings con can_cancel, hours_until_appointment
- `PUT /api/bookings/{id}/cancel/user` - Cancelar usuario
- `PUT /api/bookings/{id}/cancel/business` - Cancelar negocio
- `PUT /api/bookings/{id}/no-show` - Marcar no-show

---

## Constants
```python
PLATFORM_FEE_PERCENT = 0.08  # 8%
HOLD_EXPIRATION_MINUTES = 30
MIN_DEPOSIT_AMOUNT = 50.0  # MXN
```

## Mocked Features
1. **SMS Verification**: `SMS_PROVIDER=mock` devuelve código en respuesta
2. **File Upload**: Devuelve `uploaded:filename` en lugar de URL de cloud storage
3. **Stripe Refunds**: Lógica de reembolsos registrada pero refund real a Stripe pendiente

---

## Test Reports
- `/app/test_reports/iteration_1.json` - MVP inicial
- `/app/test_reports/iteration_2.json` - Seguridad admin/2FA
- `/app/test_reports/iteration_3.json` - Registro negocios
- `/app/test_reports/iteration_4.json` - **Fase 2 Financiero** ✅
