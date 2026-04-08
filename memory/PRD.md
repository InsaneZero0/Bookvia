# Bookvia - PRD (Product Requirements Document)

## Descripcion General
Bookvia es una plataforma marketplace de reservas profesionales que conecta negocios de servicios con clientes. Permite a los negocios registrarse, gestionar servicios, equipo y citas. Los clientes pueden buscar, reservar y pagar anticipos.

## Arquitectura
- **Frontend:** React + Shadcn/UI + React Router + lucide-react + Recharts + React-Leaflet
- **Backend:** FastAPI + MongoDB (Motor async)
- **Integraciones:** Stripe (pagos nativos), Cloudinary (imagenes), Emergent Object Storage (fallback), Resend (email produccion)

## Funcionalidades Implementadas

### Core
- [x] Autenticacion JWT (usuario, negocio, administrador de negocio)
- [x] Registro de negocio multi-paso con suscripcion Stripe
- [x] Aprobacion de negocios por admin
- [x] Paneles: usuario, negocio, admin del sistema
- [x] Busqueda con filtros, mapa (Leaflet/OpenStreetMap) y geolocalizacion ("Cerca de ti")
- [x] Smart Dropdowns en Hero
- [x] 2FA para admin (pyotp)

### Reservas
- [x] Flujo multi-paso con anticipo Stripe Checkout
- [x] Duracion configurable, bloqueo de agenda
- [x] Cancelacion con politicas, sistema de resenas

### Gestion de Negocio
- [x] CRUD servicios, equipo, cierres, suscripcion
- [x] Stats clickeables, veto/blacklist, modal detalle cita/cliente
- [x] Completar, Cancelar, Reagendar citas
- [x] Reportes graficos (Recharts) con exportacion a Excel (openpyxl)
- [x] Historial de cliente (ultimas 5 citas, total gastado)
- [x] Calendario visual / Agenda Timeline con bloques de colores
- [x] Mapa de ubicacion del negocio (Leaflet/OpenStreetMap)
- [x] Notificaciones (campana) para duenos y clientes

### Busqueda y Perfil Publico
- [x] Filtros: categoria, ciudad, calificacion, precio, anticipo, servicio domicilio, destacados
- [x] Busqueda por geolocalizacion ("Cerca de ti" - Haversine) con expansion automatica de radio
- [x] Auto-limpieza de filtros restrictivos al buscar por cercania
- [x] Banner informativo de rango de distancia
- [x] "Proximo horario disponible" en tarjetas de negocio (next_available_text)
- [x] Galeria de fotos con carousel swipeable en mobile y lightbox fullscreen en desktop
- [x] Vista Lista / Mapa con markers
- [x] Ordenar por: relevancia, cercania, calificacion, resenas, recientes

### Mobile
- [x] Menu hamburguesa con links a Citas, Favoritos, Notificaciones para usuarios logueados
- [x] Barra de busqueda responsive (stacked en mobile)
- [x] Bottom bar de reserva en perfil de negocio
- [x] Carousel de fotos con indicadores dot y contador

## Backlog

### P0 (Tecnica)
- [ ] Refactorizar server.py (~6600 lineas) en routers modulares

### P1 - Area del Cliente
- [ ] Reagendar cita desde el lado del cliente
- [ ] Horarios del negocio visibles en perfil publico (tabla clara)
- [ ] Compartir negocio (WhatsApp, copiar link)
- [ ] Pagina de favoritos dedicada
- [ ] Historial de pagos del cliente

### P2
- [ ] Recordatorios de citas (email 24h antes, requiere cronjob)
- [ ] Login con Google (Emergent-managed)
- [ ] Optimizacion UX mobile avanzada

### P3
- [ ] Convertir a PWA
- [ ] Stripe Connect (pagos a negocios)
- [ ] Notificaciones Push
- [ ] Chat / Preguntas al negocio antes de reservar
- [ ] Cupones o codigos de descuento

## Notas Tecnicas
- Timezone: SIEMPRE usar new Date(dateString + 'T12:00:00') para parsear YYYY-MM-DD
- next_available_text: Calculado en backend basado en schedules de workers
- Cerca de ti: Al activar, limpia filtros restrictivos (city, category, rating, featured) y aumenta limit x3
