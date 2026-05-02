# Bookvia - PRD

## Descripcion General
Marketplace de reservas profesionales (Belleza, Salud, Fitness, etc.) en Mexico.
Frontend: React 18, TailwindCSS, Shadcn/UI
Backend: FastAPI, Motor (MongoDB async), Stripe, Resend
Pagos: Stripe Native (anticipos + suscripciones)
Almacenamiento: Emergent Object Storage (fallback para Cloudinary)
Auth Social: Emergent-managed Google Auth (solo clientes)

## Arquitectura del Backend (Post-Refactorizacion)
```
/app/backend/
  server.py                 # App entry (~235 lineas) - lifecycle, middleware, schedulers
  core/
    config.py               # Env vars, constants
    database.py             # MongoDB connection
    security.py             # JWT, bcrypt, TOTP
    dependencies.py         # Auth dependencies (require_auth, require_business, etc.)
    helpers.py              # Shared utilities (generate_id, notifications, ledger, etc.)
    stripe_config.py        # Stripe initialization
  models/
    enums.py                # All enums + constants (UserRole, AppointmentStatus, etc.)
    schemas.py              # All Pydantic models (request/response)
  routers/
    auth.py                 # Login, register, Google Auth, business auth, verification
    users.py                # User profile, favorites
    businesses.py           # Business CRUD, workers, blacklist, subscriptions, photos, closures
    bookings.py             # Availability engine, booking CRUD, reschedule, cancel
    services.py             # Service CRUD
    reviews.py              # Review CRUD
    categories.py           # Category CRUD
    payments.py             # Stripe payments, deposit checkout
    admin.py                # Admin dashboard, approvals, suspensions, detail, reviews, subscriptions
    notifications.py        # Notification CRUD
    finance.py              # Finance, settlements
    system.py               # Health, seed, contact, cities, upload, webhook
    seo.py                  # Sitemap, robots.txt
  services/
    email.py                # Resend email templates
    sms.py                  # Twilio SMS
    storage.py              # Emergent Object Storage
    cloudinary_service.py   # Cloudinary fallback
```

## Features Implementadas

### Core
- [x] Autenticacion JWT, registro negocio multi-paso, 2FA admin
- [x] Login con Google (Emergent Auth) para usuarios/clientes
- [x] 2 campos de imagen en registro: Logo + Foto del negocio

### Reservas y Pagos
- [x] Flujo multi-paso con anticipo Stripe Checkout
- [x] Cancelacion con politicas, sistema de resenas
- [x] Reagendar citas (negocio y cliente, solo 24h antes)
- [x] Recordatorios por email 24h antes (scheduler cada 30 min + Resend)
- [x] Recordatorios por SMS 24h antes (Twilio, idioma auto MX/US, modo fallback no-rompe-flujo)
- [x] SMS confirmacion de reserva al cliente + notificacion al negocio (post-pago Stripe)
- [x] SMS de cancelacion al cliente y al negocio
- [x] Preferencias de notificacion por canal (email/SMS) - usuarios en /dashboard, negocios en /business/settings tab Notificaciones (default ambos ON, opt-out individual). Backend respeta notify_email/notify_sms en todos los puntos de envio
- [x] Codigo publico unico por negocio BV-XXXXX (auto-generado, backfilled, visible en BusinessSettings con copiar, busqueda admin por codigo, endpoint GET /api/businesses/by-code/{code})
- [x] Codigo publico unico por cliente CL-XXXXX (auto-generado al registrar usuario, backfilled). Tickets de soporte ahora guardan reporter_code (CL- o BV- segun el rol) y business_public_code (negocio reportado). Email de confirmacion incluye codigo del negocio en el footer. Admin tickets view muestra ambos codigos clickeables para copiar y permite buscar tickets por codigo.
- [x] Registro de negocio: pago de suscripcion como ultimo paso obligatorio
- [x] Recordatorio automatico de suscripcion (email 24h despues si no pagaron)
- [x] **FASE 1 Cobranza (Mayo 2026)**: anticipo minimo $100 MXN, cliente paga anticipo + $8.20 cuota Bookvia (IVA incluido), 8.5% procesamiento al negocio (recibe 91.5%). Transacciones guardan: client_paid, bookvia_fee, stripe_fee_estimated, business_amount, stripe_fee_actual (capturado del webhook Stripe balance_transaction). Endpoint publico /api/payments/fees/breakdown para previews. T&C actualizado con cobranza, liquidaciones dia 20, disclaimer legal de intermediacion.
- [x] **FASE 2 Wallet/Saldo cliente (Mayo 2026)**: nueva coleccion user_wallets + wallet_transactions. Servicios credit_wallet/debit_wallet/expire_stale_balances con state machine de tipos (CREDIT_CANCELLATION, CREDIT_BUSINESS_CANCEL, DEBIT_BOOKING, DEBIT_EXPIRED, etc). Cliente puede elegir refund_to='wallet' al cancelar (>24h) -> ahorra fee de Stripe, saldo disponible al instante. Pago de booking acepta use_wallet=true: si saldo cubre todo evita Stripe completamente; si parcial paga remainder con tarjeta. Saldo expira a 24 meses sin actividad (cron diario). Frontend: WalletCard component visible en /dashboard, cancel dialog con radios 'Saldo Bookvia' / 'A tu tarjeta' (UserBookingsPage), historial de movimientos en dialog separado.
- [x] **FASE 3 Ledger States (Mayo 2026)**: state machine de fondos por transaccion (PENDING_HOLD -> AVAILABLE -> CLEARED, con DISPUTED y REFUNDED como ramas; PAID_OUT terminal). funds_state_history append-only por auditoria. Optimistic locking en transiciones. Schedulers cada hora: auto_complete_appointments (48h post-cita sin accion -> COMPLETED + AVAILABLE) y auto_clear_after_grace (24h en AVAILABLE -> CLEARED). Endpoint POST /api/bookings/{id}/dispute para que cliente reporte problema. Endpoint admin GET /admin/disputes y POST /admin/disputes/{tx}/resolve (favor_business -> CLEARED, favor_client -> REFUNDED). Dashboard negocio /business/finance muestra pipeline visual: En espera / Periodo de gracia / Listo para pagar / En revision. Notificaciones push (no email) al cliente al completar cita con ventana de 24h para reportar.
- [x] **FASE 4 Reagendamiento (Mayo 2026)**: cliente puede reagendar cita maximo 2 veces sin costo, con minimo 2 horas de anticipacion. Si llega al limite solo puede cancelar. Anticipo se mantiene. Reagendamiento por negocio NO cuenta contra el limite del cliente (se trackea en business_reschedule_count separado). Endpoint publico GET /api/bookings/policies expone constantes para UI. reschedule_history append-only en cada booking con metadata (by='user'|'business', from/to date+time, timestamp). Endpoint cliente notifica push al negocio al reagendar. Frontend: boton Reagendar muestra contador "(1/2)" tras primer movimiento y se deshabilita con tooltip al alcanzar limite o cita en menos de 2h. Modal explica politica claramente. T&C actualizado.
- [x] **FASE 5 Strikes + Trust Score (Mayo 2026)**: sistema progresivo de strikes para negocios (warning -> minor -$100 MXN -> suspension 7d -> 30d -> ban definitivo). Razones: late_cancellation (<6h), regular_cancellation, no_show_business, dispute_lost, admin_manual. Ventana de 30 dias para escalar y 90 dias para ban. Strikes auto-aplicados cuando negocio cancela cita o admin resuelve disputa contra negocio. Admin puede emitir o limpiar strikes manualmente con audit log. Cron horario libera suspensiones expiradas. Negocios suspendidos NO aparecen en search ni featured (visible_business_filter_now()). pending_strike_penalty_mxn se descontara de proximos payouts. Endpoint cliente publico GET /businesses/{id}/trust-score retorna score 0-100 (excellent/good/fair/poor) compuesto de rating(50%) + completion_rate(30%) + strike_factor(20%), con ajuste de confianza para nuevos negocios (is_provisional). Frontend: TrustBadge component visible en BusinessProfilePage al lado del rating, con tooltip explicativo.
- [x] **FASE 6 Negocio cerrado / No-show del negocio (Mayo 2026)**: cliente puede reportar via boton "El negocio no abrio" / NoShowAlertBanner; ventana de respuesta del negocio de 24h; cron auto-resuelve a favor del cliente con auto-refund + $50 MXN compensacion al wallet + strike NO_SHOW_BUSINESS al negocio.
- [x] **FASE 7 Recordatorio inteligente al cliente (Mayo 2026)**: send_appointment_reminder() ahora computa ventana dinamica de cancelacion (24h antes con reembolso menos 8.5%) y reagendamiento (cutoff RESCHEDULE_CUTOFF_HOURS=2, contador X/2 usados) con base en la cita real. Email contiene 4 botones: Apple/Outlook (.ics), Google Calendar (link calendar.google.com/render?action=TEMPLATE&dates=...), Reagendar (deep-link /bookings?action=reschedule&id=), Cancelar (deep-link /bookings?action=cancel&id=). Push notification (NotificationType=booking_reminder) creada en paralelo regardless de email-pref. Endpoint publico GET /api/bookings/{id}/calendar.ics genera archivo RFC5545 (VCALENDAR/VEVENT/VALARM) con HMAC-SHA256 token (32 chars) firmado con JWT_SECRET; 403 token invalido, 404 booking no existe, 410 booking cancelado. Email try/except aislado: fallo de Resend NO bloquea push ni reminder_sent flag. Frontend UserBookingsPage detecta query params action+id y abre auto-modal de cancel/reschedule. Tests 13/13 (iteration_79.json).
- [x] **FASE 8 Verificacion reforzada de negocios por documentos (Mayo 2026)**: nuevo campo bank_proof_url (comprobante bancario PDF/JPG/PNG). Negocios empiezan con documents_verified=false y NO aparecen en search/featured (VISIBLE_BUSINESS_FILTER extendido) ni pueden recibir reservas (create_booking gate). PUT /api/businesses/me/legal-docs permite al dueno editar rfc/clabe/legal_name/ine_url/proof_of_address_url/bank_proof_url/owner_birth_date; cualquier cambio en campos sensibles des-verifica automaticamente (documents_verified=false, documents_submitted_at, clabe_changed_at si aplica) y notifica a TODOS los admins con type=docs_review. POST /api/admin/businesses/{id}/verify-documents valida que los 6 docs esten presentes y marca documents_verified=true + audit log DOCS_VERIFY + notif docs_verified al dueno. POST /api/admin/businesses/{id}/reject-documents con reason>=5 marca rechazado + audit DOCS_REJECT + notif docs_rejected al dueno. GET /api/admin/businesses/pending-docs lista negocios con revision pendiente. POST /api/upload/public ahora tambien acepta PDF. Grandfather clause en startup: negocios status=approved previos reciben documents_verified=true con flag documents_grandfathered. Frontend: BusinessSettings tab Documentos con banner de estado (verde/rojo/amber), modo edicion con uploads para los 3 docs + aviso amarillo de re-revision. AdminDashboard detalle: card 'Verificacion de documentos' con botones Verificar/Rechazar, preview inline del bank_proof/INE/proof via DocPreviewCard (iframe PDF, img imagen). Tests 19/19 (iteration_80.json).
- [x] **FASE 9 Liquidaciones dia 20 + CSV SPEI (Mayo 2026)**: cron settlement_day20_scheduler corre cada hora y en dia 20 dispara generate_settlements_day20 (una vez por dia). La funcion agrupa todas las transactions con funds_state=cleared y sin settlement_id por business_id, crea una liquidacion PENDING por negocio (total=sum(business_amount), copia clabe/legal_name/rfc del negocio, period_key=YYYY-MM-D20, idempotency_key=day20-{period_key}), estampa las tx con settlement_id + settlement_period para que no se re-incluyan, salta negocios con payout_hold=true. Envia email send_settlement_notification al negocio con desglose y folio + push notif 'settlement_ready' al owner (no al manager). Endpoints: POST /api/admin/settlements/generate-day20?force=true|false (manual trigger, audit log SETTLEMENT_GENERATE), GET /api/admin/settlements/{period_key}/export-spei.csv?status_filter=pending|all (CSV listo para SPEI masivo con columnas Beneficiario,CLABE,RFC,Monto,Concepto,Referencia,Email,Citas,Folio + CSV escape de comas/comillas). Frontend: tab Finanzas admin con botones 'Generar dia 20' y 'Exportar CSV SPEI'. Tests 17/17 (iteration_81.json).

### Frontend
- [x] Busqueda "Cerca de ti" con OpenStreetMap, horarios apertura, badge Abierto/Cerrado
- [x] Pagina de favoritos, historial de transacciones
- [x] Carrusel de fotos en perfil publico
- [x] Dashboard de negocio con modales de reagendar, detalles cliente
- [x] Pagina de Recepcion: crear citas walk-in, panel de citas del dia
- [x] Busqueda de clientes existentes en Recepcion (por nombre/telefono)
- [x] Badges "Recepcion" + "Pago en negocio" en citas creadas por el negocio
- [x] Pagina de Configuracion (Settings): 6 tabs - Info, Horarios, Documentos legales, Suscripcion, Ubicacion, Vetos
- [x] Edicion de horarios de apertura/cierre por dia del negocio (sincroniza con horarios de trabajadores)
- [x] Buscador de direccion con mapa en registro de negocio (Nominatim + OpenStreetMap, auto-rellena campos, guarda lat/lng)
- [x] Mapa interactivo Leaflet con marcador arrastrable en registro y configuracion (reemplaza iframe estatico)
- [x] Google Maps integrado: mapa interactivo con marcador arrastrable (registro, configuracion), mapa estatico (perfil publico), busqueda de direcciones con Google Places Autocomplete, mapa de resultados de busqueda
- [x] Campo separado de "Num. ext." en registro para direcciones mas precisas

### Panel Admin (2FA con TOTP)
- [x] 12 tabs: Resumen, Negocios, Usuarios, Resenas, Categorias, Rankings, Ciudades, Configuracion, Soporte, Reportes, Suscripciones, Finanzas (+1 Equipo solo Super Admin = 13 total)
- [x] Vista Detalle de Negocio (Dialog): info general, documentos legales (RFC, CLABE, INE, CURP), suscripcion, propietario, servicios, trabajadores, resenas
- [x] Aprobar/Rechazar/Suspender negocios desde detalle o listado
- [x] Moderacion de resenas: buscar, paginar y eliminar resenas inapropiadas
- [x] Gestion de Suscripciones: resumen por estado + listado de negocios con suscripcion
- [x] Gestion de Usuarios: buscar, paginar, suspender
- [x] Finanzas: liquidaciones, generar settlements, marcar como pagado, exportar CSV
- [x] Audit logs
- [x] Estadisticas de Crecimiento: 3 graficas interactivas (Registros por mes, Reservas por mes, Ingresos por mes) con recharts
- [x] Gestion de Categorias CRUD: crear, editar, eliminar categorias con auto-slug, validacion de slug duplicado, bloqueo de eliminacion si negocios la usan
- [x] Categoria "Otro": cuando un negocio no encuentra su categoria, selecciona "Otro" + describe su tipo de negocio. Admin puede reasignar la categoria desde el detalle del negocio
- [x] Configuracion de Plataforma: comision %, precio suscripcion, dias prueba, deposito minimo (con validacion de rangos)
- [x] Panel de Soporte: lista de tickets con stats, filtros, busqueda, conversacion admin-usuario, responder y cerrar tickets
- [x] Rankings: top negocios por reservas, mejor calificados, ciudades mas activas, categorias populares (solo negocios aprobados)
- [x] Alertas Admin: seccion en Resumen con alertas automaticas (pendientes, tickets abiertos, resenas negativas, suscripciones vencidas, negocios sin suscripcion, pagos retenidos)
- [x] Gestion de Ciudades: listar 162 ciudades con busqueda, filtro activa/inactiva, toggle activar/desactivar con audit log
- [x] Reportes Personalizados: filtros por fecha, ciudad, categoria. Resumen (reservas, ingresos, cancelaciones, usuarios), grafica diaria, top negocios y ciudades del periodo
- [x] Sistema de Staff/Sub-Admin: crear, editar, eliminar miembros de equipo con permisos granulares por tab. Staff login sin 2FA. Super Admin tiene acceso total + tab Equipo exclusivo. Reseteo de contrasena.

### Experiencia del Cliente
- [x] Stats del usuario en dashboard: total reservas, gasto total, citas pendientes, rating promedio dado, resenas
- [x] Seccion "Reservar de nuevo" con servicios completados recientes (acceso rapido a negocio)

### Dashboard del Negocio
- [x] Resumen rapido del dia/semana/mes con ingresos, citas, % cambio semanal, clientes unicos, resenas nuevas

### Tecnico
- [x] Refactorizacion backend: server.py ~7000 lineas -> 235 lineas + 12 routers modulares
- [x] Fix scheduler recordatorios: parametros corregidos (date, time, worker_name)
- [x] Fix funcion calculate_fees perdida en refactorizacion
- [x] Fix schema ClosureDateCreate corrupto
- [x] Fix imports faltantes de cloudinary_service en routers
- [x] Fix validate_schedule_blocks perdida en refactorizacion
- [x] Fix is_exception_blocking perdida
- [x] Fix send_pending_reminders, expire_holds_task y generate_monthly_settlements perdidas
- [x] Auditoria completa AST: 0 funciones indefinidas en todos los routers
- [x] Fix ADMIN_INITIAL_PASSWORD no importado en system.py
- [x] Fix pyotp no importado en auth.py

## Tareas Pendientes

### P0 - Seguridad (antes de lanzamiento publico)
- [x] Cloudflare delante del dominio (DDoS, WAF, oculta IP Railway) - COMPLETADO Feb 2026
- [x] Cloudflare Access configurado (solo emails autorizados - beta privada) - COMPLETADO Feb 2026
- [x] Dominio bookvia.app conectado a Vercel via Cloudflare - COMPLETADO Feb 2026
- [ ] Rate limiting backend con slowapi (2-3h dev)
- [ ] Proteccion fuerza bruta login (bloqueo tras 5 intentos + CAPTCHA) (3-4h dev)
- [ ] reCAPTCHA v3 en formularios criticos (registro, login, contacto) (2-3h dev)
- [ ] Headers HSTS + security headers (15min dev)
- [ ] Sentry integration para monitoreo errores (1h dev)
- [ ] Logs de auditoria de acciones admin (4-6h dev)
- [ ] Backups automaticos MongoDB Atlas verificados

### P0 - Decisiones pendientes usuario
- [ ] Rebranding "Bookvia" (VIA registrada IMPI clase 9) - esperando decision
- [ ] Acceso privado staging: Cloudflare Access (gratis 50 users) para beta cerrada

### P1
- [x] Integracion Twilio SMS - COMPLETADO Abril 2026 (confirmacion, recordatorios, cancelaciones, idioma auto MX/US)
- [ ] Integracion WhatsApp via Twilio (Fase 2 - requiere aprobacion plantillas Meta)
- [x] Precios suscripcion $49.99 MXN / $4.99 USD + 30 dias trial (Stripe Billing) - COMPLETADO Abril 2026
- [x] Filtro estricto VISIBLE_BUSINESS_FILTER: negocios sin suscripcion activa/trialing no aparecen en /featured ni /search - COMPLETADO Abril 2026
- [x] get_or_create_stripe_price con auto-recovery en cache invalida - COMPLETADO Abril 2026
- [ ] Banner motivador en Business Dashboard ("Negocios con precios reciben 3x mas reservas")
- [ ] Optimizacion UX mobile avanzada

### P2
- [ ] Refactor AdminDashboardPage.jsx (+2400 lineas) en componentes de tabs

### P3
- [ ] PWA (Progressive Web App)
- [ ] Stripe Connect (payouts automaticos - pausado hasta resolver estructura fiscal)
- [ ] Chat / Preguntas al negocio
- [ ] Cupones o codigos de descuento
- [ ] Notificaciones Push navegador

## Notas Tecnicas
- Google Login: Usa Emergent Auth (auth.emergentagent.com). Solo para clientes.
- Registro Negocio: Pasos 1-4 datos, Paso 5 pago Stripe. Sin pago login bloqueado (403).
- Recordatorio suscripcion: Scheduler cada 6h, negocios con subscription_status='none' +24h.
- Recordatorios citas: Scheduler cada 30 min, timezone Mexico.
- TIMEZONE PARSING: Siempre usar new Date(dateString + 'T12:00:00') en frontend.
- Admin TOTP: usar script /app/scripts/get_admin_totp.py para generar codigos.
