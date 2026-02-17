
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

// 🚨 Define the unique key for this department
const CURRENT_DEPT = "Hormones";

export default function HormonesMain() {
  const [masterEntries, setMasterEntries] = useState([]);
  const [deptDocs, setDeptDocs] = useState({});
  const [loading, setLoading] = useState(true);

  // State to track which entries have been marked critical FOR THIS DEPT
  const [criticalReportedSet, setCriticalReportedSet] = useState(new Set());
  // State to temporarily hold the critical parameter until "Save" is pressed
  const [criticalParams, setCriticalParams] = useState({});

  // 🔹 LOCAL scan state
  const [localScans, setLocalScans] = useState({});
  const [localScanTimes, setLocalScanTimes] = useState({}); 
  const [savedSet, setSavedSet] = useState(new Set());

  // Filters
  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const hormoneTests =
    hormoneRouting.MainAnalyzer?.tests || hormoneRouting?.tests || [];

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
    const fields = [
      entry.timePrinted,
      entry.timeCollected,
      entry.scannedTime,
      entry.savedTime,
      entry.createdAt,
    ];
    for (const f of fields) {
      if (!f) continue;
      if (typeof f === "object" && typeof f.toDate === "function")
        return f.toDate();
      if (typeof f === "string") {
        const d = new Date(f);
        if (!isNaN(d)) return d;
      }
      if (typeof f === "object" && typeof f.seconds === "number")
        return new Date(f.seconds * 1000);
    }
    return null;
  };

  // Default date to today
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
  }, []);

  // ---------------- OPTIMIZED SNAPSHOTS ----------------
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
        docsMap[d.id] = data;
        if (data.status === "saved" || data.saved === "Yes") sSet.add(d.id);
      });
      setDeptDocs(docsMap);
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

    return () => {
      unsubMaster();
      unsubDept();
      unsubCritical();
    };
  }, []);

  // ---------------- DATA MERGING ----------------
  const patients = useMemo(() => {
    const filtered = masterEntries.filter(
      (entry) =>
        Array.isArray(entry.selectedTests) &&
        entry.selectedTests.some((t) => hormoneTests.includes(getTestName(t)))
    );

    return filtered.map((entry) => {
      const regNo = entry.regNo || entry.regno || entry.RegNo || entry.Regno || entry.id;
      const docId = String(regNo);
      const savedData = deptDocs[docId] || {};
      const localScan = localScans[docId];

      const isSaved = savedSet.has(docId);
      const currentScanned = localScan ?? savedData.scanned ?? "No";

      return {
        ...entry,
        ...savedData,
        regNo: docId,
        source: normalizeSource(entry.source || entry.category),
        scanned: currentScanned,
        status: isSaved ? "saved" : currentScanned === "Yes" ? "scanned" : "pending",
        urgent: entry.urgent || false,
        timePrinted: savedData.timePrinted || entry.timePrinted || null,
        timeCollected: savedData.timeCollected || entry.timeCollected || null,
      };
    });
  }, [masterEntries, deptDocs, localScans, savedSet, hormoneTests]);

  const handleScan = (id, value) => {
    const patient = patients.find((p) => p.id === id);
    if (!patient) return;
    const regKey = String(patient.regNo);
    setLocalScans((prev) => ({ ...prev, [regKey]: value }));
    setLocalScanTimes((prev) => ({
      ...prev,
      [regKey]: value === "Yes" ? new Date() : null,
    }));
  };

  const triggerCritical = async (entry) => {
    const parameter = window.prompt("Enter Critical Parameter & Value (e.g., TSH: 0.01):");
    if (!parameter) return;
    const regKey = String(entry.regNo);
    setCriticalParams(prev => ({ ...prev, [regKey]: parameter }));
    setCriticalReportedSet(prev => new Set(prev).add(regKey));
    alert("Parameter captured locally.");
  };

  const handleSave = async (id) => {
    const patient = patients.find((p) => p.id === id);
    if (!patient) return;
    const regKey = String(patient.regNo);

    // Optimistic UI update
    setSavedSet(prev => new Set(prev).add(regKey));

    try {
      const ref = doc(db, "hormones_main", regKey);
      const scanTime = localScanTimes[regKey] || null;
      const isCritical = criticalReportedSet.has(regKey) ? "Yes" : "No";

      const relevantTests = (patient.selectedTests || [])
        .map((t) => getTestName(t))
        .filter((testName) => hormoneTests.includes(testName));

      if (isCritical === "Yes" && criticalParams[regKey]) {
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
        regNo: regKey,
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
        timePrinted: patient.timePrinted || null,
        timeCollected: patient.timeCollected || null,
        status: "saved",
        critical: isCritical
      };

      await setDoc(ref, payload, { merge: true });
      
      setLocalScans((prev) => {
        const next = { ...prev };
        delete next[regKey];
        return next;
      });

      alert(`Saved Hormone entry for ${patient.name}`);
    } catch (error) {
      console.error("Error saving hormone entry:", error);
      setSavedSet(prev => {
        const next = new Set(prev);
        next.delete(regKey);
        return next;
      });
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
        if (dateFrom && eDate < new Date(dateFrom + "T00:00:00")) return false;
        if (dateTo && eDate > new Date(dateTo + "T23:59:59")) return false;
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
              <th>Patient Name</th><th>Age</th><th>Gender</th><th>Source</th><th>Category</th><th>Selected Tests</th><th>Scanned</th><th>Status</th><th>Critical</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredPatients.map((p) => {
              const isSaved = p.status === "saved";
              const isScanned = p.scanned === "Yes";
              const regKey = String(p.regNo);
              const isCriticalReported = criticalReportedSet.has(regKey);

              return (
                <tr key={p.id} className={isSaved ? "row-green" : isScanned ? "row-yellow" : "row-normal"}>
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
                    <select value={isScanned ? "Yes" : "No"} onChange={(e) => handleScan(p.id, e.target.value)} disabled={isSaved}>
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
                    <button className="save-btn" onClick={() => handleSave(p.id)} disabled={isSaved || !isScanned}>💾 Save</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}