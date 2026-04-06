# Bookvia - PRD (Product Requirements Document)

## Descripcion General
Bookvia es una plataforma marketplace de reservas profesionales que conecta negocios de servicios con clientes. Permite a los negocios registrarse, gestionar servicios, equipo y citas. Los clientes pueden buscar, reservar y pagar anticipos.

## Arquitectura
- **Frontend:** React + Shadcn/UI + React Router + lucide-react
- **Backend:** FastAPI + MongoDB (Motor async)
- **Integraciones:** Stripe (pagos nativos), Cloudinary (imagenes), Emergent Object Storage (fallback), Resend (email produccion)

## Funcionalidades Implementadas

### Core
- [x] Autenticacion JWT (usuario, negocio, administrador de negocio)
- [x] Registro de negocio multi-paso con suscripcion Stripe
- [x] Aprobacion de negocios por admin
- [x] Paneles: usuario, negocio, admin del sistema
- [x] Busqueda con filtros y mapa (Leaflet/OpenStreetMap)
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

### Sistema de Administradores y PIN (Fase 1 + 2 + 3 COMPLETADAS)
**Fase 1 - Gestion de Administradores:**
- [x] PIN de seguridad del dueno (4-6 digitos)
- [x] Designar trabajador como administrador con permisos granulares
- [x] Permisos: Citas (completar, reagendar, cancelar), Clientes (bloquear, ver datos), Negocio (servicios, perfil, reportes)
- [x] Editar/quitar administrador, configurar PIN

**Fase 2 - Login y Proteccion:**
- [x] Login con PIN para administradores (sub-toggle "Soy el dueno / Soy administrador")
- [x] Dashboard restringido por permisos (tabs, botones, stats filtrados)
- [x] Banner de sesion de administrador
- [x] hasPermission() en AuthContext

**Fase 3 - Historial de Actividad:**
- [x] Coleccion business_activity_logs en MongoDB
- [x] Logging automatico en: completar/cancelar/reagendar citas, designar/quitar/editar admin
- [x] Endpoint GET /api/businesses/my/activity-log con filtros (actor_type, action) y paginacion
- [x] Acceso restringido solo al dueno (403 para admins)
- [x] Pestana "Actividad" en dashboard con filtros, iconos por tipo, badges de actor, paginacion

### Email y Verificacion
- [x] Resend integrado con dominio verificado (bookvia.app)
- [x] Verificacion de email obligatoria al registrarse
- [x] Pagina de exito post-registro (/registration-success)
- [x] Pagina de verificacion (/verify-email?token=xxx)
- [x] Reenvio de correo de verificacion
- [x] Login bloqueado hasta verificar email (backwards compatible con usuarios antiguos)
- [x] Logo con estrella en emails, boton "Comenzar ahora" para negocios
- [x] Correos automaticos desde noreply@bookvia.app, bienvenida desde hola@bookvia.app
- [x] Recuperar contraseña: flujo completo (olvidé → email con link → nueva contraseña → login)

### Internacionalizacion
- [x] Auto-capitalizacion, logo con estrella, deteccion de pais por IP
- [x] 50+ ciudades US, 122+ ciudades para 16 paises

## Backlog

### P0 (Tecnica)
- [ ] Refactorizar server.py (~6000 lineas) en routers modulares

### P1
- [x] Emails transaccionales: confirmacion de cita y cancelacion (enviados automaticamente via Resend)
- [x] Agregar permisos de visibilidad del administrador (Citas hoy, Confirmadas, Agenda, Equipo) — 4 nuevos permisos
- [x] Agregar permisos granulares de edicion de perfil (Fotos, Descripcion, Horarios, Contacto) — 4 nuevos permisos que reemplazan edit_profile
- [x] Sistema de notificaciones: campana en dashboard del negocio con panel dropdown, contador, marcar como leido
- [x] Sistema de notificaciones: campana en Navbar para usuarios regulares (clientes) con panel dropdown
- [ ] Permisos faltantes: Cierres y Suscripcion (tabs aun bloqueados para admins)

### P2
- [ ] Recordatorios de citas (email 24h antes, requiere cronjob)
- [ ] Login con Google (Emergent-managed)

### P3
- [ ] Convertir a PWA
- [ ] Stripe Connect (pagos a negocios)
- [ ] Notificaciones Push

## Esquema DB
- **businesses:** subscription_status, approval_status, owner_pin_hash
- **workers:** is_manager, manager_permissions{15 permisos: complete/reschedule/cancel_bookings, block_clients, view_client_data, edit_services, view_reports, view_today/confirmed_bookings, view_agenda, view_team, edit_photos/description/schedule/contact}, manager_pin_hash
- **business_activity_logs:** business_id, actor_type, actor_name, worker_id, action, target_type, target_id, details, created_at
- **bookings:** worker_id, end_time, status, cancelled_by
- **reviews:** user_id, business_id, booking_id, rating, comment

## Notas Tecnicas
- Timezone: SIEMPRE usar new Date(dateString + 'T12:00:00') para parsear YYYY-MM-DD
- TokenData extendido: worker_id e is_manager para sesiones de administradores
- hasPermission(): true para duenos, checa permisos para admins
- Activity logs: create_business_activity() inyectado en acciones sensibles
