/**
 * Global filter bar — one control surface for all Engineering Dashboard tabs.
 */

import React, { useState } from "react";
import { useEngFilters } from "./EngFilterContext.jsx";
import {
  ALL_TIME_AGG_DAYS,
  ALL_TIME_SAMPLE_DAYS,
} from "./engFilters.js";

export function GlobalFilterBar() {
  const {
    filters,
    setFilters,
    range,
    resetFilters,
    refresh,
    deviceOptions,
    buildOptions,
    optionsLoading,
    DATE_PRESETS,
    DEPARTMENT_OPTIONS,
  } = useEngFilters();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");

  const showCustomDate =
    filters.preset === "custom_date" || filters.preset === "custom_datetime";
  const showCustomTime = filters.preset === "custom_datetime";
  const showRetentionHint =
    filters.preset === "all_time" ||
    filters.preset === "30d" ||
    filters.preset === "this_month" ||
    filters.preset === "prev_month";

  const exportPdf = async () => {
    setPdfError("");
    setPdfBusy(true);
    try {
      const { downloadEngReportPdf } = await import("./exportEngReportPdf.js");
      await downloadEngReportPdf({ filters, range });
    } catch (err) {
      setPdfError(err?.message || String(err));
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="eng-filter-bar" role="search" aria-label="Global dashboard filters">
      <div className="eng-filter-bar-title">
        <strong>Global filters</strong>
        <span className="eng-muted">{range.label}</span>
      </div>

      {showRetentionHint && (
        <div className="eng-muted" style={{ fontSize: "0.8rem", marginBottom: "0.35rem" }}>
          Retention: daily aggregates ~{ALL_TIME_AGG_DAYS}d · flight samples ~
          {ALL_TIME_SAMPLE_DAYS}d (Timeline / Components / FS loads). Queries may also
          be capped by limitN — Refresh if a tab looks truncated.
        </div>
      )}

      <div className="eng-filter-grid">
        <label>
          Date range
          <select
            value={filters.preset}
            onChange={(e) => setFilters({ preset: e.target.value })}
          >
            {DATE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {showCustomDate && (
          <>
            <label>
              Start date
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ startDate: e.target.value })}
              />
            </label>
            <label>
              End date
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ endDate: e.target.value })}
              />
            </label>
          </>
        )}

        {showCustomTime && (
          <>
            <label>
              Start time
              <input
                type="time"
                value={filters.startTime}
                onChange={(e) => setFilters({ startTime: e.target.value })}
              />
            </label>
            <label>
              End time
              <input
                type="time"
                value={filters.endTime}
                onChange={(e) => setFilters({ endTime: e.target.value })}
              />
            </label>
          </>
        )}

        <label>
          Department
          <select
            value={filters.department}
            onChange={(e) => setFilters({ department: e.target.value })}
          >
            {DEPARTMENT_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Device
          <select
            value={filters.deviceId}
            onChange={(e) => setFilters({ deviceId: e.target.value })}
            disabled={optionsLoading}
          >
            <option value="all">All Devices</option>
            {deviceOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label && d.label !== d.id
                  ? d.label
                  : `${d.id.slice(0, 8)}…`}
              </option>
            ))}
          </select>
        </label>

        <label>
          Build
          <select
            value={filters.buildId}
            onChange={(e) => setFilters({ buildId: e.target.value })}
            disabled={optionsLoading}
          >
            <option value="all">All Builds</option>
            {buildOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>

        <label className="eng-filter-search">
          Search
          <input
            type="search"
            value={filters.q}
            placeholder="Device · Department · Page · Build"
            onChange={(e) => setFilters({ q: e.target.value })}
          />
        </label>

        <div className="eng-filter-actions">
          <button type="button" className="eng-btn" onClick={() => refresh()}>
            Refresh
          </button>
          <button type="button" className="eng-btn" onClick={() => resetFilters()}>
            Reset Filters
          </button>
          <button
            type="button"
            className="eng-btn eng-btn-primary"
            onClick={exportPdf}
            disabled={pdfBusy}
            title="Export all tabs as PDF for the current global filters"
          >
            {pdfBusy ? "Exporting PDF…" : "Export PDF"}
          </button>
        </div>
      </div>
      {pdfError && (
        <div className="eng-muted" style={{ color: "#b42318", marginTop: "0.35rem" }}>
          PDF export failed: {pdfError}
        </div>
      )}
    </div>
  );
}
