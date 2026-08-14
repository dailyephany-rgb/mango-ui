import React, { useContext, useEffect, useMemo, useState } from "react";
import { OwnerContext } from "../OwnerContext.jsx";
import DateSourceFilter from "../components/DateSourceFilter.jsx";
import WorkflowKPIBlocks from "../workflow/WorkflowKPIBlocks.jsx";
import { subscribeToWorkflowAnalytics } from "../workflow/workflowfetcher.js";
import { downloadOpsPerformancePdf } from "./exportOpsPerformancePdf.js";
import "./OperationsPerformanceReport.css";

function yesNo(v) {
  if (v === true || v === "Yes") return "Yes";
  if (v === false || v === "No") return "No";
  return v ? "Yes" : "No";
}

function StageTable({ columns, rows }) {
  return (
    <div className="ops-stage-wrap">
      <table className="ops-stage-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>—</td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key}>{c.render(row)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const ROUTINE_COLS = [
  { key: "dept", label: "Department", render: (r) => r.dept || "—" },
  {
    key: "tests",
    label: "Tests",
    render: (r) =>
      Array.isArray(r.tests) && r.tests.length ? r.tests.join(", ") : "—",
  },
  { key: "scanned", label: "Scanned", render: (r) => yesNo(r.scanned) },
  { key: "saved", label: "Saved", render: (r) => yesNo(r.saved) },
  {
    key: "validated",
    label: "Validated",
    render: (r) => yesNo(r.validated),
  },
  { key: "entered", label: "Entered", render: (r) => yesNo(r.entered) },
];

const INSIDE_COLS = [
  { key: "dept", label: "Department", render: (r) => r.dept || "—" },
  {
    key: "tests",
    label: "Tests",
    render: (r) =>
      Array.isArray(r.tests) && r.tests.length ? r.tests.join(", ") : "—",
  },
  { key: "saved", label: "Saved", render: (r) => yesNo(r.saved) },
];

const OUTSOURCE_COLS = [
  { key: "dept", label: "Department", render: (r) => r.dept || "—" },
  {
    key: "tests",
    label: "Tests",
    render: (r) =>
      Array.isArray(r.tests) && r.tests.length ? r.tests.join(", ") : "—",
  },
  {
    key: "collected",
    label: "Collected",
    render: (r) => yesNo(r.sampleCollected),
  },
  {
    key: "received",
    label: "Received",
    render: (r) => yesNo(r.reportReceived),
  },
  {
    key: "delivered",
    label: "Delivered",
    render: (r) => yesNo(r.reportGiven),
  },
];

function PendingPatientCard({ patient, columns, stageRows }) {
  return (
    <div className="ops-pending-card">
      <div className="ops-pending-meta">
        <span>{patient.regNo || "—"}</span>
        <span>{patient.diagnosticNo || "—"}</span>
        <span>{patient.patientName || patient.name || "—"}</span>
        <span>{patient.doctor || "—"}</span>
        <span>{patient.source || "—"}</span>
      </div>
      <StageTable columns={columns} rows={stageRows} />
    </div>
  );
}

/**
 * @param {{ embedded?: boolean, hideFilters?: boolean }} props
 * embedded=true when rendered as OwnerApp Report tab (header already present).
 * hideFilters=true when parent already renders DateSourceFilter.
 */
export default function OperationsPerformanceReport({
  embedded = false,
  hideFilters = false,
}) {
  const { source, dateRange } = useContext(OwnerContext);
  const [workflowData, setWorkflowData] = useState({
    records: [],
    summary: {},
  });
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToWorkflowAnalytics({
      onData: (data) => {
        setWorkflowData(data);
        setLoading(false);
      },
      onError: (err) => {
        console.error(err);
        setLoading(false);
      },
      source,
      dateRange,
    });
    return () => unsubscribe && unsubscribe();
  }, [source, dateRange]);

  const { records = [], summary = {} } = workflowData;

  const routinePending = useMemo(
    () =>
      records.filter((r) => r.hasRoutine && !r.routineCompleted),
    [records]
  );
  const insidePending = useMemo(
    () =>
      records.filter((r) => r.hasInsideLab && !r.insideLabCompleted),
    [records]
  );
  const outsourcePending = useMemo(
    () =>
      records.filter((r) => r.hasOutsource && !r.outsourceCompleted),
    [records]
  );

  const handleDownload = async () => {
    setPdfBusy(true);
    setPdfError("");
    try {
      await downloadOpsPerformancePdf({
        dateFrom: dateRange?.from || "",
        dateTo: dateRange?.to || "",
        source,
        summary,
        routinePending,
        insidePending,
        outsourcePending,
      });
    } catch (err) {
      console.error(err);
      setPdfError(err?.message || String(err));
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className={`ops-report-root ${embedded ? "embedded" : ""}`}>
      {!embedded ? (
        <header className="ops-report-header">
          <h1>Operations Performance Report</h1>
          <button
            type="button"
            className="ops-download-btn"
            disabled={pdfBusy || loading}
            onClick={handleDownload}
          >
            {pdfBusy ? "Preparing PDF…" : "Download Report"}
          </button>
        </header>
      ) : (
        <div className="ops-report-toolbar">
          <h2>Operations Performance Report</h2>
          <button
            type="button"
            className="ops-download-btn"
            disabled={pdfBusy || loading}
            onClick={handleDownload}
          >
            {pdfBusy ? "Preparing PDF…" : "Download Report"}
          </button>
        </div>
      )}

      {hideFilters ? null : <DateSourceFilter />}

      {pdfError ? (
        <p className="ops-pdf-error">PDF export failed: {pdfError}</p>
      ) : null}

      {loading ? (
        <p className="ops-loading">Loading workflow data…</p>
      ) : (
        <>
          <WorkflowKPIBlocks summary={summary} />

          <section className="ops-pending-section">
            <h3>
              Routine Pending{" "}
              <span className="ops-count">({routinePending.length})</span>
            </h3>
            {routinePending.length === 0 ? (
              <p className="ops-empty">No pending routine workflows.</p>
            ) : (
              routinePending.map((p) => (
                <PendingPatientCard
                  key={`r-${p.id || p.regNo}-${p.diagnosticNo}`}
                  patient={p}
                  columns={ROUTINE_COLS}
                  stageRows={p.routineStatuses || []}
                />
              ))
            )}
          </section>

          <section className="ops-pending-section">
            <h3>
              Inside Lab Pending{" "}
              <span className="ops-count">({insidePending.length})</span>
            </h3>
            {insidePending.length === 0 ? (
              <p className="ops-empty">No pending inside-lab workflows.</p>
            ) : (
              insidePending.map((p) => (
                <PendingPatientCard
                  key={`i-${p.id || p.regNo}-${p.diagnosticNo}`}
                  patient={p}
                  columns={INSIDE_COLS}
                  stageRows={p.insideStatuses || []}
                />
              ))
            )}
          </section>

          <section className="ops-pending-section">
            <h3>
              Outsource Incomplete{" "}
              <span className="ops-count">({outsourcePending.length})</span>
            </h3>
            {outsourcePending.length === 0 ? (
              <p className="ops-empty">No incomplete outsource workflows.</p>
            ) : (
              outsourcePending.map((p) => (
                <PendingPatientCard
                  key={`o-${p.id || p.regNo}-${p.diagnosticNo}`}
                  patient={p}
                  columns={OUTSOURCE_COLS}
                  stageRows={p.outsourceStatuses || []}
                />
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
