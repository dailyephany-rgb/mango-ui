/**
 * Device registry + heartbeat → Engineering Firestore (EDS).
 * Overwrites device_status/{deviceId}; never touches clinical Firebase.
 */

import { doc, setDoc, serverTimestamp, increment } from "firebase/firestore";
import { getEngDb } from "../firebaseEngConfig.js";
import {
  ENG_COLLECTIONS,
  ENG_BUILD_ID,
  HEARTBEAT_VISIBLE_MS,
  HEARTBEAT_HIDDEN_MS,
} from "../constants.js";
import { getDeviceId, getDeviceLabel } from "./deviceId.js";
import { isEngTelemetryEnabled } from "./killSwitch.js";
import { safeRun } from "./safeRun.js";
import { hourKey } from "./flush.js";

/** @type {ReturnType<typeof setInterval> | null} */
let timer = null;
/** @type {{ page?: string, department?: string, activeListeners?: number, memoryMB?: number }} */
let ctx = {};

/**
 * @param {typeof ctx} next
 */
export function setHeartbeatContext(next) {
  safeRun(() => {
    ctx = { ...ctx, ...next };
  }, "eng.hb.ctx");
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
    const payload = {
      deviceId,
      label: label || null,
      page: ctx.page || null,
      department: ctx.department || null,
      buildId: ENG_BUILD_ID,
      activeListeners: ctx.activeListeners ?? null,
      memoryMB: ctx.memoryMB ?? null,
      online: typeof navigator !== "undefined" ? navigator.onLine : null,
      visibility:
        typeof document !== "undefined" ? document.visibilityState : null,
      userAgent:
        typeof navigator !== "undefined"
          ? String(navigator.userAgent || "").slice(0, 300)
          : null,
      platform:
        typeof navigator !== "undefined" ? navigator.platform || null : null,
      lastSeenAt: serverTimestamp(),
      clientTs: now,
    };

    void setDoc(doc(db, ENG_COLLECTIONS.deviceStatus, deviceId), payload, {
      merge: true,
    }).catch(() => {});

    void setDoc(
      doc(db, ENG_COLLECTIONS.devices, deviceId),
      {
        deviceId,
        label: label || null,
        lastSeenAt: serverTimestamp(),
        userAgent: payload.userAgent,
        platform: payload.platform,
        updatedAt: serverTimestamp(),
        firstSeenAt: serverTimestamp(),
      },
      { merge: true }
    ).catch(() => {});

    const hk = hourKey(now);
    const hid = `${hk}_${deviceId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    void setDoc(
      doc(db, ENG_COLLECTIONS.heartbeatHourly, hid),
      {
        hour: hk,
        deviceId,
        beats: increment(1),
        lastPage: ctx.page || null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch(() => {});
  }, "eng.heartbeat");
}

function intervalMs() {
  try {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      return HEARTBEAT_HIDDEN_MS;
    }
  } catch {
    /* ignore */
  }
  return HEARTBEAT_VISIBLE_MS;
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
