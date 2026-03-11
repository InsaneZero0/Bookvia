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
- **Página de perfil de negocio profesional** (estilo Fresha/Airbnb/OpenTable)

## Página de Perfil de Negocio (Rediseño completo - 2026-03-11)
### Secciones implementadas:
1. Galería de fotos estilo Airbnb (grid 4x2 en desktop, imagen única en mobile)
2. Header con nombre, categoría, badges, rating, dirección, botones Guardar/Compartir
3. Navegación sticky por secciones (Servicios, Equipo, Reseñas, Ubicación)
4. Servicios disponibles con precio, duración y botón de reserva
5. Equipo/profesionales con foto, nombre y especialidad
6. Acerca del negocio con estadísticas (citas completadas, rating, profesionales)
7. Horarios de apertura (derivados de horarios de trabajadores)
8. Ubicación con mapa OpenStreetMap y botón "Cómo llegar"
9. Reseñas con resumen de calificación y distribución por estrellas
10. FAQ con accordion
11. Negocios similares de la misma categoría
12. Panel de reserva lateral sticky (desktop)
13. Barra de reserva fija en mobile
14. Diálogo de reserva de 3 pasos (fecha → hora → confirmar)

## Bugs Resueltos
- **[2026-03-11] Conflicto de rutas Admin vs SEO (P0):** Corregido reordenando rutas en App.js
- **[2026-03-11] Admin login no redirige al panel (P0):** Corregidos 3 bugs (double API call, totp_enabled faltante, interceptor axios)
- **[2026-03-11] Rediseño perfil negocio:** Completado satisfactoriamente

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
