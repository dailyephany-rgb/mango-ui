import React, { useContext, useEffect, useMemo, useState } from "react";
import { OwnerContext } from "../OwnerContext.jsx";
import DateSourceFilter from "../components/DateSourceFilter.jsx";
import { subscribeToWorkflowAnalytics } from "../workflow/workflowfetcher.js";
import { downloadOpsPerformancePdf } from "./exportOpsPerformancePdf.js";
import { collectTurnaroundData } from "./collectTurnaroundData.js";
import { downloadTurnaroundPdf } from "./exportTurnaroundPdf.js";
import { collectCriticalData } from "./collectCriticalData.js";
import { downloadCriticalPdf } from "./exportCriticalPdf.js";
import { collectOperationWorkflowData } from "./collectOperationWorkflowData.js";
import { downloadOperationWorkflowPdf } from "./exportOperationWorkflowPdf.js";
import "./OperationsPerformanceReport.css";

/**
 * Owner reports hub: date filter + downloadable report rows.
 * KPI cards / pending tables live only inside the PDF, not on this page.
 *
 * @param {{ embedded?: boolean, hideFilters?: boolean }} props
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
  const [turnaroundBusy, setTurnaroundBusy] = useState(false);
  const [criticalBusy, setCriticalBusy] = useState(false);
  const [opWorkflowBusy, setOpWorkflowBusy] = useState(false);
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
    () => records.filter((r) => r.hasRoutine && !r.routineCompleted),
    [records]
  );
  const insidePending = useMemo(
    () => records.filter((r) => r.hasInsideLab && !r.insideLabCompleted),
    [records]
  );
  const outsourcePending = useMemo(
    () => records.filter((r) => r.hasOutsource && !r.outsourceCompleted),
    [records]
  );

  const dateLabel =
    dateRange?.from && dateRange?.to
      ? dateRange.from === dateRange.to
        ? dateRange.from
        : `${dateRange.from} → ${dateRange.to}`
      : "—";

  const handleDownloadOps = async () => {
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

  const handleDownloadTurnaround = async () => {
    setTurnaroundBusy(true);
    setPdfError("");
    try {
      const { sections } = await collectTurnaroundData({
        dateRange,
        source,
      });
      await downloadTurnaroundPdf({
        dateFrom: dateRange?.from || "",
        dateTo: dateRange?.to || "",
        source,
        sections,
      });
    } catch (err) {
      console.error(err);
      setPdfError(err?.message || String(err));
    } finally {
      setTurnaroundBusy(false);
    }
  };

  const handleDownloadCritical = async () => {
    setCriticalBusy(true);
    setPdfError("");
    try {
      const { rows, pendingCount, reportedCount } = await collectCriticalData({
        dateRange,
        source,
      });
      await downloadCriticalPdf({
        dateFrom: dateRange?.from || "",
        dateTo: dateRange?.to || "",
        source,
        rows,
        pendingCount,
        reportedCount,
      });
    } catch (err) {
      console.error(err);
      setPdfError(err?.message || String(err));
    } finally {
      setCriticalBusy(false);
    }
  };

  const handleDownloadOperationWorkflow = async () => {
    setOpWorkflowBusy(true);
    setPdfError("");
    try {
      const data = await collectOperationWorkflowData({
        dateRange,
        source,
      });
      await downloadOperationWorkflowPdf({
        dateFrom: dateRange?.from || "",
        dateTo: dateRange?.to || "",
        source,
        summary: data.summary,
        days: data.days,
        detailMisses: data.detailMisses,
      });
    } catch (err) {
      console.error(err);
      setPdfError(err?.message || String(err));
    } finally {
      setOpWorkflowBusy(false);
    }
  };

  const anyBusy =
    pdfBusy || turnaroundBusy || criticalBusy || opWorkflowBusy;

  return (
    <div className={`ops-report-root ${embedded ? "embedded" : ""}`}>
      {!embedded ? (
        <header className="ops-report-header">
          <h1>Owner Reports</h1>
        </header>
      ) : (
        <div className="ops-report-toolbar">
          <h2>Reports</h2>
        </div>
      )}

      {hideFilters ? null : <DateSourceFilter />}

      {pdfError ? (
        <p className="ops-pdf-error">PDF export failed: {pdfError}</p>
      ) : null}

      <div className="ops-report-list">
        <div className="ops-report-row">
          <div className="ops-report-row-main">
            <div className="ops-report-name">Operations Performance</div>
            <div className="ops-report-meta">
              Date range: {dateLabel}
              {source && source !== "All" ? ` · Source: ${source}` : ""}
            </div>
          </div>
          <button
            type="button"
            className="ops-download-btn"
            disabled={anyBusy || loading}
            onClick={handleDownloadOps}
          >
            {pdfBusy ? "Preparing PDF…" : loading ? "Loading…" : "Download"}
          </button>
        </div>

        <div className="ops-report-row">
          <div className="ops-report-row-main">
            <div className="ops-report-name">Turnaround</div>
            <div className="ops-report-meta">
              Date range: {dateLabel}
              {source && source !== "All" ? ` · Source: ${source}` : ""}
              {" · "}SLA violators (clinical, backroom, outsource, inside lab)
            </div>
          </div>
          <button
            type="button"
            className="ops-download-btn"
            disabled={anyBusy}
            onClick={handleDownloadTurnaround}
          >
            {turnaroundBusy ? "Preparing PDF…" : "Download"}
          </button>
        </div>

        <div className="ops-report-row">
          <div className="ops-report-row-main">
            <div className="ops-report-name">Critical</div>
            <div className="ops-report-meta">
              Date range: {dateLabel}
              {source && source !== "All" ? ` · Source: ${source}` : ""}
              {" · "}Pending + Reported (Critical Alerts Center)
            </div>
          </div>
          <button
            type="button"
            className="ops-download-btn"
            disabled={anyBusy}
            onClick={handleDownloadCritical}
          >
            {criticalBusy ? "Preparing PDF…" : "Download"}
          </button>
        </div>

        <div className="ops-report-row">
          <div className="ops-report-row-main">
            <div className="ops-report-name">Operation Workflow</div>
            <div className="ops-report-meta">
              Date range: {dateLabel}
              {source && source !== "All" ? ` · Source: ${source}` : ""}
              {" · "}Planned vs actual by slot / role (entries, follow %, disfollowed)
            </div>
          </div>
          <button
            type="button"
            className="ops-download-btn"
            disabled={anyBusy}
            onClick={handleDownloadOperationWorkflow}
          >
            {opWorkflowBusy ? "Preparing PDF…" : "Download"}
          </button>
        </div>
      </div>
    </div>
  );
}
