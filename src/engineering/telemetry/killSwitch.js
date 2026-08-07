/**
 * Kill switch for Engineering telemetry.
 * `"0"` → disabled (clinical paths must be unaffected).
 * Missing / any other value → enabled.
 *
 * Toggling applies immediately: disable → shutdown; enable → restart bootstrap.
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

  // Best-effort immediate effect — never throws into callers
  try {
    if (!enabled) {
      import("./EngTelemetry.js")
        .then((m) => {
          try {
            m.EngTelemetry.shutdown();
          } catch {
            /* ignore */
          }
        })
        .catch(() => {});
      import("./bootstrap.js")
        .then((m) => {
          try {
            m.resetEngineeringTelemetry?.();
          } catch {
            /* ignore */
          }
        })
        .catch(() => {});
    } else {
      import("./bootstrap.js")
        .then((m) => {
          try {
            m.resetEngineeringTelemetry?.();
            m.startEngineeringTelemetry?.();
          } catch {
            /* ignore */
          }
        })
        .catch(() => {});
    }
  } catch {
    /* ignore */
  }
}
