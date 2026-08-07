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

/** Tab session id (also in metadata.js) */
export const ENG_SESSION_ID_KEY = "mango.eng.sessionId";

/** Schema / telemetry versions (mirrored in metadata.js) */
export const ENG_SCHEMA_VERSION = 2;
export const ENG_TELEMETRY_VERSION = "2.1.0";

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

/**
 * Retention defaults (days). Dashboard "All Time" is capped to these windows
 * so filters never promise data the store no longer keeps.
 */
export const ENG_AGG_RETENTION_DAYS = 90;
/** Flight-recorder samples: page_loads, components, fs_component_loads, hourly */
export const ENG_SAMPLE_RETENTION_DAYS = 30;
export const ENG_ERROR_RETENTION_DAYS = 60;

/** Engineering Firestore collection names (eng_* prefix — safe on shared clinical project) */
export const ENG_COLLECTIONS = {
  devices: "eng_devices",
  deviceStatus: "eng_device_status",
  heartbeatHourly: "eng_heartbeat_hourly",
  departments: "eng_departments",
  firestoreMetrics: "eng_firestore_metrics",
  pages: "eng_pages",
  network: "eng_network",
  memory: "eng_memory",
  reactDaily: "eng_react_metrics",
  errors: "eng_errors",
  audit: "eng_audit",
  health: "eng_health",
  settings: "eng_settings",
  builds: "eng_builds",
  alerts: "eng_alerts",
  listenerDaily: "eng_listener_daily",
  heartbeats: "eng_heartbeats",
  /** Individual page-load samples (flight recorder) — written in same flush as aggregates */
  pageLoads: "eng_page_loads",
  /** One doc per page load — component breakdown for that loadId */
  components: "eng_components",
  /** Daily aggregates: module × collection × kind (Firestore-by-Component) */
  firestoreByComponent: "eng_firestore_by_component",
  /** Per page-load Firestore breakdown (same loadId as eng_page_loads / eng_components) */
  fsComponentLoads: "eng_fs_component_loads",
  /** Daily department aggregates (period KPIs; lifetime docs remain in departments) */
  departmentsDaily: "eng_departments_daily",
};
