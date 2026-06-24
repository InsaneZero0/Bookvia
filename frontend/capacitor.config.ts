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
    // Make Android use the system status bar color from styles.xml
    backgroundColor: '#FFFFFF',
  },

  ios: {
    // iOS-specific safe-area / scheme handling
    contentInset: 'always',
    backgroundColor: '#FFFFFF',
  },

  plugins: {
    SplashScreen: {
      // Bookvia red brand color while loading
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#F05D5E',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      androidSpinnerStyle: 'large',
      iosSpinnerStyle: 'large',
      spinnerColor: '#FFFFFF',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      // Light text on Bookvia red header
      style: 'LIGHT',
      backgroundColor: '#F05D5E',
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
