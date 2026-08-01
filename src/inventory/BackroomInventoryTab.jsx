
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

export default function BackroomInventoryTab() {

  const [inventory, setInventory] = useState([]);
  const [activeTab, setActiveTab] = useState("Serology");
  const [expandedReagent, setExpandedReagent] = useState(null);

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // URINE CONTROL MODAL
  const [showQCModal, setShowQCModal] = useState(false);
  const [qcShift, setQCShift] = useState("Morning");
  const [qcLevel, setQCLevel] = useState("Level-1");
  const [qcPerformedBy, setQCPerformedBy] = useState("");
  
  const [qcKetone, setQCKetone] = useState("");
  const [qcGlucose, setQCGlucose] = useState("");
  const [qcProtein, setQCProtein] = useState("");
  const [qcPH, setQCPH] = useState("");
  const [qcSpecificGravity, setQCSpecificGravity] = useState("");
  const [qcRemarks, setQCRemarks] = useState("");
  const [useOneRound, setUseOneRound] = useState(false);

  // WASTE
  const [showWasteModal, setShowWasteModal] = useState(false);
  const [wasteReasons, setWasteReasons] = useState({});

  // =========================
  // FETCH INVENTORY
  // =========================

  useEffect(() => {
    const unsub = subscribeInventoryByMachines(
      INVENTORY_MACHINES.backroom,
      (logs) => {
      const categorized = logs.map(item => {

        const name = item.reagentName?.toUpperCase().trim();
        let category = "Other";
        let isControl = false;

        // =========================
        // SEROLOGY
        // =========================

        const serologyProducts = [
          "HEPACARD HBSAG",
          "HCV TRIDOT J.MITRA",
          "HIV TRI DOT J.MITRA",
          "SYPHILLIS RAPID TEST STRIP ASPEN 50 TEST",
          "HAEMTEST  OCCULT BLOOD KIT"
        ].map(n => n.toUpperCase());

  
        // =========================
        // RAPID CARD
        // =========================

        const rapidProducts = [
          "F SATYA 2.0 MALARIA CARD",
          "TROP-T SENSITIVE (LAXMI DISTRIBUTORS).",
          "DENGUE DAY 1 100 TESTS",
          "TYPHOID IGG / IGM 30 TEST",
          "CHICKUNGUNYA IGM J.MITRA 10 TEST"
        ].map(n => n.toUpperCase());

        

        // =========================
        // URINE
        // =========================

        const urineProducts = [
          "URINE STRIPS",
          "PREGNANCY CARD",
          "KETO DIASTIX"

        ].map(n => n.toUpperCase());

        const urineControls = [
          "URINE CONTROL LEVEL 1",
          "URINE CONTROL LEVEL 2"
        ].map(n => n.toUpperCase());


    
        // SEROLOGY
         if (serologyProducts.some(r => name.includes(r))) {
          category = "Serology";
        }
      
        // RAPID CARD
        else if (rapidProducts.some(r => name.includes(r))) {
          category = "Rapid Card";
        }
        // URINE
        else if (urineProducts.some(r => name.includes(r))) {
          category = "Urine";
        }
        else if (urineControls.some(r => name.includes(r))) {
          category = "Urine";
          isControl = true;
        }

        return {
          ...item,
          category,
          isControl,
        };

      });

      setInventory(categorized);
      }
    );

    return () => unsub();
  }, []);

  // =========================
  // ACTIVE ITEMS
  // =========================

  const activeItems = useMemo(() =>
    inventory.filter(item =>
      item.category === activeTab &&
      String(item.status)?.trim() === "Activated"
    ),
  [inventory, activeTab]);

  const activeProducts = useMemo(() =>
  activeItems.filter(item =>
    !item.isControl
  ),
  [activeItems]);
  

  const activeControls = useMemo(() =>
    activeItems.filter(item => item.isControl),
  [activeItems]);

  // =========================
  // STORAGE
  // =========================

  const storageItems = useMemo(() =>
    inventory.filter(item =>
      item.category === activeTab &&
      String(item.status)?.trim() === "In Storage"
    ),
  [inventory, activeTab]);

  const groupedStorage = useMemo(() => {

    const groups = storageItems.reduce((acc, item) => {

      const name = item.reagentName;

      if (!acc[name]) {
        acc[name] = {
          name,
          totalQty: 0,
          batches: []
        };
      }

      acc[name].totalQty += Number(item.quantity || 0);
      acc[name].batches.push(item);

      return acc;

    }, {});

    Object.values(groups).forEach(group => {
      group.batches.sort(
        (a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)
      );
    });

    return groups;

  }, [storageItems]);

  // =========================
  // PACKET CONSUMED LOGIC
  // =========================


  const handleExcess = async (item) => {

    const val = prompt(
      `Enter Excess/Waste quantity for ${item.reagentName}:`,
      "0"
    );
  
    if (!val || isNaN(val) || Number(val) <= 0) return;
  
    const qty = Number(val);
    if (qty > Number(item.totalTests || 0)) {
      alert("Excess cannot exceed remaining tests.");
      return;
    }
  
    const newTotal = Math.max(
      0,
      (Number(item.totalTests) || 0) - qty
    );
  
    const initialCapacity =
      Number(item.totalAvailable) || 1;
  
    const newHealth = Math.round(
      (newTotal / initialCapacity) * 100
    );
  
    try {
  
      await updateDoc(
        doc(db, "inventory_logs", item.id),
        {
          totalTests: newTotal,
          health: newHealth,
          status:
            newTotal <= 0
              ? "Consumed"
              : "Activated",
  
          excessStatus: true,
          excessTests: qty
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
      
        machine: activeTab,
      
        inventoryType:
          item.isControl
            ? "Control"
            : "Reagent",

        metricType:
            item.metricType || "",
      
        testName: "Excess",
      
        actionType: "Excess",
      
        qty
      });
  
    } catch (err) {
  
      console.error(err);
  
    }
  };


  const handleBonus = async (item) => {

    const val = prompt(
      `Enter Bonus quantity for ${item.reagentName}:`,
      "0"
    );
  
    if (!val || isNaN(val) || Number(val) < 0) return;
  
    try {
  
      await updateDoc(
        doc(db, "inventory_logs", item.id),
        {
          status: "Consumed",
          bonusTests: Number(val),
          totalTests: 0,
          health: 0,
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
      
        machine: activeTab,
      
        inventoryType:
          item.isControl
            ? "Control"
            : "Reagent",

        metricType: item.metricType || "",
      
        testName: "Bonus",
      
        actionType: "Bonus",
      
        qty: Number(val)
      });
  
      alert(
        "Bonus tests logged. Item marked as consumed."
      );
  
    } catch (err) {
  
      console.error(err);
  
    }
  };

  const handleMarkConsumed = async (item) => {

    if (!window.confirm(`Mark ${item.reagentName} as consumed?`)) {
      return;
    }

    try {

      await updateDoc(doc(db, "inventory_logs", item.id), {
        status: "Consumed",
        consumedAt: serverTimestamp(),
        totalTests: 0,
        health: 0
      });

      await addConsumptionLedgerEntry({
        productName:
          item.reagentName || "Unknown",
      
        batchNo:
          item.lotNo ||
          item.batchNo ||
          "N/A",
          boxNo: item.boxNo || "",

      
        machine: activeTab,
      
        inventoryType:
          item.isControl
            ? "Control"
            : "Reagent",

        metricType:
            item.metricType || "",
      
        testName: "Consumed",
      
        actionType: "Consumed",
      
        qty: 1
      });


      alert("Marked as consumed.");

    } catch (err) {
      console.error(err);
    }
  };

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
  

  // =========================
  // FIFO ACTIVATE
  // =========================

  const toggleSelection = (id) => {

    const stringId = String(id);

    setSelectedIds(prev =>
      prev.includes(stringId)
        ? prev.filter(itemId => itemId !== stringId)
        : [...prev, stringId]
    );
  };

  const handleConfirmMove = async () => {

    if (selectedIds.length === 0) {
      setIsSelectionMode(false);
      return;
    }

    try {

      const batch = writeBatch(db);

      selectedIds.forEach((id) => {

        const docRef = doc(db, "inventory_logs", String(id));

        const originalItem = inventory.find(
          item => String(item.id) === String(id)
        );
        
        const testsToActivate =
          Number(
            originalItem?.totalTests ||
            originalItem?.totalAvailable ||
            originalItem?.inventoryQty ||
            0
          );

        batch.update(docRef, {
          status: "Activated",
          openedAt: serverTimestamp(),
          totalTests: testsToActivate,
          health: 100
        });

      });

      await batch.commit();

      setSelectedIds([]);
      setIsSelectionMode(false);

      alert("Activated Successfully.");

    } catch (err) {
      console.error(err);
    }
  };

  // =========================
  // WASTE
  // =========================

  const handleFinalLogExpiry = async () => {

    if (selectedIds.length === 0) return;

    try {

      const batch = writeBatch(db);
      for (const id of selectedIds) {

        const docRef = doc(db, "inventory_logs", id);
        const item = inventory.find(
          i => String(i.id) === String(id)
        );
        
        const wastedQty =
          Number(item?.totalTests || 0);

        batch.update(docRef, {
          status: "Consumed",
          wastageStatus: true,
          wasteReason: wasteReasons[id] || "Expired",
          consumedAt: serverTimestamp(),
          totalTests: 0,
          health: 0
        });

        await addConsumptionLedgerEntry({
          productName:
            item?.reagentName || "Unknown",
        
          batchNo:
            item?.lotNo ||
            item?.batchNo ||
            "N/A",
            boxNo: item?.boxNo || "",
        
          machine: activeTab,
        
          inventoryType:
            item?.isControl
              ? "Control"
              : "Reagent",

          metricType:
              item?.metricType || "",
        
          testName: "Waste",
        
          actionType: "Waste",
        
          qty: wastedQty
        });

      }

      await batch.commit();

      alert("Waste logged.");

      setSelectedIds([]);
      setShowWasteModal(false);
      setIsSelectionMode(false);

    } catch (err) {
      console.error(err);
    }
  };

  // =========================
  // URINE CONTROL LOGIC
  // =========================

  const handleConfirmQC = async () => {

    if (!useOneRound) {
      alert("Please confirm that 1 round of control was used.");
      return;
    }

    try {

      const selectedControl = activeControls.find(ctrl =>
        ctrl.reagentName.toUpperCase().includes(
          qcLevel.toUpperCase().replace("-", " ")
        )
      );
      const qcAuditDetails = [];
      let controlNames = [];
      if (selectedControl) {

        qcAuditDetails.push({
          controlName: selectedControl.reagentName,
          quantityUsed: 1,
          lotNumber: selectedControl.lotNo || "N/A",
          boxNo: selectedControl.boxNo || "",
          expiryDate: selectedControl.expiryDate || "N/A"
        });

        const currentQty = Number(selectedControl.totalTests || 0);

      const newTotal = Math.max(0, currentQty - 1);

      const initialCapacity =
        Number(selectedControl.inventoryQty) || 1;

      const newHealth = Math.round(
        (newTotal / initialCapacity) * 100
      );

      await updateDoc(
        doc(db, "inventory_logs", selectedControl.id),
        {
          totalTests: newTotal,
          health: newHealth,
          status: newTotal <= 0 ? "Consumed" : "Activated"
        }
      );

        await addConsumptionLedgerEntry({
          productName:
            selectedControl.reagentName || "Unknown",
        
          batchNo:
            selectedControl.lotNo ||
            selectedControl.batchNo ||
            "N/A",
          boxNo: selectedControl.boxNo || "",
        
          machine: "Urine Analyzer",
        
          inventoryType: "Control",

          metricType: selectedControl.metricType || "",
          level: qcLevel,
          
          testName: "QC Control",
        
          actionType: "QC",
        
          qty: 1
        });
      
        controlNames.push(
          selectedControl.reagentName
        );
      }
  
      // QC LOG ENTRY
      await addDoc(collection(db, "qc_logs"), {

        timestamp: serverTimestamp(),
      
        eventType: "Control",
      
        department: "Urine",
      
        machine: "Urine Analyzer",

        performedBy: qcPerformedBy,
      
        levelsUsed: qcLevel,
      
        shift: qcShift,
      
        lotNumber: selectedControl?.lotNo || "N/A",
        boxNo: selectedControl?.boxNo || "",
        expiryDate: selectedControl?.expiryDate || "N/A",
        controlNames: controlNames.join(", "),
        controlsUsed: qcAuditDetails,
        ketone: qcKetone,
        glucose: qcGlucose,
        protein: qcProtein,
        ph: qcPH,
        specificGravity: qcSpecificGravity,
        remarks: qcRemarks
  
      });
  
      // RESET
      setQCKetone("");
      setQCGlucose("");
      setQCProtein("");
      setQCPerformedBy("");
      setQCPH("");
      setQCSpecificGravity("");
      setQCRemarks("");
      setUseOneRound(false);
      setShowQCModal(false);
  
      alert("Urine QC Logged.");
  
    } catch (err) {
  
      console.error(err);
  
    }
  };

  const selectedControl = activeControls.find(ctrl =>
    ctrl.reagentName.toUpperCase().includes(
      qcLevel.toUpperCase().replace("-", " ")
    )
  );

  return (

    <div className="dashboard-wrapper">

      <div className="dashboard-container">

        <header className="main-header">

          <h2>
            BACKROOM
            <span className="thin"> Inventory Dashboard</span>
          </h2>

          <div className="tab-nav">

            {[
                "Serology",
                "Rapid Card",
                "Urine"
            ].map(tab => (

              <button
                key={tab}
                className={activeTab === tab ? "active" : ""}
                onClick={() => {
                  setActiveTab(tab);
                  setSelectedIds([]);
                  setIsSelectionMode(false);
                }}
              >
                {tab}
              </button>

            ))}

          </div>

        </header>

        {/* ========================= */}
        {/* ACTIVE CARDS */}
        {/* ========================= */}

        <div className="hero-status-grid">

          {/* ACTIVE PRODUCTS */}
          <div className="status-card health-card">

            <span className="label-dim">
              Active Products:
            </span>

            <div className="active-reagents-list">

             
             
              {activeProducts.map(product => (

                <div key={product.id} className="reagent-health-item">

                  <div className="health-data-block">

                    <span className="reagent-mini-name">
                      {product.reagentName}
                    </span>

                    <div
                      style={{
                        fontSize: "0.7rem",
                        opacity: 0.7,
                        marginTop: "2px"
                      }}
                    >
                      Lot: {product.lotNo || product.batchNo || "N/A"}
                      {product.boxNo && ` | Box: ${product.boxNo}`}
                    </div>

                    <div className="health-stats-row">

          {(activeTab === "Serology" || 
            activeTab === "Rapid Card" || 
            activeTab === "Urine") ? (

            <>
              <span className="tests-left label">
                {getRemainingQty(product)} {product.inventoryUnit || "Tests"} Left
              </span>

              <span className="health-pct">
                {getHealthPercent(product)}%
              </span>
            </>
                      ) : (

                        <span
                          style={{
                            color: 'var(--neon-blue)',
                            fontSize: '0.75rem',
                            fontWeight: 'bold'
                          }}
                        >
                          ACTIVE PACK
                        </span>

                      )}

                    </div>

                    {(activeTab === "Serology" || 
                      activeTab === "Rapid Card" || 
                      activeTab === "Urine") && (

                        <div className="progress-bar">
                        <div
                          className={`progress-fill ${getHealthColor(getHealthPercent(product))}`}
                          style={{ width: `${getHealthPercent(product)}%` }}
                        ></div>
                      </div>

                    )}

                  </div>

                  
                  {!isSelectionMode && (



                <div
                  className="card-mini-actions"
                  style={{
                    display: 'flex',
                    gap: '4px'
                                    
                  
                  }}
                  >

                    <button
                      className="btn-mini bonus"
                      disabled={getRemainingQty(product) > 0}
                      onClick={() => handleBonus(product)}
                    >
                      Bonus
                    </button>

                    <button
                      className="btn-mini excess"
                      onClick={() => handleExcess(product)}
                    >
                      Excess
                    </button>

                  <button
                    className="btn-mini consume"
                    disabled={getRemainingQty(product) > 0}
                    onClick={() => handleMarkConsumed(product)}
                  >
                    Mark Empty
                  </button>

                </div>
                
                )}

                </div>

              ))}

            </div>

          </div>

          {/* ACTIVE CONTROLS */}

          {activeTab === "Urine" && (

            <div className="status-card health-card">

              <span className="label-dim">
                Active Controls:
              </span>

              <div className="active-reagents-list">

                {activeControls.map(ctrl => (

                  <div key={ctrl.id} className="reagent-health-item">

                    <div className="health-data-block">

                      <span className="reagent-mini-name">
                        {ctrl.reagentName}
                      </span>

                      <div
                        style={{
                          fontSize: "0.7rem",
                          opacity: 0.7,
                          marginTop: "2px"
                        }}
                      >
                        Lot: {ctrl.lotNo || ctrl.batchNo || "N/A"}
                        {ctrl.boxNo && ` | Box: ${ctrl.boxNo}`}
                      </div>


                  <div className="health-stats-row">
                  <span className="tests-left label">
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

                    <div
                      className="card-mini-actions"
                      style={{
                        display: 'flex',
                        gap: '4px'
                      }}
                    >

                  <button
                    className="btn-mini bonus"
                    disabled={getRemainingQty(ctrl) > 0}
                    onClick={() => handleBonus(ctrl)}
                  >
                    Bonus
                  </button>

                  <button
                    className="btn-mini excess"
                    onClick={() => handleExcess(ctrl)}
                  >
                    Excess
                  </button>

                  <button
                    className="btn-mini consume"
                    disabled={getRemainingQty(ctrl) > 0}
                    onClick={() => handleMarkConsumed(ctrl)}
                  >
                    Mark Empty
                  </button>

                </div>

                )}

                      </div>

                ))}

              </div>

            </div>

          )}

        </div>

        {/* ========================= */}
        {/* ACTIONS */}
        {/* ========================= */}

        <div className="action-row">

          {!isSelectionMode ? (

            <>

              <button
                className="btn-hero btn-green"
                onClick={() => setIsSelectionMode(true)}
              >
                🔄 Change Product
              </button>

              {activeTab === "Urine" && (
                <button
                  className="btn-hero btn-blue"
                  onClick={() => setShowQCModal(true)}
                >
                  🧪 Run Control
                </button>
              )}

              <button
              className="btn-hero btn-red"
              onClick={() => {
                setIsSelectionMode(true);
                setShowWasteModal(true);
              }}
                >
                  🗑 Log Waste
                </button>

            </>

          ) : (

            <>

              <button
                className="btn-hero btn-confirm"
                onClick={() => {

                  if (showWasteModal) {
                    return;
                  }
                
                  handleConfirmMove();
                
                }}
              >
                ✅ Confirm Selection ({selectedIds.length})
              </button>

              <button
                className="btn-hero btn-red"
               onClick={() => {
              setSelectedIds([]);
              setIsSelectionMode(false);
              setShowWasteModal(false);
              }}
              >
                ✖ Cancel
              </button>

            </>

          )}

        </div>

        {/* ========================= */}
        {/* DIGITAL FRIDGE */}
        {/* ========================= */}

        <div className="fridge-section" style={{ marginTop: '20px' }}>

          <h3 className="section-title">
            DIGITAL FRIDGE
          </h3>

          <div
            className="fridge-grid"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >

            {Object.values(groupedStorage).map((group) => (

              <div key={group.name} className="reagent-stock-group">

                <div
                  className="reagent-summary-card"
                  onClick={() => setExpandedReagent(
                    expandedReagent === group.name ? null : group.name
                  )}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 20px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >

                  <span
                    style={{
                      fontWeight: 'bold',
                      fontSize: '0.9rem'
                    }}
                  >
                    {group.name}
                  </span>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '15px'
                    }}
                  >

                    <span
                      style={{
                        color: 'var(--success)',
                        fontWeight: 'bold'
                      }}
                    >
                      Qty: {group.totalQty}
                    </span>

                    <span
                      style={{
                        fontSize: '0.7rem',
                        opacity: 0.5
                      }}
                    >
                      {expandedReagent === group.name ? '▲' : '▼'}
                    </span>

                  </div>

                </div>

                {expandedReagent === group.name && (

                  <div
                    className="reagent-dropdown-details"
                    style={{
                      padding: '10px 20px',
                      background: 'rgba(0,0,0,0.2)',
                      border: '1px solid #333',
                      borderTop: 'none',
                      borderRadius: '0 0 8px 8px'
                    }}
                  >

                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse'
                      }}
                    >

                      <thead>
                        <tr
                          style={{
                            textAlign: 'left',
                            color: '#666',
                            fontSize: '0.7rem'
                          }}
                        >

                          {isSelectionMode && (
                            <th style={{ width: '30px' }}>
                              FIFO
                            </th>
                          )}

                            <th style={{ padding: '5px 0' }}>
                              Lot No
                            </th>

                            <th style={{ padding: '5px 0' }}>
                              Box No
                            </th>

                            <th style={{ padding: '5px 0' }}>
                              Expiry
                            </th>
                          <th style={{ textAlign: 'right' }}>
                            Status
                          </th>

                        </tr>
                      </thead>

                      <tbody>

                        {group.batches.map((item, index) => {

                          const isNearestExpiry = index === 0;

                          return (

                            <tr
                              key={item.id}
                              style={{
                                borderBottom: '1px solid #222',
                                opacity: (
                                  isSelectionMode && !isNearestExpiry
                                ) ? 0.4 : 1
                              }}
                            >

                              {isSelectionMode && (
                                <td style={{ padding: '8px 0' }}>
                                  <input
                                    type="checkbox"
                                    disabled={!isNearestExpiry}
                                    checked={selectedIds.includes(String(item.id))}
                                    onChange={() =>
                                      isNearestExpiry && toggleSelection(item.id)
                                    }
                                  />
                                </td>
                              )}

                          <td className="mono">
                            {item.lotNo || item.batchNo || "N/A"}
                          </td>

                          <td className="mono">
                            {item.boxNo || "-"}
                          </td>

                          <td>
                            {item.expiryDate}
                          </td>

                              <td style={{ textAlign: 'right' }}>
                                <span className="dot-status in-storage">
                                  In Storage
                                </span>
                              </td>

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


{/* URINE QC MODAL */}

{showQCModal && (

<div className="cal-modal-overlay">

  <div
    className="cal-modal-box"
    style={{
      width: '500px',
      maxHeight: '90vh',
      overflowY: 'auto'
    }}
  >

    <h3>Urine Control Register</h3>

    <div
      style={{
        display: 'flex',
        gap: '10px'
      }}
    >

      <div className="cal-form-group" style={{ flex: 1 }}>
        <label>Shift:</label>

        <select
          value={qcShift}
          onChange={(e) => setQCShift(e.target.value)}
        >
          <option value="Morning">Morning</option>
          <option value="Evening">Evening</option>
        </select>
      </div>

      <div className="cal-form-group">

          <label>Performed By:</label>

          <input
            type="text"
            value={qcPerformedBy}
            onChange={(e) => setQCPerformedBy(e.target.value)}
          />

      </div>

      <div className="cal-form-group" style={{ flex: 1 }}>
        <label>QC Level:</label>

        <select
          value={qcLevel}
          onChange={(e) => setQCLevel(e.target.value)}
        >
          <option value="Level-1">Level-1</option>
          <option value="Level-2">Level-2</option>
        </select>
      </div>

      </div>

<div className="cal-form-group">

<label>Lot Number:</label>

<input
  type="text"
  readOnly
  value={
    selectedControl
      ? `${selectedControl.lotNo || "N/A"}${
          selectedControl.boxNo
            ? ` | Box ${selectedControl.boxNo}`
            : ""
        }`
      : "No Active Lot"
  }
  style={{
    background: '#1a1a1a',
    color: '#aaa'
  }}
/>

</div>

<div className="cal-form-group">
  <label>Control Used:</label>

  <label
    style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      color: "white",
      marginTop: "6px"
    }}
  >
    <input
      type="checkbox"
      checked={useOneRound}
      onChange={(e) => setUseOneRound(e.target.checked)}
    />

    Use 1 Round
  </label>
</div>

<div className="cal-form-group">
  <label>Ketone:</label>
      <input
        type="text"
        value={qcKetone}
        onChange={(e) => setQCKetone(e.target.value)}
      />
    </div>

    <div className="cal-form-group">
      <label>Glucose:</label>

      <input
        type="text"
        value={qcGlucose}
        onChange={(e) => setQCGlucose(e.target.value)}
      />
    </div>

    <div className="cal-form-group">
      <label>Protein:</label>

      <input
        type="text"
        value={qcProtein}
        onChange={(e) => setQCProtein(e.target.value)}
      />
    </div>

    <div
      style={{
        display: 'flex',
        gap: '10px'
      }}
    >

      <div className="cal-form-group" style={{ flex: 1 }}>
        <label>pH:</label>

        <input
          type="text"
          value={qcPH}
          onChange={(e) => setQCPH(e.target.value)}
        />
      </div>

      <div className="cal-form-group" style={{ flex: 1 }}>
        <label>Specific Gravity:</label>

        <input
          type="text"
          value={qcSpecificGravity}
          onChange={(e) =>
            setQCSpecificGravity(e.target.value)
          }
        />
      </div>

    </div>

    <div className="cal-form-group">
      <label>Remarks:</label>

      <textarea
        value={qcRemarks}
        onChange={(e) => setQCRemarks(e.target.value)}
        style={{
          minHeight: '70px'
        }}
      />
    </div>


    <div className="modal-actions">

      <button
        className="btn-modal-confirm"
        onClick={handleConfirmQC}
      >
        Confirm QC
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



{/* WASTE MODAL */}

{showWasteModal && (

<div className="cal-modal-overlay">

  <div className="cal-modal-box">

    <h3>Confirm Waste Log</h3>

    {selectedIds.map(id => (

      <div
        key={id}
        style={{
          marginBottom: '10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >

        {(() => {
          const item = inventory.find(i => i.id === id);

          return (
            <span style={{ fontSize: "0.8rem" }}>
              {item?.reagentName}
              <br />
              <small>
                Lot: {item?.lotNo || item?.batchNo || "N/A"}
                {item?.boxNo && ` | Box: ${item.boxNo}`}
              </small>
            </span>
          );
        })()}

        <select
          value={wasteReasons[id] || "Expired"}
          onChange={(e) =>
            setWasteReasons({
              ...wasteReasons,
              [id]: e.target.value
            })
          }
          style={{
            background: '#222',
            color: 'white',
            border: '1px solid #444',
            padding: '5px'
          }}
        >
          <option value="Expired">Expired</option>
          <option value="Damaged">Damaged</option>
          <option value="Contaminated">Contaminated</option>
          <option value="QC Fail">QC Fail</option>
        </select>

      </div>

    ))}

    <div className="modal-actions">

      <button
        className="btn-modal-confirm"
        onClick={handleFinalLogExpiry}
      >
        Confirm Waste
      </button>

      <button
        className="btn-modal-cancel"
        onClick={() => {
          setShowWasteModal(false);
          setSelectedIds([]);
          setIsSelectionMode(false);
        }}
      >
        Cancel
      </button>

    </div>

  </div>

</div>

)}
        </div>

      </div>

    </div>
  );
}
