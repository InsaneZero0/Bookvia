# Bookvia – CHANGELOG

Registro cronológico de cambios significativos (post-refactor base PRD).

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
