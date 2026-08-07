
// src/owner/OwnerApp.jsx
import React, {
  useEffect,
  useState,
  useContext,
} from "react";
;

import DateSourceFilter from "./components/DateSourceFilter";
import { OwnerContext } from "./OwnerContext.jsx";

import WorkflowKPIBlocks from "./workflow/WorkflowKPIBlocks";
import WorkflowStackedBars from "./workflow/WorkflowStackedBars";
import WorkflowStaffDistribution from "./workflow/WorkflowStaffDistribution";

import { subscribeToWorkflowAnalytics } from "./workflow/workflowfetcher";

import "./OwnerUI.css";

export default function OwnerApp() {

  const { source, dateRange } = useContext(OwnerContext);

  const [workflowData, setWorkflowData] = useState({
    records: [],
    summary: {},
  });

  const [loading, setLoading] = useState(true);


  const [activeTab, setActiveTab] = useState("overview");

  const {
    records,
    stackedBarRecords = [],
    summary,
  } = workflowData;

  useEffect(() => {
    const unsubscribe = subscribeToWorkflowAnalytics({
      onData: (data) => {
        setWorkflowData(data);
        setLoading(false);
      },
      onError: console.error,
      source,
      dateRange,
    });

    return () => unsubscribe && unsubscribe();
  }, [source, dateRange]);

  if (loading) {
    return (
      <div className="owner-root">
        <div
          style={{
            padding: "40px",
            textAlign: "center",
            fontSize: "18px",
            color: "#64748b",
          }}
        >
          Loading Workflow Analytics...
        </div>
      </div>
    );
  }

  return (
    <div className="owner-root">
      {/* ================= HEADER ================= */}
      <header className="owner-header">
        <h1>Owner Dashboard — Workflow Analytics</h1>

        {/* Department Analytics Dropdown */}
        <select
          style={{
            padding: "6px 10px",
            borderRadius: "6px",
            border: "1px solid #e2e8f0",
            background: "#f8fafc",
            cursor: "pointer",
          }}
          defaultValue=""
          onChange={(e) => {
            const routeMap = {
              coag: "/index_owner_coag.html",
              esr: "/owner_esr.html",
              serology: "/owner_serology.html",
              rapid: "/owner_rapid.html",
              urine: "/index_owner_urine.html",
              haem: "/index_owner_haem.html",
              hormones: "/owner_hormones.html",
              biochem: "/owner_biochem.html",
              bloodgroup: "/owner_bloodgroup.html",
              insideLab: "/owner_lab.html",
              outsource: "/owner_outsource.html",
              critical: "/Critical.html",
              engineering: "/engineering.html",
              analytics: "/analytics.html",
              master_admin: "/master_admin.html",
              performance: "/performance.html",
            };

            const url = routeMap[e.target.value];
            if (url) {
              window.open(url, "_blank");
              e.target.value = "";
            }
          }}
        >
          <option value="">Open Department Analytics…</option>
          <option value="coag">Coagulation</option>
          <option value="esr">ESR</option>
          <option value="serology">Serology</option>
          <option value="rapid">Rapid Card</option>
          <option value="urine">Urine Analysis</option>
          <option value="haem">Haematology</option>
          <option value="hormones">Hormones</option>
          <option value="biochem">Biochemistry</option>
          <option value="bloodgroup">Blood Group & RH</option>
          <option value="" disabled>
            ──────────
          </option>
          <option value="insideLab">Inside Lab</option>
          <option value="outsource">Outsource</option>
          <option value="" disabled>
            ──────────
          </option>
          <option value="critical">Critical</option>
          <option value="engineering">Engineering Operations</option>
          <option value="analytics">Count Analytics</option>
          <option value="master_admin">Master Admin</option>
          <option value="performance">Performance & Diagnostics</option>
        </select>
      </header>

      {/* ================= FILTERS ================= */}
      <DateSourceFilter />

      {/* ================= KPI BLOCKS ================= */}
      <WorkflowKPIBlocks summary={summary} />

      {/* ================= TABS ================= */}
      <div
        className="tab-buttons"
        style={{ display: "flex", gap: 12, marginBottom: 12 }}
      >
        <button
          onClick={() => setActiveTab("overview")}
          className={activeTab === "overview" ? "active" : ""}
        >
          Overview
        </button>

        <button
          onClick={() => setActiveTab("staff")}
          className={activeTab === "staff" ? "active" : ""}
        >
          Staff Analytics
        </button>
      </div>

      {/* ================= OVERVIEW TAB ================= */}
      {activeTab === "overview" ? (
       <section className="owner-charts">
       <div className="chart-card full-width">
         <h3>Routine Workflow Duration</h3>
         <WorkflowStackedBars records={stackedBarRecords} />
       </div>
     </section>
      ) : (
        /* ================= STAFF ANALYTICS TAB ================= */
        <section className="owner-charts">
        <div className="chart-card full-width">
          <WorkflowStaffDistribution
            data={
              summary.staffDistribution ?? {
                routine: [],
                insideLab: [],
                whatsapp: [],
              }
            }
          />
        </div>
      </section>
      )}
    </div>
  );
}

