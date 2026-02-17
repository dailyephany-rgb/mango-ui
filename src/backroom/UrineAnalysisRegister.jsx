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
const CURRENT_DEPT = "Urine Analysis";

// 🌟 STYLES: Specific styles to force the scrollbar and handle sticky columns
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
  min-width: 1800px; /* High width to ensure scrolling works */
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

/* 🚨 ONLY Reg No, Diag No, and Name are sticky */
.col-regno { left: 0px; min-width: 90px; }
.col-diagno { left: 90px; min-width: 110px; } 
.col-name  { left: 200px; min-width: 180px; } 

.backroom-table thead th.sticky-col {
  z-index: 3;
  background-color: #f8fafc; 
}

/* Row color maintenance for sticky columns */
.row-yellow .sticky-col { background-color: #fff9c4 !important; }
.row-green .sticky-col { background-color: #c8e6c9 !important; }
`;

export default function UrineAnalysisRegister() {
  const [masterEntries, setMasterEntries] = useState([]);
  const [urineDocs, setUrineDocs] = useState({});
  const [saving, setSaving] = useState(false);

  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const [localScans, setLocalScans] = useState({});
  const [savedSet, setSavedSet] = useState(new Set());
  const [criticalReportedSet, setCriticalReportedSet] = useState(new Set());

  const testsForRegister =
    routing.UrineAnalysisRegister || [
      "URINE ANALYSIS",
      "URINE FOR ALBUMIN",
      "URINE FOR SUGAR",
      "URINE FOR BILE SALTS",
      "URINE FOR BILE PIGMENTS",
      "URINE FOR KETONE BODIES",
      "PREGNANCY TEST, URINE",
    ];

  const normalize = (s) =>
    (s || "").toLowerCase().replace(/[\s,_-]+/g, "").trim();

  const parameterFields = [
    { key: "albumin", label: "Albumin", match: "albumin" },
    { key: "sugar", label: "Sugar", match: "sugar" },
    { key: "bileSalts", label: "Bile Salts", match: "bilesalts" },
    { key: "bilePigments", label: "Bile Pigments", match: "bilepigments" },
    { key: "ketoneBodies", label: "Ketone Bodies", match: "ketonebodies" },
    { key: "pregnancy", label: "Pregnancy Test", match: "pregnancy" },
  ];

  const routineExtraFields = [
    { key: "sg", label: "SG" },
    { key: "ph", label: "pH" },
    { key: "color", label: "Color" },
    { key: "appearance", label: "Appearance" },
    { key: "rbc", label: "RBC" },
    { key: "pus", label: "Pus Cells" },
    { key: "epithelium", label: "Epithelium" },
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
    const fields = [
      entry.timePrinted,
      entry.timeCollected,
      entry.savedTime,
      entry.scannedTime,
    ];
    for (const f of fields) {
      if (!f) continue;
      if (typeof f === "object" && f?.toDate) return f.toDate();
      if (typeof f === "object" && f?.seconds)
        return new Date(f.seconds * 1000);
    }
    return null;
  };

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
  }, []);

  // Optimized Snapshots
  useEffect(() => {
    const unsubMaster = onSnapshot(collection(db, "master_register"), (snap) => {
        setMasterEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubUrine = onSnapshot(collection(db, "urine_analysis_register"), (snap) => {
      const docsMap = {};
      const sSet = new Set();
      snap.docs.forEach((d) => {
        const data = d.data();
        const id = String(data.regNo || d.id);
        docsMap[id] = data;
        if (data.saved === "Yes") sSet.add(id);
      });
      setUrineDocs(docsMap);
      setSavedSet(sSet);
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

    return () => {
      unsubMaster();
      unsubUrine();
      unsubCritical();
    };
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
      const savedData = urineDocs[regNo] || {};
      const local = localScans[regNo] || {};

      return {
        ...entry,
        ...savedData,
        regNo,
        diagnosticNo: entry.diagnosticNo || entry.accNo || "-", 
        source: normalizeSource(entry.source || entry.category),
        results: savedData.results || entry.results || Object.fromEntries(
            [...parameterFields, ...routineExtraFields].map((f) => [f.key, ""])
        ),
        scanned: local.scanned ?? savedData.scanned ?? "No",
        scannedTime: local.scannedTime ?? savedData.scannedTime ?? null,
        status: (savedData.saved === "Yes") ? "saved" : (local.scanned === "Yes") ? "scanned" : savedData.status || "pending",
        urgent: entry.urgent || false, 
      };
    });
  }, [masterEntries, urineDocs, localScans]);

  const hasTest = (entry, matchText) =>
    (entry.selectedTests || []).some((t) =>
      normalize(typeof t === "string" ? t : t?.test).includes(
        normalize(matchText)
      )
    );

  const hasRoutineTest = (entry) => hasTest(entry, "urineanalysis");

  const getUrineSelectedTests = (entry) => {
    return (entry.selectedTests || []).filter((t) => {
      const name = typeof t === "string" ? t : t?.test || "";
      return testsForRegister.some((ref) =>
        normalize(name).includes(normalize(ref))
      );
    });
  };

  const mapSelectedTestsToRequiredKeys = (entry) => {
    const required = new Set();
    const routine = hasRoutineTest(entry);

    if (routine) {
      parameterFields.forEach(
        (p) => p.key !== "pregnancy" && required.add(p.key)
      );
      routineExtraFields.forEach((f) => required.add(f.key));
    } else {
      parameterFields.forEach(
        (p) => hasTest(entry, p.match) && required.add(p.key)
      );
    }
    return [...required];
  };

  const areRequiredFieldsFilled = (e) =>
    mapSelectedTestsToRequiredKeys(e).every(
      (k) => e.results?.[k]?.toString().trim()
    );

  const isReadyToSave = (e) => e.scanned === "Yes" && areRequiredFieldsFilled(e);

  const handleChange = (regNo, field, value) => {
    setUrineDocs((prev) => {
        const current = prev[regNo] || {};
        return {
            ...prev,
            [regNo]: {
                ...current,
                results: { ...(current.results || {}), [field]: value }
            }
        };
    });
  };

  const handleScan = (regNo, value) => {
    setLocalScans((prev) => ({
      ...prev,
      [regNo]: {
        scanned: value,
        scannedTime: value === "Yes" ? new Date() : null,
      },
    }));
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

    const regKey = String(entry.regNo);
    
    setUrineDocs(prev => ({
        ...prev,
        [regKey]: { ...(prev[regKey] || {}), pendingCriticalParam: parameter }
    }));
    alert("Critical values confirmed. They will be sent to the Critical UI when you click 'Save'.");
  };

  const handleSave = async (entry) => {
    if (!isReadyToSave(entry)) return;
    setSaving(true);

    const regNoKey = String(entry.regNo);
    const requiredKeys = mapSelectedTestsToRequiredKeys(entry);
    const filteredResults = {};
    requiredKeys.forEach((key) => {
      filteredResults[key] = entry.results[key] || "";
    });

    const filteredTests = getUrineSelectedTests(entry).map((t) => 
      typeof t === "object" ? t.test : t
    );

    const hasPendingCritical = !!entry.pendingCriticalParam;
    const isCritical = (criticalReportedSet.has(regNoKey) || hasPendingCritical) ? "Yes" : "No";

    try {
      const { pendingCriticalParam, id, phone, tests, father, doctor, ...restOfEntry } = entry;

      await setDoc(
        doc(db, "urine_analysis_register", regNoKey),
        {
          ...restOfEntry,
          diagnosticNo: entry.diagnosticNo || "-",
          source: entry.source || "-",
          selectedTests: filteredTests, 
          results: filteredResults,
          scanned: "Yes",
          scannedTime: entry.scannedTime,
          saved: "Yes",
          savedTime: serverTimestamp(),
          status: "saved",
          critical: isCritical
        },
        { merge: true }
      );

      if (hasPendingCritical) {
        const criticalId = `${regNoKey}_${CURRENT_DEPT}`;
        await setDoc(doc(db, "critical_alerts", criticalId), {
          name: entry.name || "",
          regNo: regNoKey,
          diagnosticNo: entry.diagnosticNo || "—",
          age: entry.age || "",
          ageUnit: entry.ageUnit || "",
          gender: entry.gender || "-",
          category: entry.category || "-", 
          source: entry.source || "-",
          doctor: entry.doctor || "Self",
          timePrinted: entry.timePrinted || null,
          timeCollected: entry.timeCollected || null,
          criticalParameter: entry.pendingCriticalParam,
          flaggedAt: serverTimestamp(),
          status: "Pending",
          dept: CURRENT_DEPT,
          selectedTests: filteredTests
        });
      }

      setUrineDocs(prev => {
        const n = {...prev};
        if(n[regNoKey]) delete n[regNoKey].pendingCriticalParam;
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
        if (!String(e.regNo).toLowerCase().includes(search) &&
            !String(e.diagnosticNo).toLowerCase().includes(search))
          return false;
      }
      if (sourceFilter !== "All" && e.source !== sourceFilter) return false;
      const d = parseDate(e);
      if (!d) return true;
      if (dateFrom && d < new Date(dateFrom + "T00:00:00")) return false;
      if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.urgent !== b.urgent) {
        return a.urgent ? -1 : 1;
      }
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
        <input
          className="reg-search"
          placeholder="Search Reg or Diag No..."
          value={regSearch}
          onChange={(e) => setRegSearch(e.target.value)}
        />
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

      <div className="table-container">
        <table className="backroom-table">
          <thead>
            <tr>
              <th className="sticky-col col-regno">Reg No</th>
              <th className="sticky-col col-diagno">Diag No</th>
              <th className="sticky-col col-name">Name</th>
              <th>Age</th>
              <th>Gender</th>
              <th>Source</th>
              <th>Selected Tests</th>
              {parameterFields.map((p) => (<th key={p.key}>{p.label}</th>))}
              {routineExtraFields.map((f) => (<th key={f.key}>{f.label}</th>))}
              <th>Scanned</th>
              <th>Status</th>
              <th>Critical</th>
              <th>Save</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => {
              const regNoStr = String(e.regNo);
              const isSaved = savedSet.has(regNoStr);
              const isScanned = e.scanned === "Yes";
              const isCriticalReported = criticalReportedSet.has(regNoStr);
              const isPendingCritical = !!e.pendingCriticalParam;
              const routine = hasRoutineTest(e);
              const missingRequired = !areRequiredFieldsFilled(e);
              const ready = isScanned && !missingRequired;
              
              const rowClass = isSaved ? "row-green" : isScanned ? "row-yellow" : "";

              return (
                <tr key={regNoStr} className={rowClass}>
                  <td className="sticky-col col-regno" style={e.urgent ? { borderLeft: "4px solid red" } : {}}>{e.regNo}</td>
                  <td className="sticky-col col-diagno">{e.diagnosticNo}</td>
                  <td className="sticky-col col-name">{e.name}</td>
                  <td>{e.age} {e.ageUnit}</td>
                  <td>{e.gender}</td>
                  <td>{e.source}</td>
                  <td>
                    {getUrineSelectedTests(e).map((t) => (typeof t === "object" ? t.test : t)).join(", ") || "—"}
                  </td>
                  {parameterFields.map((p) => {
                    const show = p.key === "pregnancy" ? hasTest(e, p.match) : routine || hasTest(e, p.match);
                    if (!show) return <td key={p.key}>-</td>;
                    return (
                      <td key={p.key}>
                        {p.key === "pregnancy" ? (
                          <select
                            value={e.results[p.key] || ""}
                            disabled={!isScanned || isSaved}
                            onChange={(ev) => handleChange(e.regNo, p.key, ev.target.value)}
                          >
                            <option value="">Select</option>
                            <option value="Negative">Negative</option>
                            <option value="Positive">Positive</option>
                          </select>
                        ) : (
                          dropdownOptions[p.key] ? (
                            <select
                              value={e.results[p.key] || ""}
                              disabled={!isScanned || isSaved}
                              onChange={(ev) => handleChange(e.regNo, p.key, ev.target.value)}
                            >
                              <option value="">Select</option>
                              {dropdownOptions[p.key].map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                            </select>
                          ) : (
                            <input
                              value={e.results[p.key] || ""}
                              disabled={!isScanned || isSaved}
                              onChange={(ev) => handleChange(e.regNo, p.key, ev.target.value)}
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
                          <select
                            value={f.key === "color" && !e.results[f.key] ? "Pale Yellow" : e.results[f.key] || ""}
                            disabled={!isScanned || isSaved}
                            onChange={(ev) => handleChange(e.regNo, f.key, ev.target.value)}
                          >
                            <option value="">Select</option>
                            {dropdownOptions[f.key].map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                          </select>
                        ) : (
                          <input
                            value={e.results[f.key] || ""}
                            disabled={!isScanned || isSaved}
                            onChange={(ev) => handleChange(e.regNo, f.key, ev.target.value)}
                            style={{ textAlign: "center", fontWeight: "bold", padding: "5px 10px", border: "1px solid #ccc", borderRadius: "4px", height: "30px", boxSizing: "border-box" }}
                          />
                        )
                      ) : ("-")}
                    </td>
                  ))}
                  <td>
                    <select value={isScanned ? "Yes" : "No"} disabled={isSaved} onChange={(ev) => handleScan(e.regNo, ev.target.value)}>
                      <option>No</option>
                      <option>Yes</option>
                    </select>
                  </td>

                  <td style={{ textAlign: 'center' }}>
                    {(isCriticalReported || isPendingCritical) && (
                      <span style={{ color: 'red', fontWeight: 'bold', fontSize: '10px' }}>
                        {isCriticalReported ? "CRITICAL REPORTED" : "CRITICAL PENDING SAVE"}
                      </span>
                    )}
                  </td>

                  <td>
                    <button
                      onClick={() => triggerCritical(e)}
                      disabled={isCriticalReported || isPendingCritical || isSaved || !ready}
                      style={{ 
                        backgroundColor: (isCriticalReported || isPendingCritical || isSaved || !ready) ? "#ccc" : "#d9534f", 
                        color: "white", border: "none", padding: "6px 10px", borderRadius: "4px", 
                        cursor: (isCriticalReported || isPendingCritical || isSaved || !ready) ? "not-allowed" : "pointer", 
                        fontSize: "12px", fontWeight: "bold", width: "100%" 
                      }}
                    >
                      Critical
                    </button>
                  </td>

                  <td>
                    <button 
                      className="save-btn"
                      disabled={isSaved || saving || !ready} 
                      onClick={() => handleSave(e)}
                    >
                      Save
                    </button>
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