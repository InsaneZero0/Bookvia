# Bookvia - PRD (Product Requirements Document)

## Descripcion General
Bookvia es una plataforma marketplace de reservas profesionales que conecta negocios de servicios con clientes.

## Arquitectura
- **Frontend:** React + Shadcn/UI + React Router + lucide-react + Recharts + React-Leaflet
- **Backend:** FastAPI + MongoDB (Motor async)
- **Integraciones:** Stripe (pagos), Emergent Object Storage (imagenes), Resend (email)

## Funcionalidades Implementadas

### Core
- [x] Autenticacion JWT, registro negocio multi-paso, 2FA admin
- [x] Login con Google (Emergent Auth) para usuarios/clientes
- [x] 2 campos de imagen en registro: Logo + Foto del negocio
- [x] Upload publico POST /api/upload/public

### Reservas y Pagos
- [x] Flujo multi-paso con anticipo Stripe Checkout
- [x] Cancelacion con politicas, sistema de resenas
- [x] Reagendar citas (negocio y cliente, solo 24h antes)
- [x] **Recordatorios por email 24h antes** (scheduler cada 30 min + Resend)
- [x] **Registro de negocio: pago de suscripcion como ultimo paso obligatorio** (sin pagar no pueden hacer login, correo de verificacion se envia despues del pago)

### Busqueda y Perfil Publico
- [x] Filtros + geolocalizacion, horarios agrupados, Abierto/Cerrado
- [x] cover_photo en tarjetas, logo_url en avatar circular
- [x] Compartir negocio (WhatsApp + Copiar enlace)

### Area del Cliente
- [x] Favoritos dedicada /favorites
- [x] Historial de pagos /payments
- [x] Dashboard con 5 acciones rapidas

### Gestion de Negocio
- [x] CRUD servicios, equipo, cierres, suscripcion
- [x] Reportes graficos + Excel, Calendario/Agenda Timeline
- [x] Mapa ubicacion, Notificaciones (campana)

## Backlog

### P0 (Tecnica)
- [ ] Refactorizar server.py (~7000 lineas) en routers modulares

### P2
- [x] Login con Google (Emergent-managed) - Solo para clientes/usuarios
- [ ] Optimizacion UX mobile avanzada

### P3
- [ ] PWA, Stripe Connect, Notificaciones Push, Chat, Cupones

## Notas Tecnicas
- Google Login: Usa Emergent Auth (auth.emergentagent.com). Solo para clientes. Callback en /auth/google/callback. Backend valida session_id con Emergent API.
- Registro Negocio: Pasos 1-4 guardan datos, Paso 5 redirige a Stripe. Sin pago, login bloqueado (403 subscription_required). Tras pago, se envia email de verificacion.
- Endpoints sin auth para registro: POST /api/auth/business/create-subscription, POST /api/auth/business/verify-subscription
- Recordatorios: Scheduler asyncio cada 30 min, busca citas confirmadas para manana (timezone Mexico)
- reminder_sent: Campo bool en bookings para evitar duplicados
- Endpoint admin: POST /api/bookings/send-reminders para disparar manualmente
