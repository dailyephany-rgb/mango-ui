/**
 * Engineering Dashboard page components (EDS §13).
 * Reads Engineering Firebase only — never clinical db.
 */

import React, { useMemo, useState } from "react";
import {
  useEngCollection,
  useFilteredEngCollection,
  useEngConfigured,
  useLocalEngBuffer,
  useEngSettings,
  ENG_COLLECTIONS,
} from "./useEngData.js";
import { useEngFilters } from "./EngFilterContext.jsx";
import { departmentMatches } from "./engFilters.js";
import { devicePresence, computeHealthScore } from "../health/scores.js";
import { getDeviceId, setDeviceLabel, getDeviceLabel } from "../telemetry/deviceId.js";
import { EngTelemetry } from "../telemetry/EngTelemetry.js";
import { scheduleFlush } from "../telemetry/flush.js";
import { getEngProjectId } from "../firebaseEngConfig.js";
import {
  fmtMs,
  fmtTs as fmtTsPerf,
  dayKeyFromTs,
  downloadCsv,
  loadStatus,
  summarizeLoads,
  trendByDay,
  avg,
} from "./perfViews.js";
import { WaterfallPanel } from "./WaterfallPanel.jsx";

function ms(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
}

function fmtTs(ts) {
  if (ts == null) return "—";
  try {
    const n = typeof ts?.toMillis === "function" ? ts.toMillis() : ts;
    return new Date(n).toLocaleString();
  } catch {
    return "—";
  }
}

function clientTsOf(row) {
  if (row?.clientTs != null) return row.clientTs;
  if (row?.lastSeenAt?.toMillis) return row.lastSeenAt.toMillis();
  return null;
}

function PresencePill({ row }) {
  const p = devicePresence(clientTsOf(row));
  return <span className={`pill ${p}`}>{p}</span>;
}

function EmptyHint({ configured, loading, label = "No data yet" }) {
  if (loading) return <p className="eng-muted">Loading…</p>;
  if (!configured) {
    return (
      <p className="eng-muted">
        Engineering Firebase not configured. Telemetry buffers locally. Set{" "}
        <code>VITE_ENG_*</code> or <code>engFirebase.options.js</code>.
      </p>
    );
  }
  return <p className="eng-muted">{label}</p>;
}

function BarList({ items }) {
  const top = (items || []).slice(0, 12);
  const max = Math.max(1, ...top.map((i) => i.value || 0));
  if (!top.length) return <p className="eng-muted">No samples</p>;
  return (
    <div>
      {top.map((i) => (
        <div className="bar-row" key={i.name}>
          <span title={i.name}>{i.name}</span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${(100 * (i.value || 0)) / max}%` }}
            />
          </div>
          <span>{Math.round(i.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export function HealthPage() {
  const configured = useEngConfigured();
  const { range, filters } = useEngFilters();
  const { rows: devices, loading } = useFilteredEngCollection(
    ENG_COLLECTIONS.deviceStatus,
    { timeMode: "none", live: true, skipTime: true }
  );
  const { rows: errors } = useFilteredEngCollection(ENG_COLLECTIONS.errors, {
    limitN: 300,
    timeMode: "ts",
  });
  const { rows: pages } = useFilteredEngCollection(ENG_COLLECTIONS.pages, {
    timeMode: "day",
  });
  const { rows: firestore } = useFilteredEngCollection(
    ENG_COLLECTIONS.firestoreMetrics,
    { timeMode: "day" }
  );
  const { rows: alerts } = useFilteredEngCollection(ENG_COLLECTIONS.alerts, {
    timeMode: "none",
    live: true,
    skipTime: true,
  });
  const { rows: network } = useFilteredEngCollection(ENG_COLLECTIONS.network, {
    timeMode: "day",
  });
  const { rows: healthDocs } = useEngCollection(ENG_COLLECTIONS.health);
  const local = useLocalEngBuffer();

  const now = Date.now();
  const online = devices.filter((d) => devicePresence(clientTsOf(d), now) === "online").length;
  const stale = devices.filter((d) => devicePresence(clientTsOf(d), now) === "stale").length;
  const offline = devices.length - online - stale;
  const errorsInRange = errors.length;
  const slow = firestore.reduce((a, r) => a + (r.slowCount || 0), 0);
  const qCount = firestore.reduce((a, r) => a + (r.queryCount || 0), 0);
  const offlineEvents = network.reduce((a, r) => a + (r.offlineEvents || 0), 0);
  const fleetLatest = healthDocs.find((h) => h.id === "fleet_latest");
  const loadSamples = pages
    .map((p) => p.lastTotalMs)
    .filter((n) => typeof n === "number");
  const p95 =
    loadSamples.length > 0
      ? [...loadSamples].sort((a, b) => a - b)[
          Math.min(
            loadSamples.length - 1,
            Math.ceil(0.95 * (loadSamples.length - 1))
          )
        ]
      : null;

  const health = computeHealthScore({
    errorCount: errorsInRange,
    slowQueryCount: slow,
    queryCount: qCount,
    offlineEvents,
    devicesOnline: online,
    devicesTotal: devices.length || 1,
    memoryPressure: false,
  });

  return (
    <>
      <div className="eng-header">
        <h1>Fleet Health</h1>
        <div className="meta">
          {range.label}
          {filters.department !== "all" ? ` · ${filters.department}` : ""} ·
          project: {getEngProjectId() || "local-only"} · buffer: {local.size}
        </div>
      </div>
      {!configured && (
        <div className="eng-banner">
          Engineering Firebase not configured — showing local buffer + empty remote
          views. Clinical Firebase is never used by this dashboard.
        </div>
      )}
      <div className="eng-grid">
        <div className="eng-card">
          <div className="label">Health score</div>
          <div className={`score-ring ${health.grade}`}>{health.score}</div>
          <div className="sub">Grade {health.grade} · filtered period</div>
        </div>
        <div className="eng-card">
          <div className="label">Devices online</div>
          <div className="value">{online}</div>
          <div className="sub">
            {stale} stale · {offline} offline · {devices.length} matched
          </div>
        </div>
        <div className="eng-card">
          <div className="label">Errors (period)</div>
          <div className="value">{errorsInRange}</div>
        </div>
        <div className="eng-card">
          <div className="label">P95 page load</div>
          <div className="value">{ms(p95)}</div>
        </div>
        <div className="eng-card">
          <div className="label">Open alerts</div>
          <div className="value">
            {alerts.filter((a) => !a.resolvedAt).length}
          </div>
        </div>
        <div className="eng-card">
          <div className="label">Slow queries</div>
          <div className="value">{slow}</div>
          <div className="sub">of {qCount} observed in period</div>
        </div>
      </div>
      <div className="eng-panel">
        <h2>Score factors</h2>
        <pre className="eng-muted" style={{ margin: 0, fontSize: "0.8rem" }}>
          {JSON.stringify(
            {
              live: health.factors,
              fleet_latest: fleetLatest
                ? {
                    score: fleetLatest.score,
                    grade: fleetLatest.grade,
                    errorCount: fleetLatest.errorCount,
                  }
                : null,
              offlineEvents,
              range: range.label,
            },
            null,
            2
          )}
        </pre>
      </div>
      {loading && <EmptyHint configured={configured} loading />}
    </>
  );
}

function Sparkline({ series, valueKey = "avg" }) {
  const vals = (series || []).map((s) => s[valueKey]).filter((n) => typeof n === "number");
  const max = Math.max(1, ...vals);
  return (
    <div className="eng-spark" title={vals.map((v) => Math.round(v)).join(", ")}>
      {(series || []).map((s) => {
        const v = s[valueKey];
        const h = typeof v === "number" ? Math.max(4, (48 * v) / max) : 2;
        return <span key={s.day} style={{ height: h }} title={`${s.day}: ${fmtMs(v)}`} />;
      })}
    </div>
  );
}

export function DevicesPage() {
  const configured = useEngConfigured();
  const { range, filterRows } = useEngFilters();
  const { rows, loading } = useFilteredEngCollection(
    ENG_COLLECTIONS.deviceStatus,
    { timeMode: "none", live: true, skipTime: true }
  );
  const { rows: hourly } = useFilteredEngCollection(
    ENG_COLLECTIONS.heartbeatHourly,
    { timeMode: "none", skipTime: true, limitN: 400 }
  );
  const { rows: pageLoads } = useFilteredEngCollection(
    ENG_COLLECTIONS.pageLoads,
    { limitN: 400, timeMode: "ts" }
  );
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [expandedLoad, setExpandedLoad] = useState(null);

  const hourlyInRange = useMemo(
    () => filterRows(hourly, { skipTime: false }),
    [hourly, filterRows]
  );

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const p = devicePresence(clientTsOf(r));
      if (filter === "all") return true;
      return p === filter;
    });
  }, [rows, filter]);

  const deviceLoads = useMemo(() => {
    if (!selected) return [];
    const id = selected.deviceId || selected.id;
    return [...pageLoads]
      .filter((r) => r.deviceId === id)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, 50);
  }, [pageLoads, selected]);

  const loadStats = useMemo(() => summarizeLoads(deviceLoads), [deviceLoads]);

  return (
    <>
      <div className="eng-header">
        <h1>Devices</h1>
        <div className="meta">device_status · history for {range.label}</div>
      </div>
      <div className="eng-actions">
        {["all", "online", "stale", "offline"].map((f) => (
          <button
            key={f}
            type="button"
            className="eng-btn"
            style={filter === f ? { borderColor: "var(--eng-accent)" } : undefined}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="eng-panel">
        {!rows.length ? (
          <EmptyHint configured={configured} loading={loading} label="No devices reported yet" />
        ) : (
          <table className="eng-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Device</th>
                <th>Page</th>
                <th>Dept</th>
                <th>Listeners</th>
                <th>Heap MB</th>
                <th>Build</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    setSelected(r);
                    setExpandedLoad(null);
                  }}
                >
                  <td>
                    <PresencePill row={r} />
                  </td>
                  <td>
                    <div>{r.label || r.deviceId || r.id}</div>
                    <div className="eng-muted" style={{ fontSize: "0.7rem" }}>
                      {(r.deviceId || r.id || "").slice(0, 8)}…
                    </div>
                  </td>
                  <td>{r.page || "—"}</td>
                  <td>{r.department || "—"}</td>
                  <td>{r.activeListeners ?? "—"}</td>
                  <td>{r.memoryMB ?? "—"}</td>
                  <td>{r.buildId || "—"}</td>
                  <td>{fmtTs(r.clientTs || r.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {selected && (
        <div className="eng-panel">
          <h2>
            Device load history — {selected.label || selected.deviceId || selected.id}
          </h2>
          <div className="eng-grid" style={{ marginBottom: "1rem" }}>
            <div className="eng-card">
              <div className="label">Average load</div>
              <div className="value">{fmtMs(loadStats.avg)}</div>
            </div>
            <div className="eng-card">
              <div className="label">Fastest</div>
              <div className="value">{fmtMs(loadStats.fastest)}</div>
            </div>
            <div className="eng-card">
              <div className="label">Slowest</div>
              <div className="value">{fmtMs(loadStats.slowest)}</div>
            </div>
            <div className="eng-card">
              <div className="label">Samples</div>
              <div className="value">{loadStats.count}</div>
            </div>
          </div>
          <div className="eng-actions" style={{ marginBottom: "0.75rem" }}>
            <button
              type="button"
              className="eng-btn"
              onClick={() =>
                downloadCsv(
                  `eng-device-${(selected.deviceId || selected.id || "x").slice(0, 8)}.csv`,
                  deviceLoads.map((r) => ({
                    time: fmtTsPerf(r.ts),
                    department: r.department,
                    page: r.page,
                    totalMs: r.totalMs,
                    interactiveMs: r.interactiveMs,
                    firstSnapshotMs: r.firstSnapshotMs,
                    buildId: r.buildId,
                    status: loadStatus(r),
                  }))
                )
              }
            >
              Export device history CSV
            </button>
          </div>
          {!deviceLoads.length ? (
            <p className="eng-muted">No page-load samples for this device yet</p>
          ) : (
            <table className="eng-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Department</th>
                  <th>Page</th>
                  <th>Load Time</th>
                  <th>Interactive</th>
                  <th>Snapshot</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {deviceLoads.map((r) => {
                  const st = loadStatus(r);
                  const open = expandedLoad === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr
                        style={{ cursor: "pointer" }}
                        onClick={() => setExpandedLoad(open ? null : r.id)}
                      >
                        <td>{fmtTs(r.ts)}</td>
                        <td>{r.department || "—"}</td>
                        <td>{r.page || "—"}</td>
                        <td>{fmtMs(r.totalMs)}</td>
                        <td>{fmtMs(r.interactiveMs)}</td>
                        <td>{fmtMs(r.firstSnapshotMs)}</td>
                        <td>
                          <span className={`pill ${st === "ok" ? "online" : st === "slow" ? "stale" : "offline"}`}>
                            {st}
                          </span>
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={7}>
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
          <h2>Recent hourly heartbeats</h2>
          <table className="eng-table">
            <thead>
              <tr>
                <th>Hour</th>
                <th>Beats</th>
                <th>Last page</th>
              </tr>
            </thead>
            <tbody>
              {hourlyInRange
                .filter((h) => h.deviceId === (selected.deviceId || selected.id))
                .slice(0, 24)
                .map((h) => (
                  <tr key={h.id}>
                    <td>{h.hour}</td>
                    <td>{h.beats || 0}</td>
                    <td>{h.lastPage || "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <button type="button" className="eng-btn" onClick={() => setSelected(null)}>
            Close
          </button>
        </div>
      )}
    </>
  );
}

export function DepartmentsPage() {
  const configured = useEngConfigured();
  const { range, filters } = useEngFilters();
  const { rows, loading } = useFilteredEngCollection(
    ENG_COLLECTIONS.departments,
    { timeMode: "none", live: true, skipTime: true }
  );
  const { rows: pageLoads } = useFilteredEngCollection(
    ENG_COLLECTIONS.pageLoads,
    { limitN: 400, timeMode: "ts" }
  );
  const { rows: devices } = useFilteredEngCollection(
    ENG_COLLECTIONS.deviceStatus,
    { timeMode: "none", live: true, skipTime: true }
  );

  const cards = useMemo(() => {
    const names = new Set([
      ...rows.map((d) => d.department || d.id),
      ...pageLoads.map((r) => r.department).filter(Boolean),
    ]);
    return [...names]
      .filter((name) => departmentMatches(name, filters.department))
      .sort()
      .map((name) => {
        const agg = rows.find((d) => (d.department || d.id) === name);
        const loads = pageLoads.filter((r) => r.department === name);
        const stats = summarizeLoads(loads);
        const last = [...loads].sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
        const days =
          Math.max(1, Math.ceil((range.endMs - range.startMs) / 86400000));
        const timeline = trendByDay(loads, "totalMs", Math.min(days, 30));
        const active = devices.filter(
          (d) =>
            d.department === name &&
            devicePresence(clientTsOf(d)) === "online"
        );
        const periodAvg = stats.avg;
        const lifetimeAvg =
          agg?.loadCount > 0 ? Math.round(agg.loadSumMs / agg.loadCount) : null;
        return {
          name,
          last,
          stats,
          periodAvg,
          lifetimeAvg,
          timeline,
          active,
          errorCount: agg?.errorCount || 0,
          periodCount: loads.length,
        };
      });
  }, [rows, pageLoads, devices, filters.department, range]);

  return (
    <>
      <div className="eng-header">
        <h1>Departments</h1>
        <div className="meta">stats for {range.label}</div>
      </div>
      <div className="eng-actions" style={{ marginBottom: "0.75rem" }}>
        <button
          type="button"
          className="eng-btn"
          onClick={() =>
            downloadCsv(
              `eng-departments-${dayKeyFromTs()}.csv`,
              cards.map((c) => ({
                department: c.name,
                lastLoad: fmtTsPerf(c.last?.ts),
                lastPage: c.last?.page,
                avgPeriodMs: c.stats.avg,
                fastestMs: c.stats.fastest,
                slowestMs: c.stats.slowest,
                loadsInPeriod: c.periodCount,
                p95Ms: c.stats.p95,
                activeDevices: c.active.length,
              }))
            )
          }
        >
          Export department history CSV
        </button>
      </div>
      {!cards.length && (
        <EmptyHint configured={configured} loading={loading} />
      )}
      <div className="eng-grid">
        {cards.map((c) => (
          <div className="eng-card" key={c.name} style={{ minWidth: 260 }}>
            <div className="label">{c.name}</div>
            <div className="value">{fmtMs(c.periodAvg ?? c.lifetimeAvg)}</div>
            <div className="sub">average load in selected range</div>
            <div className="sub" style={{ marginTop: "0.5rem" }}>
              Last: {c.last ? `${fmtTs(c.last.ts)} · ${c.last.page}` : "—"}
            </div>
            <div className="sub">
              Period: {c.periodCount} loads · fast {fmtMs(c.stats.fastest)} · slow{" "}
              {fmtMs(c.stats.slowest)} · p95 {fmtMs(c.stats.p95)}
            </div>
            <div className="sub">
              Active devices:{" "}
              {c.active.length
                ? c.active.map((d) => d.label || (d.deviceId || "").slice(0, 6)).join(", ")
                : "none"}
            </div>
            <div style={{ marginTop: "0.5rem" }}>
              <div className="sub">Load timeline (range)</div>
              <Sparkline series={c.timeline} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function FirestorePage() {
  const configured = useEngConfigured();
  const { range } = useEngFilters();
  const { rows, loading } = useFilteredEngCollection(
    ENG_COLLECTIONS.firestoreMetrics,
    { timeMode: "day" }
  );
  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => (b.durationMaxMs || 0) - (a.durationMaxMs || 0)
      ),
    [rows]
  );
  const byCol = useMemo(() => {
    const m = {};
    for (const r of rows) {
      const c = r.collection || "unknown";
      if (!m[c]) m[c] = { name: c, value: 0, slow: 0 };
      m[c].value += r.queryCount || 0;
      m[c].slow += r.slowCount || 0;
    }
    return Object.values(m).sort((a, b) => b.value - a.value);
  }, [rows]);

  return (
    <>
      <div className="eng-header">
        <h1>Firestore</h1>
        <div className="meta">observed client metrics · {range.label}</div>
      </div>
      <div className="eng-panel">
        <h2>Queries by collection</h2>
        <BarList items={byCol} />
      </div>
      <div className="eng-panel">
        <h2>Top slow / max duration</h2>
        {!sorted.length ? (
          <EmptyHint configured={configured} loading={loading} />
        ) : (
          <table className="eng-table">
            <thead>
              <tr>
                <th>Collection</th>
                <th>Kind</th>
                <th>Count</th>
                <th>Max</th>
                <th>Slow</th>
                <th>Page</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 40).map((r) => (
                <tr key={r.id}>
                  <td>{r.collection}</td>
                  <td>{r.kind}</td>
                  <td>{r.queryCount || 0}</td>
                  <td>{ms(r.durationMaxMs)}</td>
                  <td>{r.slowCount || 0}</td>
                  <td>{r.page || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export function ListenersPage() {
  const configured = useEngConfigured();
  const { range } = useEngFilters();
  const { rows, loading } = useFilteredEngCollection(
    ENG_COLLECTIONS.listenerDaily,
    { timeMode: "day" }
  );
  const { rows: devices } = useFilteredEngCollection(
    ENG_COLLECTIONS.deviceStatus,
    { timeMode: "none", live: true, skipTime: true }
  );
  return (
    <>
      <div className="eng-header">
        <h1>Listeners</h1>
        <div className="meta">{range.label}</div>
      </div>
      <div className="eng-grid">
        <div className="eng-card">
          <div className="label">Reported open (fleet)</div>
          <div className="value">
            {devices.reduce((a, d) => a + (d.activeListeners || 0), 0)}
          </div>
        </div>
      </div>
      <div className="eng-panel">
        <h2>Daily churn</h2>
        {!rows.length ? (
          <EmptyHint configured={configured} loading={loading} />
        ) : (
          <table className="eng-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Device</th>
                <th>Collection</th>
                <th>Opens</th>
                <th>Closes</th>
                <th>Snapshots</th>
                <th>Reconnects</th>
                <th>Errors</th>
                <th>Last docs</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 80).map((r) => (
                <tr key={r.id}>
                  <td>{r.day}</td>
                  <td>{(r.deviceId || "").slice(0, 8)}</td>
                  <td>{r.collection}</td>
                  <td>{r.opens || 0}</td>
                  <td>{r.closes || 0}</td>
                  <td>{r.snapshots || 0}</td>
                  <td>{r.reconnects || 0}</td>
                  <td>{r.errors || 0}</td>
                  <td>{r.lastDocCount ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export function MemoryPage() {
  const configured = useEngConfigured();
  const { range } = useEngFilters();
  const { rows, loading } = useFilteredEngCollection(ENG_COLLECTIONS.memory, {
    timeMode: "day",
  });
  return (
    <>
      <div className="eng-header">
        <h1>Memory</h1>
        <div className="meta">{range.label}</div>
      </div>
      <div className="eng-panel">
        {!rows.length ? (
          <EmptyHint
            configured={configured}
            loading={loading}
            label="No heap samples (Chromium performance.memory)"
          />
        ) : (
          <table className="eng-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Device</th>
                <th>Used</th>
                <th>Total</th>
                <th>Limit</th>
                <th>SQC entries</th>
                <th>Samples</th>
                <th>Page</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.day}</td>
                  <td>{(r.deviceId || "").slice(0, 8)}</td>
                  <td>
                    {r.usedJSHeapSize != null
                      ? `${(r.usedJSHeapSize / 1048576).toFixed(1)} MB`
                      : "—"}
                  </td>
                  <td>
                    {r.totalJSHeapSize != null
                      ? `${(r.totalJSHeapSize / 1048576).toFixed(1)} MB`
                      : "—"}
                  </td>
                  <td>
                    {r.jsHeapSizeLimit != null
                      ? `${(r.jsHeapSizeLimit / 1048576).toFixed(0)} MB`
                      : "—"}
                  </td>
                  <td>{r.sqcCacheEntries ?? "—"}</td>
                  <td>{r.sampleCount || 0}</td>
                  <td>{r.page || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export function ReactMetricsPage() {
  const configured = useEngConfigured();
  const { range } = useEngFilters();
  const { rows, loading } = useFilteredEngCollection(
    ENG_COLLECTIONS.reactDaily,
    { timeMode: "day" }
  );
  return (
    <>
      <div className="eng-header">
        <h1>React</h1>
        <div className="meta">{range.label}</div>
      </div>
      <div className="eng-panel">
        {!rows.length ? (
          <EmptyHint configured={configured} loading={loading} />
        ) : (
          <table className="eng-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Device</th>
                <th>Long tasks</th>
                <th>Long task ms</th>
                <th>Render samples</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.day}</td>
                  <td>{(r.deviceId || "").slice(0, 8)}</td>
                  <td>{r.longTasks || 0}</td>
                  <td>{ms(r.longTaskDurationSumMs)}</td>
                  <td>{r.renderSamples || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export function PerformancePage() {
  const configured = useEngConfigured();
  const { range } = useEngFilters();
  const { rows, loading } = useFilteredEngCollection(ENG_COLLECTIONS.pages, {
    timeMode: "day",
  });
  const { rows: filteredLoads } = useFilteredEngCollection(
    ENG_COLLECTIONS.pageLoads,
    { limitN: 400, timeMode: "ts" }
  );
  const { rows: memory } = useFilteredEngCollection(ENG_COLLECTIONS.memory, {
    timeMode: "day",
  });
  const { rows: firestore } = useFilteredEngCollection(
    ENG_COLLECTIONS.firestoreMetrics,
    { timeMode: "day" }
  );
  const { rows: reactDaily } = useFilteredEngCollection(
    ENG_COLLECTIONS.reactDaily,
    { timeMode: "day" }
  );

  const days = Math.max(
    1,
    Math.min(30, Math.ceil((range.endMs - range.startMs) / 86400000) + 1)
  );

  const byPage = useMemo(() => {
    const m = {};
    for (const r of rows) {
      const p = r.page || "unknown";
      if (!m[p]) m[p] = { name: p, value: 0, loads: 0 };
      if (r.lastTotalMs != null) {
        m[p].value = Math.max(m[p].value, r.lastTotalMs);
      }
      m[p].loads += r.loadCount || 0;
    }
    return Object.values(m).sort((a, b) => b.value - a.value);
  }, [rows]);

  const loadTrend = useMemo(
    () => trendByDay(filteredLoads, "totalMs", days),
    [filteredLoads, days]
  );
  const snapTrend = useMemo(
    () => trendByDay(filteredLoads, "firstSnapshotMs", days),
    [filteredLoads, days]
  );
  const interactiveTrend = useMemo(
    () => trendByDay(filteredLoads, "interactiveMs", days),
    [filteredLoads, days]
  );

  const memTrend = useMemo(() => {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const key = dayKeyFromTs(range.endMs - i * 86400000);
      const dayRows = memory.filter((r) => r.day === key);
      const heaps = dayRows
        .map((r) =>
          r.usedJSHeapSize != null ? r.usedJSHeapSize / 1048576 : null
        )
        .filter((n) => typeof n === "number");
      out.push({ day: key, avg: avg(heaps) });
    }
    return out;
  }, [memory, days, range.endMs]);

  const fsTrend = useMemo(() => {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const key = dayKeyFromTs(range.endMs - i * 86400000);
      const dayRows = firestore.filter((r) => r.day === key);
      const lat = dayRows
        .map((r) => {
          if (r.avgQueryMs != null) return r.avgQueryMs;
          if (r.durationAvgMs != null) return r.durationAvgMs;
          if (r.queryCount > 0 && r.durationSumMs != null) {
            return r.durationSumMs / r.queryCount;
          }
          return r.durationMaxMs ?? null;
        })
        .filter((n) => typeof n === "number");
      out.push({ day: key, avg: avg(lat) });
    }
    return out;
  }, [firestore, days, range.endMs]);

  const reactTrend = useMemo(() => {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const key = dayKeyFromTs(range.endMs - i * 86400000);
      const dayRows = reactDaily.filter((r) => r.day === key);
      const vals = dayRows
        .map((r) =>
          r.renderSamples > 0 && r.longTaskDurationSumMs != null
            ? r.longTaskDurationSumMs / Math.max(1, r.longTasks || r.renderSamples)
            : r.longTasks
        )
        .filter((n) => typeof n === "number");
      out.push({ day: key, avg: avg(vals) });
    }
    return out;
  }, [reactDaily, days, range.endMs]);

  const overall = useMemo(() => summarizeLoads(filteredLoads), [filteredLoads]);
  const p95Series = useMemo(
    () =>
      loadTrend.map((d) => ({
        day: d.day,
        avg: d.p95,
      })),
    [loadTrend]
  );

  return (
    <>
      <div className="eng-header">
        <h1>Performance</h1>
        <div className="meta">aggregates · trends · {range.label}</div>
      </div>

      <div className="eng-panel eng-form">
        <div className="eng-actions" style={{ alignItems: "flex-end" }}>
          <button
            type="button"
            className="eng-btn"
            onClick={() =>
              downloadCsv(
                `eng-performance-${dayKeyFromTs()}.csv`,
                filteredLoads.map((r) => ({
                  time: fmtTsPerf(r.ts),
                  deviceId: r.deviceId,
                  department: r.department,
                  page: r.page,
                  buildId: r.buildId,
                  totalMs: r.totalMs,
                  firstRenderMs: r.firstRenderMs,
                  firstSnapshotMs: r.firstSnapshotMs,
                  interactiveMs: r.interactiveMs,
                  status: loadStatus(r),
                }))
              )
            }
          >
            Export performance CSV
          </button>
        </div>
      </div>

      <div className="eng-panel">
        <h2>Performance trends</h2>
        <div className="eng-trend-grid">
          <div className="eng-trend-card">
            <div className="label">Average load</div>
            <div className="value">{fmtMs(overall.avg)}</div>
            <Sparkline series={loadTrend} />
          </div>
          <div className="eng-trend-card">
            <div className="label">95th percentile</div>
            <div className="value">{fmtMs(overall.p95)}</div>
            <Sparkline series={p95Series} />
          </div>
          <div className="eng-trend-card">
            <div className="label">Memory (MB)</div>
            <div className="value">
              {memTrend.filter((d) => d.avg != null).slice(-1)[0]?.avg?.toFixed?.(1) ?? "—"}
            </div>
            <Sparkline series={memTrend} />
          </div>
          <div className="eng-trend-card">
            <div className="label">Firestore latency</div>
            <div className="value">
              {fmtMs(fsTrend.filter((d) => d.avg != null).slice(-1)[0]?.avg)}
            </div>
            <Sparkline series={fsTrend} />
          </div>
          <div className="eng-trend-card">
            <div className="label">Snapshot latency</div>
            <div className="value">
              {fmtMs(avg(filteredLoads.map((r) => r.firstSnapshotMs)))}
            </div>
            <Sparkline series={snapTrend} />
          </div>
          <div className="eng-trend-card">
            <div className="label">React / long tasks</div>
            <div className="value">
              {fmtMs(reactTrend.filter((d) => d.avg != null).slice(-1)[0]?.avg)}
            </div>
            <Sparkline series={reactTrend} />
          </div>
          <div className="eng-trend-card">
            <div className="label">Interactive</div>
            <div className="value">
              {fmtMs(avg(filteredLoads.map((r) => r.interactiveMs)))}
            </div>
            <Sparkline series={interactiveTrend} />
          </div>
        </div>
        <p className="eng-muted" style={{ marginTop: "0.75rem" }}>
          Individual loads: Timeline page. Aggregates below reuse eng_pages.
        </p>
      </div>

      <div className="eng-panel">
        <h2>Last / max total load by page</h2>
        <BarList items={byPage} />
      </div>
      <div className="eng-panel">
        <h2>Waterfall means (approx)</h2>
        {!rows.length ? (
          <EmptyHint configured={configured} loading={loading} />
        ) : (
          <table className="eng-table">
            <thead>
              <tr>
                <th>Page</th>
                <th>Loads</th>
                <th>Paint Σ</th>
                <th>Render Σ</th>
                <th>Snapshot Σ</th>
                <th>Interactive Σ</th>
                <th>Last total</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 60).map((r) => (
                <tr key={r.id}>
                  <td>{r.page}</td>
                  <td>{r.loadCount || 0}</td>
                  <td>{ms(r.firstPaintMsSum)}</td>
                  <td>{ms(r.firstRenderMsSum)}</td>
                  <td>{ms(r.firstSnapshotMsSum)}</td>
                  <td>{ms(r.interactiveMsSum)}</td>
                  <td>{ms(r.lastTotalMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export function NetworkPage() {
  const configured = useEngConfigured();
  const { range } = useEngFilters();
  const { rows, loading } = useFilteredEngCollection(ENG_COLLECTIONS.network, {
    timeMode: "day",
  });
  return (
    <>
      <div className="eng-header">
        <h1>Network</h1>
        <div className="meta">{range.label}</div>
      </div>
      <div className="eng-panel">
        {!rows.length ? (
          <EmptyHint configured={configured} loading={loading} />
        ) : (
          <table className="eng-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Device</th>
                <th>Online ev</th>
                <th>Offline ev</th>
                <th>Probes</th>
                <th>Avg RTT</th>
                <th>Last online</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.day}</td>
                  <td>{(r.deviceId || "").slice(0, 8)}</td>
                  <td>{r.onlineEvents || 0}</td>
                  <td>{r.offlineEvents || 0}</td>
                  <td>{r.probeCount || 0}</td>
                  <td>{ms(r.latencyAvgMs)}</td>
                  <td>{String(r.lastOnline)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export function ErrorsPage() {
  const configured = useEngConfigured();
  const { range } = useEngFilters();
  const { rows, loading } = useFilteredEngCollection(ENG_COLLECTIONS.errors, {
    limitN: 300,
    timeMode: "ts",
  });
  const sorted = useMemo(
    () => [...rows].sort((a, b) => (b.ts || 0) - (a.ts || 0)),
    [rows]
  );
  return (
    <>
      <div className="eng-header">
        <h1>Errors</h1>
        <div className="meta">{range.label}</div>
      </div>
      <div className="eng-actions" style={{ marginBottom: "0.75rem" }}>
        <button
          type="button"
          className="eng-btn"
          onClick={() =>
            downloadCsv(
              `eng-errors-${dayKeyFromTs()}.csv`,
              sorted.map((r) => ({
                time: fmtTsPerf(r.ts),
                source: r.source,
                page: r.page,
                department: r.department,
                message: r.message,
                deviceId: r.deviceId,
                buildId: r.buildId,
              }))
            )
          }
        >
          Export errors CSV
        </button>
      </div>
      <div className="eng-panel">
        {!sorted.length ? (
          <EmptyHint configured={configured} loading={loading} label="No errors recorded" />
        ) : (
          <table className="eng-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Source</th>
                <th>Page</th>
                <th>Message</th>
                <th>Device</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id}>
                  <td>{fmtTs(r.ts)}</td>
                  <td>{r.source}</td>
                  <td>{r.page || "—"}</td>
                  <td title={r.stack}>{r.message}</td>
                  <td>{(r.deviceId || "").slice(0, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export function AuditPage() {
  const configured = useEngConfigured();
  const { range } = useEngFilters();
  const { rows, loading } = useFilteredEngCollection(ENG_COLLECTIONS.audit, {
    limitN: 200,
    timeMode: "ts",
  });
  const sorted = useMemo(
    () => [...rows].sort((a, b) => (b.ts || 0) - (a.ts || 0)),
    [rows]
  );
  return (
    <>
      <div className="eng-header">
        <h1>Audit</h1>
        <div className="meta">{range.label}</div>
      </div>
      <div className="eng-panel">
        {!sorted.length ? (
          <EmptyHint configured={configured} loading={loading} />
        ) : (
          <table className="eng-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id}>
                  <td>{fmtTs(r.ts)}</td>
                  <td>{r.actor}</td>
                  <td>{r.action}</td>
                  <td>{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export function BuildsPage() {
  const configured = useEngConfigured();
  const { range } = useEngFilters();
  const { rows, loading } = useFilteredEngCollection(ENG_COLLECTIONS.builds, {
    timeMode: "none",
    live: true,
    skipTime: true,
    ignoreDepartment: true,
  });
  const { rows: pageLoads } = useFilteredEngCollection(
    ENG_COLLECTIONS.pageLoads,
    { limitN: 400, timeMode: "ts" }
  );
  const { rows: memory } = useFilteredEngCollection(ENG_COLLECTIONS.memory, {
    timeMode: "day",
  });
  const { rows: errors } = useFilteredEngCollection(ENG_COLLECTIONS.errors, {
    limitN: 300,
    timeMode: "ts",
  });
  const { rows: devices } = useFilteredEngCollection(
    ENG_COLLECTIONS.deviceStatus,
    { timeMode: "none", live: true, skipTime: true }
  );

  const compared = useMemo(() => {
    const byBuild = {};
    for (const r of pageLoads) {
      const id = r.buildId || "unknown";
      if (!byBuild[id]) byBuild[id] = [];
      byBuild[id].push(r);
    }
    const listFromLoads = Object.keys(byBuild);
    const unique = listFromLoads.length
      ? listFromLoads
      : [...new Set(rows.map((r) => r.buildId || r.id))];
    const enriched = unique.map((buildId) => {
      const loads = byBuild[buildId] || [];
      const stats = summarizeLoads(loads);
      const snapAvg = avg(loads.map((l) => l.firstSnapshotMs));
      const intAvg = avg(loads.map((l) => l.interactiveMs));
      const memRows = memory.filter(
        (m) => m.buildId === buildId || (!m.buildId && loads.some((l) => l.deviceId === m.deviceId))
      );
      const memAvg = avg(
        memRows
          .map((m) =>
            m.usedJSHeapSize != null ? m.usedJSHeapSize / 1048576 : null
          )
          .filter((n) => typeof n === "number")
      );
      const errCount = errors.filter((e) => e.buildId === buildId).length;
      const deviceIds = new Set([
        ...loads.map((l) => l.deviceId).filter(Boolean),
        ...devices.filter((d) => d.buildId === buildId).map((d) => d.deviceId || d.id),
      ]);
      const health =
        errCount > 10 || (stats.avg != null && stats.avg > 4000)
          ? "poor"
          : errCount > 3 || (stats.avg != null && stats.avg > 2500)
            ? "fair"
            : "good";
      const meta = rows.find((r) => (r.buildId || r.id) === buildId);
      return {
        buildId,
        seenCount: meta?.seenCount || deviceIds.size,
        avgLoad: stats.avg,
        avgSnapshot: snapAvg,
        avgInteractive: intAvg,
        memory: memAvg,
        errors: errCount,
        health,
        devices: deviceIds.size,
        lastTs: Math.max(0, ...loads.map((l) => l.ts || 0)),
      };
    });
    return enriched.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0));
  }, [rows, pageLoads, memory, errors, devices]);

  return (
    <>
      <div className="eng-header">
        <h1>Builds</h1>
        <div className="meta">compare within {range.label}</div>
      </div>
      <div className="eng-panel">
        {!compared.length ? (
          <EmptyHint configured={configured} loading={loading} />
        ) : (
          <table className="eng-table">
            <thead>
              <tr>
                <th>Build</th>
                <th>Avg Load</th>
                <th>Avg Snapshot</th>
                <th>Avg Interactive</th>
                <th>Memory</th>
                <th>Errors</th>
                <th>Health</th>
                <th>Devices</th>
                <th>vs prev</th>
              </tr>
            </thead>
            <tbody>
              {compared.map((r, i) => {
                const prev = compared[i + 1];
                const delta =
                  prev?.avgLoad != null && r.avgLoad != null
                    ? r.avgLoad - prev.avgLoad
                    : null;
                const regressed = delta != null && delta > 200;
                const improved = delta != null && delta < -200;
                return (
                  <tr key={r.buildId}>
                    <td>{r.buildId}</td>
                    <td className={regressed ? "eng-regressed" : improved ? "eng-improved" : undefined}>
                      {fmtMs(r.avgLoad)}
                    </td>
                    <td>{fmtMs(r.avgSnapshot)}</td>
                    <td>{fmtMs(r.avgInteractive)}</td>
                    <td>{r.memory != null ? `${r.memory.toFixed(1)} MB` : "—"}</td>
                    <td>{r.errors}</td>
                    <td>
                      <span
                        className={`pill ${
                          r.health === "good"
                            ? "online"
                            : r.health === "fair"
                              ? "stale"
                              : "offline"
                        }`}
                      >
                        {r.health}
                      </span>
                    </td>
                    <td>{r.devices}</td>
                    <td
                      className={
                        regressed ? "eng-regressed" : improved ? "eng-improved" : undefined
                      }
                    >
                      {delta == null
                        ? "—"
                        : `${delta > 0 ? "+" : ""}${Math.round(delta)}ms`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export function SettingsPage() {
  const {
    settings,
    localEnabled,
    configured,
    saveSettings,
    setKillSwitch,
    refresh,
  } = useEngSettings();
  const local = useLocalEngBuffer();
  const [label, setLabel] = useState(getDeviceLabel());
  const [heartbeatSec, setHeartbeatSec] = useState(
    settings?.heartbeatSec ?? 30
  );
  const [slowMs, setSlowMs] = useState(
    settings?.alertThresholds?.slowQueryMs ?? 2000
  );
  const [retentionDays, setRetentionDays] = useState(
    settings?.retentionDays ?? 90
  );
  const [debugSampling, setDebugSampling] = useState(
    !!settings?.debugSampling
  );
  const [opsPin, setOpsPin] = useState(settings?.opsPin || "eng-ops");
  const [opsAllowlist, setOpsAllowlist] = useState(
    Array.isArray(settings?.opsAllowlist)
      ? settings.opsAllowlist.join(",")
      : ""
  );
  const [retentionResult, setRetentionResult] = useState(null);

  return (
    <>
      <div className="eng-header">
        <h1>Settings</h1>
        <div className="meta">this device: {getDeviceId().slice(0, 8)}…</div>
      </div>
      <div className={configured ? "eng-banner ok" : "eng-banner"}>
        {configured
          ? `Connected to Engineering project ${getEngProjectId()}`
          : "Local-only mode — configure eng Firebase to enable durable telemetry"}
      </div>
      <div className="eng-panel eng-form">
        <h2>Local kill switch</h2>
        <p className="eng-muted">
          <code>localStorage.mango.eng.telemetry</code> — clinical continues either way.
        </p>
        <div className="eng-actions">
          <button
            type="button"
            className="eng-btn"
            onClick={() => setKillSwitch(true)}
            disabled={localEnabled}
          >
            Enable telemetry
          </button>
          <button
            type="button"
            className="eng-btn"
            onClick={() => setKillSwitch(false)}
            disabled={!localEnabled}
          >
            Disable telemetry
          </button>
          <button
            type="button"
            className="eng-btn"
            onClick={() => {
              scheduleFlush({ force: true });
              EngTelemetry.heartbeat();
              refresh();
            }}
          >
            Flush now
          </button>
          <button
            type="button"
            className="eng-btn"
            onClick={async () => {
              const { runEngRetention } = await import(
                "../telemetry/retention.js"
              );
              const r = await runEngRetention({ maxDeletes: 200 });
              setRetentionResult(r);
            }}
            disabled={!configured}
          >
            Run retention cleanup
          </button>
        </div>
        {retentionResult && (
          <p className="eng-muted">
            Retention: deleted {retentionResult.deleted} / scanned{" "}
            {retentionResult.scanned}
          </p>
        )}
        <p>
          Status:{" "}
          <strong>{localEnabled ? "enabled" : "disabled"}</strong> · pending
          buffer: {local.size}
        </p>
        <label>
          Device label
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => setDeviceLabel(label)}
          />
        </label>
      </div>
      <div className="eng-panel eng-form">
        <h2>Fleet settings (settings/global)</h2>
        <label>
          Heartbeat seconds
          <input
            type="number"
            value={heartbeatSec}
            onChange={(e) => setHeartbeatSec(Number(e.target.value))}
          />
        </label>
        <label>
          Slow query threshold (ms)
          <input
            type="number"
            value={slowMs}
            onChange={(e) => setSlowMs(Number(e.target.value))}
          />
        </label>
        <label>
          Retention days (daily aggregates)
          <input
            type="number"
            value={retentionDays}
            onChange={(e) => setRetentionDays(Number(e.target.value))}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={debugSampling}
            onChange={(e) => setDebugSampling(e.target.checked)}
          />{" "}
          Debug minute heartbeat history
        </label>
        <label>
          Ops PIN (dashboard gate)
          <input
            type="password"
            value={opsPin}
            onChange={(e) => setOpsPin(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          Ops allowlist (comma-separated loggedUser names)
          <input
            value={opsAllowlist}
            onChange={(e) => setOpsAllowlist(e.target.value)}
            placeholder="admin,eng"
          />
        </label>
        <div className="eng-actions">
          <button
            type="button"
            className="eng-btn"
            onClick={async () => {
              const partial = {
                heartbeatSec,
                retentionDays,
                debugSampling,
                opsPin,
                opsAllowlist: opsAllowlist
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                alertThresholds: {
                  slowQueryMs: slowMs,
                  errorCount1h: 10,
                  p95LoadMs: 30000,
                },
                telemetryEnabled: true,
              };
              await saveSettings(partial);
              const { applyRuntimeSettings } = await import(
                "../telemetry/runtimeSettings.js"
              );
              applyRuntimeSettings({
                heartbeatVisibleMs: heartbeatSec * 1000,
                retentionDays,
                debugSampling,
                slowQueryMs: slowMs,
                alertThresholds: partial.alertThresholds,
              });
            }}
            disabled={!configured}
          >
            Save to Engineering Firebase
          </button>
        </div>
        <pre className="eng-muted" style={{ fontSize: "0.75rem" }}>
          {JSON.stringify(settings, null, 2) || "null"}
        </pre>
      </div>
      <div className="eng-panel">
        <h2>Local buffer (latest)</h2>
        <pre style={{ fontSize: "0.7rem", maxHeight: 240, overflow: "auto" }}>
          {JSON.stringify(local.events, null, 2)}
        </pre>
      </div>
    </>
  );
}
