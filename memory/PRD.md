# Bookvia - PRD

## Descripcion General
Marketplace de reservas profesionales (Belleza, Salud, Fitness, etc.) en Mexico.
Frontend: React 18, TailwindCSS, Shadcn/UI
Backend: FastAPI, Motor (MongoDB async), Stripe, Resend
Pagos: Stripe Native (anticipos + suscripciones)
Almacenamiento: Emergent Object Storage (fallback para Cloudinary)
Auth Social: Emergent-managed Google Auth (solo clientes)

## Arquitectura del Backend (Post-Refactorizacion)
```
/app/backend/
  server.py                 # App entry (~235 lineas) - lifecycle, middleware, schedulers
  core/
    config.py               # Env vars, constants
    database.py             # MongoDB connection
    security.py             # JWT, bcrypt, TOTP
    dependencies.py         # Auth dependencies (require_auth, require_business, etc.)
    helpers.py              # Shared utilities (generate_id, notifications, ledger, etc.)
    stripe_config.py        # Stripe initialization
  models/
    enums.py                # All enums + constants (UserRole, AppointmentStatus, etc.)
    schemas.py              # All Pydantic models (request/response)
  routers/
    auth.py                 # Login, register, Google Auth, business auth, verification
    users.py                # User profile, favorites
    businesses.py           # Business CRUD, workers, blacklist, subscriptions, photos, closures
    bookings.py             # Availability engine, booking CRUD, reschedule, cancel
    services.py             # Service CRUD
    reviews.py              # Review CRUD
    categories.py           # Category CRUD
    payments.py             # Stripe payments, deposit checkout
    admin.py                # Admin dashboard, approvals, suspensions
    notifications.py        # Notification CRUD
    finance.py              # Finance, settlements
    system.py               # Health, seed, contact, cities, upload, webhook
    seo.py                  # Sitemap, robots.txt
  services/
    email.py                # Resend email templates
    sms.py                  # Twilio SMS
    storage.py              # Emergent Object Storage
    cloudinary_service.py   # Cloudinary fallback
```

## Features Implementadas

### Core
- [x] Autenticacion JWT, registro negocio multi-paso, 2FA admin
- [x] Login con Google (Emergent Auth) para usuarios/clientes
- [x] 2 campos de imagen en registro: Logo + Foto del negocio

### Reservas y Pagos
- [x] Flujo multi-paso con anticipo Stripe Checkout
- [x] Cancelacion con politicas, sistema de resenas
- [x] Reagendar citas (negocio y cliente, solo 24h antes)
- [x] Recordatorios por email 24h antes (scheduler cada 30 min + Resend)
- [x] Registro de negocio: pago de suscripcion como ultimo paso obligatorio
- [x] Recordatorio automatico de suscripcion (email 24h despues si no pagaron)

### Frontend
- [x] Busqueda "Cerca de ti" con OpenStreetMap, horarios apertura, badge Abierto/Cerrado
- [x] Pagina de favoritos, historial de transacciones
- [x] Carrusel de fotos en perfil publico
- [x] Dashboard de negocio con modales de reagendar, detalles cliente
- [x] Panel admin con 2FA, aprobaciones, estadisticas
- [x] Pagina de Recepcion: crear citas walk-in, panel de citas del dia
- [x] Busqueda de clientes existentes en Recepcion (por nombre/telefono)
- [x] Badges "Recepcion" + "Pago en negocio" en citas creadas por el negocio
- [x] Pagina de Configuracion (Settings): 5 tabs - Info, Documentos legales, Suscripcion, Ubicacion, Vetos

### Tecnico
- [x] Refactorizacion backend: server.py ~7000 lineas -> 235 lineas + 12 routers modulares
- [x] Fix scheduler recordatorios: parametros corregidos (date, time, worker_name)

## Tareas Pendientes

### P2
- [ ] Optimizacion UX mobile avanzada

### P3
- [ ] PWA (Progressive Web App)
- [ ] Stripe Connect (payouts automaticos)
- [ ] Chat / Preguntas al negocio
- [ ] Cupones o codigos de descuento
- [ ] Notificaciones Push

## Notas Tecnicas
- Google Login: Usa Emergent Auth (auth.emergentagent.com). Solo para clientes.
- Registro Negocio: Pasos 1-4 datos, Paso 5 pago Stripe. Sin pago login bloqueado (403).
- Recordatorio suscripcion: Scheduler cada 6h, negocios con subscription_status='none' +24h.
- Recordatorios citas: Scheduler cada 30 min, timezone Mexico.
- TIMEZONE PARSING: Siempre usar new Date(dateString + 'T12:00:00') en frontend.
