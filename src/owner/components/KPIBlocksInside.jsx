
import React from "react";

export default function KPIBlocks({ kpis = {} }) {
  const {
    totalPatientsCollected,
    totalPatientsSaved,
    totalPatientsPendingScans,
    totalTestsCollected,
    totalTestsSaved,
    totalTestsPending,
    avgCollectedToSaved,
    slowestEntry
  } = kpis;

  return (
    <div className="kpi-row">
      {/* PATIENT METRICS */}
      <div className="kpi-card">
        <div className="kpi-title">Patients Collected</div>
        <div className="kpi-value">{totalPatientsCollected ?? 0}</div>
        <div className="kpi-sub">From master register</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Patients Saved</div>
        <div className="kpi-value">{totalPatientsSaved ?? 0}</div>
        <div className="kpi-sub">Saved in Department</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Pending Records</div>
        <div className="kpi-value">{totalPatientsPendingScans ?? 0}</div>
        <div className="kpi-sub">Patients awaiting save</div>
      </div>

      {/* TEST METRICS */}
      <div className="kpi-card">
        <div className="kpi-title">Tests Collected</div>
        <div className="kpi-value">{totalTestsCollected ?? 0}</div>
        <div className="kpi-sub">Master register tests</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Tests Saved</div>
        <div className="kpi-value">{totalTestsSaved ?? 0}</div>
        <div className="kpi-sub">Department saved tests</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Tests Pending</div>
        <div className="kpi-value">{totalTestsPending ?? 0}</div>
        <div className="kpi-sub">Tests Pending</div>
      </div>

      {/* TIME KPIs */}
      {/* 🛠️ UPDATED: Added kpi-tat class for red font color */}
      <div className="kpi-card kpi-tat">
        <div className="kpi-title">Average Turnaround Time</div>
        <div className="kpi-value">{avgCollectedToSaved ?? "—"} min</div>
        <div className="kpi-sub">Collected − Saved</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Slowest Entry</div>
        <div className="kpi-value">{slowestEntry?.delay ?? "—"} min</div>
        <div className="kpi-sub">
          {slowestEntry ? `Reg No: ${slowestEntry.regNo}` : "No data"}
        </div>
      </div>
    </div>
  );
}