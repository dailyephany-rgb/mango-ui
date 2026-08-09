
// src/owner/OwnerBloodGroupPage.jsx
import React, { useEffect, useMemo, useState, useContext, Suspense } from "react";
import {
  OwnerPageShell,
  OwnerFilters,
  OwnerKPIs,
  OwnerDelays,
  useVisitedTabs,
  OwnerTabPanel
} from "./eng/OwnerEngBlocks.jsx";
import { OwnerContext } from "./OwnerContext.jsx";
import DateSourceFilter from "./components/DateSourceFilter";

// 🛠️ Updated Import
import KPIBlocks_BloodGroup from "./components/KPIBlocks_BloodGroup";

import PatientListModal from "./components/PatientListModal";
import DelayTable from "./components/DelayTable";
import {
  CountsBar,
  StackedStageLines,
  TimeBricks,
  DelayHistogram,
  SLAScoreDonut,
  StaffDistribution,
  StaffAvgCards,
  StaffTimeline,
  OwnerChartsSection,
} from "./charts/lazyOwnerCharts";

// --- DATA FETCHERS ---
import * as TestingFetcher from "./lib/dataFetcher_bloodgroup_testing.js";
import * as RetestingFetcher from "./lib/dataFetcher_bloodgroup_retesting.js";

export default function OwnerBloodGroupPage() {
  const { dateRange, source } = useContext(OwnerContext);

  // 1. Unified State
  const [mode, setMode] = useState("testing"); 
  const [activeTab, setActiveTab] = useState("overview");
  const visitedTabs = useVisitedTabs(activeTab);
  const [staffTab,setStaffTab] = useState("testing");
  const [staffAnalytics,setStaffAnalytics] = useState(null);
  const [rawRows, setRawRows] = useState([]);
  const [fetchedKpis, setFetchedKpis] = useState(null);
  
  const [testTimings, setTestTimings] = useState({});

  const [openModal, setOpenModal] = useState(false);
  const [modalData, setModalData] = useState([]);
  const [stageFilter, setStageFilter] = useState("turnaround");
  const [chartSearch, setChartSearch] = useState("");
  const [chartExpanded, setChartExpanded] = useState(false);
  const [delayStage, setDelayStage] = useState("scanned_to_saved");
  const [timebrickSearch,setTimebrickSearch,] = useState("");

  // 2. Dynamic Fetcher Selection
  const Fetcher = mode === "testing" ? TestingFetcher : RetestingFetcher;

  useEffect(() => {
    if (mode === "retesting") {
      if (staffTab === "entered") {
        setStaffTab("testing");
      }
  
      if (
        delayStage ===
        "validated_to_entered"
      ) {
        setDelayStage(
          "scanned_to_saved"
        );
      }
    }
  }, [
    mode,
    staffTab,
    delayStage,
  ]);

  // 3. Subscription (Trusting the Fetcher)
  useEffect(() => {
    const unsub = Fetcher.subscribeOverview({
      source,
      dateRange,
      
      onData: (payload = {}) => {
        setRawRows(payload.unifiedRows || []);
        setFetchedKpis(payload.kpis || null);
        setStaffAnalytics(payload.staffAnalytics ||null);
      },
    });
    return () => unsub && unsub();
  }, [source, dateRange, mode]);
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      const fetchTimings =
        mode === "testing"
          ? TestingFetcher.fetchTestTimings
          : RetestingFetcher.fetchTestTimings;
      fetchTimings().then((t) => {
        if (!cancelled) setTestTimings(t || {});
      });
    };
    const idle =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback(run, { timeout: 2000 })
        : setTimeout(run, 0);
    return () => {
      cancelled = true;
      if (typeof cancelIdleCallback === "function" && typeof idle === "number")
        cancelIdleCallback(idle);
      else clearTimeout(idle);
    };
  }, [mode]);


  // 4. Process Rows for Charts
  const deptRows = useMemo(() => {
    return rawRows.map(r => ({
      ...r,
      times: [r.timeScanned, r.timeSaved, r.timeValidated].filter(Boolean)
    }));
  }, [rawRows]);

  const violators = useMemo(
    () =>
      Fetcher.computeSLAViolations(
        deptRows,
        testTimings,
        delayStage
      ),
    [
      deptRows,
      testTimings,
      delayStage,
      mode,
    ]
  );

  // 5. Visual Helpers
  const countsForBar = useMemo(() => ({
    totalPrinted: fetchedKpis?.totalPatientsCollected ?? 0,
    scanned: deptRows.filter(r => r.timeScanned).length,
    saved: fetchedKpis?.totalPatientsSaved ?? 0,
    validated: fetchedKpis?.totalPatientsValidated ?? 0,
  }), [deptRows, fetchedKpis]);

  const filteredStageRows = useMemo(() => {
    const query =
      chartSearch.trim().toLowerCase();
  
    if (!query) {
      return deptRows;
    }
  
    return deptRows.filter((row) => {
      const regNo = String(
        row.regNo || ""
      ).toLowerCase();
  
      const diagNo = String(
        row.diagnosticNo || ""
      ).toLowerCase();
  
      return (
        regNo.includes(query) ||
        diagNo.includes(query)
      );
    });
  }, [deptRows, chartSearch]);

  const stackedChartSLA = useMemo(() => {
    const dept =
      mode === "testing"
        ? testTimings?.bloodgroup
        : testTimings?.bloodgroup_retesting;
  
    if (!dept) return null;
  
    switch (stageFilter) {
      case "printed":
        return null;
  
      case "collected":
        return (
          dept.collected_to_scanned ??
          null
        );
  
      case "saved":
        return (
          dept.scanned_to_saved ??
          null
        );
  
      case "validated":
        return (
          dept.saved_to_validated ??
          null
        );

      case "entered":
          return mode === "testing"
            ? (dept.validated_to_entered ??null) : null;
        
  
      case "turnaround":
        return (
          dept.turnaround ??
          null
        );

      case "complete":
          return mode === "testing" ? ( dept.complete_analysis ??null): null;
          default:
           return null;
      }
      }, [
    stageFilter,
    testTimings,
    mode,
  ]);


  const pageName =
    mode === "testing" ? "OwnerBloodGroupTesting" : "OwnerBloodGroupRetesting";

  return (
    <OwnerPageShell page="OwnerBloodGroup" moduleId={pageName}>
    <div className="owner-root">
      <header className="owner-header">
        <h1>Blood Group — Analytics</h1>

        <div className="tab-buttons">
          <button className={mode === "testing" ? "active" : ""} 
          onClick={() => {
            setStaffAnalytics(null);
            setMode("testing");
          }}
          >Testing Mode</button>
          <button className={mode === "retesting" ? "active" : ""} 
         onClick={() => {setStaffAnalytics(null);setMode("retesting");}}
         >Retesting Mode</button>
        </div>

        <div className="tab-buttons" style={{ marginTop: 12 }}>
          {["overview", "delays", "timebricks","staff",].map(tab => (
            <button 
              key={tab}
              className={activeTab === tab ? "active" : ""} 
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === "staff" && (
          <div
            className="tab-buttons"
            style={{
              marginTop: 12,
            }}
          >
            {(
              mode === "testing"
                ? [
                    "testing",
                    "validated",
                    "entered",
                  ]
                : [
                    "testing",
                    "validated",
                  ]
            ).map((t) => (
              <button
                key={t}
                className={
                  staffTab === t
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setStaffTab(t)
                }
              >
                {t.charAt(0).toUpperCase() +
                  t.slice(1)}
              </button>
            ))}
          </div>
        )}

      </header>

      <OwnerFilters page="OwnerBloodGroup">
        <DateSourceFilter />
      </OwnerFilters>
      
      {/* 🟢 Uses your specialized Blood Group KPI block (No Critical Card) */}
      <OwnerKPIs page="OwnerBloodGroup" hidden={activeTab === "staff"}>
          <KPIBlocks_BloodGroup kpis={fetchedKpis || {}} />
        </OwnerKPIs>

      {visitedTabs.overview && (
        <OwnerTabPanel active={activeTab === "overview"}>
        <OwnerChartsSection engPage="OwnerBloodGroup" engName="Charts">
         
         <div className="chart-card">
  <h3>Counts Bar</h3>

  <CountsBar
    counts={countsForBar}
  />
</div>

          <div className="chart-card">

  <div
    style={{
      display: "flex",
      justifyContent:
        "space-between",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
      marginBottom: 16,
    }}
  >
    <h3 style={{ margin: 0 }}>
      Stacked Stage Timeline
    </h3>

    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <select
        value={stageFilter}
        onChange={(e) =>
          setStageFilter(
            e.target.value
          )
        }
        style={{
          padding: "6px 10px",
          borderRadius: 8,
          border:
            "1px solid #d1d5db",
          fontSize: 14,
        }}
      >
        <option value="printed">
          Printed → Collected
        </option>

        <option value="collected">
          Collected → Scanned
        </option>

        <option value="saved">
          Scanned → Saved
        </option>

        <option value="validated">
          Saved → Validated
        </option>

        {mode === "testing" && (
          <>
            <option value="entered">
              Validated → Entered
            </option>

            <option value="complete">
              Complete Analysis
            </option>
          </>
        )}
        <option value="turnaround">
          Turnaround Time
        </option>
      </select>

      <input
        type="text"
        placeholder="Search Reg or Diag No..."
        value={chartSearch}
        onChange={(e) =>
          setChartSearch(
            e.target.value
          )
        }
        style={{
          width: 220,
          padding:
            "7px 12px",
          border:
            "1px solid #d1d5db",
          borderRadius: 8,
          fontSize: 14,
        }}
      />

      <button
        onClick={() =>
          setChartExpanded(true)
        }
        style={{
          width: 36,
          height: 36,
          border:
            "1px solid #d1d5db",
          borderRadius: 8,
          background: "#fff",
          cursor: "pointer",
          fontSize: 18,
        }}
      >
        ↗
      </button>
    </div>
  </div>

  <StackedStageLines
    unifiedRows={
      filteredStageRows
    }
    stageFilter={
      stageFilter
    }
    slaLimit={
      stackedChartSLA
    }
  />
</div>
        </OwnerChartsSection>
              </OwnerTabPanel>
      )}


{visitedTabs.delays && (
        <OwnerTabPanel active={activeTab === "delays"}>
  <OwnerDelays page="OwnerBloodGroup">
  <>
   <div
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 16,
        }}
      >
        
      <select
        value={delayStage}
        onChange={(e) =>
          setDelayStage(
            e.target.value
          )
        }
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border:
            "1px solid #d1d5db",
          fontSize: 14,
          background: "#fff",
        }}
      >
        <option value="scanned_to_saved">
          Scanned → Saved
        </option>

        <option value="saved_to_validated">
          Saved → Validated
        </option>

        {mode === "testing" && (
          <option value="validated_to_entered">
            Validated → Entered
          </option>
          )}
        
          <option value="turnaround">
          Turnaround (Collected → Validated)
        </option>
      </select>
    </div>

    <OwnerChartsSection>
      <div className="chart-card">
        <h3>Delay Histogram</h3>

        <DelayHistogram
          violators={violators}
        />
      </div>

      <div className="chart-card">
        <h3>SLA Score</h3>

        <SLAScoreDonut
          total={deptRows.length}
          within={
            deptRows.length -
            violators.length
          }
        />
      </div>

      <div className="chart-card full-width">
        <DelayTable
          violators={violators}
          stage={delayStage}
        />
      </div>
    </OwnerChartsSection>
  </>
  </OwnerDelays>
        </OwnerTabPanel>
      )}

{visitedTabs.timebricks && (
        <OwnerTabPanel active={activeTab === "timebricks"}>
  <OwnerChartsSection>
    <div className="chart-card full-width">

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h3 style={{ margin: 0 }}>
          Time Bricks Chart
        </h3>

        <input
          type="text"
          placeholder="Search Reg or Diag No..."
          value={timebrickSearch}
          onChange={(e) =>
            setTimebrickSearch(
              e.target.value
            )
          }
          style={{
            width: 250,
            padding: "8px 12px",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            fontSize: 14,
          }}
        />
      </div>

      <div
        style={{
          height: "600px",
          width: "100%",
          background: "#fff",
          borderRadius: "8px",
        }}
      >
        <TimeBricks
          unifiedRows={deptRows}
          testTimings={testTimings}
          department={
            mode === "testing"
              ? "bloodgroup"
              : "bloodgroup_retesting"
          }
          search={timebrickSearch}
          onBrickClick={(p) => {
            setModalData([p]);
            setOpenModal(true);
          }}
        />
      </div>

    </div>
  </OwnerChartsSection>
        </OwnerTabPanel>
      )}

{visitedTabs.staff && (
        <OwnerTabPanel active={activeTab === "staff"}>
  <OwnerChartsSection engPage="OwnerBloodGroup" engName="Staff Analytics">

    {staffTab === "testing" && (
      <>
        <div className="chart-card">
          <h3>
            Save Distribution
          </h3>

          <StaffDistribution
            data={
              staffAnalytics?.testing
                ?.distribution || []
            }
          />
        </div>

        <div className="chart-card">
          <h3>
            Avg Scan → Save by Staff
          </h3>

          <StaffAvgCards
            data={
              staffAnalytics?.testing
                ?.averages || []
            }
          />
        </div>

        <div className="chart-card full-width">
          <h3>
            Staff Processing Timeline
          </h3>

          <StaffTimeline
            timelines={
              staffAnalytics?.testing
                ?.timelines || {}
            }
          />
        </div>
      </>
    )}

    {staffTab === "validated" && (
      <>
        <div className="chart-card">
          <h3>
            Validation Distribution
          </h3>

          <StaffDistribution
            data={
              staffAnalytics?.validated
                ?.distribution || []
            }
          />
        </div>

        <div className="chart-card">
          <h3>
            Avg Save → Validate by Staff
          </h3>

          <StaffAvgCards
            data={
              staffAnalytics?.validated
                ?.averages || []
            }
          />
        </div>

        <div className="chart-card full-width">
          <h3>
            Validator Timeline
          </h3>

          <StaffTimeline
            timelines={
              staffAnalytics?.validated
                ?.timelines || {}
            }
          />
        </div>
      </>
    )}

    {mode === "testing" &&
      staffTab === "entered" && (
        <>
          <div className="chart-card">
            <h3>
              Entry Distribution
            </h3>

            <StaffDistribution
              data={
                staffAnalytics?.entered
                  ?.distribution || []
              }
            />
          </div>

          <div className="chart-card">
            <h3>
              Avg Validate → Enter by Staff
            </h3>

            <StaffAvgCards
              data={
                staffAnalytics?.entered
                  ?.averages || []
              }
                />
              </div>

              <div className="chart-card full-width">
                <h3>
                  Entry Timeline
                </h3>

                <StaffTimeline
                  timelines={
                    staffAnalytics?.entered
                      ?.timelines || {}
                  }
                />
              </div>
            </>
          )}

      </OwnerChartsSection>
            </OwnerTabPanel>
      )}

      <PatientListModal open={openModal} onClose={() => setOpenModal(false)} patients={modalData} />
      {chartExpanded && (
      <Suspense fallback={null}>
      <div
        onClick={() => setChartExpanded(false)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 9999,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "95vw",
            height: "90vh",
            background: "#fff",
            borderRadius: 12,
            padding: 20,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <h2 style={{ margin: 0 }}>
              Stacked Stage Timeline
            </h2>

            <button
              onClick={() =>
                setChartExpanded(false)
              }
              style={{
                border: "none",
                background: "none",
                fontSize: 28,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>

          {/* Controls */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 20,
            }}
          >
            <select
              value={stageFilter}
              onChange={(e) =>
                setStageFilter(
                  e.target.value
                )
              }
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
              }}
            >
              <option value="printed">
                Printed → Collected
              </option>

              <option value="collected">
                Collected → Scanned
              </option>

              <option value="saved">
                Scanned → Saved
              </option>

              <option value="validated">
                Saved → Validated
              </option>

              {mode === "testing" && (
                <>
                  <option value="entered">
                    Validated → Entered
                  </option>

                  <option value="complete">
                    Complete Analysis
                  </option>
                </>
              )}
              <option value="turnaround">
                Turnaround Time
              </option>
            </select>

            <input
              type="text"
              placeholder="Search Reg or Diag No..."
              value={chartSearch}
              onChange={(e) =>
                setChartSearch(
                  e.target.value
                )
              }
              style={{
                width: 250,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
              }}
            />
          </div>

          {/* Chart */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              paddingBottom: 35,
            }}
          >
            <StackedStageLines
              unifiedRows={filteredStageRows}
              stageFilter={stageFilter}
              slaLimit={stackedChartSLA}
              height={650}
            />
          </div>
        </div>
      </div>
      </Suspense>
    )}
    </div>
    </OwnerPageShell>
  );
}