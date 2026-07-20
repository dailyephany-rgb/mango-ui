
import React from "react";

const Card = ({ title, value, subtitle }) => (
  <div className="kpi-card">
    <div className="kpi-title">{title}</div>

    <div className="kpi-value">{value ?? 0}</div>

    <div className="kpi-sub">{subtitle}</div>
  </div>
);

export default function WorkflowKPIBlocks({ summary = {} }) {
  return (
    <>
      <section className="workflow-section">
        <h3>Routine Reports</h3>

        <div className="kpi-row">
          <Card
            title="Routine Patients"
            value={summary.routineTotal}
            subtitle="Reports requiring routine workflow"
          />

          <Card
            title="Pending"
            value={summary.routinePending}
            subtitle="Waiting for workflow completion"
          />

          <Card
            title="Completed"
            value={summary.routineCompleted}
            subtitle="Routine workflow completed"
          />

          <Card
            title="Printed"
            value={summary.routinePrinted}
            subtitle="Routine reports printed"
          />

          <Card
            title="WhatsApp Required"
            value={summary.whatsappRequired}
            subtitle="Awaiting WhatsApp"
          />

          <Card
            title="WhatsApp Sent"
            value={summary.whatsappSent}
            subtitle="WhatsApp delivered"
          />
        </div>
      </section>

      <section className="workflow-section">
        <h3>Inside Lab</h3>

        <div className="kpi-row">
          <Card
            title="Inside Lab Patients"
            value={summary.insideTotal}
            subtitle="Reports requiring inside lab workflow"
          />

          <Card
            title="Pending"
            value={summary.insidePending}
            subtitle="Waiting for workflow completion"
          />

          <Card
            title="Completed"
            value={summary.insideCompleted}
            subtitle="Inside lab workflow completed"
          />

          <Card
            title="Printed"
            value={summary.insidePrinted}
            subtitle="Inside lab reports printed"
          />
        </div>
      </section>

      <section className="workflow-section">
        <h3>Outsource</h3>

        <div className="kpi-row">
          <Card
            title="Outsource Patients"
            value={summary.outsourceTotal}
            subtitle="Reports requiring outsource workflow"
          />

          <Card
            title="Pending"
            value={summary.outsourcePending}
            subtitle="Waiting for workflow completion"
          />

          <Card
            title="Completed"
            value={summary.outsourceCompleted}
            subtitle="Outsource workflow completed"
          />
        </div>
      </section>
    </>
  );
}
