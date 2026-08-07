/**
 * Device registry + heartbeat → Engineering Firestore (EDS).
 * Overwrites device_status/{deviceId}; never touches clinical Firebase.
 */

import { doc, setDoc, serverTimestamp, increment } from "firebase/firestore";
import { getEngDb } from "../firebaseEngConfig.js";
import {
  ENG_COLLECTIONS,
  ENG_BUILD_ID,
  DEVICE_ONLINE_MS,
  DEVICE_STALE_MS,
} from "../constants.js";
import { getDeviceId, getDeviceLabel } from "./deviceId.js";
import { isEngTelemetryEnabled } from "./killSwitch.js";
import { safeRun } from "./safeRun.js";
import { hourKey, dayKey } from "./flush.js";
import { getRuntimeSettings } from "./runtimeSettings.js";
import {
  buildTimeFields,
  SCHEMA_VERSION,
  TELEMETRY_VERSION,
  detectPlatform,
  detectBrowser,
} from "./metadata.js";
/** @type {ReturnType<typeof setInterval> | null} */
let timer = null;
/** @type {{ page?: string, department?: string, activeListeners?: number, waitingListeners?: number, hungLoads?: number, loadingPages?: string[] | null, retryCount?: number | null, memoryMB?: number, user?: string | null, lastPageLoadMs?: number | null, lastFirstSnapshotMs?: number | null, networkRttMs?: number | null, sessionId?: string | null, loadId?: string | null, buildId?: string | null, platform?: string | null }} */
let ctx = {};

/**
 * @param {typeof ctx} next
 */
export function setHeartbeatContext(next) {
  safeRun(() => {
    ctx = { ...ctx, ...next };
  }, "eng.hb.ctx");
}

function loadLevel(listeners, memoryMB) {
  const n = listeners ?? 0;
  const m = memoryMB ?? 0;
  if (n >= 40 || m >= 1024) return "critical";
  if (n >= 20 || m >= 512) return "elevated";
  if (n >= 5 || m >= 200) return "normal";
  return "idle";
}

/**
 * Immediate heartbeat (best-effort, fire-and-forget).
 */
export function sendHeartbeat() {
  safeRun(() => {
    if (!isEngTelemetryEnabled()) return;
    const db = getEngDb();
    if (!db) return;

    const deviceId = getDeviceId();
    const label = getDeviceLabel();
    const now = Date.now();
    const settings = getRuntimeSettings();
    const time = buildTimeFields(now);
    const payload = {
      deviceId,
      label: label || null,
      page: ctx.page || null,
      pageId: ctx.page || null,
      department: ctx.department || null,
      buildId: ctx.buildId || ENG_BUILD_ID,
      appVersion: ctx.buildId || ENG_BUILD_ID,
      version: ENG_BUILD_ID,
      sessionId: ctx.sessionId || null,
      loadId: ctx.loadId || null,
      user: ctx.user || null,
      activeListeners: ctx.activeListeners ?? null,
      listenerCount: ctx.activeListeners ?? null,
      waitingListeners: ctx.waitingListeners ?? null,
      hungLoads: ctx.hungLoads ?? null,
      loadingPages: Array.isArray(ctx.loadingPages)
        ? ctx.loadingPages.slice(0, 8)
        : null,
      retryCount: ctx.retryCount ?? null,
      memoryMB: ctx.memoryMB ?? null,
      heapUsedMB: ctx.memoryMB ?? null,
      lastPageLoadMs: ctx.lastPageLoadMs ?? null,
      lastFirstSnapshotMs: ctx.lastFirstSnapshotMs ?? null,
      networkRttMs: ctx.networkRttMs ?? null,
      online: typeof navigator !== "undefined" ? navigator.onLine : null,
      visibility:
        typeof document !== "undefined" ? document.visibilityState : null,
      status: "online",
      staleAfterMs: DEVICE_ONLINE_MS,
      offlineAfterMs: DEVICE_STALE_MS,
      loadLevel: loadLevel(ctx.activeListeners, ctx.memoryMB),
      userAgent:
        typeof navigator !== "undefined"
          ? String(navigator.userAgent || "").slice(0, 300)
          : null,
      platform: ctx.platform || detectPlatform(),
      browser: detectBrowser(),
      ...time,
      schemaVersion: SCHEMA_VERSION,
      telemetryVersion: TELEMETRY_VERSION,
      lastSeenAt: serverTimestamp(),
      lastHeartbeatAt: serverTimestamp(),
      clientTs: now,
    };

    void setDoc(doc(db, ENG_COLLECTIONS.deviceStatus, deviceId), payload, {
      merge: true,
    }).catch(() => {});

    const deviceDoc = {
      deviceId,
      label: label || null,
      lastSeenAt: serverTimestamp(),
      userAgent: payload.userAgent,
      platform: payload.platform,
      browser: payload.browser,
      buildId: payload.buildId,
      schemaVersion: SCHEMA_VERSION,
      telemetryVersion: TELEMETRY_VERSION,
      updatedAt: serverTimestamp(),
    };
    try {
      const regKey = "mango.eng.deviceRegistered";
      if (localStorage.getItem(regKey) !== deviceId) {
        deviceDoc.firstSeenAt = serverTimestamp();
        deviceDoc.createdAt = serverTimestamp();
        localStorage.setItem(regKey, deviceId);
      }
    } catch {
      /* ignore */
    }
    void setDoc(doc(db, ENG_COLLECTIONS.devices, deviceId), deviceDoc, {
      merge: true,
    }).catch(() => {});

    const hk = hourKey(now);
    const hid = `${hk}_${deviceId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    void setDoc(
      doc(db, ENG_COLLECTIONS.heartbeatHourly, hid),
      {
        hour: hk,
        day: time.day,
        dateKey: time.day,
        deviceId,
        department: ctx.department || null,
        buildId: ctx.buildId || ENG_BUILD_ID,
        platform: ctx.platform || detectPlatform(),
        page: ctx.page || null,
        pageId: ctx.page || null,
        label: label || null,
        schemaVersion: SCHEMA_VERSION,
        telemetryVersion: TELEMETRY_VERSION,
        beats: increment(1),
        lastPage: ctx.page || null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch(() => {});

    // Optional minute-grain history when debugSampling=true (EDS)
    if (settings.debugSampling) {
      const d = new Date(now);
      const minuteId = `${deviceId}_${dayKey(now)}${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`.replace(
        /[^a-zA-Z0-9_-]/g,
        "_"
      );
      void setDoc(doc(db, ENG_COLLECTIONS.heartbeats, minuteId), {
        ...payload,
        lastSeenAt: undefined,
        lastHeartbeatAt: undefined,
        ts: now,
      }).catch(() => {});
    }
  }, "eng.heartbeat");
}

function intervalMs() {
  const settings = getRuntimeSettings();
  try {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      return settings.heartbeatHiddenMs || 120_000;
    }
  } catch {
    /* ignore */
  }
  return settings.heartbeatVisibleMs || 30_000;
}

function armTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => sendHeartbeat(), intervalMs());
}

/** Start periodic heartbeats. Idempotent. */
export function startHeartbeat() {
  safeRun(() => {
    if (!isEngTelemetryEnabled()) return;
    sendHeartbeat();
    armTimer();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        sendHeartbeat();
        armTimer();
      });
    }
  }, "eng.hb.start");
}

export function stopHeartbeat() {
  safeRun(() => {
    if (timer) clearInterval(timer);
    timer = null;
  }, "eng.hb.stop");
}

/** Re-arm intervals after settings change. */
export function rearmHeartbeat() {
  safeRun(() => {
    if (timer) armTimer();
  }, "eng.hb.rearm");
}
