# 📱 Bookvia Mobile App — Capacitor Setup

Esta guía te lleva paso a paso desde tu código actual hasta tener un APK
de Bookvia funcionando en tu celular Android, y eventualmente publicarlo
en Google Play.

## ⚙️ Qué ya está hecho

- ✅ Capacitor 7.1 instalado en `/app/frontend`
- ✅ Plataforma Android añadida (`/app/frontend/android`)
- ✅ Bundle ID configurado: `app.bookvia.bookvia`
- ✅ App name: `Bookvia`
- ✅ Plugins instalados: SplashScreen, StatusBar, PushNotifications,
  Keyboard, Haptics, Preferences, Network, Browser, Share, App
- ✅ Permisos Android configurados (Internet, Notificaciones, Geolocalización)
- ✅ Safe areas (iPhone notch / Android navbar) en CSS
- ✅ Inicialización Capacitor en `src/lib/capacitor.js` (no-op en web)

---

## 🛠️ Para compilar el APK (lado tuyo)

### Paso 1: Instalar Android Studio
1. Descarga desde https://developer.android.com/studio (gratis)
2. Durante la instalación, **marca** las casillas para instalar:
   - Android SDK
   - Android SDK Platform-Tools
   - Android Virtual Device (emulador)
3. Acepta las licencias del SDK cuando te lo pida
4. Espera a que descargue todo (~3 GB)

### Paso 2: Configurar JDK 21
Capacitor 7 requiere JDK 21. Android Studio lo incluye, pero asegúrate:
1. En Android Studio: **File → Settings → Build Tools → Gradle**
2. **Gradle JDK** → selecciona "Embedded JDK (jbr-21)" o JDK 21 instalado

### Paso 3: Clonar tu repo a la PC
```bash
git clone https://github.com/TU_USUARIO/TU_REPO.git
cd TU_REPO/frontend
yarn install
```

### Paso 4: Generar el APK (modo debug — para pruebas)
```bash
yarn mobile:build           # Compila React + sincroniza Android
cd android
./gradlew assembleDebug     # Construye el APK
```

El APK estará en: `android/app/build/outputs/apk/debug/app-debug.apk`

Lo copias a tu celular Android, das clic e instala (debes habilitar
"Orígenes desconocidos" en Ajustes → Seguridad).

### Paso 5: APK firmado para Google Play (producción)
```bash
# Solo la PRIMERA vez: genera tu keystore
keytool -genkey -v -keystore bookvia-release.keystore \
        -alias bookvia -keyalg RSA -keysize 2048 -validity 10000

# Guarda este .keystore CON TU VIDA y respáldalo. Si lo pierdes,
# NO podrás volver a actualizar tu app en Google Play.
```

Después configura las credenciales en `android/keystore.properties`:
```
storePassword=TU_PASSWORD
keyPassword=TU_PASSWORD
keyAlias=bookvia
storeFile=../../bookvia-release.keystore
```

Y descomenta el bloque `signingConfigs` en `android/app/build.gradle` siguiendo
la guía oficial: https://capacitorjs.com/docs/android/deploying-to-google-play

Luego:
```bash
cd android
./gradlew bundleRelease
```

El **AAB** (Android App Bundle) que Google Play requiere estará en:
`android/app/build/outputs/bundle/release/app-release.aab`

---

## 📤 Publicar en Google Play

1. Suscríbete a **Google Play Console**: $25 USD una sola vez en
   https://play.google.com/console/signup
2. Crea la app con nombre "Bookvia"
3. Sube el AAB generado en el Paso 5
4. Llena los metadatos:
   - Descripción corta (80 caracteres)
   - Descripción larga (4000 caracteres)
   - 2-8 capturas de pantalla del celular
   - Ícono 512x512
   - Banner 1024x500
   - Política de privacidad (URL)
   - Categoría: Salud y bienestar / Estilo de vida
5. Llena el cuestionario de Clasificación de contenido
6. Llena el cuestionario de "Data Safety" (qué datos colectas)
7. Submit for review
8. Google Play aprueba en **1-3 días** (más rápido que Apple)

---

## 🔁 Workflow de desarrollo continuo

Cada vez que cambies código React:

```bash
yarn build                  # Compila React
npx cap sync android        # Copia el nuevo build a Android
cd android && ./gradlew assembleDebug
```

O usa el shortcut:
```bash
yarn mobile:android         # Hace todo + abre Android Studio
```

Para **live reload** en el celular durante desarrollo:
```bash
npx cap run android --livereload --external
```

---

## 🐛 Troubleshooting

### "SDK location not found"
- Asegúrate de tener `ANDROID_HOME` en tus variables de entorno
- En `frontend/android/local.properties`, agrega:
  ```
  sdk.dir=/Users/TU_USUARIO/Library/Android/sdk
  ```

### "JAVA_HOME is not set"
- Instala JDK 21 desde https://www.oracle.com/java/technologies/downloads/
- Setea `JAVA_HOME` apuntando a la instalación

### Gradle muy lento en la primera compilación
- Es normal (~15 min la primera vez). Las siguientes compilaciones son
  rápidas (~2 min).

### El APK abre pero muestra pantalla blanca
- Revisa que el build de React no tenga errores: `yarn build`
- Verifica que `webDir: 'build'` esté en `capacitor.config.ts`
- En adb: `adb logcat | grep -i capacitor` para ver el error

---

## 🍎 Para iOS (cuando tengas DUNS aprobado)

Más adelante. Por ahora, los archivos están listos:

```bash
yarn add @capacitor/ios@7.1.0
npx cap add ios
yarn mobile:ios    # Requiere Mac + Xcode
```

---

## 📞 Soporte

Si algo falla, revisa:
1. Logs de Gradle en Android Studio (panel inferior)
2. `adb logcat` en una terminal mientras pruebas la app
3. Documentación oficial: https://capacitorjs.com/docs/android
