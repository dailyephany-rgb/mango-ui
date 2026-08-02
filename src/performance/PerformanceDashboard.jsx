import React, { useState, useEffect } from "react";
import { PerformanceProvider, usePerf } from "./PerformanceContext.jsx";
import { loadBand, PAGE_LOAD_SLOW_MS } from "./pageLoadBands.js";
import "./Performance.css";

function ms(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
}

function bytes(n) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function scoreClass(label) {
  if (label === "Excellent") return "score-excellent";
  if (label === "Good") return "score-good";
  if (label === "Needs Attention") return "score-needs";
  return "score-critical";
}

function BarList({ items, maxItems = 8 }) {
  const top = (items || []).slice(0, maxItems);
  const max = Math.max(1, ...top.map((i) => i.value || 0));
  if (!top.length) {
    return (
      <p className="muted">
        No data yet — browse lab pages in this browser session.
      </p>
    );
  }
  return (
    <div>
      {top.map((i) => (
        <div className="bar-row" key={i.name}>
          <span className="name" title={i.name}>
            {i.name}
          </span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${(100 * (i.value || 0)) / max}%` }}
            />
          </div>
          <span className="val">{Math.round(i.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function defaultReplay(e) {
  return [
    { step: "Event", atOffsetMs: 0, detail: e.kind },
    { step: "Page", atOffsetMs: 0, detail: e.page },
    { step: "Detail", atOffsetMs: e.durationMs || 0, detail: e.message },
  ];
}

function IncrementalStats({ p }) {
  const rows = [...(p.filtered?.incrementalSync || p.state.incrementalSync || [])]
    .reverse()
    .slice(0, 50);

  const all = p.filtered?.incrementalSync || p.state.incrementalSync || [];
  const initials = all.filter((r) => r.initial);
  const inc = all.filter((r) => !r.initial && (r.processed || 0) > 0);
  const avgProcessed = inc.length
    ? inc.reduce((a, r) => a + (r.processed || 0), 0) / inc.length
    : 0;
  const avgDuration = all.length
    ? all.reduce((a, r) => a + (r.durationMs || 0), 0) / all.length
    : 0;
  const sumMod = all.reduce((a, r) => a + (r.modified || 0), 0);
  const sumRem = all.reduce((a, r) => a + (r.removed || 0), 0);
  const sumInitialDocs = initials.reduce((a, r) => a + (r.processed || 0), 0);

  return (
    <>
      <table className="perf-table">
        <tbody>
          <tr>
            <td>Initial snapshots</td>
            <td>{initials.length}</td>
          </tr>
          <tr>
            <td>Docs seeded (initial)</td>
            <td>{sumInitialDocs}</td>
          </tr>
          <tr>
            <td>Incremental added</td>
            <td>
              {all
                .filter((r) => !r.initial)
                .reduce((a, r) => a + (r.added || 0), 0)}
            </td>
          </tr>
          <tr>
            <td>Incremental modified</td>
            <td>{sumMod}</td>
          </tr>
          <tr>
            <td>Incremental removed</td>
            <td>{sumRem}</td>
          </tr>
          <tr>
            <td>Avg docs processed / incremental callback</td>
            <td>{avgProcessed.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Avg Map update time</td>
            <td>{ms(avgDuration)}</td>
          </tr>
        </tbody>
      </table>
      <h3>Recent callbacks</h3>
      <table className="perf-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Label</th>
            <th>Kind</th>
            <th>+ / ~ / −</th>
            <th>Processed</th>
            <th>Map size</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.at}-${i}`}>
              <td>{new Date(r.at).toLocaleTimeString()}</td>
              <td>{r.label || "—"}</td>
              <td>{r.initial ? "Initial" : "Incremental"}</td>
              <td>
                {r.added}/{r.modified}/{r.removed}
              </td>
              <td>{r.processed}</td>
              <td>{r.mapSize}</td>
              <td>{ms(r.durationMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function MemoryPanel({ p }) {
  const [storageEst, setStorageEst] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (navigator.storage?.estimate) {
          const est = await navigator.storage.estimate();
          if (!cancelled) setStorageEst(est);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [p.tick]);

  return (
    <div className="perf-panel">
      <h2>Memory</h2>
      <table className="perf-table">
        <tbody>
          <tr>
            <td>JS Heap (used)</td>
            <td>{bytes(p.heap?.usedJSHeapSize)}</td>
          </tr>
          <tr>
            <td>JS Heap (total)</td>
            <td>{bytes(p.heap?.totalJSHeapSize)}</td>
          </tr>
          <tr>
            <td>SessionStorage usage</td>
            <td>{bytes(p.sessionStorageBytes)}</td>
          </tr>
          <tr>
            <td>Perf store size</td>
            <td>{bytes(p.perfStoreBytes)}</td>
          </tr>
          <tr>
            <td>Session cache payloads</td>
            <td>{bytes(p.cachePayload.total)}</td>
          </tr>
          <tr>
            <td>Largest cache payload</td>
            <td>
              {p.cachePayload.largest
                ? `${p.cachePayload.largest.key} (${bytes(
                    p.cachePayload.largest.size
                  )})`
                : "—"}
            </td>
          </tr>
          <tr>
            <td>Storage estimate (incl. IndexedDB)</td>
            <td>
              {storageEst
                ? `${bytes(storageEst.usage)} / ${bytes(storageEst.quota)}`
                : "—"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function DashboardInner() {
  const [tab, setTab] = useState("kpis");
  const p = usePerf();
  const { state, filtered } = p;

  const latestLoads = [...(filtered.pageLoads || [])].reverse().slice(0, 40);
  const events = [...(filtered.events || [])].reverse().slice(0, 80);
  const selectedEvent = events.find((e) => e.id === p.selectedEventId);

  const daysFactor = 30;
  const monthlyReadsEst = p.readsToday * daysFactor;
  const costPer100k = 0.06;
  const monthlyCostEst = (monthlyReadsEst / 100000) * costPer100k;

  const tabs = [
    ["kpis", "KPIs"],
    ["loads", "Page Loads"],
    ["reads", "Reads"],
    ["queries", "Query Board"],
    ["incremental", "Incremental"],
    ["cache", "Cache"],
    ["listeners", "Listeners"],
    ["network", "Network"],
    ["render", "Render"],
    ["memory", "Memory"],
    ["cost", "Cost"],
    ["timeline", "Timeline"],
    ["ranks", "Dept Ranks"],
    ["health", "Health"],
    ["alerts", "Alerts"],
  ];

  return (
    <div className="perf-dash">
      <header className="perf-header">
        <div>
          <h1>Performance &amp; Diagnostics</h1>
          <div className="sub">
            Engineering Command Center — read-only · session metrics · no
            Firestore writes
          </div>
        </div>
        <div className="perf-actions">
          <label className="perf-date">
            From
            <input
              type="date"
              value={p.dateFrom}
              onChange={(e) => p.setDateFrom(e.target.value)}
            />
          </label>
          <label className="perf-date">
            To
            <input
              type="date"
              value={p.dateTo}
              onChange={(e) => p.setDateTo(e.target.value)}
            />
          </label>
          <button type="button" onClick={p.resetDatesToToday}>
            Today
          </button>
          <button type="button" onClick={p.toggleMonitor}>
            Monitor: {p.monitorOn ? "ON" : "OFF"}
          </button>
          <button type="button" onClick={p.exportPdf}>
            Export PDF (EOD Report)
          </button>
          <button type="button" onClick={p.exportJson} title="Raw metrics dump">
            Export JSON
          </button>
          <button type="button" className="danger" onClick={p.clearAll}>
            Clear metrics
          </button>
        </div>
      </header>

      <div className="perf-banner">
        Developers / Admins only. Date filter scopes all charts/tables below
        ({p.dateFrom} → {p.dateTo}). Live session + local cache + Firestore{" "}
        <code>perf_daily</code>
        {p.remoteStatus === "loading"
          ? " (loading archive…)"
          : p.remoteStatus === "error"
            ? ` (archive error: ${p.remoteError || "check rules"})`
            : ` (${p.remoteCount || 0} archived docs)`}
        . Disable:{" "}
        <code>localStorage.setItem(&quot;mango.perf.monitor&quot;,&quot;0&quot;)</code>
        .
        <button type="button" className="linkish" onClick={p.refreshRemote}>
          Refresh archive
        </button>
        {p.fromRollupOnly ? (
          <span>
            {" "}
            Showing archived rollups for this range (no live session samples).
          </span>
        ) : null}
      </div>

      <div className="perf-kpis">
        <div className="perf-kpi">
          <div className="label">Reads (range)</div>
          <div className="value">{p.readsInRange.toLocaleString()}</div>
        </div>
        <div className="perf-kpi">
          <div className="label">Cache Hit %</div>
          <div className="value">{p.cache.hitRate.toFixed(0)}%</div>
        </div>
        <div className="perf-kpi">
          <div className="label">Slow Pages</div>
          <div className="value">
            {
              (filtered.pageLoads || []).filter(
                (l) => (l.totalMs || 0) >= PAGE_LOAD_SLOW_MS
              )
                .length
            }
          </div>
        </div>
        <div className="perf-kpi">
          <div className="label">Worst Query</div>
          <div className="value">{ms(p.queryStats.max)}</div>
        </div>
        <div className="perf-kpi">
          <div className="label">Avg Load</div>
          <div className="value">
            {ms(
              latestLoads.length
                ? latestLoads.reduce((a, b) => a + (b.totalMs || 0), 0) /
                    latestLoads.length
                : null
            )}
          </div>
        </div>
        <div className="perf-kpi">
          <div className="label">Active Listeners</div>
          <div className="value">{p.activeListeners.length}</div>
        </div>
        <div className="perf-kpi">
          <div className="label">Peak Heap</div>
          <div className="value">
            {bytes(
              Math.max(
                0,
                ...(filtered.pageLoads || [])
                  .map((l) => l.heapUsed || 0)
                  .concat([p.heap?.usedJSHeapSize || 0])
              ) || null
            )}
          </div>
        </div>
        <div className="perf-kpi">
          <div className="label">Health</div>
          <div className={`value ${scoreClass(p.health.labels.overall)}`}>
            {p.health.overall} · {p.health.labels.overall}
          </div>
        </div>
      </div>

      <div className="perf-tabs">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "kpis" && (
        <div className="perf-panel">
          <h2>Engineering KPIs</h2>
          <table className="perf-table">
            <tbody>
              <tr>
                <td>Reads in range (measured)</td>
                <td>{p.readsInRange.toLocaleString()}</td>
              </tr>
              <tr>
                <td>Today&apos;s Estimated Writes</td>
                <td className="est">Not instrumented (save paths untouched)</td>
              </tr>
              <tr>
                <td>Cache Hit %</td>
                <td>{p.cache.hitRate.toFixed(1)}%</td>
              </tr>
              <tr>
                <td>Longest Snapshot (docs)</td>
                <td>
                  {Math.max(
                    0,
                    ...(filtered.reads || []).map((r) => r.docCount || 0),
                    0
                  )}
                </td>
              </tr>
              <tr>
                <td>Session Reads (all dates)</td>
                <td>{p.readsSession.toLocaleString()}</td>
              </tr>
              <tr>
                <td>Last Hour Reads (in range)</td>
                <td>{p.readsHour.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === "loads" && (
        <div className="perf-panel">
          <h2>Page Load Performance</h2>
          <p className="muted">
            Green &lt;2s · Yellow 2–30s · Orange 30s–1min · Red ≥1min (1–2min+)
          </p>
          <table className="perf-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Page</th>
                <th>Dept</th>
                <th>Paint</th>
                <th>Render</th>
                <th>Snapshot</th>
                <th>Interactive</th>
                <th>Total</th>
                <th>Band</th>
                <th>Cache</th>
                <th>Docs</th>
              </tr>
            </thead>
            <tbody>
              {latestLoads.map((l, i) => {
                const b = loadBand(l.totalMs);
                return (
                  <tr key={`${l.at}-${i}`}>
                    <td>{new Date(l.at).toLocaleTimeString()}</td>
                    <td>{l.page}</td>
                    <td>{l.department}</td>
                    <td>{ms(l.firstPaintMs)}</td>
                    <td>{ms(l.firstRenderMs)}</td>
                    <td>{ms(l.firstSnapshotMs)}</td>
                    <td>{ms(l.interactiveMs)}</td>
                    <td>{ms(l.totalMs)}</td>
                    <td className={b.cls}>{b.label}</td>
                    <td>{l.cacheHit ? "Hit" : "Miss"}</td>
                    <td>{l.snapshotDocCount ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "reads" && (
        <div className="perf-panel">
          <h2>Firestore Read Analytics</h2>
          <p>
            Range: <strong>{p.readsInRange.toLocaleString()}</strong> · Hour:{" "}
            <strong>{p.readsHour.toLocaleString()}</strong> · Full session:{" "}
            <strong>{p.readsSession.toLocaleString()}</strong>
          </p>
          <h3>By bucket</h3>
          <BarList items={p.readsByBucket} />
          <h3>Top pages</h3>
          <BarList items={p.readsByPage} />
          <h3>Top departments</h3>
          <BarList items={p.readsByDept} />
          <h3>Top collections</h3>
          <BarList items={p.readsByCollection} />
        </div>
      )}

      {tab === "queries" && (
        <div className="perf-panel">
          <h2>Query Leaderboard</h2>
          <div className="perf-actions" style={{ marginBottom: "0.75rem" }}>
            {[
              ["slowest", "Slowest"],
              ["mostCalled", "Most Called"],
              ["largest", "Largest Result"],
              ["highestCost", "Highest Read Cost"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => p.setLeaderSort(id)}
                style={{
                  borderColor: p.leaderSort === id ? "var(--accent)" : undefined,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <table className="perf-table">
            <thead>
              <tr>
                <th>Query</th>
                <th>Avg</th>
                <th>P95</th>
                <th>Max</th>
                <th>Calls</th>
                <th>Avg Docs</th>
                <th>Total Docs</th>
              </tr>
            </thead>
            <tbody>
              {p.leaderboard.slice(0, 40).map((r) => (
                <tr key={r.query}>
                  <td title={r.query}>{r.collection || r.query}</td>
                  <td>{ms(r.avgMs)}</td>
                  <td>{ms(r.p95Ms)}</td>
                  <td>{ms(r.maxMs)}</td>
                  <td>{r.calls}</td>
                  <td>{r.avgDocs.toFixed(0)}</td>
                  <td>{r.totalDocs.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "incremental" && (
        <div className="perf-panel">
          <h2>Incremental Sync (docChanges)</h2>
          <p className="muted">
            Distinguishes initial seed vs added/modified/removed. Client CPU —
            not the same as Cloud billed reads.
          </p>
          <IncrementalStats p={p} />
        </div>
      )}

      {tab === "cache" && (
        <div className="perf-panel">
          <h2>Cache Effectiveness</h2>
          <table className="perf-table">
            <tbody>
              <tr>
                <td>Session hit %</td>
                <td>{p.cache.hitRate.toFixed(1)}%</td>
              </tr>
              <tr>
                <td>Session miss %</td>
                <td>{p.cache.missRate.toFixed(1)}%</td>
              </tr>
              <tr>
                <td>TTL expirations</td>
                <td>{p.cache.expires}</td>
              </tr>
              <tr>
                <td>Avg remaining TTL (on hit)</td>
                <td>{ms(p.cache.avgLifetimeMs)}</td>
              </tr>
              <tr>
                <td>Owner paint (avg)</td>
                <td>{ms(p.cache.avgOwnerPaintMs)}</td>
              </tr>
              <tr>
                <td>Firestore refresh after paint (avg)</td>
                <td>{ms(p.cache.avgOwnerRefreshMs)}</td>
              </tr>
              <tr>
                <td>Avg response improvement</td>
                <td>{ms(p.cache.avgResponseImprovementMs)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === "listeners" && (
        <div className="perf-panel">
          <h2>Active Listener Monitor</h2>
          <table className="perf-table">
            <thead>
              <tr>
                <th>Collection</th>
                <th>Dept</th>
                <th>Page</th>
                <th>Started</th>
                <th>Duration</th>
                <th>State</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {(state.listeners || [])
                .slice()
                .reverse()
                .slice(0, 60)
                .map((l) => {
                  const dur =
                    l.state === "Active"
                      ? Date.now() - (l.startedAt || 0)
                      : l.durationMs || 0;
                  const flags = [];
                  if (l.orphanedHint) flags.push("Orphan?");
                  if (dur > 30 * 60 * 1000) flags.push("Long-running");
                  return (
                    <tr key={l.id}>
                      <td>{l.collection}</td>
                      <td>{l.department}</td>
                      <td>{l.page}</td>
                      <td>
                        {l.startedAt
                          ? new Date(l.startedAt).toLocaleTimeString()
                          : "—"}
                      </td>
                      <td>{ms(dur)}</td>
                      <td>{l.state}</td>
                      <td>{flags.join(", ") || "—"}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "network" && (
        <div className="perf-panel">
          <h2>Network / Query Latency</h2>
          <table className="perf-table">
            <tbody>
              <tr>
                <td>Samples (session)</td>
                <td>{p.queryStats.count}</td>
              </tr>
              <tr>
                <td>Average</td>
                <td className={p.queryStats.avg > 2000 ? "band-red" : ""}>
                  {ms(p.queryStats.avg)}
                </td>
              </tr>
              <tr>
                <td>Median</td>
                <td>{ms(p.queryStats.median)}</td>
              </tr>
              <tr>
                <td>P95</td>
                <td>{ms(p.queryStats.p95)}</td>
              </tr>
              <tr>
                <td>Max</td>
                <td className={p.queryStats.max > 10000 ? "band-red" : ""}>
                  {ms(p.queryStats.max)}
                </td>
              </tr>
              <tr>
                <td>Last hour avg</td>
                <td>{ms(p.queryStatsHour.avg)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === "render" && (
        <div className="perf-panel">
          <h2>Render / Long Tasks</h2>
          <p className="muted">
            Lightweight long-task observer only — lab UIs are not
            per-component instrumented.
          </p>
          <table className="perf-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Duration</th>
                <th>Name</th>
              </tr>
            </thead>
            <tbody>
              {[...(filtered.longTasks || [])]
                .reverse()
                .slice(0, 30)
                .map((t, i) => (
                  <tr key={`${t.at}-${i}`}>
                    <td>{new Date(t.at).toLocaleTimeString()}</td>
                    <td>{ms(t.durationMs)}</td>
                    <td>{t.name}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "memory" && <MemoryPanel p={p} />}

      {tab === "cost" && (
        <div className="perf-panel">
          <h2>Firebase Cost Estimator</h2>
          <p className="est">
            Estimates only — not billing API. Reads = measured doc counts from
            instrumented listeners/gets. Writes not instrumented.
          </p>
          <table className="perf-table">
            <tbody>
              <tr>
                <td>Reads today (measured)</td>
                <td>{p.readsToday.toLocaleString()}</td>
              </tr>
              <tr>
                <td>Est. monthly reads (×30)</td>
                <td>{Math.round(monthlyReadsEst).toLocaleString()}</td>
              </tr>
              <tr>
                <td>Est. monthly read cost (USD)</td>
                <td>~${monthlyCostEst.toFixed(4)}</td>
              </tr>
              <tr>
                <td>Writes</td>
                <td className="est">Unknown / not instrumented</td>
              </tr>
            </tbody>
          </table>
          <h3>Reads by bucket today</h3>
          <BarList items={p.readsByBucket} />
        </div>
      )}

      {tab === "timeline" && (
        <div className="perf-panel">
          <h2>Timeline &amp; Replay</h2>
          <p className="muted">Click an event to inspect the replay chain.</p>
          <table className="perf-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Kind</th>
                <th>Page</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr
                  key={e.id}
                  className="clickable"
                  onClick={() => p.setSelectedEventId(e.id)}
                >
                  <td>{new Date(e.at).toLocaleTimeString()}</td>
                  <td>{e.kind}</td>
                  <td>{e.page}</td>
                  <td>{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {selectedEvent && (
            <div className="replay">
              <strong>Replay — {selectedEvent.page}</strong>
              {(selectedEvent.replay || defaultReplay(selectedEvent)).map(
                (step, i) => (
                  <div className="replay-step" key={i}>
                    <span className="t">{ms(step.atOffsetMs)}</span>
                    <span>
                      <strong>{step.step}</strong> — {step.detail}
                    </span>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}

      {tab === "ranks" && (
        <div className="perf-panel">
          <h2>Department Rankings</h2>
          <table className="perf-table">
            <thead>
              <tr>
                <th>Dept</th>
                <th>Avg Load</th>
                <th>Reads</th>
                <th>Cache Hit %</th>
                <th>Avg Query</th>
                <th>Largest Snap</th>
                <th>Listeners</th>
              </tr>
            </thead>
            <tbody>
              {[...p.rankings]
                .sort((a, b) => b.avgLoadMs - a.avgLoadMs)
                .map((r) => (
                  <tr key={r.department}>
                    <td>{r.department}</td>
                    <td>{ms(r.avgLoadMs)}</td>
                    <td>{r.reads.toLocaleString()}</td>
                    <td>{r.cacheHitPct.toFixed(0)}%</td>
                    <td>{ms(r.avgQueryMs)}</td>
                    <td>{r.largestSnapshot}</td>
                    <td>{r.listenerCount}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "health" && (
        <div className="perf-panel">
          <h2>Daily Health Score</h2>
          <div className="health-grid">
            {Object.entries(p.health.labels).map(([k, label]) => (
              <div className="health-card" key={k}>
                <div className={`score ${scoreClass(label)}`}>
                  {p.health[k]}
                </div>
                <div className="lbl">
                  {k} · {label}
                </div>
              </div>
            ))}
          </div>
          <h3>Last 30 days (localStorage)</h3>
          <table className="perf-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Overall</th>
                <th>Firebase</th>
                <th>Caching</th>
                <th>Performance</th>
              </tr>
            </thead>
            <tbody>
              {[...p.healthHistory].reverse().map((h) => (
                <tr key={h.date}>
                  <td>{h.date}</td>
                  <td>{h.scores?.overall}</td>
                  <td>{h.scores?.firebase}</td>
                  <td>{h.scores?.caching}</td>
                  <td>{h.scores?.performance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "alerts" && (
        <div className="perf-panel">
          <h2>Live Alerts</h2>
          {!p.alerts.length && (
            <p className="muted">
              No alerts — system looks healthy in this session.
            </p>
          )}
          <ul className="alert-list">
            {p.alerts.map((a, i) => (
              <li key={i} className={a.level}>
                ⚠ {a.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function PerformanceDashboard() {
  return (
    <PerformanceProvider>
      <DashboardInner />
    </PerformanceProvider>
  );
}
