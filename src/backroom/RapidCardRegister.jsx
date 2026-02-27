
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
const CURRENT_DEPT = "Rapid Card";

const overflowStyles = `
  .table-scroll-container {
    width: 100%;
    overflow-x: auto; 
    overflow-y: hidden;
    display: block;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: white;
  }
  .backroom-table {
    width: 100%;
    min-width: 1600px; 
    border-collapse: separate; 
    border-spacing: 0;
  }
  .sticky-col {
    position: sticky;
    z-index: 5;
    background-color: white;
    border-right: 1px solid #e5e7eb !important;
  }
  .backroom-table thead th.sticky-col {
    z-index: 10;
    background-color: #eff6ff !important;
  }
  .backroom-table th:nth-child(1), .backroom-table td:nth-child(1) { left: 0; min-width: 100px; }
  .backroom-table th:nth-child(2), .backroom-table td:nth-child(2) { left: 100px; min-width: 110px; }
  .backroom-table th:nth-child(3), .backroom-table td:nth-child(3) { left: 210px; min-width: 180px; box-shadow: 2px 0 5px -2px rgba(0,0,0,0.1); }
  .row-green .sticky-col { background-color: #dcfce7 !important; }
  .row-yellow .sticky-col { background-color: #fff7cc !important; }
  .row-normal .sticky-col { background-color: white !important; }
  
  .critical-btn {
    background-color: #ef4444 !important;
    color: white !important;
    border: none;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
  }
  .critical-btn:disabled {
    background-color: #fca5a5 !important;
    cursor: not-allowed;
  }
`;

export default function RapidCardRegister() {
  const [masterEntries, setMasterEntries] = useState([]);
  const [rapidDocs, setRapidDocs] = useState({});
  const [saving, setSaving] = useState(false);

  // 🛡️ INTERNAL BUFFER: Shields results from cloud sync wipes on slow internet
  const [localResults, setLocalResults] = useState({});

  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  // UPDATE: Load localScans from LocalStorage to survive refresh
  const [localScans, setLocalScans] = useState(() => {
    const saved = localStorage.getItem("rapid_localScans");
    return saved ? JSON.parse(saved) : {};
  });

  // FINAL FIX: Persist localScanTimes to survive refresh
  const [localScanTimes, setLocalScanTimes] = useState(() => {
    const saved = localStorage.getItem("rapid_localScanTimes");
    return saved ? JSON.parse(saved) : {};
  });

  const [criticalReportedSet, setCriticalReportedSet] = useState(new Set());
  const [pendingCriticalMap, setPendingCriticalMap] = useState({});

  const testsForRegister = routing.RapidCardRegister;

  const normalize = (s = "") => s.toLowerCase().replace(/[\s,._-]+/g, " ").trim();

  const getRapidSelectedTests = (selectedTests = []) => {
    return selectedTests.filter((testObj) => {
      const name = typeof testObj === "string" ? testObj : testObj?.test || "";
      const n = normalize(name);
      const overlapMarkers = ["trop", "hbsag", "hcv", "hiv"];
      const isOverlap = overlapMarkers.some(marker => n.includes(marker));
      if (isOverlap && !n.includes("card")) return false;
      return testsForRegister.some((ref) => normalize(ref).includes(n) || n.includes(normalize(ref)));
    });
  };

  const rapidTests = [
    { field: "malaria", label: "Malaria Antigen", match: "malaria antigen" },
    { field: "tropt", label: "Trop-T", match: "trop" },
    { field: "dengue", label: "Dengue IGG/IGM/NS1", match: "dengue" },
    { field: "typhoid", label: "Typhoid IGG/IGM", match: "typhoid" },
    { field: "chikungunya", label: "Chikungunya IgM", match: "chikungunia" },
  ];

  const normalizeSource = (raw) => {
    if (!raw) return "Unknown";
    const s = raw.toLowerCase();
    if (s.includes("opd")) return "OPD";
    if (s.includes("ipd")) return "IPD";
    if (s.includes("third") || s.includes("3rd")) return "Third Floor";
    return "Unknown";
  };

  const parseDate = (entry) => {
    const fields = [entry.timePrinted, entry.timeCollected, entry.scannedTime, entry.savedTime, entry.createdAt];
    for (const f of fields) {
      if (!f) continue;
      if (typeof f === "object" && f?.toDate) return f.toDate();
      if (typeof f === "string" || f instanceof Date) {
        const d = new Date(f);
        if (!isNaN(d)) return d;
      }
      if (f?.seconds) return new Date(f.seconds * 1000);
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
    const unsubMaster = onSnapshot(collection(db, "master_register"), (snap) => {
      setMasterEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubRapid = onSnapshot(collection(db, "rapid_card_register"), (snap) => {
      const data = {};
      snap.docs.forEach(d => { data[d.id] = d.data(); });
      setRapidDocs(data);
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

    return () => { unsubMaster(); unsubRapid(); unsubCritical(); };
  }, []);

  const mergedEntries = useMemo(() => {
    const filtered = masterEntries.filter((entry) => getRapidSelectedTests(entry.selectedTests || []).length > 0);

    return filtered.map((entry) => {
      const regNo = String(entry.regNo || entry.id);
      const diagnosticNo = entry.diagnosticNo || entry.accNo || "-";
      const compositeKey = `${regNo}_${diagnosticNo}`;

      const saved = rapidDocs[compositeKey] || {};
      const localScan = localScans[compositeKey];
      const typing = localResults[compositeKey] || {}; 

      return {
        ...entry,
        ...saved,
        regNo,
        diagnosticNo,
        compositeKey,
        source: normalizeSource(entry.source || entry.category),
        results: {
          malaria: "Pending", tropt: "Pending", dengue: "Pending", typhoid: "Pending", chikungunya: "Pending",
          ...(entry.results || {}),
          ...(saved.results || {}),
          ...typing 
        },
        scanned: localScan ?? saved.scanned ?? "No",
        scannedTime: saved.scannedTime || null,
        urgent: entry.urgent || false, 
        status: (saved.saved === "Yes" || saved.status === "saved") ? "saved" : localScan === "Yes" ? "scanned" : saved.status || "pending",
        pendingCriticalParam: pendingCriticalMap[compositeKey]
      };
    });
  }, [masterEntries, rapidDocs, localScans, pendingCriticalMap, localResults]);

  const mapSelectedTestsToResultKeys = (entry) => {
    const keys = new Set();
    const rapidOnly = getRapidSelectedTests(entry.selectedTests || []);
    rapidOnly.forEach((t) => {
      const name = typeof t === "string" ? t : t?.test || "";
      const n = normalize(name);
      rapidTests.forEach((r) => { if (n.includes(normalize(r.match))) keys.add(r.field); });
    });
    return [...keys];
  };

  const areRequiredFieldsFilled = (entry) =>
    mapSelectedTestsToResultKeys(entry).every((k) => entry.results?.[k] && entry.results[k] !== "Pending");

  const handleChange = (compositeKey, field, value) => {
    setLocalResults(prev => ({
      ...prev,
      [compositeKey]: { ...(prev[compositeKey] || {}), [field]: value }
    }));
  };

  // UPDATE: Writes both Scan status and Time to LocalStorage using compositeKey
  const handleScan = (compositeKey, value) => {
    const now = new Date().toISOString();
    setLocalScans((prev) => {
      const updated = { ...prev, [compositeKey]: value };
      localStorage.setItem("rapid_localScans", JSON.stringify(updated));
      return updated;
    });

    setLocalScanTimes((prev) => {
      const updatedTimes = { ...prev, [compositeKey]: value === "Yes" ? now : null };
      localStorage.setItem("rapid_localScanTimes", JSON.stringify(updatedTimes));
      return updatedTimes;
    });
  };

  const triggerCritical = (entry) => {
    const relevantKeys = mapSelectedTestsToResultKeys(entry);
    let suggested = "";
    relevantKeys.forEach(k => { if (entry.results[k] && entry.results[k] !== "Pending") suggested += `${k.toUpperCase()}: ${entry.results[k]} `; });
    const parameter = window.prompt("Confirm Critical Values:", suggested.trim());
    if (!parameter) return;
    setPendingCriticalMap(prev => ({ ...prev, [entry.compositeKey]: parameter }));
    alert("Critical confirmed. Click Save to send.");
  };

  const handleSave = async (entry) => {
    try {
      setSaving(true);
      const compositeKey = entry.compositeKey;
      if (entry.scanned !== "Yes") { alert("Please scan before saving."); return; }
      if (!areRequiredFieldsFilled(entry)) { alert("Please fill required results."); return; }

      const rapidOnlyTests = getRapidSelectedTests(entry.selectedTests || []).map(t => typeof t === "object" ? t.test : t);
      
      const cleanedResults = Object.fromEntries(
        Object.entries(entry.results).filter(([k, v]) => 
          v && v !== "Pending" && k !== "pendingcriticalparam"
        )
      );

      const rawLocalTime = localScanTimes[compositeKey];
      const scanTime = rawLocalTime ? new Date(rawLocalTime) : (entry.scannedTime?.toDate ? entry.scannedTime.toDate() : entry.scannedTime);
      
      const hasPendingCritical = !!entry.pendingCriticalParam;

      const { pendingCriticalParam, compositeKey: unused, id, phone, tests, father, doctor, ...restOfEntry } = entry;

      const payload = {
        ...restOfEntry,
        compositeKey: compositeKey,
        selectedTests: rapidOnlyTests,
        results: cleanedResults,
        scanned: "Yes",
        scannedTime: scanTime ? Timestamp.fromDate(new Date(scanTime)) : null,
        saved: "Yes",
        savedTime: serverTimestamp(),
        status: "saved",
        critical: (criticalReportedSet.has(compositeKey) || hasPendingCritical) ? "Yes" : "No"
      };

      await setDoc(doc(db, "rapid_card_register", compositeKey), payload, { merge: true });

      if (hasPendingCritical) {
        await setDoc(doc(db, "critical_alerts", `${compositeKey}_${CURRENT_DEPT}`), {
          name: entry.name || "", regNo: entry.regNo, diagnosticNo: entry.diagnosticNo || "—",
          age: entry.age || "", ageUnit: entry.ageUnit || "", gender: entry.gender || "-",
          source: entry.source || "-", doctor: entry.doctor || "Self",
          criticalParameter: entry.pendingCriticalParam, flaggedAt: serverTimestamp(),
          status: "Pending", dept: CURRENT_DEPT, selectedTests: rapidOnlyTests
        });
      }

      setLocalResults(prev => { const n = {...prev}; delete n[compositeKey]; return n; });
      
      // UPDATE: Cleanup LocalStorage after save
      setLocalScans(prev => { 
        const n = {...prev}; 
        delete n[compositeKey]; 
        localStorage.setItem("rapid_localScans", JSON.stringify(n));
        return n; 
      });

      setLocalScanTimes(prev => {
        const n = {...prev};
        delete n[compositeKey];
        localStorage.setItem("rapid_localScanTimes", JSON.stringify(n));
        return n;
      });

      setPendingCriticalMap(prev => { const n = {...prev}; delete n[compositeKey]; return n; });

      alert(`✅ Saved ${entry.name}`);
    } catch (err) { alert("Error saving."); } finally { setSaving(false); }
  };

  const filteredEntries = useMemo(() => {
    return mergedEntries
      .filter((e) => {
        if (regSearch) {
          const search = regSearch.toLowerCase();
          if (!String(e.regNo).toLowerCase().includes(search) && !String(e.diagnosticNo).toLowerCase().includes(search)) return false;
        }
        if (sourceFilter !== "All" && e.source !== sourceFilter) return false;
        
        const d = parseDate(e);
        if (d) {
          const entryDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  }, [mergedEntries, regSearch, sourceFilter, dateFrom, dateTo]);

  return (
    <div className="register-section">
      <style>{overflowStyles}</style>
      <h3>💉 Rapid Card Register</h3>
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
              <th className="sticky-col">Name</th>
              <th>Age</th>
              <th>Source</th>
              <th>Tests</th>
              {rapidTests.map((t) => (<th key={t.field}>{t.label}</th>))}
              <th>Scanned</th>
              <th>Status</th>
              <th>Critical</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => {
              const scanned = e.scanned === "Yes";
              const saved = e.status === "saved";
              const isCrit = criticalReportedSet.has(e.compositeKey);
              const missingReq = !areRequiredFieldsFilled(e);
              return (
                <tr key={e.compositeKey} className={saved ? "row-green" : scanned ? "row-yellow" : "row-normal"}>
                  <td className="sticky-col" style={e.urgent ? { borderLeft: "4px solid red" } : {}}>{e.regNo}</td>
                  <td className="sticky-col" style={{ color: "#475569" }}>{e.diagnosticNo}</td>
                  <td className="sticky-col">{e.name}</td>
                  <td>{e.age} {e.ageUnit}</td>
                  <td>{e.source}</td>
                  <td style={{fontSize:'11px'}}>{getRapidSelectedTests(e.selectedTests || []).map(t => (typeof t === "object" ? t.test : t)).join(", ")}</td>
                  {rapidTests.map((t) => (
                    <td key={t.field}>
                      {mapSelectedTestsToResultKeys(e).includes(t.field) ? (
                        <select value={e.results[t.field] || "Pending"} disabled={!scanned || saved} onChange={(ev) => handleChange(e.compositeKey, t.field, ev.target.value)}>
                          <option>Pending</option><option>Positive</option><option>Negative</option>
                        </select>
                      ) : "—"}
                    </td>
                  ))}
                  <td>
                    <select value={e.scanned} disabled={saved} onChange={(ev) => handleScan(e.compositeKey, ev.target.value)}>
                      <option value="No">No</option><option value="Yes">Yes</option>
                    </select>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {(isCrit || e.pendingCriticalParam) && (
                      <span style={{ color: 'red', fontWeight: 'bold', fontSize: '9px' }}>{isCrit ? "REPORTED" : "PENDING SAVE"}</span>
                    )}
                  </td>
                  <td>
                    <button onClick={() => triggerCritical(e)} disabled={isCrit || e.pendingCriticalParam || saved || !scanned || missingReq} className="critical-btn">Critical</button>
                  </td>
                  <td>
                    <button className="save-btn" disabled={saving || saved || !scanned || missingReq} onClick={() => handleSave(e)}>Save</button>
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