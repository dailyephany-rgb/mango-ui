/**
 * Shared Engineering telemetry metadata contract (observer-only).
 * Every eng_* write should include these fields for correlation + filtering.
 */

import { ENG_BUILD_ID } from "../constants.js";

/** Bump when eng document shape changes incompatibly */
export const SCHEMA_VERSION = 2;

/** Bump when SDK event shape / flush semantics change */
export const TELEMETRY_VERSION = "2.1.0";

export const ENG_SESSION_ID_KEY = "mango.eng.sessionId";

/**
 * @param {number} [ts]
 * @returns {{
 *   timestamp: number,
 *   unix: number,
 *   iso: string,
 *   day: string,
 *   dateKey: string,
 *   hour: string,
 *   week: string,
 *   month: string,
 *   year: number,
 *   timezoneOffsetMin: number,
 * }}
 */
export function buildTimeFields(ts = Date.now()) {
  const n = typeof ts === "number" && Number.isFinite(ts) ? ts : Date.now();
  const d = new Date(n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const dateKey = `${y}-${m}-${day}`;
  const hh = String(d.getHours()).padStart(2, "0");
  // Local calendar ISO-like week (Mon-based), aligned with local day/dateKey
  const local = new Date(y, d.getMonth(), d.getDate());
  const dayNum = local.getDay() || 7; // Sun=0 → 7
  local.setDate(local.getDate() + 4 - dayNum);
  const weekYear = local.getFullYear();
  const yearStart = new Date(weekYear, 0, 1);
  const weekNo = Math.ceil(((local - yearStart) / 86400000 + 1) / 7);
  const week = `${weekYear}-W${String(weekNo).padStart(2, "0")}`;
  return {
    timestamp: n,
    unix: Math.floor(n / 1000),
    iso: d.toISOString(),
    day: dateKey,
    dateKey,
    hour: `${dateKey}T${hh}`,
    week,
    month: `${y}-${m}`,
    year: y,
    timezoneOffsetMin: d.getTimezoneOffset(),
  };
}

export function dayKey(ts = Date.now()) {
  return buildTimeFields(ts).day;
}

export function hourKey(ts = Date.now()) {
  return buildTimeFields(ts).hour;
}

export function detectPlatform() {
  try {
    if (typeof navigator === "undefined") return "unknown";
    const ua = navigator.userAgent || "";
    if (/iPad|Tablet/i.test(ua)) return "tablet";
    if (/Mobile|Android|iPhone/i.test(ua)) return "mobile";
    return "desktop";
  } catch {
    return "unknown";
  }
}

export function detectBrowser() {
  try {
    if (typeof navigator === "undefined") return null;
    const ua = navigator.userAgent || "";
    if (/Edg\//.test(ua)) return "edge";
    if (/Chrome\//.test(ua)) return "chrome";
    if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "safari";
    if (/Firefox\//.test(ua)) return "firefox";
    return "other";
  } catch {
    return null;
  }
}

/**
 * Stable per tab session (sessionStorage).
 * @param {string} [deviceId]
 */
export function getOrCreateSessionId(deviceId = "dev") {
  try {
    if (typeof sessionStorage === "undefined") {
      return `s_${deviceId}_${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    }
    let id = sessionStorage.getItem(ENG_SESSION_ID_KEY);
    if (!id) {
      id = `s_${deviceId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.replace(
        /[^a-zA-Z0-9_-]/g,
        "_"
      );
      sessionStorage.setItem(ENG_SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    return `s_${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  }
}

/**
 * Correlation + filter metadata for every eng event / write.
 * @param {{
 *   deviceId?: string,
 *   sessionId?: string,
 *   loadId?: string | null,
 *   pageId?: string,
 *   page?: string,
 *   moduleId?: string | null,
 *   componentId?: string | null,
 *   department?: string | null,
 *   buildId?: string,
 *   appVersion?: string,
 *   platform?: string,
 *   browser?: string | null,
 *   label?: string | null,
 *   user?: string | null,
 *   ts?: number,
 * }} ctx
 */
export function buildEngMeta(ctx = {}) {
  const ts = ctx.ts ?? Date.now();
  const time = buildTimeFields(ts);
  const pageId = ctx.pageId || ctx.page || "unknown";
  return {
    ...time,
    ts, // backwards compatible alias for timestamp
    deviceId: ctx.deviceId || "unknown",
    sessionId: ctx.sessionId || null,
    loadId: ctx.loadId || null,
    pageId,
    page: pageId,
    moduleId: ctx.moduleId || null,
    componentId: ctx.componentId || null,
    department: ctx.department || null,
    buildId: ctx.buildId || ENG_BUILD_ID,
    appVersion: ctx.appVersion || ctx.buildId || ENG_BUILD_ID,
    platform: ctx.platform || detectPlatform(),
    browser: ctx.browser !== undefined ? ctx.browser : detectBrowser(),
    label: ctx.label || null,
    user: ctx.user || null,
    schemaVersion: SCHEMA_VERSION,
    telemetryVersion: TELEMETRY_VERSION,
  };
}

/**
 * Strip undefined so Firestore setDoc stays clean.
 * @param {Record<string, any>} obj
 */
export function compactMeta(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
