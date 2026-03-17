# Bookvia - PRD (Product Requirements Document)

## Problema Original
Plataforma de marketplace de reservas profesionales "Bookvia". Usuarios buscan y reservan servicios. Negocios gestionan sus servicios y citas. Panel de admin con 2FA.

## Stack Tecnologico
- **Backend:** FastAPI, MongoDB, pyotp (2FA), cloudinary
- **Frontend:** React, Shadcn/UI, React Router, react-leaflet
- **Pagos:** Stripe (modo prueba real con sk_test_51...)
- **Imagenes:** Cloudinary (produccion) + Emergent Object Storage (preview/fallback)
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
- Dashboard de negocio (Agenda, Servicios, Equipo, Fotos, Cierres, Suscripcion)
- Dashboard de usuario (Citas, Favoritos, Perfil editable)
- Home page profesional
- Busqueda con mapa (Leaflet/OpenStreetMap)
- Politica de reservas mejorada
- Calendario de dias de cierre
- Suscripcion mensual OBLIGATORIA ($39 MXN/mes, 30 dias gratis, Stripe Checkout)
- Logica de visibilidad publica (approved + subscription active/trialing)
- **Cloudinary para imagenes:**
  - Logo de negocio (obligatorio en registro, step 1)
  - Galeria de fotos del negocio
  - Estructura: bookvia/businesses/logos/, bookvia/businesses/gallery/
  - Solo se guarda secure_url y public_id en MongoDB
  - Soporte para .jfif, .jpg, .jpeg, .png, .webp
  - Eliminacion de imagenes en Cloudinary al borrar fotos

## Modelo de Datos - Campos Clave
- `businesses.logo_url`: URL del logo en Cloudinary
- `businesses.logo_public_id`: public_id para gestion en Cloudinary
- `businesses.photos[]`: Array de URLs de galeria
- `businesses.subscription_status`: none | trialing | active | past_due | canceled | unpaid
- `business_photos`: Coleccion con url, public_id, storage type, is_deleted

## Endpoints de Imagenes
- `POST /api/businesses/me/photos` - Subir foto a galeria
- `POST /api/businesses/me/logo` - Subir/reemplazar logo
- `DELETE /api/businesses/me/photos/{id}` - Eliminar foto
- `GET /api/businesses/me/photos` - Listar fotos
- `POST /api/upload/image` - Upload generico

## Variables de Entorno Requeridas (Railway)
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `STRIPE_API_KEY` (clave real sk_test_51...)
- `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `CORS_ORIGINS`

## Bugs Resueltos
- [2026-03-11] Conflicto de rutas Admin vs SEO
- [2026-03-11] Admin login no redirige al panel
- [2026-03-15] cancellation_days no se guardaba en MongoDB
- [2026-03-16] Stripe API: faltaba api_base para proxy Emergent
- [2026-03-16] businessesAPI no importado en BusinessRegisterPage
- [2026-03-17] Stripe: precio cacheado invalido con nueva clave real
- [2026-03-17] .jfif no aceptado como formato de imagen
- [2026-03-17] Fotos legacy sin campo url (compatibilidad storage_path)

## Backlog Priorizado
### P1
- Recuperar contrasena (flujo "olvide mi contrasena")
- Activar emails reales (configurar Resend - pendiente dominio)

### P2
- Recordatorios de citas (email 24h antes)
- Login con Google
- Notificaciones in-app

### P3
- PWA, Stripe Connect, Notificaciones push, App movil

## Refactorizacion Pendiente
- Migrar logica de backend/server.py a archivos separados en backend/routers/
