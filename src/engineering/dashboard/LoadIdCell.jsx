/**
 * Shared Load ID cell for Timeline ↔ Components cross-reference.
 */

import React, { useState } from "react";

/**
 * @param {{ loadId?: string | null, id?: string | null, stopRowClick?: boolean }} props
 */
export function LoadIdCell({ loadId, id, stopRowClick = true }) {
  const [copied, setCopied] = useState(false);
  const value = String(loadId || id || "").trim();
  if (!value) return <span className="eng-muted">—</span>;

  const short =
    value.length <= 22 ? value : `${value.slice(0, 10)}…${value.slice(-8)}`;

  const onCopy = async (e) => {
    if (stopRowClick) e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      className="eng-load-id"
      title={`${value}\nClick to copy — match Timeline ↔ Components`}
      onClick={onCopy}
      style={{
        fontFamily: "IBM Plex Mono, ui-monospace, monospace",
        fontSize: "0.72rem",
        background: "transparent",
        border: "1px solid transparent",
        color: "inherit",
        cursor: "pointer",
        padding: "2px 4px",
        borderRadius: 4,
        maxWidth: 160,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {copied ? "copied" : short}
    </button>
  );
}
