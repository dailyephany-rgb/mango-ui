
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
  minutesDiff,
} from "./lib/dataFetcher_haem.js";

export default function OwnerHaemPage() {
  const { dateRange, source } = useContext(OwnerContext);

  const [rawRows, setRawRows] = useState([]);
  const [fetchedKpis, setFetchedKpis] = useState(null);
  const [testTimings, setTestTimings] = useState({});
  
  const [activeTab, setActiveTab] = useState("overview");
  const [openModal, setOpenModal] = useState(false);
  const [modalData, setModalData] = useState([]);

  useEffect(() => {
    const unsub = subscribeOverview({
      source,
      dateRange,
      onData: ({ unifiedRows, kpis }) => {
        setRawRows(unifiedRows || []);
        setFetchedKpis(kpis || null);
      },
    });

    fetchTestTimings().then((t) => setTestTimings(t || {}));
    return () => unsub && unsub();
  }, [source, dateRange]);

  const deptRows = useMemo(() => {
    return rawRows.map(r => ({
      ...r,
      times: [r.timeScanned, r.timeSaved, r.timeValidated].filter(Boolean)
    }));
  }, [rawRows]);

  const slowestEntry = useMemo(() => {
    let slowest = null;
    deptRows.forEach((r) => {
      const delay = minutesDiff(r.timeScanned, r.timeSaved);
      if (delay !== null && (!slowest || delay > slowest.delay)) {
        slowest = {
          regNo: r.regNo,
          patientName: r.patientName || r.name || "Unknown",
          delay: delay,
          tests: r.tests || []
        };
      }
    });
    return slowest;
  }, [deptRows]);

  const kpis = useMemo(() => {
    if (!fetchedKpis) return null;
    return { ...fetchedKpis, slowestEntry };
  }, [fetchedKpis, slowestEntry]);

  const countsForBar = useMemo(() => ({
    totalPrinted: kpis?.totalPatientsCollected ?? 0,
    scanned: deptRows.filter((r) => r.timeScanned).length,
    saved: deptRows.filter((r) => r.isSaved || r.timeSaved).length,
    validated: deptRows.filter((r) => r.isValidated || r.timeValidated).length,
  }), [deptRows, kpis]);

  const overviewForKPI = {
    totalPrinted: kpis?.totalPatientsCollected ?? 0,
    scanned: countsForBar.scanned,
    saved: countsForBar.saved,
    validated: countsForBar.validated,
  };

  const violators = useMemo(
    () => computeSLAViolations(deptRows, testTimings, "scanned_to_saved"),
    [deptRows, testTimings]
  );

  return (
    <div className="owner-root">
      <header className="owner-header">
        <h1>Haematology — Analytics</h1>
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
      <KPIBlocks overview={overviewForKPI} kpis={kpis || {}} />

      {activeTab === "overview" && (
        <section className="owner-charts">
          <div className="chart-card"><CountsBar counts={countsForBar} /></div>
          <div className="chart-card"><StackedStageLines unifiedRows={deptRows} /></div>
        </section>
      )}

      {activeTab === "delays" && (
        <section className="owner-charts">
          <div className="chart-card"><DelayHistogram violators={violators} /></div>
          <div className="chart-card">
            <SLAScoreDonut total={deptRows.length} within={deptRows.length - violators.length} />
          </div>
          <div className="chart-card full-width"><DelayTable violators={violators} /></div>
        </section>
      )}

      {activeTab === "timebricks" && (
        <section className="owner-charts">
          <div className="chart-card full-width" style={{ overflow: 'visible' }}>
            <h3>Time Bricks Chart</h3>
            <TimeBricks
              unifiedRows={deptRows}
              testTimings={testTimings}
              department="haem"
              onBrickClick={(p) => {
                setModalData([p]);
                setOpenModal(true);
              }}
            />
          </div>
        </section>
      )}

      <PatientListModal open={openModal} onClose={() => setOpenModal(false)} patients={modalData} />
    </div>
  );
}