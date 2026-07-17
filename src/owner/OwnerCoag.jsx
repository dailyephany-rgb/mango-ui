

// ------------------------------------------------------
// src/owner/OwnerCoagPage.jsx
// Coagulation Analytics Page - Optimized with Slowest Entry Restore
// ------------------------------------------------------

import React, { useEffect, useMemo, useState, useContext } from "react";
import { OwnerContext } from "./OwnerContext.jsx";

import DateSourceFilter from "./components/DateSourceFilter";
import KPIBlocks from "./components/KPIBlocks";
import PatientListModal from "./components/PatientListModal";
import DelayTable from "./components/DelayTable";

import CountsBar from "./charts/CountsBar";
import StackedStageLines from "./charts/StackedStageLines";
import TimeBricks from "./charts/TimeBricks"; // Now powered by react-calendar-timeline
import DelayHistogram from "./charts/DelayHistogram";
import SLAScoreDonut from "./charts/SLAScoreDonut";
import StaffDistribution from "./charts/StaffDistribution";
import StaffAvgCards from "./charts/StaffAvgCards";
import StaffTimeline from "./charts/StaffTimeline";

import {
  subscribeOverview,
  fetchTestTimings,
  computeSLAViolations,
  toDate,
  normalizeTestsField
} from "./lib/dataFetcher.js";

// Helper for slowest entry calculation
const toMinutes = (a, b) => {
  const A = toDate(a);
  const B = toDate(b);
  return A && B && B > A ? Math.round((B - A) / 60000) : null;
};

export default function OwnerCoagPage() {
  const { dateRange, source } = useContext(OwnerContext);

  const [deptRows, setDeptRows] = useState([]); 
  const [fetchedKpis, setFetchedKpis] = useState(null);
  const [baseViolators, setBaseViolators] = useState([]);
  const [testTimings, setTestTimings] = useState({});
  const [openModal, setOpenModal] = useState(false);
  const [modalData, setModalData] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [staffTab, setStaffTab] = useState("testing");
  const [staffAnalytics, setStaffAnalytics] = useState(null);
  const [stageFilter, setStageFilter] = useState("turnaround");
  const [chartSearch, setChartSearch] = useState("");
  const [chartExpanded, setChartExpanded] = useState(false);
  const [delayStage, setDelayStage] =  useState("scanned_to_saved");
  const [timebrickSearch, setTimebrickSearch] = useState("");
  
  useEffect(() => {
    const unsub = subscribeOverview({
      source,
      dateRange,
      onData: (payload = {}) => {
        // Use data pre-filtered by timePrinted in dataFetcher
        if (payload.unifiedRows) setDeptRows(payload.unifiedRows || []);
        if (payload.kpis) setFetchedKpis(payload.kpis);
        if (payload.violators) setBaseViolators(payload.violators || []);
        if (payload.staffAnalytics) setStaffAnalytics( payload.staffAnalytics ||null);
      }
    });

    fetchTestTimings().then((t) => setTestTimings(t || {}));
    return () => unsub && unsub();
  }, [source, dateRange]);

  // 1. Restore Slowest Entry Logic based on current deptRows
  const slowestEntry = useMemo(() => {
    let slowest = null;
    deptRows.forEach((r) => {
      const delay = toMinutes(r.timeScanned, r.timeSaved);
      if (delay != null && (!slowest || delay > slowest.delay)) {
        slowest = {
          regNo: r.regNo,
          delay,
          tests: normalizeTestsField(r.tests || r.test),
          timeScanned: r.timeScanned,
          timeSaved: r.timeSaved,
          patientName: r.name || r.patientName
        };
      }
    });
    return slowest;
  }, [deptRows]);

  // 2. Final KPIs for Display
  const finalKpis = useMemo(() => ({
    ...(fetchedKpis || {}),
    slowestEntry // Inject the calculated slowest entry
  }), [fetchedKpis, slowestEntry]);

  // 3. Map overview for charts
  const overviewForKPI = useMemo(() => ({
    totalPrinted: finalKpis?.totalPatientsCollected ?? 0,
    scanned: deptRows.filter(r => r.timeScanned).length,
    saved: finalKpis?.totalPatientsSaved ?? 0,
    validated: finalKpis?.totalPatientsValidated ?? 0
  }), [finalKpis, deptRows]);

  const countsForBar = useMemo(() => ({
    totalPrinted: overviewForKPI.totalPrinted,
    scanned: overviewForKPI.scanned,
    saved: overviewForKPI.saved,
    validated: overviewForKPI.validated
  }), [overviewForKPI]);

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
      testTimings?.coagulation;
  
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
    <div className="owner-root">
      <header className="owner-header">
        <h1>Coagulation — Analytics</h1>
        <div className="tab-buttons">
            <button 
              className={activeTab === "overview" ? "active" : ""} 
              onClick={() => setActiveTab("overview")}
            >
                  Overview
                </button>
                <button 
                  className={activeTab === "delays" ? "active" : ""} 
                  onClick={() => setActiveTab("delays")}
                >
                  Delays
                </button>
                <button 
                  className={activeTab === "timebricks" ? "active" : ""} 
                  onClick={() => setActiveTab("timebricks")}
                >
                  Time Bricks
                </button>

                <button
                  className={
                    activeTab === "staff"
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setActiveTab("staff")
                  }
                >
                  Staff
                </button>
              </div>

              {activeTab === "staff" && (
        <div
          className="tab-buttons"
          style={{
            marginTop: 12,
          }}
        >
          {[
            "testing",
            "validated",
            "entered",
          ].map((t) => (
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
              {t.charAt(0)
                .toUpperCase() +
                t.slice(1)}
            </button>
          ))}
        </div>
      )}

      </header>

      <DateSourceFilter />

      {activeTab !== "staff" && (
        <KPIBlocks
          overview={overviewForKPI}
          kpis={finalKpis}
        />
      )}

      {activeTab === "overview" && (
        <section className="owner-charts">
          <div className="chart-card">
            <h3>Counts Bar</h3>
            <CountsBar counts={countsForBar} />
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
        </section>
      )}

{activeTab === "delays" && (
  <section className="owner-charts">
    <div className="chart-card">

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
          Delay Histogram
        </h3>

        <select
          value={delayStage}
          onChange={(e) =>
            setDelayStage(
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

      <DelayHistogram
        violators={violators}
      />
    </div>

          <div className="chart-card">
            <h3>SLA Score</h3>
            <SLAScoreDonut total={deptRows.length} within={deptRows.length - violators.length} />
          </div>
          <div className="chart-card full-width">
            <DelayTable violators={violators} />
          </div>
        </section>
      )}

      
{activeTab === "timebricks" && (
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

    <section className="owner-charts">
      <div className="chart-card full-width">
        <h3>Time Bricks Chart</h3>

        <div
          style={{
            height: "600px",
            marginTop: "10px",
          }}
        >
          <TimeBricks
            unifiedRows={deptRows}
            testTimings={testTimings}
            dateRange={dateRange}
            search={timebrickSearch}
            department="coagulation"
            onBrickClick={(p) => {
              setModalData([p]);
              setOpenModal(true);
            }}
          />
        </div>
      </div>
    </section>
  </>
)}

{activeTab === "staff" && (
  <section className="owner-charts">

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
            Avg Save → Validate by
            Staff
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

          {staffTab === "entered" && (
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
                  Avg Validate → Enter by
                  Staff
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

        </section>
      )}

      <PatientListModal open={openModal} onClose={() => setOpenModal(false)} patients={modalData} />

      {chartExpanded && (
  <div
    onClick={() =>
      setChartExpanded(false)
    }
    style={{
      position: "fixed",
      inset: 0,
      background:
        "rgba(0,0,0,0.5)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 9999,
    }}
  >
    <div
      onClick={(e) =>
        e.stopPropagation()
      }
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
          justifyContent:
            "space-between",
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
            setChartSearch(
              e.target.value
            )
          }
          style={{
            width: 250,
            padding: "8px 12px",
            borderRadius: 8,
            border:
              "1px solid #d1d5db",
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
          unifiedRows={
            filteredStageRows
          }
          stageFilter={
            stageFilter
          }
          slaLimit={
            stackedChartSLA
          }
          height={650}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
