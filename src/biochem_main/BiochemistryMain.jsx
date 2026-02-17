
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

// Define the unique key for this department
const CURRENT_DEPT = "Bio-Chemistry";

export default function BiochemistryMain() {
  const [masterEntries, setMasterEntries] = useState([]);
  const [biochemDocs, setBiochemDocs] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("biochem");
  const [savedSet, setSavedSet] = useState(new Set());
  
  const [criticalReportedSet, setCriticalReportedSet] = useState(new Set());
  const [criticalParams, setCriticalParams] = useState({});

  const [localScans, setLocalScans] = useState({});
  const [localScanTimes, setLocalScanTimes] = useState({}); 

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
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
  }, []);

  // --- OPTIMIZED SNAPSHOTS ---
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
        const key = data?.regNo ? String(data.regNo) : d.id;
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
          cSet.add(String(data.regNo));
        }
      });
      setCriticalReportedSet(cSet);
    });

    return () => { unsubMaster(); unsubBio(); unsubCritical(); };
  }, []);

  // --- SYNCHRONIZED DATA MERGING ---
  const patients = useMemo(() => {
    const filteredMaster = masterEntries.filter((entry) =>
      Array.isArray(entry.selectedTests) && entry.selectedTests.some((t) => biochemTests.includes(getTestName(t)))
    );

    return filteredMaster.map((entry) => {
      const regKey = entry.regNo ? String(entry.regNo) : entry.id;
      const saved = biochemDocs[regKey] || {};
      const localScan = localScans[regKey];
      
      const currentScanned = localScan ?? saved.scanned ?? "No";
      const isSaved = savedSet.has(regKey);

      return {
        ...entry,
        ...saved,
        regNo: regKey,
        source: normalizeSource(entry.source || entry.category),
        scanned: currentScanned,
        status: isSaved ? "saved" : currentScanned === "Yes" ? "scanned" : "pending",
        urgent: entry.urgent || false,
        id: entry.id // Keep original master ID for updates
      };
    });
  }, [masterEntries, biochemDocs, localScans, savedSet, biochemTests]);

  const handleInputChange = async (id, field, value) => {
    setMasterEntries((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
    try { await updateDoc(doc(db, "master_register", id), { [field]: value }); } catch (err) { console.error(err); }
  };

  const handleScanToggle = (patient, value) => {
    const regKey = String(patient.regNo);
    setLocalScans((prev) => ({ ...prev, [regKey]: value }));
    setLocalScanTimes((prev) => ({ ...prev, [regKey]: value === "Yes" ? new Date() : null }));
  };

  const triggerCritical = async (entry) => {
    const parameter = window.prompt("Enter Critical Parameter & Value (e.g., K+: 7.2):");
    if (!parameter) return;
    const regKey = String(entry.regNo);
    setCriticalParams(prev => ({ ...prev, [regKey]: parameter }));
    setCriticalReportedSet(prev => new Set(prev).add(regKey));
    alert("Parameter captured locally. Click 'Save' to send to Critical Dashboard.");
  };

  const handleSave = async (patient) => {
    try {
      const regKey = String(patient.regNo);
      const docRef = doc(db, "biochemistry_register", regKey);
      const relevantTests = patient.selectedTests?.filter((t) => biochemTests.includes(getTestName(t))).map((t) => getTestName(t));
      const scanTime = localScanTimes[regKey] || null;
      
      const pendingParam = criticalParams[regKey];
      const isCritical = (criticalReportedSet.has(regKey) || pendingParam) ? "Yes" : "No";

      if (pendingParam) {
        const criticalId = `${regKey}_${CURRENT_DEPT}`;
        await setDoc(doc(db, "critical_alerts", criticalId), {
            name: patient.name || "",
            regNo: patient.regNo || "",
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
        regNo: regKey,
        diagnosticNo: patient.diagnosticNo || "—",
        name: patient.name || "",
        age: patient.age || "",
        ageUnit: patient.ageUnit || "",
        gender: patient.gender || "-",
        source: patient.source || "-",
        category: patient.category || "-",
        selectedTests: relevantTests || [],
        scanned: "Yes",
        scannedTime: scanTime ? Timestamp.fromDate(scanTime) : (patient.scannedTime || null),
        saved: "Yes",
        savedTime: serverTimestamp(),
        timePrinted: patient.timePrinted || null,
        timeCollected: patient.timeCollected || null,
        status: "saved",
        critical: isCritical 
      };

      await setDoc(docRef, payload, { merge: true });
      
      // Cleanup local state
      setLocalScans(prev => { const n = {...prev}; delete n[regKey]; return n; });
      setCriticalParams(prev => { const n = {...prev}; delete n[regKey]; return n; });

      alert(`Saved entry for ${payload.name} ${isCritical === "Yes" ? "(Critical Alert Sent)" : ""}`);
    } catch (err) { 
        console.error(err); 
        alert("Save failed.");
    }
  };

  if (loading) return <p>Loading Biochemistry data...</p>;

  return (
    <div className="biochem-register-container">
      <div className="tab-container">
        <button className={`tab-btn ${activeTab === "biochem" ? "active" : ""}`} onClick={() => setActiveTab("biochem")}>Biochemistry</button>
        <button className={`tab-btn ${activeTab === "hormones" ? "active" : ""}`} onClick={() => setActiveTab("hormones")}>Hormones</button>
      </div>

      {activeTab === "biochem" ? (
        <>
          <h2 className="dept-header">Biochemistry Department — Main Analyzer</h2>
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
                    if (eDate && dateFrom && eDate < new Date(dateFrom + "T00:00:00")) return false;
                    if (eDate && dateTo && eDate > new Date(dateTo + "T23:59:59")) return false;
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
                  const regKey = String(p.regNo);
                  const isSaved = p.status === "saved";
                  const isScanned = p.scanned === "Yes";
                  const isCriticalReported = criticalReportedSet.has(regKey);
                  
                  const rowClass = `${isSaved ? "row-green" : isScanned ? "row-yellow" : "row-normal"}`.trim();

                  return (
                    <tr key={p.id} className={rowClass}>
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

                      <td style={{ textAlign: 'center' }}>
                        {isCriticalReported && (
                          <span style={{ color: 'red', fontWeight: 'bold', fontSize: '10px' }}>
                            CRITICAL {isSaved ? "REPORTED" : "PENDING SAVE"}
                          </span>
                        )}
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
                        <button className="save-btn" disabled={isSaved || !isScanned} onClick={() => handleSave(p)}>💾 Save</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : <HormonesMain />}
    </div>
  );
}