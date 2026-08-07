/**
 * Engineering Telemetry public exports.
 */

export { EngTelemetry } from "./EngTelemetry.js";
export { isEngTelemetryEnabled, setEngTelemetryEnabled } from "./killSwitch.js";
export {
  getDeviceId,
  getDeviceLabel,
  setDeviceLabel,
  ensureFriendlyDeviceLabel,
  assignNextFleetLabel,
  publishDeviceLabel,
  detectDeviceKind,
  DEVICE_LABEL_PRESETS,
  normalizeDeviceLabel,
} from "./deviceId.js";
export { startEngineeringTelemetry } from "./bootstrap.js";
export { scheduleFlush, flushNow, flushViaBeacon } from "./flush.js";
export { resetEngineeringTelemetry } from "./bootstrap.js";
export {
  getEngDb,
  isEngFirebaseConfigured,
  getEngProjectId,
  getEngDatabaseId,
} from "../firebaseEngConfig.js";
export { createEngRoot } from "./createEngRoot.js";
export { observeWrite } from "./writeMetrics.js";
export { runEngRetention, scheduleEngRetention } from "./retention.js";
export {
  getRuntimeSettings,
  applyRuntimeSettings,
  refreshRuntimeSettings,
} from "./runtimeSettings.js";
export { sanitizeErrorPayload, scrubDigits, stackHash } from "./redaction.js";
