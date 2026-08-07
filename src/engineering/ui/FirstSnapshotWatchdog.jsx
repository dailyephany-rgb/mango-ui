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

const styleBanner = {
  position: "fixed",
  left: 12,
  right: 12,
  bottom: 12,
  zIndex: 99999,
  maxWidth: 520,
  margin: "0 auto",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  fontSize: 13,
  lineHeight: 1.4,
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
};

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

  return (
    <div
      role="status"
      aria-live="polite"
      style={styleBanner}
      data-mango-eng-watchdog="1"
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        {any30
          ? "Loading taking longer than expected"
          : "Still loading…"}
      </div>
      <div style={{ color: "#475569", marginBottom: 8 }}>
        Waiting on {waiting.length} listener
        {waiting.length === 1 ? "" : "s"}
        {collections ? ` (${collections})` : ""} · {waitedSec}s
      </div>
      {any30 && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #94a3b8",
            background: retrying ? "#e2e8f0" : "#0f172a",
            color: retrying ? "#64748b" : "#fff",
            fontWeight: 600,
            cursor: retrying ? "default" : "pointer",
          }}
        >
          {retrying ? "Retrying…" : "Retry"}
        </button>
      )}
    </div>
  );
}
