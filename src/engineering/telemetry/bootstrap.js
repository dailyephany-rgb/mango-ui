/**
 * Engineering telemetry bootstrap — imported from clinical firebaseConfig.
 * Failure here must never affect clinical Firebase init.
 */

import { EngTelemetry } from "./EngTelemetry.js";
import { isEngTelemetryEnabled } from "./killSwitch.js";
import { resolvePageIdentity } from "../../performance/firestoreMetrics.js";
import { scheduleFlush } from "./flush.js";
import { spillToSession } from "./buffer.js";
import { safeRun } from "./safeRun.js";
import { ENG_BUILD_ID } from "../constants.js";

let started = false;

/**
 * Install window error hooks (once).
 */
function installErrorHooks() {
  safeRun(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("error", (ev) => {
      EngTelemetry.trackError({
        source: "window.onerror",
        message: ev?.message || String(ev?.error || "error"),
        stack: ev?.error?.stack || "",
      });
    });
    window.addEventListener("unhandledrejection", (ev) => {
      const reason = ev?.reason;
      EngTelemetry.trackError({
        source: "unhandledrejection",
        message: reason?.message || String(reason || "rejection"),
        stack: reason?.stack || "",
      });
    });
  }, "eng.errors");
}

/**
 * Forward long tasks from PerformanceObserver when available.
 */
function installLongTaskHook() {
  safeRun(() => {
    if (typeof PerformanceObserver === "undefined") return;
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        EngTelemetry.trackLongTask({
          durationMs: e.duration,
          name: e.name,
        });
      }
    });
    obs.observe({ type: "longtask", buffered: true });
  }, "eng.longtask");
}

/**
 * Capture page-load timings into EngTelemetry (parallel to clinical perf layer).
 */
function capturePageLoad() {
  safeRun(() => {
    const identity = resolvePageIdentity();
    const timings = {
      firstPaintMs: null,
      firstRenderMs: null,
      interactiveMs: null,
      totalMs: null,
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        timings.firstRenderMs = performance.now();
      });
    });

    try {
      if (typeof PerformanceObserver !== "undefined") {
        const obs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (
              e.name === "first-paint" ||
              e.name === "first-contentful-paint"
            ) {
              if (timings.firstPaintMs == null) timings.firstPaintMs = e.startTime;
            }
          }
        });
        obs.observe({ type: "paint", buffered: true });
      }
    } catch {
      /* ignore */
    }

    const finish = () => {
      timings.totalMs = performance.now();
      timings.interactiveMs = timings.totalMs;
      EngTelemetry.trackPageLoad(timings);
    };

    window.addEventListener("load", () => setTimeout(finish, 800));
    setTimeout(finish, 15000);
  }, "eng.pageLoadCapture");
}

export function startEngineeringTelemetry() {
  if (started) return;
  started = true;

  safeRun(() => {
    if (!isEngTelemetryEnabled()) return;

    // Skip heavy eng flush noise on Engineering Dashboard itself for page scoring —
    // still init for device presence when viewing eng UI.
    const identity = resolvePageIdentity();
    let user = null;
    try {
      user = sessionStorage.getItem("loggedUser") || null;
    } catch {
      /* ignore */
    }

    EngTelemetry.init({
      page: identity.page,
      department: identity.department,
      buildId: ENG_BUILD_ID,
      user,
    });

    installErrorHooks();
    if (identity.page !== "Engineering" && identity.page !== "Performance") {
      installLongTaskHook();
      capturePageLoad();
    }

    const onLeave = () => {
      safeRun(() => {
        spillToSession();
        scheduleFlush({ force: true });
        EngTelemetry.heartbeat();
      }, "eng.leave");
    };
    window.addEventListener("pagehide", onLeave);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onLeave();
    });

    // Sync open listener count from clinical perf store when available (metadata only)
    const syncListeners = () => {
      safeRun(() => {
        import("../../performance/performanceStore.js")
          .then((m) => {
            const list = m.getState?.()?.listeners || [];
            const active = list.filter((l) => l.state === "Active").length;
            EngTelemetry.setActiveListeners(active);
          })
          .catch(() => {});
      }, "eng.syncListeners");
    };
    syncListeners();
    setInterval(syncListeners, 15_000);
  }, "eng.bootstrap");
}

try {
  startEngineeringTelemetry();
} catch (err) {
  try {
    console.debug("[eng] bootstrap failed:", err?.message || err);
  } catch {
    /* ignore */
  }
}
