
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
import StaffDistribution from "../owner/charts/StaffDistribution";

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
  const [selectedDelayStage,setSelectedDelayStage] = useState("turnaround");
  const [selectedStaffStage, setSelectedStaffStage] =
  useState("collectedBy");
  const [selectedOverviewStage, setSelectedOverviewStage] =
  useState("turnaround");
  const [searchTerm, setSearchTerm] =
  useState("");


  const [data, setData] = useState({
    unifiedRows: [],
    kpis: {},
  
    collectedByDistribution: [],
    receivedByDistribution: [],
    deliveredByDistribution: [],
  
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


  const stageViolators = React.useMemo(() => {
    if (!data.unifiedRows?.length) {
      return [];
    }
  
    return data.unifiedRows
      .map((r) => {
        let duration = null;

        // ADD THIS BLOCK
    
    if ( selectedDelayStage === "collectedToOutsourced"
    ) {
      if (
        !r.timeCollected ||
        !r.timeScanned
      ) {
        return null;
      }

      duration = Math.round(
        (
          new Date(r.timeScanned) -
          new Date(r.timeCollected)
        ) / 60000
      );
    }
  
        else if (
          selectedDelayStage ===
          "outsourcedToReceived"
        ) {
          if (
            !r.timeScanned ||
            !r.timeSaved
          ) {
            return null;
          }
  
          duration = Math.round(
            (
              new Date(r.timeSaved) -
              new Date(r.timeScanned)
            ) / 60000
          );
        }
  
        else if (
          selectedDelayStage ===
          "receivedToDelivered"
        ) {
          if (
            !r.timeSaved ||
            !r.timeGiven
          ) {
            return null;
          }
  
          duration = Math.round(
            (
              new Date(r.timeGiven) -
              new Date(r.timeSaved)
            ) / 60000
          );
        }
        
        else {
          if (
            !r.timeCollected ||
            !r.timeGiven
          ) {
            return null;
          }
        
          duration = Math.round(
            (
              new Date(r.timeGiven) -
              new Date(r.timeCollected)
            ) / 60000
          );
        }
  
        return {
          regNo: r.regNo,
          diagnosticNo: r.diagnosticNo,
          name: r.name,
          test: r.test,
          department: currentTab.label,
          duration,
          excess: duration,
          status: "delay",
        
          collectedBy: r.collectedBy,
          receivedBy: r.receivedBy,
          deliveredBy: r.deliveredBy
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          b.duration -
          a.duration
      );
  }, [
    data.unifiedRows,
    selectedDelayStage,
    currentTab.label
  ]);

  const slaMetrics = React.useMemo(() => {
    const rows =
      data.unifiedRows || [];
  
    let total = 0;
    let within = 0;
  
    rows.forEach((r) => {
      let duration = null;
      let allowed = 0;
  
      const labConfig =
        testTimingsJson[
          currentTab.lab
        ] || {};

      const collectedToOutsourcedLimit = labConfig.collected_to_outsourced ?? 0;

      const outsourcedToReceivedLimit =labConfig.outsource_collected_to_received ?? 0;

      const receivedToDeliveredLimit =labConfig.received_to_delivered ?? 0;
     
      const turnaroundLimit = labConfig.turnaround ??
      (collectedToOutsourcedLimit +outsourcedToReceivedLimit +
       receivedToDeliveredLimit);
  
      
        if (
          selectedDelayStage ===
          "collectedToOutsourced"
        ) {
          if (
            !r.timeCollected ||
            !r.timeScanned
          ) {
            return;
          }
        
          duration =
            (
              new Date(r.timeScanned) -
              new Date(r.timeCollected)
            ) / 60000;
        
          allowed =
            collectedToOutsourcedLimit;
        }

      else if (
        selectedDelayStage ===
        "outsourcedToReceived"
      ) {
        if (
          !r.timeScanned ||
          !r.timeSaved
        ) {
          return;
        }
  
        duration =
          (new Date(r.timeSaved) -
            new Date(r.timeScanned)) /
          60000;
  
          allowed = outsourcedToReceivedLimit;
      }
  
      else if (
        selectedDelayStage ===
        "receivedToDelivered"
      ) {
        if (
          !r.timeSaved ||
          !r.timeGiven
        ) {
          return;
        }
  
        duration =
          (new Date(r.timeGiven) -
            new Date(r.timeSaved)) /
          60000;
  
          allowed =
          receivedToDeliveredLimit;
      }
  
      else {
        if (
          !r.timeCollected ||
          !r.timeGiven
        ) {
          return;
        }
      
        duration =
          (
            new Date(r.timeGiven) -
            new Date(r.timeCollected)
          ) / 60000;
      
        allowed = turnaroundLimit;
      }
  
      total++;
  
      if (duration <= allowed) {
        within++;
      }
    });
  
    return {
      total,
      within
    };
  }, [
    data.unifiedRows,
    selectedDelayStage,
    currentTab.lab
  ]);

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
          <button
            className={activeSubTab === "overview" ? "active" : ""}
            onClick={() => setActiveSubTab("overview")}
          >
            Overview
          </button>

          <button
            className={activeSubTab === "delays" ? "active" : ""}
            onClick={() => setActiveSubTab("delays")}
                >
          Delays
        </button>


        <button
          className={activeSubTab === "timebricks" ? "active" : ""}
          onClick={() => setActiveSubTab("timebricks")}
        >
          Time Bricks
        </button>

        <button
          className={activeSubTab === "staff" ? "active" : ""}
          onClick={() => setActiveSubTab("staff")}
        >
          Staff Analytics
        </button>
        
      </div>

      </header>

      <DateSourceFilter />
      <KPIBlocks kpis={data.kpis} />

      {/* OVERVIEW TAB */}
  
      {activeSubTab === "overview" && (
  <>

    <section className="owner-charts">
      <div className="chart-card">
        <h3>Counts Bar</h3>

        <div style={{ height: "250px" }}>
          <CountsBar counts={data.kpis} />
        </div>
      </div>

      <div className="chart-card">
  <h3>Stacked Stage Timeline</h3>

  
  <div
  style={{
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "12px"
  }}
>
  <select
    value={selectedOverviewStage}
    onChange={(e) =>
      setSelectedOverviewStage(e.target.value)
    }
    style={{
      width: "300px",
      padding: "8px 12px",
      borderRadius: "8px",
      border: "1px solid #d1d5db",
      fontSize: "14px"
    }}
  >
    <option value="turnaround">
      Overall Turnaround
    </option>

    <option value="collected">
      Collected → Outsourced Collected
    </option>

    <option value="received">
      Outsourced Collected → Report Received
    </option>

    <option value="delivered">
      Report Received → Report Delivered
    </option>
  </select>

  <input
    type="text"
    placeholder="Search Reg No or Diag No"
    value={searchTerm}
    onChange={(e) =>
      setSearchTerm(e.target.value)
    }
    style={{
      flex: 1,
      padding: "8px 12px",
      borderRadius: "8px",
      border: "1px solid #d1d5db",
      fontSize: "14px"
    }}
  />
  </div>

  <div style={{ height: "500px" }}>
      <StackedStageLines
      unifiedRows={data.unifiedRows}
      stage={selectedOverviewStage}
      searchTerm={searchTerm}
    />
  </div>
</div>

    </section>
  </>
)}


     {/* DELAYS TAB */}
{activeSubTab === "delays" && (
  <>

    <div
      style={{
        marginBottom: "20px"
      }}
    >
      <select
        value={selectedDelayStage}
        onChange={(e) =>
          setSelectedDelayStage(
            e.target.value
          )
        }
        style={{
          width: "100%",
          padding: "10px 14px",
          borderRadius: "10px",
          border: "1px solid #d1d5db",
          background: "#fff",
          fontSize: "15px"
        }}
      >
        <option value="collectedToOutsourced">
          Collected → Outsourced Collected
        </option>

        <option value="outsourcedToReceived">
        Outsourced Collected → Report Received
        </option>

        <option value="receivedToDelivered">
          Report Received → Report Delivered
        </option>

        <option value="turnaround">
          Total Turnaround
        </option>
      </select>
    </div>

    <section className="owner-charts">

      <div className="chart-card">
              
            
            <div style={{ height: "220px", width: "100%" }}>
            <DelayHistogram violators={stageViolators}/>
            </div>
          </div>
          
          <div className="chart-card">
            <h3>SLA Score ({currentTab.label})</h3>
            <div style={{ height: "220px", width: "100%" }}>
            <SLAScoreDonut total={slaMetrics.total}within={slaMetrics.within}/>
            </div>
          </div>

          <div className="chart-card full-width">
          <h3>
            {
              selectedDelayStage ===
              "collectedToOutsourced"
                ? "Collected → Outsourced Collected Delay Table"
                : selectedDelayStage ===
                "outsourcedToReceived"
                ? "Outsourced Collected → Report Received Delay Table"
                : selectedDelayStage ===
                  "receivedToDelivered"
                ? "Report Received → Report Delivered Delay Table"
                : "Total Turnaround Delay Table"
            }
          </h3>

            <DelayTable
              violators={stageViolators}
              stage={
                selectedDelayStage === "collectedToOutsourced"
                  ? "collected_to_outsourced"
                  : selectedDelayStage === "outsourcedToReceived"
                  ? "outsourced_to_received"
                  : selectedDelayStage === "receivedToDelivered"
                  ? "received_to_delivered"
                  : "turnaround"
              }
            />
          </div>
          </section></>
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

    {/* STAFF TAB */}
{activeSubTab === "staff" && (
  <>
    <div
      style={{
        marginBottom: "20px"
      }}
    >
      <select
        value={selectedStaffStage}
        onChange={(e) =>
          setSelectedStaffStage(e.target.value)
        }
        style={{
          width: "100%",
          padding: "10px 14px",
          borderRadius: "10px",
          border: "1px solid #d1d5db",
          background: "#fff",
          fontSize: "15px"
        }}
      >
        <option value="collectedBy">
          Collected By
        </option>

        <option value="receivedBy">
          Report Received By
        </option>

        <option value="deliveredBy">
          Report Delivered By
        </option>
      </select>
    </div>

    <section className="owner-charts">
      <div
        className="chart-card full-width"
        style={{ minHeight: "480px" }}
      >
        <StaffDistribution
          data={
            selectedStaffStage === "collectedBy"
              ? data.collectedByDistribution
              : selectedStaffStage === "receivedBy"
              ? data.receivedByDistribution
              : data.deliveredByDistribution
          }
        />
      </div>
    </section>
  </>
)}

      <PatientListModal 
        open={openModal} 
        onClose={() => setOpenModal(false)} 
        patients={modalData} 
      />
    </div>
  );
}