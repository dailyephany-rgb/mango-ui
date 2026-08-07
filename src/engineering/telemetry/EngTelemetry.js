/**
 * EngTelemetry SDK — observer-only (EDS §2).
 * All methods: void, sync return, never throw to caller.
 */

import {
  ENG_BUILD_ID,
  FLUSH_INTERVAL_MS,
  MEMORY_SAMPLE_MS,
  NETWORK_PROBE_MS,
} from "../constants.js";
import { isEngTelemetryEnabled } from "./killSwitch.js";
import { safeRun } from "./safeRun.js";
import { pushEvent, spillToSession, bufferSize } from "./buffer.js";
import { scheduleFlush, flushNow } from "./flush.js";
import {
  startHeartbeat,
  stopHeartbeat,
  setHeartbeatContext,
  sendHeartbeat,
} from "./heartbeat.js";
import { getDeviceId } from "./deviceId.js";

/** @type {{ deviceId: string, buildId: string, page: string, department: string, user: string | null }} */
let context = {
  deviceId: "",
  buildId: ENG_BUILD_ID,
  page: "unknown",
  department: "Unknown",
  user: null,
};

let initialized = false;
let flushTimer = null;
let memoryTimer = null;
let networkTimer = null;
let renderSampleCounter = 0;

function base() {
  return {
    ts: Date.now(),
    deviceId: context.deviceId || getDeviceId(),
    buildId: context.buildId,
    page: context.page,
    department: context.department,
    user: context.user,
  };
}

function enabled() {
  return isEngTelemetryEnabled();
}

/**
 * @param {object} [opts]
 */
function init(opts = {}) {
  safeRun(() => {
    if (initialized) {
      setContext(opts);
      return;
    }
    if (!enabled()) return;
    initialized = true;
    context = {
      deviceId: opts.deviceId || getDeviceId(),
      buildId: opts.buildId || ENG_BUILD_ID,
      page: opts.page || "unknown",
      department: opts.department || "Unknown",
      user: opts.user ?? null,
    };
    setHeartbeatContext({
      page: context.page,
      department: context.department,
    });
    startHeartbeat();
    armFlush();
    armMemory();
    armNetwork();
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

/**
 * @param {object} partial
 */
function setContext(partial = {}) {
  safeRun(() => {
    context = { ...context, ...partial };
    if (partial.page || partial.department) {
      setHeartbeatContext({
        page: context.page,
        department: context.department,
      });
    }
  }, "eng.setContext");
}

/**
 * @param {object} timings
 */
function trackPageLoad(timings = {}) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    pushEvent({
      ...base(),
      domain: "pages",
      ...timings,
    });
  }, "eng.pageLoad");
}

/**
 * @param {object} payload
 */
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
    });
  }, "eng.query");
}

/**
 * @param {object} payload
 */
function trackListener(payload = {}) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    pushEvent({
      ...base(),
      domain: "listeners",
      action: payload.action || "snapshot",
      collection: payload.collection || "unknown",
      listenerId: payload.listenerId || null,
      docCount: payload.docCount ?? null,
      durationMs: payload.durationMs ?? null,
      error: payload.error ? String(payload.error).slice(0, 200) : null,
    });
  }, "eng.listener");
}

function trackListenerUpsert(payload) {
  trackListener({ ...payload, action: payload?.action || "open" });
}

function trackListenerClose(payload) {
  trackListener({ ...payload, action: "close" });
}

function trackListenerSnapshot(payload) {
  trackListener({ ...payload, action: "snapshot" });
}

/**
 * @param {object} payload
 */
function trackRender(payload = {}) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    // Sample ~5%
    renderSampleCounter += 1;
    if (renderSampleCounter % 20 !== 0 && payload.kind !== "longtask") return;
    pushEvent({
      ...base(),
      domain: "react",
      kind: payload.kind || "render",
      durationMs: payload.durationMs ?? null,
      name: payload.name || null,
    });
  }, "eng.render");
}

/**
 * @param {object} payload
 */
function trackLongTask(payload = {}) {
  trackRender({ ...payload, kind: "longtask" });
}

/**
 * @param {object} payload
 */
function trackMemorySample(payload = {}) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    pushEvent({
      ...base(),
      domain: "memory",
      ...payload,
    });
    const mb =
      payload.usedJSHeapSize != null
        ? Math.round(payload.usedJSHeapSize / (1024 * 1024))
        : null;
    if (mb != null) setHeartbeatContext({ memoryMB: mb });
  }, "eng.memory");
}

/**
 * @param {object} payload
 */
function trackError(payload = {}) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    pushEvent({
      ...base(),
      domain: "errors",
      source: payload.source || "unknown",
      message: String(payload.message || "").slice(0, 500),
      stack: String(payload.stack || "").slice(0, 2000),
    });
  }, "eng.error");
}

/**
 * @param {object} payload
 */
function trackNetwork(payload = {}) {
  safeRun(() => {
    if (!enabled() || !initialized) return;
    pushEvent({
      ...base(),
      domain: "network",
      online: payload.online ?? null,
      latencyMs: payload.latencyMs ?? null,
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
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = setInterval(() => scheduleFlush(), FLUSH_INTERVAL_MS);
}

function armMemory() {
  if (memoryTimer) clearInterval(memoryTimer);
  const sample = () => {
    safeRun(() => {
      const mem = performance?.memory;
      if (!mem) return;
      trackMemorySample({
        usedJSHeapSize: mem.usedJSHeapSize,
        totalJSHeapSize: mem.totalJSHeapSize,
        jsHeapSizeLimit: mem.jsHeapSizeLimit,
      });
    }, "eng.mem.tick");
  };
  sample();
  memoryTimer = setInterval(sample, MEMORY_SAMPLE_MS);
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
      // Probe Engineering origin only — never clinical APIs for RTT
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
  networkTimer = setInterval(probe, NETWORK_PROBE_MS);
}

/**
 * Update active listener count for heartbeat payload (from perf store if available).
 * @param {number} n
 */
function setActiveListeners(n) {
  safeRun(() => {
    setHeartbeatContext({ activeListeners: n });
  }, "eng.listeners.count");
}

export const EngTelemetry = {
  init,
  setContext,
  trackPageLoad,
  trackQuery,
  trackListenerUpsert,
  trackListenerClose,
  trackListenerSnapshot,
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
  /** @returns {boolean} */
  isInitialized: () => initialized,
  /** @returns {number} */
  pendingCount: () => bufferSize(),
  /** Force awaitable flush for tests — still swallows errors */
  flushNow: () => flushNow({ force: true }).catch(() => {}),
};

export default EngTelemetry;
