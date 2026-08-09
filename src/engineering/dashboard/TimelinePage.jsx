/**
 * Timeline — Engineering flight recorder (page loads, errors, reconnects).
 * Uses global dashboard filters.
 */

import React, { useMemo, useState } from "react";
import {
  useFilteredEngCollection,
  useEngConfigured,
  ENG_COLLECTIONS,
} from "./useEngData.js";
import { useEngFilters } from "./EngFilterContext.jsx";
import {
  fmtMs,
  fmtTs,
  loadStatus,
  sortPageLoads,
  downloadCsv,
  dayKeyFromTs,
} from "./perfViews.js";
import { WaterfallPanel } from "./WaterfallPanel.jsx";
import { LoadIdCell } from "./LoadIdCell.jsx";

function DeviceName({ id, label: _rowLabel }) {
  const { formatDeviceName } = useEngFilters();
  // Always use LIVE device_status label for this deviceId.
  // Ignore embedded row.label — that froze Timeline on mac-3 after rename.
  if (!id) return "—";
  return <span title={id}>{formatDeviceName(id)}</span>;
}

function Empty({ configured, loading, label }) {
  if (loading) return <p className="eng-muted">Loading…</p>;
  if (!configured) {
    return (
      <p className="eng-muted">
        Engineering Firebase not configured — timeline needs eng_* data.
      </p>
    );
  }
  return <p className="eng-muted">{label || "No events yet"}</p>;
}

export function TimelinePage() {
  const configured = useEngConfigured();
  const { range, filters } = useEngFilters();
  const { rows: loads, loading } = useFilteredEngCollection(
    ENG_COLLECTIONS.pageLoads,
    { limitN: 400, timeMode: "ts" }
  );
  const { rows: errors } = useFilteredEngCollection(ENG_COLLECTIONS.errors, {
    limitN: 300,
    timeMode: "ts",
  });
  const { rows: listeners } = useFilteredEngCollection(
    ENG_COLLECTIONS.listenerDaily,
    { timeMode: "day" }
  );

  const [sortKey, setSortKey] = useState("ts");
  const [sortDir, setSortDir] = useState("desc");
  const [expanded, setExpanded] = useState(null);
  const [kind, setKind] = useState("all");
  const [pageOnly, setPageOnly] = useState("");

  const pages = useMemo(
    () => [...new Set(loads.map((r) => r.page).filter(Boolean))].sort(),
    [loads]
  );

  const filteredLoads = useMemo(() => {
    const list = pageOnly
      ? loads.filter((r) => r.page === pageOnly)
      : loads;
    return sortPageLoads(list, sortKey, sortDir);
  }, [loads, pageOnly, sortKey, sortDir]);

  const timeline = useMemo(() => {
    const events = [];
    if (kind === "all" || kind === "loads") {
      for (const r of filteredLoads) {
        events.push({
          ...r,
          _kind: "page_load",
          _ts: r.ts || 0,
          _label: `${r.page || "page"} load`,
        });
      }
    }
    if (kind === "all" || kind === "errors") {
      for (const r of errors) {
        events.push({
          ...r,
          _kind: "error",
          _ts: r.ts || 0,
          _label: r.message || "error",
        });
      }
    }
    if (kind === "all" || kind === "reconnects") {
      for (const r of listeners) {
        if ((r.reconnects || 0) <= 0) continue;
        events.push({
          ...r,
          _kind: "reconnect",
          _ts: Date.parse(r.day || "") || 0,
          _label: `${r.collection} reconnects×${r.reconnects}`,
          totalMs: null,
        });
      }
    }
    if (kind === "all" || kind === "timeouts") {
      for (const r of listeners) {
        const t10 = r.timeouts10 || 0;
        const t30 = r.timeouts30 || 0;
        if (t10 <= 0 && t30 <= 0) continue;
        events.push({
          ...r,
          _kind: "timeout",
          _ts: Date.parse(r.day || "") || 0,
          _label: `${r.collection} timeouts 10s×${t10} 30s×${t30}`,
          totalMs: null,
        });
      }
    }
    return events.sort((a, b) => b._ts - a._ts).slice(0, 300);
  }, [filteredLoads, errors, listeners, kind]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <>
      <div className="eng-header">
        <h1>Timeline</h1>
        <div className="meta">
          flight recorder · {range.label}
          {filters.department !== "all" ? ` · ${filters.department}` : ""}
        </div>
      </div>

      <div className="eng-panel">
        <div className="eng-toolbar">
          <label>
            Page
            <select value={pageOnly} onChange={(e) => setPageOnly(e.target.value)}>
              <option value="">All pages</option>
              {pages.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kind
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">All</option>
              <option value="loads">Page loads</option>
              <option value="errors">Errors</option>
              <option value="reconnects">Reconnects</option>
              <option value="timeouts">Listener timeouts</option>
            </select>
          </label>
          <p className="eng-muted eng-toolbar-hint">
            Load ID links this row to Components (same page open). Click an ID to
            copy. Reconnects/timeouts are daily aggregates from eng_listener_daily.
          </p>
          <div className="eng-toolbar-actions">
            <button
              type="button"
              className="eng-btn"
              onClick={() =>
                downloadCsv(
                  `eng-timeline-${dayKeyFromTs()}.csv`,
                  timeline.map((e) => ({
                    time: fmtTs(e._ts),
                    kind: e._kind,
                    loadId: e.loadId || e.id || "",
                    deviceId: e.deviceId,
                    department: e.department,
                    page: e.page,
                    buildId: e.buildId,
                    totalMs: e.totalMs,
                    interactiveMs: e.interactiveMs,
                    firstSnapshotMs: e.firstSnapshotMs,
                    label: e._label,
                  }))
                )
              }
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="eng-panel">
        <h2>Performance timeline (page loads)</h2>
        {!filteredLoads.length ? (
          <Empty
            configured={configured}
            loading={loading}
            label="No page-load samples in the selected filter range"
          />
        ) : (
          <div className="eng-table-scroll">
          <table className="eng-table">
            <thead>
              <tr>
                {[
                  ["ts", "Time"],
                  ["loadId", "Load ID"],
                  ["deviceId", "Device"],
                  ["department", "Department"],
                  ["page", "Page"],
                  ["buildId", "Build"],
                  ["totalMs", "Total Load"],
                  ["firstRenderMs", "React Mount"],
                  ["firstSnapshotMs", "First Query"],
                  ["firstSnapshotMs", "First Snapshot"],
                  ["table", "Table Render"],
                  ["interactiveMs", "Interactive"],
                  ["totalMs", "Ready"],
                ].map(([k, label], idx) => (
                  <th
                    key={`${label}-${idx}`}
                    style={{ cursor: k === "table" ? "default" : "pointer" }}
                    onClick={() => k !== "table" && toggleSort(k)}
                  >
                    {label}
                    {sortKey === k && k !== "table"
                      ? sortDir === "asc"
                        ? " ↑"
                        : " ↓"
                      : ""}
                  </th>
                ))}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredLoads.slice(0, 200).map((r) => {
                const st = loadStatus(r);
                const open = expanded === r.id;
                return (
                  <React.Fragment key={r.id}>
                    <tr
                      style={{ cursor: "pointer" }}
                      onClick={() => setExpanded(open ? null : r.id)}
                    >
                      <td>{fmtTs(r.ts)}</td>
                      <td>
                        <LoadIdCell loadId={r.loadId} id={r.id} />
                      </td>
                      <td>
                        <DeviceName id={r.deviceId} label={r.label} />
                      </td>
                      <td>{r.department || "—"}</td>
                      <td>{r.page || "—"}</td>
                      <td>{r.buildId || "—"}</td>
                      <td>{fmtMs(r.totalMs)}</td>
                      <td>{fmtMs(r.firstRenderMs)}</td>
                      <td>{fmtMs(r.firstSnapshotMs)}</td>
                      <td>{fmtMs(r.firstSnapshotMs)}</td>
                      <td title="Not instrumented">—</td>
                      <td>{fmtMs(r.interactiveMs)}</td>
                      <td>{fmtMs(r.totalMs)}</td>
                      <td>
                        <span
                          className={`pill ${
                            st === "ok"
                              ? "online"
                              : st === "slow"
                                ? "stale"
                                : st === "hung"
                                  ? "offline"
                                  : "offline"
                          }`}
                        >
                          {st}
                        </span>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={14} className="eng-cell-wrap">
                          <div style={{ padding: "0.35rem 0 0.5rem" }}>
                            <p
                              className="eng-muted"
                              style={{ fontSize: "0.8rem", margin: "0 0 0.5rem" }}
                            >
                              Load ID{" "}
                              <code>{r.loadId || r.id || "—"}</code>
                              {" · "}
                              match on Components with the same Load ID
                            </p>
                            <WaterfallPanel load={r} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div className="eng-panel">
        <h2>Mixed flight log</h2>
        <div className="eng-table-scroll">
        <table className="eng-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Kind</th>
              <th>Device</th>
              <th>Dept</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {timeline.slice(0, 100).map((e, i) => (
              <tr key={`${e._kind}-${e.id || i}`}>
                <td>{fmtTs(e._ts)}</td>
                <td>{e._kind}</td>
                <td>
                  <DeviceName id={e.deviceId} label={e.label} />
                </td>
                <td>{e.department || "—"}</td>
                <td className="eng-cell-wrap">{e._label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </>
  );
}
