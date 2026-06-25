# Bookvia – CHANGELOG

Registro cronológico de cambios significativos (post-refactor base PRD).

## 2026-06-25 – Capacitor Android: assets + UX móvil

### Generación de íconos y splash screen Android
- Instalado `@capacitor/assets` como dev-dependency.
- Generados desde el logo oficial de Bookvia (1024×1024) en `/app/frontend/resources/`:
  - `icon.png`
  - `icon-foreground.png` (logo centrado al 65% para zona segura de adaptive icons)
  - `icon-background.png` (sólido `#F05D5E`)
  - `splash.png` / `splash-dark.png` (2732×2732, logo centrado sobre rojo Bookvia)
- Ejecutado `npx capacitor-assets generate --android` → 136 archivos creados/sobrescritos en:
  - `android/app/src/main/res/mipmap-{ldpi…xxxhdpi}/ic_launcher*.png`
  - `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher{,_round}.xml`
  - `android/app/src/main/res/drawable*/splash.png` (port/land + night variants)

### Bypass SSL temporal del apex domain
- `frontend/src/lib/capacitor.js` → `PUBLIC_WEB_URL` ahora apunta a `https://www.bookvia.app` (en lugar de `https://bookvia.app`) para evitar `ERR_CERT_AUTHORITY_INVALID` mientras Vercel termina de aprovisionar el certificado del apex domain.

### Fix: la app móvil mostraba pantalla vacía cuando el usuario rechazaba permisos de ubicación
- `frontend/src/pages/SearchPage.jsx` → `requestLocation()`:
  - Si `navigator.geolocation` no existe **o** el usuario rechaza el permiso, y la app corre en native (`isNativeApp()`), se aplica `setCity('Nuevo Laredo')` + `setSortBy('relevance')` como fallback y se notifica al usuario con un toast informativo.
  - En web, mantiene el comportamiento previo (toast de error sin cambiar ciudad) para no degradar la UX desktop.
- Importado `isNativeApp` desde `@/lib/capacitor`.

### Acción pendiente del usuario (compilación local)
1. `cd /app/frontend && yarn build`
2. `npx cap sync android`
3. Abrir `android/` en Android Studio y generar APK firmado.

## 2026-06-24 – Auditoría financiera y app móvil base

- `backend/routers/admin.py::generate_settlements_day20` – descuenta `penalty_balance` del payout mensual del negocio.
- Endpoint `GET /api/admin/businesses/{id}/period-overview` para desglose total del periodo.
- `frontend/src/components/AdminSettlementsTab.jsx` – modal "Ver TODO" con detalle financiero.
- Eliminada sección falsa de testimonios en `HomePage.jsx`.
- Capacitor 7 instalado + plataforma Android (`@capacitor/{core,android,browser,splash-screen,status-bar,push-notifications,app,keyboard,network}`).
- Safe-area CSS + helpers nativos en `frontend/src/lib/capacitor.js` (`openExternalBookviaFlow`, `initCapacitor`, `registerPushNotifications`).
- Resolución de conflicto SSL Cloudflare/Vercel (deshabilitar proxy naranja en DNS records).
