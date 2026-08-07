/**
 * Optional clinical write observation (EDS §10 — default OFF).
 * Does not wrap save handlers unless mango.eng.trackWrites=1 and callers use observeWrite.
 * Never awaits; never throws into clinical path.
 */

import { EngTelemetry } from "./EngTelemetry.js";
import { isWriteTrackingEnabled } from "./runtimeSettings.js";
import { safeRun } from "./safeRun.js";

/**
 * Record that a clinical write occurred (collection name only).
 * @param {{ collection?: string, kind?: string, docCount?: number }} payload
 */
export function observeWrite(payload = {}) {
  safeRun(() => {
    if (!isWriteTrackingEnabled()) return;
    EngTelemetry.trackQuery({
      collection: payload.collection || "unknown",
      kind: payload.kind || "write",
      durationMs: payload.durationMs ?? 0,
      docCount: payload.docCount ?? 1,
    });
  }, "eng.write");
}
