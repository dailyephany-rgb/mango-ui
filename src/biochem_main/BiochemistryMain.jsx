
import React, { useEffect, useState, useMemo } from "react";
import "./BiochemistryMain.css";
import { db } from "../firebaseConfig.js";
import {
  collection,
  onSnapshot,
  updateDoc,
  doc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import biochemRouting from "../biochem_testRouting.json";
import HormonesMain from "./HormonesMain.jsx";
// NEW IMPORTS FOR INVENTORY
import DeptInventoryTab from "../inventory/DeptInventoryTab.jsx";

import {
  handleInventoryDeduction,
  getVitrosDeductibleTests
} from "../inventory/inventorymapping";

import { requireLogin } from "../auth/Authguard.js";
import UserMenu from "../auth/UserMenu";
import InventoryAdjustmentTab from "../inventory/InventoryAdjustmentTab.jsx";

const CURRENT_DEPT = "Bio-Chemistry";

export default function BiochemistryMain() {
  const [masterEntries, setMasterEntries] = useState([]);
  const [biochemDocs, setBiochemDocs] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("biochem");
  const [savedSet, setSavedSet] = useState(new Set());
  
  const [criticalReportedSet, setCriticalReportedSet] = useState(new Set());
  const [criticalParams, setCriticalParams] = useState(() => {
    const saved = localStorage.getItem(
      "biochem_pendingCritical"
    );
    return saved ? JSON.parse(saved) : {};
  });


  const [localScans, setLocalScans] = useState(() => {
    const saved = localStorage.getItem("biochem_localScans");
    return saved ? JSON.parse(saved) : {};
  });

  const [localScanTimes, setLocalScanTimes] = useState(() => {
    const saved = localStorage.getItem("biochem_localScanTimes");
    return saved ? JSON.parse(saved) : {};
  }); 

  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const biochemTests = biochemRouting?.MainAnalyzer?.tests || [];
  const getTestName = (t) => (typeof t === "string" ? t : t?.test || "");

  const normalizeSource = (raw) => {
    if (!raw) return "Unknown";
    const s = raw.trim().toLowerCase();
    if (s.includes("opd")) return "OPD";
    if (s.includes("ipd")) return "IPD";
    if (s.includes("third") || s.includes("3rd")) return "Third Floor";
    return "Unknown";
  };

  const parseDate = (entry) => {
    const fields = [entry.timePrinted, entry.timeCollected, entry.scannedTime, entry.savedTime, entry.createdAt];
    for (const f of fields) {
      if (!f) continue;
      if (typeof f === "object" && typeof f.toDate === "function") return f.toDate();
      if (typeof f === "string") { const d = new Date(f); if (!isNaN(d)) return d; }
      if (typeof f === "object" && typeof f.seconds === "number") return new Date(f.seconds * 1000);
    }
    return null;
  };

  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const today = `${y}-${m}-${d}`;

    setDateFrom(today);
    setDateTo(today);
  }, []);

  useEffect(() => {
    const unsubMaster = onSnapshot(collection(db, "master_register"), (snapshot) => {
      setMasterEntries(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    const unsubBio = onSnapshot(collection(db, "biochemistry_register"), (snap) => {
      const docsMap = {};
      const sSet = new Set();
      snap.docs.forEach((d) => {
        const data = d.data();
        const key = `${data.regNo}_${data.diagnosticNo}`;
        docsMap[key] = data;
        if (data?.saved === "Yes" || data?.status === "saved") sSet.add(key);
      });
      setBiochemDocs(docsMap);
      setSavedSet(sSet);
    });

    const unsubCritical = onSnapshot(collection(db, "critical_alerts"), (snap) => {
      const cSet = new Set();
      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.regNo && data.dept === CURRENT_DEPT) {
          const cKey = `${data.regNo}_${data.diagnosticNo}`;
          cSet.add(cKey);
        }
      });
      setCriticalReportedSet(cSet);
    });

    return () => { unsubMaster(); unsubBio(); unsubCritical(); };
  }, []);

  const patients = useMemo(() => {
    const filteredMaster = masterEntries.filter((entry) =>
      Array.isArray(entry.selectedTests) && entry.selectedTests.some((t) => biochemTests.includes(getTestName(t)))
    );

    return filteredMaster.map((entry) => {
      const regKey = `${entry.regNo}_${entry.diagnosticNo}`;
      const saved = biochemDocs[regKey] || {};
      const localScan = localScans[regKey];
      const localScanTime =localScanTimes[regKey];
      const currentScanned = localScan ?? saved.scanned ?? "No";
      const isSaved = savedSet.has(regKey);

      return {
        ...entry,
        ...saved,
        compositeKey: regKey,
        source: normalizeSource(entry.source || entry.category),
        scanned: currentScanned,
        scannedTime:localScanTime ??saved.scannedTime ??null,
        status: isSaved ? "saved" : currentScanned === "Yes" ? "scanned" : "pending",
        urgent: entry.urgent || false,
        id: entry.id 
      };
    });
  }, [
    masterEntries,
    biochemDocs,
    localScans,
    localScanTimes,
    savedSet,
    biochemTests
  ]);

  const handleInputChange = async (id, field, value) => {
    setMasterEntries((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
    try { await updateDoc(doc(db, "master_register", id), { [field]: value }); } catch (err) { console.error(err); }
  };

  const handleScanToggle = (patient, value) => {
    const regKey = patient.compositeKey;
    const nowIST = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }); 

    setLocalScans((prev) => {
      const updated = { ...prev, [regKey]: value };
      localStorage.setItem("biochem_localScans", JSON.stringify(updated));
      return updated;
    });

    setLocalScanTimes((prev) => {
      const updatedTimes = { ...prev, [regKey]: value === "Yes" ? nowIST : null };
      localStorage.setItem("biochem_localScanTimes", JSON.stringify(updatedTimes));
      return updatedTimes;
    });
  };

  const triggerCritical = async (entry) => {
    const parameter = window.prompt("Enter Critical Parameter & Value (e.g., K+: 7.2):");
    if (!parameter) return;
    const regKey = entry.compositeKey;
    setCriticalParams((prev) => {
      const updated = {
        ...prev,
        [regKey]: parameter,
      };
    
      localStorage.setItem(
        "biochem_pendingCritical",
        JSON.stringify(updated)
      );
    
      return updated;
    });
    alert("Parameter captured locally. Click 'Save' to send to Critical Dashboard.");
  };



  const getInventoryCategory = (category = "") => {
    const c = category.trim().toUpperCase();
  
    // GENERAL GROUP
    if (
      c === "GENERAL" ||
      c === "CAPF" ||
      c === "TPA"
    ) {
      return "GENERAL";
    }
  
    // RGHS GROUP
    if (c === "RGHS") {
      return "RGHS";
    }
  
    // EVERYTHING ELSE
    return "OTHER";
  };

  const handleSave = async (patient) => {
    try {
      const regKey = patient.compositeKey;
      const docRef = doc(db, "biochemistry_register", regKey);
      const relevantTests = patient.selectedTests?.filter((t) => biochemTests.includes(getTestName(t))).map((t) => getTestName(t));
      
      const rawLocalTime = localScanTimes[regKey];
      const scanTime = rawLocalTime ? Timestamp.fromDate(new Date(rawLocalTime)) : null;
      
      const pendingParam = criticalParams[regKey];
      const isCritical = (criticalReportedSet.has(regKey) || pendingParam) ? "Yes" : "No";

      if (pendingParam) {
        const criticalId = `${regKey}_${CURRENT_DEPT}`;
        await setDoc(doc(db, "critical_alerts", criticalId), {
            name: patient.name || "",
            regNo: patient.regNo || "",
            reportedBy: sessionStorage.getItem("loggedUser") || "Unknown",
            diagnosticNo: patient.diagnosticNo || "—",
            age: patient.age || "",
            ageUnit: patient.ageUnit || "",
            gender: patient.gender || "-",
            doctor: patient.doctor || "Self",
            timePrinted: patient.timePrinted || null,
            timeCollected: patient.timeCollected || null,
            criticalParameter: pendingParam,
            flaggedAt: serverTimestamp(),
            status: "Pending",
            dept: CURRENT_DEPT,
            selectedTests: relevantTests || [],
            source: patient.source || "-",
            category: patient.category || "-",
        });
      }

      const payload = {
        regNo: patient.regNo,
        diagnosticNo: patient.diagnosticNo || "—",
        name: patient.name || "",
        age: patient.age || "",
        ageUnit: patient.ageUnit || "",
        gender: patient.gender || "-",
        source: patient.source || "-",
        category: patient.category || "-",
        selectedTests: relevantTests || [],
        scanned: "Yes",
        scannedTime: scanTime || (patient.scannedTime || null),
        saved: "Yes",
        savedTime: serverTimestamp(), 
        savedBy: sessionStorage.getItem("loggedUser") || "Unknown",
        timePrinted: patient.timePrinted || null,
        timeCollected: patient.timeCollected || null,
        status: "saved",
        critical: isCritical 
      };

      await setDoc(docRef, payload, { merge: true });

      // TRIGGER INVENTORY DEDUCTION
      
      if (relevantTests && relevantTests.length > 0) {

        const deductionCategory =
          getInventoryCategory(patient.category);
      
        const deductibleTests =
          await getVitrosDeductibleTests(
            relevantTests
          );
      
        await handleInventoryDeduction(
          deductibleTests,
          deductionCategory
        );
      }
       
      
      setLocalScans(prev => { 
        const n = {...prev}; delete n[regKey]; 
        localStorage.setItem("biochem_localScans", JSON.stringify(n));
        return n; 
      });
      setLocalScanTimes(prev => {
        const n = {...prev}; delete n[regKey];
        localStorage.setItem("biochem_localScanTimes", JSON.stringify(n));
        return n;
      });
      setCriticalParams((prev) => {
        const n = { ...prev };
        delete n[regKey];
      
        localStorage.setItem(
          "biochem_pendingCritical",
          JSON.stringify(n)
        );
      
        return n;
      });
      alert(`Saved entry for ${payload.name} ${isCritical === "Yes" ? "(Critical Alert Sent)" : ""}`);
    } catch (err) { 
        console.error(err); 
        alert("Save failed.");
    }
  };

  if (loading) return <p>Loading Biochemistry data...</p>;

  return (
    <div className="biochem-register-container">
      <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "10px"
  }}
>
  <div className="tab-container">
    <button
      className={`tab-btn ${activeTab === "biochem" ? "active" : ""}`}
      onClick={() => setActiveTab("biochem")}
    >
      Biochemistry
    </button>

    <button
      className={`tab-btn ${activeTab === "hormones" ? "active" : ""}`}
      onClick={() => setActiveTab("hormones")}
    >
      Hormones
    </button>

    <button
      className={`tab-btn ${activeTab === "inventory" ? "active" : ""}`}
      onClick={() => setActiveTab("inventory")}
    >
      Inventory
    </button>

          <button
        className={`tab-btn ${activeTab === "adjustment" ? "active" : ""}`}
        onClick={() => setActiveTab("adjustment")}
      >
        Inventory Adjustment
      </button>






  </div>

  <UserMenu />
</div>

      <div style={{ display: activeTab === "biochem" ? "block" : "none" }}>        
              <h2 className="dept-header">
          Biochemistry Department — Main Analyzer
        </h2>
          <div className="filter-bar">
            <input className="reg-search" placeholder="Search Reg or Diag No..." value={regSearch} onChange={(e) => setRegSearch(e.target.value)} />
            <div className="date-filters">
              <label>Date:</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <span>to</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="source-buttons">
              {["OPD", "IPD", "Third Floor", "All"].map((src) => (
                <button 
                  key={src} 
                  className={sourceFilter === src ? "source-btn active" : "source-btn"} 
                  onClick={() => setSourceFilter(src)}
                >
                  {src}
                </button>
              ))}
            </div>
          </div>

          <div className="table-wrapper">
            <table className="dept-table">
              <thead>
                <tr>
                  <th>Reg No</th>
                  <th>Diag No</th> 
                  <th>Patient Name</th>
                  <th>Source</th> 
                  <th>Age</th>
                  <th>Gender</th>
                  <th>Category</th>
                  <th>Selected Tests</th>
                  <th>Remark</th>
                  <th>Scanned</th>
                  <th>Status</th>
                  <th>Saved By</th>
                  <th>Critical</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {patients
                .filter(p => {
                    if (regSearch.trim()) {
                      const searchStr = regSearch.trim().toLowerCase();
                      const key = String(p.regNo || "").toLowerCase();
                      const diag = String(p.diagnosticNo || "").toLowerCase();
                      if (!key.includes(searchStr) && !diag.includes(searchStr)) return false;
                    }
                    if (sourceFilter !== "All" && p.source !== sourceFilter) return false;
                    
                    const eDate = parseDate(p);
                    if (eDate) {
                      const entryDateStr = `${eDate.getFullYear()}-${String(eDate.getMonth() + 1).padStart(2, '0')}-${String(eDate.getDate()).padStart(2, '0')}`;
                      if (dateFrom && entryDateStr < dateFrom) return false;
                      if (dateTo && entryDateStr > dateTo) return false;
                    }
                    return true;
                })
                .sort((a, b) => {
                  if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
                  const dateA = parseDate(a);
                  const dateB = parseDate(b);
                  if (!dateA) return 1;
                  if (!dateB) return -1;
                  return dateA - dateB;
                })
                .map((p) => {
                  const regKey = p.compositeKey;
                  const isSaved = p.status === "saved";
                  const isScanned = p.scanned === "Yes";
                  const isCriticalReported = criticalReportedSet.has(regKey);
                  const isPendingCritical = !!criticalParams[regKey];
                  const rowClass = `${isSaved ? "row-green" : isScanned ? "row-yellow" : "row-normal"}`.trim();

                  return (
                    <tr key={p.compositeKey} className={rowClass}>
                      <td style={p.urgent ? { borderLeft: "4px solid red" } : {}}>
                        {p.regNo || "—"}
                      </td>
                      <td>{p.diagnosticNo || "—"}</td>
                      <td>{p.name || "—"}</td>
                      <td>{p.source || "—"}</td> 
                      <td>{p.age || "—"}</td>
                      <td>{p.gender || "-"}</td>
                      <td>{p.category || "—"}</td>
                      <td>{p.selectedTests?.filter(t => biochemTests.includes(getTestName(t))).map(t => getTestName(t)).join(", ") || "—"}</td>
                      <td><input type="text" value={p.result || ""} disabled={!isScanned || isSaved} onChange={(e) => handleInputChange(p.id, "result", e.target.value)} placeholder="Remark" /></td>
                      <td>
                        <select value={isScanned ? "Yes" : "No"} disabled={isSaved} onChange={(e) => handleScanToggle(p, e.target.value)}>
                          <option value="No">No</option>
                          <option value="Yes">Yes</option>
                        </select>
                      </td>
                            <td style={{ fontWeight: "600", color: "#1e3a8a" }}> {p.savedBy || "—"}
                            </td>
                      <td style={{ textAlign: 'center' }}>
     
                       {(isCriticalReported ||
                            isPendingCritical) && (
                            <span
                              style={{
                                color: "red",
                                fontWeight: "bold",
                                fontSize: "10px"
                              }}
                            >
                              CRITICAL{" "}
                              {isCriticalReported
                                ? "REPORTED"
                                : "PENDING SAVE"}
                            </span>
                          )}

                      </td>
                      <td>
                        <button
                          onClick={() => triggerCritical(p)}
                          disabled={
                            isCriticalReported ||
                            isPendingCritical ||
                            isSaved ||
                            !isScanned
                          }

                          style={{ 
                            backgroundColor: (isCriticalReported ||
                             isPendingCritical || !isScanned)? "#ccc" : "#d9534f", 
                            color: "white", 
                            border: "none", 
                            padding: "6px 10px", 
                            borderRadius: "4px", 
                            cursor:(isCriticalReported ||isPendingCritical ||isSaved ||!isScanned) ? "not-allowed" : "pointer", 
                            fontSize: "12px", 
                            fontWeight: "bold", 
                            width: "100%" 
                          }}
                        >
                          Critical
                        </button>
                      </td>
                      <td>
                        <button className="save-btn" disabled={isSaved || !isScanned} onClick={() => handleSave(p)}>💾 Save</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
      </div>

      <div style={{ display: activeTab === "hormones" ? "block" : "none" }}>
        <HormonesMain />
      </div>

      <div style={{ display: activeTab === "inventory" ? "block" : "none" }}>
        <DeptInventoryTab department="Biochemistry" machineType="Main" />
      </div>
          
       <div style={{ display: activeTab === "adjustment" ? "block" : "none" }}>
      <InventoryAdjustmentTab />
    </div>


    </div>
  );
}