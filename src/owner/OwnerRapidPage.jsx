

// src/owner_ui/OwnerRapidPage.jsx
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
  computeSLAViolations,
  minutesDiff,
} from "../owner/lib/dataFetcher_rapid.js";

export default function OwnerRapidPage() {
  const { dateRange, source } = useContext(OwnerContext);

  const [rawRows, setRawRows] = useState([]); 
  const [fetchedKpis, setFetchedKpis] = useState(null);
  const [testTimings, setTestTimings] = useState({});
  
  const [activeTab, setActiveTab] = useState("overview");
  const [openModal, setOpenModal] = useState(false);
  const [modalData, setModalData] = useState([]);

  // 1. SUBSCRIBE (Hormones Style)
  useEffect(() => {
    const unsub = subscribeOverview({
      source,
      dateRange,
      onData: ({ unifiedRows, kpis }) => {
        setRawRows(unifiedRows || []);
        setFetchedKpis(kpis || null);
      }
    });

    fetchTestTimings().then((t) => setTestTimings(t || {}));
    return () => unsub && unsub();
  }, [source, dateRange]);

  // 2. DATA ASSIGNMENT
  const deptRows = useMemo(() => {
    return rawRows.map(r => ({
      ...r,
      times: [r.timeScanned, r.timeSaved, r.timeValidated].filter(Boolean)
    }));
  }, [rawRows]);

  // 3. CALCULATE SLOWEST ENTRY
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

  // 4. MERGED KPIs (Trusting the fetcher!)
  const kpis = useMemo(() => {
    if (!fetchedKpis) return null;
    return {
      ...fetchedKpis,
      slowestEntry: slowestEntry 
    };
  }, [fetchedKpis, slowestEntry]);

  // 5. COUNTS FOR CHARTS
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

  // 6. SLA VIOLATORS
  const violators = useMemo(
    () => computeSLAViolations(deptRows, testTimings, "scanned_to_saved"),
    [deptRows, testTimings]
  );

  return (
    <div className="owner-root">
      <header className="owner-header">
        <h1>Rapid Card — Analytics</h1>
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
      {/* 🟢 This now passes the 'totalPatientsCritical' found in kpis */}
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
                department="rapid"
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