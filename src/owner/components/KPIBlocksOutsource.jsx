
import React from "react";

export default function KPIBlocks({ kpis = {} }) {
  const {
    totalPatientsCollected,
    totalPatientsOutsourced,
    totalPatientsReportsDelivered,
    totalPatientsReportsGiven,
    pendingOutsourceCollection,
    pendingReportGiving,
    totalTestsCollected,
    totalTestsOutsourced,
    pendingTestsOutsource,
    avgCollectedToReceived,
    avgReceivedToDelivered,
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
      <div className="kpi-title">Patients Collected by Outsource</div>
      <div className="kpi-value">{totalPatientsOutsourced ?? 0}</div>
      <div className="kpi-sub">Collect button pressed</div>
      </div>

      <div className="kpi-card">
      <div className="kpi-title">Patients Reports Delivered</div>
      <div className="kpi-value">{totalPatientsReportsDelivered ?? 0}</div>
      <div className="kpi-sub">Mark Received pressed</div>
      </div>

      <div className="kpi-card">
      <div className="kpi-title">Patients Reports Given</div>
      <div className="kpi-value">{totalPatientsReportsGiven ?? 0}</div>

      <div className="kpi-card">
      <div className="kpi-title">Pending Report Giving</div>
      <div className="kpi-value">{pendingReportGiving ?? 0}</div>
      <div className="kpi-sub">Report received − Report given</div>
    </div>
      <div className="kpi-sub">Deliver button pressed</div>
      </div>

      <div className="kpi-card">
      <div className="kpi-title">Pending Outsource Collection</div>
      <div className="kpi-value">{pendingOutsourceCollection ?? 0}</div>
      <div className="kpi-sub">Collected − Outsourced</div>
      </div>

      <div className="kpi-card">
        <div className="kpi-title">Tests Collected</div>
        <div className="kpi-value">{totalTestsCollected ?? 0}</div>
        <div className="kpi-sub">Master register tests</div>
      </div>

      <div className="kpi-card">
      <div className="kpi-title">Tests Given to Outsource</div>
      <div className="kpi-value">{totalTestsOutsourced ?? 0}</div>
      <div className="kpi-sub">Collect button pressed</div>
      </div>

      <div className="kpi-card">
      <div className="kpi-title">Pending Tests for Outsource</div>
      <div className="kpi-value">{pendingTestsOutsource ?? 0}</div>
      <div className="kpi-sub">Collected − Outsourced</div>
      </div>

      {/* 🛠️ UPDATED: Flipped titles and kept kpi-tat for red font */}
      <div className="kpi-card kpi-tat">
        <div className="kpi-title">Average Turnaround Time</div>
        <div className="kpi-value">{avgCollectedToReceived ?? "—"}</div>
      <div className="kpi-sub">Outsource Collection → Report Received</div>
      </div>

      <div className="kpi-card">
      <div className="kpi-title">Avg Report Received → Given</div>
      <div className="kpi-value">{avgReceivedToDelivered ?? "—"}</div>
      <div className="kpi-sub">Report received → Delivered</div>
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