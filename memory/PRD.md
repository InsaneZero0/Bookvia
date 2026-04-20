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
    admin.py                # Admin dashboard, approvals, suspensions, detail, reviews, subscriptions
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
- [x] Pagina de Recepcion: crear citas walk-in, panel de citas del dia
- [x] Busqueda de clientes existentes en Recepcion (por nombre/telefono)
- [x] Badges "Recepcion" + "Pago en negocio" en citas creadas por el negocio
- [x] Pagina de Configuracion (Settings): 6 tabs - Info, Horarios, Documentos legales, Suscripcion, Ubicacion, Vetos
- [x] Edicion de horarios de apertura/cierre por dia del negocio (sincroniza con horarios de trabajadores)
- [x] Buscador de direccion con mapa en registro de negocio (Nominatim + OpenStreetMap, auto-rellena campos, guarda lat/lng)
- [x] Mapa interactivo Leaflet con marcador arrastrable en registro y configuracion (reemplaza iframe estatico)
- [x] Google Maps integrado: mapa interactivo con marcador arrastrable (registro, configuracion), mapa estatico (perfil publico), busqueda de direcciones con Google Places Autocomplete, mapa de resultados de busqueda
- [x] Campo separado de "Num. ext." en registro para direcciones mas precisas

### Panel Admin (2FA con TOTP)
- [x] 12 tabs: Resumen, Negocios, Usuarios, Resenas, Categorias, Rankings, Ciudades, Configuracion, Soporte, Reportes, Suscripciones, Finanzas (+1 Equipo solo Super Admin = 13 total)
- [x] Vista Detalle de Negocio (Dialog): info general, documentos legales (RFC, CLABE, INE, CURP), suscripcion, propietario, servicios, trabajadores, resenas
- [x] Aprobar/Rechazar/Suspender negocios desde detalle o listado
- [x] Moderacion de resenas: buscar, paginar y eliminar resenas inapropiadas
- [x] Gestion de Suscripciones: resumen por estado + listado de negocios con suscripcion
- [x] Gestion de Usuarios: buscar, paginar, suspender
- [x] Finanzas: liquidaciones, generar settlements, marcar como pagado, exportar CSV
- [x] Audit logs
- [x] Estadisticas de Crecimiento: 3 graficas interactivas (Registros por mes, Reservas por mes, Ingresos por mes) con recharts
- [x] Gestion de Categorias CRUD: crear, editar, eliminar categorias con auto-slug, validacion de slug duplicado, bloqueo de eliminacion si negocios la usan
- [x] Categoria "Otro": cuando un negocio no encuentra su categoria, selecciona "Otro" + describe su tipo de negocio. Admin puede reasignar la categoria desde el detalle del negocio
- [x] Configuracion de Plataforma: comision %, precio suscripcion, dias prueba, deposito minimo (con validacion de rangos)
- [x] Panel de Soporte: lista de tickets con stats, filtros, busqueda, conversacion admin-usuario, responder y cerrar tickets
- [x] Rankings: top negocios por reservas, mejor calificados, ciudades mas activas, categorias populares (solo negocios aprobados)
- [x] Alertas Admin: seccion en Resumen con alertas automaticas (pendientes, tickets abiertos, resenas negativas, suscripciones vencidas, negocios sin suscripcion, pagos retenidos)
- [x] Gestion de Ciudades: listar 162 ciudades con busqueda, filtro activa/inactiva, toggle activar/desactivar con audit log
- [x] Reportes Personalizados: filtros por fecha, ciudad, categoria. Resumen (reservas, ingresos, cancelaciones, usuarios), grafica diaria, top negocios y ciudades del periodo
- [x] Sistema de Staff/Sub-Admin: crear, editar, eliminar miembros de equipo con permisos granulares por tab. Staff login sin 2FA. Super Admin tiene acceso total + tab Equipo exclusivo. Reseteo de contrasena.

### Experiencia del Cliente
- [x] Stats del usuario en dashboard: total reservas, gasto total, citas pendientes, rating promedio dado, resenas
- [x] Seccion "Reservar de nuevo" con servicios completados recientes (acceso rapido a negocio)

### Dashboard del Negocio
- [x] Resumen rapido del dia/semana/mes con ingresos, citas, % cambio semanal, clientes unicos, resenas nuevas

### Tecnico
- [x] Refactorizacion backend: server.py ~7000 lineas -> 235 lineas + 12 routers modulares
- [x] Fix scheduler recordatorios: parametros corregidos (date, time, worker_name)
- [x] Fix funcion calculate_fees perdida en refactorizacion
- [x] Fix schema ClosureDateCreate corrupto
- [x] Fix imports faltantes de cloudinary_service en routers
- [x] Fix validate_schedule_blocks perdida en refactorizacion
- [x] Fix is_exception_blocking perdida
- [x] Fix send_pending_reminders, expire_holds_task y generate_monthly_settlements perdidas
- [x] Auditoria completa AST: 0 funciones indefinidas en todos los routers
- [x] Fix ADMIN_INITIAL_PASSWORD no importado en system.py
- [x] Fix pyotp no importado en auth.py

## Tareas Pendientes

### P0 - Seguridad (antes de lanzamiento publico)
- [ ] Cloudflare delante del dominio (DDoS, WAF, oculta IP Railway)
- [ ] Rate limiting backend con slowapi (2-3h dev)
- [ ] Proteccion fuerza bruta login (bloqueo tras 5 intentos + CAPTCHA) (3-4h dev)
- [ ] reCAPTCHA v3 en formularios criticos (registro, login, contacto) (2-3h dev)
- [ ] Headers HSTS + security headers (15min dev)
- [ ] Sentry integration para monitoreo errores (1h dev)
- [ ] Logs de auditoria de acciones admin (4-6h dev)
- [ ] Backups automaticos MongoDB Atlas verificados

### P0 - Decisiones pendientes usuario
- [ ] Rebranding "Bookvia" (VIA registrada IMPI clase 9) - esperando decision
- [ ] Acceso privado staging: Cloudflare Access (gratis 50 users) para beta cerrada

### P1
- [ ] Integracion WhatsApp/SMS con Twilio (recordatorios citas)
- [ ] Precios suscripcion $199 MXN / $19.99 USD + Stripe Billing
- [ ] Optimizacion UX mobile avanzada

### P2
- [ ] Refactor AdminDashboardPage.jsx (+2400 lineas) en componentes de tabs

### P3
- [ ] PWA (Progressive Web App)
- [ ] Stripe Connect (payouts automaticos - pausado hasta resolver estructura fiscal)
- [ ] Chat / Preguntas al negocio
- [ ] Cupones o codigos de descuento
- [ ] Notificaciones Push navegador

## Notas Tecnicas
- Google Login: Usa Emergent Auth (auth.emergentagent.com). Solo para clientes.
- Registro Negocio: Pasos 1-4 datos, Paso 5 pago Stripe. Sin pago login bloqueado (403).
- Recordatorio suscripcion: Scheduler cada 6h, negocios con subscription_status='none' +24h.
- Recordatorios citas: Scheduler cada 30 min, timezone Mexico.
- TIMEZONE PARSING: Siempre usar new Date(dateString + 'T12:00:00') en frontend.
- Admin TOTP: usar script /app/scripts/get_admin_totp.py para generar codigos.
