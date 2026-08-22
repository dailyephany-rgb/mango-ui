/**
 * Clinical listener status — page shell stays mounted in every state.
 */

import React from "react";

/**
 * @param {{
 *   listenStatus?: string,
 *   masterError?: string | null,
 *   onRetry?: () => void,
 *   rowCount?: number,
 * }} props
 */
export default function ListenStatusBanner({
  listenStatus,
  masterError,
  onRetry,
  rowCount,
}) {
  const status = listenStatus || "READY";
  if (status === "CLOSED" || status === "IDLE") return null;

  const emptyLive =
    status === "READY" && typeof rowCount === "number" && rowCount === 0;

  const title =
    status === "CONNECTING"
      ? "Connecting to live data…"
      : emptyLive
        ? "Live — waiting for rows"
        : status === "READY"
          ? "Live"
          : status === "OFFLINE"
            ? "Offline — waiting for connection"
            : status === "RECOVERING"
              ? "Recovering live data"
              : status === "TIMEOUT"
                ? "Still connecting…"
                : status === "ERROR"
                  ? "Unable to connect"
                  : "Live data";

  const body =
    emptyLive
      ? "Connected. Rows appear when this date has register documents."
      : status === "READY"
        ? null
        : masterError ||
          (status === "CONNECTING"
            ? "The register is ready. Rows appear when Firestore sends the first snapshot."
            : status === "RECOVERING"
              ? "Re-subscribing to live data. Filters and the table stay available."
              : status === "TIMEOUT"
                ? "The first snapshot is taking longer than usual. Tap Retry to subscribe again."
                : status === "OFFLINE"
                  ? "The network is down. Listeners will retry when you are back online."
                  : "Live data is not ready. Refresh the page URL if this continues.");

  const showRetry =
    typeof onRetry === "function" &&
    (status === "TIMEOUT" || status === "ERROR" || status === "RECOVERING");

  const severe = status === "ERROR" || status === "TIMEOUT";
  const live = status === "READY";

  return (
    <div
      role="status"
      style={{
        margin: "8px 0 12px",
        padding: live ? "6px 10px" : "10px 12px",
        borderRadius: 8,
        border: severe
          ? "1px solid #b91c1c"
          : live
            ? "1px solid #bbf7d0"
            : "1px solid #cbd5e1",
        background: severe ? "#fef2f2" : live ? "#f0fdf4" : "#f8fafc",
        color: "#0f172a",
        fontSize: live ? 13 : 14,
        lineHeight: 1.4,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: body ? 4 : 0 }}>{title}</div>
      {body ? (
        <div style={{ color: "#334155" }}>{String(body).slice(0, 280)}</div>
      ) : null}
      {showRetry && !live ? (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: 8,
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: "#b91c1c",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
