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
│   │   └── email.py          // Resend con plantillas HTML
│   ├── middleware/
│   │   └── rate_limit.py
│   └── server.py
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── BookviaLogo.jsx
│   │   │   ├── CitySelector.jsx
│   │   │   └── ui/           // Shadcn components
│   │   ├── lib/
│   │   │   ├── api.js
│   │   │   ├── auth.js
│   │   │   └── i18n.js
│   │   ├── pages/
│   │   │   ├── BusinessDashboardPage.jsx
│   │   │   ├── BusinessProfilePage.jsx
│   │   │   ├── BusinessRegisterPage.jsx
│   │   │   ├── BusinessSettingsPage.jsx
│   │   │   ├── ServiceManagementPage.jsx
│   │   │   ├── TeamSchedulePage.jsx
│   │   │   ├── HomePage.jsx
│   │   │   ├── SearchPage.jsx
│   │   │   └── ...
│   │   └── App.js
│   └── .env
└── .env (backend)
```

## Funcionalidades Implementadas

### Core
- [x] Autenticacion JWT (usuario y negocio)
- [x] Registro de negocio multi-paso con suscripcion obligatoria (Stripe)
- [x] Sistema de aprobacion de negocios por admin
- [x] Paneles: usuario, negocio, administrador
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
- [x] Tarjetas de estadisticas clickeables con modal de detalle y filtro por rango de fechas
- [x] Sistema de veto/blacklist de clientes (por email, telefono o userId)
- [x] Pagina de configuracion del negocio (/business/settings)
- [x] Modal de Detalle de Cita/Cliente
- [x] Botones Completar, Cancelar, Reagendar para el dueno
- [x] Registro de quien cancelo (cancelled_by)

### Sistema de Gerentes y PIN (Fase 1 - COMPLETADA)
- [x] PIN de seguridad del dueno (configurar/cambiar, 4-6 digitos)
- [x] Verificacion de PIN del dueno (endpoint)
- [x] Designar trabajador como gerente con permisos granulares
- [x] Permisos agrupados: Citas (completar, reagendar, cancelar), Clientes (bloquear, ver datos), Negocio (editar servicios, perfil, reportes)
- [x] Editar permisos de gerente existente
- [x] Configurar PIN del gerente (4-6 digitos)
- [x] Quitar rol de gerente (limpia permisos, PIN, metadata)
- [x] UI completa en pestana Equipo: seccion PIN dueno, badges de gerente, botones contextuales

### Imagenes
- [x] Cloudinary como almacenamiento primario (produccion)
- [x] Emergent Object Storage como fallback (preview)
- [x] Logo obligatorio en registro
- [x] Galeria de fotos del negocio

### Email
- [x] Resend integrado con dominio verificado (bookvia.app)
- [x] Templates HTML: bienvenida usuario, bienvenida negocio, confirmacion cita, cancelacion

### Blacklist/Veto
- [x] CRUD completo (agregar por email/telefono/userId, listar, eliminar)
- [x] Enforcement en backend: busqueda, perfil por slug, acceso directo, y reservas
- [x] Cliente vetado NO ve el negocio (404 silencioso)
- [x] UI en /business/settings

### Internacionalizacion
- [x] Auto-capitalizacion de inputs via CSS (excluye passwords/emails)
- [x] Logo Bookvia con estrella de 4 puntas (BookviaLogo.jsx)
- [x] Deteccion automatica de pais por IP (ipapi.co)
- [x] Selector de pais en Navbar estilo Amazon
- [x] 50+ ciudades US, 122+ ciudades para 16 paises

## Backlog (P0-P3)

### P0
- [ ] Sistema de Gerentes Fase 2: Login con PIN para gerentes, validacion de PIN antes de acciones protegidas
- [ ] Refactorizar server.py (~6000 lineas) en routers modulares

### P1
- [ ] Sistema de Gerentes Fase 3: Historial de actividad/auditoria
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
- [ ] Optimizacion imagenes Cloudinary (thumbnails)

## Esquema DB Clave
- **businesses:** subscription_status, approval_status, logo_url, owner_pin_hash
- **workers:** service_ids[], photo_public_id, is_manager, manager_permissions{}, manager_pin_hash, has_manager_pin
- **appointments:** worker_id, end_time, duration_minutes, service_name
- **blacklist:** id, business_id, email, phone, user_id, reason, created_at
- **services:** duration_minutes
- **reviews:** user_id, business_id, booking_id, rating, comment

## Notas Tecnicas
- Stripe usa libreria nativa `stripe` (no emergentintegrations) para compatibilidad con Railway
- Negocios legacy (sin subscription_status) siguen visibles via filtro $or
- Resend integrado con llave de produccion y dominio verificado (bookvia.app)
- Timezone: SIEMPRE usar new Date(dateString + 'T12:00:00') para parsear YYYY-MM-DD del backend
