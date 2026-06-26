# Bookvia – CHANGELOG

Registro cronológico de cambios significativos (post-refactor base PRD).

## 2026-06-26 – Phase 1+2 Push Notifications (FCM) — Setup base

### Infraestructura
- Instalado `firebase-admin==7.4.0` en `backend/requirements.txt`.
- Nuevo `services/push_notifications.py` con:
  - `init_firebase()` lazy + dual-source (env var `FIREBASE_ADMIN_SDK_JSON` o `secrets/firebase-admin.json`).
  - 12 catálogos de notificación tipados (`NOTIFICATION_TYPES`).
  - `send_to_user(user_id, type, title, body, deep_link)` con multi-device + auto-drop de tokens inválidos + opt-out por preferencias.
  - 12 helpers high-level: `notify_new_booking`, `notify_booking_confirmed`, `notify_booking_canceled_by_business/customer`, `notify_booking_reminder`, `notify_refund_processed`, `notify_review_request`, `notify_settlement_sent`, `notify_business_approved`, `notify_subscription_expired`, `notify_trial_ending`.
- Nuevo `routers/push.py`:
  - `POST /api/push/register` (upsert token + platform)
  - `DELETE /api/push/unregister`
  - `GET /api/push/preferences` (devuelve 12 flags + labels español)
  - `PATCH /api/push/preferences` (toggle individual)
  - `POST /api/push/test` (auto-envío para verificar setup)
- Router registrado en `server.py`.

### Frontend
- `frontend/src/lib/capacitor.js::enablePushForCurrentUser()`: helper alto-nivel que pide permiso, registra FCM token y lo POSTea a `/api/push/register` con el JWT del usuario.
- `frontend/src/lib/auth.js`: invoca `enablePushForCurrentUser()` después de cada login y al reanudar sesión.

### Trigger implementado: Nueva reserva → negocio
- `routers/bookings.py::create_booking` ahora envía push al `business.user_id` cuando un cliente reserva. Tolerante a fallos (no rompe la creación si Firebase falla).

### Archivos de credenciales
- `frontend/android/app/google-services.json` (Firebase Android config, gitignored).
- `backend/secrets/firebase-admin.json` (Service Account, gitignored).
- Firebase project: `bookvia-537b7`. Package: `app.bookvia.bookvia`.

### Verificación end-to-end
- `init_firebase()` retorna OK.
- Login → GET preferences devuelve 12 tipos correctos.
- POST register acepta token + platform.
- PATCH preferences actualiza flags individuales.
- POST test ejecuta sin error.

### Pendientes (siguiente sesión)
- Triggers de las otras 11 notifications (cancelaciones, refunds, settlements, etc.).
- Scheduler para recordatorios 1h y 24h antes de la cita.
- UI de preferencias en perfil cliente.
- Deep-link handler en App.js para que el tap navegue a `/bookings/:id`.

## 2026-06-25 (madrugada) – Normalización de ciudades (anti-duplicados)

### Bug del usuario: ciudades duplicadas + buscador sin autocompletado
- **Problema**: El dropdown de ciudades mostraba "Nuevo Laredo" y "NUEVO LAREDO" como dos entradas separadas; lo mismo "Ciudad de México" vs "Ciudad de Mexico" (con/sin acento).
- **Root cause**: `businesses.city` se guardaba como free-text sin normalización; el endpoint `/api/cities` agrupaba por valor exacto.

### Fix en 3 capas
1. **Helper `services/city_normalize.py`** (nuevo)
   - `city_match_key(s)`: produce key dedup → lowercase + collapse whitespace + strip diacritics (NFKD).
   - `normalize_city_name(raw, db)`: busca match accent + case-insensitive en `db.cities`; devuelve nombre canónico del catálogo o Title Case fallback.

2. **Write paths normalizados**
   - `routers/auth.py::register_business`: aplica `normalize_city_name` antes de guardar.
   - `routers/businesses.py::update_business`: refactorizado para usar el mismo helper.

3. **Read path dedup**
   - `routers/system.py::get_cities` con `with_businesses=true`: agrupa por `city_match_key` en Python, prefiere ortografía del catálogo, suma counts de variantes.

4. **Frontend autocomplete accent-insensitive**
   - `components/CitySelector.jsx`: filtro normaliza diacritics (Mexico ≡ México).
   - `pages/HomePage.jsx`: dropdown hero también accent-insensitive.

### Migración de datos existentes
Ejecutado manualmente: 30 businesses de 55 actualizados ("NUEVO LAREDO" → "Nuevo Laredo", etc.).
Para producción (Railway): llamar al endpoint admin existente `POST /api/admin/businesses/normalize-cities` con token de admin.

### Verificación
- 24/24 nuevos tests `/app/backend/tests/test_city_normalization.py` ✅
- 19/19 tests de regresión (iteration_107) siguen ✅
- Live test: `/api/cities?country_code=MX&with_businesses=true` retorna 1 sola entrada "Ciudad de México" (antes había 4+ variantes).

## 2026-06-25 (noche) – Resolución final: APK funcionando

### Root cause definitivo del "skeleton loaders" en APK
Después de aplicar todos los fixes anteriores (CORS, fotos, UX), el APK del
usuario seguía mostrando solo skeleton loaders. La causa raíz era:

- El archivo `frontend/.env` está en `.gitignore` (correcto, contiene secrets).
- Cuando el usuario clonó el repo en su PC Windows con `git pull`, **NO recibió** ningún `.env`.
- Al ejecutar `yarn build` localmente, `process.env.REACT_APP_BACKEND_URL` quedó `undefined`.
- El bundle compilado intentó hacer fetch a `undefined/api/...` que se resolvió como path relativo → `https://localhost/api/...` en el WebView de Capacitor.
- Resultado: todas las APIs fallaban silenciosamente → skeletons eternos.

La web pública (Vercel) sí funcionaba porque Vercel inyecta `REACT_APP_BACKEND_URL` desde su dashboard de Environment Variables al hacer build.

### Fix definitivo
1. El usuario creó `frontend/.env` localmente con:
   ```
   REACT_APP_BACKEND_URL=https://bookvia-production.up.railway.app
   ```
2. Hizo rebuild completo (`yarn build && npx cap sync android` + Android Studio Clean+Rebuild+Build APK).
3. APK final: funcional ✅ (negocios y fotos cargando correctamente).

### Salvaguarda agregada al repo
- Nuevo archivo `frontend/.env.example` con instrucciones claras y los valores correctos para producción APK. Así cualquier futuro clone/fork del repo tiene la plantilla lista para copiar a `.env`.

## 2026-06-25 (tarde) – Fix bugs APK: CORS + Fotos + UX móvil

### Bug crítico: skeleton loaders eternos en APK (no cargan negocios)
- **Root cause**: `allow_origins=["*"]` combinado con `allow_credentials=True` viola la spec CORS. El Chrome WebView de Capacitor (Android) rechaza silenciosamente las respuestas.
- **Fix**: `backend/server.py` y `backend/main.py` ahora usan `allow_origin_regex=".*"` cuando `CORS_ORIGINS=*`, así Starlette eco-a el origen específico de la petición en lugar de devolver `*`. Cuando hay una lista explícita, se agregan automáticamente los orígenes nativos de Capacitor: `https://localhost`, `capacitor://localhost`, `http://localhost`.
- **Verificado**: 9/9 tests en `/app/backend/tests/test_cors_and_businesses_fix.py` pasan.

### Bug crítico: las fotos de negocios no se ven (404)
- **Root cause**: (1) URLs almacenadas con host obsoleto (`reserve-stripe-test.preview...`) heredado de forks anteriores; (2) `serve_file` en `routers/system.py` buscaba por `public_id` pero la DB tiene `storage_path` poblado; (3) fotos soft-deleted (`is_deleted=true`) seguían apareciendo en el array `businesses.photos`.
- **Fix**:
  - `routers/system.py::serve_file` ahora busca por `storage_path` OR `public_id`, excluyendo `is_deleted=true`.
  - Nuevo helper `_sanitize_business_photos` en `routers/businesses.py:52-108` que: (a) reescribe el hostname al `BASE_URL` actual, (b) filtra URLs cuyo doc está soft-deleted o ausente.
  - Aplicado en: `GET /api/businesses` (search), `/api/businesses/featured`, `/api/businesses/{id}`, `/api/businesses/by-code/{code}`, `/api/businesses/slug/{slug}`.
- **Verificado**: 10/10 tests en `/app/backend/tests/test_business_photos_fix.py` pasan; HEAD a URLs reales devuelve `200 image/jpeg`.

### UX: "Cerca de ti" mostraba "0 resultados"
- Cuando el usuario tenía `Abierto ahora` activado al pedir geolocalización y ningún negocio reportaba `is_open_now=true`, el frontend filtraba todo a 0. Ahora `requestLocation()` desactiva también `openNow` además de los otros filtros restrictivos.

### Íconos y splash con fondo NEGRO (cambio solicitado por usuario)
- Regenerados todos los assets desde el logo en `/app/frontend/resources/`:
  - `icon.png`, `icon-foreground.png` (logo al 92%), `icon-background.png` (negro sólido).
  - `splash.png`/`splash-dark.png` (2732×2732, logo centrado sobre negro).
- `capacitor.config.ts` → `backgroundColor: '#000000'` para `android`, `ios`, `SplashScreen`, `StatusBar`. `showSpinner: false`.
- `android/app/src/main/res/values/ic_launcher_background.xml` → color `#000000`.
- Re-ejecutado `npx capacitor-assets generate --android` → 136 archivos regenerados.
- `versionCode 1 → 2`, `versionName 1.0 → 1.0.1` para forzar update en Android.

## 2026-06-25 (mañana) – Capacitor Android: assets + UX móvil (deprecado por fix de la tarde)

### Generación inicial de íconos y splash (fondo rojo)
- Instalado `@capacitor/assets`.
- Generación inicial con fondo `#F05D5E` rojo Bookvia (luego cambiado a negro a pedido del usuario).

### Bypass SSL temporal del apex domain
- `PUBLIC_WEB_URL` en `frontend/src/lib/capacitor.js` ahora apunta a `https://www.bookvia.app` para evitar `ERR_CERT_AUTHORITY_INVALID`.

### Fix: pantalla vacía sin permiso de ubicación
- `SearchPage.jsx::requestLocation()` ahora hace fallback a `Nuevo Laredo` cuando se está en native (`isNativeApp()`) y se rechaza el permiso.

### Acción del usuario para aplicar todos los cambios
1. **Save to GitHub** desde Emergent (botón en el chat).
2. En PowerShell: `git pull`.
3. `cd frontend && yarn build && npx cap sync android`.
4. Android Studio → Build → Clean Project → Rebuild → Build APK(s).
5. En celular: desinstalar versión actual + reiniciar + instalar nuevo APK.
6. **Para backend Railway**: hacer deploy del código actualizado y verificar que la env var `BASE_URL` apunte a la URL pública del backend (sin slash final).

## 2026-06-24 – Auditoría financiera y app móvil base

- `backend/routers/admin.py::generate_settlements_day20` – descuenta `penalty_balance` del payout mensual del negocio.
- Endpoint `GET /api/admin/businesses/{id}/period-overview` para desglose total del periodo.
- `frontend/src/components/AdminSettlementsTab.jsx` – modal "Ver TODO" con detalle financiero.
- Eliminada sección falsa de testimonios en `HomePage.jsx`.
- Capacitor 7 instalado + plataforma Android (`@capacitor/{core,android,browser,splash-screen,status-bar,push-notifications,app,keyboard,network}`).
- Safe-area CSS + helpers nativos en `frontend/src/lib/capacitor.js` (`openExternalBookviaFlow`, `initCapacitor`, `registerPushNotifications`).
- Resolución de conflicto SSL Cloudflare/Vercel (deshabilitar proxy naranja en DNS records).
