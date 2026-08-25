/**
 * Hang Diagnosis — join hung page loads with FS-by-load, components, errors.
 * Observer-only. Does not change clinical listeners or queries.
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
  downloadCsv,
  dayKeyFromTs,
} from "./perfViews.js";
import { LoadIdCell } from "./LoadIdCell.jsx";
import { WaterfallPanel } from "./WaterfallPanel.jsx";
import { parseFsLoadDoc } from "./FirestoreByComponentPage.jsx";
import {
  CAUSE_LABELS,
  causeCounts,
  diagnoseHungLoad,
  isDiagnosableHang,
} from "./diagnoseHungLoad.js";

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
        Engineering Firebase not configured — hang diagnosis needs eng_* data.
      </p>
    );
  }
  return <p className="eng-muted">{label || "No hung loads in this range"}</p>;
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

function loadKey(row) {
  return String(row.loadId || row.id || "");
}

export function HangDiagnosisPage() {
  const configured = useEngConfigured();
  const { range } = useEngFilters();
  const { rows: loads, loading } = useFilteredEngCollection(
    ENG_COLLECTIONS.pageLoads,
    { limitN: 400, timeMode: "ts" }
  );
  const { rows: componentsRows } = useFilteredEngCollection(
    ENG_COLLECTIONS.components,
    { limitN: 400, timeMode: "ts" }
  );
  const { rows: fsRaw } = useFilteredEngCollection(
    ENG_COLLECTIONS.fsComponentLoads,
    { limitN: 400, timeMode: "ts" }
  );
  const { rows: errors } = useFilteredEngCollection(ENG_COLLECTIONS.errors, {
    limitN: 300,
    timeMode: "ts",
  });

  const [includeIncomplete, setIncludeIncomplete] = useState(false);
  const [causeOnly, setCauseOnly] = useState("");
  const [expanded, setExpanded] = useState(null);

  const fsByLoad = useMemo(() => {
    /** @type {Map<string, ReturnType<typeof parseFsLoadDoc>>} */
    const m = new Map();
    for (const d of fsRaw) {
      const parsed = parseFsLoadDoc(d);
      const id = loadKey(parsed);
      if (id) m.set(id, parsed);
    }
    return m;
  }, [fsRaw]);

  const compsByLoad = useMemo(() => {
    /** @type {Map<string, object>} */
    const m = new Map();
    for (const d of componentsRows) {
      const id = loadKey(d);
      if (id) m.set(id, d);
    }
    return m;
  }, [componentsRows]);

  const diagnosed = useMemo(() => {
    const rows = [];
    for (const load of loads) {
      if (!isDiagnosableHang(load, { includeIncomplete })) continue;
      const id = loadKey(load);
      const diagnosis = diagnoseHungLoad({
        load,
        fsLoad: fsByLoad.get(id) || null,
        componentsDoc: compsByLoad.get(id) || null,
        errors,
      });
      rows.push({ load, diagnosis });
    }
    rows.sort((a, b) => (b.load.ts || 0) - (a.load.ts || 0));
    return rows;
  }, [loads, includeIncomplete, fsByLoad, compsByLoad, errors]);

  const filtered = useMemo(() => {
    if (!causeOnly) return diagnosed;
    return diagnosed.filter((r) => r.diagnosis.cause === causeOnly);
  }, [diagnosed, causeOnly]);

  const counts = useMemo(() => causeCounts(diagnosed), [diagnosed]);

  return (
    <>
      <div className="eng-header">
        <h1>Hang Diagnosis</h1>
        <div className="meta">{range.label}</div>
      </div>
      <p className="eng-muted" style={{ fontSize: "0.8rem", maxWidth: 72 * 16 }}>
        Hung Timeline rows joined to the same Load ID on Components, FS by
        Component (per-load timeline / queries), and Errors. Daily FS aggregates
        cannot replace a missing per-load FS doc. This tab does not change
        clinical Firestore listens.
      </p>

      <div className="eng-grid" style={{ marginTop: "0.75rem" }}>
        <Kpi label="Hung loads" value={diagnosed.length} sub={range.label} />
        {Object.entries(CAUSE_LABELS).map(([id, label]) =>
          counts[id] ? (
            <Kpi
              key={id}
              label={id.replace(/_/g, " ")}
              value={counts[id]}
              sub={label.length > 72 ? `${label.slice(0, 70)}…` : label}
            />
          ) : null
        )}
      </div>

      <div className="eng-actions" style={{ margin: "0.75rem 0" }}>
        <label className="eng-muted" style={{ marginRight: "1rem" }}>
          <input
            type="checkbox"
            checked={includeIncomplete}
            onChange={(e) => setIncludeIncomplete(e.target.checked)}
          />{" "}
          Include incompletes (left before snapshot)
        </label>
        <label className="eng-muted" style={{ marginRight: "1rem" }}>
          Cause{" "}
          <select
            value={causeOnly}
            onChange={(e) => setCauseOnly(e.target.value)}
          >
            <option value="">all</option>
            {Object.keys(CAUSE_LABELS).map((k) => (
              <option key={k} value={k}>
                {k}
                {counts[k] ? ` (${counts[k]})` : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="eng-btn"
          onClick={() =>
            downloadCsv(
              `eng-hang-diagnosis-${dayKeyFromTs()}.csv`,
              filtered.map(({ load, diagnosis }) => ({
                time: fmtTs(load.ts),
                loadId: load.loadId || load.id,
                deviceId: load.deviceId,
                page: load.page,
                department: load.department,
                cause: diagnosis.cause,
                label: diagnosis.label,
                findings: (diagnosis.findings || []).join("|"),
                firstSnapshotMs: load.firstSnapshotMs,
                totalMs: load.totalMs,
                waitingListeners: load.waitingListeners,
                classification: load.classification,
                hungComponents: (diagnosis.hungComponents || [])
                  .map((c) => c.name)
                  .join("|"),
                gateCollection: diagnosis.gate?.collection,
                gateFirstSnaps: diagnosis.gate?.firstSnaps,
                hasFs: diagnosis.hasFs,
                errorCount: diagnosis.matchedErrors?.length || 0,
              }))
            )
          }
        >
          Export hang diagnosis CSV
        </button>
      </div>

      <div className="eng-panel">
        {!filtered.length ? (
          <Empty
            configured={configured}
            loading={loading}
            label="No hung loads in the selected filter range"
          />
        ) : (
          <div className="eng-table-scroll">
            <table className="eng-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Load ID</th>
                  <th>Device</th>
                  <th>Page</th>
                  <th>Dept</th>
                  <th>Cause</th>
                  <th>First snap</th>
                  <th>Total</th>
                  <th>Waiting</th>
                  <th>Hung slots</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 200).map(({ load, diagnosis }) => {
                  const id = load.id || load.loadId;
                  const open = expanded === id;
                  const st = loadStatus(load);
                  return (
                    <React.Fragment key={id}>
                      <tr
                        style={{ cursor: "pointer" }}
                        onClick={() => setExpanded(open ? null : id)}
                      >
                        <td>{fmtTs(load.ts)}</td>
                        <td>
                          <LoadIdCell loadId={load.loadId} id={load.id} />
                        </td>
                        <td>
                          <DeviceName id={load.deviceId} />
                        </td>
                        <td>{load.page || "—"}</td>
                        <td>{load.department || "—"}</td>
                        <td title={diagnosis.label}>
                          <span className="pill offline">
                            {diagnosis.cause.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td>{fmtMs(load.firstSnapshotMs)}</td>
                        <td>{fmtMs(load.totalMs)}</td>
                        <td>{load.waitingListeners ?? "—"}</td>
                        <td>
                          {(diagnosis.hungComponents || [])
                            .map((c) => c.name)
                            .join(", ") || "—"}
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={10}>
                            <div
                              style={{
                                display: "grid",
                                gap: "0.75rem",
                                padding: "0.5rem 0",
                              }}
                            >
                              <p style={{ margin: 0 }}>
                                <strong>{diagnosis.label}</strong>
                                {st !== "hung" ? (
                                  <span className="eng-muted">
                                    {" "}
                                    · timeline status {st}
                                  </span>
                                ) : null}
                              </p>
                              {diagnosis.findings.length > 1 && (
                                <p className="eng-muted" style={{ margin: 0 }}>
                                  Also:{" "}
                                  {diagnosis.findings
                                    .filter((f) => f !== diagnosis.cause)
                                    .map((f) => f.replace(/_/g, " "))
                                    .join(" · ")}
                                </p>
                              )}
                              <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
                                {diagnosis.evidence.map((line, i) => (
                                  <li key={i}>{line}</li>
                                ))}
                              </ul>
                              <WaterfallPanel load={load} />
                              {!!diagnosis.hungComponents?.length && (
                                <div>
                                  <strong>Hung components</strong>
                                  <table className="eng-table">
                                    <thead>
                                      <tr>
                                        <th>Name</th>
                                        <th>Type</th>
                                        <th>Mount</th>
                                        <th>First snap</th>
                                        <th>Ready</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {diagnosis.hungComponents.map((c) => (
                                        <tr key={c.name}>
                                          <td>{c.name}</td>
                                          <td>{c.type}</td>
                                          <td>{fmtMs(c.mountMs)}</td>
                                          <td>{fmtMs(c.firstSnapshotMs)}</td>
                                          <td>{fmtMs(c.readyMs)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {!!diagnosis.matchedErrors?.length && (
                                <div>
                                  <strong>Matching errors (±3 min / same Load ID)</strong>
                                  <table className="eng-table">
                                    <thead>
                                      <tr>
                                        <th>When</th>
                                        <th>Source</th>
                                        <th>Message</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {diagnosis.matchedErrors.map((e) => (
                                        <tr key={e.id || `${e.ts}-${e.message}`}>
                                          <td>{fmtTs(e.ts)}</td>
                                          <td>{e.source || "—"}</td>
                                          <td title={e.stack}>{e.message}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {!!diagnosis.collections?.length && (
                                <div>
                                  <strong>FS collections on this load</strong>
                                  <table className="eng-table">
                                    <thead>
                                      <tr>
                                        <th>Collection</th>
                                        <th>Listeners</th>
                                        <th>Opens</th>
                                        <th>First snaps</th>
                                        <th>First snap max</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {diagnosis.collections.map((c) => (
                                        <tr key={c.collection}>
                                          <td>{c.collection}</td>
                                          <td>{c.listeners}</td>
                                          <td>{c.opens}</td>
                                          <td>{c.firstSnaps}</td>
                                          <td>{fmtMs(c.firstSnapMaxMs || null)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {fsByLoad.get(loadKey(load))?.recentTimeline
                                ?.length ? (
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
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {fsByLoad
                                        .get(loadKey(load))
                                        .recentTimeline.map((e, i) => (
                                          <tr key={i}>
                                            <td>{fmtTs(e.ts)}</td>
                                            <td>{e.moduleId}</td>
                                            <td>{e.collection}</td>
                                            <td>{e.operation}</td>
                                            <td>{fmtMs(e.durationMs)}</td>
                                            <td>{e.docCount ?? "—"}</td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : null}
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
    </>
  );
}

export default HangDiagnosisPage;
