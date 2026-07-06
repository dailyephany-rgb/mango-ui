
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

  // 🛡️ INTERNAL BUFFER: Prevents UI reset during slow syncs
  const [localResults, setLocalResults] = useState(() => {
    const saved = localStorage.getItem("esr_localResults");
    return saved ? JSON.parse(saved) : {};
  });

  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  // UPDATE: Load localScans from LocalStorage to survive refresh
  const [localScans, setLocalScans] = useState(() => {
    const saved = localStorage.getItem("esr_localScans");
    return saved ? JSON.parse(saved) : {};
  });
  
  // FINAL FIX: Persist localScanTimes to survive refresh
  const [localScanTimes, setLocalScanTimes] = useState(() => {
    const saved = localStorage.getItem("esr_localScanTimes");
    return saved ? JSON.parse(saved) : {};
  });

  const [criticalReportedSet, setCriticalReportedSet] = useState(new Set());
  const [pendingCritical, setPendingCritical] = useState(() => {
    const saved = localStorage.getItem("esr_pendingCritical");
    return saved ? JSON.parse(saved) : {};
  });

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
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const today = `${y}-${m}-${d}`;
    
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
          // UPDATE: Critical alerts tracked by composite key
          const cKey = `${data.regNo}_${data.diagnosticNo}`;
          cSet.add(cKey);
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
      const reg = String(entry.regNo || entry.id);
      const diag = entry.diagnosticNo || entry.accNo || "-";
      const compositeKey = `${reg}_${diag}`;

      const saved = esrDocs[compositeKey] || {};
      const localScanValue = localScans[compositeKey];
      const localScanTime =
        localScanTimes[compositeKey];
      const typing = localResults[compositeKey] || {};
      
      const combined = { ...entry, ...saved, ...typing };
      
      return {
        ...combined,
        regNo: reg,
        compositeKey: compositeKey,
        source: normalizeSource(entry.source || entry.category),
        diagnosticNo: diag,
        scanned: localScanValue ?? saved.scanned ?? "No",
        scannedTime: localScanTime ??saved.scannedTime ??null,
        status: (saved.saved === "Yes" || saved.status === "saved") ? "saved" : localScanValue === "Yes" ? "scanned" : saved.status || "pending",
        urgent: entry.urgent || false, 
        pendingCritText: pendingCritical[compositeKey]
      };
    });
        }, [
          masterEntries,
          esrDocs,
          localScans,
          localScanTimes,
          pendingCritical,
          localResults
        ]);

  const calculateDuration = (start, end) => {
    if (!start || !end) return "";
    const [sH, sM] = start.split(":"); const [eH, eM] = end.split(":");
    const diff = (+eH * 60 + +eM) - (+sH * 60 + +sM);
    return diff > 0 ? diff : "";
  };

  const handleChange = (compositeKey, field, value) => {
    setLocalResults((prev) => {
      const current = prev[compositeKey] || {};
      const updated = {
        ...current,
        [field]: value,
      };
  
      if (field === "startTime" || field === "endTime") {
        const sTime =
          field === "startTime"
            ? value
            : (updated.startTime || "");
  
        const eTime =
          field === "endTime"
            ? value
            : (updated.endTime || "");
  
        updated.duration =
          calculateDuration(sTime, eTime);
      }
  
      const next = {
        ...prev,
        [compositeKey]: updated,
      };
  
      localStorage.setItem(
        "esr_localResults",
        JSON.stringify(next)
      );
  
      return next;
    });
  };

  // UPDATE: Writes both Scan status and Time to LocalStorage using compositeKey
  const handleScan = (compositeKey, value) => {
    const now = new Date().toISOString();

    setLocalScans((prev) => {
        const updated = { ...prev, [compositeKey]: value };
        localStorage.setItem("esr_localScans", JSON.stringify(updated));
        return updated;
    });

    setLocalScanTimes((prev) => {
        const updatedTimes = { ...prev, [compositeKey]: value === "Yes" ? now : null };
        localStorage.setItem("esr_localScanTimes", JSON.stringify(updatedTimes));
        return updatedTimes;
    });
  };

  const isEntryReadyToSave = (e) => (e.scanned === "Yes") && e.startTime && e.endTime && e.result && Number(e.duration) > 0;

  const triggerCritical = (entry) => {
    const defaultText = `ESR: ${entry.result} mm/hr (Duration: ${entry.duration} mins)`;
    const parameter = window.prompt("Confirm Critical ESR Value:", defaultText);
    if (!parameter) return;

    setPendingCritical((prev) => {
      const updated = {
        ...prev,
        [entry.compositeKey]: parameter,
      };
    
      localStorage.setItem(
        "esr_pendingCritical",
        JSON.stringify(updated)
      );
    
      return updated;
    });

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
      const compositeKey = entry.compositeKey;
      if (!isEntryReadyToSave(entry)) return;

      const critParam = pendingCritical[compositeKey];
      const isCritical = (critParam || criticalReportedSet.has(compositeKey)) ? "Yes" : "No";
      const cleanTests = getCleanTests(entry);

      if (critParam) {
        await setDoc(doc(db, "critical_alerts", `${compositeKey}_${CURRENT_DEPT}`), {
          name: entry.name || "",
          regNo: entry.regNo,
          diagnosticNo: entry.diagnosticNo || "—",
          age: entry.age || "", ageUnit: entry.ageUnit || "", gender: entry.gender || "-",
          category: entry.category || "-", source: entry.source || "-", doctor: entry.doctor || "Self",
          reportedBy: sessionStorage.getItem("loggedUser") || "Unknown",
          criticalParameter: critParam, flaggedAt: serverTimestamp(),
          timePrinted: ensureFirestoreTimestamp(entry.timePrinted),
          timeCollected: ensureFirestoreTimestamp(entry.timeCollected),
          status: "Pending", dept: CURRENT_DEPT, selectedTests: cleanTests 
        });
      }

      const { pendingCritText, compositeKey: unused, id, phone, tests, father, doctor, ...restOfEntry } = entry;

      const rawLocalTime = localScanTimes[compositeKey];
      const scanTime = rawLocalTime ? new Date(rawLocalTime) : null;

      const payload = {
        ...restOfEntry,
        compositeKey: compositeKey,
        selectedTests: cleanTests, 
        scanned: "Yes",
        scannedTime: scanTime ? Timestamp.fromDate(scanTime) : (entry.scannedTime || null),
        saved: "Yes",
        savedTime: serverTimestamp(),
        savedBy:  sessionStorage.getItem("loggedUser") || "Unknown",
        timePrinted: ensureFirestoreTimestamp(entry.timePrinted),
        timeCollected: ensureFirestoreTimestamp(entry.timeCollected),
        status: "saved",
        critical: isCritical
      };

      await setDoc(doc(db, "esr_register", compositeKey), payload, { merge: true });
      
      setLocalResults((prev) => {
        const n = { ...prev };
        delete n[compositeKey];
      
        localStorage.setItem(
          "esr_localResults",
          JSON.stringify(n)
        );
      
        return n;
      });
      
      setLocalScans(prev => { 
        const n = { ...prev }; 
        delete n[compositeKey]; 
        localStorage.setItem("esr_localScans", JSON.stringify(n));
        return n; 
      });

      setLocalScanTimes(prev => {
        const n = { ...prev };
        delete n[compositeKey];
        localStorage.setItem("esr_localScanTimes", JSON.stringify(n));
        return n;
      });

      setPendingCritical((prev) => {
        const next = { ...prev };
        delete next[compositeKey];
      
        localStorage.setItem(
          "esr_pendingCritical",
          JSON.stringify(next)
        );
      
        return next;
      });
      
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
              <th>Start Time</th><th>End Time</th><th>Duration</th><th>Result</th>
              <th>Scanned</th>
              <th>Status</th>
              <th>Saved By</th>
              <th>Critical</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => {
              const saved = e.status === "saved";
              const scanned = e.scanned === "Yes";
              const isCriticalReported = criticalReportedSet.has(e.compositeKey) || !!e.pendingCritText;
              const ready = isEntryReadyToSave(e);

              return (
                <tr key={e.compositeKey} className={saved ? "row-green" : scanned ? "row-yellow" : ""}>
                  <td className="sticky-col" style={e.urgent ? { borderLeft: "4px solid red" } : {}}>{e.regNo}</td>
                  <td className="sticky-col" style={{ color: "#475569" }}>{e.diagnosticNo}</td>
                  <td className="sticky-col">{e.name}</td>
                  <td>{e.age} {e.ageUnit}</td><td>{e.source}</td>
                  <td style={{fontSize:'11px'}}>{getCleanTests(e).join(", ")}</td>
                  <td><input type="time" value={e.startTime || ""} disabled={!scanned || saved} onChange={(ev) => handleChange(e.compositeKey, "startTime", ev.target.value)} /></td>
                  <td><input type="time" value={e.endTime || ""} disabled={!scanned || saved} onChange={(ev) => handleChange(e.compositeKey, "endTime", ev.target.value)} /></td>
                  <td>{e.duration || "-"}</td>
                  <td><input type="number" value={e.result || ""} disabled={!scanned || saved} onChange={(ev) => handleChange(e.compositeKey, "result", ev.target.value)} /></td>
                  <td>
                    <select value={scanned ? "Yes" : "No"} disabled={saved} onChange={(ev) => handleScan(e.compositeKey, ev.target.value)}>
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
                  <td
                  style={{
                    minWidth: "130px",
                    fontWeight: "600",
                    color: "#1e3a8a"
                  }}
                >
                  {e.savedBy || "—"}
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