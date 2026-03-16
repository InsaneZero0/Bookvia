# Bookvia - PRD (Product Requirements Document)

## Problema Original
Plataforma de marketplace de reservas profesionales "Bookvia". Usuarios buscan y reservan servicios. Negocios gestionan sus servicios y citas. Panel de admin con 2FA.

## Stack Tecnológico
- **Backend:** FastAPI, MongoDB, pyotp (2FA)
- **Frontend:** React, Shadcn/UI, React Router, react-leaflet
- **Pagos:** Stripe (modo prueba)
- **Storage:** Emergent Object Storage API
- **Mapas:** Leaflet + OpenStreetMap
- **Despliegue:** Vercel (frontend), Railway (backend)
- **Email/SMS:** Resend y Twilio (MOCKED)

## Funcionalidades Implementadas
- Registro/Login de usuarios y negocios
- Autenticación JWT con 2FA para administradores
- Pagos con Stripe
- Gestión de trabajadores y equipo
- Sistema de libro contable
- SEO: sitemap.xml, robots.txt, meta-tags dinámicos
- Página de Ayuda con formulario de contacto
- Páginas legales
- Filtros avanzados de búsqueda
- Panel de administración con aprobación de negocios
- Página de perfil de negocio profesional (estilo Fresha/Airbnb)
- Subida de fotos para negocios (Emergent Object Storage)
- Dashboard de negocio mejorado (Agenda, Servicios, Equipo, Fotos)
- Dashboard de usuario mejorado (Citas, Favoritos, Perfil editable)
- Home page profesional (Hero, Stats, Cómo funciona, Ciudades, Testimonios)
- Búsqueda con mapa (Toggle Lista/Mapa, Leaflet/OpenStreetMap)
- **Política de reservas mejorada** (2 opciones con/sin anticipo, cancelación configurable, tooltips de ayuda)
- **Suscripción mensual obligatoria** (Paso 5 en registro de negocios, $39 MXN/mes con 30 días gratis, Stripe Checkout)
- **Calendario de días de cierre** (panel del negocio para marcar días no laborables)

## Bugs Resueltos
- [2026-03-11] Conflicto de rutas Admin vs SEO (P0)
- [2026-03-11] Admin login no redirige al panel (P0)
- [2026-03-15] cancellation_days no se guardaba en MongoDB al registrar negocio
- [2026-03-16] Stripe API no se conectaba: faltaba configurar api_base para proxy de Emergent
- [2026-03-16] businessesAPI no estaba importado en BusinessRegisterPage.jsx (Step 5 crasheaba)

## Backlog Priorizado
### P1
- Recuperar contraseña (flujo "olvidé mi contraseña")
- Activar emails reales (configurar Resend)

### P2
- Recordatorios de citas (email 24h antes)
- Login con Google
- Notificaciones in-app

### P3
- PWA, Stripe Connect, Notificaciones push, App móvil, Modo oscuro

## Refactorización Pendiente
- Migrar lógica de backend/server.py a archivos separados en backend/routers/
