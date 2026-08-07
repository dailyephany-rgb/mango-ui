/**
 * Firestore by Component — Engineering observability (observer-only).
 * Page → Module → Collection → Query drill-down, linked via loadId.
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
import {
  FIRST_CLASS_MODULES,
  getModuleDef,
  moduleGroups,
} from "../telemetry/moduleRegistry.js";

/** Rough client-side cost model: doc reads + writes (display only). */
function estCostUsd(docReads, writes) {
  const r = (docReads || 0) * 0.0000006;
  const w = (writes || 0) * 0.0000018;
  const n = r + w;
  if (n <= 0) return "$0";
  if (n < 0.01) return `~$${n.toFixed(4)}`;
  return `~$${n.toFixed(2)}`;
}

/**
 * Reconstruct module breakdown from increment-field load docs.
 * @param {Record<string, any>} doc
 */
export function parseFsLoadDoc(doc) {
  /** @type {Record<string, any>} */
  const modules = {};
  for (const [k, v] of Object.entries(doc || {})) {
    if (!k.startsWith("m__")) continue;
    // m__ModuleId__metric  OR  m__ModuleId__c__collection__metric
    const colMatch = k.match(/^m__(.+?)__c__(.+?)__(.+)$/);
    if (colMatch) {
      const [, mid, col, metric] = colMatch;
      if (!modules[mid]) {
        modules[mid] = { moduleId: mid, collections: {} };
      }
      if (!modules[mid].collections[col]) {
        modules[mid].collections[col] = { collection: col };
      }
      modules[mid].collections[col][metric] = Number(v) || 0;
      continue;
    }
    const modMatch = k.match(/^m__(.+?)__(.+)$/);
    if (modMatch) {
      const [, mid, metric] = modMatch;
      if (metric.startsWith("c__")) continue;
      if (!modules[mid]) {
        modules[mid] = { moduleId: mid, collections: {} };
      }
      modules[mid][metric] = Number(v) || 0;
    }
  }
  return {
    loadId: doc.loadId || doc.id,
    ts: doc.ts,
    page: doc.page,
    deviceId: doc.deviceId,
    department: doc.department,
    estimatedDocReads: doc.estimatedDocReads || 0,
    recentTimeline: Array.isArray(doc.recentTimeline) ? doc.recentTimeline : [],
    recentQueries: Array.isArray(doc.recentQueries) ? doc.recentQueries : [],
    modules: Object.values(modules).map((m) => ({
      ...m,
      collections: Object.values(m.collections || {}),
    })),
  };
}

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
        Engineering Firebase not configured — Firestore-by-Component needs eng_*
        data.
      </p>
    );
  }
  return <p className="eng-muted">{label || "No data yet"}</p>;
}

function Kpi({ label, value, sub }) {
  return (
    <div className="eng-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

function formatConstraints(c) {
  if (!c || typeof c !== "object") return "—";
  const parts = [];
  if (c.path) parts.push(`path=${c.path}`);
  if (Array.isArray(c.where)) {
    for (const w of c.where) {
      parts.push(`where(${w.field} ${w.op} ${JSON.stringify(w.value)})`);
    }
  }
  if (Array.isArray(c.orderBy)) {
    for (const o of c.orderBy) {
      parts.push(`orderBy(${o.field} ${o.dir || "asc"})`);
    }
  }
  if (c.limit != null) parts.push(`limit(${c.limit})`);
  if (c.limitToLast != null) parts.push(`limitToLast(${c.limitToLast})`);
  if (c.startAt) parts.push("startAt(…)");
  if (c.endAt) parts.push("endAt(…)");
  return parts.length ? parts.join(" · ") : "—";
}

export function FirestoreByComponentPage() {
  const configured = useEngConfigured();
  const { range, filters } = useEngFilters();
  const { rows: daily, loading: loadingDaily } = useFilteredEngCollection(
    ENG_COLLECTIONS.firestoreByComponent,
    { limitN: 800, timeMode: "day" }
  );
  const { rows: loadsRaw, loading: loadingLoads } = useFilteredEngCollection(
    ENG_COLLECTIONS.fsComponentLoads,
    { limitN: 400, timeMode: "ts" }
  );

  const [pageOnly, setPageOnly] = useState("");
  const [moduleOnly, setModuleOnly] = useState("");
  const [collectionOnly, setCollectionOnly] = useState("");
  const [selectedModule, setSelectedModule] = useState(null);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [selectedQuery, setSelectedQuery] = useState(null);
  const [selectedLoadId, setSelectedLoadId] = useState(null);
  const [treeGroup, setTreeGroup] = useState("all");

  const loading = loadingDaily || loadingLoads;

  const loads = useMemo(
    () => loadsRaw.map((r) => parseFsLoadDoc(r)),
    [loadsRaw]
  );

  const filteredDaily = useMemo(() => {
    return daily.filter((r) => {
      if (pageOnly && r.page !== pageOnly) return false;
      if (moduleOnly && r.moduleId !== moduleOnly) return false;
      if (collectionOnly && r.collection !== collectionOnly) return false;
      if (selectedModule && r.moduleId !== selectedModule) return false;
      if (selectedCollection && r.collection !== selectedCollection)
        return false;
      return true;
    });
  }, [
    daily,
    pageOnly,
    moduleOnly,
    collectionOnly,
    selectedModule,
    selectedCollection,
  ]);

  const pages = useMemo(
    () => [...new Set(daily.map((r) => r.page).filter(Boolean))].sort(),
    [daily]
  );
  const modules = useMemo(
    () => [...new Set(daily.map((r) => r.moduleId).filter(Boolean))].sort(),
    [daily]
  );
  const collections = useMemo(
    () => [...new Set(daily.map((r) => r.collection).filter(Boolean))].sort(),
    [daily]
  );

  const kpis = useMemo(() => {
    let reads = 0;
    let writes = 0;
    let listeners = 0;
    let queries = 0;
    let slow = 0;
    let durationSum = 0;
    let durationN = 0;
    let docSum = 0;
    let firstSnapSum = 0;
    let firstSnapN = 0;
    let estReads = 0;
    for (const r of filteredDaily) {
      reads += r.reads || 0;
      writes += r.writes || 0;
      listeners += r.listeners || 0;
      queries += r.queryCount || 0;
      slow += r.slowCount || 0;
      durationSum += r.durationSumMs || 0;
      if (r.queryCount) durationN += r.queryCount;
      docSum += r.docCountSum || 0;
      firstSnapSum += r.firstSnapSumMs || 0;
      firstSnapN += r.firstSnapCount || 0;
      estReads += r.estimatedDocReads || 0;
    }
    return {
      reads,
      writes,
      listeners,
      queries,
      slow,
      avgQuery: durationN ? durationSum / durationN : null,
      avgSnap: docSum && queries ? docSum / Math.max(1, reads || queries) : null,
      avgFirstSnap: firstSnapN ? firstSnapSum / firstSnapN : null,
      estReads,
      cost: estCostUsd(estReads, writes),
    };
  }, [filteredDaily]);

  const moduleRollup = useMemo(() => {
    /** @type {Record<string, any>} */
    const m = {};
    for (const r of filteredDaily) {
      const id = r.moduleId || "unknown";
      if (!m[id]) {
        m[id] = {
          moduleId: id,
          page: r.page,
          reads: 0,
          writes: 0,
          listeners: 0,
          queries: 0,
          slow: 0,
          estReads: 0,
          collections: new Set(),
        };
      }
      m[id].reads += r.reads || 0;
      m[id].writes += r.writes || 0;
      m[id].listeners += r.listeners || 0;
      m[id].queries += r.queryCount || 0;
      m[id].slow += r.slowCount || 0;
      m[id].estReads += r.estimatedDocReads || 0;
      if (r.collection) m[id].collections.add(r.collection);
    }
    return Object.values(m)
      .map((x) => ({ ...x, collections: [...x.collections].sort() }))
      .sort((a, b) => b.reads + b.listeners - (a.reads + a.listeners));
  }, [filteredDaily]);

  const collectionTable = useMemo(() => {
    /** @type {Record<string, any>} */
    const m = {};
    for (const r of filteredDaily) {
      const c = r.collection || "unknown";
      if (!m[c]) {
        m[c] = {
          collection: c,
          reads: 0,
          writes: 0,
          listeners: 0,
          queries: 0,
          slow: 0,
          durationSum: 0,
          modules: new Set(),
        };
      }
      m[c].reads += r.reads || 0;
      m[c].writes += r.writes || 0;
      m[c].listeners += r.listeners || 0;
      m[c].queries += r.queryCount || 0;
      m[c].slow += r.slowCount || 0;
      m[c].durationSum += r.durationSumMs || 0;
      if (r.moduleId) m[c].modules.add(r.moduleId);
    }
    return Object.values(m)
      .map((x) => ({
        ...x,
        avgMs: x.queries ? x.durationSum / x.queries : null,
        modules: [...x.modules].sort(),
      }))
      .sort((a, b) => b.reads - a.reads);
  }, [filteredDaily]);

  const queryExplorer = useMemo(() => {
    /** @type {Record<string, any>} */
    const m = {};
    for (const r of filteredDaily) {
      for (const [k, v] of Object.entries(r)) {
        if (!k.startsWith("qk_") || typeof v !== "number") continue;
        const qk = k.slice(3);
        const key = `${r.moduleId}|${r.collection}|${qk}`;
        if (!m[key]) {
          m[key] = {
            queryKey: qk.replace(/_/g, ":"),
            moduleId: r.moduleId,
            collection: r.collection,
            kind: r.kind,
            count: 0,
            slow: r.slowCount || 0,
            avgMs: r.avgQueryMs ?? null,
            constraints: r.constraintsSample || null,
          };
        }
        m[key].count += v;
      }
      // Also fold recentQueries from loads
    }
    for (const load of loads) {
      if (pageOnly && load.page !== pageOnly) continue;
      for (const q of load.recentQueries || []) {
        if (moduleOnly && q.moduleId !== moduleOnly) continue;
        if (selectedModule && q.moduleId !== selectedModule) continue;
        if (collectionOnly && q.collection !== collectionOnly) continue;
        if (selectedCollection && q.collection !== selectedCollection)
          continue;
        const key = `${q.moduleId}|${q.collection}|${q.queryKey}`;
        if (!m[key]) {
          m[key] = {
            queryKey: q.queryKey,
            moduleId: q.moduleId,
            collection: q.collection,
            kind: q.kind,
            count: 0,
            slow: 0,
            avgMs: q.avgMs,
            constraints: q.constraints || null,
          };
        }
        m[key].count += q.count || 0;
        m[key].slow += q.slow || 0;
        if (q.constraints) m[key].constraints = q.constraints;
        if (q.avgMs != null) m[key].avgMs = q.avgMs;
      }
    }
    return Object.values(m).sort((a, b) => b.count - a.count);
  }, [
    filteredDaily,
    loads,
    pageOnly,
    moduleOnly,
    collectionOnly,
    selectedModule,
    selectedCollection,
  ]);

  const filteredLoads = useMemo(() => {
    return [...loads]
      .filter((l) => {
        if (pageOnly && l.page !== pageOnly) return false;
        if (selectedLoadId && l.loadId !== selectedLoadId) return false;
        if (moduleOnly || selectedModule) {
          const want = selectedModule || moduleOnly;
          if (!l.modules.some((m) => m.moduleId === want)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }, [loads, pageOnly, moduleOnly, selectedModule, selectedLoadId]);

  const groups = useMemo(() => moduleGroups(), []);

  const treePages = useMemo(() => {
    /** page → modules → collections */
    const tree = {};
    for (const r of daily) {
      if (pageOnly && r.page !== pageOnly) continue;
      if (moduleOnly && r.moduleId !== moduleOnly) continue;
      const page = r.page || "unknown";
      const mid = r.moduleId || "unknown";
      const def = getModuleDef(mid);
      if (treeGroup !== "all" && def?.group !== treeGroup) continue;
      if (!tree[page]) tree[page] = {};
      if (!tree[page][mid]) {
        tree[page][mid] = {
          reads: 0,
          writes: 0,
          listeners: 0,
          collections: {},
        };
      }
      const node = tree[page][mid];
      node.reads += r.reads || 0;
      node.writes += r.writes || 0;
      node.listeners += r.listeners || 0;
      const c = r.collection || "unknown";
      if (!node.collections[c]) {
        node.collections[c] = { reads: 0, writes: 0, listeners: 0 };
      }
      node.collections[c].reads += r.reads || 0;
      node.collections[c].writes += r.writes || 0;
      node.collections[c].listeners += r.listeners || 0;
    }
    return tree;
  }, [daily, pageOnly, moduleOnly, treeGroup]);

  return (
    <>
      <div className="eng-header">
        <h1>Firestore by Component</h1>
        <div className="meta">
          observer-only · page → module → collection → query · {range.label}
          {filters.department !== "all" ? ` · ${filters.department}` : ""}
        </div>
      </div>

      <div className="eng-panel eng-form">
        <div className="eng-actions" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
          <label>
            Page
            <select
              value={pageOnly}
              onChange={(e) => {
                setPageOnly(e.target.value);
                setSelectedModule(null);
                setSelectedCollection(null);
              }}
            >
              <option value="">All pages</option>
              {pages.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label>
            Module
            <select
              value={moduleOnly}
              onChange={(e) => {
                setModuleOnly(e.target.value);
                setSelectedModule(e.target.value || null);
              }}
            >
              <option value="">All modules</option>
              {modules.map((m) => (
                <option key={m} value={m}>
                  {getModuleDef(m)?.label || m}
                </option>
              ))}
            </select>
          </label>
          <label>
            Collection
            <select
              value={collectionOnly}
              onChange={(e) => {
                setCollectionOnly(e.target.value);
                setSelectedCollection(e.target.value || null);
              }}
            >
              <option value="">All collections</option>
              {collections.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Module group
            <select
              value={treeGroup}
              onChange={(e) => setTreeGroup(e.target.value)}
            >
              <option value="all">All groups</option>
              {Object.keys(groups).map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="eng-btn"
            onClick={() => {
              setPageOnly("");
              setModuleOnly("");
              setCollectionOnly("");
              setSelectedModule(null);
              setSelectedCollection(null);
              setSelectedQuery(null);
              setSelectedLoadId(null);
            }}
          >
            Clear drill-down
          </button>
          <button
            type="button"
            className="eng-btn"
            onClick={() => {
              downloadCsv(
                `eng-fs-by-component-${dayKeyFromTs()}.csv`,
                filteredDaily.map((r) => ({
                  day: r.day,
                  deviceId: r.deviceId,
                  page: r.page,
                  moduleId: r.moduleId,
                  collection: r.collection,
                  kind: r.kind,
                  reads: r.reads,
                  writes: r.writes,
                  listeners: r.listeners,
                  queries: r.queryCount,
                  slow: r.slowCount,
                  avgMs: r.avgQueryMs,
                  estDocReads: r.estimatedDocReads,
                }))
              );
            }}
          >
            Export CSV
          </button>
        </div>
        <p className="eng-muted" style={{ margin: "0.5rem 0 0", fontSize: "0.75rem" }}>
          Linked via loadId to Timeline · Components · FS loads. Shared hooks
          attributed to the mounting module. Multi-owner collections show
          contribution by module. React/Memory join via loadId when samples
          include it (schema v2).
        </p>
      </div>

      <div className="eng-grid">
        <Kpi label="Reads" value={kpis.reads} />
        <Kpi label="Writes" value={kpis.writes} />
        <Kpi label="Listeners" value={kpis.listeners} sub="opens" />
        <Kpi label="Queries" value={kpis.queries} />
        <Kpi label="Slow queries" value={kpis.slow} />
        <Kpi label="Avg snapshot docs" value={kpis.avgSnap != null ? Math.round(kpis.avgSnap) : "—"} />
        <Kpi label="Avg query time" value={fmtMs(kpis.avgQuery)} />
        <Kpi label="Avg first snapshot" value={fmtMs(kpis.avgFirstSnap)} />
        <Kpi
          label="Est. Firestore cost"
          value={kpis.cost}
          sub={`${kpis.estReads} doc reads`}
        />
      </div>

      <div className="eng-panel">
        <h2>Module tree</h2>
        {!Object.keys(treePages).length ? (
          <Empty
            configured={configured}
            loading={loading}
            label="No module activity in range — open a clinical page with eng telemetry on"
          />
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {Object.entries(treePages)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([page, mods]) => (
                <div
                  key={page}
                  style={{
                    border: "1px solid var(--eng-border)",
                    borderRadius: 8,
                    padding: "0.75rem 1rem",
                  }}
                >
                  <button
                    type="button"
                    className="eng-btn"
                    style={{ marginBottom: "0.5rem" }}
                    onClick={() => {
                      setPageOnly(page);
                      setSelectedModule(null);
                      setSelectedCollection(null);
                    }}
                  >
                    Page · {page}
                  </button>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                    {Object.entries(mods)
                      .sort((a, b) => b[1].reads - a[1].reads)
                      .map(([mid, node]) => (
                        <li key={mid} style={{ marginBottom: "0.35rem" }}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedModule(mid);
                              setModuleOnly(mid);
                              setSelectedCollection(null);
                            }}
                            style={{
                              background: "transparent",
                              border: "none",
                              color:
                                selectedModule === mid
                                  ? "var(--eng-accent, #7dd3fc)"
                                  : "inherit",
                              cursor: "pointer",
                              fontWeight: 600,
                              padding: 0,
                            }}
                          >
                            {getModuleDef(mid)?.label || mid}
                          </button>
                          <span className="eng-muted" style={{ marginLeft: 8 }}>
                            r{node.reads} · w{node.writes} · L{node.listeners}
                          </span>
                          <ul style={{ margin: "0.25rem 0", paddingLeft: "1.1rem" }}>
                            {Object.entries(node.collections)
                              .sort((a, b) => b[1].reads - a[1].reads)
                              .map(([cname, c]) => (
                                <li key={cname}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedModule(mid);
                                      setModuleOnly(mid);
                                      setSelectedCollection(cname);
                                      setCollectionOnly(cname);
                                    }}
                                    style={{
                                      background: "transparent",
                                      border: "none",
                                      color:
                                        selectedCollection === cname &&
                                        selectedModule === mid
                                          ? "var(--eng-accent, #7dd3fc)"
                                          : "var(--eng-muted)",
                                      cursor: "pointer",
                                      fontFamily: "var(--eng-mono)",
                                      fontSize: "0.8rem",
                                      padding: 0,
                                    }}
                                  >
                                    {cname}
                                  </button>
                                  <span className="eng-muted" style={{ marginLeft: 6, fontSize: "0.75rem" }}>
                                    r{c.reads} · w{c.writes} · L{c.listeners}
                                  </span>
                                </li>
                              ))}
                          </ul>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="eng-panel">
        <h2>Modules (ranked)</h2>
        {!moduleRollup.length ? (
          <Empty configured={configured} loading={loading} />
        ) : (
          <table className="eng-table">
            <thead>
              <tr>
                <th>Module</th>
                <th>Group</th>
                <th>Page</th>
                <th>Reads</th>
                <th>Writes</th>
                <th>Listeners</th>
                <th>Queries</th>
                <th>Slow</th>
                <th>Est. reads</th>
                <th>Collections</th>
              </tr>
            </thead>
            <tbody>
              {moduleRollup.slice(0, 60).map((m) => (
                <tr
                  key={m.moduleId}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    setSelectedModule(m.moduleId);
                    setModuleOnly(m.moduleId);
                  }}
                >
                  <td>{getModuleDef(m.moduleId)?.label || m.moduleId}</td>
                  <td>{getModuleDef(m.moduleId)?.group || "—"}</td>
                  <td>{m.page || "—"}</td>
                  <td>{m.reads}</td>
                  <td>{m.writes}</td>
                  <td>{m.listeners}</td>
                  <td>{m.queries}</td>
                  <td>{m.slow}</td>
                  <td>{m.estReads}</td>
                  <td style={{ fontSize: "0.75rem" }}>
                    {m.collections.slice(0, 6).join(", ")}
                    {m.collections.length > 6 ? "…" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="eng-panel">
        <h2>Collections</h2>
        <p className="eng-muted" style={{ fontSize: "0.75rem" }}>
          Multi-owner collections list contributing modules (never exclusive ownership).
        </p>
        {!collectionTable.length ? (
          <Empty configured={configured} loading={loading} />
        ) : (
          <table className="eng-table">
            <thead>
              <tr>
                <th>Collection</th>
                <th>Reads</th>
                <th>Writes</th>
                <th>Listeners</th>
                <th>Queries</th>
                <th>Avg time</th>
                <th>Slow</th>
                <th>Contributing modules</th>
              </tr>
            </thead>
            <tbody>
              {collectionTable.slice(0, 50).map((c) => (
                <tr
                  key={c.collection}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    setSelectedCollection(c.collection);
                    setCollectionOnly(c.collection);
                  }}
                >
                  <td>{c.collection}</td>
                  <td>{c.reads}</td>
                  <td>{c.writes}</td>
                  <td>{c.listeners}</td>
                  <td>{c.queries}</td>
                  <td>{fmtMs(c.avgMs)}</td>
                  <td>{c.slow}</td>
                  <td style={{ fontSize: "0.75rem" }}>
                    {c.modules.slice(0, 8).join(", ")}
                    {c.modules.length > 8 ? "…" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="eng-panel">
        <h2>Query explorer</h2>
        <p className="eng-muted" style={{ fontSize: "0.75rem" }}>
          Read-only inspection of executed query shapes (where / orderBy / limit when
          available). Does not alter clinical queries.
        </p>
        {!queryExplorer.length ? (
          <Empty configured={configured} loading={loading} label="No query keys yet" />
        ) : (
          <table className="eng-table">
            <thead>
              <tr>
                <th>Query</th>
                <th>Module</th>
                <th>Collection</th>
                <th>Kind</th>
                <th>Count</th>
                <th>Avg</th>
                <th>Slow</th>
                <th>Constraints</th>
              </tr>
            </thead>
            <tbody>
              {queryExplorer.slice(0, 60).map((q) => {
                const id = `${q.moduleId}|${q.queryKey}`;
                const open = selectedQuery === id;
                return (
                  <React.Fragment key={id}>
                    <tr
                      style={{ cursor: "pointer" }}
                      onClick={() => setSelectedQuery(open ? null : id)}
                    >
                      <td style={{ fontFamily: "var(--eng-mono)", fontSize: "0.75rem" }}>
                        {q.queryKey}
                      </td>
                      <td>{q.moduleId}</td>
                      <td>{q.collection}</td>
                      <td>{q.kind || "—"}</td>
                      <td>{q.count}</td>
                      <td>{fmtMs(q.avgMs)}</td>
                      <td>{q.slow || 0}</td>
                      <td style={{ fontSize: "0.7rem", maxWidth: 280 }}>
                        {formatConstraints(q.constraints).slice(0, 120)}
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={8}>
                          <pre
                            style={{
                              margin: 0,
                              whiteSpace: "pre-wrap",
                              fontSize: "0.75rem",
                            }}
                          >
                            {JSON.stringify(
                              {
                                queryKey: q.queryKey,
                                moduleId: q.moduleId,
                                collection: q.collection,
                                kind: q.kind,
                                constraints: q.constraints,
                              },
                              null,
                              2
                            )}
                          </pre>
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
        <h2>Performance timeline (by loadId)</h2>
        <p className="eng-muted" style={{ fontSize: "0.75rem" }}>
          Same loadId as Component Timeline / Page Timeline. Ranked by estimated doc
          reads (cost proxy).
        </p>
        {!filteredLoads.length ? (
          <Empty
            configured={configured}
            loading={loading}
            label="No per-load Firestore breakdowns yet"
          />
        ) : (
          <table className="eng-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Device</th>
                <th>Page</th>
                <th>Load ID</th>
                <th>Modules</th>
                <th>Est. reads</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {[...filteredLoads]
                .sort(
                  (a, b) =>
                    (b.estimatedDocReads || 0) - (a.estimatedDocReads || 0)
                )
                .slice(0, 80)
                .map((l) => {
                  const open = selectedLoadId === l.loadId;
                  const writes = l.modules.reduce(
                    (s, m) => s + (m.writes || 0),
                    0
                  );
                  return (
                    <React.Fragment key={l.loadId}>
                      <tr
                        style={{ cursor: "pointer" }}
                        onClick={() =>
                          setSelectedLoadId(open ? null : l.loadId)
                        }
                      >
                        <td>{fmtTs(l.ts)}</td>
                        <td>
                          <DeviceName id={l.deviceId} />
                        </td>
                        <td>{l.page || "—"}</td>
                        <td
                          style={{
                            fontFamily: "var(--eng-mono)",
                            fontSize: "0.7rem",
                          }}
                        >
                          {l.loadId}
                        </td>
                        <td>{l.modules.length}</td>
                        <td>{l.estimatedDocReads || 0}</td>
                        <td>{estCostUsd(l.estimatedDocReads, writes)}</td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={7}>
                            <div style={{ display: "grid", gap: "0.75rem" }}>
                              <div>
                                <strong>Modules in this load</strong>
                                <table className="eng-table">
                                  <thead>
                                    <tr>
                                      <th>Module</th>
                                      <th>Reads</th>
                                      <th>Writes</th>
                                      <th>Listeners</th>
                                      <th>Slow</th>
                                      <th>Est. reads</th>
                                      <th>Collections</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {l.modules
                                      .sort(
                                        (a, b) =>
                                          (b.estimatedDocReads || 0) -
                                          (a.estimatedDocReads || 0)
                                      )
                                      .map((m) => (
                                        <tr key={m.moduleId}>
                                          <td>{m.moduleId}</td>
                                          <td>{m.reads || 0}</td>
                                          <td>{m.writes || 0}</td>
                                          <td>{m.listeners || 0}</td>
                                          <td>{m.slow || 0}</td>
                                          <td>{m.estimatedDocReads || 0}</td>
                                          <td style={{ fontSize: "0.75rem" }}>
                                            {(m.collections || [])
                                              .map((c) => c.collection)
                                              .join(", ")}
                                          </td>
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
                              </div>
                              {!!l.recentTimeline?.length && (
                                <div>
                                  <strong>Recent Firestore events</strong>
                                  <table className="eng-table">
                                    <thead>
                                      <tr>
                                        <th>ts</th>
                                        <th>Module</th>
                                        <th>Collection</th>
                                        <th>Op</th>
                                        <th>ms</th>
                                        <th>docs</th>
                                        <th>slow</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {l.recentTimeline.map((e, i) => (
                                        <tr key={i}>
                                          <td>{fmtTs(e.ts)}</td>
                                          <td>{e.moduleId}</td>
                                          <td>{e.collection}</td>
                                          <td>{e.operation}</td>
                                          <td>{fmtMs(e.durationMs)}</td>
                                          <td>{e.docCount ?? "—"}</td>
                                          <td>{e.slow ? "yes" : ""}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
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

      <div className="eng-panel">
        <h2>Registry (first-class modules)</h2>
        <p className="eng-muted" style={{ fontSize: "0.75rem" }}>
          {FIRST_CLASS_MODULES.length} modules · presentational UI is never a module ·
          shared hooks attribute to the mounter
        </p>
      </div>
    </>
  );
}

export default FirestoreByComponentPage;
