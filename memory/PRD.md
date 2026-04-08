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

### Sistema de Administradores y PIN (Fases 1-3 COMPLETADAS)
- [x] PIN de seguridad, login administrador, permisos granulares (16 permisos)
- [x] Dashboard restringido por permisos
- [x] Historial de actividad (business_activity_logs)

### Email y Verificacion
- [x] Resend integrado con dominio verificado (bookvia.app)
- [x] Verificacion de email, recuperar contrasena
- [x] Correos transaccionales (confirmacion, cancelacion)

### Busqueda y Perfil Publico
- [x] Filtros: categoria, ciudad, calificacion, precio, anticipo, servicio domicilio, destacados
- [x] Busqueda por geolocalizacion ("Cerca de ti" - Haversine)
- [x] "Proximo horario disponible" en tarjetas de negocio (next_available_text)
- [x] Galeria de fotos con carousel swipeable en mobile y lightbox fullscreen en desktop
- [x] Vista Lista / Mapa con markers
- [x] Ordenar por: relevancia, cercania, calificacion, resenas, recientes

### Mobile
- [x] Menu hamburguesa con links a Citas, Favoritos, Notificaciones para usuarios logueados
- [x] Barra de busqueda responsive (stacked en mobile)
- [x] Bottom bar de reserva en perfil de negocio
- [x] Carousel de fotos con indicadores dot y contador

### Internacionalizacion
- [x] Auto-capitalizacion, logo con estrella, deteccion de pais por IP
- [x] 50+ ciudades US, 122+ ciudades para 16 paises

## Backlog

### P0 (Tecnica)
- [ ] Refactorizar server.py (~6500 lineas) en routers modulares

### P1
- [ ] Permisos faltantes: Cierres y Suscripcion (tabs aun bloqueados para admins)

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

## Esquema DB
- **businesses:** subscription_status, approval_status, owner_pin_hash, latitude, longitude
- **workers:** is_manager, manager_permissions (16 permisos), schedule
- **business_activity_logs:** business_id, actor_type, actor_name, action, details
- **bookings:** worker_id, end_time, status, cancelled_by
- **reviews:** user_id, business_id, booking_id, rating, comment
- **notifications:** user_id, title, message, type, is_read, created_at

## Notas Tecnicas
- Timezone: SIEMPRE usar new Date(dateString + 'T12:00:00') para parsear YYYY-MM-DD
- next_available_text: Calculado en backend basado en schedules de workers, no en bookings reales
- TokenData extendido: worker_id e is_manager para sesiones de administradores
- hasPermission(): true para duenos, checa permisos para admins
