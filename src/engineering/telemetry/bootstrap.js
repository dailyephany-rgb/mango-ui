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
import { getWaitingListeners } from "./listenerWatch.js";

let started = false;
/** @type {null | (() => void)} */
let finalizePageLoad = null;

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
    /** @type {ReturnType<typeof setInterval> | null} */
    let poll = null;

    const listenerWaitState = () => {
      try {
        const waiting = getWaitingListeners() || [];
        return {
          waitingN: waiting.length,
          timedOut: waiting.some((w) => w.timeout10 || w.timeout30),
        };
      } catch {
        return { waitingN: 0, timedOut: false };
      }
    };

    /**
     * @param {"load"|"timeout15"|"leave"|"snap"} reason
     */
    const finish = (reason = "load") => {
      if (finalized) return;
      const snapNow = EngTelemetry.getFirstSnapshotMs();
      const { waitingN, timedOut } = listenerWaitState();

      // Happy-path early finalize only after snapshot — never mark hung at load+800
      // while Firestore is still outstanding (was the main false-hung source).
      if (reason === "load" && snapNow == null) {
        return;
      }

      finalized = true;
      if (poll) {
        clearInterval(poll);
        poll = null;
      }

      timings.firstSnapshotMs = snapNow;
      const snap = timings.firstSnapshotMs;
      const waitedMs = performance.now();
      let hung = false;
      let incomplete = false;
      if (snap == null) {
        if (timedOut) {
          hung = true;
        } else if (
          waitingN > 0 &&
          (reason === "timeout15" || waitedMs >= 10_000)
        ) {
          // Still waiting after hung threshold → real hung.
          hung = true;
        } else if (reason === "timeout15" && waitingN === 0) {
          // No tracked listener waited — don't fake a Firestore hang.
          hung = false;
          incomplete = false;
        } else {
          // Leave/hide before data — not proven hung.
          incomplete = true;
        }
      }
      const domComplete = nav.domCompleteMs ?? performance.now();
      timings.interactiveMs = hung || incomplete
        ? null
        : Math.max(domComplete, snap || 0);
      timings.hung = hung;
      timings.incomplete = incomplete;
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

    // So pagehide can finalize before Timeline flush (tab switch).
    finalizePageLoad = () => finish("leave");

    window.addEventListener("load", () => setTimeout(() => finish("load"), 800));
    setTimeout(() => finish("timeout15"), 15000);

    poll = setInterval(() => {
      if (EngTelemetry.getFirstSnapshotMs() != null) {
        if (poll) {
          clearInterval(poll);
          poll = null;
        }
        setTimeout(() => finish("snap"), 200);
      }
    }, 100);
    setTimeout(() => {
      if (poll) {
        clearInterval(poll);
        poll = null;
      }
    }, 16000);
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
    } else if (identity.page === "Engineering") {
      // Synthetic page_load so eng_components share a loadId with Timeline.
      // Delay long enough for EngComponent useLayoutEffect timings to land.
      setTimeout(() => {
        safeRun(() => {
          EngTelemetry.trackPageLoad({
            totalMs: Math.round(performance.now()),
            hung: false,
            incomplete: false,
            firstPaintMs: null,
            firstRenderMs: null,
            firstSnapshotMs: null,
            interactiveMs: Math.round(performance.now()),
          });
          EngTelemetry.pushComponentBreakdown();
          scheduleFlush({ force: true });
        }, "eng.comp.engShell");
      }, 2000);
      // Second pass: catch Active Tab / lazy children that mount after first flush.
      setTimeout(() => {
        safeRun(() => {
          EngTelemetry.pushComponentBreakdown();
          scheduleFlush({ force: true });
        }, "eng.comp.engShell.late");
      }, 4500);
    }

    const onLeave = () => {
      safeRun(() => {
        // Finalize page_load before flush — otherwise Timeline only sees
        // Engineering (sync bootstrap) and clinical rows appear after Refresh.
        try {
          finalizePageLoad?.();
        } catch {
          /* ignore */
        }
        EngTelemetry.pushComponentBreakdown();
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
        import("./listenerWatch.js")
          .then((m) => {
            const active = m.getActiveListenerCount?.() ?? 0;
            EngTelemetry.setActiveListeners(active);
            const cost = m.getListenerCostSummary?.();
            if (cost) EngTelemetry.setListenerCost(cost);
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
