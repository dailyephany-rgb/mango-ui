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
import {
  getWaitingListeners,
  retryWaitingPageListeners,
} from "../../engineering/telemetry/listenerWatch.js";

/** @typedef {'IDLE'|'CONNECTING'|'READY'|'TIMEOUT'|'ERROR'|'OFFLINE'|'RECOVERING'|'CLOSED'|'LEFT_EARLY'} ListenerFinalState */

/** Clinical UI hung-status threshold (page stays mounted). */
export const CLINICAL_FIRST_SNAPSHOT_HUNG_MS = 10_000;
/** Remount triad after this long in the background (iPad lock / Chrome suspend). */
export const WAKE_HIDDEN_MS = 60_000;

const MAX_AUTO_RETRIES = 3;
const ASSERTION_RETRY_COOLDOWN_MS = 5_000;
const MAX_ASSERTION_RECOVERIES = 3;
const ASSERTION_WINDOW_MS = 60_000;

/** @type {number[]} */
let assertionRecoveryAt = [];

/** @type {Set<() => void>} */
const recoverySubscribers = new Set();

let installed = false;
let lastAssertionRetryAt = 0;
let onlineHandlerBound = false;
/** @type {ReturnType<typeof setTimeout> | null} */
let onlineRecoveryTimer = null;
const ONLINE_RECOVERY_DEBOUNCE_MS = 400;
/** @type {ReturnType<typeof setTimeout> | null} */
let becomeVisibleTimer = null;
const BECOME_VISIBLE_COALESCE_MS = 100;
/** @type {number | null} */
let hiddenAt = null;
let forceWakeOnVisible = false;
let recoveryBusyUntil = 0;
const RECOVERY_LOCK_MS = 800;

/**
 * Controlled online recovery: recreate waiting listeners only.
 * Do NOT also remount triad via notify — that duplicated subscriptions
 * (retryWaiting + recoverGen remount racing).
 */
function scheduleBecomeVisible() {
  if (becomeVisibleTimer) {
    clearTimeout(becomeVisibleTimer);
    becomeVisibleTimer = null;
  }
  becomeVisibleTimer = setTimeout(() => {
    becomeVisibleTimer = null;
    const force = forceWakeOnVisible;
    forceWakeOnVisible = false;
    const hiddenMs = hiddenAt != null ? Date.now() - hiddenAt : 0;
    hiddenAt = null;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return;
    }
    if (force || hiddenMs >= WAKE_HIDDEN_MS) {
      safeRun(() => {
        import("../../engineering/telemetry/EngTelemetry.js").then((m) => {
          m.EngTelemetry?.trackListenerRetry?.({
            action: "retry",
            event: "wake_remount",
            reason: "reconnect",
            collection: "page",
            durationMs: hiddenMs,
          });
        });
      }, "eng.wake.remount");
      dispatchRecovery("wake");
      return;
    }
    scheduleOnlineRecovery();
  }, BECOME_VISIBLE_COALESCE_MS);
}

function scheduleOnlineRecovery() {
  if (onlineRecoveryTimer) {
    clearTimeout(onlineRecoveryTimer);
    onlineRecoveryTimer = null;
  }
  onlineRecoveryTimer = setTimeout(() => {
    onlineRecoveryTimer = null;
    dispatchRecovery("online");
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
 * Wrapper-level recreate only — INTERNAL ASSERTION is owned by remount / last-resort reload.
 * @param {unknown} err
 */
export function isRetryableListenerError(err) {
  if (isFirestoreInternalAssertion(err)) return false;
  return isLikelyNetworkFirestoreError(err);
}

/**
 * Synthetic error so clinical hooks can leave LOADING after retry exhaustion.
 * @param {string} [cause]
 */
export function createListenerTimeoutError(cause = "timeout") {
  const err = new Error(
    `First snapshot did not arrive (${String(cause || "timeout").slice(0, 80)})`
  );
  err.name = "ListenerTimeout";
  err.code = "timeout";
  return err;
}

export function isListenerTimeoutError(err) {
  return (
    err?.name === "ListenerTimeout" ||
    String(err?.code || "").toLowerCase() === "timeout"
  );
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
 * Single recovery authority. Callers must not also retryWaiting + remount.
 * @param {string} [reason]
 * @returns {{ skipped: boolean, path?: string, reason?: string }}
 */
export function dispatchRecovery(reason = "recovery") {
  const now = Date.now();
  const r = String(reason || "recovery");
  const bypassLock = r === "assertion" || r === "unrecoverable";
  if (!bypassLock && now < recoveryBusyUntil) {
    return { skipped: true, reason: "busy" };
  }
  if (!bypassLock) {
    recoveryBusyUntil = now + RECOVERY_LOCK_MS;
  }

  if (r === "online" || r === "timeout") {
    safeRun(() => {
      retryWaitingPageListeners();
    }, "eng.recovery.retryWaiting");
    return { skipped: false, path: "retryWaiting" };
  }

  if (r === "unrecoverable") {
    notifyListenerRecovery("unrecoverable");
    return { skipped: false, path: "unrecoverable" };
  }

  if (r === "assertion" || r === "wake") {
    notifyListenerRecovery(r);
    return { skipped: false, path: "remount" };
  }

  // user_retry / retry: waiting recreate XOR triad remount — never both.
  const waiting = getWaitingListeners();
  if (waiting.length > 0) {
    safeRun(() => {
      retryWaitingPageListeners();
    }, "eng.recovery.userWaiting");
    return { skipped: false, path: "retryWaiting" };
  }
  notifyListenerRecovery("retry");
  return { skipped: false, path: "remount" };
}

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

  assertionRecoveryAt = assertionRecoveryAt.filter(
    (t) => now - t < ASSERTION_WINDOW_MS
  );
  assertionRecoveryAt.push(now);

  // Staff refresh the URL themselves. Do not auto-reload the tab.
  if (assertionRecoveryAt.length >= MAX_ASSERTION_RECOVERIES) {
    dispatchRecovery("unrecoverable");
    safeRun(() => {
      import("../../engineering/telemetry/EngTelemetry.js").then((eng) => {
        eng.EngTelemetry?.trackListenerRetry?.({
          action: "retry_failed",
          event: "assertion_unrecoverable",
          reason: "retry",
          collection: "page",
          docCount: assertionRecoveryAt.length,
        });
      });
    }, "eng.assertion.unrecoverable");
    return;
  }

  // Remount triad hooks once. Do not also retryWaiting or wrapper recreate.
  dispatchRecovery("assertion");
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
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        if (hiddenAt == null) hiddenAt = Date.now();
        return;
      }
      if (document.visibilityState === "visible") {
        scheduleBecomeVisible();
      }
    });
    window.addEventListener("pageshow", (ev) => {
      if (!ev?.persisted) return;
      forceWakeOnVisible = true;
      scheduleBecomeVisible();
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
    finalState: "CONNECTING",
    classification: "INCOMPLETE",
    finalReason: "NO_SNAPSHOT",
  };
}
