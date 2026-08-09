/**
 * Banner when Engineering Firestore writes are failing (usually free-tier quota).
 */

import React, { useEffect, useState } from "react";
import { getEngWriteHealth } from "../telemetry/engWriteHealth.js";
import { getEngProjectId } from "../firebaseEngConfig.js";

export function EngWriteHealthBanner() {
  const [health, setHealth] = useState(() => getEngWriteHealth());

  useEffect(() => {
    const t = setInterval(() => setHealth(getEngWriteHealth()), 3000);
    return () => clearInterval(t);
  }, []);

  if (!health.quotaExceeded && !health.lastError) return null;

  const project = getEngProjectId() || "mango-engineering";
  const mins = health.backoffUntil
    ? Math.max(0, Math.ceil((health.backoffUntil - Date.now()) / 60000))
    : 0;

  if (health.quotaExceeded) {
    return (
      <div
        className="eng-write-health eng-write-health--quota"
        role="alert"
        style={{
          margin: "0 0 12px",
          padding: "10px 12px",
          borderRadius: 6,
          background: "#3b1d1d",
          border: "1px solid #a35454",
          color: "#f3d4d4",
          fontSize: 13,
          lineHeight: 1.45,
        }}
      >
        <strong>Engineering writes blocked — Firestore quota exceeded</strong>
        <div style={{ marginTop: 4 }}>
          Project <code>{project}</code> is rejecting new telemetry (
          <code>RESOURCE_EXHAUSTED</code>). Timeline stays frozen on old data until
          quota resets (daily on Spark) or you upgrade to Blaze and link billing.
        </div>
        <div style={{ marginTop: 6 }}>
          <a
            href={`https://console.firebase.google.com/project/${project}/usage`}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#ffd0d0" }}
          >
            Open Firebase usage →
          </a>
          {mins > 0 ? ` · client backoff ~${mins}m` : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className="eng-write-health"
      role="status"
      style={{
        margin: "0 0 12px",
        padding: "8px 12px",
        borderRadius: 6,
        background: "#2a2418",
        border: "1px solid #8a7040",
        color: "#f0e2c0",
        fontSize: 13,
      }}
    >
      Engineering write error: {health.lastError?.code || "unknown"} —{" "}
      {health.lastError?.message || ""}
    </div>
  );
}
