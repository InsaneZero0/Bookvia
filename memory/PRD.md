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
- [x] Busqueda con filtros, mapa (Leaflet/OSM) y geolocalizacion ("Cerca de ti")
- [x] 2FA para admin (pyotp)

### Reservas y Pagos
- [x] Flujo multi-paso con anticipo Stripe Checkout
- [x] Cancelacion con politicas, sistema de resenas
- [x] Completar, Cancelar, Reagendar citas (negocio)

### Gestion de Negocio
- [x] CRUD servicios, equipo, cierres, suscripcion
- [x] Reportes graficos (Recharts) + exportacion Excel
- [x] Calendario visual / Agenda Timeline
- [x] Mapa ubicacion (Leaflet/OSM)
- [x] Notificaciones (campana)

### Busqueda y Perfil Publico
- [x] Filtros: categoria, ciudad, calificacion, precio, anticipo, domicilio, destacados
- [x] Geolocalizacion "Cerca de ti" con expansion automatica de radio
- [x] "Proximo horario disponible" (next_available_text) en tarjetas
- [x] **Horarios de apertura visibles** con agrupacion (Lun-Vie: 9:00-18:00)
- [x] **Badge "Abierto/Cerrado"** en encabezado del perfil y en tarjetas de busqueda
- [x] **Estado en tiempo real**: punto verde pulsante "Abierto" o rojo "Cerrado" + hora de apertura
- [x] **Link "Horarios" en navegacion sticky** del perfil
- [x] Galeria carousel mobile + lightbox desktop
- [x] Vista Lista / Mapa con markers
- [x] Boton Compartir (Web Share API / copiar link)

### Mobile
- [x] Menu con links a Citas, Favoritos, Notificaciones
- [x] Busqueda responsive, bottom bar reserva
- [x] Carousel fotos con dots y contador

## Backlog

### P0 (Tecnica)
- [ ] Refactorizar server.py (~6700 lineas) en routers modulares

### P1 - Area del Cliente
- [ ] Reagendar cita desde el lado del cliente
- [ ] Pagina de Favoritos dedicada (actualmente redirige a SearchPage)
- [ ] Historial de pagos del cliente

### P2
- [ ] Recordatorios de citas (email 24h antes)
- [ ] Login con Google (Emergent-managed)

### P3
- [ ] PWA, Stripe Connect, Notificaciones Push, Chat, Cupones

## Notas Tecnicas
- Timezone: SIEMPRE usar new Date(dateString + 'T12:00:00') para parsear YYYY-MM-DD
- is_open_now: Calculado en backend comparando hora actual Mexico vs schedule de workers
- next_available_text: "Hoy disponible", "Manana HH:MM", "Lun HH:MM"
- getOpenStatus(): Funcion frontend que calcula estado abierto/cerrado y proxima apertura
