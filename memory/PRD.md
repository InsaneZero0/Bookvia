# Bookvia - PRD (Product Requirements Document)

## Problema Original
Plataforma de marketplace de reservas profesionales llamada "Bookvia". Los usuarios pueden buscar y reservar servicios profesionales. Los negocios pueden registrarse y gestionar sus servicios. Incluye panel de administración con 2FA.

## Stack Tecnológico
- **Backend:** FastAPI, MongoDB, pyotp (2FA)
- **Frontend:** React, Shadcn/UI, React Router
- **Pagos:** Stripe (modo prueba)
- **Despliegue:** Vercel (frontend), Railway (backend)
- **Email/SMS:** Resend y Twilio (MOCKED)

## Funcionalidades Implementadas
- Registro/Login de usuarios y negocios
- Autenticación JWT con 2FA para administradores
- Pagos con Stripe
- Gestión de trabajadores y equipo
- Sistema de libro contable
- SEO: sitemap.xml, robots.txt, meta-tags dinámicos
- Rutas SEO: /:country, /:country/:city, /:country/:city/:category
- Página de Ayuda con formulario de contacto
- Páginas legales: Sobre Nosotros, Términos, Privacidad
- Filtros avanzados de búsqueda
- Panel de administración con aprobación de negocios

## Bugs Resueltos
- **[2026-03-11] Conflicto de rutas Admin vs SEO (P0):** Las rutas admin (/admin, /admin/login, /admin/setup-2fa) eran interceptadas por rutas dinámicas SEO. Corregido reordenando rutas en App.js y añadiendo catch-all /admin/*.
- **[2026-03-11] Admin login no redirige al panel (P0):** Después de login exitoso, el usuario veía "Bienvenido Admin" pero no era redirigido. Causa: 1) Double API call causando rate limiting, 2) UserResponse no incluía totp_enabled (causando redirect loop), 3) Interceptor axios redirigía a /login en 401 de endpoints auth.

## Backlog Priorizado
### P1
- Recuperar contraseña (flujo "olvidé mi contraseña")
- Activar emails reales (configurar Resend)

### P2
- Recordatorios de citas (email 24h antes)
- Subida de fotos para negocios
- Login con Google

### P3
- Convertir a PWA
- Stripe Connect para pagos automáticos
- Notificaciones push
- App móvil nativa

## Refactorización Pendiente
- Migrar lógica de backend/server.py a archivos separados en backend/routers/
