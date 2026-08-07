/**
 * Engineering platform constants (EDS).
 * Clinical Firebase must never use these collection names for business data.
 */

/** localStorage kill switch — `"0"` disables all eng telemetry */
export const ENG_TELEMETRY_KEY = "mango.eng.telemetry";

/** Persisted workstation UUID */
export const ENG_DEVICE_ID_KEY = "mango.eng.deviceId";

/** Optional human label for this workstation */
export const ENG_DEVICE_LABEL_KEY = "mango.eng.deviceLabel";

/** Session spill for undelivered events */
export const ENG_BUFFER_KEY = "mango.eng.buffer.v1";

export const ENG_BUILD_ID =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    (import.meta.env.VITE_ENG_BUILD_ID || import.meta.env.VITE_APP_VERSION)) ||
  "dev";

/** Heartbeat while tab visible (ms) */
export const HEARTBEAT_VISIBLE_MS = 30_000;

/** Heartbeat while tab hidden (ms) */
export const HEARTBEAT_HIDDEN_MS = 120_000;

/** Metric flush interval (ms) */
export const FLUSH_INTERVAL_MS = 60_000;

/** Memory sample interval (ms) */
export const MEMORY_SAMPLE_MS = 30_000;

/** Network probe interval (ms) */
export const NETWORK_PROBE_MS = 60_000;

/** In-memory ring capacity */
export const BUFFER_CAPACITY = 500;

/** Slow query threshold (ms) */
export const SLOW_QUERY_MS = 2000;

/** Device online / stale thresholds (ms) */
export const DEVICE_ONLINE_MS = 90_000;
export const DEVICE_STALE_MS = 300_000;

/** Engineering Firestore collection names (separate project) */
export const ENG_COLLECTIONS = {
  devices: "devices",
  deviceStatus: "device_status",
  heartbeatHourly: "heartbeat_hourly",
  departments: "departments",
  firestoreMetrics: "firestore_metrics",
  pages: "pages",
  network: "network",
  memory: "memory",
  reactDaily: "react_metrics",
  errors: "errors",
  audit: "audit",
  health: "health",
  settings: "settings",
  builds: "builds",
  alerts: "alerts",
  listenerDaily: "listener_daily",
};
