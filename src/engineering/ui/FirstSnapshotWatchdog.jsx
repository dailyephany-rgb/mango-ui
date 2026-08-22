/**
 * Non-blocking first-snapshot / connectivity watchdog (N6).
 * Observer UX only — Retry recreates waiting tracked listeners, never reloads.
 * Does not change clinical queries or write paths.
 */

import React, { useEffect, useState } from "react";
import {
  subscribeListenerWatch,
  getWaitingListeners,
  getHungCount,
} from "../telemetry/listenerWatch.js";
import { EngTelemetry } from "../telemetry/EngTelemetry.js";
import { isEngTelemetryEnabled } from "../telemetry/killSwitch.js";
import {
  subscribeListenerRecovery,
  dispatchRecovery,
} from "../../shared/firestore/listenerRecovery.js";

export default function FirstSnapshotWatchdog() {
  const [tick, setTick] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine !== false : true
  );
  const [recoveryHint, setRecoveryHint] = useState("");

  useEffect(() => {
    const unsub = subscribeListenerWatch(() => setTick((n) => n + 1));
    const iv = setInterval(() => setTick((n) => n + 1), 1000);
    const onOnline = () => {
      setOnline(true);
      setRecoveryHint("online");
      setTimeout(() => setRecoveryHint(""), 2500);
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const unsubRec = subscribeListenerRecovery((reason) => {
      setRecoveryHint(String(reason || "recovery"));
      setTick((n) => n + 1);
      setTimeout(() => setRecoveryHint(""), 4000);
    });
    return () => {
      unsub();
      clearInterval(iv);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      unsubRec();
    };
  }, []);

  void tick;

  if (!isEngTelemetryEnabled()) return null;

  const waiting = getWaitingListeners();
  const any30 = waiting.some((w) => w.timeout30) || getHungCount() > 0;
  const any10 = waiting.some((w) => w.timeout10);
  const showOffline = !online;
  const showWaiting = waiting.length > 0 && (any10 || any30);

  if (!showOffline && !showWaiting && !recoveryHint) return null;

  const oldest = waiting.length
    ? waiting.reduce(
        (a, b) => (a.startedAt <= b.startedAt ? a : b),
        waiting[0]
      )
    : null;
  const waitedSec = oldest
    ? Math.max(0, Math.round((Date.now() - (oldest.startedAt || Date.now())) / 1000))
    : 0;
  const collections = [...new Set(waiting.map((w) => w.collection))].join(", ");

  const onRetry = () => {
    if (retrying) return;
    setRetrying(true);
    try {
      EngTelemetry.trackListenerRetry({
        action: "retry",
        event: "retry_clicked",
        reason: "retry",
        collection: collections || "page",
        docCount: waiting.length,
      });
      dispatchRecovery("user_retry");
    } finally {
      setTimeout(() => setRetrying(false), 1500);
    }
  };

  const severe = showOffline || any30;
  const banner = {
    position: "fixed",
    left: 12,
    right: 12,
    top: severe ? 12 : undefined,
    bottom: severe ? undefined : 12,
    zIndex: 99999,
    maxWidth: 560,
    margin: "0 auto",
    padding: "14px 16px",
    borderRadius: 12,
    border: severe ? "2px solid #b91c1c" : "1px solid #cbd5e1",
    background: severe ? "#fef2f2" : "#fff",
    color: "#0f172a",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    fontSize: 14,
    lineHeight: 1.45,
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.18)",
  };

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      style={banner}
      data-mango-eng-watchdog="1"
    >
      <div style={{ fontWeight: 800, marginBottom: 6, fontSize: 16 }}>
        {showOffline
          ? "Offline"
          : any30
            ? "Live data timed out"
            : recoveryHint === "unrecoverable"
              ? "Live data error"
              : recoveryHint
                ? "Recovering live data"
                : "Still loading"}
      </div>
      <div style={{ color: "#334155", marginBottom: 10 }}>
        {showOffline ? (
          <>
            Live data will resume when the network returns. Listeners will
            re-subscribe automatically — no page reload needed.
          </>
        ) : (
          <>
            {waiting.length > 0 ? (
              <>
                Waiting on <strong>{waiting.length}</strong> listener
                {waiting.length === 1 ? "" : "s"}
                {collections ? ` (${collections})` : ""} · {waitedSec}s
              </>
            ) : (
              <>
                Application recovery in progress
                {recoveryHint ? ` (${recoveryHint})` : ""}. This does not
                confirm a Firestore reconnect.
              </>
            )}
            {any30 ? (
              <>
                <br />
                React already started, but the first snapshot never arrived
                (common on iPad Wi‑Fi). Tap Retry to re-open listeners — no page
                reload.
              </>
            ) : null}
          </>
        )}
      </div>
      {(any30 || waitedSec >= 20 || showOffline) && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying || showOffline}
          style={{
            padding: "12px 18px",
            borderRadius: 10,
            border: "none",
            background: retrying || showOffline ? "#94a3b8" : "#b91c1c",
            color: "#fff",
            fontWeight: 700,
            fontSize: 16,
            minHeight: 48,
            width: "100%",
            maxWidth: 280,
            cursor: retrying || showOffline ? "default" : "pointer",
          }}
        >
          {retrying
            ? "Retrying listeners…"
            : showOffline
              ? "Waiting for network…"
              : "Retry listeners"}
        </button>
      )}
    </div>
  );
}
