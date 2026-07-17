
import React, { useState, useEffect, useMemo } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  query,
  doc,
  writeBatch,
  updateDoc,
  addDoc,
  serverTimestamp
} from "firebase/firestore";

import { addConsumptionLedgerEntry } from "../inventory-command-center/utils/consumptionledger";


import "./DeptInventory.css";

export default function HaemInventoryTab() {
  const [activeHaemTab, setActiveHaemTab] = useState("3-part");
  const [inventory, setInventory] = useState([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [expandedReagent, setExpandedReagent] = useState(null);

  // --- POP-UP MODAL STATES ---
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [showQCModal, setShowQCModal] = useState(false);
  const [maintenanceReason, setMaintenanceReason] = useState("Routine");
  const [maintenanceDeductions, setMaintenanceDeductions] = useState({});
  const [qcSelections, setQCSelections] = useState({});
  const [qcReason, setQCReason] = useState("DAILY");
  const [otherReason, setOtherReason] = useState("");
  const [qcResult, setQCResult] = useState("Success");
  const [qcLevel, setQCLevel] = useState("LEVEL I");
  const [qcPerformedBy, setQCPerformedBy] = useState("");
  const [baseLineValue, setBaseLineValue] = useState("");
  const [actualOutput, setActualOutput] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [preventativeAction, setPreventativeAction] = useState("");
  const [showWasteModal, setShowWasteModal] = useState(false);
  const [wasteDeductions, setWasteDeductions] = useState({});

  // 1. MACHINE SPECIFICATIONS
  const machineSpecs = {
    "3-part": {
      reagents: ["ABX MINIDIL 10 LTR", "ABX LYSBIO 400 ML"],
      consumables: ["ABX MINICLEAN 1 LTR"],
    },
    "5-part": {
      reagents: ["ABX WHITEDIFF 1 LTR", "ABX DILUENT 20 LTR"],
      maintenance: ["ABX MINOCLEAR 500 ML"],
      consumables: ["ABX CLEANER 1 LTR"],
      controls: ["ABX DIFFTROL (CONTROL) 1*3 ML/ 3 BOTTLES"]
    }
  };

  // 2. DATA FETCHING
  useEffect(() => {
    const q = query(collection(db, "inventory_logs"));
    const unsub = onSnapshot(q, (snap) => {
      const logs = snap.docs.map(d => ({ ...d.data(), id: String(d.id) }));
      const filtered = logs.reduce((acc, item) => {
        const name = item.reagentName?.toUpperCase().trim() || "";
        const s3 = machineSpecs["3-part"];
        const s5 = machineSpecs["5-part"];
        let group = null;
        let machine = null;

        if (s3.reagents.some(r => name.includes(r))) { group = "Reagents"; machine = "3-part"; }
        else if (s3.consumables.some(c => name.includes(c))) { group = "Consumables"; machine = "3-part"; }

        if (!group) {
          if (s5.reagents.some(r => name.includes(r))) { group = "Reagents"; machine = "5-part"; }
          else if (s5.maintenance.some(m => name.includes(m))) { group = "Maintenance"; machine = "5-part"; }
          else if (s5.consumables.some(c => name.includes(c))) { group = "Consumables"; machine = "5-part"; }
          else if (s5.controls.some(ctrl => name.includes(ctrl))) { group = "Controls"; machine = "5-part"; }
        }

        if (group) {
          acc.push({ ...item, haemGroup: group, belongsTo: machine });
        }
        return acc;
      }, []);
      setInventory(filtered);
    });
    return () => unsub();
  }, []);

  // 3. CATEGORY SEPARATION (MEMOIZED - FIXED PIC-1 TO PIC-2 DELAY)
  const activeReagents = useMemo(() => {
    return inventory.filter(i =>
      i.haemGroup === "Reagents" && i.status === "Activated" &&
      i.machineAssigned === activeHaemTab && i.belongsTo === activeHaemTab
    );
  }, [inventory, activeHaemTab]);

  const activeMaintenance = useMemo(() => {
    return inventory.filter(i =>
      i.haemGroup === "Maintenance" && i.status === "Activated" &&
      i.machineAssigned === activeHaemTab && i.belongsTo === activeHaemTab
    );
  }, [inventory, activeHaemTab]);

  const activeConsumables = useMemo(() => {
    return inventory.filter(i =>
      i.haemGroup === "Consumables" && i.status === "Activated" &&
      i.machineAssigned === activeHaemTab && i.belongsTo === activeHaemTab
    );
  }, [inventory, activeHaemTab]);

  const activeControls = useMemo(() => {
    return inventory.filter(i =>
      i.haemGroup === "Controls" && i.status === "Activated" &&
      i.machineAssigned === activeHaemTab && i.belongsTo === activeHaemTab
    );
  }, [inventory, activeHaemTab]);

  // 4. STORAGE LOGIC (MEMOIZED)
  const groupedStorage = useMemo(() => {
    const itemsInStorage = inventory.filter(i => 
      i.status === "In Storage" && i.belongsTo === activeHaemTab
    );

    const groups = itemsInStorage.reduce((acc, item) => {
      const name = item.reagentName;
      if (!acc[name]) acc[name] = { name, totalQty: 0, batches: [] };
      acc[name].totalQty += Number(item.quantity);
      acc[name].batches.push(item);
      return acc;
    }, {});

    Object.values(groups).forEach(g => {
      g.batches.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    });
    return groups;
  }, [inventory, activeHaemTab]);

  const getRemainingQty = (item) => {

    if (item.inventoryUnit === "ML") {
      return Number(item.totalML || 0);
    }
  
    return Number(item.totalTests || 0);
  };
  
  const getHealthPercent = (item) => {
  
    const remaining = getRemainingQty(item);
  
    const total = Number(item.inventoryQty || 0);
  
    if (!total) return 0;
  
    return Math.round((remaining / total) * 100);
  };


  const getHealthColor = (pct) => {
    if (pct > 50) return "bg-high";
    if (pct > 15) return "bg-medium";
    return "bg-low";
  };

  const getMachineName = (item) => {
    if (item.machineName) return item.machineName;
  
    if (item.machineAssigned === "3-part") return "3 Part Machine";
    if (item.machineAssigned === "5-part") return "5 Part Machine";
  
    return activeHaemTab === "3-part"
      ? "3 Part Machine"
      : "5 Part Machine";
  };

  const handleConfirmMaintenance = async () => {
    const selections = Object.keys(maintenanceDeductions).filter(id => Number(maintenanceDeductions[id]) > 0);
    try {
      const batch = writeBatch(db);
      for (const id of selections) {
        const qty = Number(maintenanceDeductions[id]);
        const item = inventory.find(i => i.id === id);
        if (item) {
         
          const currentQty =
  item.inventoryUnit === "ML"
    ? Number(item.totalML || 0)
    : Number(item.totalTests || 0);

const newTotal =
  Math.max(0, currentQty - qty);

const initialCapacity =
  Number(item.inventoryQty) || 1;

const newHealth =
  Math.round(
    (newTotal / initialCapacity) * 100
  );

batch.update(
  doc(db, "inventory_logs", id),

  item.inventoryUnit === "ML"
    ? {
        totalML: newTotal,
        health: newHealth,
        status:
          newTotal <= 0
            ? "Consumed"
            : "Activated"
      }
    : {
        totalTests: newTotal,
        health: newHealth,
        status:
          newTotal <= 0
            ? "Consumed"
            : "Activated"
      }
      );
      await addConsumptionLedgerEntry({
        productName:
          item.reagentName || "Unknown",
      
        batchNo:
          item.lotNo ||
          item.batchNo ||
          "N/A",
          boxNo: item.boxNo || "",
      
          machine: getMachineName(item),

         metricType:
            item.metricType || "",
      
        inventoryType: "Maintenance",
      
        testName:
          maintenanceReason || "Maintenance",
      
        actionType: "Maintenance",
      
        qty
      });
    }}
      await addDoc(collection(db, "maintenance_logs"), {
        timestamp: serverTimestamp(),
        reason: maintenanceReason,
        machine: activeHaemTab,
        department: "Haematology",
        deductions: maintenanceDeductions
      });
      await batch.commit();
      setMaintenanceDeductions({});
      setShowMaintenanceModal(false);
    } catch (err) { console.error(err); }
  };

 
  const handleConfirmQC = async () => {
    const selections = Object.keys(qcSelections)
    .filter(id => qcSelections[id]);

  // 🔥 VALIDATION (ADD THIS BLOCK)
  if (selections.length === 0) {
    alert("Please select at least one control.");
    return;
  }

  if (qcReason === "OTHER" && !otherReason.trim()) {
    alert("Please specify reason.");
    return;
  }

  try {
    const batch = writeBatch(db);
  
    const selectedControl = activeControls[0];
  
    const qcAuditDetails = [];
    let controlNames = [];
  
    for (const id of selections) {
      const qty = 1;
        const item = inventory.find(i => i.id === id);
        if (item) {

          qcAuditDetails.push({
            controlName: item.reagentName,
            quantityUsed: qty,
            lotNumber: item.lotNo || "N/A",
            boxNo: item.boxNo || "",
            expiryDate: item.expiryDate || "N/A"
          });

          await addConsumptionLedgerEntry({
            productName:
              item.reagentName || "Unknown",
          
            batchNo:
              item.lotNo ||
              item.batchNo ||
              "N/A",
              boxNo: item.boxNo || "",
          
              machine: getMachineName(item),
          
            inventoryType: "Control",

            metricType: item.metricType || "",

            level: qcLevel,
          
            testName: "QC Control",
          
            actionType: "QC",
          
            qty
          });
          
          controlNames.push(item.reagentName);
          
          const currentQty =
          item.inventoryUnit === "ML"
            ? Number(item.totalML || 0)
            : Number(item.totalTests || 0);
        
        const newTotal =
          Math.max(0, currentQty - qty);
        
        const initialCapacity =
          Number(item.inventoryQty) || 1;
        
        const newHealth =
          Math.round(
            (newTotal / initialCapacity) * 100
          );
        
        batch.update(
          doc(db, "inventory_logs", id),
        
          item.inventoryUnit === "ML"
            ? {
                totalML: newTotal,
                health: newHealth,
                status:
                  newTotal <= 0
                    ? "Consumed"
                    : "Activated"
              }
            : {
                totalTests: newTotal,
                health: newHealth,
                status:
                  newTotal <= 0
                    ? "Consumed"
                    : "Activated"
              }
        );
        }
      }


      await batch.commit();
      await addDoc(collection(db, "qc_logs"), {
        timestamp: serverTimestamp(),
        eventType: "Control",
        machine: getMachineName(selectedControl),
        performedBy: qcPerformedBy,
        batchNo: selectedControl?.lotNo || "N/A",
        boxNo: selectedControl?.boxNo || "",
        expiryDate: selectedControl?.expiryDate || "N/A",baseLineValue,
        actualOutput,
        controlNames: controlNames.join(", "),
        controlsUsed: qcAuditDetails,
        deductions: qcSelections,  
        reason: qcReason === "OTHER" ? otherReason : qcReason,
        result: qcResult,
        levelsUsed: qcLevel,
        rootCause: qcResult === "Failure" ? rootCause : "N/A",
        correctiveAction: qcResult === "Failure" ? correctiveAction : "N/A",
        preventativeAction: qcResult === "Failure" ? preventativeAction : "N/A"
      });
      

      setQCSelections({});

      setQCReason("DAILY");
      setQCResult("Success");
      setQCLevel("LEVEL I");
      setQCPerformedBy("");
      setBaseLineValue("");
      setActualOutput("");
      setOtherReason("");
      setRootCause("");
      setCorrectiveAction("");
      setPreventativeAction("");
      
      setShowQCModal(false);
    } catch (err) { console.error(err); }
  };


  const handleExcess = async (item) => {

    const unit =
      item.inventoryUnit ||
      item.packUnit ||
      "Tests";
  
    const excessVal = prompt(
      `Enter Excess ${unit} consumed for ${item.reagentName}:`
    );
  
    if (excessVal === null || excessVal === "") return;
  
    try {
  
      const deduction =
        Number(excessVal);
  
      const currentQty =
        item.inventoryUnit === "ML"
          ? Number(item.totalML || 0)
          : Number(item.totalTests || 0);
  
      const newTotal =
        Math.max(
          0,
          currentQty - deduction
        );
  
      const initialCapacity =
        Number(item.inventoryQty) || 1;
  
      const newHealth =
        Math.round(
          (newTotal / initialCapacity) * 100
        );
  
      await updateDoc(
        doc(db, "inventory_logs", item.id),
  
        item.inventoryUnit === "ML"
          ? {
              excessStatus: true,
              excessML: deduction,
              totalML: newTotal,
              health: newHealth
            }
          : {
              excessStatus: true,
              excessTests: deduction,
              totalTests: newTotal,
              health: newHealth
            }
      );
  
      await addConsumptionLedgerEntry({
        productName:
          item.reagentName || "Unknown",
  
        batchNo:
          item.batchNo || item.lotNo || "N/A",
        boxNo: item.boxNo || "",
  
        machine: getMachineName(item),
  
        inventoryType:
          item.haemGroup === "Controls"
            ? "Control"
            : item.haemGroup === "Consumables"
            ? "Consumable"
            : "Reagent",

        metricType:
            item.metricType || "",
  
        testName: "Excess",
  
        actionType: "Excess",
  
        qty: deduction
      });
  
      alert(
        "Excess logged. Inventory adjusted."
      );
  
    } catch (err) {
      console.error(err);
    }
  };

  


  const handleBonus = async (item) => {

    const unit =
      item.inventoryUnit ||
      item.packUnit ||
      "Tests";
  
    const val = prompt(
      `Enter Bonus ${unit} found for ${item.reagentName}:`
    );
  
    if (val === null || val === "") return;
  
    try {
  
      await updateDoc(
        doc(db, "inventory_logs", item.id),
  
        item.inventoryUnit === "ML"
          ? {
              bonusStatus: true,
              bonusML: Number(val),
              status: "Consumed",
              consumedAt: serverTimestamp()
            }
          : {
              bonusStatus: true,
              bonusTests: Number(val),
              status: "Consumed",
              consumedAt: serverTimestamp()
            }
      );
  
      await addConsumptionLedgerEntry({
        productName:
          item.reagentName || "Unknown",
  
        batchNo:
          item.batchNo || item.lotNo || "N/A",
        
        boxNo: item.boxNo || "",
  
        machine: getMachineName(item),
  
        inventoryType:
          item.haemGroup === "Controls"
            ? "Control"
            : item.haemGroup === "Consumables"
            ? "Consumable"
            : "Reagent",
  
        testName: "Bonus",

        metricType: item.metricType || "",
  
        actionType: "Bonus",
  
        qty: Number(val)
      });
  
    } catch (err) {
      console.error(err);
    }
  };





  const handleMarkConsumed = async (item) => {
    try {
      const unit =
        item.inventoryUnit ||
        item.packUnit ||
        "Tests";
  
      const remainingQty =
        getRemainingQty(item);
  
      if (remainingQty > 0) {
        if (
          !window.confirm(
            `${remainingQty} ${unit} are still remaining. Mark as Consumed?`
          )
        ) {
          return;
        }
      }
  
      await updateDoc(
        doc(db, "inventory_logs", item.id),
  
        item.inventoryUnit === "ML"
          ? {
              status: "Consumed",
              consumedAt: serverTimestamp(),
              totalML: 0,
              health: 0
            }
          : {
              status: "Consumed",
              consumedAt: serverTimestamp(),
              totalTests: 0,
              health: 0
            }
      );

      await addConsumptionLedgerEntry({
        productName:
          item.reagentName || "Unknown",
      
        batchNo:
          item.batchNo ||
          item.lotNo ||
          "N/A",
        boxNo: item.boxNo || "",
      
        machine: getMachineName(item),
      
        inventoryType:
          item.haemGroup === "Controls"
            ? "Control"
            : item.haemGroup === "Consumables"
            ? "Consumable"
            : item.haemGroup === "Maintenance"
            ? "Maintenance"
            : "Reagent",

          metricType:
            item.metricType || "",
      
        testName:
          item.haemGroup === "Consumables"
            ? "Consumable"
            : item.haemGroup === "Maintenance"
            ? "Maintenance"
            : "Consumed",
      
        actionType: "Consumed",
      
        qty: 1
      });
  
      alert("Marked as Consumed.");
  
    } catch (err) {
      console.error(err);
    }
  };



  const toggleSelection = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleConfirmActivation = async () => {
    if (selectedIds.length === 0) return;
    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => {
        const itemToActivate = inventory.find(i => i.id === id);
        if (itemToActivate) {
          const currentlyActive = inventory.filter(i =>
            i.reagentName === itemToActivate.reagentName &&
            i.status === "Activated" &&
            i.machineAssigned === activeHaemTab
          );
          currentlyActive.forEach(oldItem => {

            batch.update(
              doc(db, "inventory_logs", oldItem.id),
            
              oldItem.inventoryUnit === "ML"
                ? {
                    status: "Consumed",
                    consumedAt: serverTimestamp(),
                    health: 0,
                    totalML: 0
                  }
                : {
                    status: "Consumed",
                    consumedAt: serverTimestamp(),
                    health: 0,
                    totalTests: 0
                  }
            );
          });
          const activateQty =
          itemToActivate.inventoryUnit === "ML"
            ? Number(
                itemToActivate.totalML ||
                itemToActivate.inventoryQty ||
                0
              )
            : Number(
                itemToActivate.totalTests ||
                itemToActivate.totalAvailable ||
                itemToActivate.inventoryQty ||
                0
              );
        
        batch.update(
          doc(db, "inventory_logs", id),
        
          itemToActivate.inventoryUnit === "ML"
            ? {
                status: "Activated",
                openedAt: serverTimestamp(),
                health: 100,
                machineAssigned: activeHaemTab,
                totalML: activateQty
              }
            : {
                status: "Activated",
                openedAt: serverTimestamp(),
                health: 100,
                machineAssigned: activeHaemTab,
                totalTests: activateQty
              }
        );
        }
      });
      await batch.commit();
      setSelectedIds([]);
      setIsSelectionMode(false);
      alert(`Updated Activation for ${activeHaemTab}.`);
    } catch (err) { console.error(err); }
  };

  return (
    <div className="dashboard-wrapper">
      <div className="dashboard-container">
        <header className="main-header">
          <h2>HAEMATOLOGY <span className="thin">DASHBOARD</span></h2>
          <div className="tab-nav">
            <button className={activeHaemTab === "3-part" ? "active" : ""} onClick={() => { setActiveHaemTab("3-part"); setIsSelectionMode(false); }}>3-PART MACHINE</button>
            <button className={activeHaemTab === "5-part" ? "active" : ""} onClick={() => { setActiveHaemTab("5-part"); setIsSelectionMode(false); }}>5-PART MACHINE</button>
          </div>
        </header>

        <div className="hero-status-grid">
          <div className="status-card health-card">
            <span className="label-dim">Primary Reagents {activeHaemTab}):</span>
            <div className="active-reagents-list">

              {activeReagents.map(r => (
                <div key={r.id} className="reagent-health-item">
                  <div className="health-data-block">
                    <span className="reagent-mini-name">{r.reagentName}</span>
                   <div
                    style={{
                      fontSize: "0.7rem",
                      opacity: 0.7,
                      marginTop: "2px"
                    }}
                  >
                    Lot: {r.batchNo || r.lotNo || "N/A"}
                    {r.boxNo && ` | Box: ${r.boxNo}`}
                  </div>
                   <div className="health-stats-row">
                <span className="tests-left-label">
                  {getRemainingQty(r)} {r.inventoryUnit || "Tests"} Left
                </span>
                <span className="health-pct">
                  {getHealthPercent(r)}%
                </span>
              </div>

              <div className="progress-bar">
                <div
                  className={`progress-fill ${getHealthColor(getHealthPercent(r))}`}
                  style={{ width: `${getHealthPercent(r)}%` }}
                ></div>
              </div>

                  </div>
                  {!isSelectionMode && (
                    <div className="card-mini-actions" style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn-mini bonus" 
                      disabled={getRemainingQty(r) > 0} 
                      onClick={() => handleBonus(r)}>Bonus</button>
                      <button className="btn-mini excess" onClick={() => handleExcess(r)}>Excess</button>
                      <button className="btn-mini consume" 
                      disabled={getRemainingQty(r) > 0}
                      onClick={() => handleMarkConsumed(r)}>Consumed</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="secondary-cards-row">
            {activeHaemTab !== "3-part" && (
              <div className="status-card health-card">
                <span className="label-dim">Maintenance & Wash ({activeHaemTab}):</span>
                <div className="active-reagents-list">
                  {activeMaintenance.map(m => (
                    <div key={m.id} className="reagent-health-item">
                      <div className="health-data-block">
                        <span className="reagent-mini-name">{m.reagentName}</span>
                        <div
                          style={{
                            fontSize: "0.7rem",
                            opacity: 0.7,
                            marginTop: "2px"
                          }}
                        >
                          Lot: {m.batchNo || m.lotNo || "N/A"}
                          {m.boxNo && ` | Box: ${m.boxNo}`}
                        </div>
                       <div className="health-stats-row">
                       <span className="tests-left-label">
                {getRemainingQty(m)} {m.inventoryUnit || "ML"} Left
              </span>

              <span className="health-pct">
                {getHealthPercent(m)}%
              </span>
            </div>

            <div className="progress-bar">
              <div
                className={`progress-fill ${getHealthColor(getHealthPercent(m))}`}
                style={{ width: `${getHealthPercent(m)}%` }}
              ></div>
            </div>


                      </div>
                      {!isSelectionMode && (
                        <div className="card-mini-actions" style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn-mini consume" 
                          disabled={getRemainingQty(m) > 0}
                          onClick={() => handleMarkConsumed(m)}>Consumed</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="status-card health-card">
              <span className="label-dim">Consumables ({activeHaemTab}):</span>
              <div className="active-reagents-list">
                {activeConsumables.map(c => (
                  <div key={c.id} className="reagent-health-item">
                    <div className="health-data-block">
                      <span className="reagent-mini-name">{c.reagentName}</span>
                      <div
                      style={{
                        fontSize: "0.7rem",
                        opacity: 0.7,
                        marginTop: "2px"
                      }}
                    >
                      Lot: {c.batchNo || c.lotNo || "N/A"}
                      {c.boxNo && ` | Box: ${c.boxNo}`}
                    </div>  
                 <div className="health-stats-row">
                <span className="tests-left-label">
                  {getRemainingQty(c)} {c.inventoryUnit || "Tests"} Left
                </span>

                <span className="health-pct">
                  {getHealthPercent(c)}%
                </span>
              </div>

              <div className="progress-bar">
                <div
                  className={`progress-fill ${getHealthColor(getHealthPercent(c))}`}
                  style={{ width: `${getHealthPercent(c)}%` }}
                ></div>
              </div>
              </div>


                    
                    {!isSelectionMode && (
                      <div className="card-mini-actions" style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn-mini bonus" 
                       disabled={getRemainingQty(c) > 0} 
                        onClick={() => handleBonus(c)}>Bonus</button>
                        <button className="btn-mini excess" onClick={() => handleExcess(c)}>Excess</button>
                        <button className="btn-mini consume" 
                        disabled={getRemainingQty(c) > 0}
                        onClick={() => handleMarkConsumed(c)}>Consumed</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {activeHaemTab === "5-part" && (
          <div className="status-card health-card" style={{ marginBottom: '20px', border: '1px solid var(--neon-blue)' }}>
            <span className="label-dim" style={{ color: 'var(--neon-blue)' }}>5-Part Controls (QC):</span>
            <div className="active-reagents-list">
              {activeControls.map(ctrl => (
                <div key={ctrl.id} className="reagent-health-item">
                  <div className="health-data-block">
                    <span className="reagent-mini-name">{ctrl.reagentName}</span>
                    <div
                    style={{
                      fontSize: "0.7rem",
                      opacity: 0.7,
                      marginTop: "2px"
                    }}
                  >
                    Lot: {ctrl.batchNo || ctrl.lotNo || "N/A"}
                    {ctrl.boxNo && ` | Box: ${ctrl.boxNo}`}
                  </div>
                   
                    <div className="health-stats-row">
              <span className="tests-left-label">
                {getRemainingQty(ctrl)} {ctrl.inventoryUnit || "ML"} Left
              </span>

              <span className="health-pct">
                {getHealthPercent(ctrl)}%
              </span>
            </div>

            <div className="progress-bar">
              <div
                className={`progress-fill ${getHealthColor(getHealthPercent(ctrl))}`}
                style={{ width: `${getHealthPercent(ctrl)}%` }}
              ></div>
            </div>

                  </div>
                  {!isSelectionMode && (
                    <div className="card-mini-actions" style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn-mini bonus" 
                     disabled={getRemainingQty(ctrl) > 0}
                      onClick={() => handleBonus(ctrl)}>Bonus</button>
                      <button className="btn-mini excess" onClick={() => handleExcess(ctrl)}>Excess</button>
                      <button className="btn-mini consume" 
                      disabled={getRemainingQty(ctrl) > 0}
                       onClick={() => handleMarkConsumed(ctrl)}>Consumed</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="action-row">
          {!isSelectionMode ? (
            <>
            <button
              className="btn-hero btn-green"
              onClick={() => setIsSelectionMode(true)}
            >
              🔄 Change Reagent
            </button>
          
            {/* ✅ ADD THIS */}
            <button
              className="btn-hero btn-red"
              onClick={() => setShowWasteModal(true)}
            >
              🗑 Waste Log
            </button>
          
            {activeHaemTab === "5-part" && (
              <>
                <button
                  className="btn-hero btn-blue"
                  onClick={() => setShowQCModal(true)}
                >
                  🧪 Log Controls
                </button>
          
                <button
                  className="btn-hero"
                  style={{ backgroundColor: '#8a2be2' }}
                  onClick={() => setShowMaintenanceModal(true)}
                >
                  🔧 Maintenance
                </button>
              </>
            )}
          </>
          ) : (
            <>
              <button className="btn-hero btn-confirm" onClick={handleConfirmActivation}>✅ Activate for {activeHaemTab} ({selectedIds.length})</button>
              <button className="btn-hero btn-red" onClick={() => setIsSelectionMode(false)}>✖ Cancel</button>
            </>
          )}
        </div>

        <div className="fridge-section" style={{ marginTop: '20px' }}>
          <h3 className="section-title">{activeHaemTab.toUpperCase()} STORAGE</h3>
          <div className="fridge-grid" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {Object.values(groupedStorage).map((group) => (
              <div key={group.name} className="reagent-stock-group">
                <div
                  className="reagent-summary-card"
                  onClick={() => setExpandedReagent(expandedReagent === group.name ? null : group.name)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', background: 'rgba(255,255,255,0.05)', border: '1px solid #333', borderRadius: '8px', cursor: 'pointer' }}
                >
                  <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{group.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>Qty: {group.totalQty}</span>
                    <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>{expandedReagent === group.name ? '▲' : '▼'}</span>
                  </div>
                </div>
                {expandedReagent === group.name && (
                  <div className="reagent-dropdown-details" style={{ padding: '10px 20px', background: 'rgba(0,0,0,0.2)', border: '1px solid #333', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', color: '#666', fontSize: '0.7rem' }}>
                          {isSelectionMode && <th style={{ width: '30px' }}>FIFO</th>}
                         
                          <th style={{ padding: '5px 0' }}>
                          Lot No
                          </th>

                          <th style={{ padding: '5px 0' }}>
                            Box No
                          </th>

                          <th style={{ padding: '5px 0' }}>
                            Expiry Date
                          </th>

                          <th style={{ textAlign: 'right' }}>
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.batches.map((item, idx) => (
                          <tr key={item.id} style={{ borderBottom: '1px solid #222', opacity: (isSelectionMode && idx !== 0) ? 0.4 : 1 }}>
                            {isSelectionMode && (
                              <td style={{ padding: '8px 0' }}>
                                <input type="checkbox" disabled={idx !== 0} checked={selectedIds.includes(item.id)} onChange={() => idx === 0 && toggleSelection(item.id)} />
                              </td>
                            )}
                            <td
                            className="mono"
                            style={{
                              padding: '8px 0',
                              fontSize: '0.8rem'
                            }}
                          >
                            {item.batchNo || item.lotNo || "N/A"}
                          </td>

                          <td
                            className="mono"
                            style={{
                              padding: '8px 0',
                              fontSize: '0.8rem'
                            }}
                          >
                            {item.boxNo || "-"}
                          </td>

                          <td
                            style={{
                              padding: '8px 0',
                              fontSize: '0.8rem'
                            }}
                          >
                            {item.expiryDate}
                          </td>
                        <td style={{ textAlign: 'right' }}><span className="dot-status in-storage">Fridge</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* MODALS remain unchanged */}
        {showMaintenanceModal && (
          <div className="cal-modal-overlay">
            <div className="cal-modal-box">
              <h3>Maintenance Audit</h3>
              <select value={maintenanceReason} onChange={(e) => setMaintenanceReason(e.target.value)}>
                <option value="Routine">Routine</option>
                <option value="Reagent Change">Reagent Change</option>
              </select>
              {activeMaintenance.map(m => (
                <div key={m.id} className="cal-form-group">
                  <label>{m.reagentName}</label>
                  <input type="number" onChange={(e) => setMaintenanceDeductions({ ...maintenanceDeductions, [m.id]: e.target.value })} />
                </div>
              ))}
              <div className="modal-actions">
                <button className="btn-modal-confirm" onClick={handleConfirmMaintenance}>Log</button>
                <button className="btn-modal-cancel" onClick={() => setShowMaintenanceModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
        {showQCModal && (
  <div className="cal-modal-overlay">
    <div className="cal-modal-box" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

      {/* SCROLL AREA */}
      <div style={{ overflowY: 'auto', paddingRight: '10px' }}>

        <h3>Log Control (QC)</h3>

        {/* REASON */}
        <div className="cal-form-group">
          <label>Reason:</label>
          <select value={qcReason} onChange={(e) => setQCReason(e.target.value)}>
            <option value="DAILY">Daily</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        {qcReason === "OTHER" && (
          <div className="cal-form-group">
            <label>Specify Reason:</label>
            <input
              type="text"
              value={otherReason}
              onChange={(e) => setOtherReason(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                background: '#111',
                color: 'white',
                border: '1px solid #444',
                borderRadius: '6px',
                boxSizing: 'border-box'
              }}
            />
          </div>
        )}

        {/* RESULT */}
        <div className="cal-form-group">
          <label>Result:</label>
          <select value={qcResult} onChange={(e) => setQCResult(e.target.value)}>
            <option value="Success">Success</option>
            <option value="Failure">Failure</option>
          </select>
        </div>

        <div
  style={{
    display: "flex",
    gap: "10px"
  }}
>

  <div
    className="cal-form-group"
    style={{ flex: 1 }}
  >
    <label>Baseline Value:</label>

    <input
      type="text"
      value={baseLineValue}
      onChange={(e) =>
        setBaseLineValue(e.target.value)
      }
      style={{
        width: "100%",
        padding: "8px",
        background: "#111",
        color: "white",
        border: "1px solid #444",
        borderRadius: "6px",
        boxSizing: "border-box"
      }}
    />
  </div>

  <div
    className="cal-form-group"
    style={{ flex: 1 }}
  >
    <label>Actual Output:</label>

    <input
      type="text"
      value={actualOutput}
      onChange={(e) =>
        setActualOutput(e.target.value)
      }
      style={{
        width: "100%",
        padding: "8px",
        background: "#111",
        color: "white",
        border: "1px solid #444",
        borderRadius: "6px",
        boxSizing: "border-box"
      }}
    />
  </div>

</div>


        {/* LEVEL */}
        <div className="cal-form-group">
          <label>Level:</label>
          <select value={qcLevel} onChange={(e) => setQCLevel(e.target.value)}>
            <option value="LEVEL I">LEVEL I</option>
            <option value="LEVEL II">LEVEL II</option>
          </select>
        </div>
       <div className="cal-form-group">
        <label>Performed By:</label>

        <input
          type="text"
          value={qcPerformedBy}
          onChange={(e) =>
            setQCPerformedBy(e.target.value)
          }
          placeholder="Enter staff name"
          style={{
            width: '100%',
            padding: '8px',
            background: '#111',
            color: 'white',
            border: '1px solid #444',
            borderRadius: '6px',
            boxSizing: 'border-box'
          }}
        />
      </div>

        {/* FAILURE BLOCK */}
        {qcResult === "Failure" && (
          <div style={{
            marginTop: '20px',
            border: '1px solid var(--neon-red)',
            padding: '15px',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <textarea placeholder="Root Cause" value={rootCause} onChange={(e) => setRootCause(e.target.value)}
             style={{
              background: '#111',
              color: 'white',
              border: '1px solid #444',
              padding: '8px',
              width: '100%',
              boxSizing: 'border-box',
              borderRadius: '6px',
              minHeight: '60px'
            }} />
            <textarea placeholder="Corrective Action" value={correctiveAction} onChange={(e)=> setCorrectiveAction(e.target.value)}
             style={{
              background: '#111',
              color: 'white',
              border: '1px solid #444',
              padding: '8px',
              width: '100%',
              boxSizing: 'border-box',
              borderRadius: '6px',
              minHeight: '60px'
            }}/>
            <textarea placeholder="Preventative Action" value={preventativeAction} onChange={(e) => setPreventativeAction(e.target.value)}
             style={{
              background: '#111',
              color: 'white',
              border: '1px solid #444',
              padding: '8px',
              width: '100%',
              boxSizing: 'border-box',
              borderRadius: '6px',
              minHeight: '60px'
            }}/>
          </div>
        )}

        {/* QUANTITY TABLE */}
        <div className="cal-list" style={{ marginTop: '20px' }}>
        <label className="label-dim">
        Control & Use 1 Round:
          </label>

          <table style={{ width: '100%', color: 'white' }}>
            <tbody>
              {activeControls.map(ctrl => (
                <tr key={ctrl.id}>
                  <td> {ctrl.reagentName}
                   <br />
                  <small style={{ color: '#666' }}>
                    Lot: {ctrl.batchNo || ctrl.lotNo || "N/A"}
                          {ctrl.boxNo && ` | Box: ${ctrl.boxNo}`}
                        </small>
                      </td>
                  <td style={{ textAlign: 'right' }}>
                  <input
                    type="checkbox"
                    checked={qcSelections[ctrl.id] || false}
                    onChange={(e)=>
                        setQCSelections({
                            ...qcSelections,
                            [ctrl.id]: e.target.checked
                        })
                    }
                />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>

      {/* BUTTONS */}
      <div className="modal-actions">
        <button className="btn-modal-confirm" onClick={handleConfirmQC}>Confirm Log</button>
        <button className="btn-modal-cancel" onClick={() => setShowQCModal(false)}>Cancel</button>
      </div>

    </div>
  </div>
)}
{showWasteModal && (
  <div className="cal-modal-overlay">
    <div className="cal-modal-box" style={{ maxHeight: '90vh', overflowY: 'auto' }}>

      <h3>Waste Log</h3>

      <div className="cal-list" style={{ marginTop: '15px' }}>
        <label className="label-dim">Reagents & Quantity Wasted:</label>

        <table style={{ width: '100%', color: 'white' }}>
          <tbody>
            {inventory
              .filter(i =>
                i.status === "Activated" &&
                i.machineAssigned === activeHaemTab &&
                i.belongsTo === activeHaemTab
              )
              .map(item => (
                <tr key={item.id}>
                 <td>
                  {item.reagentName}
                  <br />
                  <small style={{ color: "#666" }}>
                    Lot: {item.batchNo || item.lotNo || "N/A"}
                    {item.boxNo && ` | Box: ${item.boxNo}`}
                  </small>
                </td>

                  <td style={{ textAlign: 'right', width: '80px' }}>
                    <input
                      type="number"
                      value={wasteDeductions[item.id] || ""}
                      onChange={(e) =>
                        setWasteDeductions({
                          ...wasteDeductions,
                          [item.id]: e.target.value
                        })
                      }
                      style={{
                        width: '60px',
                        background: '#222',
                        color: 'white',
                        border: '1px solid #444',
                        textAlign: 'center'
                      }}
                    />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="modal-actions">
        <button
          className="btn-modal-confirm"
          onClick={async () => {
            const selections = Object.keys(wasteDeductions).filter(
              id => Number(wasteDeductions[id]) > 0
            );

            if (selections.length === 0) {
              alert("Enter quantities");
              return;
            }

            try {
              const batch = writeBatch(db);

              for (const id of selections) {
                const qty = Number(wasteDeductions[id]);
                const item = inventory.find(i => i.id === id);

                if (item) {
                
                  const currentQty =
                item.inventoryUnit === "ML"
                  ? Number(item.totalML || 0)
                  : Number(item.totalTests || 0);

              const newTotal =
                Math.max(0, currentQty - qty);

              const initialCapacity =
                Number(item.inventoryQty) || 1;

              const newHealth =
                Math.round(
                  (newTotal / initialCapacity) * 100
                );

              batch.update(
                doc(db, "inventory_logs", id),

                item.inventoryUnit === "ML"
                  ? {
                      totalML: newTotal,
                      health: newHealth,
                      status:
                        newTotal <= 0
                          ? "Consumed"
                          : "Activated",
                      wasteStatus: true,
                      wastedML: qty
                    }
                  : {
                      totalTests: newTotal,
                      health: newHealth,
                      status:
                        newTotal <= 0
                          ? "Consumed"
                          : "Activated",
                      wasteStatus: true,
                      wastedTests: qty
                    }
              );
              

              await addConsumptionLedgerEntry({
                productName:
                  item?.reagentName || "Unknown",
              
                batchNo:
                  item?.batchNo ||
                  item?.lotNo ||
                  "N/A",
                  boxNo: item.boxNo || "",
              
                  machine: getMachineName(item),
              
                inventoryType:
                  item?.haemGroup === "Controls"
                    ? "Control"
                    : item?.haemGroup === "Consumables"
                    ? "Consumable"
                    : item?.haemGroup === "Maintenance"
                    ? "Maintenance"
                    : "Reagent",

                metricType:
                    item?.metricType || "",
              
                testName: "Waste",
              
                actionType: "Waste",
              
                qty
              });

                }
              }

              await batch.commit();

              await addDoc(collection(db, "waste_logs"), {
                timestamp: serverTimestamp(),
                department: "Haematology",
                machine: activeHaemTab,
                deductions: wasteDeductions
              });

              setWasteDeductions({});
              setShowWasteModal(false);

              alert("Waste logged successfully.");
            } catch (err) {
              console.error(err);
            }
          }}
        >
          Confirm Waste
        </button>

        <button
          className="btn-modal-cancel"
          onClick={() => setShowWasteModal(false)}
        >
          Cancel
        </button>
      </div>

    </div>
  </div>
)}
</div>
</div>
);
}