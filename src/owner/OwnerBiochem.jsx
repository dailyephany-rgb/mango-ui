

import React, { useContext, useEffect, useMemo, useState, Suspense } from "react";
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
import KPIBlocks from "./components/KPIBlocks";
import DelayTable from "./components/DelayTable";
import PatientListModal from "./components/PatientListModal";

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


import {
  subscribeOverview,
  minutesDiff,           
  fetchTestTimings,       
  computeSLAViolations, 
} from "./lib/dataFetcher_biochem_main";

export default function OwnerBiochem() {
  const { dateRange, source } = useContext(OwnerContext);

  const [activeTab, setActiveTab] = useState("overview");
  const visitedTabs = useVisitedTabs(activeTab);
  const [staffTab, setStaffTab] = useState("testing");

  const [rawRows, setRawRows] = useState([]);
  const [fetchedKpis, setFetchedKpis] = useState(null); 
  const [staffAnalytics, setStaffAnalytics] = useState(null);
  const [testTimings, setTestTimings] = useState({}); 

  const [openModal, setOpenModal] = useState(false);
  const [modalData, setModalData] = useState([]);
  const [delayStage, setDelayStage] = useState("scanned_to_saved");
  const [stageFilter, setStageFilter] = useState("turnaround");
  const [chartSearch, setChartSearch] = useState("");
  const [chartExpanded, setChartExpanded] = useState(false);
  const [timebrickSearch, setTimebrickSearch] = useState("");
  
  /* ---------------- SUBSCRIBE ---------------- */
  useEffect(() => {
    const unsub = subscribeOverview({
      source,
      dateRange,
      onData: ({
        unifiedRows,
        kpis,
        staffAnalytics,
      }) => {
        setRawRows(unifiedRows || []);
        setFetchedKpis(kpis || null);
        setStaffAnalytics(
          staffAnalytics || null
        );
      },
    });

    return () => unsub && unsub();
  }, [source, dateRange]);
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      fetchTestTimings().then((t) => {
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
  }, []);


  /* ---------------- DATA ASSIGNMENT ---------------- */
  const deptRows = useMemo(() => {
    return rawRows.map(r => ({
      ...r,
      // Ensure times array exists for TimeBricks logic
      times: [r.timeScanned, r.timeSaved, r.timeValidated].filter(Boolean)
    }));
  }, [rawRows]);
  const filteredStageRows = useMemo(() => {
    // remove spaces and make lowercase
    const query = chartSearch
      .trim()
      .toLowerCase();
  
    // empty search
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

  /* ---------------- CALCULATE SLOWEST ENTRY ---------------- */
  const slowestEntry = useMemo(() => {
    let slowest = null;
    deptRows.forEach((r) => {
      const delay = minutesDiff(r.timeScanned, r.timeSaved);
      if (delay !== null && (!slowest || delay > slowest.delay)) {
        slowest = {
          regNo: r.regNo,
          patientName: r.name || r.patientName || "Unknown",
          delay: delay,
          tests: r.selectedTests || []
        };
      }
    });
    return slowest;
  }, [deptRows]);

  /* ---------------- MERGED KPIs ---------------- */
  const kpis = useMemo(() => {
    if (!fetchedKpis) return null;
    return {
      ...fetchedKpis,
      slowestEntry: slowestEntry 
    };
  }, [fetchedKpis, slowestEntry]);

  /* ---------------- COUNTS (FOR CHARTS) ---------------- */
  const countsForBar = useMemo(
    () => ({
      totalPrinted: kpis?.totalPatientsCollected ?? 0,
      scanned: deptRows.filter((r) => r.timeScanned).length,
      saved: deptRows.filter((r) => r.isSaved || r.timeSaved).length, 
      validated: deptRows.filter((r) => r.isValidated || r.timeValidated).length,
    }),
    [deptRows, kpis]
  );

  const overviewForKPI = {
    totalPrinted: kpis?.totalPatientsCollected ?? 0,
    scanned: countsForBar.scanned,
    saved: countsForBar.saved,
    validated: countsForBar.validated,
  };

  /* ---------------- SLA VIOLATIONS ---------------- */
 const violators = useMemo(
    () =>
      computeSLAViolations(
        deptRows,
        testTimings,
        delayStage
      ),
    [
      deptRows,
      testTimings,
      delayStage,
    ]
  );

  const stackedChartSLA = useMemo(() => {
    const dept = testTimings?.biochem;
  
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
          return (
            dept.validated_to_entered ??
            null
          );
        
        case "turnaround":
          return (
            dept.turnaround ??
            null
          );
        
        case "complete":
          return (
            dept.complete_analysis ??
            null
          );
  
      default:
        return null;
    }
  }, [stageFilter, testTimings]);

  

  return (
    <OwnerPageShell page="OwnerBiochem" moduleId="OwnerBiochem">
    <div className="owner-root">
      <header className="owner-header">
        <h1>Biochemistry — Analytics</h1>

        <div className="tab-buttons" style={{ marginTop: 12 }}>
          {["overview", "delays", "timebricks","staff"].map((t) => (
            <button
              key={t}
              className={activeTab === t ? "active" : ""}
              onClick={() => setActiveTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        
       
       
        {activeTab === "staff" && (
        <div className="tab-buttons" style={{ marginTop: 12 }}>
        {["testing", "validated", "entered"].map((t) => (
          <button
            key={t}
            className={staffTab === t ? "active" : ""}
            onClick={() => setStaffTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      )}


      </header>

      <OwnerFilters page="OwnerBiochem">
      <DateSourceFilter />
      </OwnerFilters>

      <OwnerKPIs page="OwnerBiochem" hidden={activeTab === "staff"}>
        <KPIBlocks
          overview={overviewForKPI}
          kpis={kpis || {}}
        />
        </OwnerKPIs>

      {visitedTabs.overview && (
        <OwnerTabPanel active={activeTab === "overview"}>
        <OwnerChartsSection engPage="OwnerBiochem" engName="Charts">
          <div className="chart-card">
            <h3>Counts Bar</h3>
            <CountsBar counts={countsForBar} />
          </div>

          <div className="chart-card">

          <div
              style={{
                display: "flex",
                justifyContent: "space-between",
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
                setStageFilter(e.target.value)
              }
              style={{
                padding: "6px 10px",
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

              <option value="entered">
                Validated → Entered
              </option>

              <option value="turnaround">
                Turnaround Time
              </option>

              <option value="complete">
                Complete Analysis
              </option>

            </select>



            <input
              type="text"
              placeholder="Search Reg or Diag No..."
              value={chartSearch}
              onChange={(e) =>
                setChartSearch(e.target.value)
              }
              style={{
                width: 220,
                padding: "7px 12px",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                fontSize: 14,
              }}
            />
          </div>
          <button
            onClick={() =>
              setChartExpanded(true)
            }
            style={{
              width: 36,
              height: 36,
              border: "1px solid #d1d5db",
              borderRadius: 8,
              background: "#fff",
              cursor: "pointer",
              fontSize: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ↗
          </button>


          </div>

          <StackedStageLines
              unifiedRows={filteredStageRows}
              stageFilter={stageFilter}
              slaLimit={stackedChartSLA}
            />
        </div>
        </OwnerChartsSection>
              </OwnerTabPanel>
      )}

{visitedTabs.delays && (
        <OwnerTabPanel active={activeTab === "delays"}>
        <OwnerDelays page="OwnerBiochem">
  <>
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        marginBottom: 16,
      }}
    >
      <select
        value={delayStage}
        onChange={(e) =>
          setDelayStage(e.target.value)
        }
        style={{
          padding: "8px 12px",
          borderRadius: "8px",
          border: "1px solid #d1d5db",
          fontSize: "14px",
          minWidth: "220px",
        }}
      >
        <option value="scanned_to_saved">
          Scanned → Saved
        </option>

        <option value="saved_to_validated">
          Saved → Validated
        </option>
        <option value="validated_to_entered">
         Validated → Entered
      </option>
      <option value="turnaround">
    Turnaround (Collected → Validated)
     </option>
      </select>
    </div>

    <OwnerChartsSection>
      <div className="chart-card">
        <h3>Delay Histogram</h3>
        <DelayHistogram violators={violators} />
      </div>

      <div className="chart-card">
        <h3>SLA Score</h3>
        <SLAScoreDonut
          total={deptRows.length}
          within={deptRows.length - violators.length}
        />
      </div>

      <div className="chart-card full-width">
      <DelayTable violators={violators} stage={delayStage}/>
      </div>
    </OwnerChartsSection>
  </>

        </OwnerDelays>
              </OwnerTabPanel>
      )}
        {visitedTabs.timebricks && (
        <OwnerTabPanel active={activeTab === "timebricks"}>
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: 16,
            }}
          >
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
                width: 260,
                padding: "8px 12px",
                borderRadius: 8,
                border:
                  "1px solid #d1d5db",
                fontSize: 14,
              }}
            />
          </div>

          <OwnerChartsSection>
            <div className="chart-card full-width">
              <h3>Time Bricks Chart</h3>

              <TimeBricks
                unifiedRows={deptRows}
                startKey="timeScanned"
                endKey="timeSaved"
                search={timebrickSearch}
                department="biochemistry"
                onBrickClick={(p) => {
                  setModalData([p]);
                  setOpenModal(true);
                }}
              />
            </div>
          </OwnerChartsSection>
        </>
              </OwnerTabPanel>
      )}
      

        
        {visitedTabs.staff && (
        <OwnerTabPanel active={activeTab === "staff"}>
        <OwnerChartsSection engPage="OwnerBiochem" engName="Staff Analytics">

            {staffTab === "testing" && (
              <>
               
               <div className="chart-card">
                <h3>Save Distribution</h3>

                <StaffDistribution
                  data={
                    staffAnalytics?.testing
                      ?.distribution || []
                  }
                />
                </div>

                <div className="chart-card">
                  <h3>Avg Scan → Save by Staff</h3>
                  <StaffAvgCards
                      data={
                        staffAnalytics?.testing
                          ?.averages || []
                      }
                    />
                   </div>

                <div className="chart-card full-width">
                    <h3>Staff Processing Timeline</h3>

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
                  <h3>Validation Distribution</h3>
                <StaffDistribution
                  data={
                    staffAnalytics?.validated
                      ?.distribution || []
                  }
                />
              </div>

            <div className="chart-card">
              <h3>Avg Save → Validate by Staff</h3>

              <StaffAvgCards
                data={
                  staffAnalytics?.validated
                    ?.averages || []
                }
              />
            </div>

            <div className="chart-card full-width">
              <h3>Validator Timeline</h3>
              <StaffTimeline timelines={ staffAnalytics?.validated?.timelines || {} }
              /> </div>  </>
            )}

  
    {staffTab === "entered" && (
      <>
        <div className="chart-card">
          <h3>Entry Distribution</h3>

          <StaffDistribution
            data={
              staffAnalytics?.entered
                ?.distribution || []
            }
          />
        </div>

    <div className="chart-card">
      <h3>Avg Validate → Enter by Staff</h3>

            <StaffAvgCards
              data={
                staffAnalytics?.entered
                  ?.averages || []
              }
            />
          </div>

            <div className="chart-card full-width">
              <h3>Entry Timeline</h3>

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

              
          <PatientListModal
            open={openModal}
            onClose={() => setOpenModal(false)}
            patients={modalData}
          />

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
    <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 20,
  }}
>
  <select
    value={stageFilter}
    onChange={(e) =>
      setStageFilter(e.target.value)
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

    <option value="entered">
      Validated → Entered
    </option>

    <option value="turnaround">
      Turnaround Time
    </option>
    <option value="complete">
  Complete Analysis
</option>

  </select>

  <input
    type="text"
    placeholder="Search Reg or Diag No..."
    value={chartSearch}
    onChange={(e) =>
      setChartSearch(e.target.value)
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
   
    <div
  style={{
    flex: 1,
    minHeight: 0,
    overflowX: "auto",
    overflowY: "auto",
    paddingBottom: 35,
  }}
>
  <div
    style={{
      minWidth: `${Math.max(
        filteredStageRows.length * 18,
        1200
      )}px`,
      height: "100%",
    }}
  >
      <StackedStageLines
  unifiedRows={filteredStageRows}
  stageFilter={stageFilter}
  height={650}
  slaLimit={stackedChartSLA}
/>

  </div>
</div>

    </div>
  </div>
      </Suspense>
      )}

    </div>

    </OwnerPageShell>
  );
}



