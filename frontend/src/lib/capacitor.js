/**
 * Capacitor initialization & native bridge helpers.
 *
 * This module is loaded once at app startup (see `src/index.js`) and:
 *   - Detects if we are running inside the native shell (Android / iOS)
 *   - Configures status bar + hides splash once React has mounted
 *   - Registers Push Notifications and forwards FCM/APNS tokens to backend
 *   - Wires up hardware back button, network status, and deep links
 *
 * If the app is running in a regular browser, every method is a no-op so the
 * web build keeps behaving exactly as before.
 */
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { PushNotifications } from '@capacitor/push-notifications';

export const isNativeApp = () => Capacitor.isNativePlatform();
export const getPlatform = () => Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

/**
 * Public-facing web URL of Bookvia. Used to redirect from the native app to
 * the website when we DON'T want to process a payment / subscription inside
 * the app (avoids Apple's 30% + Google's 15-30% in-app commission).
 *
 * Reads from REACT_APP_PUBLIC_WEB_URL with a sensible production fallback.
 *
 * We use the `www.` subdomain explicitly because Vercel is currently
 * provisioning the SSL certificate for the apex domain (bookvia.app) and the
 * apex returns ERR_CERT_AUTHORITY_INVALID, breaking external payment flows on
 * the native app. Once Vercel finishes apex SSL provisioning we can switch
 * back to the bare apex if desired.
 */
export const PUBLIC_WEB_URL = (
  process.env.REACT_APP_PUBLIC_WEB_URL || 'https://www.bookvia.app'
).replace(/\/$/, '');

/**
 * Open a URL.
 *   - In the native app -> launches an in-app browser (Capacitor Browser
 *     plugin). The user can close it and come back to Bookvia.
 *   - On the web -> regular window.open / navigation.
 *
 * Use this for any flow that involves payment, subscription, or any action
 * that Apple/Google might consider "digital purchase" — sending users to the
 * website avoids the store commission.
 */
export const openExternalUrl = async (url, { newTab = true } = {}) => {
  if (!url) return;
  if (isNativeApp()) {
    try {
      await Browser.open({
        url,
        presentationStyle: 'popover',
        toolbarColor: '#F05D5E',
      });
      return;
    } catch (e) {
      console.warn('[Capacitor] Browser.open failed, falling back', e);
    }
  }
  if (newTab) {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    window.location.href = url;
  }
};

/**
 * Convenience helper for business onboarding / paid flows.
 * On native -> opens https://bookvia.app/<path> in the in-app browser.
 * On web    -> calls navigate('/<path>') normally (no redirect needed).
 *
 * Example:
 *   handleBusinessRegister(navigate);
 *   handlePaidFlow(navigate, '/business/upgrade');
 */
export const openExternalBookviaFlow = async (navigate, path) => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (isNativeApp()) {
    await openExternalUrl(`${PUBLIC_WEB_URL}${cleanPath}`);
  } else if (typeof navigate === 'function') {
    navigate(cleanPath);
  } else {
    window.location.href = cleanPath;
  }
};

/**
 * Called once during app boot. Safe to call on web - it short-circuits.
 */
export const initCapacitor = async () => {
  if (!isNativeApp()) return;

  // Tag body so CSS can apply safe-area padding only on native
  try {
    document.body.classList.add('capacitor-native');
    document.body.classList.add(`capacitor-${getPlatform()}`);
  } catch (e) { /* ignore */ }

  try {
    // 1) Status bar — Bookvia red with light icons
    await StatusBar.setStyle({ style: Style.Light });
    if (getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#F05D5E' });
    }
  } catch (e) {
    console.warn('[Capacitor] StatusBar setup failed', e);
  }

  // 2) Hide splash after a short delay so React has mounted
  setTimeout(async () => {
    try {
      await SplashScreen.hide();
    } catch (e) {
      // ignore
    }
  }, 600);

  // 3) Hardware back button (Android) — when user is at root, exit app
  try {
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });
  } catch (e) {
    // ignore
  }
};

/**
 * Request push notification permission, register with FCM/APNS and send the
 * resulting token to our backend so we can target this device for events
 * (booking confirmations, payouts, business cancellations, etc.).
 *
 * Returns the token string on success, or null on web / denial / error.
 */
export const registerPushNotifications = async (postTokenFn) => {
  if (!isNativeApp()) return null;

  try {
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'prompt') {
      permission = await PushNotifications.requestPermissions();
    }
    if (permission.receive !== 'granted') {
      console.warn('[Capacitor] Push permission denied');
      return null;
    }

    return new Promise((resolve) => {
      let resolved = false;

      PushNotifications.addListener('registration', async (token) => {
        if (resolved) return;
        resolved = true;
        try {
          if (postTokenFn) {
            await postTokenFn({
              token: token.value,
              platform: getPlatform(),
            });
          }
        } catch (e) {
          console.warn('[Capacitor] Failed to send token to backend', e);
        }
        resolve(token.value);
      });

      PushNotifications.addListener('registrationError', (err) => {
        if (resolved) return;
        resolved = true;
        console.error('[Capacitor] Push registration error', err);
        resolve(null);
      });

      PushNotifications.register();
    });
  } catch (e) {
    console.error('[Capacitor] registerPushNotifications failed', e);
    return null;
  }
};

/**
 * Add a listener for incoming push notification taps. The callback receives
 * the parsed `data` payload so the app can navigate to the right screen
 * (e.g. open the booking detail when the user taps a reminder).
 */
export const onPushNotificationTap = (callback) => {
  if (!isNativeApp()) return () => {};
  const sub = PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (notif) => {
      try {
        callback(notif.notification?.data || {});
      } catch (e) {
        console.warn('[Capacitor] push tap handler failed', e);
      }
    },
  );
  return () => sub.then((s) => s.remove());
};
