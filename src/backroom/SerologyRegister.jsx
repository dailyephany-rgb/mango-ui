
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
import {
  parseEntryDate,
  toLocalDateString,
} from "../shared/utils/dates.js";
import { normalizeSource } from "../shared/utils/source.js";
import { compositeId } from "../shared/utils/ids.js";
import { usePersistedObjectState } from "../shared/hooks/usePersistedObjectState.js";
import { useRegisterFilters } from "../shared/hooks/useRegisterFilters.js";
import { useMasterDeptSnapshots } from "../shared/hooks/useMasterDeptSnapshots.js";
import RegisterFilterBar from "../shared/components/RegisterFilterBar.jsx";
import CriticalAlertModal from "../shared/components/CriticalAlertModal.jsx";


import { handleInventoryDeduction } from "../inventory/inventorymapping";

// 🚨 Define the unique key for this department
const CURRENT_DEPT = "Serology";

// CSS to allow horizontal scrolling and trigger the sticky logic from Backroom.css
const tableFixStyles = `
.table-scroll-container {
  width: 100%;
  overflow-x: auto;
  overflow-y: auto;
  max-height: 80vh;
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
`;

export default function SerologyRegister() {
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

  const {
    masterEntries,
    deptDocs: serologyDocs,
    criticalReportedSet,
  } = useMasterDeptSnapshots({
    deptCollection: "serology_register",
    currentDept: CURRENT_DEPT,
    masterDeptKey: "Serology",
    dateFrom,
    dateTo,
    getDeptDocKey: (_data, docId) => docId,
    criticalBelongsToDept: (data, dept) =>
      String(data.dept).toLowerCase() === String(dept).toLowerCase(),
    getCriticalKey: (data) => compositeId(data.regNo, data.diagnosticNo),
  });
  const [saving, setSaving] = useState(false);

  // 🛡️ INTERNAL BUFFER: Prevents slow internet from resetting your typed results
  const [localResults, setLocalResults] = usePersistedObjectState("serology_localResults", {});

  // UPDATE: Load localScans from LocalStorage to survive refresh
  const [localScans, setLocalScans] = usePersistedObjectState("serology_localScans", {});

  // FINAL FIX: Persist localScanTimes to survive refresh
  const [localScanTimes, setLocalScanTimes] = usePersistedObjectState("serology_localScanTimes", {});

const [criticalModalOpen, setCriticalModalOpen] = useState(false);
const [criticalPatient, setCriticalPatient] = useState(null);

const [criticalParameterInput, setCriticalParameterInput] = useState("");
const [criticalReportedByInput, setCriticalReportedByInput] = useState("");

const [pendingCriticalMap, setPendingCriticalMap] = usePersistedObjectState("serology_pendingCritical", {});

const testsForRegister = routing.SerologyRegister || [
  "HBSAG CARD",
  "HCV CARD",
  "HIV CARD",
  "VDRL (SERUM)"
];

  const normalize = (s = "") =>
    s.toLowerCase().replace(/[\s,._()-]+/g, "").trim();

  const getSerologySelectedTests = (selectedTests = []) => {
    return selectedTests.filter((testObj) => {
      const name = typeof testObj === "string" ? testObj : testObj?.test || "";
      const n = normalize(name);

      const overlapMarkers = ["hbsag", "hcv", "hiv"];
      const isOverlap = overlapMarkers.some(marker => n.includes(marker));
      if (isOverlap && !n.includes("card")) return false;

      return testsForRegister.some((ref) =>
        normalize(ref).includes(n) || n.includes(normalize(ref))
      );
    });
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
    const filtered = masterEntries.filter((entry) => getSerologySelectedTests(entry.selectedTests || []).length > 0);

    return filtered.map((entry) => {
      const regNo = String(entry.regNo || entry.id);
      const diagnosticNo = entry.diagnosticNo || entry.accNo || "-";
      const compositeKey = `${regNo}_${diagnosticNo}`;

      const saved = serologyDocs[compositeKey] || {};
      const localScan = localScans[compositeKey];
      const typing = localResults[compositeKey] || {}; 
      const localScanTime = localScanTimes[compositeKey];
      return {
        ...entry,
        ...saved,
        regNo,
        diagnosticNo,
        compositeKey,
        source: normalizeSource(entry.source || entry.category),
        results: {
          hbsag: "-",
          hcv: "-",
          hiv: "-",
          vdrl: "-",
          ...(entry.results || {}),
          ...(saved.results || {}),
          ...typing 
        },
        scanned: localScan ?? saved.scanned ?? "No",
        scannedTime: localScanTime ?? saved.scannedTime ?? null,
        urgent: entry.urgent || false,
        status: (saved.saved === "Yes" || saved.status === "saved") ? "saved" : localScan === "Yes" ? "scanned" : saved.status || "pending",
        pendingCriticalParam: pendingCriticalMap[compositeKey]
      };
    });
  },[
    masterEntries,
    serologyDocs,
    localScans,
    localScanTimes,
    pendingCriticalMap,
    localResults
  ]);

  const requiredKeys = (entry) => {
    const keys = new Set();
    const selected = getSerologySelectedTests(entry.selectedTests || []);
    selected.forEach((t) => {
      const n = normalize(typeof t === "object" ? t.test : t);
      if (n.includes("hbsag")) keys.add("hbsag");
      if (n.includes("hcv")) keys.add("hcv");
      if (n.includes("hiv")) keys.add("hiv"); 
      if (n.includes("vdrl")) keys.add("vdrl"); 
      
    });
    return [...keys];
  };

  const areRequiredFieldsFilled = (entry) => {
    return requiredKeys(entry).every((k) => entry.results?.[k] && entry.results[k] !== "-" && entry.results[k] !== "Pending");
  };

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

  // UPDATE: Writes both Scan status and Time to LocalStorage using compositeKey
  
  const handleScan = async (entry, value) => {
    const now = new Date().toISOString();
    const regKey = entry.compositeKey;
  
    setLocalScans((prev) => {
      const updated = { ...prev, [regKey]: value };
  
      return updated;
    });
  
    setLocalScanTimes((prev) => {
      const updatedTimes = {
        ...prev,
        [regKey]: value === "Yes" ? now : null,
      };
  
      return updatedTimes;
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
    const relevantKeys = requiredKeys(entry);
  
    const suggested = relevantKeys
      .filter(
        (k) =>
          entry.results[k] &&
          entry.results[k] !== "-" &&
          entry.results[k] !== "Pending"
      )
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
  
    setPendingCriticalMap((prev) => {
      const updated = {
        ...prev,
        [criticalPatient.compositeKey]: {
          parameter: criticalParameterInput.trim(),
          criticalReportedBy: criticalReportedByInput.trim(),
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
    try {
      setSaving(true);
      const compositeKey = entry.compositeKey;
      
      const rawLocalTime = localScanTimes[compositeKey];
      const scanTime = rawLocalTime ? new Date(rawLocalTime) : (entry.scannedTime?.toDate ? entry.scannedTime.toDate() : (entry.scannedTime ? new Date(entry.scannedTime) : null));

      if (entry.scanned !== "Yes") {
        alert("Please scan before saving.");
        return;
      }
      if (!areRequiredFieldsFilled(entry)) {
        alert("Please fill all required serology result fields.");
        return;
      }

      const cleanedResults = Object.fromEntries(
        Object.entries(entry.results || {}).filter(
          ([_, val]) => val !== "-" && val !== "Pending" && val !== "" && val !== "pendingcriticalparam"
        )
      );

      const simpleTests = getSerologySelectedTests(entry.selectedTests || []).map(t => 
        typeof t === "object" ? t.test : t
      );

      const pendingCriticalData = entry.pendingCriticalParam;

      const pendingCriticalParam = pendingCriticalData?.parameter;
      const pendingCriticalReportedBy = pendingCriticalData?.criticalReportedBy;
      
      const hasPendingCritical = !!pendingCriticalParam;
      const isCritical = (criticalReportedSet.has(compositeKey) || hasPendingCritical) ? "Yes" : "No";

      const payload = {
        regNo: entry.regNo,
        compositeKey: compositeKey,
        diagnosticNo: entry.diagnosticNo || "—",
      
        name: entry.name || "",
        age: entry.age || "",
        ageUnit: entry.ageUnit || "",
        gender: entry.gender || "-",
      
        source: entry.source || "-",
        category: entry.category || "-",
      
        selectedTests: simpleTests,
        results: cleanedResults,
        timePrinted: ensureFirestoreTimestamp(entry.timePrinted),
        timeCollected: ensureFirestoreTimestamp(entry.timeCollected),
      
        scanned: "Yes",
        scannedTime: scanTime
          ? Timestamp.fromDate(new Date(scanTime))
          : null,
      
        saved: "Yes",
        savedTime: serverTimestamp(),
        savedBy: sessionStorage.getItem("loggedUser") || "Unknown",
      
        status: "saved",
        critical: isCritical
      };

      
      await setDoc(doc(db, "serology_register", compositeKey), payload, { merge: true });

     
      await updateDoc(
        doc(db, "report_details", compositeKey),
        {
          [`routineReportsScanned.${CURRENT_DEPT}`]: true,
          [`routineReportsSaved.${CURRENT_DEPT}`]: true,
        }
      );

      try {
        await handleInventoryDeduction(simpleTests);
      } catch (inventoryErr) {
        console.error("Inventory deduction failed:", inventoryErr);
      }

      if (hasPendingCritical) {
        await setDoc(doc(db, "critical_alerts", `${compositeKey}_${CURRENT_DEPT}`), {
          name: entry.name || "",
          regNo: entry.regNo,
          diagnosticNo: entry.diagnosticNo || "—",
          age: entry.age || "",
          ageUnit: entry.ageUnit || "",
          gender: entry.gender || "-",
          category: entry.category || "-",
          source: entry.source || "-",
          doctor: entry.doctor || "Self",
          reportedBy: sessionStorage.getItem("loggedUser") || "Unknown",
          timePrinted: entry.timePrinted || null,
          timeCollected: entry.timeCollected || null,
          criticalParameter: pendingCriticalParam,
          criticalReportedBy: pendingCriticalReportedBy,
          flaggedAt: serverTimestamp(),
          status: "Pending",
          dept: CURRENT_DEPT,
          selectedTests: simpleTests
        });
      }

      setLocalResults((prev) => {
        const n = { ...prev };
        delete n[compositeKey];
      
        return n;
      });
      
      // UPDATE: Cleanup LocalStorage after successful save
      setLocalScans(prev => { 
        const n = {...prev}; 
        delete n[compositeKey];
        return n; 
      });

      setLocalScanTimes(prev => {
        const n = {...prev};
        delete n[compositeKey];
        return n;
      });

      setPendingCriticalMap((prev) => {
        const n = { ...prev };
        delete n[compositeKey];
      
        return n;
      });
      
      alert(`✅ Saved Serology entry for ${entry.name} ${hasPendingCritical ? "(Critical Alert Sent)" : ""}`);
    } catch (e) {
      console.error(e);
      alert("Error saving Serology entry.");
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
      
      const d = parseEntryDate(e);
      if (d) {
        const entryDateStr = toLocalDateString(d);
        if (dateFrom && entryDateStr < dateFrom) return false;
        if (dateTo && entryDateStr > dateTo) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      const dateA = parseEntryDate(a);
      const dateB = parseEntryDate(b);
      return (dateA || 0) - (dateB || 0);
    });

  const hasTest = (entry, searchKey) => {
    const selected = getSerologySelectedTests(entry.selectedTests || []);
    return selected.some((t) => {
      const name = typeof t === "object" ? t.test : t;
      return normalize(name).includes(normalize(searchKey));
    });
  };

  return (
    <div className="register-section">
      <style>{tableFixStyles}</style>
      <h3>🧬 Serology Register</h3>
      
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

      <div className="table-scroll-container">
        <table className="backroom-table">
          <thead>
            <tr>
              <th className="sticky-col">Reg No</th>
              <th className="sticky-col">Diag No</th>
              <th className="sticky-col">Patient Name</th>
              <th>Age</th>
              <th>Gender</th>
              <th>Source</th>
              <th>Selected Tests</th>
              <th>HBsAg</th>
              <th>HCV Serum</th>
              <th>HIV</th>
              <th>VDRL</th>
              <th>Scanned</th>
              <th>Status</th>
              <th>Saved By</th>
              <th>Critical</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => {
              const compositeKey = e.compositeKey;
              const saved = e.status === "saved";
              const scanned = e.scanned === "Yes";
              const isCriticalReported = criticalReportedSet.has(compositeKey);
              const isPendingCritical = !!e.pendingCriticalParam;
              const isCriticalRed =
              isCriticalReported ||
              isPendingCritical ||
              (scanned && !saved);
              const missingRequired = !areRequiredFieldsFilled(e);

              return (
                <tr key={compositeKey} className={saved ? "row-green" : scanned ? "row-yellow" : "row-normal"}>
                  <td className="sticky-col" style={e.urgent ? { borderLeft: "4px solid red" } : {}}>{e.regNo}</td>
                  <td className="sticky-col" style={{ color: "#475569" }}>{e.diagnosticNo}</td>
                  <td className="sticky-col">{e.name}</td>
                  <td>{e.age} {e.ageUnit}</td>
                  <td>{e.gender}</td>
                  <td>{e.source}</td>
                  <td>{getSerologySelectedTests(e.selectedTests || []).map(t => (typeof t === "object" ? t.test : t)).join(", ") || "—"}</td>
                  {[
                    { key: "hbsag", label: "hbsag" },
                    { key: "hcv", label: "hcv" },
                    { key: "hiv", label: "hiv" },
                    { key: "vdrl", label: "vdrl" }
                    ].map(({ key, label }) => (
                    <td key={key}>
                      {hasTest(e, label) ? (
                        <select value={e.results[key] || "Pending"} disabled={!scanned || saved} onChange={(ev) => handleChange(compositeKey, key, ev.target.value)}>
                          <option>Pending</option>
                          <option>Positive</option>
                          <option>Weak Positive</option>
                          <option>Negative</option>
                        </select>
                      ) : ("—")}
                    </td>
                  ))}
                  <td>
                    <select value={scanned ? "Yes" : "No"} disabled={saved} onChange={(ev) => handleScan(e, ev.target.value)}>
                      
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
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
                        saved ||
                        !scanned ||
                        missingRequired
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
                    <button 
                      className="save-btn" 
                      disabled={saving || saved || !scanned || missingRequired} 
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
        parameterRows={8}
        actionsClassName="modal-actions"
      />
      )}

    </div>
  );
}