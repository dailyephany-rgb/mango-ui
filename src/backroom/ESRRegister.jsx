
import React, { useState, useEffect, useMemo } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  setDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import routing from "../backroom_routing.json";
import "./Backroom.css";

// 🚨 Define the unique key for this department
const CURRENT_DEPT = "ESR";

const overflowStyles = `
  .table-scroll-container {
    width: 100%;
    overflow-x: auto; 
    overflow-y: auto;
    max-height: 80vh;
    display: block;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: white;
    position: relative;
  }
  .backroom-table {
    width: 100%;
    min-width: 1500px; 
    border-collapse: separate; 
    border-spacing: 0;
  }
  .critical-btn {
    background-color: #ef4444 !important;
    color: white !important;
    border: none;
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    font-size: 12px;
    width: 100%;
  }
  .critical-btn:disabled {
    background-color: #fca5a5 !important;
    cursor: not-allowed;
  }
`;

export default function ESRRegister() {
  const [masterEntries, setMasterEntries] = useState([]);
  const [esrDocs, setEsrDocs] = useState({});
  const [saving, setSaving] = useState(false);
  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [localScans, setLocalScans] = useState({});
  const [localScanTimes, setLocalScanTimes] = useState({});
  const [criticalReportedSet, setCriticalReportedSet] = useState(new Set());
  const [pendingCritical, setPendingCritical] = useState({});

  const testsForRegister = routing.ESRRegister || ["ESR (ERYTHROCYTE SEDIMENTATION RATE, BLOOD)"];

  const normalizeSource = (raw) => {
    if (!raw) return "Unknown";
    const s = raw.trim().toLowerCase();
    if (s.includes("opd")) return "OPD";
    if (s.includes("ipd")) return "IPD";
    if (s.includes("third") || s.includes("3rd")) return "Third Floor";
    return "Unknown";
  };

  const ensureFirestoreTimestamp = (val) => {
    if (!val) return null;
    if (val instanceof Timestamp) return val;
    if (val instanceof Date) return Timestamp.fromDate(val);
    if (typeof val === "object" && val.seconds) return new Timestamp(val.seconds, val.nanoseconds);
    const d = new Date(val);
    return isNaN(d) ? null : Timestamp.fromDate(d);
  };

  const parseDate = (entry) => {
    const fields = [entry.timePrinted, entry.timeCollected, entry.scannedTime, entry.savedTime, entry.createdAt];
    for (const f of fields) {
      if (!f) continue;
      if (typeof f === "object" && typeof f.toDate === "function") return f.toDate();
      if (typeof f === "string" || f instanceof Date) { const d = new Date(f); if (!isNaN(d)) return d; }
      if (typeof f === "object" && typeof f.seconds === "number") return new Date(f.seconds * 1000);
    }
    return null;
  };

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
  }, []);

  // Optimized Triple Snapshot
  useEffect(() => {
    const unsubMaster = onSnapshot(collection(db, "master_register"), (snap) => {
      setMasterEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubEsr = onSnapshot(collection(db, "esr_register"), (snap) => {
      const data = {};
      snap.docs.forEach(d => { data[d.id] = d.data(); });
      setEsrDocs(data);
    });

    const unsubCritical = onSnapshot(collection(db, "critical_alerts"), (snap) => {
      const cSet = new Set();
      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.regNo && String(data.dept).toLowerCase() === CURRENT_DEPT.toLowerCase()) {
          cSet.add(String(data.regNo));
        }
      });
      setCriticalReportedSet(cSet);
    });

    return () => { unsubMaster(); unsubEsr(); unsubCritical(); };
  }, []);

  const mergedEntries = useMemo(() => {
    const filtered = masterEntries.filter((entry) => {
      const selected = entry.selectedTests;
      if (!Array.isArray(selected)) return false;
      return selected.some((t) => {
        const name = typeof t === "string" ? t : t?.test || "";
        return testsForRegister.some((ref) => name.toLowerCase().includes(ref.toLowerCase()));
      });
    });

    return filtered.map((entry) => {
      const regKey = String(entry.regNo || entry.id);
      const saved = esrDocs[regKey] || {};
      const localScanValue = localScans[regKey];
      
      return {
        ...entry, ...saved,
        regNo: regKey,
        source: normalizeSource(entry.source || entry.category),
        diagnosticNo: entry.diagnosticNo || entry.accNo || "-",
        scanned: localScanValue ?? saved.scanned ?? "No",
        status: (saved.saved === "Yes" || saved.status === "saved") ? "saved" : localScanValue === "Yes" ? "scanned" : saved.status || "pending",
        urgent: entry.urgent || false, 
        pendingCritText: pendingCritical[regKey]
      };
    });
  }, [masterEntries, esrDocs, localScans, pendingCritical]);

  const calculateDuration = (start, end) => {
    if (!start || !end) return "";
    const [sH, sM] = start.split(":"); const [eH, eM] = end.split(":");
    const diff = (+eH * 60 + +eM) - (+sH * 60 + +sM);
    return diff > 0 ? diff : "";
  };

  const handleChange = (regNo, field, value) => {
    setEsrDocs(prev => {
      const current = prev[regNo] || {};
      const updatedEntry = { ...current, [field]: value };
      if (field === "startTime" || field === "endTime") {
        updatedEntry.duration = calculateDuration(updatedEntry.startTime || "", updatedEntry.endTime || "");
      }
      return { ...prev, [regNo]: updatedEntry };
    });
  };

  const handleScan = (regNo, value) => {
    const key = String(regNo);
    setLocalScans((prev) => ({ ...prev, [key]: value }));
    setLocalScanTimes((prev) => ({ ...prev, [key]: value === "Yes" ? new Date() : null }));
  };

  const isEntryReadyToSave = (e) => (e.scanned === "Yes") && e.startTime && e.endTime && e.result && Number(e.duration) > 0;

  const triggerCritical = (entry) => {
    const defaultText = `ESR: ${entry.result} mm/hr (Duration: ${entry.duration} mins)`;
    const parameter = window.prompt("Confirm Critical ESR Value:", defaultText);
    if (!parameter) return;
    setPendingCritical(prev => ({ ...prev, [String(entry.regNo)]: parameter }));
    alert("Critical value prepared. Click 'Save' to finalize.");
  };

  const getCleanTests = (entry) => {
    return (entry.selectedTests || [])
      .map(t => typeof t === "object" ? t.test : t)
      .filter(name => testsForRegister.some(ref => name.toLowerCase().includes(ref.toLowerCase())));
  };

  const handleSave = async (entry) => {
    try {
      setSaving(true);
      const key = String(entry.regNo);
      if (!isEntryReadyToSave(entry)) return;

      const critParam = pendingCritical[key];
      const isCritical = (critParam || criticalReportedSet.has(key)) ? "Yes" : "No";
      const cleanTests = getCleanTests(entry);

      if (critParam) {
        await setDoc(doc(db, "critical_alerts", `${key}_${CURRENT_DEPT}`), {
          name: entry.name || "",
          regNo: key,
          diagnosticNo: entry.diagnosticNo || "—",
          age: entry.age || "", ageUnit: entry.ageUnit || "", gender: entry.gender || "-",
          category: entry.category || "-", source: entry.source || "-", doctor: entry.doctor || "Self",
          criticalParameter: critParam, flaggedAt: serverTimestamp(),
          timePrinted: ensureFirestoreTimestamp(entry.timePrinted),
          timeCollected: ensureFirestoreTimestamp(entry.timeCollected),
          status: "Pending", dept: CURRENT_DEPT, selectedTests: cleanTests 
        });
      }

      const { pendingCritText, id, phone, tests, father, doctor, ...restOfEntry } = entry;

      const payload = {
        ...restOfEntry,
        selectedTests: cleanTests, 
        scanned: "Yes",
        scannedTime: localScanTimes[key] ? Timestamp.fromDate(localScanTimes[key]) : (entry.scannedTime || null),
        saved: "Yes",
        savedTime: serverTimestamp(),
        timePrinted: ensureFirestoreTimestamp(entry.timePrinted),
        timeCollected: ensureFirestoreTimestamp(entry.timeCollected),
        status: "saved",
        critical: isCritical
      };

      await setDoc(doc(db, "esr_register", key), payload, { merge: true });
      setPendingCritical(prev => { const next = { ...prev }; delete next[key]; return next; });
      alert(`Saved ESR for ${entry.name}`);
    } catch (err) { alert("Error saving."); } finally { setSaving(false); }
  };

  const filteredEntries = mergedEntries
    .filter((p) => {
      if (regSearch.trim()) {
        const searchStr = regSearch.trim().toLowerCase();
        if (!String(p.regNo).toLowerCase().includes(searchStr) && !String(p.diagnosticNo).toLowerCase().includes(searchStr)) return false;
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
      return (dateA || 0) - (dateB || 0);
    });

  return (
    <div className="register-section">
      <style>{overflowStyles}</style>
      <h3>🩸 ESR Register</h3>
      <div className="filter-bar">
        <input className="reg-search" placeholder="Search Reg or Diag No..." value={regSearch} onChange={(e) => setRegSearch(e.target.value)} />
        <div className="date-filters">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span>to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="source-buttons">
          {["OPD", "IPD", "Third Floor", "All"].map((src) => (
            <button key={src} className={sourceFilter === src ? "source-btn active" : "source-btn"} onClick={() => setSourceFilter(src)}>{src}</button>
          ))}
        </div>
      </div>

      <div className="table-scroll-container">
        <table className="backroom-table">
          <thead>
            <tr>
              <th className="sticky-col">Reg No</th>
              <th className="sticky-col">Diag No</th>
              <th className="sticky-col">Patient Name</th>
              <th>Age</th><th>Source</th><th>Selected Tests</th>
              <th>Start Time</th><th>End Time</th><th>Duration</th><th>Result</th><th>Scanned</th><th>Status</th><th>Critical</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => {
              const saved = e.status === "saved";
              const scanned = e.scanned === "Yes";
              const isCriticalReported = criticalReportedSet.has(e.regNo) || !!e.pendingCritText;
              const ready = isEntryReadyToSave(e);

              return (
                <tr key={e.regNo} className={saved ? "row-green" : scanned ? "row-yellow" : ""}>
                  <td className="sticky-col" style={e.urgent ? { borderLeft: "4px solid red" } : {}}>{e.regNo}</td>
                  <td className="sticky-col" style={{ color: "#475569" }}>{e.diagnosticNo}</td>
                  <td className="sticky-col">{e.name}</td>
                  <td>{e.age} {e.ageUnit}</td><td>{e.source}</td>
                  <td style={{fontSize:'11px'}}>{getCleanTests(e).join(", ")}</td>
                  <td><input type="time" value={e.startTime || ""} disabled={!scanned || saved} onChange={(ev) => handleChange(e.regNo, "startTime", ev.target.value)} /></td>
                  <td><input type="time" value={e.endTime || ""} disabled={!scanned || saved} onChange={(ev) => handleChange(e.regNo, "endTime", ev.target.value)} /></td>
                  <td>{e.duration || "-"}</td>
                  <td><input type="number" value={e.result || ""} disabled={!scanned || saved} onChange={(ev) => handleChange(e.regNo, "result", ev.target.value)} /></td>
                  <td>
                    <select value={scanned ? "Yes" : "No"} disabled={saved} onChange={(ev) => handleScan(e.regNo, ev.target.value)}>
                      <option value="No">No</option><option value="Yes">Yes</option>
                    </select>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                      {isCriticalReported && (
                          <span style={{ color: 'red', fontWeight: 'bold', fontSize: '9px' }}>
                              {e.pendingCritText ? "PREPARED" : "REPORTED"}
                          </span>
                      )}
                  </td>
                  <td>
                    <button onClick={() => triggerCritical(e)} disabled={isCriticalReported || saved || !ready} className="critical-btn">Critical</button>
                  </td>
                  <td><button className="save-btn" disabled={saving || saved || !ready} onClick={() => handleSave(e)}>Save</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}