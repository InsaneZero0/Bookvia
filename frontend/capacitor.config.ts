import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for Bookvia mobile app.
 *
 *  - Bundle/Application ID: app.bookvia.bookvia
 *  - Web build dir: `build` (Create React App output)
 *  - Server URL: production deploy on Vercel/Railway so the app shows
 *    real data when run on a device. Switch to localhost for local
 *    development (see `npx cap run android --livereload`).
 */
const config: CapacitorConfig = {
  appId: 'app.bookvia.bookvia',
  appName: 'Bookvia',
  webDir: 'build',
  // We bundle the web assets inside the APK so the app works offline-first
  // and loads instantly. The frontend itself calls REACT_APP_BACKEND_URL
  // for API requests against Railway.
  // bundledWebRuntime: false,

  android: {
    // App-level settings
    allowMixedContent: false,
    // Match the splash background so there's no flash between native splash
    // and the WebView mounting.
    backgroundColor: '#000000',
  },

  ios: {
    // iOS-specific safe-area / scheme handling
    contentInset: 'always',
    backgroundColor: '#000000',
  },

  plugins: {
    SplashScreen: {
      // Bookvia: black background with logo centered (matches launch icon)
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#000000',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      // Light text on black header
      style: 'LIGHT',
      backgroundColor: '#000000',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'body',
      style: 'DEFAULT',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
