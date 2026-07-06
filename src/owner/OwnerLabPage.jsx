


import React, { useEffect, useState, useContext } from "react";
import { OwnerContext } from "../owner/OwnerContext.jsx";

import DateSourceFilter from "../owner/components/DateSourceFilter";
import KPIBlocks from "../owner/components/KPIBlocksInside";
import DelayTable from "../owner/components/DelayTable";
import PatientListModal from "../owner/components/PatientListModalInside";

import CountsBar from "../owner/charts/CountsBarInside";
import StackedStageLines from "../owner/charts/StackedStageLinesInside";
import TimeBricks from "../owner/charts/TimeBricks";
import SLAScoreDonut from "../owner/charts/SLAScoreDonut";
import DelayHistogram from "../owner/charts/DelayHistogram";
import StaffDistribution from "../owner/charts/StaffDistribution";

import * as LabFetcher from "../owner/lib/dataFetcher_lab.js";
import testTimingsJson from "../owner/data/test_timings.json";

const TABS = [
  { id: "FnacRegister", label: "FNAC", dept: "FNAC" },
  { id: "PathologyRegister", label: "Pathology", dept: "PATHOLOGY" },
  { id: "CultureRegister", label: "Culture", dept: "CULTURE" },
  { id: "FluidRegister", label: "Fluid", dept: "FLUID" }
];

export default function OwnerLabPage() {
  const { dateRange, source } = useContext(OwnerContext); 
  
  const [activeReg, setActiveReg] = useState("FnacRegister");
  const [activeSubTab, setActiveSubTab] = useState("overview");
  const [data, setData] = useState({
    unifiedRows: [],
    kpis: {},
  
    savedByDistribution: [],
  
    violators: [],
    totalCount: 0,
    withinCount: 0
  });

  
  const [openModal, setOpenModal] = useState(false);
  const [modalData, setModalData] = useState([]);

  const currentTab = TABS.find(t => t.id === activeReg);

  useEffect(() => {
    const unsub = LabFetcher.subscribeOverview({
      dateRange,
      source, 
      activeRegister: activeReg,
      targetDept: currentTab.dept,
      onData: (payload) => setData(payload)
    });
    return () => unsub();
  }, [dateRange, activeReg, currentTab.dept, source]); 

  const violators = data.violators || [];

  return (
    <div className="owner-root">
      <header className="owner-header">
        <h1>Inside Lab Analytics</h1>
        
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
          <button
          className={activeSubTab === "staff" ? "active" : ""}
          onClick={() => setActiveSubTab("staff")}>
          Staff Analytics
        </button>
        </div>
      </header>

      <DateSourceFilter />
      <KPIBlocks kpis={data.kpis} />

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

      {activeSubTab === "delays" && (
        <section className="owner-charts">
          <div className="chart-card">
            <h3>Delay Histogram</h3>
            <div style={{ height: "220px" }}>
              <DelayHistogram violators={violators} />
            </div>
          </div>
          <div className="chart-card">
            <h3>SLA Score ({currentTab.label})</h3>
            <div style={{ height: "220px" }}>
              <SLAScoreDonut
                total={data.totalCount} 
                within={data.withinCount} 
              />
            </div>
          </div>
          <div className="chart-card full-width">
            <DelayTable violators={violators} />
          </div>
        </section>
      )}

      {activeSubTab === "timebricks" && (
        <section className="owner-charts">
          <div className="chart-card full-width">
            <h3>Time Bricks Chart</h3>
            <div style={{ height: '600px', width: '100%', background: '#fff', borderRadius: '8px' }}>
              <TimeBricks 
                unifiedRows={data.unifiedRows} 
                testTimings={testTimingsJson} 
                targetDept={currentTab.dept}
                onBrickClick={(clickedPatient) => {
                  setModalData([clickedPatient]);
                  setOpenModal(true);
                }}
              />
            </div>
          </div>
        </section>
      )}


            {/* STAFF ANALYTICS TAB */}
      {activeSubTab === "staff" && (
        <section className="owner-charts">
          <div
            className="chart-card full-width"
            style={{ minHeight: "480px" }}
          >
            <h3>Saved By Distribution</h3>

            <StaffDistribution
              data={data.savedByDistribution}
            />
          </div>
        </section>
      )}

      <PatientListModal 
        open={openModal} 
        onClose={() => setOpenModal(false)} 
        patients={modalData.map(p => ({
          ...p,
          timeValidated: null,
          isValidated: false
        }))} 
      />
    </div>
  );
}