/**
 * Runtime eng settings — merge settings/global with local defaults.
 * Observer-only; failures never affect clinical.
 */

import { doc, getDoc } from "firebase/firestore";
import { getEngDb, isEngDbSafe } from "../firebaseEngConfig.js";
import {
  ENG_COLLECTIONS,
  HEARTBEAT_VISIBLE_MS,
  HEARTBEAT_HIDDEN_MS,
  FLUSH_INTERVAL_MS,
  MEMORY_SAMPLE_MS,
  NETWORK_PROBE_MS,
  SLOW_QUERY_MS,
  BUFFER_CAPACITY,
  ENG_AGG_RETENTION_DAYS,
  ENG_ERROR_RETENTION_DAYS,
  ENG_SAMPLE_RETENTION_DAYS,
} from "../constants.js";
import { safeRun, safeCall } from "./safeRun.js";
import { safeStorageSet } from "./safeStorage.js";

const LOCAL_SETTINGS_KEY = "mango.eng.settings.cache";

/** @type {object} */
let cached = {
  heartbeatVisibleMs: HEARTBEAT_VISIBLE_MS,
  heartbeatHiddenMs: HEARTBEAT_HIDDEN_MS,
  flushIntervalMs: FLUSH_INTERVAL_MS,
  memorySampleMs: MEMORY_SAMPLE_MS,
  networkProbeMs: NETWORK_PROBE_MS,
  slowQueryMs: SLOW_QUERY_MS,
  bufferCapacity: BUFFER_CAPACITY,
  retentionDays: ENG_AGG_RETENTION_DAYS,
  sampleRetentionDays: ENG_SAMPLE_RETENTION_DAYS,
  errorRetentionDays: ENG_ERROR_RETENTION_DAYS,
  debugSampling: false,
  trackWrites: false,
  sampleRates: {
    renderEvery: 20,
    snapshotEvery: 10,
  },
  alertThresholds: {
    slowQueryMs: SLOW_QUERY_MS,
    errorCount1h: 10,
    p95LoadMs: 30000,
  },
};

let lastFetchAt = 0;

/**
 * @returns {typeof cached}
 */
export function getRuntimeSettings() {
  return { ...cached, ...safeCall(() => {
    const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  }, {}) };
}

/**
 * Apply partial settings locally (and cache).
 * @param {object} partial
 */
export function applyRuntimeSettings(partial = {}) {
  safeRun(() => {
    cached = { ...cached, ...partial };
    if (partial.alertThresholds) {
      cached.alertThresholds = {
        ...cached.alertThresholds,
        ...partial.alertThresholds,
      };
    }
    if (partial.sampleRates) {
      cached.sampleRates = { ...cached.sampleRates, ...partial.sampleRates };
    }
    safeStorageSet(localStorage, LOCAL_SETTINGS_KEY, JSON.stringify(cached));
  }, "eng.settings.apply");
}

/**
 * Refresh from Engineering Firestore settings/global (best-effort).
 * @param {{ force?: boolean }} [opts]
 */
export async function refreshRuntimeSettings(opts = {}) {
  try {
    const now = Date.now();
    if (!opts.force && now - lastFetchAt < 60_000) return getRuntimeSettings();
    lastFetchAt = now;
    const db = getEngDb();
    if (!db || !isEngDbSafe(db)) return getRuntimeSettings();
    const snap = await getDoc(doc(db, ENG_COLLECTIONS.settings, "global"));
    if (!snap.exists()) return getRuntimeSettings();
    const d = snap.data() || {};
    const next = {};
    if (d.heartbeatSec != null) {
      next.heartbeatVisibleMs = Number(d.heartbeatSec) * 1000;
    }
    if (d.heartbeatHiddenSec != null) {
      next.heartbeatHiddenMs = Number(d.heartbeatHiddenSec) * 1000;
    }
    if (d.flushIntervalSec != null) {
      next.flushIntervalMs = Number(d.flushIntervalSec) * 1000;
    }
    if (d.retentionDays != null) next.retentionDays = Number(d.retentionDays);
    if (d.sampleRetentionDays != null) {
      next.sampleRetentionDays = Number(d.sampleRetentionDays);
    }
    if (d.errorRetentionDays != null) {
      next.errorRetentionDays = Number(d.errorRetentionDays);
    }
    if (d.debugSampling != null) next.debugSampling = !!d.debugSampling;
    if (d.trackWrites != null) next.trackWrites = !!d.trackWrites;
    if (d.alertThresholds) next.alertThresholds = d.alertThresholds;
    if (d.sampleRates) next.sampleRates = d.sampleRates;
    if (d.alertThresholds?.slowQueryMs != null) {
      next.slowQueryMs = Number(d.alertThresholds.slowQueryMs);
    }
    applyRuntimeSettings(next);
  } catch {
    /* ignore */
  }
  return getRuntimeSettings();
}

/**
 * Local feature flag: mango.eng.trackWrites=1 enables write observation helpers.
 * @returns {boolean}
 */
export function isWriteTrackingEnabled() {
  try {
    if (localStorage.getItem("mango.eng.trackWrites") === "1") return true;
  } catch {
    /* ignore */
  }
  return !!getRuntimeSettings().trackWrites;
}
