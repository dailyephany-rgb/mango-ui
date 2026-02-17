

// src/owner/OwnerSerology.jsx
import React, { useEffect, useMemo, useState, useContext } from "react";
import { OwnerContext } from "./OwnerContext.jsx";

import DateSourceFilter from "./components/DateSourceFilter";
import KPIBlocks from "./components/KPIBlocks";
import PatientListModal from "./components/PatientListModal";
import DelayTable from "./components/DelayTable";

import CountsBar from "./charts/CountsBar";
import StackedStageLines from "./charts/StackedStageLines";
import TimeBricks from "./charts/TimeBricks";
import DelayHistogram from "./charts/DelayHistogram";
import SLAScoreDonut from "./charts/SLAScoreDonut";

import {
  subscribeOverview,
  fetchTestTimings,
  computeSLAViolations,
  toDate,
} from "./lib/dataFetcher_serology.js";

export default function OwnerSerologyPage() {
  const { dateRange, source } = useContext(OwnerContext);

  // State for data from the fetcher
  const [deptRows, setDeptRows] = useState([]);
  const [finalKpis, setFinalKpis] = useState({
    totalPatientsCollected: 0,
    totalTestsCollected: 0,
    totalPatientsSaved: 0,
    totalTestsSaved: 0,
    totalPatientsValidated: 0,
    totalPatientsPendingScans: 0,
    totalTestsPending: 0,
    avgPrintedToCollected: null,
    avgCollectedToScanned: null,
    avgScannedToSaved: null,
    avgSavedToValidated: null,
    slowestEntry: null,
  });

  const [testTimings, setTestTimings] = useState({});
  const [openModal, setOpenModal] = useState(false);
  const [modalData, setModalData] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");

  // SUBSCRIBE + FILTER
  useEffect(() => {
    const unsub = subscribeOverview({
      source,
      dateRange,
      onData: (payload = {}) => {
        if (payload.deptRows) setDeptRows(payload.deptRows);
        if (payload.kpis) setFinalKpis(payload.kpis);
      },
    });

    fetchTestTimings().then((t) => setTestTimings(t || {}));
    return () => unsub && unsub();
  }, [source, dateRange]);

  // SLA VIOLATORS (Calculated from filtered deptRows)
  const violators = useMemo(
    () => computeSLAViolations(deptRows, testTimings, "scanned_to_saved"),
    [deptRows, testTimings]
  );

  // COUNTS FOR BAR CHART
  const countsForBar = useMemo(
    () => ({
      totalPrinted: finalKpis.totalPatientsCollected,
      scanned: deptRows.filter(r => r.timeScanned).length,
      saved: finalKpis.totalPatientsSaved,
      validated: finalKpis.totalPatientsValidated,
    }),
    [deptRows, finalKpis]
  );

  // DATA FOR KPI BLOCKS
  const overviewForKPI = useMemo(() => ({
    totalPrinted: finalKpis.totalPatientsCollected,
    scanned: countsForBar.scanned,
    saved: finalKpis.totalPatientsSaved,
    validated: finalKpis.totalPatientsValidated,
  }), [finalKpis, countsForBar]);

  return (
    <div className="owner-root">
      <header className="owner-header">
        <h1>Serology — Analytics</h1>

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
        </div>
      </header>

      <DateSourceFilter />
      
      <KPIBlocks overview={overviewForKPI} kpis={finalKpis} />

      {activeTab === "overview" && (
        <section className="owner-charts">
          <div className="chart-card">
            <h3>Counts Bar</h3>
            <CountsBar counts={countsForBar} />
          </div>
          <div className="chart-card">
            <h3>Stacked Stage Timeline</h3>
            <StackedStageLines unifiedRows={deptRows} />
          </div>
        </section>
      )}

      {activeTab === "delays" && (
        <section className="owner-charts">
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
            <DelayTable violators={violators} />
          </div>
        </section>
      )}

      {activeTab === "timebricks" && (
        <section className="owner-charts">
          <div className="chart-card full-width">
            <h3>Time Bricks Chart</h3>
            {/* 🛠️ UPDATED: Fixed-height scroll wrapper for the high-res 24h grid */}
            <div style={{ height: '600px', width: '100%', background: '#fff', borderRadius: '8px' }}> 
              <TimeBricks
                unifiedRows={deptRows}
                testTimings={testTimings}
                dateRange={dateRange} // 🛠️ UPDATED: Added to snap timeline to correct date
                onBrickClick={(p) => {
                  setModalData([p]);
                  setOpenModal(true);
                }}
              />
            </div>
          </div>
        </section>
      )}

      <PatientListModal 
        open={openModal} 
        onClose={() => setOpenModal(false)} 
        patients={modalData} 
      />
    </div>
  );
}
