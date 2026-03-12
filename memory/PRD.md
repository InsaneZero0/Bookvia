# Bookvia - PRD (Product Requirements Document)

## Problema Original
Plataforma de marketplace de reservas profesionales "Bookvia". Usuarios buscan y reservan servicios. Negocios gestionan sus servicios y citas. Panel de admin con 2FA.

## Stack Tecnológico
- **Backend:** FastAPI, MongoDB, pyotp (2FA)
- **Frontend:** React, Shadcn/UI, React Router, react-leaflet
- **Pagos:** Stripe (modo prueba)
- **Storage:** Emergent Object Storage API
- **Mapas:** Leaflet + OpenStreetMap (sin API key)
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
- **Home page profesional** (Hero, Stats, Cómo funciona, Ciudades, Testimonios, Trust badges)
- **Búsqueda con mapa** (Toggle Lista/Mapa, Leaflet/OpenStreetMap, markers interactivos)

## Backlog Priorizado
### P1
- Recuperar contraseña (flujo "olvidé mi contraseña")
- Activar emails reales (configurar Resend)

### P2
- Recordatorios de citas (email 24h antes)
- Login con Google
- Notificaciones in-app

### P3
- Convertir a PWA
- Stripe Connect para pagos automáticos
- Notificaciones push
- App móvil nativa
- Modo oscuro pulido
- Animaciones y transiciones avanzadas

## Refactorización Pendiente
- Migrar lógica de backend/server.py a archivos separados en backend/routers/
