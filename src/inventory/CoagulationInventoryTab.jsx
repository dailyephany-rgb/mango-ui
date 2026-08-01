

import React, { useState, useEffect, useMemo } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  doc,
  writeBatch,
  updateDoc,
  addDoc,
  serverTimestamp
} from "firebase/firestore";


import { addConsumptionLedgerEntry } from "../inventory-command-center/utils/consumptionledger";
import {
  INVENTORY_MACHINES,
  subscribeInventoryByMachines,
} from "../shared/firestore/subscribeInventoryByMachines.js";

import "./DeptInventory.css";

export default function CoagulationInventory() {
  const [inventory, setInventory] = useState([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [expandedReagent, setExpandedReagent] = useState(null);

  // --- POP-UP MODAL STATES ---
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [showQCModal, setShowQCModal] = useState(false);
  const [maintenanceDeductions, setMaintenanceDeductions] = useState({});
  const [qcSelections, setQCSelections] = useState({});
  // 🔥 NEW QC FIELDS
  const [qcReason, setQCReason] = useState("DAILY");
  const [qcResult, setQCResult] = useState("Success");
  const [rootCause, setRootCause] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [preventativeAction, setPreventativeAction] = useState("");
  const [otherReason, setOtherReason] = useState("");

  // 🔥 WASTE MODAL
  const [showWasteModal, setShowWasteModal] = useState(false);
  const [wasteDeductions, setWasteDeductions] = useState({});

  const [qcLevel, setQCLevel] = useState("LEVEL I");
  const [qcPerformedBy, setQCPerformedBy] = useState("");
  const [baseLineValue, setBaseLineValue] = useState("");
  const [actualOutput, setActualOutput] = useState("");




  // 1. DATA FETCHING — Yumizen G800 live stock
  useEffect(() => {
    const unsub = subscribeInventoryByMachines(
      INVENTORY_MACHINES.coag,
      (logs) => {
      const specs = {
        // Normalized to ensure mapping works during Save
        reagents: ["YUMIZEN G APTT 4", "YUMIZEN G CACL 2", "BT/CT CAPILARY 100", "YUMIZEN G PT 5"],
        maintenance: ["YUMIZEN CLEAN SYS"],
        consumables: ["YUMIZEN G CLEANER", "YUMIZEN C SORB", "YUMIZEN CUVETTES"],
        controls: ["YUMIZEN CTRL I & II"]
      };

      const filtered = logs.reduce((acc, item) => {
        const name = item.reagentName?.toUpperCase().trim() || "";
        let group = null;

        if (specs.controls.some(ctrl => name.includes(ctrl))) group = "Controls";
        else if (specs.reagents.some(r => name.includes(r))) group = "Reagents";
        else if (specs.maintenance.some(m => name.includes(m))) group = "Maintenance";
        else if (specs.consumables.some(c => name.includes(c))) group = "Consumables";

        if (group) { 
          acc.push({ ...item, coagGroup: group }); 
        } else {
          // Catalog-scoped listen may include items not in local name lists
          acc.push({ ...item, coagGroup: "Reagents" });
        }
        return acc;
      }, []);

      setInventory(filtered);
      }
    );
    return () => unsub();
  }, []);

  // 2. CATEGORY SEPARATION
  const activeReagents = inventory.filter(i => i.coagGroup === "Reagents" && i.status === "Activated");
  const activeMaintenance = inventory.filter(i => i.coagGroup === "Maintenance" && i.status === "Activated");
  const activeConsumables = inventory.filter(i => i.coagGroup === "Consumables" && i.status === "Activated");
  const activeControls = inventory.filter(i => i.coagGroup === "Controls" && i.status === "Activated"); 
  const storageItems = inventory.filter(i => i.status === "In Storage");

  // 3. FIFO GROUPING (CRITICAL FOR REDUCTION)
  const groupedStorage = useMemo(() => {
    const groups = storageItems.reduce((acc, item) => {
      const name = item.reagentName;
      if (!acc[name]) acc[name] = { name, totalQty: 0, batches: [] };
      acc[name].totalQty += Number(item.quantity || 1);
      acc[name].batches.push(item);
      return acc;
    }, {});
    
    // Sort batches by Expiry (Oldest first) to ensure FIFO
    Object.values(groups).forEach(g => {
      g.batches.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    });
    return groups;
  }, [storageItems]);

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

  const toggleSelection = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // 4. ACTION HANDLERS
  const handleConfirmAction = async (type) => {
    const deductions =
  type === "QC"
    ? qcSelections
    : maintenanceDeductions;

  const selections =
  type === "QC"
    ? Object.keys(qcSelections).filter(id => qcSelections[id])
    : Object.keys(maintenanceDeductions).filter(
        id => Number(maintenanceDeductions[id]) > 0
      );
    
    try {
      const batch = writeBatch(db);
      const selectedControl = activeControls[0];
      const qcAuditDetails = [];
      let controlNames = [];
      for (const id of selections) {
        const qty =
        type === "QC"
          ? 1
          : Number(deductions[id]);
        const item = inventory.find(i => i.id === id);
      
        if (item) {

          qcAuditDetails.push({
            controlName: item.reagentName,
            quantityUsed: qty,
            lotNumber: item.lotNo || "N/A",
            boxNo: item.boxNo || "",
            expiryDate: item.expiryDate || "N/A"
          });

          if (type === "QC") {

            await addConsumptionLedgerEntry({
              productName:
                item.reagentName || "Unknown",
          
              batchNo:
                item.lotNo ||
                item.batchNo ||
                "N/A",
              boxNo: item.boxNo || "",
          
              machine: "Yumizen G800",
          
              inventoryType: "Control",

              metricType: item.metricType || "",

              level: qcLevel,
          
              testName: "QC Control",
          
              actionType: "QC",
          
              qty
            });
          
          }


          if (type === "Maintenance") {

            await addConsumptionLedgerEntry({
              productName:
                item.reagentName || "Unknown",
          
              batchNo:
                item.lotNo ||
                item.batchNo ||
                "N/A",
              boxNo: item.boxNo || "",
          
              machine: "Yumizen G800",
          
              inventoryType: "Maintenance",

              metricType: item.metricType || "",
          
              testName: "System Wash",
          
              actionType: "Maintenance",
          
              qty
            });
          
          }
          
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

      await addDoc(collection(db, type === "QC" ? "qc_logs" : "maintenance_logs"), {
        timestamp: serverTimestamp(),
        ...(type === "QC" && {
          eventType: "Control",
          machine: "YUMIZEN G800",
          performedBy: qcPerformedBy,
          batchNo: selectedControl?.lotNo || "N/A",
          boxNo: selectedControl?.boxNo || "",
          expiryDate: selectedControl?.expiryDate || "N/A",
          baseLineValue,
          actualOutput,
          controlNames: controlNames.join(", "),
          controlsUsed: qcAuditDetails,
          reason: qcReason === "OTHER" ? otherReason : qcReason,
          result: qcResult,
          levelsUsed: qcLevel,
          rootCause: qcResult === "Failure" ? rootCause : "N/A",
          correctiveAction: qcResult === "Failure" ? correctiveAction : "N/A",
          preventativeAction: qcResult === "Failure" ? preventativeAction : "N/A"
        })
      });
          
          type === "QC"
      ? setQCSelections({})
      : setMaintenanceDeductions({});
      
      if (type === "QC") {
        setQCReason("DAILY");
        setQCResult("Success");
        setQCLevel("LEVEL I");
        setRootCause("");
        setCorrectiveAction("");
        setPreventativeAction("");
        setOtherReason("");
        setQCPerformedBy("");
        setBaseLineValue("");
        setActualOutput("");
      }
      
      type === "QC" ? setShowQCModal(false) : setShowMaintenanceModal(false);
      
      alert(`${type} logged successfully.`);
    } catch (err) {
      console.error(err);
    }
    };

    const handleExcess = async (item) => {
      const unit =
        item.inventoryUnit ||
        item.packUnit ||
        "Tests";
    
      const val = prompt(
        `Enter Excess ${unit} consumed for ${item.reagentName}:`
      );
    
      if (val === null || val === "") return;
    
      try {
        const deduction = Number(val);
    
        const currentQty =
          item.inventoryUnit === "ML"
            ? Number(item.totalML || 0)
            : Number(item.totalTests || 0);
    
        const newTotal =
          Math.max(0, currentQty - deduction);
    
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
            item.lotNo ||
            item.batchNo ||
            "N/A",
            boxNo: item.boxNo || "",
        
            machine: "Yumizen G800",
        
          inventoryType:
            item.coagGroup === "Controls"
              ? "Control"
              : item.coagGroup === "Consumables"
              ? "Consumable"
              : item.coagGroup === "Maintenance"
              ? "Maintenance"
              : "Reagent",

          metricType: item.metricType || "",
          
          testName: "Excess",
        
          actionType: "Excess",
        
          qty: deduction
        });
    
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
          item.lotNo ||
          item.batchNo ||
          "N/A",
          boxNo: item.boxNo || "",
      
          machine: "Yumizen G800",
      
        inventoryType:
          item.coagGroup === "Controls"
            ? "Control"
            : item.coagGroup === "Consumables"
            ? "Consumable"
            : item.coagGroup === "Maintenance"
            ? "Maintenance"
            : "Reagent",

        metricType:
            item.metricType || "",
      
        testName: "Bonus",
      
        actionType: "Bonus",
      
        qty: Number(val)
      });
  
      alert("Bonus logged. Item marked as consumed.");
  
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
          item.lotNo ||
          item.batchNo ||
          "N/A",
        boxNo: item.boxNo || "",
      
        machine: "Yumizen G800",
      
        inventoryType:
          item.coagGroup === "Controls"
            ? "Control"
            : item.coagGroup === "Consumables"
            ? "Consumable"
            : item.coagGroup === "Maintenance"
            ? "Maintenance"
            : "Reagent",

          metricType:
            item.metricType || "",
      
        testName:
          item.coagGroup === "Consumables"
            ? "Consumable"
            : item.coagGroup === "Maintenance"
            ? "System Wash"
            : "Consumed",
      
        actionType: "Consumed",
      
        qty: 1
      });
  
      alert("Marked as Consumed.");
  
    } catch (err) {
      console.error(err);
    }
  };
  
  
    

  const handleConfirmActivation = async () => {
    const batch = writeBatch(db);
    selectedIds.forEach(id => {
      // Find the reagent being activated
      const itemToActivate = inventory.find(i => i.id === id);
      
      // Auto-Deactivate existing active reagent of the same name
      const existingActive = inventory.filter(i => 
        i.reagentName === itemToActivate.reagentName && i.status === "Activated"
      );
      existingActive.forEach(oldItem => {

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
            totalML: activateQty
          }
        : {
            status: "Activated",
            openedAt: serverTimestamp(),
            health: 100,
            totalTests: activateQty
          }
    );
    });
    await batch.commit();
    setSelectedIds([]); setIsSelectionMode(false);
    alert("Reagents Activated.");
  };

  return (
    <div className="dashboard-wrapper">
      <div className="dashboard-container">
        <header className="main-header">
          <h2>COAGULATION <span className="thin">INVENTORY</span></h2>
        </header>

        {/* HERO STATUS SECTION */}
        <div className="hero-status-grid">
          <div className="status-card health-card">
            <span className="label-dim">Active Coagulation Reagents:</span>
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
                  <div className="card-mini-actions" style={{ display: 'flex', gap: '4px' }}>
                    <button className="btn-mini bonus" 
                    disabled={getRemainingQty(r) > 0}
                    onClick={() => handleBonus(r)}>Bonus</button>
                    
                    <button className="btn-mini excess" onClick={() => handleExcess(r)}>Excess</button>
                    <button className="btn-mini consume" 
                   disabled={getRemainingQty(r) > 0}
                    onClick={() => handleMarkConsumed(r)}>Mark Empty</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="secondary-cards-row">
             <div className="status-card health-card">
              <span className="label-dim">Active Controls (QC):</span>
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
                    <div className="card-mini-actions" style={{ display: 'flex', gap: '4px' }}>
                    <button
                    className="btn-mini bonus"
                    disabled={getRemainingQty(ctrl) > 0}
                    onClick={() => handleBonus(ctrl)}
                  >
                    Bonus
                  </button>
                      <button className="btn-mini excess" onClick={() => handleExcess(ctrl)}>Excess</button>
                      <button className="btn-mini consume" 
                     disabled={getRemainingQty(ctrl) > 0}
                      onClick={() => handleMarkConsumed(ctrl)}>Mark Empty</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="status-card health-card">
              <span className="label-dim">Wash & Maintenance:</span>
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
                  <span style={{color: 'var(--neon-blue)',fontSize: '0.75rem',
                fontWeight: 'bold'}}
                                      >
                      ACTIVE PACK
                    </span>
                    </div>

                    </div>
                    <div className="card-mini-actions">
                    <button className="btn-mini consume"onClick={() => handleMarkConsumed(m)}
                    >
                   Consumed
                  </button>
                  </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="status-card health-card">
              <span className="label-dim">System Consumables:</span>
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
                      <span style={{ color: 'var(--neon-blue)',fontSize: '0.75rem',fontWeight: 'bold'
                    }}
                   >
                      ACTIVE PACK
                      </span>
                    </div>

                      </div>
                      <div className="card-mini-actions">
                    <button
                    className="btn-mini consume" onClick={() => handleMarkConsumed(c)}
                    >
                      Consumed
                    </button>
                  </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="action-row">
  {!isSelectionMode ? (
    <>
      <button className="btn-hero btn-green" onClick={() => setIsSelectionMode(true)}>
        🔄 Change Reagent
      </button>

      <button className="btn-hero btn-blue" onClick={() => setShowQCModal(true)}>
        🧪 Run Control
      </button>

      <button
        className="btn-hero"
        style={{ backgroundColor: '#8a2be2' }}
        onClick={() => setShowMaintenanceModal(true)}
      >
        🔧 System Wash
      </button>

      {/* 🔥 ADD THIS BUTTON */}
      <button
        className="btn-hero"
        style={{ backgroundColor: '#ff4d4d' }}
        onClick={() => setShowWasteModal(true)}
      >
        🗑 Waste Log
      </button>

    </>
  ) : (
    <>
      <button className="btn-hero btn-confirm" onClick={handleConfirmActivation}>
        ✅ Activate Selected ({selectedIds.length})
      </button>

      <button className="btn-hero btn-red" onClick={() => setIsSelectionMode(false)}>
        ✖ Cancel
      </button>
    </>
  )}
</div>

        <div className="fridge-section" style={{ marginTop: '20px' }}>
          <h3 className="section-title">DIGITAL FRIDGE (FIFO)</h3>
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
                          {isSelectionMode && <th style={{ width: '30px' }}>Select</th>}
                          <th style={{ padding: '5px 0' }}>Lot No</th>
                          <th style={{ padding: '5px 0' }}>Box No</th>
                          <th style={{ padding: '5px 0' }}>Expiry Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.batches.map((item, idx) => {
                          const isOldest = idx === 0;
                          return (
                            <tr key={item.id} style={{ borderBottom: '1px solid #222', opacity: (isSelectionMode && !isOldest) ? 0.4 : 1 }}>
                              {isSelectionMode && (
                                <td style={{ padding: '8px 0' }}>
                                  <input 
                                    type="checkbox" 
                                    disabled={!isOldest} 
                                    checked={selectedIds.includes(item.id)} 
                                    onChange={() => toggleSelection(item.id)} 
                                  />
                                </td>
                              )}
                              <td className="mono">
                            {item.batchNo || item.lotNo || "N/A"}
                            {isOldest && (
                              <span
                                style={{
                                  color: "orange",
                                  fontSize: "9px"
                                }}
                              >
                                {" "}
                                (OLD BATCH)
                              </span>
                            )}
                          </td>

                          <td className="mono">
                            {item.boxNo || "-"}
                          </td>
                              <td style={{ padding: '8px 0', fontSize: '0.8rem' }}>{item.expiryDate}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {showQCModal && (
  <div className="cal-modal-overlay">
    <div className="cal-modal-box" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column'}}>

      <h3>Log Control (QC)</h3>
      

      <div style={{ overflowY: 'auto', paddingRight: '10px' }}>

      {/* REASON */}
      <div className="cal-form-group">
        <label>Reason:</label>
        <select value={qcReason} onChange={(e) => setQCReason(e.target.value)}>
          <option value="DAILY">Daily</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
      {qcReason === "OTHER" && (
  <div className="cal-form-group" style={{ marginBottom: '15px' }}>
    <label>Specify Reason:</label>
    <input
      type="text"
      value={otherReason}
      onChange={(e) => setOtherReason(e.target.value)}
      placeholder="Enter reason..."
      style={{
        width: '100%',
        padding: '8px',
        marginTop: '5px',
        background: '#111',
        color: 'white',
        border: '1px solid #444',
        borderRadius: '6px',   // ✅ comma added above
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

      <div className="cal-form-group">
      <label>Level:</label>
       <select value={qcLevel} onChange={(e) => setQCLevel(e.target.value)}>
       <option value="LEVEL I">LEVEL I</option>
       <option value="LEVEL II">LEVEL II</option>
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
        <div
          style={{
            marginTop: '15px',
            border: '1px solid var(--neon-red)',
            padding: '10px',
            borderRadius: '8px'
          }}
        >
          <textarea
            placeholder="Root Cause"
            value={rootCause}
            onChange={(e) => setRootCause(e.target.value)}
            style={{
              background: '#111',
              color: 'white',
              border: '1px solid #444',
              padding: '8px',
              width: '100%',
              boxSizing: 'border-box',
              resize: 'vertical',
              minHeight: '60px'
            }}
          />

          <textarea
            placeholder="Corrective Action"
            value={correctiveAction}
            onChange={(e) => setCorrectiveAction(e.target.value)}
            style={{
              background: '#111',
              color: 'white',
              border: '1px solid #444',
              padding: '8px',
              width: '100%',
              boxSizing: 'border-box',
              resize: 'vertical',
              minHeight: '60px'
            }}
          />

          <textarea
            placeholder="Preventative Action"
            value={preventativeAction}
            onChange={(e) => setPreventativeAction(e.target.value)}
            style={{
              background: '#111',
              color: 'white',
              border: '1px solid #444',
              padding: '8px',
              width: '100%',
              boxSizing: 'border-box',
              resize: 'vertical',
              minHeight: '60px'
            }}
          />
        </div>
      )}

      {/* QUANTITY TABLE */}
      <div className="cal-list" style={{ marginTop: '15px' }}>
        <label className="label-dim">Control & Use 1 Round:</label>

        <table style={{ width: '100%', color: 'white' }}>
          <tbody>
            {activeControls.map(ctrl => (
              <tr key={ctrl.id}>
                <td>
                  {ctrl.reagentName}
                  <br />
                  <small style={{ color: "#666" }}>
                    Lot: {ctrl.batchNo || ctrl.lotNo || "N/A"}
                    {ctrl.boxNo && ` | Box: ${ctrl.boxNo}`}
                  </small>
                </td>
                <td style={{ textAlign: 'right', width: '80px' }}>
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

      {/* ACTIONS */}
      <div className="modal-actions">
        <button
          className="btn-modal-confirm"
          onClick={async () => {
            const selections = Object.keys(qcSelections).filter(
              id => qcSelections[id]
          );
          
          if (selections.length === 0) {
              alert("Please select at least one control.");
              return;
          }

            await handleConfirmAction("QC");

            // reset failure fields
            setRootCause("");
            setCorrectiveAction("");
            setPreventativeAction("");
          }}
        >
          Confirm Log
        </button>

        <button
          className="btn-modal-cancel"
          onClick={() => setShowQCModal(false)}
        >
          Cancel
        </button>
      </div>

    </div>
  </div>
)}

        {showMaintenanceModal && (
          <div className="cal-modal-overlay">
            <div className="cal-modal-box">
              <h3>System Wash / Maintenance</h3>
              {activeMaintenance.map(m => (
                <div key={m.id} className="cal-form-group">
                  <label>{m.reagentName}</label>
                  <input type="number" onChange={(e) => setMaintenanceDeductions({...maintenanceDeductions, [m.id]: e.target.value})} />
                </div>
              ))}
              <div className="modal-actions">
                <button className="btn-modal-confirm" style={{backgroundColor: '#8a2be2'}} onClick={() => handleConfirmAction("Maintenance")}>Confirm Wash</button>
                <button className="btn-modal-cancel" onClick={() => setShowMaintenanceModal(false)}>Close</button>
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
            {inventory.filter(i => i.status === "Activated").map(item => (
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
                      padding: '4px',
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
                      item.reagentName || "Unknown",
                  
                    batchNo:
                      item.lotNo ||
                      item.batchNo ||
                      "N/A",
                      boxNo: item.boxNo || "",
                  
                      machine: "Yumizen G800",
                  
                    inventoryType:
                      item.coagGroup === "Controls"
                        ? "Control"
                        : item.coagGroup === "Consumables"
                        ? "Consumable"
                        : item.coagGroup === "Maintenance"
                        ? "Maintenance"
                        : "Reagent",

                      metricType:
                        item.metricType || "",
                  
                    testName: "Waste",
                  
                    actionType: "Waste",
                  
                    qty
                  });

                }
              }
              await addDoc(collection(db, "waste_logs"), {
                timestamp: serverTimestamp(),
                department: "Coagulation",
                deductions: wasteDeductions
              });
            
              await batch.commit();
            
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
