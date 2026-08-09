/**
 * Shared Firestore listener recovery helpers (observer + resilience).
 * Does NOT change clinical queries or write paths.
 *
 * - Detect INTERNAL ASSERTION / network-ish failures
 * - Bounded backoff for auto-retry
 * - online → nudge waiting recreates
 * - Broadcast recovery ticks so hooks can remount safely
 */

import { safeRun } from "../../engineering/telemetry/safeRun.js";

/** @typedef {'LOADING'|'READY'|'TIMEOUT'|'ERROR'|'OFFLINE'|'RECOVERING'|'LEFT_EARLY'} ListenerFinalState */

const MAX_AUTO_RETRIES = 3;
const ASSERTION_RETRY_COOLDOWN_MS = 5_000;

/** @type {Set<() => void>} */
const recoverySubscribers = new Set();

let installed = false;
let lastAssertionRetryAt = 0;
let onlineHandlerBound = false;
/** @type {ReturnType<typeof setTimeout> | null} */
let onlineRecoveryTimer = null;
const ONLINE_RECOVERY_DEBOUNCE_MS = 400;

/**
 * Controlled online recovery: recreate waiting listeners only.
 * Do NOT also remount triad via notify — that duplicated subscriptions
 * (retryWaiting + recoverGen remount racing).
 */
function scheduleOnlineRecovery() {
  if (onlineRecoveryTimer) {
    clearTimeout(onlineRecoveryTimer);
    onlineRecoveryTimer = null;
  }
  onlineRecoveryTimer = setTimeout(() => {
    onlineRecoveryTimer = null;
    safeRun(() => {
      import("../../engineering/telemetry/listenerWatch.js").then((m) => {
        m.retryWaitingPageListeners?.();
      });
    }, "eng.net.retry");
  }, ONLINE_RECOVERY_DEBOUNCE_MS);
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isFirestoreInternalAssertion(err) {
  const msg = String(
    err?.message || err?.reason?.message || err || ""
  );
  return (
    /INTERNAL ASSERTION FAILED/i.test(msg) ||
    /FIRESTORE \(.*\) INTERNAL ASSERTION/i.test(msg)
  );
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isLikelyNetworkFirestoreError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  const code = String(err?.code || "").toLowerCase();
  if (isFirestoreInternalAssertion(err)) return true;
  if (code.includes("unavailable") || code.includes("deadline")) return true;
  if (msg.includes("network") || msg.includes("offline") || msg.includes("failed to fetch")) {
    return true;
  }
  if (msg.includes("webchannel") || msg.includes("transport")) return true;
  return false;
}

/**
 * Exponential backoff with jitter. attempt is 1-based.
 * @param {number} attempt
 */
export function recoveryBackoffMs(attempt) {
  const n = Math.max(1, Math.min(MAX_AUTO_RETRIES, attempt));
  const base = 400 * Math.pow(2, n - 1);
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(8_000, base + jitter);
}

export function maxAutoRetries() {
  return MAX_AUTO_RETRIES;
}

/**
 * Subscribe to recovery nudges (online / assertion recovery).
 * Callers should remount listeners via a recover generation counter.
 * @param {() => void} fn
 */
export function subscribeListenerRecovery(fn) {
  recoverySubscribers.add(fn);
  return () => recoverySubscribers.delete(fn);
}

export function notifyListenerRecovery(reason = "recovery") {
  for (const fn of recoverySubscribers) {
    try {
      fn(reason);
    } catch {
      /* ignore */
    }
  }
}

function trackAssertion(err) {
  safeRun(() => {
    import("../../engineering/telemetry/EngTelemetry.js").then((m) => {
      m.EngTelemetry?.trackError?.({
        source: "firestore.internal_assertion",
        name: "FIRESTORE_INTERNAL_ASSERTION",
        message: String(err?.message || err).slice(0, 500),
        stack: String(err?.stack || "").slice(0, 800),
      });
    });
  }, "eng.assertion.track");
}

function attemptAssertionRecovery() {
  const now = Date.now();
  if (now - lastAssertionRetryAt < ASSERTION_RETRY_COOLDOWN_MS) return;
  lastAssertionRetryAt = now;
  // Remount triad hooks once. Do not also retryWaiting here — that raced
  // with recoverGen and could briefly double-subscribe.
  notifyListenerRecovery("assertion");
  safeRun(() => {
    import("../../engineering/telemetry/EngTelemetry.js").then((eng) => {
      eng.EngTelemetry?.trackListenerRetry?.({
        action: "retry",
        event: "assertion_auto_retry",
        reason: "retry",
        collection: "page",
        docCount: 1,
      });
    });
  }, "eng.assertion.retry");
}

/**
 * Install once: window error / unhandledrejection for Firestore assertions,
 * plus online → recovery nudge.
 */
export function installListenerRecoveryHooks() {
  if (typeof window === "undefined" || installed) return;
  installed = true;

  const onAssertion = (err) => {
    if (!isFirestoreInternalAssertion(err)) return;
    trackAssertion(err);
    // Delay slightly so SDK can settle before recreate.
    setTimeout(() => attemptAssertionRecovery(), 800);
  };

  window.addEventListener("error", (ev) => {
    onAssertion(ev?.error || ev?.message);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    onAssertion(ev?.reason);
  });

  if (!onlineHandlerBound) {
    onlineHandlerBound = true;
    window.addEventListener("online", () => {
      safeRun(() => {
        import("../../engineering/telemetry/EngTelemetry.js").then((m) => {
          m.EngTelemetry?.trackNetwork?.({ online: true, reconnect: true });
        });
      }, "eng.net.online");
      // Debounced retry of waiting listeners only — no recoverGen remount.
      scheduleOnlineRecovery();
    });
    window.addEventListener("offline", () => {
      safeRun(() => {
        import("../../engineering/telemetry/EngTelemetry.js").then((m) => {
          m.EngTelemetry?.trackNetwork?.({ online: false });
        });
      }, "eng.net.offline");
      // Do NOT remount listeners while offline (would thrash / duplicate).
    });
  }
}

/**
 * Classify page-load outcome for engineering telemetry.
 * @param {{
 *   snap: number | null,
 *   hung: boolean,
 *   incomplete: boolean,
 *   timedOut: boolean,
 *   waitingN: number,
 *   reason: string,
 *   online?: boolean | null,
 * }} opts
 */
export function classifyPageLoadOutcome(opts) {
  const {
    snap,
    hung,
    incomplete,
    timedOut,
    waitingN,
    reason,
    online = typeof navigator !== "undefined" ? navigator.onLine : null,
  } = opts;

  if (snap != null) {
    return {
      finalState: "READY",
      classification: "READY",
      finalReason: "FIRST_SNAPSHOT",
    };
  }
  if (online === false) {
    return {
      finalState: "OFFLINE",
      classification: incomplete ? "INCOMPLETE" : "OFFLINE",
      finalReason: "OFFLINE",
    };
  }
  if (hung || timedOut || (waitingN > 0 && reason === "timeout15")) {
    return {
      finalState: "TIMEOUT",
      classification: "HUNG",
      finalReason: timedOut ? "LISTENER_TIMEOUT" : "NO_SNAPSHOT_TIMEOUT",
    };
  }
  if (incomplete || reason === "leave") {
    return {
      finalState: "LEFT_EARLY",
      classification: "INCOMPLETE",
      finalReason: "LEFT_EARLY",
    };
  }
  return {
    finalState: "LOADING",
    classification: "INCOMPLETE",
    finalReason: "NO_SNAPSHOT",
  };
}
