
import React, { useEffect, useState } from "react";

import {
  collection,
  onSnapshot,
  query,
  orderBy
} from "firebase/firestore";

import { db } from "../firebaseConfig.js";

import LiveInventoryTab from "./tabs/LiveInventoryTab";
import ExpirySurveillanceTab from "./tabs/ExpirySurveillanceTab";
import QCMonitorTab from "./tabs/QCMonitorTab";
import ConsumptionLedgerTab from "./tabs/ConsumptionLedgerTab";
import CostAnalyticsTab from "./tabs/CostAnalyticsTab";
import ConsumedInventoryTab
from "./tabs/ConsumedInventoryTab";

const InventoryCommandCenter = () => {

  const [activeTab, setActiveTab] = useState("Inventory");

  const [inventoryLogs, setInventoryLogs] = useState([]);
  const [qcLogs, setQCLogs] = useState([]);
  const [calibrationLogs, setCalibrationLogs] = useState([]);
  const [ledgerEntries, setLedgerEntries] = useState([]);

  useEffect(() => {

    const unsubInventory = onSnapshot(
      collection(db, "inventory_logs"),
      (snapshot) => {

        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setInventoryLogs(data);
      }
    );

    const unsubQC = onSnapshot(
      query(
        collection(db, "qc_logs"),
        orderBy("timestamp", "desc")
      ),
      (snapshot) => {

        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setQCLogs(data);
      }
    );

    const unsubCalibration = onSnapshot(
      query(
        collection(db, "calibration_logs"),
        orderBy("timestamp", "desc")
      ),
      (snapshot) => {

        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setCalibrationLogs(data);
      }
    );

    const unsubLedger = onSnapshot(
      query(
        collection(db, "consumption_ledger"),
        orderBy("timestamp", "desc")
      ),
      (snapshot) => {
    
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
    
        setLedgerEntries(data);
      }
    );

    return () => {
      unsubInventory();
      unsubQC();
      unsubCalibration();
      unsubLedger();
    };

  }, []);

  return (

    <div className="inventory-command-center">

      <div className="command-center-header">

        <h1>Inventory Command Center</h1>

        <div className="command-tabs">

                <button 
                className={
                activeTab === "Inventory"
                ? "active-tab"
                 : ""
                }
                onClick={() => setActiveTab("Inventory")}
                >
                 Inventory
               </button>

         
         
               <button
          className={activeTab === "Expiry" ? "active-tab" : ""}
         onClick={() => setActiveTab("Expiry")}
          >
           Expiry

          </button>

    

        <button  
        className={activeTab === "QC" ? "active-tab" : ""}
        onClick={() => setActiveTab("QC")}
        >
        QC & Calibration
        </button>



        <button 
          className={activeTab === "Ledger" ? "active-tab" : ""}
          onClick={() => setActiveTab("Ledger")}
        >
          Consumption Ledger

        </button>

        <button
          className={
            activeTab === "Cost"
              ? "active-tab"
              : ""
          }
          onClick={() => setActiveTab("Cost")}
        >
          Cost Analytics
        </button>

       <button
          className={
            activeTab === "Consumed"
              ? "active-tab"
              : ""
          }
          onClick={() =>
            setActiveTab("Consumed")
          }
        >
          Consumed Inventory
      </button>

        </div>

      </div>

      {activeTab === "Inventory" && (
        <LiveInventoryTab
          inventoryLogs={inventoryLogs}
        />
      )}

      {activeTab === "Expiry" && (
        <ExpirySurveillanceTab
          inventoryLogs={inventoryLogs}
        />
      )}

      {activeTab === "QC" && (
        <QCMonitorTab
          qcLogs={qcLogs}
          calibrationLogs={calibrationLogs}
        />
      )}

      {activeTab === "Ledger" && (
        <ConsumptionLedgerTab
          ledgerEntries={ledgerEntries}
        />
      )}
      
      {activeTab === "Cost" && (
        <CostAnalyticsTab
          ledgerEntries={ledgerEntries}
          inventory={inventoryLogs}
        />
      )}

      {activeTab === "Consumed" && (
        <ConsumedInventoryTab
          inventoryLogs={inventoryLogs}
        />
      )}

    </div>

  );

};

export default InventoryCommandCenter;


