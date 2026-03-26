# Bookvia - PRD (Product Requirements Document)

## Descripcion General
Bookvia es una plataforma marketplace de reservas profesionales que conecta negocios de servicios (belleza, salud, fitness, etc.) con clientes. La plataforma permite a los negocios registrarse, gestionar servicios, equipo y citas, mientras que los clientes pueden buscar, reservar y pagar anticipos.

## Arquitectura
- **Frontend:** React + Shadcn/UI + React Router + lucide-react
- **Backend:** FastAPI + MongoDB (Motor async)
- **Integraciones:** Stripe (pagos nativos), Cloudinary (imagenes), Emergent Object Storage (fallback), Resend (email - MOCKED)

## Stack Tecnico
```
/app/
├── backend/
│   ├── services/
│   │   ├── cloudinary_service.py
│   │   └── storage.py
│   ├── middleware/
│   │   └── rate_limit.py
│   └── server.py
├── frontend/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api.js
│   │   │   ├── auth.js
│   │   │   └── i18n.js
│   │   ├── pages/
│   │   │   ├── BusinessDashboardPage.jsx
│   │   │   ├── BusinessProfilePage.jsx
│   │   │   ├── BusinessRegisterPage.jsx
│   │   │   ├── BusinessSettingsPage.jsx
│   │   │   ├── ServiceManagementPage.jsx
│   │   │   ├── TeamSchedulePage.jsx
│   │   │   └── ...
│   │   └── App.js
│   └── .env
└── .env (backend)
```

## Funcionalidades Implementadas

### Core
- [x] Autenticacion JWT (usuario y negocio)
- [x] Registro de negocio multi-paso con suscripcion obligatoria (Stripe)
- [x] Sistema de aprobacion de negocios por admin
- [x] Paneles: usuario, negocio, administrador
- [x] Sistema de busqueda con filtros y mapa (Leaflet/OpenStreetMap)
- [x] 2FA para admin (pyotp)

### Reservas
- [x] Flujo multi-paso: Fecha -> Trabajador -> Hora -> Confirmar
- [x] Anticipo con Stripe Checkout (libreria nativa)
- [x] Duracion configurable de servicios
- [x] Bloqueo automatico de agenda
- [x] Cancelacion con politicas configurables

### Gestion de Negocio
- [x] CRUD de servicios con duracion
- [x] Gestion de equipo con fotos de perfil
- [x] Asignacion de servicios por trabajador
- [x] Sistema de cierres/vacaciones
- [x] Gestion de suscripcion (ver estado, cancelar)
- [x] **Tarjetas de estadisticas clickeables** con modal de detalle y filtro por rango de fechas
- [x] **Sistema de veto/blacklist de clientes** (por email, telefono o userId)
- [x] Pagina de configuracion del negocio (/business/settings)
- [x] **Modal de Detalle de Cita/Cliente**: click en nombre del cliente muestra info completa (email, tel, servicio, fecha, monto)

### Imagenes
- [x] Cloudinary como almacenamiento primario (produccion)
- [x] Emergent Object Storage como fallback (preview)
- [x] Logo obligatorio en registro
- [x] Galeria de fotos del negocio

### Blacklist/Veto
- [x] CRUD completo (agregar por email/telefono/userId, listar, eliminar)
- [x] Enforcement en backend: busqueda, perfil por slug, acceso directo, y reservas
- [x] Cliente vetado NO ve el negocio (404 silencioso, sin mensaje de veto)
- [x] UI en /business/settings con formulario y lista

## Bugs Resueltos
- [2026-03-11] Conflicto de rutas Admin vs SEO
- [2026-03-11] Admin login no redirige al panel
- [2026-03-15] cancellation_days no se guardaba en MongoDB
- [2026-03-16] Stripe API: faltaba api_base para proxy Emergent
- [2026-03-16] businessesAPI no importado en BusinessRegisterPage
- [2026-03-17] Stripe: precio cacheado invalido con nueva clave real
- [2026-03-17] .jfif no aceptado como formato de imagen
- [2026-03-17] Fotos legacy sin campo url (compatibilidad storage_path)
- [2026-03-19] Error pago anticipo: migrado de emergentintegrations a stripe nativo
- [2026-03-19] Visibilidad negocios legacy sin subscription_status
- [2026-03-23] P0: Pago de anticipo no confirmaba la reserva (fallback en checkout/status)
- [2026-03-24] Dashboard negocio mostraba 0: `user is not defined` (faltaba destructurar `user` de useAuth)
- [2026-03-24] Boton Completar solo activo al termino de la cita, boton Cancelar agregado, tag muestra quien cancelo
- [2026-03-24] Boton Reagendar cita: modal con calendario y horarios disponibles, libera slot anterior
- [2026-03-24] Bug critico: fechas de citas se mostraban -1 dia en zonas horarias negativas (new Date("YYYY-MM-DD") parseaba como UTC)
- [2026-03-24] Sistema de reseñas: boton "Calificar servicio" con estrellas 1-5 y reseña opcional, visible en perfil del negocio
- [2026-03-25] Modal "Detalle de la cita" en BusinessDashboard: click en nombre del cliente abre modal con nombre, email, telefono, servicio, profesional, fecha, horario, anticipo y total. Testeado al 100%.
- [2026-03-26] Selector de pais en registro de usuario: dropdown con banderas, busqueda, codigo telefonico automatico segun pais, telefono limitado a 10 digitos. Campo 'country' guardado en backend.
- [2026-03-26] Sincronizacion de 75 paises a MongoDB via seed idempotente (upsert). Fuente maestra unica en backend/data/countries.py, espejada en frontend/src/lib/countries.js. Cada pais incluye code, name, phonePrefix, currency, timezone, language, flag, isActive.

## Backlog (P0-P3)

### P1
- [ ] Recuperar contrasena (flujo completo)
- [ ] Activar emails reales (Resend)

### P2
- [ ] Recordatorios de citas (email 24h antes)
- [ ] Login con Google (Emergent-managed)

### P3
- [ ] Convertir a PWA
- [ ] Stripe Connect (pagos a negocios)
- [ ] Notificaciones Push
- [ ] Webhook Stripe (customer.subscription.deleted)
- [ ] Optimizacion imagenes Cloudinary (thumbnails)
- [ ] Aplicacion nativa

## Refactorizacion Pendiente
- [ ] Modularizar server.py en routers separados (auth.py, bookings.py, workers.py, etc.)

## Esquema DB Clave
- **businesses:** subscription_status, approval_status, logo_url, logo_public_id, photos[]
- **workers:** service_ids[], photo_public_id
- **appointments:** worker_id, end_time, duration_minutes, service_name
- **blacklist:** id, business_id, email, phone, user_id, reason, created_at
- **services:** duration_minutes

## Notas Tecnicas
- Stripe usa libreria nativa `stripe` (no emergentintegrations) para compatibilidad con Railway
- Negocios legacy (sin subscription_status) siguen visibles via filtro $or
- Email service (Resend) esta MOCKED, pendiente configuracion
