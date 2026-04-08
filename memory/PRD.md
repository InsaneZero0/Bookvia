# Bookvia - PRD (Product Requirements Document)

## Descripcion General
Bookvia es una plataforma marketplace de reservas profesionales que conecta negocios de servicios con clientes.

## Arquitectura
- **Frontend:** React + Shadcn/UI + React Router + lucide-react + Recharts + React-Leaflet
- **Backend:** FastAPI + MongoDB (Motor async)
- **Integraciones:** Stripe (pagos), Emergent Object Storage (fallback), Resend (email)

## Funcionalidades Implementadas

### Core
- [x] Autenticacion JWT (usuario, negocio, administrador de negocio)
- [x] Registro de negocio multi-paso con suscripcion Stripe
- [x] Paneles: usuario, negocio, admin del sistema
- [x] Busqueda con filtros, mapa (Leaflet/OSM) y geolocalizacion
- [x] 2FA para admin (pyotp)

### Reservas y Pagos
- [x] Flujo multi-paso con anticipo Stripe Checkout
- [x] Cancelacion con politicas, sistema de resenas
- [x] Completar, Cancelar, Reagendar citas (negocio)
- [x] **Reagendar cita desde el cliente** (solo 24h antes, sin pagar otro anticipo)

### Gestion de Negocio
- [x] CRUD servicios, equipo, cierres, suscripcion
- [x] Reportes graficos + exportacion Excel
- [x] Calendario visual / Agenda Timeline
- [x] Mapa ubicacion (Leaflet/OSM)
- [x] Notificaciones (campana)

### Busqueda y Perfil Publico
- [x] Filtros completos + geolocalizacion "Cerca de ti" con expansion automatica
- [x] "Proximo horario disponible" en tarjetas
- [x] Horarios agrupados con badge Abierto/Cerrado
- [x] Galeria carousel mobile + lightbox desktop
- [x] **Compartir negocio** (WhatsApp + Copiar enlace)

### Area del Cliente (P1 COMPLETADO)
- [x] Pagina de Favoritos dedicada /favorites
- [x] **Reagendar cita** con modal (calendario + horarios) - solo 24h antes, anticipo preservado
- [x] **Historial de pagos** /payments con filtros y resumen de total pagado
- [x] **Compartir negocio** (WhatsApp + Copiar enlace) en perfil publico
- [x] Dashboard con 5 acciones rapidas (Citas, Favoritos, Pagos, Buscar, Notificaciones)

### Mobile
- [x] Menu con links a Citas, Favoritos, Notificaciones
- [x] Busqueda responsive, bottom bar reserva
- [x] Carousel fotos con dots y contador

## Backlog

### P0 (Tecnica)
- [ ] Refactorizar server.py (~6700 lineas) en routers modulares

### P2
- [ ] Recordatorios de citas (email 24h antes)
- [ ] Login con Google (Emergent-managed)
- [ ] Optimizacion UX mobile avanzada

### P3
- [ ] PWA, Stripe Connect, Notificaciones Push, Chat, Cupones
