
// src/owner/OwnerBloodGroupPage.jsx
import React, { useEffect, useMemo, useState, useContext } from "react";
import { OwnerContext } from "./OwnerContext.jsx";
import DateSourceFilter from "./components/DateSourceFilter";

// 🛠️ Updated Import
import KPIBlocks_BloodGroup from "./components/KPIBlocks_BloodGroup";

import PatientListModal from "./components/PatientListModal";
import DelayTable from "./components/DelayTable";
import CountsBar from "./charts/CountsBar";
import StackedStageLines from "./charts/StackedStageLines";
import TimeBricks from "./charts/TimeBricks";
import DelayHistogram from "./charts/DelayHistogram";
import SLAScoreDonut from "./charts/SLAScoreDonut";

// --- DATA FETCHERS ---
import * as TestingFetcher from "./lib/dataFetcher_bloodgroup_testing.js";
import * as RetestingFetcher from "./lib/dataFetcher_bloodgroup_retesting.js";

export default function OwnerBloodGroupPage() {
  const { dateRange, source } = useContext(OwnerContext);

  // 1. Unified State
  const [mode, setMode] = useState("testing"); 
  const [activeTab, setActiveTab] = useState("overview");
  const [rawRows, setRawRows] = useState([]);
  const [fetchedKpis, setFetchedKpis] = useState(null);
  const [violators, setViolators] = useState([]);
  const [testTimings, setTestTimings] = useState({});

  const [openModal, setOpenModal] = useState(false);
  const [modalData, setModalData] = useState([]);

  // 2. Dynamic Fetcher Selection
  const Fetcher = mode === "testing" ? TestingFetcher : RetestingFetcher;

  // 3. Subscription (Trusting the Fetcher)
  useEffect(() => {
    const unsub = Fetcher.subscribeOverview({
      source,
      dateRange,
      onData: (payload = {}) => {
        setRawRows(payload.unifiedRows || []);
        setFetchedKpis(payload.kpis || null);
        setViolators(payload.violators || []);
      },
    });

    Fetcher.fetchTestTimings().then((t) => setTestTimings(t || {}));
    return () => unsub && unsub();
  }, [source, dateRange, mode, Fetcher]);

  // 4. Process Rows for Charts
  const deptRows = useMemo(() => {
    return rawRows.map(r => ({
      ...r,
      times: [r.timeScanned, r.timeSaved, r.timeValidated].filter(Boolean)
    }));
  }, [rawRows]);

  // 5. Visual Helpers
  const countsForBar = useMemo(() => ({
    totalPrinted: fetchedKpis?.totalPatientsCollected ?? 0,
    scanned: deptRows.filter(r => r.timeScanned).length,
    saved: fetchedKpis?.totalPatientsSaved ?? 0,
    validated: fetchedKpis?.totalPatientsValidated ?? 0,
  }), [deptRows, fetchedKpis]);

  return (
    <div className="owner-root">
      <header className="owner-header">
        <h1>Blood Group — Analytics</h1>

        <div className="tab-buttons">
          <button className={mode === "testing" ? "active" : ""} onClick={() => setMode("testing")}>Testing Mode</button>
          <button className={mode === "retesting" ? "active" : ""} onClick={() => setMode("retesting")}>Retesting Mode</button>
        </div>

        <div className="tab-buttons" style={{ marginTop: 12 }}>
          {["overview", "delays", "timebricks"].map(tab => (
            <button 
              key={tab}
              className={activeTab === tab ? "active" : ""} 
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </header>

      <DateSourceFilter />
      
      {/* 🟢 Uses your specialized Blood Group KPI block (No Critical Card) */}
      <KPIBlocks_BloodGroup kpis={fetchedKpis || {}} />

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
            <SLAScoreDonut total={deptRows.length} within={deptRows.length - violators.length} />
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
            <div style={{ height: '600px', width: '100%', background: '#fff', borderRadius: '8px' }}> 
              <TimeBricks
                unifiedRows={deptRows}
                testTimings={testTimings}
                department="bloodgroup"
                dateRange={dateRange} 
                onBrickClick={(p) => {
                  setModalData([p]);
                  setOpenModal(true);
                }}
              />
            </div>
          </div>
        </section>
      )}

      <PatientListModal open={openModal} onClose={() => setOpenModal(false)} patients={modalData} />
    </div>
  );
}