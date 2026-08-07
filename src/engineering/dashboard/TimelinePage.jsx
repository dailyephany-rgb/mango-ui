/**
 * Timeline — Engineering flight recorder (page loads, errors, reconnects).
 * Presentation only; reads eng_* collections.
 */

import React, { useMemo, useState } from "react";
import {
  useEngCollection,
  useEngConfigured,
  ENG_COLLECTIONS,
} from "./useEngData.js";
import {
  fmtMs,
  fmtTs,
  loadStatus,
  filterPageLoads,
  sortPageLoads,
  downloadCsv,
  dayKeyFromTs,
  inDatePreset,
} from "./perfViews.js";
import { WaterfallPanel } from "./WaterfallPanel.jsx";

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
  const { rows: loads, loading } = useEngCollection(ENG_COLLECTIONS.pageLoads, {
    limitN: 400,
  });
  const { rows: errors } = useEngCollection(ENG_COLLECTIONS.errors, {
    limitN: 150,
  });
  const { rows: listeners } = useEngCollection(ENG_COLLECTIONS.listenerDaily);

  const [q, setQ] = useState("");
  const [device, setDevice] = useState("");
  const [department, setDepartment] = useState("");
  const [page, setPage] = useState("");
  const [build, setBuild] = useState("");
  const [range, setRange] = useState("7d");
  const [sortKey, setSortKey] = useState("ts");
  const [sortDir, setSortDir] = useState("desc");
  const [expanded, setExpanded] = useState(null);
  const [kind, setKind] = useState("all");

  const depts = useMemo(
    () => [...new Set(loads.map((r) => r.department).filter(Boolean))].sort(),
    [loads]
  );
  const pages = useMemo(
    () => [...new Set(loads.map((r) => r.page).filter(Boolean))].sort(),
    [loads]
  );
  const builds = useMemo(
    () => [...new Set(loads.map((r) => r.buildId).filter(Boolean))].sort(),
    [loads]
  );

  const filteredLoads = useMemo(() => {
    const f = {
      q,
      device,
      department: department || undefined,
      page: page || undefined,
      build: build || undefined,
    };
    return sortPageLoads(
      filterPageLoads(loads, f).filter((r) => inDatePreset(r.ts, range)),
      sortKey,
      sortDir
    );
  }, [loads, q, device, department, page, build, range, sortKey, sortDir]);

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
        if (!inDatePreset(r.ts, range)) continue;
        if (q) {
          const blob = `${r.message || ""} ${r.page || ""} ${r.deviceId || ""}`.toLowerCase();
          if (!blob.includes(q.toLowerCase())) continue;
        }
        if (device && !(r.deviceId || "").includes(device)) continue;
        if (department && r.department !== department) continue;
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
    return events.sort((a, b) => b._ts - a._ts).slice(0, 300);
  }, [filteredLoads, errors, listeners, kind, range, q, device, department]);

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
        <div className="meta">flight recorder · page loads · errors · reconnects</div>
      </div>

      <div className="eng-panel eng-form">
        <div className="eng-actions" style={{ alignItems: "flex-end" }}>
          <label>
            Search
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="device / page / text" />
          </label>
          <label>
            Device
            <input value={device} onChange={(e) => setDevice(e.target.value)} placeholder="id fragment" />
          </label>
          <label>
            Department
            <select value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">All</option>
              {depts.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label>
            Page
            <select value={page} onChange={(e) => setPage(e.target.value)}>
              <option value="">All</option>
              {pages.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Build
            <select value={build} onChange={(e) => setBuild(e.target.value)}>
              <option value="">All</option>
              {builds.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </label>
          <label>
            Range
            <select value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday+</option>
              <option value="7d">7 Days</option>
              <option value="30d">30 Days</option>
            </select>
          </label>
          <label>
            Kind
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">All</option>
              <option value="loads">Page loads</option>
              <option value="errors">Errors</option>
              <option value="reconnects">Reconnects</option>
            </select>
          </label>
          <button
            type="button"
            className="eng-btn"
            onClick={() =>
              downloadCsv(
                `eng-timeline-${dayKeyFromTs()}.csv`,
                timeline.map((e) => ({
                  time: fmtTs(e._ts),
                  kind: e._kind,
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

      <div className="eng-panel">
        <h2>Performance timeline (page loads)</h2>
        {!filteredLoads.length ? (
          <Empty configured={configured} loading={loading} label="No page-load samples yet — open clinical pages after this deploy" />
        ) : (
          <table className="eng-table">
            <thead>
              <tr>
                {[
                  ["ts", "Time"],
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
                    {sortKey === k && k !== "table" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
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
                      <td title={r.deviceId}>{(r.deviceId || "").slice(0, 8)}…</td>
                      <td>{r.department || "—"}</td>
                      <td>{r.page || "—"}</td>
                      <td>{r.buildId || "—"}</td>
                      <td>{fmtMs(r.totalMs)}</td>
                      <td>{fmtMs(r.firstRenderMs)}</td>
                      <td title="Same sample as First Snapshot (not separately instrumented)">
                        {fmtMs(r.firstSnapshotMs)}
                      </td>
                      <td>{fmtMs(r.firstSnapshotMs)}</td>
                      <td title="Not instrumented">—</td>
                      <td>{fmtMs(r.interactiveMs)}</td>
                      <td>{fmtMs(r.totalMs)}</td>
                      <td>
                        <span className={`pill ${st === "ok" ? "online" : st === "slow" ? "stale" : "offline"}`}>
                          {st}
                        </span>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={13}>
                          <WaterfallPanel load={r} />
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

      <div className="eng-panel">
        <h2>Mixed flight log</h2>
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
                <td>{(e.deviceId || "").slice(0, 8) || "—"}</td>
                <td>{e.department || "—"}</td>
                <td>{e._label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
