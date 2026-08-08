/**
 * Stable workstation identity (EDS deviceId) + friendly labels (ipad-1, mac-2…).
 *
 * Dual-persist localStorage + cookie so Safari/Wi‑Fi profile churn is less likely
 * to mint a new anonymous UUID every time.
 *
 * IMPORTANT: fleet sequential names (mac-1, mac-2…) are ONLY claimed when the user
 * clicks Auto-assign. Silent page-load must never burn counter slots (that caused
 * mac-2 / mac-3 ghosts while Settings showed a different name).
 */

import { ENG_DEVICE_ID_KEY, ENG_DEVICE_LABEL_KEY } from "../constants.js";
import { safeCall } from "./safeRun.js";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function uuid() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readCookie(name) {
  try {
    if (typeof document === "undefined") return "";
    const m = document.cookie.match(
      new RegExp(`(?:^|; )${name.replace(/\./g, "\\.")}=([^;]*)`)
    );
    return m ? decodeURIComponent(m[1]) : "";
  } catch {
    return "";
  }
}

function writeCookie(name, value) {
  try {
    if (typeof document === "undefined") return;
    const v = encodeURIComponent(String(value || ""));
    document.cookie = `${name}=${v}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

function persistPair(storageKey, cookieName, value) {
  const v = String(value || "");
  try {
    localStorage.setItem(storageKey, v);
  } catch {
    /* ignore */
  }
  writeCookie(cookieName, v);
}

function readPair(storageKey, cookieName) {
  let fromLs = "";
  try {
    fromLs = localStorage.getItem(storageKey) || "";
  } catch {
    fromLs = "";
  }
  if (fromLs) {
    writeCookie(cookieName, fromLs);
    return fromLs;
  }
  const fromCk = readCookie(cookieName);
  if (fromCk) {
    try {
      localStorage.setItem(storageKey, fromCk);
    } catch {
      /* ignore */
    }
    return fromCk;
  }
  return "";
}

/**
 * @returns {'ipad'|'mac'|'iphone'|'android'|'windows'|'desktop'}
 */
export function detectDeviceKind() {
  try {
    const ua = String(navigator.userAgent || "").toLowerCase();
    const platform = String(navigator.platform || "").toLowerCase();
    const maxTouch = navigator.maxTouchPoints || 0;
    // iPadOS 13+ may report as Mac with touch
    if (/ipad/.test(ua) || (platform === "macintel" && maxTouch > 1)) {
      return "ipad";
    }
    if (/iphone|ipod/.test(ua)) return "iphone";
    if (/android/.test(ua)) return "android";
    if (/mac/.test(ua) || platform.startsWith("mac")) return "mac";
    if (/win/.test(ua) || platform.startsWith("win")) return "windows";
  } catch {
    /* ignore */
  }
  return "desktop";
}

/**
 * @param {string} label
 * @returns {boolean}
 */
export function looksLikeRawDeviceId(label) {
  const s = String(label || "").trim();
  if (!s) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)) return true;
  if (/^dev-\d+-/.test(s)) return true;
  if (/^[0-9a-f]{8}…$/i.test(s)) return true;
  return false;
}

/**
 * Normalize user/auto labels: "iPad 1" → "ipad-1"
 * @param {string} label
 * @returns {string}
 */
export function normalizeDeviceLabel(label) {
  let s = String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!s) return "";
  // ipad1 → ipad-1
  s = s.replace(/^(ipad|mac|iphone|android|windows|desktop)(\d+)$/, "$1-$2");
  return s.slice(0, 40);
}

/**
 * Stable local fallback that does NOT touch the fleet counter.
 * Same deviceId always yields the same placeholder until the user picks a name.
 * @param {string} [deviceId]
 * @returns {string}
 */
export function stableLocalLabel(deviceId) {
  const prefix = detectDeviceKind();
  const id = String(deviceId || getDeviceId()).replace(/[^a-z0-9]/gi, "");
  const short = id.slice(0, 4) || "1";
  return `${prefix}-local-${short}`;
}

/**
 * @returns {string}
 */
export function getDeviceId() {
  return safeCall(() => {
    let id = readPair(ENG_DEVICE_ID_KEY, ENG_DEVICE_ID_KEY);
    if (!id) {
      id = uuid();
      persistPair(ENG_DEVICE_ID_KEY, ENG_DEVICE_ID_KEY, id);
    }
    return id;
  }, "unknown-device");
}

/**
 * @returns {string}
 */
export function getDeviceLabel() {
  return safeCall(() => {
    const raw = readPair(ENG_DEVICE_LABEL_KEY, ENG_DEVICE_LABEL_KEY);
    return normalizeDeviceLabel(raw) || raw || "";
  }, "");
}

/**
 * Persist label locally and push to eng device docs (best-effort).
 * @param {string} label
 */
export function setDeviceLabel(label) {
  safeCall(() => {
    const normalized =
      normalizeDeviceLabel(label) || String(label || "").trim();
    persistPair(ENG_DEVICE_LABEL_KEY, ENG_DEVICE_LABEL_KEY, normalized);
    void publishDeviceLabel(normalized);
  }, undefined);
}

/**
 * Write label onto eng_device_status + eng_devices for THIS deviceId immediately.
 * @param {string} label
 */
export async function publishDeviceLabel(label) {
  try {
    const { getEngDb, isEngDbSafe } = await import("../firebaseEngConfig.js");
    const { ENG_COLLECTIONS } = await import("../constants.js");
    const { doc, setDoc, serverTimestamp } = await import("firebase/firestore");
    const db = getEngDb();
    if (!db || !isEngDbSafe(db)) return;
    const deviceId = getDeviceId();
    const normalized =
      normalizeDeviceLabel(label) || String(label || "").trim() || null;
    const payload = {
      deviceId,
      label: normalized,
      updatedAt: serverTimestamp(),
      clientTs: Date.now(),
    };
    await Promise.all([
      setDoc(doc(db, ENG_COLLECTIONS.deviceStatus, deviceId), payload, {
        merge: true,
      }),
      setDoc(doc(db, ENG_COLLECTIONS.devices, deviceId), payload, {
        merge: true,
      }),
    ]);
  } catch {
    /* ignore — eng optional */
  }
}

/** Preset chips for Settings (physical workstations). */
export const DEVICE_LABEL_PRESETS = [
  "ipad-1",
  "ipad-2",
  "ipad-3",
  "ipad-4",
  "mac-1",
  "mac-2",
  "mac-3",
  "desktop-1",
];

/**
 * Ensure a label exists for this browser.
 * Does NOT claim fleet counters (mac-1, mac-2…) — that only happens via
 * assignNextFleetLabel() when the user clicks Auto-assign.
 * @returns {Promise<string>}
 */
export async function ensureFriendlyDeviceLabel() {
  try {
    const existing = getDeviceLabel();
    if (existing && !looksLikeRawDeviceId(existing)) {
      persistPair(ENG_DEVICE_LABEL_KEY, ENG_DEVICE_LABEL_KEY, existing);
      return existing;
    }
    const local = stableLocalLabel();
    persistPair(ENG_DEVICE_LABEL_KEY, ENG_DEVICE_LABEL_KEY, local);
    void publishDeviceLabel(local);
    return local;
  } catch {
    return getDeviceLabel();
  }
}

/**
 * Explicit user action: claim next fleet name (ipad-1, mac-2, …).
 * @returns {Promise<string>}
 */
export async function assignNextFleetLabel() {
  const prefix = detectDeviceKind();
  let next = null;
  try {
    const { claimNextDeviceLabel } = await import("./claimDeviceLabel.js");
    next = await claimNextDeviceLabel(prefix);
  } catch {
    next = null;
  }
  if (!next) next = stableLocalLabel();
  setDeviceLabel(next);
  return next;
}
