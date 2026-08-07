/**
 * Non-blocking first-snapshot watchdog (N6).
 * Observer UX only — Retry recreates waiting tracked listeners, never reloads.
 */

import React, { useEffect, useState } from "react";
import {
  subscribeListenerWatch,
  getWaitingListeners,
  getHungCount,
  retryWaitingPageListeners,
} from "../telemetry/listenerWatch.js";
import { EngTelemetry } from "../telemetry/EngTelemetry.js";
import { isEngTelemetryEnabled } from "../telemetry/killSwitch.js";

export default function FirstSnapshotWatchdog() {
  const [tick, setTick] = useState(0);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const unsub = subscribeListenerWatch(() => setTick((n) => n + 1));
    const iv = setInterval(() => setTick((n) => n + 1), 1000);
    return () => {
      unsub();
      clearInterval(iv);
    };
  }, []);

  void tick;

  if (!isEngTelemetryEnabled()) return null;

  const waiting = getWaitingListeners();
  if (!waiting.length) return null;

  const any30 = waiting.some((w) => w.timeout30) || getHungCount() > 0;
  const any10 = waiting.some((w) => w.timeout10);
  if (!any10 && !any30) return null;

  const oldest = waiting.reduce(
    (a, b) => (a.startedAt <= b.startedAt ? a : b),
    waiting[0]
  );
  const waitedSec = Math.max(
    0,
    Math.round((Date.now() - (oldest?.startedAt || Date.now())) / 1000)
  );
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
      const result = retryWaitingPageListeners();
      if (!result.attempted) {
        EngTelemetry.trackListenerRetry({
          action: "retry_failed",
          event: "retry_failed",
          reason: "retry",
          collection: collections || "page",
        });
      }
    } finally {
      setTimeout(() => setRetrying(false), 1500);
    }
  };

  const banner = {
    position: "fixed",
    left: 12,
    right: 12,
    top: any30 ? 12 : undefined,
    bottom: any30 ? undefined : 12,
    zIndex: 99999,
    maxWidth: 560,
    margin: "0 auto",
    padding: "14px 16px",
    borderRadius: 12,
    border: any30 ? "2px solid #b91c1c" : "1px solid #cbd5e1",
    background: any30 ? "#fef2f2" : "#fff",
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
        {any30
          ? "Firestore still not responding"
          : "Still loading…"}
      </div>
      <div style={{ color: "#334155", marginBottom: 10 }}>
        Waiting on <strong>{waiting.length}</strong> listener
        {waiting.length === 1 ? "" : "s"}
        {collections ? ` (${collections})` : ""} · {waitedSec}s
        {any30 ? (
          <>
            <br />
            React already started, but the first snapshot never arrived (common
            on iPad Wi‑Fi). Tap Retry to re-open listeners — no page reload.
          </>
        ) : null}
      </div>
      {(any30 || waitedSec >= 20) && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          style={{
            padding: "12px 18px",
            borderRadius: 10,
            border: "none",
            background: retrying ? "#94a3b8" : "#b91c1c",
            color: "#fff",
            fontWeight: 700,
            fontSize: 16,
            minHeight: 48,
            width: "100%",
            maxWidth: 280,
            cursor: retrying ? "default" : "pointer",
          }}
        >
          {retrying ? "Retrying listeners…" : "Retry listeners"}
        </button>
      )}
    </div>
  );
}
