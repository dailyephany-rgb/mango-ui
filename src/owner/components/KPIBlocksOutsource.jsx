
import React from "react";

export default function KPIBlocks({ kpis = {} }) {
  const {
    totalPatientsCollected,
    totalPatientsSaved,
    totalPatientsGiven,
    totalPatientsPendingReport,
    totalPatientsPendingScans,
    totalTestsCollected,
    totalTestsSaved,
    totalTestsPending,
    avgCollectedToSaved,
    avgSavedToGiven,
    slowestEntry
  } = kpis;

  return (
    <div className="kpi-row">
      <div className="kpi-card">
        <div className="kpi-title">Patients Collected</div>
        <div className="kpi-value">{totalPatientsCollected ?? 0}</div>
        <div className="kpi-sub">From master register</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Patients Saved</div>
        <div className="kpi-value">{totalPatientsSaved ?? 0}</div>
        <div className="kpi-sub">Saved in Lab</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Patients Given</div>
        <div className="kpi-value">{totalPatientsGiven ?? 0}</div>
        <div className="kpi-sub">Report delivered</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Pending Report Giving</div>
        <div className="kpi-value">{totalPatientsPendingReport ?? 0}</div>
        <div className="kpi-sub">Saved but not given</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Pending Records</div>
        <div className="kpi-value">{totalPatientsPendingScans ?? 0}</div>
        <div className="kpi-sub">Patients awaiting save</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Tests Collected</div>
        <div className="kpi-value">{totalTestsCollected ?? 0}</div>
        <div className="kpi-sub">Master register tests</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Tests Saved</div>
        <div className="kpi-value">{totalTestsSaved ?? 0}</div>
        <div className="kpi-sub">Lab saved tests</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Tests Pending</div>
        <div className="kpi-value">{totalTestsPending ?? 0}</div>
        <div className="kpi-sub">Collected − Saved</div>
      </div>

      {/* 🛠️ UPDATED: Flipped titles and kept kpi-tat for red font */}
      <div className="kpi-card kpi-tat">
        <div className="kpi-title">Average Turnaround Time</div>
        <div className="kpi-value">{avgCollectedToSaved ?? "—"}</div>
        <div className="kpi-sub">Avg Collected → Saved</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Avg Saved → Given</div>
        <div className="kpi-value">{avgSavedToGiven ?? "—"}</div>
        <div className="kpi-sub">Delivery time</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Slowest Entry</div>
        <div className="kpi-value">{slowestEntry?.formatted ?? "—"}</div>
        <div className="kpi-sub">
          {slowestEntry?.regNo ? `Reg No: ${slowestEntry.regNo}` : "No data"}
        </div>
      </div>
    </div>
  );
}