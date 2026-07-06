
import React, { useState, useEffect } from "react";
import { db } from "../firebaseConfig";
import { 
  collection, addDoc, query, where, getDocs, 
  writeBatch, doc, increment
} from "firebase/firestore";
import { testToReagentMap } from "../inventory/inventorymapping"; 
import "./BackupEntry.css";

import DeptInventoryTab from "../inventory/BackupInventoryTab.jsx";

const CATEGORIES = [
  "RGHS", "CGHS", "ECHS", "General", "Insurance", "AAI", "CAPF", 
  "Chiranjeevi Swasthiya Bima Yojna", "Food Cooperation Of India", 
  "Health Package", "ICMR", "IIT", "Indian Oil Corporation Of India", 
  "ISRO", "Oil India", "ONGC", "Railways", "RHB", "TPA"
];

const BIO_TESTS = [
  "ALBUMIN,SERUM - BACKUP",
  "ALKALINE PHOSPHATASE,SERUM - BACKUP",
  "AMYLASE,SERUM - BACKUP",
  "BILIRUBIN(TOTAL,DIRECT & INDIRECT),SERUM - BACKUP",
  "BLOOD GLUCOSE OGT - BACKUP",
  "BLOOD UREA,SERUM - BACKUP",
  "CALCIUM IONISED - GEM 3500",
  "CHLORIDE,SERUM - GEM 3500",
  "CHOLESTEROL,SERUM - BACKUP",
  "CREATININE,SERUM - BACKUP",
  "CRP(C-REACTIVE PROTEIN,SERUM QUANTITATIVE) - BACKUP",
  "CRP(C-REACTIVE PROTEIN,SERUM QUANTITATIVE) - MISPA",
  "ELECTROLYTES,SERUM - GEM 3500",
  "G.G.T(GAMMA GLUTAMYL TRANSFERASE,SERUM) - BACKUP",
  "GLUCOSE FASTING,PLASMA - BACKUP",
  "GLUCOSE POST - PRANDIAL( P.P. ),PLASMA - BACKUP",
  "GLUCOSE RANDOM,PLASMA - BACKUP",
  "GLYCOSYLATED HEMOGLOBIN(HbA1c) - MISPA",
  "LACTATE DEHYDROGENASE,SERUM - BACKUP",
  "LFT (LIVER FUNCTION TEST) - BACKUP",
  "LIPID PROFILE - BACKUP",
  "ORAL GLUCOSE TOLERANCE TEST(OGTT) - BACKUP",
  "PHOSPHORUS,SERUM - BACKUP",
  "POTASSIUM,SERUM - GEM 3500",
  "RHEUMATOID FACTOR QUANTITATIVE,SERUM - BACKUP",
  "RHEUMATOID FACTOR QUANTITATIVE,SERUM - MISPA",
  "RFT(RENAL FUNCTION TEST) - BACKUP",
  "SGOT(ASPARTATE AMINOTRANSFERASE,SERUM) - BACKUP",
  "SGPT(ALANINE AMINOTRANSFERASE,SERUM) - BACKUP",
  "SODIUM,SERUM - GEM 3500",
  "TOTAL PROTEIN,SERUM - BACKUP",
  "TRIGLYCERIDES,SERUM - BACKUP",
  "URIC ACID, SERUM - BACKUP"
];

const HORMONE_TESTS = [
  "AMH (ANTI MULLERIAN HORMONE) - BACKUP",
  "BETA-HCG (HUMAN CHORIONIC GONADOTROPIN)  - BACKUP",
  "E2 (ESTRADIOL II)  - BACKUP",
  "FERRITIN  - BACKUP",
  "FSH (FOLLICLE STIMULATING HORMONE)  - BACKUP",
  "FT4 (FREE THYROXINE)  - BACKUP",
  "LH (LUTEINIZING HORMONE)  - BACKUP",
  "PROLACTIN  - BACKUP",
  "T3  - BACKUP", "T4  - BACKUP",
  "TSH (THYROID STIMULATING HORMONE)  - BACKUP",
  "PROGESTERONE  - BACKUP",
  "VITAMIN B12 LEVEL  - BACKUP",
  "VITAMIN D25 (OH) TOTAL  - BACKUP",
  "PSA  - BACKUP"
];

const ELECTRO_TESTS = [
  "ELECTROLYTES,SERUM - GEM 3500",
  "SODIUM,SERUM - GEM 3500",
  "CHLORIDE,SERUM - GEM 3500",
  "POTASSIUM,SERUM - GEM 3500",
];

const BackupEntry = () => {
  const [activeTab, setActiveTab] = useState("register");
  const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [savedLogs, setSavedLogs] = useState([]);
  const [rows, setRows] = useState([
    { id: Date.now(), name: "", sid: "", category: "", biochemistry: [], hormones: [], electrolytes: [], isSaved: false }
  ]);

  const fetchLogs = async () => {
    try {
      const q = query(collection(db, "backup_entries_logs"));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const filtered = data.filter(log => {
        if (!log.savedTime) return false;
        const datePart = log.savedTime.split(' at ')[0]; 
        const logDate = new Date(datePart);
        const logTime = new Date(logDate.getFullYear(), logDate.getMonth(), logDate.getDate()).getTime();
        const startArr = fromDate.split("-");
        const startDate = new Date(startArr[0], startArr[1] - 1, startArr[2]).getTime();
        const endArr = toDate.split("-");
        const endDate = new Date(endArr[0], endArr[1] - 1, endArr[2]).getTime();
        return logTime >= startDate && logTime <= endDate;
      });
      setSavedLogs(filtered);
    } catch (e) {
      console.error("Error fetching logs:", e);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [fromDate, toDate]);

  const addPatientRow = () => {
    setRows([...rows, { id: Date.now(), name: "", sid: "", category: "", biochemistry: [], hormones: [], electrolytes: [], isSaved: false }]);
  };

  const updateRowField = (id, field, value) => {
    setRows(rows.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const addTestToRow = (rowId, section) => {
    setRows(rows.map(row => row.id === rowId ? { ...row, [section]: [...row[section], { testName: "", value: "" }] } : row));
  };

  const updateTestValue = (rowId, section, testIndex, field, value) => {
    setRows(rows.map(row => {
      if (row.id === rowId) {
        const newSection = [...row[section]];
        newSection[testIndex][field] = value;
        return { ...row, [section]: newSection };
      }
      return row;
    }));
  };

  const handleKeyDown = (e, rowId, section) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTestToRow(rowId, section);
    }
  };


  const getInventoryCategory = (category) => {
    if (!category) return "GENERAL";
  
    const cat = category.trim();
  
    if (
      cat === "General" ||
      cat === "CAPF" ||
      cat === "TPA"
    ) {
      return "GENERAL";
    }
  
    if (cat === "RGHS") {
      return "RGHS";
    }
  
    return "OTHER";
  };

  const handleSaveRow = async (rowId) => {
    const row = rows.find(r => r.id === rowId);
    if (!row || !row.sid) return alert("Please enter at least a Diagnostic Number.");

    const batch = writeBatch(db);
    const inventoryRef = collection(db, "inventory_logs");

    try {
      // 1. DEDUCTION LOGIC
      const allTestsFlattened = [...row.biochemistry, ...row.hormones, ...row.electrolytes].filter(t => t.testName);
      
      for (const item of allTestsFlattened) {
        let mapping = testToReagentMap[item.testName];
        if (!mapping) continue;

        // Check for category-specific mapping (GENERAL or RGHS/ARGH)
        if (
          mapping.GENERAL ||
          mapping.RGHS ||
          mapping.OTHER
      ) {
          const catKey =
            getInventoryCategory(row.category);
      
          mapping =
            mapping[catKey] ||
            mapping["GENERAL"];
      }

        const itemsToDeduct = Array.isArray(mapping) ? mapping : [mapping];

        for (const reagentInfo of itemsToDeduct) {
            const rName = typeof reagentInfo === "string" ? reagentInfo : reagentInfo.name;
            const deductQty = reagentInfo.qty || 1;

            const q = query(
                inventoryRef, 
                where("reagentName", "==", rName), 
                where("status", "==", "Activated")
            );

            const snap = await getDocs(q);
            snap.forEach((docSnap) => {
                const data = docSnap.data();
                const currentTests = Number(data.totalTests) || 0;
                const initialCapacity = Number(data.totalAvailable) || 1;
                
                const newTotal = Math.max(0, currentTests - deductQty);
                const newHealth = Math.round((newTotal / initialCapacity) * 100);

                batch.update(doc(db, "inventory_logs", docSnap.id), {
                    totalTests: newTotal,
                    health: newHealth
                });
            });
        }
      }

      // 2. SAVE LOG LOGIC
      const formatSection = (data) => {
        const obj = {};
        data.forEach(t => { if(t.testName) obj[t.testName] = t.value; });
        return obj;
      };

      const finalData = {
        name: row.name,
        diagnosticNo: row.sid,
        category: row.category,
        biochemistry: formatSection(row.biochemistry),
        hormones: formatSection(row.hormones),
        electrolytes: formatSection(row.electrolytes),
        status: true,
        savedTime: new Date().toLocaleString('en-US', { 
            month: 'long', day: 'numeric', year: 'numeric', 
            hour: 'numeric', minute: '2-digit', second: '2-digit', 
            hour12: true 
        }) + " UTC+5:30"
      };

      await addDoc(collection(db, "backup_entries_logs"), finalData);
      await batch.commit();
      
      // REMOVE the row from local state instead of just marking isSaved
      setRows(prevRows => prevRows.filter(r => r.id !== rowId));
      
      alert(`Patient ${row.sid} saved successfully and inventory updated!`);
      fetchLogs();
    } catch (e) { 
      console.error(e); 
      alert("Error saving entry: " + e.message);
    }
  };

  return (
    <div className="backup-entry-container">
      <div className="tab-container">
        <button className={`tab-btn ${activeTab === "register" ? "active" : ""}`} onClick={() => setActiveTab("register")}>
          Backup Register
        </button>
        <button className={`tab-btn ${activeTab === "inventory" ? "active" : ""}`} onClick={() => setActiveTab("inventory")}>
          Inventory
        </button>
      </div>

      <div style={{ display: activeTab === "register" ? "block" : "none" }}>

      <h2 className="dept-header">
  Biochemistry Department — Backup Analyzer
</h2>

<div className="filter-bar">
  <div className="date-filters">
    <label>Date:</label>

    <input
      type="date"
      value={fromDate}
      onChange={(e) => setFromDate(e.target.value)}
    />

    <span>to</span>

    <input
      type="date"
      value={toDate}
      onChange={(e) => setToDate(e.target.value)}
    />
  </div>
</div>





        
        <div className="table-wrapper">
          <div className="register-header-row">
            <div className="col-label">Patient Name</div>
            <div className="col-label">Diagnostic Number</div>
            <div className="col-label">Category</div>
            <div className="col-label">Biochemistry</div>
            <div className="col-label">Hormones</div>
            <div className="col-label">Electrolytes</div>
            <div className="col-label">Action</div>
          </div>

          {savedLogs.map((log) => (
            <div key={log.id} className="patient-register-row saved-row">
              <div className="patient-cell"><input value={log.name} disabled /></div>
              <div className="patient-cell"><input value={log.diagnosticNo} disabled /></div>
              <div className="patient-cell"><input value={log.category} disabled /></div>
              {['biochemistry', 'hormones', 'electrolytes'].map(sec => (
                <div key={sec} className="section-column-brick">
                  <div className="inner-stack">
                    {Object.entries(log[sec] || {}).map(([test, val], idx) => (
                      <div key={idx} className="mini-brick-row">
                        <input className="saved-test-name" value={test} disabled />
                        <input className="val-input" value={val} disabled />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="patient-cell">
                  <button className="row-save-btn saved-status-btn" disabled>SAVED</button>
              </div>
            </div>
          ))}

          {rows.map((row) => (
            <div key={row.id} className={`patient-register-row ${row.isSaved ? "saved-row" : ""}`}>
              <div className="patient-cell">
                <input placeholder="Name" value={row.name} onChange={(e) => updateRowField(row.id, "name", e.target.value)} disabled={row.isSaved} />
              </div>
              <div className="patient-cell">
                <input placeholder="Diagnostic Number" value={row.sid} onChange={(e) => updateRowField(row.id, "sid", e.target.value)} disabled={row.isSaved} />
              </div>
              <div className="patient-cell">
                <select className="category-select" value={row.category} onChange={(e) => updateRowField(row.id, "category", e.target.value)} disabled={row.isSaved}>
                  <option value="">Select Category</option>
                  {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              {['biochemistry', 'hormones', 'electrolytes'].map(sec => (
                <div key={sec} className="section-column-brick">
                  <div className="inner-stack">
                    {row[sec].map((t, idx) => (
                      <div key={idx} className="mini-brick-row">
                        <select value={t.testName} onChange={(e) => updateTestValue(row.id, sec, idx, "testName", e.target.value)} disabled={row.isSaved}>
                          <option value="">Select Test</option>
                          {sec === "biochemistry" && BIO_TESTS.map(k => <option key={k} value={k}>{k}</option>)}
                          {sec === "hormones" && HORMONE_TESTS.map(k => <option key={k} value={k}>{k}</option>)}
                          {sec === "electrolytes" && ELECTRO_TESTS.map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                        <input className="val-input" placeholder="Val" value={t.value} onChange={(e) => updateTestValue(row.id, sec, idx, "value", e.target.value)} onKeyDown={(e) => handleKeyDown(e, row.id, sec)} disabled={row.isSaved} />
                      </div>
                    ))}
                    {!row.isSaved && <button className="add-test-btn" onClick={() => addTestToRow(row.id, sec)}>+</button>}
                  </div>
                </div>
              ))}
              <div className="patient-cell">
                  <button className={`row-save-btn ${row.isSaved ? "saved-status-btn" : ""}`} onClick={() => !row.isSaved && handleSaveRow(row.id)} disabled={row.isSaved}>
                    {row.isSaved ? "SAVED" : "SAVE"}
                  </button>
              </div>
            </div>
          ))}
        </div>

        <div className="centered-add-container">
           <button className="add-row-circle" onClick={addPatientRow} title="Add New Patient">+</button>
        </div>
      </div>

      <div style={{ display: activeTab === "inventory" ? "block" : "none" }}>
        <DeptInventoryTab department="Biochemistry" machineType="Backup" />
      </div>
    </div>
  );
};

export default BackupEntry;