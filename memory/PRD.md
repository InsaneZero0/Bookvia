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
- [x] **FASE 9 Liquidaciones dia 20 + CSV SPEI (Mayo 2026)**: cron settlement_day20_scheduler corre cada hora y en dia 20 dispara generate_settlements_day20 (una vez por dia). La funcion agrupa todas las transactions con funds_state=cleared y sin settlement_id por business_id, crea una liquidacion PENDING por negocio (total=sum(business_amount), copia clabe/legal_name/rfc del negocio, period_key=YYYY-MM-D20, idempotency_key=day20-{period_key}), estampa las tx con settlement_id + settlement_period para que no se re-incluyan, salta negocios con payout_hold=true. Envia email send_settlement_notification al negocio con desglose y folio + push notif 'settlement_ready' al owner (no al manager). Endpoints: POST /api/admin/settlements/generate-day20?force=true|false (manual trigger, audit log SETTLEMENT_GENERATE), GET /api/admin/settlements/{period_key}/export-spei.csv?status_filter=pending|all&bank=generic|bbva|banorte|santander con templates especificos por banco (BBVA Multienlace, Banorte BEM, Santander SuperNet) ademas del generico, cada uno con sus columnas, truncations y referencias propias. Frontend: tab Finanzas admin con botones 'Generar dia 20' y 'Exportar CSV SPEI' (selector 1=Generico/2=BBVA/3=Banorte/4=Santander). Tests 17/17 (iteration_81.json) + 13/13 templates por banco (iteration_82.json).
- [x] **FASE 10 T&C versionados (Mayo 2026)**: Alcance user-choice: SIN propinas (cliente-negocio), SIN facturacion (cliente-negocio, Bookvia solo factura sus cuotas). TERMS_VERSION='2026-05-01' en core/config.py. Router /api/terms/* con: GET /version (publico), GET /me (auth, up_to_date), POST /accept (409 si version!=vigente, mirror al doc del business si es owner no-manager). Register cliente y register negocio ahora estampan accepted_terms_version + accepted_terms_at en user/business. TermsPage.jsx reforzada con secciones nuevas: 7.1 Propinas (Bookvia NO intermedia), 7.2 Facturacion CFDI (se pide al negocio), 9.1 Privacidad LFPDPPP + ARCO, 9.2 Ley aplicable + jurisdiccion CDMX. Declaracion mayoria de edad explicita en seccion 7. RegisterPage.jsx y BusinessRegisterPage.jsx: checkbox obligatorio 'Acepto T&C + Aviso de Privacidad; entiendo que propinas y facturas son con el negocio' con links abrir /terms y /privacy en nueva pestana. Tests 10/10 (iteration_83.json).
- [x] **FASE 10b T&C historial + grace + gate (Mayo 2026)**: Registro acumulativo de aceptaciones con IP, user_agent, source en el array terms_acceptance_history (user y business). Constante TERMS_VERSION_PUBLISHED_AT y TERMS_GRACE_DAYS=7. GET /api/terms/version agrega published_at, grace_period_ends_at, is_hard_block_now, changelog (es/en). GET /api/terms/me retorna is_hard_block y grace_period_ends_at. POST /api/terms/accept $push al historial con (version, accepted_at, ip, user_agent, source=re_accept|booking_checkout|register|business_register|migration). Register y business-register ahora reciben request=Request y siembran el primer entry del historial. Helper require_terms_up_to_date(user_id) aplicado a POST /bookings y PUT /businesses/me/legal-docs: durante grace NO dispara, tras grace retorna 409 {code:'terms_outdated'}. Endpoint admin GET /api/admin/users/{user_id}/terms-history. Startup migration idempotente que rellena historial para cuentas con accepted_terms_version pero sin array. Frontend: TermsReAcceptModal (soft durante grace, hard tras grace, logout option) montado en App.js; axios interceptor dispara evento 'bookvia:terms_outdated' en 409 con detail.code; localStorage DISMISS_KEY para no molestar mas de 12h en soft mode. TermsPage.jsx nueva seccion 12 Historial de versiones. Tests 17/17 (iteration_84.json).
- [x] **FASE 10c Exportacion de datos personales LFPDPPP (Mayo 2026)**: GET /api/users/me/export-data auth, retorna JSON attachment (bookvia-mis-datos-<id>-<date>.json) con perfil, bookings, wallet, payments, notifications, favorites, terms_acceptance_history. Sanitiza password_hash, email_verification_token, reset_password_token, totp_secret, _id y stripe_secret. Para owner de negocio (role=BUSINESS, is_manager=False, business_id): incluye tambien business_profile, settlements, transactions, strikes. Managers NO reciben esos campos (son datos del owner). meta.truncated=true si algun seccion llega al cap de 500 rows. Audit log action=personal_data_export con IP X-Forwarded-For. Frontend: Card 'Privacidad y mis datos' en UserDashboardPage con boton 'Descargar mis datos (JSON)'. Tests 7/7 (iteration_85.json).
- [x] **FASE 10d ARCO Rectificacion-Cancelacion-Oposicion LFPDPPP (Mayo 2026)**: POST /api/users/me/marketing-consent (opt_out bool) registra oposicion a marketing con timestamp. DELETE /api/users/me/account con body {password, confirmation='ELIMINAR'} hace soft-delete con redaccion completa: email->deleted_<id>@bookvia.deleted, full_name='[Cuenta eliminada]', phone/photo/birth_date/gender/city/country/favorites/saved_cards/stripe_customer_id wiped, password_hash aleatorio, active=False, account_deleted=True con timestamp e IP. Bloqueos: role=BUSINESS owner (delegado a admin, chequeado antes del password), bookings activas (confirmed/pending) y wallet.balance_mxn>0. Purga user_favorites+notifications. Anonimiza PII en bookings (client_name/email/phone) para que negocios no sigan viendo datos del usuario eliminado. Audit log action=account_deleted_by_user + IP. Email best-effort de confirmacion. Frontend: Card 'Privacidad y mis datos (ARCO)' en UserDashboardPage con 4 secciones (A: download, R: boton editar perfil, O: switch marketing, C: boton eliminar + dialog con password + typed ELIMINAR). Tests 12/12 (iteration_86.json).
- [x] **FASE 11 Hardening del sistema de pagos (Mayo 2026)**: (1) services/stripe_refunds.py con issue_stripe_refund() que emite Stripe.Refund.create real con idempotency_key=refund-{tx_id}-{amount_cents}; solo refundea hasta stripe_charge_amount (excedente va a wallet). Guarda stripe_refunds[] en transaction + audit en refund_events. (2) Webhook /api/stripe/webhook ampliado con idempotencia fuerte (stripe_events collection con _id=event.id) y 5 nuevos eventos: charge.refunded (sincroniza refund_partial/full + mark_refunded), charge.dispute.created/funds_withdrawn (funds_state=disputed + business.payout_hold=true + notif admins), charge.dispute.closed (lost=refunded, won=available), payment_intent.payment_failed (tx.status=failed + notif user), checkout.session.expired (tx.status=expired + booking.expired + reversa de wallet_applied). (3) bookings.py cancel_booking_by_user: al elegir refund_to='card' invoca issue_stripe_refund real; fallback automatico a wallet si Stripe falla ('wallet_fallback'); excedente card-vs-wallet credita wallet. (4) Cron expire_holds_scheduler cada 5 min extiende expire_holds_task para tambien limpiar transactions status=created con held_until<now y reversar wallet_applied. (5) Admin POST /api/admin/bookings/{id}/refund-manual (amount, reason>=5, destination=card|wallet) + audit MANUAL_REFUND. POST /api/admin/businesses/{id}/payout-hold?hold=true|false para toggle + audit PAYOUT_HOLD_TOGGLE. (6) Webhook ahora devuelve 500 en errores para que Stripe reintente (idempotencia lo protege). Tests 24/24 (iteration_87.json).

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
- [x] Rate limiting backend con slowapi - COMPLETADO May 2026
- [x] Proteccion fuerza bruta login (lockout 30min tras 10 intentos) - COMPLETADO May 2026
- [ ] reCAPTCHA v3 en formularios criticos (registro, login, contacto) (2-3h dev)
- [x] Headers HSTS + security headers - COMPLETADO May 2026
- [ ] Sentry integration para monitoreo errores (1h dev)
- [x] Logs de auditoria de acciones admin - COMPLETADO Abril 2026
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

## Phase 12 (May 2026) - Admin Panel Coverage
Panel admin ampliado para cubrir las fases 7-11 de backend:
- **Finanzas extendida**: P&L de plataforma (fee fijo + margen Stripe, cobertura), Reconciliacion Stripe on-demand, Auditoria de reembolsos (stripe_refund_id, fees reales), liquidaciones dia 20 con CSV SPEI por banco.
- **Cumplimiento (nuevo tab)**: Cuentas bloqueadas por fuerza bruta con boton desbloquear, estadisticas T&C (aceptacion por version, usuarios pendientes), Derechos ARCO (audit trail LFPDPPP), log de webhooks Stripe (idempotencia).
- **Endpoints nuevos admin**: `/admin/platform/pnl`, `/admin/platform/reconcile-stripe`, `/admin/platform/reconciliation-issues`, `/admin/security/locked-accounts`, `/admin/security/unlock`, `/admin/terms/stats`, `/admin/terms/pending-users`, `/admin/compliance/arco-events`, `/admin/finance/refunds`, `/admin/stripe/webhook-events`.
- **Testing**: 26/26 pytest cases pass (iteration_89), test file `/app/backend/tests/test_fase12_admin_panel.py`.
- **Enum nuevo**: `AuditAction.SECURITY_UNLOCK = "security_unlock"`.
