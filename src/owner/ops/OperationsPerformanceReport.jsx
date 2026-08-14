import React, { useContext, useEffect, useMemo, useState } from "react";
import { OwnerContext } from "../OwnerContext.jsx";
import DateSourceFilter from "../components/DateSourceFilter.jsx";
import { subscribeToWorkflowAnalytics } from "../workflow/workflowfetcher.js";
import { downloadOpsPerformancePdf } from "./exportOpsPerformancePdf.js";
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
            disabled={pdfBusy || loading}
            onClick={handleDownloadOps}
          >
            {pdfBusy ? "Preparing PDF…" : loading ? "Loading…" : "Download"}
          </button>
        </div>
      </div>
    </div>
  );
}
