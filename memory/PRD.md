# Bookvia - PRD (Product Requirements Document)

## Descripcion General
Bookvia es una plataforma marketplace de reservas profesionales que conecta negocios de servicios con clientes.

## Arquitectura
- **Frontend:** React + Shadcn/UI + React Router + lucide-react + Recharts + React-Leaflet
- **Backend:** FastAPI + MongoDB (Motor async)
- **Integraciones:** Stripe (pagos), Emergent Object Storage (imagenes), Resend (email)

## Funcionalidades Implementadas

### Core
- [x] Autenticacion JWT (usuario, negocio, administrador de negocio)
- [x] Registro de negocio multi-paso con suscripcion Stripe
- [x] **2 campos de imagen en registro**: Logo (perfil circular) y Foto del negocio (tarjetas de busqueda)
- [x] Upload publico POST /api/upload/public (sin auth, max 5MB, JPG/PNG/WebP)
- [x] Paneles: usuario, negocio, admin del sistema

### Busqueda y Perfil Publico
- [x] Filtros completos + geolocalizacion "Cerca de ti" con expansion automatica
- [x] cover_photo como imagen principal en tarjetas de busqueda (fallback: photos[0] > logo_url)
- [x] logo_url como avatar circular en perfil del negocio
- [x] Horarios agrupados con badge Abierto/Cerrado
- [x] "Proximo horario disponible" en tarjetas
- [x] Galeria carousel mobile + lightbox desktop
- [x] **Compartir negocio** (WhatsApp + Copiar enlace)

### Area del Cliente (P1 COMPLETADO)
- [x] Pagina de Favoritos dedicada /favorites
- [x] Reagendar cita con modal (calendario + horarios) - solo 24h antes, anticipo preservado
- [x] Historial de pagos /payments con filtros y resumen total
- [x] Dashboard con 5 acciones rapidas (Citas, Favoritos, Pagos, Buscar, Notificaciones)

### Gestion de Negocio
- [x] CRUD servicios, equipo, cierres, suscripcion
- [x] Reportes graficos + exportacion Excel
- [x] Calendario visual / Agenda Timeline
- [x] Mapa ubicacion (Leaflet/OSM)
- [x] Notificaciones (campana)

## Backlog

### P0 (Tecnica)
- [ ] Refactorizar server.py (~6800 lineas) en routers modulares

### P2
- [ ] Recordatorios de citas (email 24h antes)
- [ ] Login con Google (Emergent-managed)
- [ ] Optimizacion UX mobile avanzada

### P3
- [ ] PWA, Stripe Connect, Notificaciones Push, Chat, Cupones

## Notas Tecnicas
- cover_photo: Foto principal del negocio (entrada/local) para tarjetas de busqueda
- logo_url: Logo para avatar circular del perfil
- Si solo suben una imagen, se usa para ambos usos
- Upload publico: POST /api/upload/public acepta JPG/PNG/WebP max 5MB sin auth
