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
import { getDeviceId, getDeviceLabel } from "./deviceId.js";
import { sanitizeErrorPayload, measureMangoStorageKB } from "./redaction.js";
import {
  getRuntimeSettings,
  refreshRuntimeSettings,
} from "./runtimeSettings.js";
import {
  startComponentSession,
  getComponentLoadId,
  markComponentMount,
  markComponentRender,
  markComponentUnmount,
  markComponentFirstSnapshot,
  markComponentPhase,
  buildComponentBreakdown,
  resetComponentSession,
  getFsAttribution,
} from "./componentTimeline.js";
import {
  buildEngMeta,
  getOrCreateSessionId,
  detectPlatform,
  detectBrowser,
  SCHEMA_VERSION,
  TELEMETRY_VERSION,
} from "./metadata.js";

/** @type {{ deviceId: string, buildId: string, page: string, department: string, user: string | null, reactStrictDev: boolean, lastFirstSnapshotMs: number | null, lastPageLoadMs: number | null, loadId: string | null, sessionId: string | null, platform: string, browser: string | null }} */
let context = {
  deviceId: "",
  buildId: ENG_BUILD_ID,
  page: "unknown",
  department: "Unknown",
  user: null,
  reactStrictDev: false,
  lastFirstSnapshotMs: null,
  lastPageLoadMs: null,
  loadId: null,
  sessionId: null,
  platform: "unknown",
  browser: null,
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
  const label = getDeviceLabel() || undefined;
  let attr = { moduleId: null, componentId: null, pageId: context.page };
  try {
    attr = getFsAttribution() || attr;
  } catch {
    /* ignore */
  }
  return buildEngMeta({
    ts: Date.now(),
    deviceId: context.deviceId || getDeviceId(),
    sessionId: context.sessionId,
    loadId: context.loadId || getComponentLoadId() || null,
    pageId: attr.pageId || context.page,
    page: context.page,
    moduleId: attr.moduleId || null,
    componentId: attr.componentId || null,
    department: context.department,
    buildId: context.buildId,
    appVersion: context.buildId,
    platform: context.platform,
    browser: context.browser,
    label: label || null,
    user: context.user,
  });
}

function ensureLoadId() {
  if (context.loadId) return context.loadId;
  const deviceId = context.deviceId || getDeviceId();
  const id = `${deviceId}_${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  context.loadId = id;
  setHeartbeatContext({ loadId: id });
  return id;
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
    const deviceId = opts.deviceId || getDeviceId();
    const sessionId = getOrCreateSessionId(deviceId);
    context = {
      ...context,
      deviceId,
      buildId: opts.buildId || ENG_BUILD_ID,
      page: opts.page || "unknown",
      department: opts.department || "Unknown",
      user: opts.user ?? null,
      reactStrictDev: !!opts.reactStrictDev,
      loadId: null,
      sessionId,
      platform: detectPlatform(),
      browser: detectBrowser(),
      lastFirstSnapshotMs: null,
      lastPageLoadMs: null,
    };
    const lid = ensureLoadId();
    startComponentSession({
      loadId: lid,
      page: context.page,
      startedAt: performance.now(),
    });
    setHeartbeatContext({
      page: context.page,
      department: context.department,
      user: context.user,
      sessionId,
      loadId: lid,
      buildId: context.buildId,
      platform: context.platform,
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
      schemaVersion: SCHEMA_VERSION,
      telemetryVersion: TELEMETRY_VERSION,
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
      markComponentFirstSnapshot(arrivalMs);
    }
  }, "eng.noteSnap");
}

function getFirstSnapshotMs() {
  return context.lastFirstSnapshotMs;
}

function trackPageLoad(timings = {}) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    const lid = ensureLoadId();
    const merged = {
      ...timings,
      firstSnapshotMs:
        timings.firstSnapshotMs ?? context.lastFirstSnapshotMs ?? null,
      loadId: lid,
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
    // One eng_components doc per page load (same loadId)
    pushComponentBreakdown({
      totalMs: merged.totalMs ?? null,
      hung: !!merged.hung,
    });
    // Push samples promptly so Engineering Timeline sees new rows without
    // waiting for the 60s interval / Engineering Refresh.
    scheduleFlush({ force: true });
  }, "eng.pageLoad");
}

/**
 * Emit / refresh component breakdown for current loadId.
 * Safe to call again when a lazy tab mounts after page-load finalize.
 */
function pushComponentBreakdown(extra = {}) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    const lid = ensureLoadId();
    const components = buildComponentBreakdown();
    pushEvent({
      ...base(),
      domain: "components",
      loadId: lid,
      ts: Date.now(),
      totalMs: extra.totalMs ?? context.lastPageLoadMs ?? null,
      hung: extra.hung || false,
      components,
    });
  }, "eng.components.push");
}

function componentMount(spec) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    markComponentMount(spec);
    // Lazy tabs after page load — refresh eng_components for same loadId
    if (context.lastPageLoadMs != null) {
      pushComponentBreakdown();
      scheduleFlush({ force: true });
    }
  }, "eng.comp.mount");
}

function componentRender(name, actualDuration, phase) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    markComponentRender(name, actualDuration, phase);
  }, "eng.comp.render");
}

function componentUnmount(name) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    markComponentUnmount(name);
  }, "eng.comp.unmount");
}

function componentPhase(name, phase, ms) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    markComponentPhase(name, phase, ms);
  }, "eng.comp.phase");
}

function trackQuery(payload = {}) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    const attr = getFsAttribution();
    const durationMs = payload.durationMs ?? null;
    const slowMs = getRuntimeSettings().slowQueryMs ?? 2000;
    const slow =
      payload.slow === true ||
      (durationMs != null && durationMs >= slowMs);
    pushEvent({
      ...base(),
      domain: "firestore",
      loadId: attr.loadId || context.loadId || undefined,
      pageId: attr.pageId || context.page,
      moduleId: payload.moduleId || attr.moduleId || context.page || "unknown",
      componentId: payload.componentId || attr.componentId || null,
      collection: payload.collection || "unknown",
      kind: payload.kind || "query",
      operation: payload.operation || payload.kind || "query",
      durationMs,
      docCount: payload.docCount ?? 0,
      snapshotCount: payload.snapshotCount ?? null,
      queryKey: payload.queryKey || null,
      constraints: payload.constraints || null,
      failure: payload.failure || false,
      reconnect: payload.reconnect || false,
      firstSnapshot: !!payload.firstSnapshot,
      subsequentSnapshot: !!payload.subsequentSnapshot,
      error: payload.error ? String(payload.error).slice(0, 200) : null,
      slow,
    });
  }, "eng.query");
}

function trackListener(payload = {}) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    const attr = getFsAttribution();
    const durationMs = payload.durationMs ?? null;
    const slowMs = getRuntimeSettings().slowQueryMs ?? 2000;
    const slow =
      payload.slow === true ||
      (durationMs != null && durationMs >= slowMs);
    pushEvent({
      ...base(),
      domain: "listeners",
      loadId: attr.loadId || context.loadId || undefined,
      pageId: attr.pageId || context.page,
      moduleId: payload.moduleId || attr.moduleId || context.page || "unknown",
      componentId: payload.componentId || attr.componentId || null,
      action: payload.action || "snapshot",
      event: payload.event || payload.action || null,
      collection: payload.collection || "unknown",
      operation: payload.operation || payload.action || "snapshot",
      listenerId: payload.listenerId || null,
      docCount: payload.docCount ?? null,
      changeCount: payload.changeCount ?? null,
      durationMs,
      payloadBytes: payload.payloadBytes ?? null,
      mergeMs: payload.mergeMs ?? null,
      avgIntervalMs: payload.avgIntervalMs ?? null,
      updatesPerMin: payload.updatesPerMin ?? null,
      reason: payload.reason || null,
      recreated: payload.recreated || false,
      queryKey: payload.queryKey || null,
      constraints: payload.constraints || null,
      firstSnapshot: !!payload.firstSnapshot,
      subsequentSnapshot: !!payload.subsequentSnapshot,
      error: payload.error ? String(payload.error).slice(0, 200) : null,
      slow,
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
    resetComponentSession();
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
 * Observer-only listener cost rollup for device heartbeat / fleet Health.
 * @param {{ activeCount?: number, docSum?: number, payloadBytesSum?: number, updateCount?: number, avgIntervalMs?: number|null, updatesPerMin?: number|null, avgMergeMs?: number|null }} cost
 */
function setListenerCost(cost = {}) {
  safeRun(() => {
    setHeartbeatContext({
      listenerDocSum: cost.docSum ?? null,
      listenerPayloadBytesSum: cost.payloadBytesSum ?? null,
      listenerUpdateCount: cost.updateCount ?? null,
      listenerAvgIntervalMs: cost.avgIntervalMs ?? null,
      listenerUpdatesPerMin: cost.updatesPerMin ?? null,
      listenerAvgMergeMs: cost.avgMergeMs ?? null,
    });
  }, "eng.listeners.cost");
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
  setListenerCost,
  setListenerWaitState,
  componentMount,
  componentRender,
  componentUnmount,
  componentPhase,
  pushComponentBreakdown,
  getLoadId: () => context.loadId || getComponentLoadId(),
  isInitialized: () => initialized,
  pendingCount: () => bufferSize(),
  flushNow: () => flushNow({ force: true }).catch(() => {}),
};

export default EngTelemetry;
