
import React, { useEffect, useState, useContext } from "react";
import { OwnerContext } from "../owner/OwnerContext.jsx";
import DateSourceFilter from "../owner/components/DateSourceFilter";
import KPIBlocks from "../owner/components/KPIBlocksOutsource";
import DelayTable from "../owner/components/DelayTable";
import PatientListModal from "../owner/components/PatientListModalOutsource";
import CountsBar from "../owner/charts/CountsBarOutsource";
import StackedStageLines from "../owner/charts/StackedStageLinesOutsource";
import TimeBricks from "../owner/charts/TimeBricksOutsource";
import SLAScoreDonut from "../owner/charts/SLAScoreDonut";
import DelayHistogram from "../owner/charts/DelayHistogram";

import * as OutsourceFetcher from "../owner/lib/dataFetcher_outsource.js";
import testTimingsJson from "../owner/data/test_timings.json";

// ADDED RELIABLE HERE
const TABS = [
  { id: "SterlingRegister", label: "Sterling", lab: "STERLING" },
  { id: "NeubergRegister", label: "Neuberg", lab: "NEUBERG" },
  { id: "LifecellRegister", label: "Lifecell", lab: "LIFECELL" },
  { id: "LilacRegister", label: "Lilac", lab: "LILAC" },
  { id: "ReliableRegister", label: "Reliable", lab: "RELIABLE" }
];

export default function OwnerOutsourcePage() {
  const { dateRange, source } = useContext(OwnerContext); 
  const [activeReg, setActiveReg] = useState("SterlingRegister");
  const [activeSubTab, setActiveSubTab] = useState("overview");
  
  const [data, setData] = useState({ 
    unifiedRows: [], 
    kpis: {}, 
    violators: [], 
    totalCount: 0, 
    withinCount: 0 
  });
  
  const [openModal, setOpenModal] = useState(false);
  const [modalData, setModalData] = useState([]);

  const currentTab = TABS.find(t => t.id === activeReg);

  useEffect(() => {
    const unsub = OutsourceFetcher.subscribeOverview({
      dateRange,
      source, 
      activeRegister: activeReg,
      targetLab: currentTab.lab,
      onData: (payload) => {
        setData(payload);
      }
    });
    return () => unsub();
  }, [dateRange, activeReg, currentTab.lab, source]); 

  const violators = data.violators || [];

  return (
    <div className="owner-root">
      <header className="owner-header">
        <h1>Outsource Lab Analytics</h1>
        <div className="tab-buttons">
          {TABS.map(tab => (
            <button 
              key={tab.id} 
              className={activeReg === tab.id ? "active" : ""} 
              onClick={() => setActiveReg(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="tab-buttons" style={{ marginTop: 12 }}>
          <button className={activeSubTab === "overview" ? "active" : ""} onClick={() => setActiveSubTab("overview")}>Overview</button>
          <button className={activeSubTab === "delays" ? "active" : ""} onClick={() => setActiveSubTab("delays")}>Delays</button>
          <button className={activeSubTab === "timebricks" ? "active" : ""} onClick={() => setActiveSubTab("timebricks")}>Time Bricks</button>
        </div>
      </header>

      <DateSourceFilter />
      <KPIBlocks kpis={data.kpis} />

      {/* OVERVIEW TAB */}
      {activeSubTab === "overview" && (
        <section className="owner-charts">
          <div className="chart-card">
            <h3>Counts Bar</h3>
            <div style={{ height: "250px" }}>
               <CountsBar counts={data.kpis} />
            </div>
          </div>
          <div className="chart-card">
            <h3>Stacked Stage Timeline</h3>
            <div style={{ height: "250px" }}>
               <StackedStageLines unifiedRows={data.unifiedRows} />
            </div>
          </div>
        </section>
      )}

      {/* DELAYS TAB */}
      {activeSubTab === "delays" && (
        <section className="owner-charts">
          <div className="chart-card">
            <h3>Delay Histogram</h3>
            <div style={{ height: "220px", width: "100%" }}>
              <DelayHistogram violators={violators} />
            </div>
          </div>
          
          <div className="chart-card">
            <h3>SLA Score ({currentTab.label})</h3>
            <div style={{ height: "220px", width: "100%" }}>
              <SLAScoreDonut total={data.totalCount} within={data.withinCount} />
            </div>
          </div>

          <div className="chart-card full-width">
            <DelayTable violators={violators} />
          </div>
        </section>
      )}

      {/* TIME BRICKS TAB */}
      {activeSubTab === "timebricks" && (
        <section className="owner-charts" style={{ display: 'block' }}>
          <div className="chart-card full-width" style={{ padding: '20px', minHeight: 'unset' }}>
            <h3 style={{ marginBottom: '15px' }}>Time Bricks Chart</h3>
            <TimeBricks 
              unifiedRows={data.unifiedRows} 
              testTimings={testTimingsJson} 
              fromDate={dateRange.from} 
              toDate={dateRange.to}     
              onBrickClick={(clickedPatient) => { 
                setModalData([clickedPatient]); 
                setOpenModal(true); 
              }}
            />
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