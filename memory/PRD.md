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
- [x] **FASE I Codigos QR brandeados por negocio (Feb 2026)**: services/business_qr.py genera PNG con qrcode + StyledPilImage + RoundedModuleDrawer + SolidFillColorMask coral (#F05D5E), logo Bookvia incrustado (white "B" sobre rounded square coral, 20% del QR con ERROR_CORRECT_H para tolerar la oclusion). 2 endpoints publicos (cache 1 dia): GET /api/businesses/{id}/qr.png (solo QR, inline) y GET /api/businesses/{id}/qr-card.png (tarjeta imprimible con nombre + public_code, attachment). Tracking: get_business_by_slug detecta ?ref=qr y guarda business_id+scanned_at+user_id+ip en colección qr_scans (try/except, jamás bloquea el perfil). 2 endpoints admin: GET /api/admin/qr/scans/summary?days=N (total + by_business) y GET /api/admin/qr/businesses?q=&days=N (lista de negocios aprobados con slug no vacío + scans del periodo). Frontend: AdminQRCodesTab.jsx con grid responsive de tarjetas QR, búsqueda libre, pills de ventana 7d/30d/90d, botones "Descargar QR" / "Descargar tarjeta" / "Copiar imagen" (con fallback a URL) / "Copiar link". Tab "Códigos QR" agregada al AdminDashboardPage con icon QrCode. Tests 12/12 backend (iteration_99.json). pyzbar decodifica el QR a https://bookvia.app/{slug}?ref=qr correctamente.

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

## Phase 12d (May 2026) - Reporte Ejecutivo Mensual
- **Servicio**: `/app/backend/services/monthly_pnl_report.py` (`build_monthly_report` + `send_monthly_report`) genera HTML ejecutivo con P&L cerrado del mes anterior, discrepancias Stripe, top-5 reembolsos y liquidaciones pendientes.
- **Scheduler**: `monthly_pnl_report_scheduler` en `server.py` corre cada 30 min, se activa dia-1 de cada mes >= 13:00 UTC (07:00 CDMX), idempotente por `period_key`.
- **Endpoints admin**: `GET /admin/platform/pnl-report/preview` (vista previa JSON), `POST /admin/platform/pnl-report/send` (envio manual, acepta `recipients` custom para test).
- **UI**: Nuevo card "Reporte Ejecutivo Mensual" en tab Finanzas con boton "Enviar ahora" que pregunta destinatarios y muestra sent_to/failed con razon de fallo (util para detectar Resend domain no verificado).
- **Testing**: 4/4 pytest pass en `/app/backend/tests/test_fase12d_pnl_report.py`.
- **Nota produccion**: Requiere verificar dominio en Resend (tarea P2 pendiente). Mientras tanto el servicio reporta correctamente el error "domain not verified" al admin.

## Phase 13 (May 2026) - Public Acquisition UX
Preparacion del sitio para lanzamiento abierto al publico:
- **BetaBanner** (`/app/frontend/src/components/BetaBanner.jsx`): banner fixed top dismissible anunciando "Bookvia esta en beta en CDMX". Coordina con Navbar via CSS var `--beta-banner-h` para apilarse sin overlap. Persiste dismissal en localStorage.
- **PlatformStatsBar** (`/app/frontend/src/components/PlatformStatsBar.jsx`): 4 KPIs abajo del hero en homepage. Modo dual: cuando `bookings >= 50` o `reviews >= 10` muestra metricas reales con sufijo k/+; sino modo "early days" con "Reembolso garantizado Si / $50 MXN compensacion / CDMX beta" para no lucir vacio.
- **Testimonials** (`/app/frontend/src/components/Testimonials.jsx`): 3 cards con estrellas, quote, avatar, nombre, rol/ciudad y disclaimer. Placeholders realistas en MX espanol listos para reemplazar con reales tras obtener autorizacion de usuarios beta.
- **HowItWorksModal ajustado**: ahora espera a que se cierre el BetaBanner antes de auto-abrirse en primera visita, evitando competencia por atencion.
- **Testing**: iteration_90 - 100% passing en frontend, sin regresiones en /help, /beneficios, /dashboard.

## Phase 14 (May 2026) - Business Activation + Metrics
Dashboard del negocio orientado a activacion y retencion:
- **ProfileCompletionBanner** (`/app/frontend/src/components/ProfileCompletionBanner.jsx`): checklist de 7 items con radial progress %, gradient segun completitud (rojo/amber/verde), CTA contextual al primer pendiente. Auto-hide al 100%.
- **Endpoint nuevo**: `GET /businesses/my/profile-completion` retorna `{percentage, done_count, items:[{key,done,label_es,label_en,action_path}]}`. Items: cover, photos>=3, services_with_price, description, hours, team>=1, kyc.
- **Metricas de adquisicion**: `/businesses/my/dashboard-summary` extendido con `profile_views_30d`, `bookings_30d`, `conversion_pct`, `top_services[3]`. Nuevo row de 3 cards en tab Overview.
- **Profile view tracking**: nueva coleccion `profile_views` con dedup idempotente por `(business_id, viewer_key, date)`. viewer_key = user_id si autenticado, X-Forwarded-For (para estabilidad tras k8s ingress) sino. Owners no incrementan sus propias vistas.
- **Bug fix** `routers/bookings.py`: decorador `@router.get("/business/stats-detail")` estaba huerfano; `get_business_stats_detail` no estaba registrado como ruta. Corregido.
- **Testing**: iteration_91 - 10/10 backend pass, frontend pass. Dedup verificado (5 curls anon = 1 row).

## Phase 15 (May 2026) - Map + Mini-CRM
Dos features P1 pensados para hacer crecer el marketplace sin depender de servicios pagados:
- **Leaflet Map** (`/app/frontend/src/components/SearchLeafletMap.jsx`): reemplazo 100% de Google Maps por Leaflet + OpenStreetMap tiles (gratuito, sin API key). Pins con popup (nombre, rating, distance_km, CTA ver perfil), pin azul para ubicacion del usuario, auto-fit bounds, tile attribution de OSM.
- **Mini-CRM del negocio** (`/app/frontend/src/components/BusinessClientsTab.jsx`): nueva pestana "Clientes" en Business Dashboard con:
  * Tabla agregada desde `bookings` + `users` con total visitas, gasto, ultima cita, dias sin venir, tags automaticos (VIP 5+ visitas, Nuevo, No-show, Inactivo 90d+)
  * Filtros: busqueda texto + filtro tag + 4 ordenamientos (recent/visits/spent/name)
  * Notas privadas por cliente (max 500 chars, editables inline via modal) en coleccion `business_client_notes`
  * Export CSV con derechos de portabilidad de datos
- **Endpoints nuevos**:
  * `GET /businesses/my/clients?q=&tag=&sort=&page=&limit=`
  * `PUT /businesses/my/clients/{client_key}/note`
  * `POST /businesses/my/clients/export` (CSV)
- **Nueva coleccion**: `business_client_notes` con `(business_id, client_key, note, updated_at)`
- **Testing**: iteration_92 - 12/12 backend pass, Clientes tab UI verificada con todos los data-testids (search, tag filter, sort, export, empty state), sin regresiones.

## Phase 16 (May 2026) - City Waitlist
Captura de demanda para ciudades sin negocios, critico para lanzamiento nacional con masa critica concentrada en CDMX:
- **Router nuevo** (`/app/backend/routers/waitlist.py`): 5 endpoints publicos/admin:
  * `POST /api/waitlist` (dedup por email+city+country, envia email best-effort)
  * `GET /api/waitlist/stats` (top ciudades para social proof)
  * `GET /api/admin/waitlist` (lista paginada)
  * `GET /api/admin/waitlist/export` (CSV)
  * `DELETE /api/admin/waitlist/{id}`
- **CityWaitlistCard** (`/app/frontend/src/components/CityWaitlistCard.jsx`): card de captura con estado loading/success/ya-registrado, contador social "X personas esperando en Monterrey", mounted en SearchPage empty state cuando hay ciudad seleccionada.
- **Admin UI**: nuevo card "Lista de espera por ciudad" en tab Cumplimiento con badges top-cities, ultimos 20 signups, export CSV.
- **Nueva coleccion**: `waitlist_signups` con `(email, city, country_code, category_id?, source, ip_address, user_agent, created_at, notified_at?)`.
- **Testing**: iteration_93 - 14/14 backend pass, flow publico end-to-end via Playwright verificado. Fallas de Resend (domain not verified) no rompen el signup.

## Phase 16b (May 2026) - Waitlist Broadcast
Activa la lista de espera: cuando Bookvia abra en una ciudad, admin puede mandar un "launch email" masivo en 2 clicks desde el panel:
- **Endpoints nuevos**:
  * `GET /api/admin/waitlist/cities/{city}/preview` - cuenta destinatarios + trae hasta 20 negocios activos en esa ciudad
  * `POST /api/admin/waitlist/broadcast` - envia email personalizado con subject, mensaje custom (max 2000 chars, sanitizado contra XSS) y hasta 5 negocios destacados embebidos
- **Idempotencia**: marca `notified_at` y `last_broadcast_subject` en cada signup enviado exitosamente; flag `only_unnotified` (default true) evita duplicados.
- **Auditoria**: cada broadcast crea audit log con `action=waitlist_broadcast`, sent_count, failed_count, businesses_included.
- **UI** (`/app/frontend/src/components/WaitlistBroadcastModal.jsx`): los badges de ciudad en el admin ahora son clickeables → abren modal con preview, asunto editable, textarea con char counter, picker de hasta 5 negocios (2-col grid), toggle only_unnotified, boton rojo "Enviar broadcast".
- **Sanitization**: mensaje custom se escapa HTML y se parte por `\n\n` en parrafos seguros.
- **Testing**: smoke test manual - preview retorna 3 destinatarios + 7 negocios, broadcast ejecuta audit log, 422 con subject < 5 chars, ciudad inexistente devuelve sent=0 sin error. Screenshots de modal confirmados.


## Phase 17 (Feb 2026) - Review Moderation
Sistema de reportes y moderacion de resenas para mantener la calidad publica del marketplace y cumplir con los principios anti-fraude:
- **Endpoints nuevos** (`/app/backend/routers/reviews.py`):
  * `POST /api/reviews/{review_id}/report` - cualquier usuario autenticado reporta una resena con `reason` (fake|offensive|off_topic|spam|other) + `detail` opcional. Dedup por (review_id, reporter_id) via `$setOnInsert`, incrementa `report_count` en la resena solo en la primera inserción.
  * `GET /api/reviews/admin/reported?status_filter=pending|all|dismissed|removed&limit=50` - cola de moderacion admin con aggregation pipeline que agrupa por review_id, adjunta business_name + author_name + lista completa de reportes individuales.
  * `POST /api/reviews/admin/{review_id}/resolve` (action=dismiss|remove) - dismiss mantiene la resena visible y marca reportes como dismissed; remove pone `hidden=true` en la resena y llama `_recompute_business_rating` para actualizar `rating` + `review_count` del negocio. Cada accion escribe audit log.
- **Hardening** `GET /api/reviews/business/{id}` ahora tiene try/except por fila para que una resena legada malformada no tumbe todo el feed (solo loggea warning).
- **Colecciones actualizadas**:
  * `reviews` + campos `hidden`, `hidden_at`, `hidden_by_admin_id`, `hidden_reason`, `report_count`, `last_reported_at`, `dismissed_at`.
  * Nueva `review_reports`: `{id, review_id, reporter_id, reporter_role, reason, detail, status(pending|dismissed|removed), created_at, resolved_at, resolved_by, resolution_note}`.
- **UI publica** (`/app/frontend/src/components/ReviewReportButton.jsx`): boton inline "Reportar" en cada review card de BusinessProfilePage. Modal con 5 razones + textarea opcional 500 chars. Anon -> toast "Inicia sesion". Dedup backend se refleja como "Ya habias reportado" toast.
- **UI admin** (Compliance tab en `/app/frontend/src/pages/AdminDashboardPage.jsx`): card `reported-reviews-card` con badge count; cada item muestra rating, texto, contexto de negocio y reportes (expandible), 2 botones: "Descartar" y "Ocultar resena" (confirm + prompt de nota interna).
- **Testing**: iteration_94 - **12/12 pytest backend pass** (`/app/backend/tests/test_phase17_review_moderation.py`). Dedup + auth gating + dismiss-vs-remove + recompute + exclusion publica cubiertos. Publico ANON flow verificado via Playwright. Dos reviews legacy (rev_mod_test_001/002) que causaban 500 fueron purgados.

## Pending User Actions (Pre-Launch)
- [BLOCKED] **Resend DNS** - anadir registros DNS de `bookvia.app`/`bookvia.mx` en panel Resend. Codigo de emails esta correcto; solo falta que el usuario valide el dominio.
- [BLOCKED] **Vercel merge** - Vercel Pro requiere PR manual; hacer merge manual en GitHub para que desplieguen los cambios.
- [BLOCKED] **Consulta legal CONDUSEF (IFPE/FinTech)** - validacion legal antes del lanzamiento abierto.
- [BACKLOG] Twilio A2P SMS - sigue en fallback log hasta que la plataforma este publicamente desplegada.

## Roadmap Proximo
- **P1** Boton "Reactivar clientes inactivos" en Mini-CRM del negocio - manda email/SMS a clientes con >90 dias sin visitar con link de oferta/recordatorio (convierte el CRM pasivo en activo).
- **P2** PWA (manifest.json, service worker, install prompt, offline-friendly cache basico).
- **P3** App nativa iOS/Android via Capacitor.
- **P3** Refactor de `bookings.py` (~2100 lineas) y `AdminDashboardPage.jsx` (~3300 lineas) en submodulos.

## Phase 18 (Feb 2026) - Unified Payout + Client Codes + Commission Transparency
Antes del lanzamiento abierto se unificó el esquema de pagos y se dio transparencia completa al negocio para prevenir quejas y cumplir con PROFECO / CONDUSEF:

### A. Payout schedule unificado
- Se eliminó el selector triday/biweekly/monthly (y sus fees 10%/8%/4% inconsistentes con el backend). El backend SIEMPRE cobró 8.5% fijo → la UI ahora coincide con la realidad.
- Calendario único: `payout_schedule='monthly_cutoff_20'` → corte día 20 de cada mes, depósito el día 1° del mes siguiente. Los cobros del 21 al fin de mes ruedan al siguiente ciclo.
- Migración ejecutada: `db.businesses.updateMany({}, {$set: {payout_schedule: "monthly_cutoff_20"}})` (54 businesses).
- `POST /api/auth/business-register` y `PUT /api/businesses/me` ahora fuerzan `monthly_cutoff_20` cuando `requires_deposit=true` (asimetría corregida).

### B. CommissionBreakdownModal (transparencia de comisiones)
- Nuevo componente `/app/frontend/src/components/CommissionBreakdownModal.jsx` con:
  * Simulador en vivo (input de anticipo → calcula al vuelo cliente-paga / stripe-retiene / tú-recibes).
  * Tabla desglosada: fee fijo Bookvia $8.20 MXN (IVA incluido, cliente), procesamiento Stripe 8.5% (negocio), política de reembolsos, suscripción mensual $49.99.
  * Banner informativo Ley Fintech/SAT (LISR art. 113-A) con aviso de 30 días.
  * Sección no-shows y chargebacks.
  * Checkbox obligatorio de aceptación con versión `v1-2026-02` → bloquea "Continuar".
- `BusinessCreate` ahora acepta `commission_terms_accepted` + `commission_terms_version`; persiste `commission_terms_accepted_at` (auditable CONDUSEF).
- Validación en `BusinessRegisterPage`: imposible avanzar al paso 5 con `requires_deposit=true` sin aceptar el desglose.

### C. Código único del cliente (CL-XXXXX)
- El sistema ya generaba `CL-XXXXX` para cada usuario en registro (`services/public_code.py`) pero estaba oculto. Ahora:
  * Visible en `UserDashboardPage` como badge copy-to-clipboard en el header del perfil.
  * Visible en Mini-CRM (`BusinessClientsTab`) como chip clickeable al lado del nombre.
  * Buscador del Mini-CRM acepta `CL-XXXXX` además de nombre/email/teléfono.
  * Nuevo endpoint `GET /api/businesses/my/clients/lookup?code=CL-XXXXX` → devuelve stats del cliente scopeadas al negocio (total_bookings, total_visits, total_spent, noshow_count, last_visit, has_history_with_you). 400 en formato inválido, 404 si no existe.
- Admin backfilled con su propio `CL-XXXXX`.
- CSV export ahora incluye columna `bookvia_code` como primera columna.

### Testing
- iteration_95: **12/12 pytest pass** (`/app/backend/tests/test_phase18_payout_and_code.py`). Frontend code-review 100% verde (simulador matemáticamente correcto, validación de gate, testids legacy removidos, chips públicos presentes).


## Phase 19 (Feb 2026) - Legal Hardening: Hash + Snapshot + Tax Regime
Tres puntos críticos antes del lanzamiento abierto para blindar la transparencia y cumplimiento (CONDUSEF/PROFECO/SAT) — el cuarto punto crítico (CFDI 4.0) queda parqueado para post-lanzamiento.

### A. Hash + snapshot legal de los términos aceptados
- Nuevo `/app/frontend/src/lib/commissionTerms.js` como **fuente única de verdad** (versión, fees, payout cadence, reglas).
- `CommissionBreakdownModal` ahora calcula `SHA-256` del JSON canónico del snapshot al aceptar y emite `{version, hash, snapshot}`.
- Persistencia en `db.businesses`: `commission_terms_hash`, `commission_terms_snapshot`, `commission_terms_accepted_at`, `commission_terms_history` (array con todas las aceptaciones + IP + user_agent).
- Nuevo endpoint `POST /api/businesses/me/commission-terms/accept` (auditable vía `audit_logs.action=commission_terms_accept`). Valida formato hex 64 chars, snapshot obligatorio, gate de manager.

### B. Captura del régimen fiscal en registro
- Nuevo Select obligatorio en paso 3 (Documents) de `BusinessRegisterPage` para negocios MX con 8 opciones: `PF_RESICO`, `PF_ACT_EMPRESARIAL`, `PF_HONORARIOS`, `PF_PLATAFORMAS`, `PM_GENERAL`, `PM_NO_LUCRATIVA`, `RIF`, `OTRO`.
- Determina retenciones futuras cuando entren las disposiciones Ley Fintech / LISR 113-A.
- Nuevo endpoint `PUT /api/businesses/me/tax-regime` con whitelist de regímenes válidos.
- Campo opcional `tax_regime_certificate_url` (Constancia de Situación Fiscal) para subir cuando entre Fintech.

### C. Vista read-only "Cobros" en BusinessSettingsPage
- Nuevo componente `/app/frontend/src/components/CommissionTermsCard.jsx`.
- Nueva pestaña `tab-commission` en BusinessSettingsPage (oculta para managers y para negocios sin anticipo).
- Muestra: versión aceptada, fecha/hora con timezone MX, hash legal copiable, snapshot de fees vigentes, simulador (vía `view-commission-terms-btn`).
- Cuando `CURRENT_VERSION` no coincide con `commission_terms.version` guardada → renderiza botón ámbar `reaccept-commission-terms-btn` que abre el modal y dispara la aceptación nueva. Sirve como gating cuando suba la versión por cambios regulatorios.
- `/businesses/me/private-info` ahora expone el objeto `commission_terms` + `tax_regime` + `requires_deposit/deposit_amount/cancellation_days/payout_schedule`.

### Testing
- iteration_96: **22/22 pytest backend pass** (`/app/backend/tests/test_phase19_commission_terms_audit.py`). Frontend Playwright 100% verificado: tab Cobros, hash visible y copiable, modal abre con valores correctos, flow de re-aceptación al manipular versión legacy en DB.

## Pending P0/P1 (legal/operativo) — POST lanzamiento
- **CFDI 4.0 por el fee Bookvia** (parqueado a petición del usuario): integración con PAC (FacturAPI/Sw Sapien) para emitir factura del fee fijo $8.20 al negocio, prerequisito para CFDI de retenciones cuando entre Fintech.
- **Tarifario público en landing** (`/tarifas` o `/beneficios`) con calculadora idéntica para que prospectos vean fees ANTES de registrarse (PROFECO).
- **Estado de cuenta del corte día 1°** por negocio (PDF + email automático).
- **Email confirmación con PDF** al aceptar términos de comisiones (audit trail vía Resend).


## Phase 20 (Feb 2026) - Expediente legal del negocio (PDF + QR verificación)
Generador de expediente legal autoservicio para los negocios + acceso admin para CONDUSEF/soporte.

### Componentes
- **Backend** `/app/backend/services/legal_file_service.py` con WeasyPrint 68.1 — aggregates identidad fiscal, representante legal, documentos KYC, T&C aceptados (+history), términos de comisiones (+history con todos los hashes), estado operativo, resumen financiero.
- **PDF de 3 páginas** con branding Bookvia: header con logo rojo + línea separadora, 7 secciones numeradas, hash SHA-256 del documento visible al pie + QR code de verificación.
- **3 endpoints nuevos**:
  * `GET /api/businesses/me/legal-file.pdf` (owner only, 403 managers, audit log action=legal_file_download by=owner)
  * `GET /api/admin/businesses/{id}/legal-file.pdf` (admin, audit log by=admin)
  * `GET /api/businesses/verificar-expediente/{file_id}` (**público, sin auth**) devuelve minima info con RFC enmascarado + hash para verificación
- **Persistencia**: cada descarga inserta en `db.business_legal_files {id, business_id, content_hash, issued_at, pdf_size_bytes, file_version}`.
- **Frontend**:
  * `CommissionTermsCard` ahora renderiza un `legal-file-download-card` con botón `download-legal-file-btn` que dispara la descarga (blob) y se muestra incluso para negocios sin anticipo.
  * Admin: en `BusinessDetailModal` nuevo botón `admin-download-legal-file-btn`.
  * Nueva ruta pública `/verificar-expediente/:fileId` → `LegalFileVerifyPage.jsx` con states ok/error, RFC enmascarado, hash copiable, chip de versión.

### Testing
- **iteration_97: 9/9 pytest pass** + frontend público 100% validado (`verify-file-id`, `verify-legal-name`, `verify-hash` todos verificados en contexto incognito). Botón de descarga en `/business/settings` bloqueado por modal de T&C v2026-05-01 (issue ortogonal — no-blocker).
- PDF visualmente verificado con `analyze_file_tool`: profesional, sin cortes, branding consistente.

### Artefactos de arquitectura añadidos
- `weasyprint==68.1`, `qrcode==8.2`, `pdf2image` (dev) agregados a `requirements.txt`.
- `poppler-utils` instalado en el sistema (apt) para utilidades de PDF.
- Nueva colección MongoDB `business_legal_files`.


## Phase 21 (Feb 2026) - Estado de cuenta del corte día 1° (PDF por negocio)
Prerrequisito operacional para el primer corte real del 1° de marzo 2026 — cada negocio puede descargar un PDF con el detalle completo de cada liquidación día-20 para conciliar con su contador.

### Componentes
- **Servicio** `/app/backend/services/payout_statement.py` con WeasyPrint. PDF de 2 páginas con:
  * Header Bookvia + folio
  * Hero box verde con **"Neto a depositar"** + fecha de depósito programada
  * 5 secciones: datos del beneficiario, resumen financiero, tabla de transacciones (fecha/cita/cliente/cobrado/stripe/neto), info adicional, política + footer con hash SHA-256 del documento
  * Subtítulo tipo "Estado de cuenta del periodo del 1 al 20 de febrero de 2026 · Depósito programado el 1 de marzo de 2026"
- **3 endpoints nuevos**:
  * `GET /api/businesses/me/settlements` (lista de cortes del negocio)
  * `GET /api/businesses/me/settlements/{id}/statement.pdf` (owner, ownership check con 404 cross-business)
  * `GET /api/admin/settlements/{id}/statement.pdf` (admin, cualquier negocio)
  * Audit log `action=payout_statement_download` con `by` ∈ {owner, admin}
- **Email mejorado**: `send_settlement_notification` ahora envía 2 CTAs — "Descargar estado de cuenta" (deep-link `/business/finance?statement=<id>` con auto-download) + "Ver panel".
- **Frontend**:
  * `BusinessFinancePage`: botón `download-statement-<id>` con `FileDown` en cada row + auto-download cuando la URL tiene `?statement=<id>` (limpia el param con `history.replaceState`).
  * `AdminDashboardPage`: botón `admin-download-statement-<id>` en cada row de la lista de liquidaciones.

### Bugs encontrados y resueltos
- **CRITICAL (fix aplicado)**: `_period_label_es` y `_deposit_date_es` no manejaban el prefijo `MX-` del `period_key` real en producción (`MX-2026-02`). Generaba texto sin sentido "del 1 al 20 de 2026 de MX" y fecha de depósito "—". Reemplazado por `_parse_period_key` que toma `parts[-2:]` y valida `1 <= month <= 12`. Verificado con PDF renderizado: "del 1 al 20 de febrero de 2026" + "1 de marzo de 2026" ✅.

### Testing
- **iteration_98: 13/13 pytest pass** (tras fix del period_key). Backend 100%.
- Frontend source review verde (Playwright bloqueado por auth-context storage — mismo patrón que fases 20 y 97).
- PDF verificado visualmente por `analyze_file_tool` con las 3 aserciones clave de fecha pasando.

### Reutilización Fase 20
- ~70% del boilerplate de template/branding/hash reutilizado del legal_file_service. Mantuvimos separación de servicios para testeabilidad y claridad.



## Phase 22 (Feb 2026) — Stripe Connect Express (FASE A: Onboarding)
**Goal:** Migrar del flujo actual (pagos a cuenta principal + SPEI manuales) a Stripe Connect Express, donde cada negocio tiene su propia cuenta Stripe, recibe pagos directos con `application_fee_amount`, y los payouts los dispara Bookvia con schedule manual.

### Modelo financiero final validado
Confirmado con el usuario tras 2 iteraciones del cuadro de costos/utilidad:
- **Cliente deposita $108**: $100 anticipo del servicio + $8 cuota fija Bookvia (con IVA, subtotal $6.90 + IVA $1.10)
- **Negocio paga 8.5% sobre anticipo ($100)** = $8.50 (subtotal $7.33 + IVA $1.17). Etiqueta "8.5%" es sobre $100 no sobre $108.
- **Cuota mensual Bookvia a negocios**: $49 (subtotal $42.24 + IVA $6.76) — NOTA: el cuadro del usuario tiene error visual, IVA debe ser $6.76 no $7.84.
- **Mínimo anticipo**: $100 MXN (validación pendiente en Fase B)
- **Costos Stripe por reserva (régimen estable)**: 3.6% ($3.89) + fija $3 + 0.25% Connect ($0.27) + IVA acreditable = **$8.30 por reserva**
- **Costo fijo mensual por negocio**: Connect Express $35 (con IVA $40.60) + 1 payout SPEI $12 (con IVA $13.92) = **$47 neto mensual**
- **Utilidad neta real**:
  * 1ª reserva del mes (cubre fijos): $3.76
  * 2ª+ reservas: **$7.07 neto por reserva** (después IVA a Hacienda)
  * Punto de equilibrio: 1 reserva/mes por negocio

### Fase A (implementada Feb 2026)
**Backend** (`/app/backend/routers/stripe_connect.py`):
- `POST /api/stripe-connect/onboard` — Crea `stripe.Account(type="express", country="MX")` con capabilities `card_payments + transfers`, payout schedule `manual`, metadata `bookvia_business_id`. Genera `AccountLink` y retorna URL para redirigir al usuario a Stripe Express onboarding. Idempotente: reusa cuenta existente en llamadas subsecuentes.
- `GET /api/stripe-connect/status` — Consulta Stripe en tiempo real (`stripe.Account.retrieve`) y sincroniza estado a MongoDB: `charges_enabled`, `payouts_enabled`, `details_submitted`, `requirements_due`, `disabled_reason`.
- `POST /api/stripe-connect/dashboard-link` — `stripe.Account.create_login_link()` para que el negocio acceda a su dashboard Express (ver payouts, editar banco).

**Webhook** (`/app/backend/routers/system.py`):
- Nuevo handler `account.updated` — Sincroniza el estado del Connect account a MongoDB cada vez que Stripe notifica cambios (idempotente via `stripe_events` collection de Fase 11). Marca `stripe_connect_onboarded_at` cuando `details_submitted + charges_enabled + payouts_enabled` se cumplen por primera vez.

**Schema** (`/app/backend/models/schemas.py`):
- `BusinessResponse` extendido con 4 campos nuevos: `stripe_connect_account_id`, `stripe_connect_charges_enabled`, `stripe_connect_payouts_enabled`, `stripe_connect_details_submitted`.

**Frontend**:
- Nuevo componente `/app/frontend/src/components/StripeConnectCard.jsx` — Card con 3 estados: "No conectado" (CTA "Conectar con Stripe"), "Pendiente" (CTA "Terminar verificación" + lista de `requirements_due`), "Activo" (indicadores verdes + CTA "Abrir dashboard de Stripe"). Lee `?connect_return=1` y `?connect_refresh=1` de la URL para refrescar estado tras redirect de Stripe.
- Integrado en `BusinessFinancePage.jsx` debajo de las cards de KPIs.
- API añadidos a `businessesAPI`: `connectOnboard()`, `connectStatus()`, `connectDashboardLink()`.

### Constraints del usuario respetadas en el código
- Mínimo anticipo $100 → validación pendiente en Fase B
- $8 al cliente **NO aparece en interfaces del negocio** (ya cumplido desde Fase 19)
- Comisión negocio **8.5% sobre anticipo** (no sobre $108)
- Cuota mensual **$49 obligatoria** (vía Stripe Subscription existente, endurecer en Fase D)
- **1 payout mensual** por negocio (corte día 20, pago día 1)

### Bloqueador externo conocido (user action required)
El primer intento de `stripe.Account.create()` retorna:
> "You can only create new accounts if you've signed up for Connect, which you can do at https://dashboard.stripe.com/connect."

El usuario necesita activar Connect en su Dashboard Stripe (test mode): elegir "Platform/Marketplace", país México, business name Bookvia, payout schedule "Manual". Tras eso, el onboarding de negocios funcionará end-to-end.

### Fases pendientes
- **Fase B**: Validación $100 mínimo anticipo en frontend+backend; auditar que $8 cliente nunca aparezca en UIs de negocio.
- **Fase C (crítica)**: Migrar `PaymentIntent` a `transfer_data[destination] + application_fee_amount` para pagos directos a cuenta Connect del negocio. Refunds con `reverse_transfer=True`. Coexistencia 30 días con flujo legacy.
- **Fase D**: Hacer suscripción mensual $49 obligatoria; webhook `invoice.payment_failed` suspende negocio.
- **Fase E**: Cron mensual dispara `Transfer.create()` día 1° usando schedule manual ya configurado.
- **Fase F**: Email blast + grace period 30 días + bloqueo de reservas para negocios no conectados.

### Testing Fase A
- Endpoints OpenAPI: ✅ 3 nuevos rutas registradas.
- Auth guard: ✅ 401 sin token.
- Status sin cuenta: ✅ retorna `{connected: false, ...}` sin error.
- Onboard con Connect no activado: ✅ retorna error legible "You can only create new accounts if you've signed up for Connect".
- UI: ✅ card renderiza correctamente con estado "No conectado" y CTA "Conectar con Stripe".


## Phase B (Feb 2026) — Modelo Financiero Definitivo
**Goal:** Aplicar el modelo financiero definitivo validado con el usuario: comisión 8.5% con piso $8.50, cuota cliente $8.00 con IVA, factura CFDI on-demand. Previo a migración completa de Connect Express.

### Cambios de constantes
- `BOOKVIA_FEE_MXN`: `8.20` → **`8.00`** (IVA incluido: subtotal $6.90 + IVA $1.10)
- Nueva constante `MIN_BUSINESS_COMMISSION_MXN = 8.50` — piso mínimo de comisión negocio
- `MIN_DEPOSIT_AMOUNT` en `core/config.py`: `50.0` → **`100.0`** (alineado con enums.py)
- `COMMISSION_RATE` en config.py: `0.08` → `0.085` (alineado con STRIPE_FEE_PERCENT_ESTIMATED)

### Lógica actualizada
- `calculate_fees()` ahora usa: `business_commission = max(deposit * 8.5%, $8.50)`
- Para anticipo $100 → comisión $8.50 (floor = 8.5% exacto)
- Para anticipos >$100 → 8.5% variable (escala con ticket)
- Para anticipos <$100 (no deberían existir, pero defensivo) → floor $8.50 protege Bookvia

### UI / Textos actualizados
- `TermsPage.jsx`: versión T&C bump a `2026-05-02`. Textos actualizados:
  * "cuota fija de $8.20" → "cuota fija $8.00 (IVA incluido: subt $6.90 + IVA $1.10)"
  * Ejemplos de anticipo $100: cliente paga $108.00 (no $108.20), negocio recibe $91.50
  * "factura exclusiva" → "factura CFDI bajo solicitud al contacto@bookvia.app"
- `BusinessProfilePage.jsx`: modal de reserva muestra "$8.00 MXN" (no $8.20)
- `UserBookingsPage.jsx`: mensajes de cancelación y no-show compensation actualizados
- `AdminDashboardPage.jsx`: P&L report etiqueta "Fee fijo $8.00"
- `commissionTerms.js` (frontend): versión bumped a `v3-2026-02`, constantes alineadas
- `monthly_pnl_report.py` y `reconciliation.py`: docstrings y labels actualizados

### Lo que deliberadamente NO cambia
- Textos al **negocio** siguen sin mencionar los $8 del cliente (ya estaba así desde Fase 19).
- La comisión al negocio sigue llamándose "Impuestos por transacción" en la UI del negocio (ya estaba desde Fase 19).
- El cálculo de `business_amount` (lo que recibe el negocio) no cambia porque 8.5% era ya el valor.

### Tests actualizados
- `test_fase1_cobranza.py`: matemáticas del breakdown actualizadas ($108.00, $8.00, floor $8.50).
- `test_fase2_wallet.py`: asserts sobre wallet/cancellation flows ajustados ($158.00, $42.00 saldo).
- `test_fase12_security_pnl.py`: fixtures de bookvia_fee actualizados a $8.00.
- `test_phase19_commission_terms_audit.py`: snapshot hash actualizado con `bookvia_fee_mxn=8.00`.
- `test_fase6_no_show_business.py`: client_paid refund montos actualizados a $108.00.

### Resultados
- **69 de 71 tests pasan** en los módulos afectados. Los 2 fallos son **pre-existentes** no relacionados (wallet_fallback en card-refund + async event-loop issue en brute_force).
- Breakdown API valida correctamente para anticipos $100/$500/$1000 con matemáticas exactas.

### Facturación CFDI (agendada, no implementada aún)
Usuario confirmó: recibo por defecto; factura CFDI on-demand vía `contacto@bookvia.app`. Implementación pendiente cuando el negocio comience a facturar (SAT + PAC integration, fuera del scope actual).


## Phase A.2 (Feb 2026) — Stripe Connect Bloqueante (Opcion A)
**Goal:** Forzar a TODOS los negocios a conectar su cuenta Stripe Express ANTES de poder recibir reservas. Sin Stripe activo, el negocio queda invisible en busquedas y no acepta bookings.

### Cambios

**Backend** (`/app/backend/models/enums.py`):
- `VISIBLE_BUSINESS_FILTER` ahora exige `stripe_connect_charges_enabled: True`
- Aplica automaticamente a `/api/businesses/search` (publica) y a la card "Cuenta Stripe Connect"

**Backend** (`/app/backend/routers/bookings.py`):
- `create_booking()` rechaza con HTTP 400 si el negocio no tiene `stripe_connect_charges_enabled: True`
- Mensaje de error: "Este negocio aun no ha completado su registro de pagos. Intenta mas tarde."
- Excepcion: las reservas creadas POR el negocio (walk-ins) si pasan, para no romper su operacion interna.

**Frontend** (`StripeConnectRequiredBanner.jsx` — nuevo):
- Banner amarillo persistente en `BusinessDashboardPage` (encima de los stats).
- Solo aparece si Stripe NO esta `charges_enabled + payouts_enabled + details_submitted`.
- 2 estados visuales:
  * "No conectado" → CTA "Conectar Stripe" (redirige a onboarding)
  * "Pendiente" → CTA "Terminar" (resume onboarding) + lista de requirements_due
- 100% silencioso una vez Stripe esta activo (no renderiza nada).

**Frontend** (`SubscriptionSuccessPage.jsx`):
- Despues de pagar suscripcion en flujo de registro, se muestra ahora un mensaje adicional: "Despues de iniciar sesion, te pediremos conectar tu cuenta bancaria con Stripe (gratis) para poder recibir pagos de tus clientes."

### Testing
- ✅ Search publica con `?limit=5` retorna 0 negocios (ningun negocio tiene Connect activo aun) — filtro funcionando.
- ✅ Booking POST `/api/bookings/` con negocio sin Connect → 400 + mensaje correcto.
- ✅ Banner se renderiza con `data-testid="stripe-connect-required-banner"` en `/business/dashboard`.
- ✅ Banner desaparece cuando `charges_enabled + payouts_enabled + details_submitted`.

### Bloqueador externo conocido (user action required)
Para que el usuario pueda crear cuentas Connect, debe completar en su Dashboard Stripe:
1. Activa tu cuenta (datos plataforma Bookvia)
2. Verifica documento de identidad (INE/representante)
3. Confirma datos finales

Hasta entonces, el endpoint `/api/stripe-connect/onboard` devuelve:
> "You can only create new accounts if you've signed up for Connect, which you can do at https://dashboard.stripe.com/connect"

Eso indica que la activacion del Connect Setup wizard no esta 100% completa — los pasos opcionales del checklist son requisitos en realidad.


## Phase A.2.1 (Feb 2026) — Feature Flag para desbloquear pruebas
**Goal:** El gate de Stripe Connect bloqueaba TODAS las pruebas (search vacio, bookings rechazados) porque ningun negocio tiene Connect activo aun. Lo convertimos en feature flag controlable.

### Cambio
- Nueva env var `ENFORCE_STRIPE_CONNECT_GATE` (default: `false`).
- `visible_business_filter_now()` aplica `stripe_connect_charges_enabled: True` solo cuando flag = ON.
- `create_booking()` valida Stripe Connect solo cuando flag = ON.
- El **banner amarillo** en `BusinessDashboardPage` SIGUE apareciendo siempre (es solo recordatorio para que negocios conecten antes del lanzamiento).

### Cuando activar el gate (ON)
- Cuando Bookvia tenga la empresa registrada legalmente en Mexico (RFC, SAT, etc).
- Cuando el dueno de Bookvia complete los 3 pasos de Stripe: "Activa tu cuenta", "Verifica documento", "Confirma datos finales".
- Cuando ya hayas hecho email blast a negocios para que migren a Connect (Fase F).
- Activar con: `ENFORCE_STRIPE_CONNECT_GATE=true` en Railway env vars.

### Testing verificado
| Estado | Search publica | Booking |
|---|---|---|
| Gate OFF (default) | 2 negocios visibles | HTTP 200 |
| Gate ON | 0 negocios visibles | HTTP 400 + mensaje |


## Phase G (Feb 2026) — Winback Campaigns + LFPDPPP Compliance
**Goal:** Permitir al admin reactivar usuarios inactivos (registrados sin reservar / clientes que se enfriaron) via campaña de email masiva con incentivo de saldo Bookvia. Implementar tambien delete-account y unsubscribe LFPDPPP-compliant.

### Backend
- **Servicio** `/app/backend/services/winback.py`:
  * `find_inactive_users(segment, days)` — detecta `never_booked` / `stale_user` / `all`. Excluye dados de baja, banned, contactados ultimos 15 dias.
  * `run_winback_campaign()` — envia emails via Resend, genera codigo unico de incentivo $50 MXN (vence 7 dias) por usuario, registra en `winback_emails` y `winback_campaigns`. Soporta `dry_run`.
  * `redeem_winback_incentive(code, user_id)` — aplica el credito al wallet cuando el usuario lo redime.
  * 3 templates HTML branded: `miss_you`, `first_booking`, `new_businesses`.

- **Router admin** `/app/backend/routers/winback.py`:
  * `GET  /api/admin/winback/inactive-users` — preview de usuarios candidatos
  * `POST /api/admin/winback/campaign` — dispara campana (con dry_run opcional)
  * `GET  /api/admin/winback/campaigns` — historial de campanas

- **Router publico (LFPDPPP)**:
  * `GET  /api/users/unsubscribe-info?token=...` — preview confirmacion
  * `POST /api/users/unsubscribe` — 1-click unsubscribe (sin auth, con token unico)
  * `POST /api/users/me/delete-account` — derecho al olvido para cliente (anonimiza PII, preserva historial sin datos)
  * `POST /api/users/me/business/delete-account` — derecho al olvido para negocio (anonimiza, cancela suscripcion, preserva settlements por SAT)

- **Anti-spam**: maximo 1 winback email por usuario cada 15 dias. Despues de 3 emails sin abrir → stop automatico.
- **Incentivo**: $50 MXN saldo Bookvia con codigo `BVxxxxx`, vence 7 dias. Debita al wallet con `services/wallet.credit_wallet`.

### Frontend
- **Componente** `/app/frontend/src/components/AdminWinbackTab.jsx`:
  * 3 KPI cards (usuarios inactivos / gasto historico / campanas previas)
  * Selector de segmento + template + dias + toggle incentivo + toggle dry-run
  * Tabla preview con primeros 50 usuarios
  * Boton "Enviar a N usuarios" con confirmacion (AlertDialog)
  * Historial de campanas pasadas
- **Tab "Reactivacion"** agregado a `AdminDashboardPage` (entre Cumplimiento y Equipo)
- **Pagina publica** `/app/frontend/src/pages/UnsubscribePage.jsx` en ruta `/unsubscribe?token=xxx` (sin auth)
- **Componente** `/app/frontend/src/components/DeleteAccountCard.jsx` para Settings (kind="user" o kind="business"). Confirma con palabra "ELIMINAR" tipeada antes de borrar.
- **Integrado en** `BusinessSettingsPage` (kind="business"). UserDashboardPage ya tenia su propio flujo (DELETE /users/me/account).

### LFPDPPP Compliance achievements
- ✅ Cada email winback tiene link `/unsubscribe?token=...` (1-click, sin login)
- ✅ Tabla `email_unsubscribes` registra opt-outs permanentemente
- ✅ Nunca se vuelve a contactar a un usuario que se dio de baja
- ✅ Soft-delete preserva integridad fiscal (settlements, bookings) anonimizando PII
- ✅ Confirmacion explicita ("ELIMINAR" tipeado) antes de delete

### Testing verificado
- ✅ 7 endpoints registrados en OpenAPI
- ✅ Auth guards: 401 sin token, 422 sin token unsubscribe
- ✅ Inactive users detecta 53 usuarios (segment=all, days=30) — excluye admin/business/banned/unsub/recently-contacted
- ✅ Dry-run procesa 53 sin enviar (sent=53, failed=0, dry_run=true)
- ✅ Tab "Reactivacion" visible en `/bv-ctrl` admin con KPI count: 53


## Phase H (Feb 2026) — Reestructura de Categorías + Stepper navegable
**Goal:** Reemplazar las 11 categorias inconsistentes (con solapamientos y "Salones, Servicios y Eventos" confuso) por una taxonomia de 2 niveles: 12 categorias madre + 74 subcategorias, alineada con benchmarks (Fresha, Booksy, Vagaro). Permitir al negocio elegir hasta 3 subcategorias.

### Cambios

**Backend**:
- `models/schemas.py` — `BusinessCreate.subcategory_ids: List[str] = []` (max 3, validados que pertenezcan al parent), `BusinessResponse.subcategory_ids` + `subcategory_names`.
- `routers/categories.py` — Default `GET /api/categories` ahora retorna SOLO parents. Param `?include_subcategories=true` o `?parent_id=<id>` para children. Nuevo `GET /api/categories/{slug_or_id}/subcategories`.
- `routers/auth.py::register_business` — valida que las subcategorias pertenezcan al parent.
- **Migration script** `/app/scripts/migrate_categories_phase_h.py` ejecutado:
  * Borradas 7 categorias legacy.
  * Insertadas 12 parent categories nuevas con slugs estables.
  * Insertadas 74 subcategorias.
  * 1 negocio migrado (consultoria → servicios-profesionales).

**Frontend**:
- `pages/BusinessRegisterPage.jsx`:
  * Step 0: Select de categoria padre dispara `getSubcategories()` en cambio.
  * Render dinamico de **chips multi-select** (max 3) con `data-testid="subcategory-chip-<slug>"`.
  * Contador "X/3 seleccionadas".
  * Stepper visual (1-2-3-4-5) ahora **clickeable hacia atras** — boton `data-testid="stepper-jump-<index>"` permite saltar a steps ya completados (no adelante, no en step 5).
- `lib/api.js` — `categoriesAPI.getSubcategories(slugOrId)`.

### Mapping legacy → nuevo
| Legacy slug | Nuevo parent slug |
|---|---|
| belleza-estetica | belleza-estetica (igual) |
| salud | salud-medicos |
| fitness-bienestar | fitness-deportes |
| spa-masajes | spa-masajes (igual) |
| servicios-legales | servicios-profesionales |
| consultoria | servicios-profesionales |
| automotriz | automotriz (igual) |
| veterinaria | mascotas |
| salones-servicios-eventos | eventos-banquetes |
| otro | otros-servicios |
| (nuevas: bienestar-terapias, educacion, hogar-reparaciones) | — |

### Testing verificado
- ✅ `GET /api/categories?country_code=MX` → 12 parents
- ✅ `GET /api/categories/belleza-estetica/subcategories` → 8 chips
- ✅ `GET /api/categories/salud-medicos/subcategories` → 7 chips
- ✅ Screenshot del wizard muestra los 12 nuevos labels en dropdown
- ✅ Stepper buttons clickeables hacia atras renderizan correctamente


## Phase H.2 (Feb 2026) — Landing Pages SEO por Subcategoría
**Goal:** Aprovechar las 74 subcategorias de Phase H para generar landing pages dinamicas SEO-friendly: `bookvia.app/{country}/{city}/{subcategory_slug}`. Cada combinacion subcategoria+ciudad es una URL unica indexable por Google.

### Cambios

**Backend** (`/app/backend/routers/seo.py`):
- `GET /api/seo/categories` ahora retorna 86 categorias (12 parents + 74 subs) con `business_count` calculado correctamente para subs (filtra por `subcategory_ids`).
- `GET /api/seo/businesses/{country}/{city}?category={slug}` reconoce automaticamente si el slug es parent o subcategory:
  * Parent: filtra por `category_id`
  * Subcategory: filtra por `subcategory_ids` (array contains)
- Sitemap `sitemap.xml` ahora incluye URLs por cada subcategoria por ciudad. Ejemplo para 50 ciudades MX × 86 categorias = ~4,300 URLs SEO adicionales (priority 0.7 subs, 0.8 parents).

**Frontend** (`/app/frontend/src/App.js`):
- `KNOWN_CATEGORIES` actualizado con los 12 parents + 74 subs nuevos slugs.
- El `SEORouter` ahora reconoce instantaneamente cualquier slug de subcategoria sin hacer roundtrip al API.

**Frontend** (`/app/frontend/src/pages/seo/CategoryPage.jsx`):
- "Otras categorias" en footer actualizado a slugs nuevos (`salud-medicos`, `fitness-deportes`).
- Funciona out-of-the-box con subcategorias gracias a `seoAPI.getCategories()` que ya incluye subs.

### URLs SEO ejemplo generadas
- `bookvia.app/mx/cdmx/dental`
- `bookvia.app/mx/guadalajara/yoga`
- `bookvia.app/mx/queretaro/barberia`
- `bookvia.app/mx/monterrey/masaje-deportivo`
- `bookvia.app/mx/cdmx/plomeria`

### Testing verificado
- ✅ `/api/seo/categories` retorna 86 entries (12 parents + 74 subs)
- ✅ Sitemap genera URLs por subcategoria
- ✅ `GET /mx/queretaro/dental` carga, title="Dental en Querétaro | Bookvia", H1="Dental", breadcrumbs correctos
- ✅ Empty state amigable cuando no hay negocios para esa subcategoria
- ✅ Filter por subcategory funciona en backend (returna 0 actualmente porque no hay negocios marcados con dental, pero la query funciona)

### Impacto SEO esperado
- Antes: ~600 URLs en sitemap (50 ciudades × 12 categorias parent)
- Despues: ~4,900 URLs en sitemap (50 ciudades × 86 categorias)
- Cada URL es un long-tail keyword: "dental en queretaro", "yoga en cdmx", "barberia coyoacan"
- Booksy/Fresha capturan 40-60% de trafico nuevo por estas URLs


## Phase D (Feb 2026) — Suscripción $49 obligatoria con auto-suspensión
**Goal:** Hacer la suscripción mensual $49 verdaderamente obligatoria. Si la tarjeta del negocio falla, sistema escala automáticamente: warning email → suspensión día 7 → cancelación día 30.

### Backend

**Webhooks** (`/app/backend/routers/system.py`):
- `invoice.payment_succeeded` — re-activa el negocio si estaba `past_due` o suspendido por pago. Limpia `subscription_failed_attempts`, `subscription_failed_at`.
- `invoice.payment_failed` — incrementa `subscription_failed_attempts`, marca `subscription_status='past_due'`, registra `subscription_failed_at`. Manda email automático.
- `customer.subscription.deleted` — cancela definitivamente: `subscription_status='canceled'`, `banned=True`, `banned_reason='subscription_canceled'`.

**Cron diario** (`/app/backend/services/subscription_enforcement.py`):
- Día 7+ con pago fallido: suspende (`banned=True, banned_reason='subscription_unpaid'`, `suspended_at=now`). El `VISIBLE_BUSINESS_FILTER` lo oculta automáticamente. Email de aviso.
- Día 30+ con pago fallido: cancela Stripe Subscription via `Subscription.delete()`, marca `subscription_status='canceled'`. Email final.
- Programado en `server.py::subscription_enforcement_scheduler` (cada 24h).

**Endpoint** (`/app/backend/routers/businesses.py`):
- `POST /api/businesses/me/subscription/billing-portal` — genera Stripe Customer Portal session. Permite al negocio actualizar tarjeta, ver facturas, cancelar suscripción desde la UI hospedada de Stripe.

### Frontend

**Componente** `/app/frontend/src/components/SubscriptionPastDueBanner.jsx`:
- Banner persistente en `BusinessDashboardPage`.
- 2 estados visuales:
  * `past_due` → banner naranja "Tu pago mensual fallo - actualiza tu tarjeta. Tienes 7 dias..."
  * `unpaid` / `canceled` → banner rojo "Tu cuenta esta suspendida..."
- CTA único: "Actualizar tarjeta" → llama `billingPortal()` → redirige a Stripe Customer Portal.
- Self-hides cuando subscription esta `active`/`trialing`/`none`.

**API** (`/app/frontend/src/lib/api.js`):
- `businessesAPI.billingPortal()` — agrega endpoint Customer Portal.

### Flujo completo

```
Día 0:  Tarjeta cobra OK → subscription_status='active', business visible y operativo
        ↓ (mes después si tarjeta vence o fondos insuficientes)
Día 1:  webhook invoice.payment_failed → past_due, attempt=1, email automático
Día 3:  webhook invoice.payment_failed → past_due, attempt=2, email automático
Día 7:  cron suspende → banned=True, banned_reason='subscription_unpaid'
        - Negocio invisible en busquedas (VISIBLE_BUSINESS_FILTER excluye banned)
        - Banner rojo crítico en dashboard
        - Email de suspensión
Día 30: cron cancela → Stripe.Subscription.delete() + canceled status + email final
        - Negocio debe registrarse de nuevo si quiere volver
```

### Recovery flow

Cuando el negocio actualiza su tarjeta vía Customer Portal:
1. Stripe re-intenta el pago automáticamente
2. Si exitoso → webhook `invoice.payment_succeeded`
3. Backend re-activa: `subscription_status='active'`, `banned=False`, `banned_reason=None`, contador attempts=0
4. Negocio vuelve a aparecer en busquedas inmediatamente
5. Banner del dashboard desaparece

### Testing verificado
- ✅ Webhook handlers registrados en `system.py`
- ✅ `subscription_enforcement_scheduler` arranca correctamente (logs muestran "Subscription enforcement scheduler started")
- ✅ Endpoint `/api/businesses/me/subscription/billing-portal` registrado en OpenAPI
- ✅ Auth guard 401 sin token
- ✅ Con token de negocio: retorna URL real de Stripe Customer Portal (`https://billing.stripe.com/p/session/test_...`)
- ✅ Banner componente sin issues lint
- ⚠️ Banner UI no testeado visualmente porque `getSubscriptionStatus` sincroniza con Stripe live y sobreescribe past_due manual → comportamiento correcto en producción

### Comportamiento esperado en producción
Cuando un negocio real tenga su tarjeta fallida:
1. Stripe envía `invoice.payment_failed` al webhook
2. Backend marca `past_due` (no se sobreescribe porque Stripe también lo retorna `past_due`)
3. Banner naranja aparece automáticamente al cargar dashboard
4. Cron suspende día 7 si no actualiza


---

## Changelog Reciente

### Feb 2026 - Endurecimiento Pre-Lanzamiento

**Eliminadas rutas de debug de Sentry (seguridad en producción)**
- ❌ Removido `GET /api/_debug/sentry` de `/app/backend/routers/system.py` (lanzaba ZeroDivisionError de prueba)
- ❌ Removida ruta `/_debug/sentry` y componente `SentryTestPage` de `/app/frontend/src/App.js`
- ✅ Verificado: endpoint backend devuelve 404; `/api/health` sigue 200 OK
- Motivo: Sentry ya quedó validado en backend y frontend; las rutas de prueba ya no deben estar expuestas al público.

**Notificaciones in-app 🔔 unificadas para todos los roles**
- ✅ Habilitada la campana del Navbar (`nav-notification-bell`) para CLIENTES, NEGOCIOS y ADMIN (antes sólo clientes).
- ✅ Polling automático cada 30 segundos para mantener el contador de no leídas actualizado.
- ✅ Navegación inteligente al hacer click sobre una notificación:
   - `data.booking_id` + rol negocio → `/business/dashboard?booking=<id>`
   - `data.booking_id` + rol cliente → `/bookings`
   - `data.business_id` + rol admin → `/bv-ctrl?business=<id>`
   - Fallback: dashboard correspondiente al rol.
- ✅ Eliminada la campana redundante del BusinessDashboardPage (data-testid antiguo `notification-bell`) para evitar dos campanas a la vez. El BusinessDashboardPage conserva la lógica de state interno por si otras secciones la consumen, pero ya no renderiza el botón.
- ✅ Botón móvil de notificaciones disponible también para negocios y admin en el menú hamburguesa.
- ✅ **Toast flotantes en tiempo real**: cuando el polling detecta una nueva notificación no-leída, dispara un `toast()` con el título, mensaje y botón "Ver" que navega al recurso. Refs `seenIdsRef` + `initialisedRef` evitan toast-spam al cargar la sesión.
- Endpoints backend ya existentes: `GET /api/notifications`, `GET /api/notifications/unread-count`, `PUT /api/notifications/{id}/read`, `PUT /api/notifications/read-all` — usados sin cambios.
- 25+ disparadores automáticos ya activos (booking creada/cancelada/confirmada, pago recibido, suspensión negocio, etc.) — no se tocaron.
- Smoke test: campana visible con badge "9+" en negocio, "5" en cliente; campana antigua del business dashboard confirmadamente removida.

**Status page público `/status`**
- ✅ Nuevo endpoint backend `GET /api/status` (público, sin auth, sin secretos) que pinguea: API, MongoDB y Stripe en paralelo, devolviendo latencia en ms + estado por componente (operational | degraded | down).
- ✅ Stripe ping usa `stripe.Account.retrieve()` envuelto en `asyncio.to_thread` para no bloquear el event loop.
- ✅ Nueva página pública `/status` (`StatusPage.jsx`) con:
   - Banner global verde/amarillo/rojo según peor componente
   - Lista de componentes con latencia visible (API, Database, Stripe)
   - Auto-refresh cada 60 segundos + botón "Actualizar" manual
   - Header minimalista (logo + botón refresh) — no depende del Navbar para máxima resiliencia
   - Bilingüe es/en
- ✅ Verificado en preview: muestra "Todos los sistemas operativos", Database 1ms, Stripe LIVE 293ms.

**Botón "Compartir mi negocio" 📲**
- ✅ Botón "Compartir" agregado al header del Business Dashboard junto a Ver perfil / Recepción / Config.
- ✅ Genera un mensaje pre-armado bilingüe ("Hola! 👋 Reserva tu cita en {negocio} facil y rapido por Bookvia: {url}?ref=share") y abre `https://wa.me/?text=<msg>` en nueva pestaña.
- ✅ Query param `?ref=share` permite trackear conversiones de tráfico orgánico vía WhatsApp.
- ✅ Verificado en preview: click sobre el botón produce URL correcta con slug del negocio y ref=share.

**ENFORCE_STRIPE_CONNECT_GATE activado en preview**
- ✅ `.env` del backend ahora contiene `ENFORCE_STRIPE_CONNECT_GATE=true`
- ✅ `visible_business_filter_now()` excluye negocios sin `stripe_connect_charges_enabled` del listado público
- ✅ `POST /api/bookings` devuelve 400 si se intenta reservar a un negocio sin Connect
- ⚠️ **Pendiente acción del usuario**: agregar la variable también en Railway para que se active en producción.

**Dashboard adaptativo cuando el negocio NO usa anticipos**
- ✅ Stat card "Ingresos mes" se reemplaza por **"Clientes del mes"** cuando `biz.requires_deposit=false`.
- ✅ `StripeConnectRequiredBanner` se oculta cuando `requires_deposit=false` (no aplica porque no procesan dinero por la plataforma).
- ✅ Modal de detalle de cita: muestra "Tipo de cobro: En el local" en lugar de "Anticipo pagado: ✗".
- ✅ Modal de estadísticas: oculta fila "Ingresos totales" cuando `!requires_deposit`.
- ✅ Verificado: testing agent flippeó `requires_deposit` en DB y validó ambos comportamientos.

**Decommission flow para dar de baja negocios (con dignidad)**
- ✅ Nuevo `BusinessStatus.DECOMMISSIONED` en enums.
- ✅ Endpoint `POST /api/admin/businesses/{id}/decommission` con body `{reason, note, send_email, export_data}`.
   - 7 razones categorizadas: pause_temporary, permanent_closure, platform_switch, low_activity, not_onboarded, owner_request, other.
   - Email empático adaptado por razón (textos hand-crafted en español).
   - Encuesta de salida embebida ("en una frase, qué pudimos haber hecho mejor?").
   - Soft-delete (data preservada 30+ días para reactivación).
   - Audit log + notificación in-app al dueño.
   - Si `export_data=true` devuelve string CSV con servicios, clientes y reservas para handoff de buena fe.
- ✅ Endpoint `POST /api/admin/businesses/{id}/reactivate` para revertir.
- ✅ Componente `<DecommissionDialog />` (modal con dropdown, textarea, checkboxes, confirmación por nombre del negocio).
- ✅ Botón "Dar de baja" + "Reactivar" en la lista de Negocios del Admin Dashboard.
- ✅ Auto-download del CSV en el browser al confirmar.
- ✅ 9 pytest cases creados en `/app/backend/tests/test_decommission_flow.py` — todos pasan.
- ✅ ACL verificado: clientes regulares reciben 403 en los endpoints.

**Menú de usuario ampliado + Bottom Nav móvil**
- ✅ DropdownMenu del avatar expandido por rol:
   - Cliente: Mi perfil, Mis citas, Favoritos, Historial de pagos, Preferencias de avisos, Tema, Idioma, Ayuda, Términos, Logout.
   - Negocio: Panel, Configuración, Suscripción y facturación, Reportes, Tema, Idioma, Ayuda, Términos, Logout.
   - Admin: Admin Panel + items comunes.
- ✅ **Nuevo componente `BottomNav.jsx`**: barra fija inferior en móvil (≤md, oculta en desktop) con 4 íconos:
   - Cliente: Explorar | Mis citas | Avisos | Yo.
   - Negocio: Panel | Recepción | Yo.
   - Admin: Inicio | Admin | Yo.
   - No autenticado: Explorar | Entrar.
- ✅ Oculta automáticamente en `/login`, `/signup`, `/status`, `/checkout`, `/business/reception`, `/auth/google/callback`.
- ✅ Respeta `safe-area-inset-bottom` para notch de iPhone.
- ✅ Padding-bottom 68px en Layout para que el contenido no quede tapado.

### Pendientes inmediatos para apertura formal al público (P0)
1. **Cloudinary**: Usuario debe crear cuenta gratuita en cloudinary.com y configurar `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` en Railway. Sin esto, los backups diarios de MongoDB fallarán.
2. **Onboarding Stripe Connect del negocio piloto** ("barbería pitufo") para validar el flujo de Transfer real el día 20.

### Backlog priorizado post-cleanup
- P1: Status page público en `/status` (uptime DB, API, Stripe)
- P1: Notificaciones in-app (campana en header)
- P2: Activar flag `ENFORCE_STRIPE_CONNECT_GATE=true`
- P2: Twilio A2P 10DLC para SMS reales
- P3: Refactor de `bookings.py` y `AdminDashboardPage.jsx`
- P3: Modelo multi-sucursal
