/**
 * Mount clinical MPA roots. StrictMode only in DEV (avoids double
 * listener arming / double effects in production). Behaviour unchanged.
 *
 * Also mounts observer-only FirstSnapshotWatchdog (N6) when eng telemetry is on.
 */

import React from "react";
import { createEngRoot } from "../engineering/telemetry/createEngRoot.js";
import { startDailyOriginReset } from "./storage/dailyOriginReset.js";
import AuthGate from "../auth/AuthGate.jsx";

let watchdogRoot = null;

function ensureWatchdog() {
  try {
    if (typeof document === "undefined") return;
    let host = document.getElementById("mango-eng-watchdog");
    if (!host) {
      host = document.createElement("div");
      host.id = "mango-eng-watchdog";
      document.body.appendChild(host);
    }
    if (watchdogRoot) return;
    watchdogRoot = createEngRoot(host);
    import("../engineering/ui/FirstSnapshotWatchdog.jsx")
      .then((m) => {
        const Comp = m.default;
        watchdogRoot.render(<Comp />);
      })
      .catch(() => {});
  } catch {
    /* ignore */
  }
}

/**
 * @param {Element | DocumentFragment | null} container
 * @param {React.ReactElement} element
 * @param {{ requireAuth?: boolean }} [options]
 */
export function mountEngApp(container, element, options = {}) {
  const path = typeof window !== "undefined" ? window.location.pathname || "" : "";
  const isLoginPage = path.includes("login");
  const requireAuth = options.requireAuth !== false && !isLoginPage;

  const tree = requireAuth ? <AuthGate>{element}</AuthGate> : element;

  const root = createEngRoot(container);
  root.render(
    import.meta.env.DEV ? <React.StrictMode>{tree}</React.StrictMode> : tree
  );
  ensureWatchdog();
  startDailyOriginReset();
  return root;
}
