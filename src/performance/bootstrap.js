/**
 * Passive performance bootstrap — imported from firebaseConfig.
 * No-ops when mango.perf.monitor === "0".
 */

import {
  isMonitorEnabled,
  getState,
  mutate,
} from "./performanceStore.js";
import {
  setPageContext,
  markPageLoadStart,
  finalizePageLoad,
} from "./performanceCollector.js";
import { resolvePageIdentity } from "./firestoreMetrics.js";
import { startLongTaskObserver } from "./renderMetrics.js";
import { persistTodayHealth } from "./healthScorer.js";

let started = false;

export function startPerformanceMonitoring() {
  if (started) return;
  started = true;

  if (!isMonitorEnabled()) {
    return;
  }

  const identity = resolvePageIdentity();
  setPageContext(identity);

  // Skip heavy observers on the dashboard itself for page-load scoring noise,
  // but still allow store reads.
  const isDashboard = identity.page === "Performance";

  markPageLoadStart(0);

  const nav = getNavigationTiming();
  const timings = {
    navigationStart: nav.navigationStart,
    firstPaintMs: null,
    firstRenderMs: null,
    firstSnapshotMs: null,
    interactiveMs: null,
    totalMs: null,
    snapshotDocCount: null,
  };

  // First render ~ next frames
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      timings.firstRenderMs = performance.now();
    });
  });

  observePaint((ms) => {
    if (timings.firstPaintMs == null) timings.firstPaintMs = ms;
  });

  if (!isDashboard) {
    startLongTaskObserver();
  }

  const complete = () => {
    const meta = getState().pageMeta?.[identity.page] || {};
    if (meta.firstSnapshotMs != null) {
      timings.firstSnapshotMs = meta.firstSnapshotMs;
      timings.snapshotDocCount = meta.firstSnapshotDocs ?? null;
    }
    const domComplete = nav.domCompleteMs ?? performance.now();
    const snap = timings.firstSnapshotMs;
    timings.interactiveMs =
      snap != null ? Math.max(domComplete, snap) : domComplete;
    timings.totalMs = Math.max(
      timings.interactiveMs || 0,
      performance.now(),
      nav.loadEventEndMs || 0
    );
    finalizePageLoad(timings);
    try {
      persistTodayHealth();
    } catch {
      /* ignore */
    }
  };

  // Wait for first snapshot (up to 15s) then finalize; also on window load.
  let finalized = false;
  const finishOnce = () => {
    if (finalized) return;
    finalized = true;
    complete();
  };

  window.addEventListener("load", () => {
    // Give snapshots a short window after load
    setTimeout(finishOnce, 800);
  });
  setTimeout(finishOnce, 15000);

  // Flush daily rollup to Firestore when leaving the page
  let leaveFlushAt = 0;
  const onLeave = () => {
    const now = Date.now();
    if (now - leaveFlushAt < 2500) return;
    leaveFlushAt = now;
    try {
      persistTodayHealth();
    } catch {
      /* ignore */
    }
    import("./perfDailyFirestore.js")
      .then((m) => m.flushPerfDaily({ force: true }))
      .catch(() => {});
  };
  window.addEventListener("pagehide", onLeave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") onLeave();
  });

  // Long sessions: flush about every 5 minutes
  setInterval(() => {
    try {
      persistTodayHealth();
    } catch {
      /* ignore */
    }
  }, 5 * 60 * 1000);
  // Poll briefly for first snapshot meta
  const poll = setInterval(() => {
    const meta = getState().pageMeta?.[identity.page];
    if (meta?.firstSnapshotAt) {
      clearInterval(poll);
      setTimeout(finishOnce, 200);
    }
  }, 100);
  setTimeout(() => clearInterval(poll), 16000);

  // Mark orphaned listeners from prior pages in this tab session (once each)
  mutate((s) => {
    for (const l of s.listeners || []) {
      if (
        l.state === "Active" &&
        l.page &&
        l.page !== identity.page &&
        !l.orphanedHint
      ) {
        l.orphanedHint = true;
      }
    }
  });
}

function getNavigationTiming() {
  try {
    const entries = performance.getEntriesByType("navigation");
    if (entries && entries[0]) {
      const n = entries[0];
      return {
        navigationStart: 0,
        domCompleteMs: n.domComplete,
        loadEventEndMs: n.loadEventEnd,
      };
    }
  } catch {
    /* ignore */
  }
  try {
    const t = performance.timing;
    if (t) {
      return {
        navigationStart: 0,
        domCompleteMs: t.domComplete - t.navigationStart,
        loadEventEndMs: t.loadEventEnd - t.navigationStart,
      };
    }
  } catch {
    /* ignore */
  }
  return { navigationStart: 0, domCompleteMs: null, loadEventEndMs: null };
}

function observePaint(cb) {
  try {
    if (typeof PerformanceObserver === "undefined") return;
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.name === "first-paint" || e.name === "first-contentful-paint") {
          cb(e.startTime);
        }
      }
    });
    obs.observe({ type: "paint", buffered: true });
  } catch {
    /* ignore */
  }
}

// Auto-start when imported
try {
  startPerformanceMonitoring();
} catch (err) {
  console.warn("[perf] bootstrap failed:", err?.message || err);
}
