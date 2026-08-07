/**
 * Page-load timing waterfall (presentation only).
 */

import React from "react";
import { buildWaterfall, fmtMs } from "./perfViews.js";

export function WaterfallPanel({ load }) {
  const { stages, slowest } = buildWaterfall(load || {});
  return (
    <div className="eng-waterfall">
      {stages.map((s, i) => (
        <div key={s.id} className="eng-waterfall-row">
          {i > 0 && <div className="eng-waterfall-arrow">↓</div>}
          <div
            className={
              s.durationMs != null &&
              slowest != null &&
              s.durationMs === slowest &&
              s.id !== "nav"
                ? "eng-waterfall-stage slow"
                : "eng-waterfall-stage"
            }
          >
            <strong>{s.label}</strong>
            <span>
              {s.atMs != null ? `@ ${fmtMs(s.atMs)}` : "—"}
              {s.durationMs != null ? ` · Δ ${fmtMs(s.durationMs)}` : ""}
            </span>
            {s.note && <em className="eng-muted"> {s.note}</em>}
          </div>
        </div>
      ))}
    </div>
  );
}
