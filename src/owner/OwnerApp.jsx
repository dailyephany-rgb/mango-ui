
// src/owner/OwnerApp.jsx
import React, {
  useEffect,
  useState,
  useContext,
  lazy,
} from "react";

import DateSourceFilter from "./components/DateSourceFilter";
import { OwnerContext } from "./OwnerContext.jsx";

import WorkflowKPIBlocks from "./workflow/WorkflowKPIBlocks";
import { OwnerChartsSection } from "./charts/lazyOwnerCharts";
import { EngComponent } from "../engineering/ui/EngComponent.jsx";

const WorkflowStackedBars = lazy(() => import("./workflow/WorkflowStackedBars"));
const WorkflowStaffDistribution = lazy(
  () => import("./workflow/WorkflowStaffDistribution")
);

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
  // Keep EngComponent tab panels mounted after first open (no mount/unmount thrash).
  const [visitedTabs, setVisitedTabs] = useState({ overview: true });

  const { stackedBarRecords = [], summary } = workflowData;

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

  const selectTab = (tab) => {
    setActiveTab(tab);
    setVisitedTabs((v) => (v[tab] ? v : { ...v, [tab]: true }));
  };

  return (
    <EngComponent
      name="OwnerApp.jsx"
      type="Page"
      parent={null}
      moduleId="OwnerApp"
    >
      <div className="owner-root">
        {loading ? (
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
        ) : (
          <>
            <header className="owner-header">
              <h1>Owner Dashboard — Workflow Analytics</h1>

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
                    sales_data: "/owner_sales.html",
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
                <option value="sales_data">Sales Data</option>
                <option value="performance">Performance & Diagnostics</option>
              </select>
            </header>

            <EngComponent name="Filters" type="Layout" parent="OwnerApp.jsx">
              <DateSourceFilter />
            </EngComponent>

            <EngComponent
              name="Workflow Fetcher"
              type="Data"
              parent="OwnerApp.jsx"
              moduleId="workflowfetcher"
            >
              <EngComponent name="KPIs" type="Charts" parent="OwnerApp.jsx">
                <WorkflowKPIBlocks summary={summary} />
              </EngComponent>
            </EngComponent>

            <div
              className="tab-buttons"
              style={{ display: "flex", gap: 12, marginBottom: 12 }}
            >
              <button
                type="button"
                onClick={() => selectTab("overview")}
                className={activeTab === "overview" ? "active" : ""}
              >
                Overview
              </button>

              <button
                type="button"
                onClick={() => selectTab("staff")}
                className={activeTab === "staff" ? "active" : ""}
              >
                Staff Analytics
              </button>
            </div>

            {visitedTabs.overview && (
              <div
                style={{
                  display: activeTab === "overview" ? undefined : "none",
                }}
              >
                <EngComponent name="Charts" type="Charts" parent="OwnerApp.jsx">
                  <OwnerChartsSection>
                    <div className="chart-card full-width">
                      <h3>Routine Workflow Duration</h3>
                      <WorkflowStackedBars records={stackedBarRecords} />
                    </div>
                  </OwnerChartsSection>
                </EngComponent>
              </div>
            )}

            {visitedTabs.staff && (
              <div
                style={{
                  display: activeTab === "staff" ? undefined : "none",
                }}
              >
                <EngComponent
                  name="Staff Analytics"
                  type="Charts"
                  parent="OwnerApp.jsx"
                >
                  <OwnerChartsSection>
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
                  </OwnerChartsSection>
                </EngComponent>
              </div>
            )}
          </>
        )}
      </div>
    </EngComponent>
  );
}
