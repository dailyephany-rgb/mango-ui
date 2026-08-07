/**
 * Kill switch for Engineering telemetry.
 * `"0"` → disabled (clinical paths must be unaffected).
 * Missing / any other value → enabled when eng Firebase is configured OR local mode.
 */

import { ENG_TELEMETRY_KEY } from "../constants.js";

/**
 * @returns {boolean}
 */
export function isEngTelemetryEnabled() {
  try {
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem(ENG_TELEMETRY_KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * @param {boolean} enabled
 */
export function setEngTelemetryEnabled(enabled) {
  try {
    localStorage.setItem(ENG_TELEMETRY_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}
