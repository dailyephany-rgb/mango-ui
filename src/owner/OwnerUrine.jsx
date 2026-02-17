

// src/owner_ui/OwnerUrinePage.jsx
import React, { useEffect, useMemo, useState, useContext } from "react";
import { OwnerContext } from "../owner/OwnerContext.jsx";

import DateSourceFilter from "../owner/components/DateSourceFilter";
import KPIBlocks from "../owner/components/KPIBlocks";
import PatientListModal from "../owner/components/PatientListModal";
import DelayTable from "../owner/components/DelayTable";

import CountsBar from "../owner/charts/CountsBar";
import StackedStageLines from "../owner/charts/StackedStageLines";
import TimeBricks from "../owner/charts/TimeBricks";
import DelayHistogram from "../owner/charts/DelayHistogram";
import SLAScoreDonut from "../owner/charts/SLAScoreDonut";

import {
  subscribeOverview,
  fetchTestTimings,
  minutesDiff
} from "../owner/lib/dataFetcher_urine.js";

export default function OwnerUrinePage() {
  const { dateRange, source } = useContext(OwnerContext);

  // 1. Unified State (Hormones Pattern)
  const [rawRows, setRawRows] = useState([]); 
  const [fetchedKpis, setFetchedKpis] = useState(null);
  const [violators, setViolators] = useState([]);
  const [testTimings, setTestTimings] = useState({});
  
  const [activeTab, setActiveTab] = useState("overview");
  const [openModal, setOpenModal] = useState(false);
  const [modalData, setModalData] = useState([]);

  // 2. Subscribe (Standardized)
  useEffect(() => {
    const unsub = subscribeOverview({
      source,
      dateRange,
      onData: ({ unifiedRows, kpis, violators: vList }) => {
        setRawRows(unifiedRows || []);
        setFetchedKpis(kpis || null);
        setViolators(vList || []);
      }
    });

    fetchTestTimings().then((t) => setTestTimings(t || {}));
    return () => unsub && unsub();
  }, [source, dateRange]);

  // 3. Process Rows for Charts/Bricks
  const deptRows = useMemo(() => {
    return rawRows.map(r => ({
      ...r,
      times: [r.timeScanned, r.timeSaved, r.timeValidated].filter(Boolean)
    }));
  }, [rawRows]);

  // 4. Extract Slowest Entry from Violators
  const slowestEntry = useMemo(() => {
    let slowest = null;
    violators.forEach((v) => {
      if (!slowest || v.duration > slowest.delay) {
        slowest = {
          regNo: v.regNo,
          patientName: v.name,
          delay: v.duration,
          tests: v.test
        };
      }
    });
    return slowest;
  }, [violators]);

  // 5. Final KPI Object (Merging fetched data with UI-derived slowest entry)
  const kpis = useMemo(() => {
    if (!fetchedKpis) return null;
    return {
      ...fetchedKpis,
      slowestEntry
    };
  }, [fetchedKpis, slowestEntry]);

  // 6. Chart & Overview Data
  const countsForBar = useMemo(() => ({
    totalPrinted: kpis?.totalPatientsCollected ?? 0,
    scanned: deptRows.filter(r => r.timeScanned).length,
    saved: kpis?.totalPatientsSaved ?? 0,
    validated: kpis?.totalPatientsValidated ?? 0
  }), [deptRows, kpis]);

  const overviewForKPI = {
    totalPrinted: kpis?.totalPatientsCollected ?? 0,
    scanned: countsForBar.scanned,
    saved: kpis?.totalPatientsSaved ?? 0,
    validated: kpis?.totalPatientsValidated ?? 0
  };

  return (
    <div className="owner-root">
      <header className="owner-header">
        <h1>Urine Examination — Analytics</h1>
        <div className="tab-buttons">
          {["overview", "delays", "timebricks"].map((t) => (
            <button
              key={t}
              className={activeTab === t ? "active" : ""}
              onClick={() => setActiveTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </header>

      <DateSourceFilter />
      
      {/* 🟢 Correct Keys (Critical, TAT, etc.) now pass through to KPIBlocks */}
      <KPIBlocks overview={overviewForKPI} kpis={kpis || {}} />

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
            <div style={{ height: '600px', width: '100%', background: '#fff', borderRadius: '8px' }}> 
              <TimeBricks
                unifiedRows={deptRows}
                testTimings={testTimings}
                department="urine"
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

      <PatientListModal 
        open={openModal} 
        onClose={() => setOpenModal(false)} 
        patients={modalData} 
      />
    </div>
  );
}
