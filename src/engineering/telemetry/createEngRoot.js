/**
 * Create React roots with Engineering error observation (React 19).
 * Does NOT change clinical render tree or error UX — only reports.
 * Dynamically imports EngTelemetry so clinical bundles stay lean.
 */

import ReactDOM from "react-dom/client";

function report(source, error, info) {
  try {
    import("./EngTelemetry.js")
      .then((m) => {
        import("./redaction.js").then((r) => {
          const clean = r.sanitizeErrorPayload({
            source,
            message: error?.message || String(error),
            stack: `${error?.stack || ""}\n${info?.componentStack || ""}`,
            name: error?.name,
          });
          m.EngTelemetry.trackError(clean);
        });
      })
      .catch(() => {});
  } catch {
    /* ignore */
  }
}

/**
 * @param {Element | DocumentFragment} container
 * @param {import('react-dom/client').RootOptions} [extra]
 */
export function createEngRoot(container, extra = {}) {
  return ReactDOM.createRoot(container, {
    ...extra,
    onUncaughtError(error, errorInfo) {
      report("react.uncaught", error, errorInfo);
      if (typeof extra.onUncaughtError === "function") {
        extra.onUncaughtError(error, errorInfo);
      }
    },
    onCaughtError(error, errorInfo) {
      report("react.caught", error, errorInfo);
      if (typeof extra.onCaughtError === "function") {
        extra.onCaughtError(error, errorInfo);
      }
    },
    onRecoverableError(error, errorInfo) {
      report("react.recoverable", error, errorInfo);
      if (typeof extra.onRecoverableError === "function") {
        extra.onRecoverableError(error, errorInfo);
      }
    },
  });
}
