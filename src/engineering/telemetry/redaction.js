/**
 * PII-safe redaction for Engineering telemetry (EDS §2.5).
 * Never send patient identifiers; scrub digit runs that may be reg/diagnostic numbers.
 */

import { safeCall } from "./safeRun.js";

/**
 * Replace runs of 4+ digits (likely accession/reg numbers) with #.
 * @param {string} text
 * @returns {string}
 */
export function scrubDigits(text) {
  return String(text || "").replace(/\d{4,}/g, "#");
}

/**
 * Stable short hash for stack dedupe (not cryptographic).
 * @param {string} stack
 * @returns {string}
 */
export function stackHash(stack) {
  return safeCall(() => {
    const s = scrubDigits(String(stack || "")).slice(0, 2000);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }, "0");
}

/**
 * @param {{ message?: string, stack?: string, source?: string, name?: string }} payload
 */
export function sanitizeErrorPayload(payload = {}) {
  const message = scrubDigits(String(payload.message || "")).slice(0, 500);
  const stack = scrubDigits(String(payload.stack || "")).slice(0, 2000);
  return {
    source: payload.source || "unknown",
    name: payload.name ? scrubDigits(String(payload.name)).slice(0, 120) : null,
    message,
    stack,
    stackHash: stackHash(`${payload.source || ""}|${message}|${stack}`),
  };
}

/**
 * Sum approximate byte size of localStorage/sessionStorage keys with mango. prefix.
 * @returns {{ localStorageKB: number, sessionStorageKB: number }}
 */
export function measureMangoStorageKB() {
  return safeCall(() => {
    const sum = (store) => {
      if (!store) return 0;
      let bytes = 0;
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (!k || !k.startsWith("mango.")) continue;
        const v = store.getItem(k) || "";
        bytes += k.length + v.length;
      }
      return Math.round((bytes * 2) / 1024); // UTF-16 approx → KB
    };
    return {
      localStorageKB: sum(typeof localStorage !== "undefined" ? localStorage : null),
      sessionStorageKB: sum(
        typeof sessionStorage !== "undefined" ? sessionStorage : null
      ),
    };
  }, { localStorageKB: 0, sessionStorageKB: 0 });
}
