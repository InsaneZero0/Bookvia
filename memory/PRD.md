# Bookvia - PRD (Product Requirements Document)

## Descripcion General
Bookvia es una plataforma marketplace de reservas profesionales que conecta negocios de servicios (belleza, salud, fitness, etc.) con clientes. La plataforma permite a los negocios registrarse, gestionar servicios, equipo y citas, mientras que los clientes pueden buscar, reservar y pagar anticipos.

## Arquitectura
- **Frontend:** React + Shadcn/UI + React Router + lucide-react
- **Backend:** FastAPI + MongoDB (Motor async)
- **Integraciones:** Stripe (pagos nativos), Cloudinary (imagenes), Emergent Object Storage (fallback), Resend (email produccion)

## Stack Tecnico
```
/app/
├── backend/
│   ├── services/
│   │   ├── cloudinary_service.py
│   │   ├── storage.py
│   │   └── email.py
│   ├── middleware/
│   │   └── rate_limit.py
│   └── server.py
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── BookviaLogo.jsx
│   │   │   ├── CitySelector.jsx
│   │   │   └── ui/
│   │   ├── lib/
│   │   │   ├── api.js
│   │   │   ├── auth.js
│   │   │   └── i18n.js
│   │   ├── pages/
│   │   │   ├── BusinessDashboardPage.jsx
│   │   │   ├── LoginPage.jsx
│   │   │   └── ...
│   │   └── App.js
│   └── .env
└── .env (backend)
```

## Funcionalidades Implementadas

### Core
- [x] Autenticacion JWT (usuario, negocio, administrador de negocio)
- [x] Registro de negocio multi-paso con suscripcion obligatoria (Stripe)
- [x] Sistema de aprobacion de negocios por admin
- [x] Paneles: usuario, negocio, administrador del sistema
- [x] Sistema de busqueda con filtros y mapa (Leaflet/OpenStreetMap)
- [x] 2FA para admin (pyotp)
- [x] Smart Dropdowns en Hero (ciudades con negocios, categorias dinamicas)

### Reservas
- [x] Flujo multi-paso: Fecha -> Trabajador -> Hora -> Confirmar
- [x] Anticipo con Stripe Checkout (libreria nativa)
- [x] Duracion configurable de servicios
- [x] Bloqueo automatico de agenda
- [x] Cancelacion con politicas configurables
- [x] Sistema de resenas (1-5 estrellas con comentarios)

### Gestion de Negocio
- [x] CRUD de servicios con duracion
- [x] Gestion de equipo con fotos de perfil
- [x] Asignacion de servicios por trabajador
- [x] Sistema de cierres/vacaciones
- [x] Gestion de suscripcion (ver estado, cancelar)
- [x] Tarjetas de estadisticas clickeables con filtro por rango de fechas
- [x] Sistema de veto/blacklist de clientes
- [x] Pagina de configuracion del negocio (/business/settings)
- [x] Modal de Detalle de Cita/Cliente
- [x] Botones Completar, Cancelar, Reagendar para el dueno

### Sistema de Administradores y PIN (Fase 1 + Fase 2 COMPLETADAS)
- [x] PIN de seguridad del dueno (configurar/cambiar, 4-6 digitos)
- [x] Designar trabajador como administrador con permisos granulares
- [x] Permisos agrupados: Citas (completar, reagendar, cancelar), Clientes (bloquear, ver datos), Negocio (editar servicios, perfil, reportes)
- [x] Editar permisos de administrador existente
- [x] Configurar PIN del administrador (4-6 digitos)
- [x] Quitar rol de administrador
- [x] UI completa en pestana Equipo: seccion PIN dueno, badges, botones
- [x] **Login con PIN para administradores**: sub-toggle "Soy el dueno / Soy administrador" en login negocio
- [x] **Dropdown de administradores**: fetch managers por email, select con nombres
- [x] **Dashboard restringido**: tabs y botones filtrados por permisos del administrador
- [x] **Banner de sesion de administrador**: indica nombre y acceso limitado
- [x] **Proteccion de acciones**: completar, reagendar, cancelar, ver datos cliente, stats, config - todo basado en permisos

### Email
- [x] Resend integrado con dominio verificado (bookvia.app)
- [x] Templates HTML: bienvenida usuario, bienvenida negocio, confirmacion de cita, cancelacion

### Internacionalizacion
- [x] Auto-capitalizacion de inputs via CSS (excluye passwords/emails)
- [x] Logo Bookvia con estrella de 4 puntas
- [x] Deteccion automatica de pais por IP
- [x] Selector de pais en Navbar
- [x] 50+ ciudades US, 122+ ciudades para 16 paises

## Backlog (P0-P3)

### P0 (Tecnica)
- [ ] Refactorizar server.py (~6000 lineas) en routers modulares

### P1
- [ ] Sistema de Administradores Fase 3: Historial de actividad/auditoria
- [ ] Recuperar contrasena (flujo completo con Resend)
- [ ] Completar emails transaccionales (recordatorios, etc.)

### P2
- [ ] Recordatorios de citas (email 24h antes)
- [ ] Login con Google (Emergent-managed)

### P3
- [ ] Convertir a PWA
- [ ] Stripe Connect (pagos a negocios)
- [ ] Notificaciones Push
- [ ] Webhook Stripe (customer.subscription.deleted)

## Esquema DB Clave
- **businesses:** subscription_status, approval_status, logo_url, owner_pin_hash
- **workers:** service_ids[], is_manager, manager_permissions{}, manager_pin_hash
- **appointments:** worker_id, end_time, duration_minutes, service_name
- **reviews:** user_id, business_id, booking_id, rating, comment

## Notas Tecnicas
- Stripe usa libreria nativa `stripe` (no emergentintegrations)
- Resend integrado con llave de produccion y dominio verificado
- Timezone: SIEMPRE usar new Date(dateString + 'T12:00:00') para parsear YYYY-MM-DD
- TokenData extendido: incluye worker_id e is_manager para sesiones de administradores
- hasPermission() en AuthContext: retorna true para duenos, checa permisos para admins
