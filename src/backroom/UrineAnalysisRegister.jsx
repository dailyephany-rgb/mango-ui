
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
import { handleInventoryDeduction } from "../inventory/inventorymapping";

// 🚨 Define the unique key for this department
const CURRENT_DEPT = "Urine Analysis";

const tableFixStyles = `
.table-container {
  overflow-x: auto; 
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
}
.backroom-table {
  width: 100%;
  min-width: 1800px;
  border-collapse: separate; 
  border-spacing: 0;
}
.sticky-col {
  position: sticky;
  z-index: 2; 
  background-color: white; 
  border-right: 1px solid #e5e7eb;
  white-space: nowrap; 
}
.col-regno { left: 0px; min-width: 90px; }
.col-diagno { left: 90px; min-width: 110px; } 
.col-name  { left: 200px; min-width: 180px; } 
.backroom-table thead th.sticky-col {
  z-index: 3;
  background-color: #f8fafc; 
}
.row-yellow .sticky-col { background-color: #fff9c4 !important; }
.row-green .sticky-col { background-color: #c8e6c9 !important; }
`;

export default function UrineAnalysisRegister() {
  const [masterEntries, setMasterEntries] = useState([]);
  const [urineDocs, setUrineDocs] = useState({});
  const [saving, setSaving] = useState(false);

  // 🛡️ INTERNAL BUFFER: Keeps typed results safe from slow internet resets
  const [localResults, setLocalResults] = useState(() => {
    const saved = localStorage.getItem("urine_localResults");
    return saved ? JSON.parse(saved) : {};
  });

  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  // UPDATE: Load localScans from LocalStorage to survive refresh
  const [localScans, setLocalScans] = useState(() => {
    const saved = localStorage.getItem("urine_localScans");
    return saved ? JSON.parse(saved) : {};
  });

  const [savedSet, setSavedSet] = useState(new Set());
  const [criticalReportedSet, setCriticalReportedSet] = useState(new Set());

  const testsForRegister = routing.UrineAnalysisRegister || [
    "URINE ANALYSIS", "URINE FOR ALBUMIN", "URINE FOR SUGAR",
    "URINE FOR BILE SALTS", "URINE FOR BILE PIGMENTS",
    "URINE FOR KETONE BODIES", "PREGNANCY TEST, URINE",
  ];

  const normalize = (s) => (s || "").toLowerCase().replace(/[\s,_-]+/g, "").trim();

  const parameterFields = [
    { key: "albumin", label: "Protein", match: "albumin" },
    { key: "sugar", label: "Glucose", match: "sugar" },
    { key: "bileSalts", label: "Bile Salts", match: "bilesalts" },
    { key: "bilePigments", label: "Bile Pigments", match: "bilepigments" },
    { key: "ketoneBodies", label: "Ketone Bodies", match: "ketonebodies" },
    { key: "pregnancy", label: "Pregnancy Test", match: "pregnancy" },
  ];

  const routineExtraFields = [
    { key: "sg", label: "SG" },
    { key: "ph", label: "Reaction (pH)" },
    { key: "volume", label: "Volume" },
  
    { key: "color", label: "Color" },
    { key: "appearance", label: "Appearance" },
  
    { key: "rbc", label: "RBC" },
    { key: "pus", label: "Pus Cells" },
    { key: "epithelium", label: "Epithelial Cells" },
  
    { key: "crystals", label: "Crystals" },
    { key: "bacteria", label: "Bacteria" },
    { key: "casts", label: "Casts" },
    { key: "yeastCells", label: "Yeast Cells" },
    { key: "others", label: "Others" },
  ];

  const dropdownOptions = {
    albumin: ["Nil", "Trace", "1+", "2+", "3+", "4+"],
    sugar: ["Nil", "Trace", "1+", "2+", "3+", "4+"],
    color: ["Pale Yellow", "Yellow", "Deep Yellow"],
    appearance: ["Clear", "Hazy", "Cloudy"],
  };

  const normalizeSource = (raw) => {
    if (!raw) return "Unknown";
    const s = raw.trim().toLowerCase();
    if (s.includes("opd")) return "OPD";
    if (s.includes("ipd")) return "IPD";
    if (s.includes("third") || s.includes("3rd")) return "Third Floor";
    return "Unknown";
  };

  const parseDate = (entry) => {
    const fields = [entry.timePrinted, entry.timeCollected, entry.savedTime, entry.scannedTime];
    for (const f of fields) {
      if (!f) continue;
      if (typeof f === "object" && f?.toDate) return f.toDate();
      if (typeof f === "object" && f?.seconds) return new Date(f.seconds * 1000);
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
    const unsubMaster = onSnapshot(collection(db, "master_register"), (snap) => {
        setMasterEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubUrine = onSnapshot(collection(db, "urine_analysis_register"), (snap) => {
      const docsMap = {};
      const sSet = new Set();
      snap.docs.forEach((d) => {
        const data = d.data();
        // UPDATE: Use composite key as the map index
        const compositeId = d.id; 
        docsMap[compositeId] = data;
        if (data.saved === "Yes") sSet.add(compositeId);
      });
      setUrineDocs(docsMap);
      setSavedSet(sSet);
    });

    const unsubCritical = onSnapshot(collection(db, "critical_alerts"), (snap) => {
      const cSet = new Set();
      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.regNo && String(data.dept).toLowerCase() === CURRENT_DEPT.toLowerCase()) {
          // UPDATE: Track reported criticals via composite key
          const cKey = `${data.regNo}_${data.diagnosticNo}`;
          cSet.add(cKey);
        }
      });
      setCriticalReportedSet(cSet);
    });

    return () => { unsubMaster(); unsubUrine(); unsubCritical(); };
  }, []);

  const mergedEntries = useMemo(() => {
    const filtered = masterEntries.filter((entry) =>
      Array.isArray(entry.selectedTests) &&
      entry.selectedTests.some((t) =>
        testsForRegister.some((ref) =>
          normalize(typeof t === "string" ? t : t?.test).includes(normalize(ref))
        )
      )
    );

    return filtered.map((entry) => {
      const regNo = String(entry.regNo || entry.id);
      const diagnosticNo = entry.diagnosticNo || entry.accNo || "-";
      const compositeKey = `${regNo}_${diagnosticNo}`;
      
      const savedData = urineDocs[compositeKey] || {};
      const local = localScans[compositeKey] || {};
      const typing = localResults[compositeKey] || {}; 

      return {
        ...entry,
        ...savedData,
        regNo,
        diagnosticNo,
        compositeKey,
        source: normalizeSource(entry.source || entry.category),
        results: {
            ...Object.fromEntries([...parameterFields, ...routineExtraFields].map((f) => [f.key, ""])),
            ...(savedData.results || entry.results || {}),
            ...typing 
        },
        scanned: local.scanned ?? savedData.scanned ?? "No",
        scannedTime: local.scannedTime ?? savedData.scannedTime ?? null,
        status: (savedData.saved === "Yes") ? "saved" : (local.scanned === "Yes") ? "scanned" : savedData.status || "pending",
        urgent: entry.urgent || false, 
      };
    });
  }, [masterEntries, urineDocs, localScans, localResults]);

  const hasTest = (entry, matchText) =>
    (entry.selectedTests || []).some((t) =>
      normalize(typeof t === "string" ? t : t?.test).includes(normalize(matchText))
    );

  const hasRoutineTest = (entry) => hasTest(entry, "urineanalysis");

  const getUrineSelectedTests = (entry) => {
    return (entry.selectedTests || []).filter((t) => {
      const name = typeof t === "string" ? t : t?.test || "";
      return testsForRegister.some((ref) => normalize(name).includes(normalize(ref)));
    });
  };

  const mapSelectedTestsToRequiredKeys = (entry) => {
    const required = new Set();
    const routine = hasRoutineTest(entry);
    if (routine) {
      parameterFields.forEach((p) => {
        if (
          p.key !== "pregnancy" &&
          p.key !== "bileSalts" &&
          p.key !== "bilePigments"
        ) {
          required.add(p.key);
        }
      });
    
      routineExtraFields.forEach((f) => required.add(f.key));
    }
    else {
      parameterFields.forEach((p) => hasTest(entry, p.match) && required.add(p.key));
    }
    return [...required];
  };

  const areRequiredFieldsFilled = (e) =>
    mapSelectedTestsToRequiredKeys(e).every((k) => e.results?.[k]?.toString().trim());

  const isReadyToSave = (e) => e.scanned === "Yes" && areRequiredFieldsFilled(e);

  const handleChange = (compositeKey, field, value) => {
    setLocalResults((prev) => {
      const updated = {
        ...prev,
        [compositeKey]: {
          ...(prev[compositeKey] || {}),
          [field]: value,
        },
      };
  
      localStorage.setItem(
        "urine_localResults",
        JSON.stringify(updated)
      );
  
      return updated;
    });
  };

  const handleScan = (compositeKey, value) => {
    setLocalScans((prev) => {
      const updated = {
        ...prev,
        [compositeKey]: { scanned: value, scannedTime: value === "Yes" ? new Date().toISOString() : null },
      };
      localStorage.setItem("urine_localScans", JSON.stringify(updated));
      return updated;
    });
  };

  const triggerCritical = (entry) => {
    const relevantKeys = mapSelectedTestsToRequiredKeys(entry);
    let suggested = "";
    relevantKeys.forEach(k => {
      if (entry.results[k]?.toString().trim()) {
        suggested += `${k.toUpperCase()}: ${entry.results[k]} `;
      }
    });

    const parameter = window.prompt("Confirm Critical Values (Alert will be sent upon clicking Save):", suggested.trim());
    if (!parameter) return;

    setLocalResults((prev) => {
      const updated = {
        ...prev,
        [entry.compositeKey]: {
          ...(prev[entry.compositeKey] || {}),
          pendingCriticalParam: parameter,
        },
      };
    
      localStorage.setItem(
        "urine_localResults",
        JSON.stringify(updated)
      );
    
      return updated;
    });
    alert("Critical values confirmed. They will be sent to the Critical UI when you click 'Save'.");
  };

  const handleSave = async (entry) => {
    if (!isReadyToSave(entry)) return;
    setSaving(true);

    const compositeKey = entry.compositeKey;
    const requiredKeysArr = mapSelectedTestsToRequiredKeys(entry);
    const filteredResults = {};
    requiredKeysArr.forEach((key) => { filteredResults[key] = entry.results[key] || ""; });

    const filteredTests = getUrineSelectedTests(entry).map((t) => typeof t === "object" ? t.test : t);

    const hasPendingCritical = !!entry.pendingCriticalParam;
    const isCritical = (criticalReportedSet.has(compositeKey) || hasPendingCritical) ? "Yes" : "No";

    try {
      const { pendingCriticalParam, compositeKey: unusedKey, id, phone, tests, father, doctor, ...restOfEntry } = entry;
      
      const scanTimeRaw = entry.scannedTime;
      const scanTimeTs = scanTimeRaw ? Timestamp.fromDate(new Date(scanTimeRaw)) : null;

      await setDoc(
        doc(db, "urine_analysis_register", compositeKey),
        {
          ...restOfEntry,
          compositeKey: compositeKey,
          diagnosticNo: entry.diagnosticNo || "-",
          source: entry.source || "-",
          selectedTests: filteredTests, 
          results: filteredResults,
          scanned: "Yes",
          scannedTime: scanTimeTs,
          saved: "Yes",
          savedTime: serverTimestamp(),
          savedBy: sessionStorage.getItem("loggedUser") || "Unknown",
          status: "saved",
          critical: isCritical
        },
        { merge: true }
      );
      try {
        await handleInventoryDeduction(filteredTests);
      } catch (inventoryErr) {
        console.error("Inventory deduction failed:", inventoryErr);
      }

      if (hasPendingCritical) {
        const criticalId = `${compositeKey}_${CURRENT_DEPT}`;
        await setDoc(doc(db, "critical_alerts", criticalId), {
          name: entry.name || "",
          regNo: entry.regNo,
          diagnosticNo: entry.diagnosticNo || "—", age: entry.age || "",
          ageUnit: entry.ageUnit || "", gender: entry.gender || "-",
          category: entry.category || "-", source: entry.source || "-",
          doctor: entry.doctor || "Self",
          reportedBy: sessionStorage.getItem("loggedUser") || "Unknown",
          timePrinted: entry.timePrinted || null,
          timeCollected: entry.timeCollected || null,
          criticalParameter: entry.pendingCriticalParam,
          flaggedAt: serverTimestamp(),
          status: "Pending", dept: CURRENT_DEPT, selectedTests: filteredTests
        });
      }

      setLocalResults((prev) => {
        const n = { ...prev };
        delete n[compositeKey];
      
        localStorage.setItem(
          "urine_localResults",
          JSON.stringify(n)
        );
      
        return n;
      });
      
      setLocalScans(prev => { 
        const n = {...prev}; 
        delete n[compositeKey]; 
        localStorage.setItem("urine_localScans", JSON.stringify(n));
        return n; 
      });
      
      alert(`✅ Saved Urine Analysis for ${entry.name} ${hasPendingCritical ? "(Critical Alert Sent)" : ""}`);
    } catch (err) {
      console.error(err);
      alert("Error saving results.");
    } finally {
      setSaving(false);
    }
  };

  const filteredEntries = mergedEntries
    .filter((e) => {
      if (regSearch) {
        const search = regSearch.toLowerCase();
        if (!String(e.regNo).toLowerCase().includes(search) && !String(e.diagnosticNo).toLowerCase().includes(search)) return false;
      }
      if (sourceFilter !== "All" && e.source !== sourceFilter) return false;
      
      const d = parseDate(e);
      if (!d) return true;

      const entryDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      
      if (dateFrom && entryDateStr < dateFrom) return false;
      if (dateTo && entryDateStr > dateTo) return false;
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

  return (
    <div className="register-section">
      <style>{tableFixStyles}</style>
      <h3>🧪 Urine Analysis Register</h3>
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

      <div className="table-container">
        <table className="backroom-table">
          <thead>
            <tr>
              <th className="sticky-col col-regno">Reg No</th>
              <th className="sticky-col col-diagno">Diag No</th>
              <th className="sticky-col col-name">Name</th>
              <th>Age</th><th>Gender</th><th>Source</th><th>Selected Tests</th>
              {parameterFields.map((p) => (<th key={p.key}>{p.label}</th>))}
              {routineExtraFields.map((f) => (<th key={f.key}>{f.label}</th>))}
              <th>Scanned</th>
              <th>Status</th>
              <th>Saved By</th>
              <th>Critical</th>
              <th>Save</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => {
              const compositeKey = e.compositeKey;
              const isSaved = savedSet.has(compositeKey);
              const isScanned = e.scanned === "Yes";
              const isCriticalReported = criticalReportedSet.has(compositeKey);
              const isPendingCritical = !!e.pendingCriticalParam;
              const routine = hasRoutineTest(e);
              const missingRequired = !areRequiredFieldsFilled(e);
              const ready = isScanned && !missingRequired;
              const rowClass = isSaved ? "row-green" : isScanned ? "row-yellow" : "";

              return (
                <tr key={compositeKey} className={rowClass}>
                  <td className="sticky-col col-regno" style={e.urgent ? { borderLeft: "4px solid red" } : {}}>{e.regNo}</td>
                  <td className="sticky-col col-diagno">{e.diagnosticNo}</td>
                  <td className="sticky-col col-name">{e.name}</td>
                  <td>{e.age} {e.ageUnit}</td><td>{e.gender}</td><td>{e.source}</td>
                  <td>{getUrineSelectedTests(e).map((t) => (typeof t === "object" ? t.test : t)).join(", ") || "—"}</td>
                  {parameterFields.map((p) => {
                    const show = p.key === "pregnancy" ? hasTest(e, p.match) : routine || hasTest(e, p.match);
                    if (!show) return <td key={p.key}>-</td>;
                    return (
                      <td key={p.key}>
                        {p.key === "pregnancy" ? (
                          <select value={e.results[p.key] || ""} disabled={!isScanned || isSaved} onChange={(ev) => handleChange(compositeKey, p.key, ev.target.value)}>
                            <option value="">Select</option><option value="Negative">Negative</option><option value="Positive">Positive</option>
                          </select>
                        ) : (
                          dropdownOptions[p.key] ? (
                            <select value={e.results[p.key] || ""} disabled={!isScanned || isSaved} onChange={(ev) => handleChange(compositeKey, p.key, ev.target.value)}>
                              <option value="">Select</option>
                              {dropdownOptions[p.key].map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                            </select>
                          ) : (
                            <input value={e.results[p.key] || ""} disabled={!isScanned || isSaved} onChange={(ev) => handleChange(compositeKey, p.key, ev.target.value)}
                              style={{ textAlign: "center", fontWeight: "bold", padding: "5px 10px", border: "1px solid #ccc", borderRadius: "4px", height: "30px", boxSizing: "border-box" }}
                            />
                          )
                        )}
                      </td>
                    );
                  })}
                  {routineExtraFields.map((f) => (
                    <td key={f.key}>
                      {routine ? (
                        dropdownOptions[f.key] ? (
                          <select value={e.results[f.key] || ""} disabled={!isScanned || isSaved} onChange={(ev) => handleChange(compositeKey, f.key, ev.target.value)}>
                            <option value="">Select</option>
                            {dropdownOptions[f.key].map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                          </select>
                        ) : (
                          <input value={e.results[f.key] || ""} disabled={!isScanned || isSaved} onChange={(ev) => handleChange(compositeKey, f.key, ev.target.value)}
                            style={{ textAlign: "center", fontWeight: "bold", padding: "5px 10px", border: "1px solid #ccc", borderRadius: "4px", height: "30px", boxSizing: "border-box" }}
                          />
                        )
                      ) : ("-")}
                    </td>
                  ))}
                  <td>
                    <select value={isScanned ? "Yes" : "No"} disabled={isSaved} onChange={(ev) => handleScan(compositeKey, ev.target.value)}>
                      <option>No</option><option>Yes</option>
                    </select>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {(isCriticalReported || isPendingCritical) && (
                      <span style={{ color: 'red', fontWeight: 'bold', fontSize: '10px' }}>
                        {isCriticalReported ? "CRITICAL REPORTED" : "CRITICAL PENDING SAVE"}
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
                    <button onClick={() => triggerCritical(e)} disabled={isCriticalReported || isPendingCritical || isSaved || !ready}
                      style={{ backgroundColor: (isCriticalReported || isPendingCritical || isSaved || !ready) ? "#ccc" : "#d9534f", color: "white", border: "none", padding: "6px 10px", borderRadius: "4px", cursor: (isCriticalReported || isPendingCritical || isSaved || !ready) ? "not-allowed" : "pointer", fontSize: "12px", fontWeight: "bold", width: "100%" }}
                    > Critical </button>
                  </td>
                  <td>
                    <button className="save-btn" disabled={isSaved || saving || !ready} onClick={() => handleSave(e)}> Save </button>
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