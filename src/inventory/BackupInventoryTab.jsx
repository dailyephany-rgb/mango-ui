
import React, { useState, useEffect, useMemo } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  query,
  doc,
  writeBatch,
  addDoc,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";
import { handleInventoryDeduction } from "../inventory/inventorymapping";

import { addConsumptionLedgerEntry } from "../inventory-command-center/utils/consumptionledger";


import "./DeptInventory.css";

export default function DeptInventoryTab() {
  const [inventory, setInventory] = useState([]);
  const [activeTab, setActiveTab] = useState("Biochem");
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // UI STATE FOR DROPDOWN
  const [expandedReagent, setExpandedReagent] = useState(null);

  // --- CALIBRATION MODAL STATE --

  const [showCalModal, setShowCalModal] = useState(false);
  const [calSelections, setCalSelections] = useState({});
  const [calReason, setCalReason] = useState("Machine Demand");
  const [calResult, setCalResult] = useState("Success");
  const [calRootCause, setCalRootCause] = useState("");
  const [calCorrectiveAction, setCalCorrectiveAction] = useState("");
  const [calPreventativeAction, setCalPreventativeAction] = useState("");
  const [calParameters, setCalParameters] = useState("");
  const [calPerformedBy, setCalPerformedBy] = useState("");

  // --- QC (CONTROL) MODAL STATE ---
  const [showQCModal, setShowQCModal] = useState(false);
  const [qcReason, setQCReason] = useState("DAILY");
  const [qcLevel, setQCLevel] = useState("Level I");
  const [qcPerformedBy, setQCPerformedBy] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [qcSelections, setQCSelections] = useState({});
  const [baseLineValue, setBaseLineValue] = useState("");
  const [actualOutput, setActualOutput] = useState("");
  const [qcResult, setQCResult] = useState("Success");
  const [rootCause, setRootCause] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [preventativeAction, setPreventativeAction] = useState("");

  //--- WASTE/EXPIRY MODAL STATE ---
  const [showWasteModal, setShowWasteModal] = useState(false);
  const [wasteReasons, setWasteReasons] = useState({});

  // LOG VIEWER
  useEffect(() => {
    const qCal = query(collection(db, "calibration_logs"));
    const unsubCal = onSnapshot(qCal, (snap) => {
      console.log("CALIBRATION LOGS:", snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const qQC = query(collection(db, "qc_logs"));
    const unsubQC = onSnapshot(qQC, (snap) => {
      console.log("/ CONTROL (QC) LOGS:", snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubCal(); unsubQC(); };
  }, []);

  // FETCH & CATEGORIZE INVENTORY ----
  useEffect(() => {
    const q = query(collection(db, "inventory_logs"));
    const unsub = onSnapshot(q, (snap) => {
      const logs = snap.docs.map(d => ({
        ...d.data(),
        id: String(d.id),
      }));
      const categorized = logs.map(item => {
        const name = item.reagentName?.toUpperCase().trim();
        
        const biochemNames = [
        "Yumizen CS ALBUMIN",
        "Yumizen CS ALP",
        "Yumizen CS AMYLASE", 
        "Yumizen CS Bilirubin Direct 125 Ml Total",
        "Yumizen CS Bilirubin Total 125 Ml Total",
        "Yumizen CS CHOLESTROL",
        "Yumizen CS CREATININE",
        "Yumizen CS DIRECT LDL",
        "Yumizen CS GLUCOSE",
        "Yumizen CS Urea/Bun (UV) 125 ML Total",
        "Yumizen CS CREATININE", 
        "Yumizen CS CRP (50 ML)",
        "Yumizen CS G.G.T",
       "Yumizen CS HDL",
        "Yumizen CS LDH",
        "Yumizen CS PHOSPHORUS",
        "Yumizen CS RF", 
        "Yumizen CS SGOT",
       "Yumizen CS SGPT",
       "Yumizen CS CALCIUM", 
       "Yumizen CS TOTAL PROTEIN",
       "Yumizen CS TRIGLYCERIDES",
       "Yumizen CS URIC ACID",
       "AGAPPE CRP 30 TEST",
       "AGAPPE HBA1C 30 TEST",
       "AGAPPE RF 30 TEST",
       "GEM 3/3.5 K BG/ISE/GL 450 Test BGEM"
        ].map(n => n.toUpperCase());

        const biochemControls = [
          "YUMIZEN CS N CONTROL",
          "YUMIZEN CS P CONTROL"
        ].map(n => n.toUpperCase());

        const biochemCalibrators = ["YUMIZEN CS MULTICAL"].map(n => n.toUpperCase());

        const hormoneNames = [
          "Access TOTAL T3",
          "Access TOTAL T4",
          "Access AMH",
          "Access Sensitive Estradiol",
          "Access hFSH",
          "Access Free T4",
          "Access hLH",
          "Access Total BhCG",
          "Access Prolactin",
          "Access Progesterone", 
          "Access TSH Reagent",
          "Access Vitamin B12 Reagent",
          "25 (OH) Vitamin D Total for use on Access", 
          "HYBRITECH PSA 2*50 TESTS"    
           ].map(n => n.toUpperCase());

        const hormoneControls = ["EQAS EXTERNAL CONTROL"].map(n => n.toUpperCase());
        
        const hormoneCalibrators = [
        "Access AMH Calibrator S0-S5",
        "Access Sensitive Estradiol Calibrators",
        "Access hFSH Calibrators", 
        "Access Free T4 Calibrators S0-S5",
        "Access hLH Calibrator",
        "Access Prolactin Calibrator",
        "Access Progesterone Calibrator",
        "Access TSH Reagent Calibrator set 2.5 ml vial",
        "Access Vitamin B12 Calibrator",
        "25 (OH) Vitamin D Total Calibrator",
        "HYBRITECH PSA CAL"
        
        ].map(n => n.toUpperCase());

        const biochemConsumables = [
          "MISPA CUVETTES",
          "MISPA MICROTIPS",
          "C-150 DISTIL WATER",
          "C-150 SAMPLE CUPS",
          "C-150 SPECIAL WASH SOLUTION",
          "C-150 CUVETTES"


        ].map(n => n.toUpperCase());
        
        const hormoneConsumables = [
          "ACCESS SUBSTRATE",
          "ACCESS WASH BUFFER",
          "ACCESS RV",
          "ACCESS WASTE BAG",
          "ACCESS SAMPLE CUP",
          "ACCESS CALIBRATOR CUP",
          "ACCESS SYSTEM CHECK SOLUTION"

        ].map(n => n.toUpperCase());

        let category = "Other";
        let isControl = false;
        let isCalibrator = false;
        let isConsumable = false;

        if (biochemNames.some(bn => name.includes(bn))) {
          category = "Biochem";
        } else if (biochemControls.some(bc => name === bc)) {
          category = "Biochem";
          isControl = true;
        } else if (biochemCalibrators.some(bc => name.includes(bc))) {
          category = "Biochem";
          isCalibrator = true;
        } else if (hormoneControls.some(hc => name === hc)) {
          category = "Hormones";
          isControl = true;
        } else if (hormoneCalibrators.some(hc => name.includes(hc))) {
          category = "Hormones";
          isCalibrator = true;
        } else if (hormoneNames.some(hn => name.includes(hn))) {
          category = "Hormones";
        } else if (biochemConsumables.some(c => name.includes(c))) {
          category = "Biochem";
          isConsumable = true;
        }
        else if (hormoneConsumables.some(c => name.includes(c))) {
          category = "Hormones";
          isConsumable = true;
        }
        return { ...item, category, isControl, isCalibrator,isConsumable};
      });
      setInventory(categorized);
    });
    return () => unsub();
  }, []);

  const activeItems = useMemo(() =>
    inventory.filter(item => item.category === activeTab &&
      String(item.status)?.trim() === "Activated"),
    [inventory, activeTab]);

    const machineReagents = useMemo(() =>
      activeItems.filter(item => !item.isCalibrator &&!item.isControl &&
      !item.isConsumable),
      [activeItems]);

  const activeCalibrators = useMemo(() =>
    activeItems.filter(item => item.isCalibrator),
    [activeItems]);

  const activeControls = useMemo(() =>
    activeItems.filter(item => item.isControl),
    [activeItems]);
  const activeConsumables = useMemo(() =>
    activeItems.filter(item => item.isConsumable),
    [activeItems]);

  const storageReagents = useMemo(() => inventory.filter(item =>
    item.category === activeTab && String(item.status)?.trim() === "In Storage"), [inventory, activeTab]);

  const groupedStorage = useMemo(() => {
    const groups = storageReagents.reduce((acc, item) => {
      const name = item.reagentName;
      if (!acc[name]) {
        acc[name] = { name, totalQty: 0, batches: [] };
      }
      acc[name].totalQty += Number(item.quantity || 0);
      acc[name].batches.push(item);
      return acc;
    }, {});
    Object.values(groups).forEach(group => {
      group.batches.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    });
    return groups;
  }, [storageReagents]);

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




  const handleBonus = async (item) => {

    const unit =
      item.inventoryUnit ||
      item.packUnit ||
      "Tests";
  
    const bonusVal = prompt(
      `Enter Bonus ${unit} found for ${item.reagentName}:`
    );
  
    if (bonusVal === null || bonusVal === "") return;
  
    try {
  
      const docRef = doc(
        db,
        "inventory_logs",
        item.id
      );
  
      await updateDoc(
        docRef,
        item.inventoryUnit === "ML"
          ? {
              bonusStatus: true,
              bonusML: Number(bonusVal),
              status: "Consumed",
              consumedAt: serverTimestamp()
            }
          : {
              bonusStatus: true,
              bonusTests: Number(bonusVal),
              status: "Consumed",
              consumedAt: serverTimestamp()
            }
      );
  
      await addConsumptionLedgerEntry({
        productName:
          item.reagentName || "Unknown",
  
        batchNo:
          item.batchNo || "N/A",
        boxNo: item.boxNo || "",
  
        machine:
          activeTab === "Biochem"
            ? "YUMIZEN C-150"
            : "ACCESS 2",
  
        inventoryType:
          item.isControl
            ? "Control"
            : item.isCalibrator
            ? "Calibrator"
            : item.isConsumable
            ? "Consumable"
            : "Reagent",

        metricType:
            item.metricType || "",
  
        testName: "Bonus",
  
        actionType: "Bonus",
  
        qty: Number(bonusVal)
      });
  
      alert(
        `Bonus ${unit} logged. Status updated to Consumed.`
      );
  
    } catch (err) {
      console.error(err);
    }
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
  
      const docRef = doc(
        db,
        "inventory_logs",
        item.id
      );
  
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
        docRef,
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
          item.batchNo || "N/A",
        boxNo: item.boxNo || "",
  
        machine:
          activeTab === "Biochem"
            ? "YUMIZEN C-150"
            : "ACCESS 2",
  
        inventoryType:
          item.isControl
            ? "Control"
            : item.isCalibrator
            ? "Calibrator"
            : item.isConsumable
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
 
  const handleMarkConsumed = async (item) => {

    // PACKET-BASED CONSUMABLES
    if (item.isConsumable) {
  
      if (!window.confirm(`Mark ${item.reagentName} as consumed?`)) {
        return;
      }
  
      try {
  
        await updateDoc(doc(db, "inventory_logs", item.id), {
          status: "Consumed",
          consumedAt: serverTimestamp()
        });

        await addConsumptionLedgerEntry({
          productName:
            item.reagentName || "Unknown",
        
          batchNo:
            item.batchNo || "N/A",
          boxNo: item.boxNo || "",
        
          machine:
            activeTab === "Biochem"
              ? "YUMIZEN C-150"
              : "ACCESS 2",
        
          inventoryType: "Consumable",

          metricType: item.metricType || "",
        
          testName: "Consumable",
        
          actionType: "Consumed",
        
          qty: 1
        });
  
        alert("Consumable packet marked as consumed.");
  
      } catch (err) {
        console.error(err);
      }
  
      return;
    }
  
    // NORMAL TEST-BASED ITEMS
// NORMAL TEST-BASED ITEMS

try {

  const docRef = doc(
    db,
    "inventory_logs",
    item.id
  );

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
    docRef,
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

  alert("Marked as Consumed.");

} catch (err) {
  console.error(err);
}
};




  const handleFinalLogExpiry = async () => {
    if (selectedIds.length === 0) return;
    try {
      const batch = writeBatch(db);
      for (const id of selectedIds) {
        const item = inventory.find(i => String(i.id) === String(id));
       
        const wastedQty =
        item?.inventoryUnit === "ML"
          ? Number(item?.totalML || 0)
          : Number(item?.totalTests || 0);
      
      const docRef = doc(
        db,
        "inventory_logs",
        id
      );
      
      batch.update(
        docRef,
        item?.inventoryUnit === "ML"
          ? {
              status: "Consumed",
              wastageStatus: true,
              wastedML: wastedQty,
              wasteReason:
                wasteReasons[id] || "Expired",
              consumedAt: serverTimestamp(),
              totalML: 0,
              health: 0
            }
          : {
              status: "Consumed",
              wastageStatus: true,
              wastedTests: wastedQty,
              wasteReason:
                wasteReasons[id] || "Expired",
              consumedAt: serverTimestamp(),
              totalTests: 0,
              health: 0
            }
      );
      await addConsumptionLedgerEntry({
        productName:
          item?.reagentName || "Unknown",
      
        batchNo:
          item?.batchNo || "N/A",
          boxNo: item.boxNo || "",
      
        machine:
          activeTab === "Biochem"
            ? "YUMIZEN C-150"
            : "ACCESS 2",
      
        inventoryType:
          item?.isControl
            ? "Control"
            : item?.isCalibrator
            ? "Calibrator"
            : item?.isConsumable
            ? "Consumable"
            : "Reagent",

        metricType:
          item.metricType || "",
      
        testName: "Waste",
      
        actionType: "Waste",
      
        qty: wastedQty
      });
    }

      await batch.commit();
      alert("Selected items marked as Consumed/Wasted.");
      setSelectedIds([]);
      setIsSelectionMode(false);
      setShowWasteModal(false);
    } catch (err) { console.error(err); }
  };

  const handleConfirmCalibration = async () => {

    const selections = Object.keys(calSelections)
  .filter(name => calSelections[name]);
    if (selections.length === 0) {
      alert("Please select at least one calibrator.");
      return;
    }
  
    try {
      const batch = writeBatch(db);
      let mainBatchNo = "N/A";
      let mainExpiry = "N/A";
      let calibratorNames = [];
      const calibrationAuditDetails = [];
  
      for (const name of selections) {
        const qty = 1;
        const item = activeCalibrators.find(c => c.reagentName === name);
  
        if (item) {
          const docRef = doc(db, "inventory_logs", item.id);
  
         
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
          docRef,
          item.inventoryUnit === "ML"
            ? {
                totalML: newTotal,
                health: newHealth
              }
            : {
                totalTests: newTotal,
                health: newHealth
              }
        );
          calibratorNames.push(`${name} (${qty})`);
          calibrationAuditDetails.push({
            calibratorName: name,
            quantityUsed: qty,
            lotNumber: item.batchNo || "N/A",
            boxNo: item.boxNo || "",
            expiryDate: item.expiryDate || "N/A"
          });

          await addConsumptionLedgerEntry({
            productName:
              item.reagentName || "Unknown",
          
            batchNo:
              item.batchNo || "N/A",
             boxNo: item.boxNo || "",
          
            machine:
              activeTab === "Biochem"
                ? "YUMIZEN C-150"
                : "ACCESS 2",
          
            inventoryType: "Calibrator",

            metricType: item.metricType || "",
          
            testName:
              calParameters || "Calibration",
          
            actionType: "Calibration",
          
            qty
          });

  
          if (mainBatchNo === "N/A") mainBatchNo = item.batchNo || "N/A";
          if (mainExpiry === "N/A") mainExpiry = item.expiryDate || "N/A";
        }
      }
  
      await batch.commit();
  
      await addDoc(collection(db, "calibration_logs"), {
        timestamp: serverTimestamp(),
        eventType: "Calibration",
        performedBy: calPerformedBy,
        parametersCalibrated: calParameters,
        calibratorUsed: calibratorNames.join(", "),
        calibratorsUsed: calibrationAuditDetails,
        batchNo: mainBatchNo,
        expiryDate: mainExpiry,
        reason: calReason,
        result: calResult,
        rootCause: calResult === "Failure" ? calRootCause : "N/A",
        correctiveAction: calResult === "Failure" ? calCorrectiveAction : "N/A",
        preventativeAction: calResult === "Failure" ? calPreventativeAction : "N/A",
        machine:
        activeTab === "Biochem"
          ? "YUMIZEN C-150"
          : "ACCESS 2"
      });
  
      // ✅ CLEAN RESET
      setCalSelections({});
      setCalRootCause("");
      setCalCorrectiveAction("");
      setCalPreventativeAction("");
      setCalResult("Success");
      setCalPerformedBy("");
      setCalParameters("");
      setCalReason("Machine Demand");
      setShowCalModal(false);
  
      alert("Calibration Logged.");
  
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfirmQC = async () => {
    const selections = Object.keys(qcSelections)
  .filter(name => qcSelections[name]);
    if (selections.length === 0) { alert("Please select at least one control.");return; }
    try {
      const batch = writeBatch(db);
      const qcAuditDetails = [];
      let controlNames = [];
      let batchNumbers = [];
      let expiryDates = [];

      for (const name of selections) {
        const qty = 1;
        const item = activeControls.find(c => c.reagentName === name);
        if (item) {
          const docRef = doc(db, "inventory_logs", item.id);
         
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
            docRef,
            item.inventoryUnit === "ML"
              ? {
                  totalML: newTotal,
                  health: newHealth
                }
              : {
                  totalTests: newTotal,
                  health: newHealth
                }
          );


          controlNames.push(name);
          batchNumbers.push(item.batchNo || "N/A");
          
          expiryDates.push(item.expiryDate || "N/A");
          qcAuditDetails.push({
            controlName: name,
            quantityUsed: qty,
            lotNumber: item.batchNo || "N/A",
            boxNo: item.boxNo || "",
            expiryDate: item.expiryDate || "N/A"
          });
          await addConsumptionLedgerEntry({
            productName:
              item.reagentName || "Unknown",
          
            batchNo:
              item.batchNo || "N/A",
            boxNo: item.boxNo || "",
          
            machine:
              activeTab === "Biochem"
                ? "YUMIZEN C-150"
                : "ACCESS 2",
          
            inventoryType: "Control",

            metricType: item.metricType || "",

            level: qcLevel,
          
            testName: "QC Control",
          
            actionType: "QC",
          
            qty
          });

        }
      }

      await batch.commit();
      
      await addDoc(collection(db, "qc_logs"), {
        timestamp: serverTimestamp(),
        eventType: "Control",
        levelsUsed: qcLevel,
        performedBy: qcPerformedBy,
        reason: qcReason === "OTHER" ? otherReason : qcReason,
        baseLineValue,
        actualOutput,
        result: qcResult,
        rootCause: qcResult === "Failure" ? rootCause : "N/A",
        correctiveAction: qcResult === "Failure" ? correctiveAction : "N/A",
        preventativeAction: qcResult === "Failure" ? preventativeAction : "N/A",
        controlNames: controlNames.join(", "),
        batchNo: batchNumbers.join(", "),
        expiryDate: expiryDates.join(", "),
        controlsUsed: qcAuditDetails,
        machine:
        activeTab === "Biochem"
         ? "YUMIZEN C-150"
          : "ACCESS 2",
           });

      setQCSelections({});
      setBaseLineValue("");
      setActualOutput("");
      setQCResult("Success");
      setRootCause("");
      setCorrectiveAction("");
      setPreventativeAction("");
      setQCPerformedBy("");
      setQCLevel("Level I");
      setOtherReason("");
      setShowQCModal(false);

      alert("Control Logged Successfully.");
    } catch (err) { console.error("QC Error:", err); }
  };

  const toggleSelection = (id) => {
    const stringId = String(id);
    setSelectedIds(prev => prev.includes(stringId) ?
      prev.filter(itemId => itemId !== stringId) : [...prev, stringId]);
  };

  const handleConfirmMove = async () => {
    if (selectedIds.length === 0) { setIsSelectionMode(false); return; }
    let alreadyActiveName = "";
    const hasConflict = selectedIds.some(id => {
      const selectedItem = inventory.find(i => String(i.id) === String(id));
      if (!selectedItem) return false;
      const isAlreadyActive = inventory.some(i =>
        i.reagentName === selectedItem.reagentName &&
        String(i.status).trim() === "Activated" &&
        String(i.id) !== String(id)
      );
      if (isAlreadyActive) {
        alreadyActiveName = selectedItem.reagentName;
        return true;
      }
      return false;
    });

    if (hasConflict) {
      alert(`CANNOT ACTIVATE: An active unit of "${alreadyActiveName}" is already on the dashboard. Please consume the current unit before opening a new one.`);
      return;
    }

    try {
      const batch = writeBatch(db);
      selectedIds.forEach((id) => {
        const docRef = doc(db, "inventory_logs", String(id));
        const originalItem = inventory.find(item => String(item.id) === String(id));

        const activateQty = originalItem?.isConsumable
        ? 1
       : (
        originalItem?.inventoryUnit === "ML"
          ? Number(
              originalItem?.totalML ||
              originalItem?.inventoryQty ||
              0
            )
          : Number(
              originalItem?.totalTests ||
              originalItem?.totalAvailable ||
              0
            )
         );

        batch.update(
          docRef,
          originalItem?.inventoryUnit === "ML"
            ? {
                status: "Activated",
                health: 100,
                totalML: activateQty,
                openedAt: serverTimestamp()
              }
            : {
                status: "Activated",
                health: 100,
                totalTests: activateQty,
                openedAt: serverTimestamp()
              }
        );

      });
      await batch.commit();
      setSelectedIds([]); setIsSelectionMode(false);
      alert("Reagent(s) Activated (Opened) Successfully.");
    } catch (error) { console.error(error); }
  };

  return (
    <div className="dashboard-wrapper">
      <div className="dashboard-container">
        <header className="main-header">
          <h2>{activeTab.toUpperCase()} <span className="thin">Control Dashboard</span></h2>
          <div className="tab-nav">
            <button className={activeTab === "Biochem" ? "active" : ""} onClick={() => { setActiveTab("Biochem"); setIsSelectionMode(false); setSelectedIds([]); }}>DEPARTMENTAL INVENTORY</button>
            <button className={activeTab === "Hormones" ? "active" : ""} onClick={() => { setActiveTab("Hormones"); setIsSelectionMode(false); setSelectedIds([]); }}>HORMONES</button>
          </div>
        </header>

        {/* REAGENT HEALTH GRID */}
        <div className="hero-status-grid">
          <div className="status-card health-card">
            <span className="label-dim">Active Reagent Health:</span>
            <div className="active-reagents-list">
              {machineReagents.map(reagent => {
               const healthVal = getHealthPercent(reagent);
                const colorClass = healthVal > 60 ? "bg-high" : healthVal > 25 ? "bg-mid" : "bg-low";
                const textColor = healthVal > 60 ? "var(--neon-green)" : healthVal > 25 ? "#fbbf24" : "var(--neon-red)";
                return (
                  <div key={reagent.id} className="reagent-health-item">

                    {isSelectionMode && <input type="checkbox" checked={selectedIds.includes(reagent.id)} onChange={() => toggleSelection(reagent.id)} />}
                    <div className="health-data-block">
                      <span className="reagent-mini-name">{reagent.reagentName}</span>
                      <div
                        style={{
                          fontSize: "0.7rem",
                          opacity: 0.7,
                          marginTop: "2px"
                        }}
                      >
                        Lot: {reagent.batchNo || "N/A"}
                        {reagent.boxNo && ` | Box: ${reagent.boxNo}`}
                      </div>
                      <div className="health-stats-row">

                      <span className="tests-left label">
                      {getRemainingQty(reagent)} {reagent.inventoryUnit || "Tests"} Left
                      </span>


                        <span className="health-pct" style={{ color: textColor }}>{healthVal}%</span>
                      </div>
                      <div className="progress-bar">
                        <div className={`progress-fill ${colorClass}`} style={{ width: `${healthVal}%` }}></div>
                      </div>
                    </div>
                    {!isSelectionMode && (
                      <div className="card-mini-actions">
                        <button className="btn-mini bonus" 
                        disabled={getRemainingQty(reagent) > 0}
                       onClick={() => handleBonus(reagent)}>Bonus</button>
                        <button className="btn-mini excess" onClick={() => handleExcess(reagent)}>Excess</button>
                        <button className="btn-mini consume" 
                        disabled={getRemainingQty(reagent) > 0}
                        onClick={() => handleMarkConsumed(reagent)}>Consumed</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="secondary-cards-row">
            <div className="status-card health-card">
              <span className="label-dim">Calibration Status:</span>
              <div className="active-reagents-list">
                {activeCalibrators.map(cal => (
                  <div key={cal.id} className="reagent-health-item">
                    {isSelectionMode && <input type="checkbox" checked={selectedIds.includes(cal.id)} onChange={() => toggleSelection(cal.id)} />}
                    <div className="health-data-block">
                      <span className="reagent-mini-name">{cal.reagentName}</span>
                      <div
                        style={{
                          fontSize: "0.7rem",
                          opacity: 0.7,
                          marginTop: "2px"
                        }}
                      >
                        Lot: {cal.batchNo || "N/A"}
                        {cal.boxNo && ` | Box: ${cal.boxNo}`}
                      </div>
                      <div className="health-stats-row">
                    <span className="tests-left label">
                      {getRemainingQty(cal)} {cal.inventoryUnit || "ML"} Left
                    </span>

                    <span className="health-pct" style={{ color: 'var(--neon-blue)' }}>
                      {getHealthPercent(cal)}%
                    </span>
                  </div>

                  <div className="progress-bar">
                    <div
                      className="progress-fill bg-blue-step"
                      style={{ width: `${getHealthPercent(cal)}%` }}
                    ></div>
                  </div>  


                    </div>
                    {!isSelectionMode && (
                      <div className="card-mini-actions">
                        <button className="btn-mini bonus" 
                       disabled={getRemainingQty(cal) > 0}
                        onClick={() => handleBonus(cal)}>Bonus</button>
                        <button className="btn-mini excess" onClick={() => handleExcess(cal)}>Excess</button>
                        <button className="btn-mini consume" 
                        disabled={getRemainingQty(cal) > 0}
                         onClick={() => handleMarkConsumed(cal)}>Consumed</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="status-card health-card">
              <span className="label-dim">Active Controls (QC):</span>
              <div className="active-reagents-list">
                {activeControls.map(ctrl => (
                  <div key={ctrl.id} className="reagent-health-item">
                    {isSelectionMode && <input type="checkbox" checked={selectedIds.includes(ctrl.id)} onChange={() => toggleSelection(ctrl.id)} />}
                    <div className="health-data-block">
                      <span className="reagent-mini-name">{ctrl.reagentName}</span>

                      <div
                        style={{
                          fontSize: "0.7rem",
                          opacity: 0.7,
                          marginTop: "2px"
                        }}
                      >
                        Lot: {ctrl.batchNo || "N/A"}
                        {ctrl.boxNo && ` | Box: ${ctrl.boxNo}`}
                      </div>
                <div className="health-stats-row">
            <span className="tests-left label">
              {getRemainingQty(ctrl)} {ctrl.inventoryUnit || "ML"} Left
            </span>

            <span className="health-pct" style={{ color: 'var(--neon-blue)' }}>
              {getHealthPercent(ctrl)}%
            </span>
          </div>

          <div className="progress-bar">
            <div
              className="progress-fill bg-blue-step"
              style={{ width: `${getHealthPercent(ctrl)}%` }}
            ></div>
          </div> 


                    </div>
                    {!isSelectionMode && (
                      <div className="card-mini-actions">
                        <button className="btn-mini bonus" 
                       disabled={getRemainingQty(ctrl) > 0}
                       onClick={() => handleBonus(ctrl)}>Bonus</button>
                        <button className="btn-mini consume" 
                        disabled={getRemainingQty(ctrl) > 0}
                        onClick={() => handleMarkConsumed(ctrl)}>Consumed</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="status-card health-card">
            <span className="label-dim">Active Consumables:</span>
            <div className="active-reagents-list">
           {activeConsumables.map(cons => ( <div key={cons.id} className="reagent-health-item">
             <div className="health-data-block">
            
            <span className="reagent-mini-name">
            {cons.reagentName}
            </span>
                        <div
              style={{
                fontSize: "0.7rem",
                opacity: 0.7,
                marginTop: "2px"
              }}
              >
              Lot: {cons.batchNo || "N/A"}
              {cons.boxNo && ` | Box: ${cons.boxNo}`}
            </div>
          
            <div className="health-stats-row">
            <span style={{color: 'var(--neon-blue)',fontSize: '0.75rem',fontWeight: 'bold'}}
            > ACTIVE PACK
            </span>
          </div>
         </div>

        {!isSelectionMode && (
          <div className="card-mini-actions">
            <button
              className="btn-mini consume"
              onClick={() => handleMarkConsumed(cons)}
            >
              Consumed
            </button>
          </div>
           )}
          </div>
           ))}
          </div>
          </div>
          </div>
          </div>

        <div className="action-row">
          {!isSelectionMode ? (
            <>
              <button className="btn-hero btn-green" onClick={() => setIsSelectionMode(true)}>🔄 Change Reagent</button>
              <button className="btn-hero btn-blue" onClick={() => setShowQCModal(true)}>🧪 Log QC</button>
              <button className="btn-hero btn-blue" onClick={() => setShowCalModal(true)}>📊 Calibrate</button>
              <button className="btn-hero btn-red" onClick={() => setIsSelectionMode(true)}>🗑 Log Waste</button>
            </>
          ) : (
            <>
              <button className="btn-hero btn-confirm" onClick={() => {
                const someActive = selectedIds.some(id => inventory.find(i => i.id === id)?.status === "Activated");
                if (someActive) { setShowWasteModal(true); } else { handleConfirmMove(); }
              }}>✅ Confirm Selection ({selectedIds.length})</button>
              <button className="btn-hero btn-red" onClick={() => { setIsSelectionMode(false); setSelectedIds([]); }}>✖ Cancel</button>
            </>
          )}
        </div>

        {/* DIGITAL FRIDGE */}
        <div className="fridge-section" style={{ marginTop: '20px' }}>
          <h3 className="section-title">DIGITAL FRIDGE</h3>
          <div className="fridge-grid" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {Object.values(groupedStorage).map((group) => (
              <div key={group.name} className="reagent-stock-group">
                <div className="reagent-summary-card" onClick={() => setExpandedReagent(expandedReagent === group.name ? null : group.name)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', background: 'rgba(255,255,255,0.05)', border: '1px solid #333', borderRadius: '8px', cursor: 'pointer' }}>
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
                      <th style={{ padding: '5px 0' }}>Lot No</th>
                      <th style={{ padding: '5px 0' }}>Box No</th>
                      <th style={{ padding: '5px 0' }}>Expiry Date</th>
                      <th style={{ textAlign: 'right' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.batches.map((item, index) => {
                          const isNearestExpiry = index === 0;
                          return (
                            <tr key={item.id} style={{ borderBottom: '1px solid #222', opacity: (isSelectionMode && !isNearestExpiry) ? 0.4 : 1 }}>
                              {isSelectionMode && (
                                <td style={{ padding: '8px 0' }}>
                                  <input type="checkbox" disabled={!isNearestExpiry} style={{ cursor: isNearestExpiry ? 'pointer' : 'not-allowed' }} checked={selectedIds.includes(String(item.id))} onChange={() => isNearestExpiry && toggleSelection(item.id)} />
                                </td>
                              )}
                              <td className="mono" style={{ padding: '8px 0', fontSize: '0.8rem' }}>
                              {item.batchNo || "N/A"}
                            </td>

                            <td className="mono" style={{ padding: '8px 0', fontSize: '0.8rem' }}>
                              {item.boxNo || "-"}
                            </td>

                              <td style={{ padding: '8px 0', fontSize: '0.8rem', color: isNearestExpiry && isSelectionMode ? 'var(--neon-blue)' : 'inherit' }}>
                                {item.expiryDate} {isNearestExpiry && isSelectionMode && "(Use First)"}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <span className="dot-status in-storage">In Storage</span>
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
        </div>

        {/* WASTE MODAL */}
        {showWasteModal && (
          <div className="cal-modal-overlay">
            <div className="cal-modal-box">
              <h3>Confirm Waste Log</h3>
              {selectedIds.map(id => (
                <div key={id} style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 
                 {(() => {
                  const item = inventory.find(i => i.id === id);

                  return (
                    <span style={{ fontSize: "0.8rem" }}>
                      {item?.reagentName}
                      <br />
                      <small>
                        Lot: {item?.batchNo || "N/A"}
                        {item?.boxNo && ` | Box: ${item.boxNo}`}
                      </small>
                    </span>
                  );
                })()}

                  <select style={{ background: '#222', color: 'white', border: '1px solid #444', padding: '5px' }} value={wasteReasons[id] || "Expired"} onChange={(e) => setWasteReasons({ ...wasteReasons, [id]: e.target.value })}>
                    <option value="Expired">Expired</option>
                    <option value="Contaminated">Contaminated</option>
                    <option value="QC Fail">QC Fail</option>
                    <option value="Damaged">Damaged</option>
                  </select>
                </div>
              ))}
              <div className="modal-actions">
                <button className="btn-modal-confirm" onClick={handleFinalLogExpiry}>Confirm Waste</button>
                <button className="btn-modal-cancel" onClick={() => setShowWasteModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* FIXED QC MODAL - Failure fields now underneath the quantity list */}
        {showQCModal && (
          <div className="cal-modal-overlay">
            <div className="cal-modal-box" style={{ width: '500px', maxHeight: '90vh', overflowY: 'auto'}}>
              <h3>Log Control (QC)</h3>
              <div className="cal-form-group">
            <label>Reason:</label>
            <select
              value={qcReason}
              onChange={(e) => setQCReason(e.target.value)}
            >
              <option value="DAILY">DAILY</option>
              <option value="NEW LOT OF REAGENT">
                NEW LOT OF REAGENT
            </option>
            <option value="MAINTENANCE">
              MAINTENANCE
            </option>
              <option value="OTHER">
                OTHER
              </option>
            </select>
          </div>

          <div className="cal-form-group">
        <label>Control Level:</label>

        <select
          value={qcLevel}
          onChange={(e) => setQCLevel(e.target.value)}
        >
          <option value="Level I">Level I</option>
          <option value="Level II">Level II</option>
          <option value="Level III">Level III</option>
        </select>
      </div>

      <div className="cal-form-group">
  <label>Performed By:</label>

  <input
    type="text"
    value={qcPerformedBy}
    onChange={(e) => setQCPerformedBy(e.target.value)}
    placeholder="Enter staff name"
    style={{
      background: "#222",
      color: "white",
      border: "1px solid #444",
      padding: "8px"
    }}
  />
</div>

              {qcReason === "OTHER" && (
                <div className="cal-form-group">
                  <input type="text" placeholder="Specify Other Reason..." value={otherReason} onChange={(e) => setOtherReason(e.target.value)} style={{background:'#222', color:'white', border:'1px solid var(--neon-blue)', padding:'8px'}} />
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                <div className="cal-form-group" style={{ flex: 1 }}>
                  <label>Base Line Value:</label>
                  <input type="text" value={baseLineValue} onChange={(e) => setBaseLineValue(e.target.value)} style={{background:'#222', color:'white', border:'1px solid #444', padding:'8px'}} />
                </div>
                <div className="cal-form-group" style={{ flex: 1 }}>
                  <label>Actual Output:</label>
                  <input type="text" value={actualOutput} onChange={(e) => setActualOutput(e.target.value)} style={{background:'#222', color:'white', border:'1px solid #444', padding:'8px'}} />
                </div>
              </div>

              <div className="cal-form-group">
                <label>Result:</label>
                <select value={qcResult} onChange={(e) => setQCResult(e.target.value)}>
                  <option value="Success">Success</option>
                  <option value="Failure">Failure</option>
                </select>
              </div>

              {/* QUANTITY USED BLOCK - ALWAYS VISIBLE */}
              <div 
                className="cal-list" 
                 style={{ 
                marginTop: '10px', 
                padding: '10px', 
                background: 'rgba(255,255,255,0.03)', 
                 borderRadius: '8px',
                maxHeight: '200px',          // ✅ controls height
                overflowY: 'auto',           // ✅ enables scroll ONLY here
                flexShrink: 0                // ✅ prevents compression/overlap
              }}
            >
  <label className="label-dim" style={{ marginBottom: '10px', display: 'block' }}>
  Control & Use 1 Round:
  </label>

  <table style={{ width: '100%', color: 'white' }}>
  <thead>
      <tr>
         <th style={{ textAlign: 'left' }}>
            Control
            </th>

      <th style={{ textAlign: 'center' }}>
          Qty Used
              </th>
                </tr>
                  </thead>
   
    <tbody>
      {activeControls.map(ctrl => (
        <tr key={ctrl.id}>
          <td style={{ padding: '8px 0', fontSize: '0.8rem' }}>
            {ctrl.reagentName} <br />
            <small style={{ color: '#666' }}>
              Lot: {ctrl.batchNo || "N/A"}
              {ctrl.boxNo && ` | Box: ${ctrl.boxNo}`}
            </small>
          </td>
          <td>
             <input
          type="checkbox"
          checked={qcSelections[ctrl.reagentName] || false}
          onChange={(e)=>
            setQCSelections({
              ...qcSelections,
              [ctrl.reagentName]: e.target.checked
            })
          }
        />
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
              {/* FAILURE FIELDS - NOW APPEARS UNDERNEATH THE QUANTITY BLOCK */}
              {qcResult === "Failure" && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px', padding: '10px', border: '1px solid var(--neon-red)', borderRadius: '8px', background: 'rgba(255,0,0,0.05)' }}>
                  <div className="cal-form-group">
                    <label style={{color: 'var(--neon-red)', fontSize: '0.75rem'}}>Root Cause Analysis:</label>
                    <textarea value={rootCause} onChange={(e) => setRootCause(e.target.value)} style={{background:'#111', color:'white', border:'1px solid #444', minHeight: '60px', padding: '8px'}} />
                  </div>
                  <div className="cal-form-group">
                    <label style={{color: 'var(--neon-red)', fontSize: '0.75rem'}}>Corrective Action:</label>
                    <textarea value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} style={{background:'#111', color:'white', border:'1px solid #444', minHeight: '60px', padding: '8px'}} />
                  </div>
                  <div className="cal-form-group">
                    <label style={{color: 'var(--neon-red)', fontSize: '0.75rem'}}>Preventative Action:</label>
                    <textarea value={preventativeAction} onChange={(e) => setPreventativeAction(e.target.value)} style={{background:'#111', color:'white', border:'1px solid #444', minHeight: '60px', padding: '8px'}} />
                  </div>
                </div>
              )}

              <div className="modal-actions" style={{ marginTop: '20px' }}>
                <button className="btn-modal-confirm" onClick={handleConfirmQC}>Confirm & Log QC</button>
                <button className="btn-modal-cancel" onClick={() => setShowQCModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* CALIBRATION MODAL */}
       
       
  {showCalModal && (
  <div className="cal-modal-overlay">
    <div className="cal-modal-box" style={{ maxHeight: '90vh', overflowY: 'auto' }}>

      <h3>Run Calibration Audit</h3>

      <div className="cal-form-group">
        <label>Reason:</label>
        <select value={calReason} onChange={(e) => setCalReason(e.target.value)}>
          <option value="Machine Demand">Machine Demand</option>
          <option value="Reagent Change">Reagent Change</option>
          <option value="Maintenance">Maintenance</option>
        </select>
      </div>

      

        <div className="cal-form-group">
          <label>Result:</label>

          <select
            value={calResult}
            onChange={(e) => setCalResult(e.target.value)}
          >
            <option value="Success">Success</option>
            <option value="Failure">
            Failure 
          </option>
          </select>
        </div>

        <div className="cal-form-group">
        <label>Performed By:</label>

        <input
          type="text"
          value={calPerformedBy}
          onChange={(e) =>
            setCalPerformedBy(e.target.value)
          }
          placeholder="Enter staff name"
          style={{
            background: "#222",
            color: "white",
            border: "1px solid #444",
            padding: "8px"
          }}
        />
      </div>

      <div className="cal-form-group">
  <label>Parameters Calibrated:</label>

  <input
    type="text"
    value={calParameters}
    onChange={(e) =>
      setCalParameters(e.target.value)
    }
    placeholder="e.g. TSH, FT4, LH"
    style={{
      background: "#222",
      color: "white",
      border: "1px solid #444",
      padding: "8px"
    }}
  />
    </div>




      {/* CALIBRATOR LIST */}
      <div
  className="cal-list"
  style={{
    marginTop: '10px',
    padding: '10px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '8px',
    maxHeight: '200px',
    overflowY: 'auto',
    flexShrink: 0
  }}
>
  <label className="label-dim" style={{ marginBottom: '10px', display: 'block' }}>
  Calibrator & Use 1 Round:
  </label>

  <table style={{ width: '100%', color: 'white' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>
                Calibrator
              </th>

              <th style={{ textAlign: 'center' }}>
                Qty Used
              </th>
            </tr>
          </thead>

          <tbody>
      {activeCalibrators.map(cal => (
        <tr key={cal.id}>
          <td style={{ padding: '8px 0', fontSize: '0.8rem' }}>
          {cal.reagentName}
            <br />
            <small style={{ color: '#666' }}>
              Lot: {cal.batchNo || "N/A"}
              {cal.boxNo && ` | Box: ${cal.boxNo}`}
            </small>
          </td>

          <td style={{ textAlign: 'right', width: '80px' }}>
           <input
            type="checkbox"
            checked={calSelections[cal.reagentName] || false}
            onChange={(e)=>
              setCalSelections({
                ...calSelections,
                [cal.reagentName]: e.target.checked
              })
            }
          />

          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>

      {/* 🔥 FAILURE BLOCK (NEW) */}
      {calResult === "Failure" && (
        <div
          style={{
            marginTop: '20px',
            padding: '10px',
            border: '1px solid var(--neon-red)',
            borderRadius: '8px',
            background: 'rgba(255,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <div className="cal-form-group">
            <label style={{ color: 'var(--neon-red)' }}>Root Cause Analysis:</label>
            <textarea
              value={calRootCause}
              onChange={(e) => setCalRootCause(e.target.value)}
              style={{background: '#111',
              color: 'white',
              border: '1px solid #444',
              minHeight: '60px',
              padding: '8px'}}
            />
          </div>

          <div className="cal-form-group">
            <label style={{ color: 'var(--neon-red)' }}>Corrective Action:</label>
            <textarea
              value={calCorrectiveAction}
              onChange={(e) => setCalCorrectiveAction(e.target.value)}
              style={{ background: '#111',
              color: 'white',
              border: '1px solid #444',
              minHeight: '60px',
              padding: '8px',
              width: '100%'}}
            />
          </div>

          <div className="cal-form-group">
            <label style={{ color: 'var(--neon-red)' }}>Preventative Action:</label>
            <textarea
              value={calPreventativeAction}
              onChange={(e) => setCalPreventativeAction(e.target.value)}
              style={{
              background: '#111',
              color: 'white',
              border: '1px solid #444',
              minHeight: '60px',
              padding: '8px',
              width: '100%'}}
            />
          </div>
        </div>
      )}

      <div className="modal-actions">
        <button className="btn-modal-confirm" onClick={handleConfirmCalibration}>
          Confirm & Log Audit
        </button>
        <button className="btn-modal-cancel" onClick={() => setShowCalModal(false)}>
          Cancel
        </button>
      </div>

      </div>
    </div>
  )}
      </div>
    </div>
  );
};