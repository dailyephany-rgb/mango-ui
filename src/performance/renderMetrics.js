/**
 * Lightweight render / long-task monitoring only.
 * Do NOT wrap every React render on lab UIs.
 */

import { recordToRing, isMonitorEnabled } from "./performanceStore.js";

let observer = null;

export function startLongTaskObserver() {
  if (!isMonitorEnabled()) return;
  if (typeof PerformanceObserver === "undefined") return;
  if (observer) return;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        recordToRing("longTasks", {
          at: Date.now(),
          durationMs: entry.duration,
          name: entry.name || "longtask",
          startTime: entry.startTime,
        });
        if (entry.duration >= 100) {
          // timeline event for long tasks ≥100ms
          import("./performanceCollector.js").then(({ recordEvent }) => {
            recordEvent({
              kind: "long_task",
              message: `Long task ${Math.round(entry.duration)}ms`,
              durationMs: entry.duration,
            });
          });
        }
      }
    });
    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    observer = null;
  }
}

export function stopLongTaskObserver() {
  try {
    observer?.disconnect();
  } catch {
    /* ignore */
  }
  observer = null;
}

export function getHeapEstimate() {
  try {
    const m = performance.memory;
    if (!m) return null;
    return {
      usedJSHeapSize: m.usedJSHeapSize,
      totalJSHeapSize: m.totalJSHeapSize,
      jsHeapSizeLimit: m.jsHeapSizeLimit,
    };
  } catch {
    return null;
  }
}
