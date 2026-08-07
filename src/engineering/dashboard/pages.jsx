/**
 * Engineering Dashboard page components (EDS §13).
 * Reads Engineering Firebase only — never clinical db.
 */

import React, { useMemo, useState } from "react";
import {
  useEngCollection,
  useEngConfigured,
  useLocalEngBuffer,
  useEngSettings,
  ENG_COLLECTIONS,
} from "./useEngData.js";
import { devicePresence, computeHealthScore } from "../health/scores.js";
import { getDeviceId, setDeviceLabel, getDeviceLabel } from "../telemetry/deviceId.js";
import { EngTelemetry } from "../telemetry/EngTelemetry.js";
import { scheduleFlush } from "../telemetry/flush.js";
import { getEngProjectId } from "../firebaseEngConfig.js";

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
  const { rows: devices, loading } = useEngCollection(ENG_COLLECTIONS.deviceStatus);
  const { rows: errors } = useEngCollection(ENG_COLLECTIONS.errors, {
    limitN: 100,
  });
  const { rows: pages } = useEngCollection(ENG_COLLECTIONS.pages);
  const { rows: firestore } = useEngCollection(ENG_COLLECTIONS.firestoreMetrics);
  const { rows: alerts } = useEngCollection(ENG_COLLECTIONS.alerts);
  const { rows: network } = useEngCollection(ENG_COLLECTIONS.network);
  const { rows: healthDocs } = useEngCollection(ENG_COLLECTIONS.health);
  const local = useLocalEngBuffer();

  const now = Date.now();
  const online = devices.filter((d) => devicePresence(clientTsOf(d), now) === "online").length;
  const stale = devices.filter((d) => devicePresence(clientTsOf(d), now) === "stale").length;
  const offline = devices.length - online - stale;
  const hourAgo = now - 3600_000;
  const errors1h = errors.filter((e) => (e.ts || 0) >= hourAgo).length;
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
    errorCount: errors1h,
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
          <div className="sub">Grade {health.grade}</div>
        </div>
        <div className="eng-card">
          <div className="label">Devices online</div>
          <div className="value">{online}</div>
          <div className="sub">
            {stale} stale · {offline} offline · {devices.length} total
          </div>
        </div>
        <div className="eng-card">
          <div className="label">Errors (1h)</div>
          <div className="value">{errors1h}</div>
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
          <div className="sub">of {qCount} observed</div>
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

export function DevicesPage() {
  const configured = useEngConfigured();
  const { rows, loading } = useEngCollection(ENG_COLLECTIONS.deviceStatus);
  const { rows: hourly } = useEngCollection(ENG_COLLECTIONS.heartbeatHourly);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const p = devicePresence(clientTsOf(r));
      if (filter === "all") return true;
      return p === filter;
    });
  }, [rows, filter]);

  return (
    <>
      <div className="eng-header">
        <h1>Devices</h1>
        <div className="meta">device_status live board</div>
      </div>
      <div className="eng-actions">
        {["all", "online", "stale", "offline"].map((f) => (
          <button
            key={f}
            type="button"
            className={filter === f ? "eng-btn" : "eng-btn"}
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
                  onClick={() => setSelected(r)}
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
          <h2>Device detail</h2>
          <pre style={{ fontSize: "0.75rem", overflow: "auto" }}>
            {JSON.stringify(
              {
                ...selected,
                lastSeenAt: undefined,
              },
              null,
              2
            )}
          </pre>
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
              {hourly
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
  const { rows, loading } = useEngCollection(ENG_COLLECTIONS.departments);
  return (
    <>
      <div className="eng-header">
        <h1>Departments</h1>
      </div>
      <div className="eng-grid">
        {!rows.length && (
          <EmptyHint configured={configured} loading={loading} />
        )}
        {rows.map((d) => {
          const avg =
            d.loadCount > 0 ? Math.round(d.loadSumMs / d.loadCount) : null;
          return (
            <div className="eng-card" key={d.id}>
              <div className="label">{d.department || d.id}</div>
              <div className="value">{ms(avg)}</div>
              <div className="sub">
                errors {d.errorCount || 0} · listener events {d.listenerEvents || 0}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function FirestorePage() {
  const configured = useEngConfigured();
  const { rows, loading } = useEngCollection(ENG_COLLECTIONS.firestoreMetrics);
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
        <div className="meta">observed client metrics (not billing)</div>
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
  const { rows, loading } = useEngCollection(ENG_COLLECTIONS.listenerDaily);
  const { rows: devices } = useEngCollection(ENG_COLLECTIONS.deviceStatus);
  return (
    <>
      <div className="eng-header">
        <h1>Listeners</h1>
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
  const { rows, loading } = useEngCollection(ENG_COLLECTIONS.memory);
  return (
    <>
      <div className="eng-header">
        <h1>Memory</h1>
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
  const { rows, loading } = useEngCollection(ENG_COLLECTIONS.reactDaily);
  return (
    <>
      <div className="eng-header">
        <h1>React</h1>
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
  const { rows, loading } = useEngCollection(ENG_COLLECTIONS.pages);
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

  return (
    <>
      <div className="eng-header">
        <h1>Performance</h1>
        <div className="meta">page load aggregates</div>
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
  const { rows, loading } = useEngCollection(ENG_COLLECTIONS.network);
  return (
    <>
      <div className="eng-header">
        <h1>Network</h1>
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
  const { rows, loading } = useEngCollection(ENG_COLLECTIONS.errors, {
    limitN: 150,
  });
  const sorted = useMemo(
    () => [...rows].sort((a, b) => (b.ts || 0) - (a.ts || 0)),
    [rows]
  );
  return (
    <>
      <div className="eng-header">
        <h1>Errors</h1>
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
  const { rows, loading } = useEngCollection(ENG_COLLECTIONS.audit, {
    limitN: 100,
  });
  const sorted = useMemo(
    () => [...rows].sort((a, b) => (b.ts || 0) - (a.ts || 0)),
    [rows]
  );
  return (
    <>
      <div className="eng-header">
        <h1>Audit</h1>
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
  const { rows, loading } = useEngCollection(ENG_COLLECTIONS.builds);
  return (
    <>
      <div className="eng-header">
        <h1>Builds</h1>
      </div>
      <div className="eng-panel">
        {!rows.length ? (
          <EmptyHint configured={configured} loading={loading} />
        ) : (
          <table className="eng-table">
            <thead>
              <tr>
                <th>Build</th>
                <th>Seen</th>
                <th>Last device</th>
                <th>UA</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.buildId || r.id}</td>
                  <td>{r.seenCount || 0}</td>
                  <td>{(r.lastDeviceId || "").slice(0, 8)}</td>
                  <td className="eng-muted" style={{ fontSize: "0.7rem" }}>
                    {(r.userAgent || "").slice(0, 80)}
                  </td>
                </tr>
              ))}
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
