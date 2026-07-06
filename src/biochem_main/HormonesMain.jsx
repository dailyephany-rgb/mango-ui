
import React, { useState, useEffect, useMemo } from "react";
import "./BiochemistryMain.css";
import { db } from "../firebaseConfig.js";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import hormoneRouting from "../hormone_testRouting.json";
// NEW: Import inventory components and service
import DeptInventoryTab from "../inventory/DeptInventoryTab.jsx";
import {
  handleInventoryDeduction,
  getVitrosDeductibleTests
} from "../inventory/inventorymapping";



// Define the unique key for this department
const CURRENT_DEPT = "Hormones";

export default function HormonesMain() {
  const [masterEntries, setMasterEntries] = useState([]);
  const [deptDocs, setDeptDocs] = useState({});
  const [loading, setLoading] = useState(true);
  
  // NEW: State to toggle between Register and Inventory view
  const [activeSubTab, setActiveSubTab] = useState("register");

  const [criticalReportedSet, setCriticalReportedSet] = useState(new Set());
  const [criticalParams, setCriticalParams] = useState({});

  // UPDATE: Persistent LocalStorage for Scans and Scan Times
  const [localScans, setLocalScans] = useState(() => {
    const saved = localStorage.getItem("hormones_localScans");
    return saved ? JSON.parse(saved) : {};
  });

  const [localScanTimes, setLocalScanTimes] = useState(() => {
    const saved = localStorage.getItem("hormones_localScanTimes");
    return saved ? JSON.parse(saved) : {};
  }); 

  const [savedSet, setSavedSet] = useState(new Set());

  // Filters
  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const hormoneTests = hormoneRouting.MainAnalyzer?.tests || hormoneRouting?.tests || [];
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
    // FIX: Set local date to roll over at midnight local time
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
      setMasterEntries(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    const unsubDept = onSnapshot(collection(db, "hormones_main"), (snapshot) => {
      const docsMap = {};
      const sSet = new Set();
      snapshot.docs.forEach(d => {
        const data = d.data();
        // FIX: Use composite key as index
        const key = `${data.regNo}_${data.diagnosticNo}`;
        docsMap[key] = data;
        if (data.status === "saved" || data.saved === "Yes") sSet.add(key);
      });
      setDeptDocs(docsMap);
      setSavedSet(sSet);
    });

    const unsubCritical = onSnapshot(collection(db, "critical_alerts"), (snap) => {
      const cSet = new Set();
      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.regNo && data.dept === CURRENT_DEPT) {
          // FIX: Critical alerts also mapped via composite key
          const cKey = `${data.regNo}_${data.diagnosticNo}`;
          cSet.add(cKey);
        }
      });
      setCriticalReportedSet(cSet);
    });

    return () => { unsubMaster(); unsubDept(); unsubCritical(); };
  }, []);

  const patients = useMemo(() => {
    const filtered = masterEntries.filter(
      (entry) =>
        Array.isArray(entry.selectedTests) &&
        entry.selectedTests.some((t) => hormoneTests.includes(getTestName(t)))
    );

    return filtered.map((entry) => {
      // FIX: Ensure patient identifier matches the composite ID logic
      const compositeKey = `${entry.regNo}_${entry.diagnosticNo}`;
      const savedData = deptDocs[compositeKey] || {};
      const localScan = localScans[compositeKey];

      const isSaved = savedSet.has(compositeKey);
      const currentScanned = localScan ?? savedData.scanned ?? "No";

      return {
        ...entry,
        ...savedData,
        compositeKey: compositeKey,
        source: normalizeSource(entry.source || entry.category),
        scanned: currentScanned,
        status: isSaved ? "saved" : currentScanned === "Yes" ? "scanned" : "pending",
        urgent: entry.urgent || false,
        timePrinted: savedData.timePrinted || entry.timePrinted || null,
        timeCollected: savedData.timeCollected || entry.timeCollected || null,
      };
    });
  }, [masterEntries, deptDocs, localScans, savedSet, hormoneTests]);

  // UPDATE: Writes both Scan status and ISO Time string to LocalStorage using composite key
  const handleScan = (compositeKey, value) => {
    const now = new Date().toISOString();

    setLocalScans((prev) => {
      const updated = { ...prev, [compositeKey]: value };
      localStorage.setItem("hormones_localScans", JSON.stringify(updated));
      return updated;
    });

    setLocalScanTimes((prev) => {
      const updatedTimes = { ...prev, [compositeKey]: value === "Yes" ? now : null };
      localStorage.setItem("hormones_localScanTimes", JSON.stringify(updatedTimes));
      return updatedTimes;
    });
  };

  const triggerCritical = async (entry) => {
    const parameter = window.prompt("Enter Critical Parameter & Value (e.g., TSH: 0.01):");
    if (!parameter) return;
    const regKey = entry.compositeKey;
    setCriticalParams(prev => ({ ...prev, [regKey]: parameter }));
    setCriticalReportedSet(prev => new Set(prev).add(regKey));
    alert("Parameter captured locally.");
  };

  const handleSave = async (patient) => {
    const regKey = patient.compositeKey;

    try {
      const ref = doc(db, "hormones_main", regKey);
      
      // FINAL FIX: Retrieve time from persistent local state
      const rawLocalTime = localScanTimes[regKey];
      const scanTime = rawLocalTime ? new Date(rawLocalTime) : null;
      
      const isCritical = (criticalReportedSet.has(regKey) || criticalParams[regKey]) ? "Yes" : "No";

      const relevantTests = (patient.selectedTests || [])
        .map((t) => getTestName(t))
        .filter((testName) => hormoneTests.includes(testName));

      if (criticalParams[regKey]) {
        const criticalId = `${regKey}_${CURRENT_DEPT}`;
        await setDoc(doc(db, "critical_alerts", criticalId), {
            name: patient.name || "",
            regNo: patient.regNo || "",
            diagnosticNo: patient.diagnosticNo || "—",
            age: patient.age || "",
            ageUnit: patient.ageUnit || "",
            gender: patient.gender || "-",
            doctor: patient.doctor || "Self",
            source: patient.source || "-",
            reportedBy: sessionStorage.getItem("loggedUser") || "Unknown",
            category: patient.category || "-",
            timePrinted: patient.timePrinted || null,
            timeCollected: patient.timeCollected || null,
            criticalParameter: criticalParams[regKey],
            flaggedAt: serverTimestamp(),
            status: "Pending",
            dept: CURRENT_DEPT,
            selectedTests: relevantTests,
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
        selectedTests: relevantTests,
        scanned: "Yes",
        scannedTime: scanTime ? Timestamp.fromDate(scanTime) : (patient.scannedTime || null),
        saved: "Yes",
        savedTime: serverTimestamp(),
        savedBy: sessionStorage.getItem("loggedUser") || "Unknown",
        timePrinted: patient.timePrinted || null,
        timeCollected: patient.timeCollected || null,
        status: "saved",
        critical: isCritical
      };

      await setDoc(ref, payload, { merge: true });

      // NEW: TRIGGER INVENTORY DEDUCTION


      if (relevantTests && relevantTests.length > 0) {

        const deductibleTests =
          await getVitrosDeductibleTests(
            relevantTests
          );
      
        console.log(
          "[Hormones] Original Tests:",
          relevantTests
        );
      
        console.log(
          "[Hormones] Vitros Deductible Tests:",
          deductibleTests
        );
      
        await handleInventoryDeduction(
          deductibleTests,
          "Hormones",
          "Main"
        );
      }
      // UPDATE: Cleanup both local storage items on successful save
      setLocalScans((prev) => {
        const next = { ...prev };
        delete next[regKey];
        localStorage.setItem("hormones_localScans", JSON.stringify(next));
        return next;
      });

      setLocalScanTimes((prev) => {
        const next = { ...prev };
        delete next[regKey];
        localStorage.setItem("hormones_localScanTimes", JSON.stringify(next));
        return next;
      });

      setCriticalParams(prev => { const n = {...prev}; delete n[regKey]; return n; });

      alert(`Saved Hormone entry for ${patient.name}`);
    } catch (error) {
      console.error("Error saving hormone entry:", error);
      alert("Error saving data.");
    }
  };

  const filteredPatients = patients
    .filter((p) => {
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
    });

  if (loading) return <div>Loading...</div>;

  return (
    <div className="biochem-register-container">
      {/* Tab Switcher for Register vs Inventory */}
     
      
              
      <div className="tab-container" style={{ marginBottom: "10px" }}>
  <button
    className={`tab-btn ${activeSubTab === "register" ? "active" : ""}`}
    onClick={() => setActiveSubTab("register")}
  >
    Register
  </button>

  <button
    className={`tab-btn ${activeSubTab === "inventory" ? "active" : ""}`}
    onClick={() => setActiveSubTab("inventory")}
  >
    Inventory
  </button>
</div>


      {activeSubTab === "register" ? (
        <>
          <h2 className="dept-header">Hormones Department — Main Analyzer</h2>

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
                <button key={src} className={`source-btn ${sourceFilter === src ? "active" : ""}`} onClick={() => setSourceFilter(src)}>{src}</button>
              ))}
            </div>
          </div>

          <div className="table-wrapper">
            <table className="dept-table">
              <thead>
                <tr>
                  <th>Reg No</th>
                  <th>Diag No</th>
                  <th>Patient Name</th><th>Age</th><th>Gender</th><th>Source</th><th>Category</th><th>Selected Tests</th><th>Scanned</th><th>Status</th>
                  <th style={{ minWidth: "130px" }}>
                    Saved By</th>
                  <th>Critical</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((p) => {
                  const isSaved = p.status === "saved";
                  const isScanned = p.scanned === "Yes";
                  const regKey = p.compositeKey;
                  const isCriticalReported = criticalReportedSet.has(regKey);

                  return (
                    <tr key={p.compositeKey} className={isSaved ? "row-green" : isScanned ? "row-yellow" : "row-normal"}>
                      <td style={p.urgent ? { borderLeft: "4px solid red" } : {}}>
                        {p.regNo || "—"}
                      </td>
                      <td>{p.diagnosticNo || "—"}</td>
                      <td>{p.name || "—"}</td>
                      <td>{p.age || "—"}</td>
                      <td>{p.gender || "-"}</td>
                      <td>{p.source || "—"}</td>
                      <td>{p.category || "—"}</td>
                      <td>{p.selectedTests?.filter((t) => hormoneTests.includes(getTestName(t))).map((t) => getTestName(t)).join(", ") || "—"}</td>
                      <td>
                        <select value={isScanned ? "Yes" : "No"} onChange={(e) => handleScan(p.compositeKey, e.target.value)} disabled={isSaved}>
                          <option value="No">No</option>
                          <option value="Yes">Yes</option>
                        </select>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {isCriticalReported && (
                          <span style={{ color: 'red', fontWeight: 'bold', fontSize: '10px' }}>
                            CRITICAL {isSaved ? "REPORTED" : "PENDING SAVE"}
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          minWidth: "130px",
                          fontWeight: "600",
                          color: "#1e3a8a"
                        }}
                      >
                        {p.savedBy || "—"}
                      </td>
                      <td>
                        <button
                          onClick={() => triggerCritical(p)}
                          disabled={isCriticalReported || isSaved || !isScanned}
                          style={{ 
                            backgroundColor: (isCriticalReported || !isScanned) ? "#ccc" : "#d9534f", 
                            color: "white", 
                            border: "none", 
                            padding: "6px 10px", 
                            borderRadius: "4px", 
                            cursor: (isCriticalReported || isSaved || !isScanned) ? "not-allowed" : "pointer", 
                            fontSize: "12px", 
                            fontWeight: "bold", 
                            width: "100%" 
                          }}
                        >
                          Critical
                        </button>
                      </td>
                      <td>
                        <button className="save-btn" onClick={() => handleSave(p)} disabled={isSaved || !isScanned}>💾 Save</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <DeptInventoryTab department="Hormones" machineType="Main" />
      )}
    </div>
  );
}