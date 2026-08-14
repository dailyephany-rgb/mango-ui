
import React, { useState, useMemo } from "react";
import { db } from "../firebaseConfig";
import {
  setDoc,
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import routing from "../backroom_routing.json";
import "./Backroom.css";
import { normalizeSource } from "../shared/utils/source.js";
import VirtualizedTableBody from "../shared/components/VirtualizedTableBody.jsx";
import { filterAndSortRegisterPatients } from "../shared/utils/filterRegisterPatients.js";
import {
  EMPTY_DEPT_COL_FILTERS,
  applyDeptColFilters,
  hasActiveDeptColFilters,
} from "../shared/utils/deptColFilters.js";
import { compositeId } from "../shared/utils/ids.js";
import { usePersistedObjectState } from "../shared/hooks/usePersistedObjectState.js";
import { useRegisterFilters } from "../shared/hooks/useRegisterFilters.js";
import { useMasterDeptSnapshots } from "../shared/hooks/useMasterDeptSnapshots.js";
import RegisterFilterBar from "../shared/components/RegisterFilterBar.jsx";
import CriticalAlertModal from "../shared/components/CriticalAlertModal.jsx";
import ColFilterToggle, {
  ColFilterInput,
  ColFilterLocked,
  ColFilterClearCell,
} from "../shared/components/ColFilterToggle.jsx";


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
  const {
    regSearch,
    setRegSearch,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    sourceFilter,
    setSourceFilter,
  } = useRegisterFilters();

  const [showColFilters, setShowColFilters] = useState(false);
  const [colFilters, setColFilters] = useState(EMPTY_DEPT_COL_FILTERS);

  const {
    masterEntries,
    deptDocs: urineDocs,
    savedSet,
    criticalReportedSet,
  } = useMasterDeptSnapshots({
    deptCollection: "urine_analysis_register",
    currentDept: CURRENT_DEPT,
    masterDeptKey: "Urine Examination",
    dateFrom,
    dateTo,
    getDeptDocKey: (_data, docId) => docId,
    isSavedDoc: (data) => data.saved === "Yes",
    criticalBelongsToDept: (data, dept) =>
      String(data.dept).toLowerCase() === String(dept).toLowerCase(),
    getCriticalKey: (data) => compositeId(data.regNo, data.diagnosticNo),
  });
  const [saving, setSaving] = useState(false);

  // 🛡️ INTERNAL BUFFER: Keeps typed results safe from slow internet resets
  const [localResults, setLocalResults] = usePersistedObjectState("urine_localResults", {});

  // UPDATE: Load localScans from LocalStorage to survive refresh
  const [localScans, setLocalScans] = usePersistedObjectState("urine_localScans", {});

  const [criticalModalOpen, setCriticalModalOpen] = useState(false);
  const [criticalPatient, setCriticalPatient] = useState(null);

  const [criticalParameterInput, setCriticalParameterInput] = useState("");
  const [criticalReportedByInput, setCriticalReportedByInput] = useState("");
  

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

  const ensureFirestoreTimestamp = (val) => {
    if (!val) return null;
    if (val instanceof Timestamp) return val;
    if (val instanceof Date) return Timestamp.fromDate(val);
    if (typeof val === "object" && val.seconds) {
      return new Timestamp(val.seconds, val.nanoseconds);
    }
  
    const d = new Date(val);
    return isNaN(d) ? null : Timestamp.fromDate(d);
  };

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
  
      return updated;
    });
  };

  const handleScan = async (entry, value) => {
    const now = new Date().toISOString();
    const regKey = entry.compositeKey;
  
    setLocalScans((prev) => {
      const updated = {
        ...prev,
        [regKey]: {
          scanned: value,
          scannedTime:
            value === "Yes"
              ? now
              : null,
        },
      };
  
      return updated;
    });
  
    try {
      await updateDoc(
        doc(db, "report_details", regKey),
        {
          [`routineReportsScanned.${CURRENT_DEPT}`]:
            value === "Yes",
        }
      );
    } catch (err) {
      console.error(
        "Failed to update scan status:",
        err
      );
    }
  };

  const triggerCritical = (entry) => {
    const relevantKeys = mapSelectedTestsToRequiredKeys(entry);
  
    const suggested = relevantKeys
      .filter((k) => entry.results[k]?.toString().trim())
      .map((k) => `${k.toUpperCase()}: ${entry.results[k]}`)
      .join("\n");
  
    setCriticalPatient(entry);
    setCriticalParameterInput(suggested);
    setCriticalReportedByInput("");
    setCriticalModalOpen(true);
  };

  const saveCriticalDetails = () => {
    if (!criticalParameterInput.trim()) {
      alert("Please enter the Critical Parameter & Value.");
      return;
    }
  
    if (!criticalReportedByInput.trim()) {
      alert("Please enter who the critical result was reported to.");
      return;
    }
  
    setLocalResults((prev) => {
      const updated = {
        ...prev,
        [criticalPatient.compositeKey]: {
          ...(prev[criticalPatient.compositeKey] || {}),
          pendingCriticalParam: {
            parameter: criticalParameterInput.trim(),
            criticalReportedBy: criticalReportedByInput.trim(),
          },
        },
      };
  
      return updated;
    });
  
    setCriticalModalOpen(false);
    setCriticalPatient(null);
  
    alert(
      "Critical details captured. Click Save to send to the Critical Dashboard."
    );
  };

  const handleSave = async (entry) => {
    if (!isReadyToSave(entry)) return;
    setSaving(true);

    const compositeKey = entry.compositeKey;
    const requiredKeysArr = mapSelectedTestsToRequiredKeys(entry);
    const filteredResults = {};
    requiredKeysArr.forEach((key) => { filteredResults[key] = entry.results[key] || ""; });

    const filteredTests = getUrineSelectedTests(entry).map((t) => typeof t === "object" ? t.test : t);

    const pendingCriticalData = entry.pendingCriticalParam;

    const pendingCriticalParam = pendingCriticalData?.parameter;
    const pendingCriticalReportedBy = pendingCriticalData?.criticalReportedBy;

    const hasPendingCritical = !!pendingCriticalParam;
    const isCritical = (criticalReportedSet.has(compositeKey) || hasPendingCritical) ? "Yes" : "No";

    try {
      
      
      const scanTimeRaw = entry.scannedTime;
      const scanTimeTs = scanTimeRaw ? Timestamp.fromDate(new Date(scanTimeRaw)) : null;

      const payload = {
        regNo: entry.regNo,
        compositeKey,
        diagnosticNo: entry.diagnosticNo || "-",
      
        name: entry.name || "",
        age: entry.age || "",
        ageUnit: entry.ageUnit || "",
        gender: entry.gender || "-",
      
        source: entry.source || "-",
        category: entry.category || "-",
      
        selectedTests: filteredTests,
        results: filteredResults,

        timePrinted: ensureFirestoreTimestamp(entry.timePrinted),
        timeCollected: ensureFirestoreTimestamp(entry.timeCollected),
      
        scanned: "Yes",
        scannedTime: scanTimeTs,
      
        saved: "Yes",
        savedTime: serverTimestamp(),
        savedBy: sessionStorage.getItem("loggedUser") || "Unknown",
      
        status: "saved",
        critical: isCritical
      };
      
      await setDoc(
        doc(db, "urine_analysis_register", compositeKey),
        payload,
        { merge: true }
      );

      await updateDoc(
        doc(db, "report_details", compositeKey),
        {
          [`routineReportsScanned.${CURRENT_DEPT}`]: true,
          [`routineReportsSaved.${CURRENT_DEPT}`]: true,
        }
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
          criticalParameter: pendingCriticalParam,
          criticalReportedBy: pendingCriticalReportedBy,
          flaggedAt: serverTimestamp(),
          status: "Pending", dept: CURRENT_DEPT, selectedTests: filteredTests
        });
      }

      setLocalResults((prev) => {
        const n = { ...prev };
        delete n[compositeKey];
      
        return n;
      });
      
      setLocalScans(prev => { 
        const n = {...prev}; 
        delete n[compositeKey];
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

  const setColFilter = (key, value) => {
    setColFilters((prev) => ({ ...prev, [key]: value }));
  };
  const clearColFilters = () => setColFilters(EMPTY_DEPT_COL_FILTERS);
  const hasActiveColFilters = hasActiveDeptColFilters(colFilters);

  const filteredEntries = useMemo(() => {
    const base = filterAndSortRegisterPatients(mergedEntries, {
      regSearch,
      sourceFilter,
      dateFrom,
      dateTo,
      getDiag: (p) => p.diagnosticNo || p.accessionNo || "",
    });
    return applyDeptColFilters(base, colFilters, {
      getTests: (p) =>
        getUrineSelectedTests(p)
          .map((t) => (typeof t === "object" ? t.test : t))
          .join(" "),
    });
  }, [mergedEntries, regSearch, sourceFilter, dateFrom, dateTo, colFilters]);

  const urineTableColumnCount =
    7 + parameterFields.length + routineExtraFields.length + 5;

  return (
    <div className="register-section">
      <style>{tableFixStyles}</style>
      <h3>🧪 Urine Analysis Register</h3>
      <RegisterFilterBar
            regSearch={regSearch}
            setRegSearch={setRegSearch}
            dateFrom={dateFrom}
            setDateFrom={setDateFrom}
            dateTo={dateTo}
            setDateTo={setDateTo}
            sourceFilter={sourceFilter}
            setSourceFilter={setSourceFilter}
          />

      <div className="table-container">
        <table className="backroom-table">
          <thead>
            <tr>
              <th className="sticky-col col-regno">Reg No</th>
              <th className="sticky-col col-diagno">Diag No</th>
              <th className="sticky-col col-name">
                <ColFilterToggle
                  label="Name"
                  open={showColFilters}
                  active={hasActiveColFilters}
                  onToggle={() => setShowColFilters((v) => !v)}
                />
              </th>
              <th>Age</th><th>Gender</th><th>Source</th><th>Selected Tests</th>
              {parameterFields.map((p) => (<th key={p.key}>{p.label}</th>))}
              {routineExtraFields.map((f) => (<th key={f.key}>{f.label}</th>))}
              <th>Scanned</th>
              <th>Status</th>
              <th>Saved By</th>
              <th>Critical</th>
              <th>Save</th>
            </tr>
            {showColFilters ? (
              <tr className="col-filter-row">
                <ColFilterInput
                  value={colFilters.regNo}
                  onChange={(v) => setColFilter("regNo", v)}
                  placeholder="Filter reg…"
                />
                <ColFilterInput
                  value={colFilters.diagnosticNo}
                  onChange={(v) => setColFilter("diagnosticNo", v)}
                  placeholder="Filter diag…"
                />
                <ColFilterInput
                  value={colFilters.name}
                  onChange={(v) => setColFilter("name", v)}
                  placeholder="Filter name…"
                />
                <ColFilterInput
                  value={colFilters.age}
                  onChange={(v) => setColFilter("age", v)}
                  placeholder="Filter age…"
                />
                <ColFilterInput
                  value={colFilters.gender}
                  onChange={(v) => setColFilter("gender", v)}
                  placeholder="M / F"
                />
                <ColFilterInput
                  value={colFilters.source}
                  onChange={(v) => setColFilter("source", v)}
                  placeholder="e.g. OPD"
                />
                <ColFilterInput
                  value={colFilters.tests}
                  onChange={(v) => setColFilter("tests", v)}
                  placeholder="e.g. urine"
                />
                {parameterFields.map((p) => (
                  <ColFilterLocked key={`urine-lock-${p.key}`} />
                ))}
                {routineExtraFields.map((f) => (
                  <ColFilterLocked key={`urine-lock-${f.key}`} />
                ))}
                <ColFilterLocked />
                <ColFilterInput
                  value={colFilters.status}
                  onChange={(v) => setColFilter("status", v)}
                  placeholder="saved / scanned / pending"
                />
                <ColFilterInput
                  value={colFilters.savedBy}
                  onChange={(v) => setColFilter("savedBy", v)}
                  placeholder="Filter saved by…"
                />
                <ColFilterLocked />
                <ColFilterClearCell
                  show={hasActiveColFilters}
                  onClear={clearColFilters}
                />
              </tr>
            ) : null}
          </thead>
          <VirtualizedTableBody
            items={filteredEntries}
            columnCount={urineTableColumnCount}
            renderRow={(e) => {
              const compositeKey = e.compositeKey;
              const isSaved = savedSet.has(compositeKey);
              const isScanned = e.scanned === "Yes";
            
              const isCriticalReported = criticalReportedSet.has(compositeKey);
              const isPendingCritical = !!e.pendingCriticalParam;
              
              const isCriticalRed =
                isCriticalReported ||
                isPendingCritical ||
                (isScanned && !isSaved);
              
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
                    <select value={isScanned ? "Yes" : "No"} disabled={isSaved} onChange={(ev) => handleScan(e, ev.target.value)}>
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
                  <button
                    onClick={() => triggerCritical(e)}
                    disabled={
                      isCriticalReported ||
                      isPendingCritical ||
                      isSaved ||
                      !ready
                    }
                    className={`critical-btn ${
                      !isCriticalRed ? "critical-btn-green" : ""
                    }`}
                  >
                    {isCriticalReported
                      ? "Critical Reported"
                      : isPendingCritical
                      ? "Critical Pending"
                      : "Critical"}
                  </button>


                  </td>
                  <td>
                    <button className="save-btn" disabled={isSaved || saving || !ready} onClick={() => handleSave(e)}> Save </button>
                  </td>
                </tr>
              );
            }}
          />
        </table>
      </div>
      {criticalModalOpen && (
      <CriticalAlertModal
        open={criticalModalOpen}
        parameterInput={criticalParameterInput}
        setParameterInput={setCriticalParameterInput}
        reportedByInput={criticalReportedByInput}
        setReportedByInput={setCriticalReportedByInput}
        onCancel={() => {
          setCriticalModalOpen(false);
          setCriticalPatient(null);
        }}
        onSave={saveCriticalDetails}
        parameterLabel="Critical Parameters & Values"
        parameterAsTextarea
        parameterReadOnly
        parameterRows={10}
        actionsClassName="modal-actions"
      />
      )}

    </div>
  );
}