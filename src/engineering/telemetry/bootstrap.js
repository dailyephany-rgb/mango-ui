/**
 * Engineering telemetry bootstrap — imported from clinical firebaseConfig.
 * Failure here must never affect clinical Firebase init.
 */

import { EngTelemetry } from "./EngTelemetry.js";
import { isEngTelemetryEnabled } from "./killSwitch.js";
import { resolvePageIdentity } from "../../performance/firestoreMetrics.js";
import { scheduleFlush, flushViaBeacon } from "./flush.js";
import { spillToSession } from "./buffer.js";
import { safeRun } from "./safeRun.js";
import { ENG_BUILD_ID } from "../constants.js";
import { refreshRuntimeSettings } from "./runtimeSettings.js";

let started = false;

/**
 * Allow kill-switch re-enable to start again in the same page session.
 */
export function resetEngineeringTelemetry() {
  started = false;
}

function detectStrictModeDev() {
  // Heuristic: Vite/React StrictMode double-invokes effects in DEV
  try {
    return !!(import.meta.env && import.meta.env.DEV);
  } catch {
    return false;
  }
}

function installErrorHooks() {
  safeRun(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("error", (ev) => {
      EngTelemetry.trackError({
        source: "window.onerror",
        message: ev?.message || String(ev?.error || "error"),
        stack: ev?.error?.stack || "",
        name: ev?.error?.name,
      });
    });
    window.addEventListener("unhandledrejection", (ev) => {
      const reason = ev?.reason;
      EngTelemetry.trackError({
        source: "unhandledrejection",
        message: reason?.message || String(reason || "rejection"),
        stack: reason?.stack || "",
        name: reason?.name,
      });
    });
  }, "eng.errors");
}

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

function getNavigationTiming() {
  try {
    const entries = performance.getEntriesByType("navigation");
    if (entries && entries[0]) {
      const n = entries[0];
      return {
        domCompleteMs: n.domComplete,
        loadEventEndMs: n.loadEventEnd,
      };
    }
  } catch {
    /* ignore */
  }
  return { domCompleteMs: null, loadEventEndMs: null };
}

/**
 * Capture page-load timings into EngTelemetry (aligned with EDS §6 as far as available).
 */
function capturePageLoad() {
  safeRun(() => {
    const timings = {
      firstPaintMs: null,
      firstRenderMs: null,
      firstSnapshotMs: null,
      interactiveMs: null,
      totalMs: null,
    };
    const nav = getNavigationTiming();

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

    let finalized = false;
    const finish = () => {
      if (finalized) return;
      finalized = true;
      timings.firstSnapshotMs = EngTelemetry.getFirstSnapshotMs();
      const domComplete = nav.domCompleteMs ?? performance.now();
      const snap = timings.firstSnapshotMs;
      const hung = snap == null;
      // When Firestore never answers, don't pretend Interactive happened at DOM complete
      timings.interactiveMs = hung
        ? null
        : Math.max(domComplete, snap);
      timings.hung = hung;
      timings.totalMs = Math.max(
        timings.interactiveMs || 0,
        performance.now(),
        nav.loadEventEndMs || 0
      );
      EngTelemetry.trackPageLoad(timings);
      if (hung) {
        safeRun(() => {
          EngTelemetry.trackListenerTimeout({
            action: "timeout_30",
            event: "first_snapshot_timeout_30",
            collection: "page_load",
            reason: "page_load",
            durationMs: timings.totalMs,
          });
        }, "eng.page.hung");
      }
    };

    window.addEventListener("load", () => setTimeout(finish, 800));
    setTimeout(finish, 15000);

    const poll = setInterval(() => {
      if (EngTelemetry.getFirstSnapshotMs() != null) {
        clearInterval(poll);
        setTimeout(finish, 200);
      }
    }, 100);
    setTimeout(() => clearInterval(poll), 16000);
  }, "eng.pageLoadCapture");
}

export function startEngineeringTelemetry() {
  if (started) return;
  started = true;

  safeRun(() => {
    if (!isEngTelemetryEnabled()) return;

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
      reactStrictDev: detectStrictModeDev(),
    });

    void refreshRuntimeSettings();

    // Friendly workstation names (ipad-1, mac-2…) — cookie + localStorage backed
    void import("./deviceId.js")
      .then((m) => m.ensureFriendlyDeviceLabel())
      .then(() => {
        EngTelemetry.heartbeat();
      })
      .catch(() => {});

    installErrorHooks();
    if (identity.page !== "Engineering" && identity.page !== "Performance") {
      installLongTaskHook();
      capturePageLoad();
    }

    const onLeave = () => {
      safeRun(() => {
        spillToSession();
        flushViaBeacon();
        scheduleFlush({ force: true });
        EngTelemetry.heartbeat();
      }, "eng.leave");
    };
    window.addEventListener("pagehide", onLeave);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onLeave();
    });

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
