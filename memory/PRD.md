# Bookvia - PRD (Product Requirements Document)

## Problema Original
Plataforma de marketplace de reservas profesionales "Bookvia". Usuarios buscan y reservan servicios. Negocios gestionan sus servicios y citas. Panel de admin con 2FA.

## Stack Tecnologico
- **Backend:** FastAPI, MongoDB, pyotp (2FA)
- **Frontend:** React, Shadcn/UI, React Router, react-leaflet
- **Pagos:** Stripe (modo prueba, proxy Emergent)
- **Storage:** Emergent Object Storage API
- **Mapas:** Leaflet + OpenStreetMap
- **Despliegue:** Vercel (frontend), Railway (backend)
- **Email/SMS:** Resend y Twilio (MOCKED)

## Funcionalidades Implementadas
- Registro/Login de usuarios y negocios
- Autenticacion JWT con 2FA para administradores
- Pagos con Stripe (anticipos + suscripciones)
- Gestion de trabajadores y equipo
- Sistema de libro contable
- SEO: sitemap.xml, robots.txt, meta-tags dinamicos
- Paginas de Ayuda, legales, perfil negocio, busqueda, inicio
- Panel de administracion con aprobacion de negocios
- Subida de fotos para negocios (Emergent Object Storage)
- Dashboard de negocio mejorado (Agenda, Servicios, Equipo, Fotos, Cierres, **Suscripcion**)
- Dashboard de usuario mejorado (Citas, Favoritos, Perfil editable)
- Home page profesional (Hero, Stats, Como funciona, Ciudades, Testimonios)
- Busqueda con mapa (Toggle Lista/Mapa, Leaflet/OpenStreetMap)
- Politica de reservas mejorada (con/sin anticipo, cancelacion configurable)
- Calendario de dias de cierre
- **Suscripcion mensual OBLIGATORIA** ($39 MXN/mes, 30 dias gratis, Stripe Checkout)
  - Registro de tarjeta obligatorio en Paso 5 (sin opcion de omitir)
  - Pagina de exito muestra "pendiente de aprobacion admin"
  - Tab de Suscripcion en dashboard del negocio (estado, proximo cobro, cancelar)
  - Endpoint de cancelacion de suscripcion
- **Logica de visibilidad publica**: Solo negocios con:
  - `status = approved` (aprobado por admin)
  - `subscription_status in (active, trialing)` (suscripcion al corriente)
  aparecen en busqueda, categorias, featured y listados publicos

## Modelo de Datos - Campos Clave de Negocio
- `status`: pending | approved | suspended | rejected
- `subscription_status`: none | trialing | active | past_due | canceled | unpaid
- `stripe_customer_id`, `stripe_subscription_id`

## Endpoints Clave de Suscripcion
- `POST /api/businesses/me/subscribe` - Crea sesion Stripe Checkout
- `GET /api/businesses/me/subscription/status` - Estado de suscripcion con detalles Stripe
- `POST /api/businesses/me/subscription/cancel` - Cancela al final del periodo

## Bugs Resueltos
- [2026-03-11] Conflicto de rutas Admin vs SEO (P0)
- [2026-03-11] Admin login no redirige al panel (P0)
- [2026-03-15] cancellation_days no se guardaba en MongoDB
- [2026-03-16] Stripe API: faltaba api_base para proxy Emergent
- [2026-03-16] businessesAPI no importado en BusinessRegisterPage.jsx

## Backlog Priorizado
### P1
- Recuperar contrasena (flujo "olvide mi contrasena")
- Activar emails reales (configurar Resend - pendiente dominio)

### P2
- Recordatorios de citas (email 24h antes)
- Login con Google
- Notificaciones in-app

### P3
- PWA, Stripe Connect, Notificaciones push, App movil, Modo oscuro

## Refactorizacion Pendiente
- Migrar logica de backend/server.py a archivos separados en backend/routers/
