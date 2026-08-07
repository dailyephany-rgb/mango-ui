/**
 * EngTelemetry SDK — observer-only (EDS §2).
 * All methods: void, sync return, never throw to caller.
 */

import { ENG_BUILD_ID } from "../constants.js";
import { isEngTelemetryEnabled } from "./killSwitch.js";
import { safeRun } from "./safeRun.js";
import { pushEvent, spillToSession, bufferSize } from "./buffer.js";
import { scheduleFlush, flushNow } from "./flush.js";
import {
  startHeartbeat,
  stopHeartbeat,
  setHeartbeatContext,
  sendHeartbeat,
  rearmHeartbeat,
} from "./heartbeat.js";
import { getDeviceId } from "./deviceId.js";
import { sanitizeErrorPayload, measureMangoStorageKB } from "./redaction.js";
import {
  getRuntimeSettings,
  refreshRuntimeSettings,
} from "./runtimeSettings.js";

/** @type {{ deviceId: string, buildId: string, page: string, department: string, user: string | null, reactStrictDev: boolean, lastFirstSnapshotMs: number | null, lastPageLoadMs: number | null }} */
let context = {
  deviceId: "",
  buildId: ENG_BUILD_ID,
  page: "unknown",
  department: "Unknown",
  user: null,
  reactStrictDev: false,
  lastFirstSnapshotMs: null,
  lastPageLoadMs: null,
};

let initialized = false;
let flushTimer = null;
let memoryTimer = null;
let networkTimer = null;
let renderSampleCounter = 0;
let wasOffline = false;
let prevHeap = null;
let prevHeapAt = null;

function base() {
  return {
    ts: Date.now(),
    deviceId: context.deviceId || getDeviceId(),
    buildId: context.buildId,
    page: context.page,
    department: context.department,
    user: context.user,
    reactStrictDev: context.reactStrictDev || undefined,
  };
}

function enabled() {
  return isEngTelemetryEnabled();
}

function init(opts = {}) {
  safeRun(() => {
    if (initialized) {
      setContext(opts);
      return;
    }
    if (!enabled()) return;
    initialized = true;
    context = {
      ...context,
      deviceId: opts.deviceId || getDeviceId(),
      buildId: opts.buildId || ENG_BUILD_ID,
      page: opts.page || "unknown",
      department: opts.department || "Unknown",
      user: opts.user ?? null,
      reactStrictDev: !!opts.reactStrictDev,
    };
    setHeartbeatContext({
      page: context.page,
      department: context.department,
      user: context.user,
    });
    startHeartbeat();
    armFlush();
    armMemory();
    armNetwork();
    void refreshRuntimeSettings().then(() => {
      rearmFlush();
      rearmHeartbeat();
      armMemory();
      armNetwork();
    });
    pushEvent({
      ...base(),
      domain: "builds",
      buildId: context.buildId,
      userAgent:
        typeof navigator !== "undefined"
          ? String(navigator.userAgent || "").slice(0, 300)
          : null,
    });
  }, "eng.init");
}

function setContext(partial = {}) {
  safeRun(() => {
    const pageChanged =
      (partial.page && partial.page !== context.page) ||
      (partial.department && partial.department !== context.department);
    context = { ...context, ...partial };
    if (partial.page || partial.department || partial.user !== undefined) {
      setHeartbeatContext({
        page: context.page,
        department: context.department,
        user: context.user,
      });
    }
    if (pageChanged && initialized && enabled()) {
      sendHeartbeat();
    }
  }, "eng.setContext");
}

/**
 * Record first tracked snapshot timing for page-load finalize.
 * @param {number} arrivalMs
 */
function noteFirstSnapshot(arrivalMs) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    if (context.lastFirstSnapshotMs == null && typeof arrivalMs === "number") {
      context.lastFirstSnapshotMs = arrivalMs;
      setHeartbeatContext({ lastFirstSnapshotMs: arrivalMs });
    }
  }, "eng.noteSnap");
}

function getFirstSnapshotMs() {
  return context.lastFirstSnapshotMs;
}

function trackPageLoad(timings = {}) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    const merged = {
      ...timings,
      firstSnapshotMs:
        timings.firstSnapshotMs ?? context.lastFirstSnapshotMs ?? null,
    };
    if (merged.totalMs != null) {
      context.lastPageLoadMs = merged.totalMs;
      setHeartbeatContext({ lastPageLoadMs: merged.totalMs });
    }
    pushEvent({
      ...base(),
      domain: "pages",
      ...merged,
    });
  }, "eng.pageLoad");
}

function trackQuery(payload = {}) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    pushEvent({
      ...base(),
      domain: "firestore",
      collection: payload.collection || "unknown",
      kind: payload.kind || "query",
      durationMs: payload.durationMs ?? null,
      docCount: payload.docCount ?? 0,
      queryKey: payload.queryKey || null,
      failure: payload.failure || false,
      reconnect: payload.reconnect || false,
    });
  }, "eng.query");
}

function trackListener(payload = {}) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    pushEvent({
      ...base(),
      domain: "listeners",
      action: payload.action || "snapshot",
      event: payload.event || payload.action || null,
      collection: payload.collection || "unknown",
      listenerId: payload.listenerId || null,
      docCount: payload.docCount ?? null,
      durationMs: payload.durationMs ?? null,
      payloadBytes: payload.payloadBytes ?? null,
      reason: payload.reason || null,
      recreated: payload.recreated || false,
      error: payload.error ? String(payload.error).slice(0, 200) : null,
    });
  }, "eng.listener");
}

function trackListenerUpsert(payload) {
  trackListener({
    ...payload,
    action: payload?.action || "open",
    event: payload?.event || "listener_start",
  });
}

function trackListenerClose(payload) {
  trackListener({ ...payload, action: "close", event: "listener_close" });
}

function trackListenerSnapshot(payload) {
  trackListener({
    ...payload,
    action: "snapshot",
    event: payload?.event || "first_snapshot_received",
  });
}

function trackListenerReconnect(payload) {
  trackListener({
    ...payload,
    action: "reconnect",
    event: "listener_reconnect",
    reason: payload?.reason || "reconnect",
  });
}

function trackListenerRecreated(payload) {
  trackListener({
    ...payload,
    action: "recreated",
    event: "listener_recreated",
  });
}

function trackListenerTimeout(payload) {
  trackListener({
    ...payload,
    action: payload?.action || "timeout",
    event: payload?.event || "first_snapshot_timeout",
  });
}

function trackListenerRetry(payload) {
  trackListener({
    ...payload,
    action: payload?.action || "retry",
    event: payload?.event || "retry_clicked",
  });
}

function trackRender(payload = {}) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    const every = getRuntimeSettings().sampleRates?.renderEvery ?? 20;
    renderSampleCounter += 1;
    if (renderSampleCounter % every !== 0 && payload.kind !== "longtask") return;
    pushEvent({
      ...base(),
      domain: "react",
      kind: payload.kind || "render",
      durationMs: payload.durationMs ?? null,
      name: payload.name || null,
    });
  }, "eng.render");
}

function trackLongTask(payload = {}) {
  trackRender({ ...payload, kind: "longtask" });
}

function trackMemorySample(payload = {}) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    const storage = measureMangoStorageKB();
    let sqcCacheEntries = 0;
    try {
      if (typeof sessionStorage !== "undefined") {
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith("mango.sqc.v1:")) sqcCacheEntries += 1;
        }
      }
    } catch {
      /* ignore */
    }
    const used = payload.usedJSHeapSize;
    let growth = null;
    if (prevHeap != null && used != null && prevHeapAt != null) {
      const hours = (Date.now() - prevHeapAt) / 3_600_000;
      if (hours > 0) {
        growth = (used - prevHeap) / (1024 * 1024) / hours;
      }
    }
    if (used != null) {
      prevHeap = used;
      prevHeapAt = Date.now();
    }
    pushEvent({
      ...base(),
      domain: "memory",
      ...payload,
      ...storage,
      heapGrowthMBPerHour: growth,
      engBufferSize: bufferSize(),
      listenerCount: payload.listenerCount ?? null,
      sqcCacheEntries,
    });
    const mb =
      used != null ? Math.round(used / (1024 * 1024)) : null;
    if (mb != null) setHeartbeatContext({ memoryMB: mb });
  }, "eng.memory");
}

function trackError(payload = {}) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    const clean = sanitizeErrorPayload(payload);
    pushEvent({
      ...base(),
      domain: "errors",
      ...clean,
    });
    // Prefer faster flush for errors
    scheduleFlush({ force: true });
  }, "eng.error");
}

function trackNetwork(payload = {}) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    const online = payload.online;
    let reconnect = !!payload.reconnect;
    if (online === false) wasOffline = true;
    if (online === true && wasOffline) {
      reconnect = true;
      wasOffline = false;
    }
    if (payload.latencyMs != null) {
      setHeartbeatContext({ networkRttMs: payload.latencyMs });
    }
    pushEvent({
      ...base(),
      domain: "network",
      online: online ?? null,
      latencyMs: payload.latencyMs ?? null,
      reconnect,
      flushRetry: payload.flushRetry || false,
    });
  }, "eng.network");
}

function heartbeat() {
  safeRun(() => sendHeartbeat(), "eng.hb.api");
}

function flush() {
  safeRun(() => scheduleFlush({ force: true }), "eng.flush.api");
}

function shutdown() {
  safeRun(() => {
    spillToSession();
    scheduleFlush({ force: true });
    stopHeartbeat();
    if (flushTimer) clearInterval(flushTimer);
    if (memoryTimer) clearInterval(memoryTimer);
    if (networkTimer) clearInterval(networkTimer);
    flushTimer = memoryTimer = networkTimer = null;
    initialized = false;
  }, "eng.shutdown");
}

function armFlush() {
  rearmFlush();
}

function rearmFlush() {
  if (flushTimer) clearInterval(flushTimer);
  const ms = getRuntimeSettings().flushIntervalMs || 60_000;
  flushTimer = setInterval(() => scheduleFlush(), ms);
}

function armMemory() {
  if (memoryTimer) clearInterval(memoryTimer);
  const sample = () => {
    safeRun(() => {
      const mem = performance?.memory;
      if (!mem) {
        trackMemorySample({
          usedJSHeapSize: null,
          totalJSHeapSize: null,
          jsHeapSizeLimit: null,
        });
        return;
      }
      trackMemorySample({
        usedJSHeapSize: mem.usedJSHeapSize,
        totalJSHeapSize: mem.totalJSHeapSize,
        jsHeapSizeLimit: mem.jsHeapSizeLimit,
      });
    }, "eng.mem.tick");
  };
  sample();
  memoryTimer = setInterval(
    sample,
    getRuntimeSettings().memorySampleMs || 30_000
  );
}

function armNetwork() {
  if (networkTimer) clearInterval(networkTimer);
  const onOnline = () => trackNetwork({ online: true });
  const onOffline = () => trackNetwork({ online: false });
  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
  }
  const probe = () => {
    safeRun(() => {
      const t0 = performance.now();
      const url =
        (typeof import.meta !== "undefined" &&
          import.meta.env?.VITE_ENG_PROBE_URL) ||
        null;
      if (!url) {
        trackNetwork({
          online: typeof navigator !== "undefined" ? navigator.onLine : null,
          latencyMs: null,
        });
        return;
      }
      fetch(url, { method: "HEAD", mode: "no-cors", cache: "no-store" })
        .then(() => {
          trackNetwork({
            online: true,
            latencyMs: Math.round(performance.now() - t0),
          });
        })
        .catch(() => {
          trackNetwork({
            online: typeof navigator !== "undefined" ? navigator.onLine : false,
            latencyMs: null,
          });
        });
    }, "eng.net.probe");
  };
  networkTimer = setInterval(
    probe,
    getRuntimeSettings().networkProbeMs || 60_000
  );
}

function setActiveListeners(n) {
  safeRun(() => {
    setHeartbeatContext({ activeListeners: n });
  }, "eng.listeners.count");
}

/**
 * Observer-only wait-state for heartbeat / fleet Health.
 * @param {{ waitingListeners?: number, hungLoads?: number, loadingPages?: string[], retries?: number }} partial
 */
function setListenerWaitState(partial = {}) {
  safeRun(() => {
    setHeartbeatContext({
      waitingListeners: partial.waitingListeners ?? null,
      hungLoads: partial.hungLoads ?? null,
      loadingPages: partial.loadingPages ?? null,
      retryCount: partial.retries ?? null,
    });
  }, "eng.listeners.wait");
}

export const EngTelemetry = {
  init,
  setContext,
  noteFirstSnapshot,
  getFirstSnapshotMs,
  trackPageLoad,
  trackQuery,
  trackListenerUpsert,
  trackListenerClose,
  trackListenerSnapshot,
  trackListenerReconnect,
  trackListenerRecreated,
  trackListenerTimeout,
  trackListenerRetry,
  trackListener,
  trackRender,
  trackLongTask,
  trackMemorySample,
  trackError,
  trackNetwork,
  heartbeat,
  flush,
  shutdown,
  setActiveListeners,
  setListenerWaitState,
  isInitialized: () => initialized,
  pendingCount: () => bufferSize(),
  flushNow: () => flushNow({ force: true }).catch(() => {}),
};

export default EngTelemetry;
