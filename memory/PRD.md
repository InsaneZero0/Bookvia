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
- **Payments**: Stripe (test keys, listo para producción)
- **SMS**: Mock (configurable para Twilio)

## User Personas
1. **Usuario Final**: Busca y reserva servicios profesionales
2. **Negocio/Profesional**: Ofrece servicios y gestiona citas
3. **Admin**: Gestiona plataforma, aprueba negocios, auditoría

## Core Requirements (Static)
- Sistema de citas con límite 5 activas por usuario
- 4 cancelaciones = suspensión 15 días
- Reagendar permitido >24h antes
- Anticipos con comisión 8%
- Verificación telefónica obligatoria
- Aprobación manual de negocios
- Planes: $49.99 MXN/mes (3 meses trial gratis)
- **NO implementar**: Sistema de referidos

---

## What's Been Implemented ✅

### Fase 1: Seguridad y Fundamentos (P0) - COMPLETADA (Feb 23, 2026)

#### Task 1: Admin desde Variables de Entorno ✅
- Admin creado desde `ADMIN_EMAIL` y `ADMIN_INITIAL_PASSWORD` en `.env`
- Sin credenciales hardcodeadas en código
- Contraseña hasheada con bcrypt

#### Task 2: 2FA TOTP Obligatorio para Admin ✅
- `/api/auth/admin/login` devuelve `requires_2fa_setup: true` si no está configurado
- `/api/auth/admin/setup-2fa` genera QR code y 8 códigos de respaldo
- `/api/auth/admin/verify-2fa` activa 2FA
- Panel admin bloqueado hasta configurar 2FA
- Soporte para códigos de respaldo

#### Task 3: Logs de Auditoría ✅
- Modelo `AuditLogResponse` con: admin_id, admin_email, action, target_type, target_id, details, ip_address, user_agent
- Helper `create_audit_log()` usado en todas las acciones de admin:
  - business_approve, business_reject, business_suspend
  - user_suspend, review_delete, business_feature
  - payment_hold, payment_release, admin_login
- Endpoint `/api/admin/audit-logs` con filtros por action y admin_id

#### Task 4: Registro de Negocios Completo ✅
- Página `/business/register` con formulario de 4 pasos:
  1. Datos del negocio (nombre, email, teléfono, categoría, descripción)
  2. Ubicación (dirección, ciudad, estado, CP, país)
  3. Documentos (razón social, RFC con validación, INE upload, comprobante opcional)
  4. Cuenta (contraseña, CLABE 18 dígitos, opción de anticipo, términos)
- Validaciones en cada paso antes de continuar
- Negocios creados con status `PENDING`
- File upload MOCKEADO (devuelve 'uploaded:filename')

#### Task 5: Panel Admin para Aprobar/Rechazar Negocios ✅
- Dashboard en `/admin` con estadísticas
- Lista de negocios pendientes con botones Aprobar/Rechazar
- Prompt para razón de rechazo
- Logs de auditoría visibles en el panel
- Estadísticas: usuarios, negocios, reservas, ingresos

#### Características Adicionales de Seguridad ✅
- `can_accept_bookings: false` para negocios PENDING
- Bloqueo de reservas en negocios no aprobados
- Endpoints de retención de pagos (`/api/admin/payments/{id}/hold|release`)

### Fase MVP (Completada anteriormente)
- Homepage con búsqueda, categorías, featured businesses
- Páginas de login/registro de usuario
- Sistema de autenticación JWT
- Internacionalización ES/EN
- Tema claro/oscuro
- Búsqueda de negocios
- Perfil de negocio con servicios, trabajadores, reseñas
- Dashboard de usuario con reservas
- Dashboard de negocio
- Sistema de reservas con disponibilidad
- Reseñas con rating bayesiano

---

## Prioritized Backlog

### P1 (Fase 2: Core Financiero)
- [ ] Stripe Checkout completo para anticipos + webhooks
- [ ] Lógica de comisiones (8%), cancelaciones y no-shows
- [ ] Modelo de transacciones en DB
- [ ] Bloqueo de disponibilidad 30 min durante pago

### P2 (Fase 3: Gestión y Operaciones)
- [ ] Job mensual para liquidaciones automáticas
- [ ] Panel financiero para negocios
- [ ] Gestión de trabajadores y horarios UI
- [ ] Asignación automática de citas

### P3 (Fase 4: SEO)
- [ ] URLs amigables
- [ ] Sitemap dinámico
- [ ] Meta-tags dinámicos

### P4 (Nice to have)
- [ ] Fotos de negocio upload a cloud storage
- [ ] Vacaciones/bloqueos de trabajadores UI
- [ ] Respuesta a reseñas por negocio
- [ ] Gestión de métodos de pago del usuario

---

## Credentials

### Admin (desde .env)
- Email: zamorachapa50@gmail.com
- Password: (en ADMIN_INITIAL_PASSWORD)
- 2FA: Configurado (ver test_reports/iteration_2.json para TOTP secret)

### Test Accounts
- Usuarios y negocios de prueba pueden crearse desde formularios

---

## Mocked Features
1. **SMS Verification**: `SMS_PROVIDER=mock` devuelve código en respuesta
2. **File Upload**: Devuelve `uploaded:filename` en lugar de URL de cloud storage
3. **Stripe Payments**: Usa test keys, checkout session funcional pero sin flujo completo

---

## Architecture Files

```
/app/
├── backend/
│   ├── .env (MONGO_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_INITIAL_PASSWORD, etc.)
│   ├── server.py (FastAPI con todos los endpoints)
│   ├── requirements.txt
│   └── tests/
│       ├── test_security_phase1.py
│       └── test_business_registration.py
├── frontend/
│   ├── .env (REACT_APP_BACKEND_URL)
│   ├── src/
│   │   ├── App.js (rutas)
│   │   ├── lib/api.js (endpoints)
│   │   ├── lib/auth.js (AuthProvider)
│   │   ├── lib/i18n.js (traducciones)
│   │   └── pages/
│   │       ├── AdminLoginPage.jsx (con flujo 2FA setup)
│   │       ├── AdminDashboardPage.jsx (stats, pending, audit logs)
│   │       ├── BusinessRegisterPage.jsx (4-step form)
│   │       └── ... (otras páginas)
└── memory/
    └── PRD.md
```

---

## Key API Endpoints

### Auth
- `POST /api/auth/register` - Registro usuario
- `POST /api/auth/login` - Login usuario
- `POST /api/auth/business/register` - Registro negocio (4 campos docs)
- `POST /api/auth/business/login` - Login negocio
- `POST /api/auth/admin/login` - Login admin (requiere 2FA)
- `POST /api/auth/admin/setup-2fa` - Configurar 2FA
- `POST /api/auth/admin/verify-2fa` - Verificar 2FA

### Admin
- `GET /api/admin/stats` - Estadísticas
- `GET /api/admin/businesses/pending` - Negocios pendientes
- `PUT /api/admin/businesses/{id}/approve` - Aprobar
- `PUT /api/admin/businesses/{id}/reject` - Rechazar
- `PUT /api/admin/businesses/{id}/suspend` - Suspender
- `PUT /api/admin/users/{id}/suspend` - Suspender usuario
- `DELETE /api/admin/reviews/{id}` - Eliminar reseña
- `GET /api/admin/audit-logs` - Logs de auditoría
- `PUT /api/admin/payments/{id}/hold` - Retener pago
- `PUT /api/admin/payments/{id}/release` - Liberar pago

### Businesses
- `GET /api/businesses` - Buscar (include_pending=true para ver PENDING)
- `GET /api/businesses/{id}` - Detalle
- `GET /api/businesses/featured` - Destacados
