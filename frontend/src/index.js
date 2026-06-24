import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import "@/index.css";
import App from "@/App";
import { initCapacitor } from "@/lib/capacitor";

// Sentry — frontend error monitoring and performance tracing.
// Initialized before React renders so any error in the tree is captured.
const SENTRY_DSN = process.env.REACT_APP_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.REACT_APP_SENTRY_ENVIRONMENT || "development",
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    tracesSampleRate: 0.1,
    // Never send raw PII (emails, names) by default. Errors still get full
    // stack traces and the URL where they occurred.
    sendDefaultPii: false,
    // Ignore noisy browser errors that we cannot act on (ad blockers,
    // network blips, ResizeObserver loop limit, etc.)
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
      "Network Error",
      "Failed to fetch",
    ],
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));

// Initialize Capacitor (status bar, splash, hardware back button) — no-op on web.
initCapacitor();

root.render(
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <div style={{ padding: 32, fontFamily: "system-ui", maxWidth: 560, margin: "80px auto", textAlign: "center" }}>
          <h1 style={{ color: "#F05D5E" }}>Algo salió mal</h1>
          <p style={{ color: "#555" }}>
            Recibimos el reporte y ya estamos trabajando en arreglarlo. Por favor
            recarga la página o vuelve al inicio.
          </p>
          <pre style={{ fontSize: 12, color: "#999", marginTop: 16, overflow: "auto" }}>
            {String(error)}
          </pre>
          <button
            onClick={resetError}
            style={{ marginTop: 16, padding: "10px 24px", background: "#F05D5E", color: "white", border: 0, borderRadius: 8, cursor: "pointer" }}
          >
            Intentar de nuevo
          </button>
        </div>
      )}
    >
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
);
