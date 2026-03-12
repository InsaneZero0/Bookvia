# Bookvia - PRD (Product Requirements Document)

## Problema Original
Plataforma de marketplace de reservas profesionales llamada "Bookvia". Los usuarios pueden buscar y reservar servicios profesionales. Los negocios pueden registrarse y gestionar sus servicios. Incluye panel de administración con 2FA.

## Stack Tecnológico
- **Backend:** FastAPI, MongoDB, pyotp (2FA)
- **Frontend:** React, Shadcn/UI, React Router
- **Pagos:** Stripe (modo prueba)
- **Storage:** Emergent Object Storage API
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
- **Subida de fotos para negocios** (Emergent Object Storage)
- **Dashboard de negocio mejorado** (Agenda, Servicios, Equipo, Fotos)
- **Dashboard de usuario mejorado** (Citas, Favoritos, Perfil editable)

## Implementaciones Recientes (2026-03-12)

### Subida de Fotos para Negocios
- Backend: POST/GET/DELETE /api/businesses/me/photos
- Backend: GET /api/files/{path} para servir archivos
- Storage: Integración con Emergent Object Storage API
- Frontend: Tab de Fotos en el dashboard con upload múltiple y eliminación
- Validación: Solo JPEG/PNG/WebP/GIF, máximo 5MB

### Dashboard del Negocio Mejorado
- Header con avatar, nombre, status, rating
- 4 tarjetas de estadísticas (Citas hoy, Pendientes, Ingresos, Total)
- 4 tabs: Agenda (calendario + citas), Servicios, Equipo, Fotos
- Gestión de citas por día (confirmar, completar, cancelar)
- Vista de servicios con precios
- Vista de equipo con estados activo/inactivo
- Galería de fotos con upload y eliminación

### Dashboard del Usuario Mejorado
- Header con avatar, nombre, estado de verificación
- 4 quick actions (Citas, Favoritos, Buscar, Notificaciones)
- Sección de próximas citas (top 3)
- Sección de favoritos (top 4)
- Panel lateral con información personal editable
- Estadísticas (citas activas, cancelaciones, favoritos)

## Bugs Resueltos
- [2026-03-11] Conflicto de rutas Admin vs SEO (P0)
- [2026-03-11] Admin login no redirige al panel (P0)
- [2026-03-11] Rediseño perfil negocio

## Backlog Priorizado
### P1
- Recuperar contraseña (flujo "olvidé mi contraseña")
- Activar emails reales (configurar Resend)

### P2
- Recordatorios de citas (email 24h antes)
- Login con Google
- Mejorar página de inicio (Hero, "Cómo funciona", testimonios)
- Mejorar búsqueda (mapa lateral, toggle lista/mapa)

### P3
- Convertir a PWA
- Stripe Connect para pagos automáticos
- Notificaciones push/in-app
- App móvil nativa
- Modo oscuro pulido

## Refactorización Pendiente
- Migrar lógica de backend/server.py a archivos separados en backend/routers/
