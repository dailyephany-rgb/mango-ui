/**
 * Components — Engineering Component Timeline (per page-load breakdown).
 * One expandable row per eng_components doc (= one Timeline page load).
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
  downloadCsv,
  dayKeyFromTs,
} from "./perfViews.js";
import { LoadIdCell } from "./LoadIdCell.jsx";

function DeviceName({ id }) {
  const { formatDeviceName } = useEngFilters();
  if (!id) return "—";
  return <span title={id}>{formatDeviceName(id)}</span>;
}

function Empty({ configured, loading, label }) {
  if (loading) return <p className="eng-muted">Loading…</p>;
  if (!configured) {
    return (
      <p className="eng-muted">
        Engineering Firebase not configured — component timeline needs eng_* data.
      </p>
    );
  }
  return <p className="eng-muted">{label || "No component breakdowns yet"}</p>;
}

function statusPill(status, mounted) {
  if (!mounted || status === "not_mounted") {
    return <span className="pill stale">Not Mounted</span>;
  }
  if (status === "hung") return <span className="pill offline">hung</span>;
  if (status === "incomplete") {
    return <span className="pill stale">incomplete</span>;
  }
  if (status === "mounting" || status === "mounted") {
    return <span className="pill stale">waiting</span>;
  }
  return <span className="pill online">ok</span>;
}

function cellMs(mounted, v) {
  if (!mounted) return "Not Mounted";
  if (v == null || Number.isNaN(v)) return "—";
  return fmtMs(v);
}

export function ComponentsPage() {
  const configured = useEngConfigured();
  const { range, filters } = useEngFilters();
  const { rows, loading } = useFilteredEngCollection(
    ENG_COLLECTIONS.components,
    { limitN: 400, timeMode: "ts" }
  );

  const [pageOnly, setPageOnly] = useState("");
  const [expanded, setExpanded] = useState(null);

  const pages = useMemo(
    () => [...new Set(rows.map((r) => r.page).filter(Boolean))].sort(),
    [rows]
  );

  const loads = useMemo(() => {
    const list = pageOnly ? rows.filter((r) => r.page === pageOnly) : rows;
    return [...list].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }, [rows, pageOnly]);

  return (
    <>
      <div className="eng-header">
        <h1>Components</h1>
        <div className="meta">
          component timeline · one breakdown per page load · {range.label}
          {filters.department !== "all" ? ` · ${filters.department}` : ""}
        </div>
      </div>

      <div className="eng-panel eng-form">
        <div className="eng-actions" style={{ alignItems: "flex-end" }}>
          <label>
            Page
            <select
              value={pageOnly}
              onChange={(e) => setPageOnly(e.target.value)}
            >
              <option value="">All pages</option>
              {pages.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <p className="eng-muted" style={{ margin: 0, fontSize: "0.75rem" }}>
            Load ID matches Timeline for the same page open. Click an ID to copy.
            Mount/Ready come from EngComponent timing (works in production). Snapshot
            fills when that component owns the first Firestore answer. Data slots stay
            waiting until snapshot (or hung/incomplete on finalize). Lazy tabs stay
            Not Mounted until opened.
          </p>
          <button
            type="button"
            className="eng-btn"
            onClick={() => {
              const flat = [];
              for (const load of loads) {
                const comps = Array.isArray(load.components)
                  ? load.components
                  : [];
                for (const c of comps) {
                  flat.push({
                    time: fmtTs(load.ts),
                    loadId: load.loadId || load.id,
                    deviceId: load.deviceId,
                    department: load.department,
                    page: load.page,
                    component: c.name,
                    parent: c.parent,
                    type: c.type,
                    mounted: c.mounted,
                    mountMs: c.mountMs,
                    renderMs: c.renderMs,
                    firstSnapshotMs: c.firstSnapshotMs,
                    readyMs: c.readyMs,
                    totalMs: c.totalMs,
                    status: c.status,
                  });
                }
              }
              downloadCsv(
                `eng-components-${dayKeyFromTs()}.csv`,
                flat
              );
            }}
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="eng-panel">
        <h2>Performance Component Timeline</h2>
        {!loads.length ? (
          <Empty
            configured={configured}
            loading={loading}
            label="No component breakdowns in the selected filter range"
          />
        ) : (
          <table className="eng-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Device</th>
                <th>Department</th>
                <th>Page</th>
                <th>Load ID</th>
                <th>Components</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loads.slice(0, 200).map((r) => {
                const id = r.loadId || r.id;
                const open = expanded === id;
                const comps = Array.isArray(r.components) ? r.components : [];
                const mountedN = comps.filter((c) => c.mounted).length;
                return (
                  <React.Fragment key={id}>
                    <tr
                      style={{ cursor: "pointer" }}
                      onClick={() => setExpanded(open ? null : id)}
                    >
                      <td>{fmtTs(r.ts)}</td>
                      <td>
                        <DeviceName id={r.deviceId} />
                      </td>
                      <td>{r.department || "—"}</td>
                      <td>{r.page || "—"}</td>
                      <td>
                        <LoadIdCell loadId={r.loadId} id={r.id} />
                      </td>
                      <td>
                        {mountedN}/{comps.length || "—"} mounted
                      </td>
                      <td>{fmtMs(r.totalMs)}</td>
                      <td>
                        <span
                          className={`pill ${
                            r.hung
                              ? "offline"
                              : r.incomplete
                                ? "stale"
                                : "online"
                          }`}
                        >
                          {r.hung ? "hung" : r.incomplete ? "incomplete" : "ok"}
                        </span>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={8}>
                          <div style={{ padding: "0.5rem 0" }}>
                            <p
                              className="eng-muted"
                              style={{ fontSize: "0.8rem", marginTop: 0 }}
                            >
                              Load ID <code>{id}</code> · click row to collapse
                            </p>
                            <table className="eng-table">
                              <thead>
                                <tr>
                                  <th>Component</th>
                                  <th>Parent</th>
                                  <th>Type</th>
                                  <th>Mount</th>
                                  <th>Render</th>
                                  <th>Snapshot</th>
                                  <th>Ready</th>
                                  <th>Total</th>
                                  <th>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {comps.map((c) => (
                                  <tr key={`${id}-${c.name}`}>
                                    <td>{c.name}</td>
                                    <td>{c.parent || "—"}</td>
                                    <td>{c.type || "—"}</td>
                                    <td>{cellMs(c.mounted, c.mountMs)}</td>
                                    <td>{cellMs(c.mounted, c.renderMs)}</td>
                                    <td>
                                      {cellMs(c.mounted, c.firstSnapshotMs)}
                                    </td>
                                    <td>{cellMs(c.mounted, c.readyMs)}</td>
                                    <td>{cellMs(c.mounted, c.totalMs)}</td>
                                    <td>
                                      {statusPill(c.status, c.mounted)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export default ComponentsPage;
