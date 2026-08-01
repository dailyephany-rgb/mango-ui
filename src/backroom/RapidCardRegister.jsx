
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
    min-width: 2800px;
    border-collapse: separate;
    border-spacing: 0;
  }

    .backroom-table th,
  .backroom-table td {
    min-width: 110px;
  }

  .backroom-table thead th[colspan="3"] {
    min-width: 330px;
  }

  .backroom-table thead th[colspan="2"] {
    min-width: 220px;
  }

  .backroom-table thead tr:nth-child(2) th {
    font-size: 12px;
    padding: 6px;
    position: sticky;
    top: 41px;
    z-index: 11;
    background-color: #eff6ff;
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
  
  
`;

export default function RapidCardRegister() {
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
    deptDocs: rapidDocs,
    criticalReportedSet,
  } = useMasterDeptSnapshots({
    deptCollection: "rapid_card_register",
    currentDept: CURRENT_DEPT,
    masterDeptKey: "RapidCard",
    dateFrom,
    dateTo,
    getDeptDocKey: (_data, docId) => docId,
    criticalBelongsToDept: (data, dept) =>
      String(data.dept).toLowerCase() === String(dept).toLowerCase(),
    getCriticalKey: (data) => compositeId(data.regNo, data.diagnosticNo),
  });
  const [saving, setSaving] = useState(false);

  // 🛡️ INTERNAL BUFFER: Shields results from cloud sync wipes on slow internet
  const [localResults, setLocalResults] = usePersistedObjectState("rapid_localResults", {});

  // UPDATE: Load localScans from LocalStorage to survive refresh
  const [localScans, setLocalScans] = usePersistedObjectState("rapid_localScans", {});

  // FINAL FIX: Persist localScanTimes to survive refresh
  const [localScanTimes, setLocalScanTimes] = usePersistedObjectState("rapid_localScanTimes", {});

const [criticalModalOpen, setCriticalModalOpen] = useState(false);
const [criticalPatient, setCriticalPatient] = useState(null);

const [criticalParameterInput, setCriticalParameterInput] = useState("");
const [criticalReportedByInput, setCriticalReportedByInput] = useState("");

const [pendingCriticalMap, setPendingCriticalMap] = usePersistedObjectState("rapid_pendingCritical", {});

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
    const filtered = masterEntries.filter((entry) => getRapidSelectedTests(entry.selectedTests || []).length > 0);

    return filtered.map((entry) => {
      const regNo = String(entry.regNo || entry.id);
      const diagnosticNo = entry.diagnosticNo || entry.accNo || "-";
      const compositeKey = `${regNo}_${diagnosticNo}`;


      const saved = rapidDocs[compositeKey] || {};
      const localScan = localScans[compositeKey];
      const localScanTime = localScanTimes[compositeKey];
      const typing = localResults[compositeKey] || {};

      return {
        ...entry,
        ...saved,
        regNo,
        diagnosticNo,
        compositeKey,
        source: normalizeSource(entry.source || entry.category),
        results: {
          malaria: "Pending",
          tropt: "Pending",
      
          dengue_igg: "Pending",
          dengue_igm: "Pending",
          dengue_ns1: "Pending",
      
          typhoid_igg: "Pending",
          typhoid_igm: "Pending",
      
          chikungunya_igg: "Pending",
          chikungunya_igm: "Pending",
          chikungunya_ns1: "Pending",
      
          stool_occult: "Pending",
          fluid_occult: "Pending",
          sputum_occult: "Pending",
          vomit_occult: "Pending",
      
          ...(entry.results || {}),
          ...(saved.results || {}),
          ...typing
      },
        scanned: localScan ?? saved.scanned ?? "No",
        scannedTime: localScanTime ?? saved.scannedTime ??  null,
        urgent: entry.urgent || false, 
        status: (saved.saved === "Yes" || saved.status === "saved") ? "saved" : localScan === "Yes" ? "scanned" : saved.status || "pending",
        pendingCriticalParam: pendingCriticalMap[compositeKey]
      };
    });
    }, [
      masterEntries,
      rapidDocs,
      localScans,
      localScanTimes,
      pendingCriticalMap,
      localResults,
    ]);

  const mapSelectedTestsToResultKeys = (entry) => {
    const keys = new Set();
    const rapidOnly = getRapidSelectedTests(entry.selectedTests || []);
    rapidOnly.forEach((t) => {
      const name = typeof t === "string" ? t : t?.test || "";
      const n = normalize(name);
      if (n.includes("malaria")) {
        keys.add("malaria");
      }
      
      if (n.includes("trop")) {
        keys.add("tropt");
      }
      
      if (n.includes("dengue")) {
        keys.add("dengue_igg");
        keys.add("dengue_igm");
        keys.add("dengue_ns1");
      }
      
      if (n.includes("typhoid")) {
        keys.add("typhoid_igg");
        keys.add("typhoid_igm");
      }
      
      if (n.includes("chikung")) {
        keys.add("chikungunya_igg");
        keys.add("chikungunya_igm");
        keys.add("chikungunya_ns1");
      }

      if (n.includes("stool") && n.includes("occult")) {
        keys.add("stool_occult");
      }
      
      if (n.includes("fluid") && n.includes("occult")) {
        keys.add("fluid_occult");
      }
      
      if (n.includes("sputum") && n.includes("occult")) {
        keys.add("sputum_occult");
      }
      
      if (n.includes("vomit") && n.includes("occult")) {
        keys.add("vomit_occult");
      }
    });
    return [...keys];
  };

  const areRequiredFieldsFilled = (entry) =>
    mapSelectedTestsToResultKeys(entry).every((k) => entry.results?.[k] && entry.results[k] !== "Pending");

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
    const relevantKeys = mapSelectedTestsToResultKeys(entry);
  
    const suggested = relevantKeys
  .filter(
    (k) => entry.results[k] && entry.results[k] !== "Pending"
  )
  .map(
    (k) => `${k.toUpperCase()}: ${entry.results[k]}`
  )
  .join("\n");
  
    setCriticalPatient(entry);
    setCriticalParameterInput(suggested.trim());
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
      
      const pendingCriticalData = entry.pendingCriticalParam;

      const pendingCriticalParam = pendingCriticalData?.parameter;
      const pendingCriticalReportedBy = pendingCriticalData?.criticalReportedBy;

      const hasPendingCritical = !!pendingCriticalParam;

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
      
        selectedTests: rapidOnlyTests,
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
        critical:
          (criticalReportedSet.has(compositeKey) || hasPendingCritical)
            ? "Yes"
            : "No"
      };

     

      await setDoc(doc(db, "rapid_card_register", compositeKey), payload, { merge: true });

      await updateDoc(
        doc(db, "report_details", compositeKey),
        {
          // Safeguard: if Save succeeds, Scan must also have succeeded.
          [`routineReportsScanned.${CURRENT_DEPT}`]: true,
          [`routineReportsSaved.${CURRENT_DEPT}`]: true,
        }
      );

      try {
        await handleInventoryDeduction(rapidOnlyTests);
      } catch (inventoryErr) {
        console.error("Inventory deduction failed:", inventoryErr);
      }
      


      if (hasPendingCritical) {
        await setDoc(doc(db, "critical_alerts", `${compositeKey}_${CURRENT_DEPT}`), {
          name: entry.name || "", regNo: entry.regNo, diagnosticNo: entry.diagnosticNo || "—",
          age: entry.age || "", ageUnit: entry.ageUnit || "", gender: entry.gender || "-",
          source: entry.source || "-", doctor: entry.doctor || "Self",
          reportedBy: sessionStorage.getItem("loggedUser") || "Unknown",
          criticalParameter: pendingCriticalParam,
          criticalReportedBy: pendingCriticalReportedBy,
          flaggedAt: serverTimestamp(),
          status: "Pending", dept: CURRENT_DEPT, selectedTests: rapidOnlyTests
        });
      }

      setLocalResults((prev) => {
        const n = { ...prev };
        delete n[compositeKey];
      
        return n;
      });
      
      // UPDATE: Cleanup LocalStorage after save
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
  }, [mergedEntries, regSearch, sourceFilter, dateFrom, dateTo]);




  const renderResultDropdown = (entry, field) => (
    <select
      value={entry.results[field] || "Pending"}
      disabled={
        entry.scanned !== "Yes" ||
        entry.status === "saved"
      }
      onChange={(ev) =>
        handleChange(
          entry.compositeKey,
          field,
          ev.target.value
        )
      }
    >
      <option>Pending</option>
      <option>Positive</option>
      <option>Weak Positive</option>
      <option>Negative</option>
    </select>
  );

  console.log("criticalModalOpen =", criticalModalOpen);
  return (
    <>
      <div className="register-section">
      <style>{overflowStyles}</style>
      <h3>💉 Rapid Card Register</h3>
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
              <th className="sticky-col" rowSpan={2}>Reg No</th>
              <th className="sticky-col" rowSpan={2}>Diag No</th>
              <th className="sticky-col" rowSpan={2}>Name</th>
              <th rowSpan={2}>Age</th>
              <th rowSpan={2}>Source</th>
              <th rowSpan={2}>Tests</th>

              <th rowSpan={2}>Malaria Antigen</th>
              <th rowSpan={2}>Trop-T</th>

              <th colSpan={3}>Dengue</th>
              <th colSpan={2}>Typhoid</th>
              <th colSpan={3}>Chikungunya</th>

              <th rowSpan={2}>Stool OB</th>
              <th rowSpan={2}>Fluid OB</th>
              <th rowSpan={2}>Sputum OB</th>
              <th rowSpan={2}>Vomit OB</th>

              <th rowSpan={2}>Scanned</th>
              <th rowSpan={2}>Status</th>
              <th rowSpan={2}>Saved By</th>
              <th rowSpan={2}>Critical</th>
              <th rowSpan={2}>Action</th>
            </tr>

            <tr>
              <th>IGG</th>
              <th>IGM</th>
              <th>NS1</th>

              <th>IGG</th>
              <th>IGM</th>

              <th>IGG</th>
              <th>IGM</th>
              <th>NS1</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => {
             const scanned = e.scanned === "Yes";
             const saved = e.status === "saved";
             
             const isCriticalReported = criticalReportedSet.has(e.compositeKey);
             const isPendingCritical = !!e.pendingCriticalParam;
             
             const isCriticalRed =
               isCriticalReported ||
               isPendingCritical ||
               (scanned && !saved);
             
             const missingReq = !areRequiredFieldsFilled(e);

              const activeKeys = mapSelectedTestsToResultKeys(e);
              return (
                <tr key={e.compositeKey} className={saved ? "row-green" : scanned ? "row-yellow" : "row-normal"}>
                  <td className="sticky-col" style={e.urgent ? { borderLeft: "4px solid red" } : {}}>{e.regNo}</td>
                  <td className="sticky-col" style={{ color: "#475569" }}>{e.diagnosticNo}</td>
                  <td className="sticky-col">{e.name}</td>
                  <td>{e.age} {e.ageUnit}</td>
                  <td>{e.source}</td>
                  <td style={{fontSize:'11px'}}>{getRapidSelectedTests(e.selectedTests || []).map(t => (typeof t === "object" ? t.test : t)).join(", ")}</td>
                  
                  {/* Malaria */}
              <td>
                {activeKeys.includes("malaria")
                  ? renderResultDropdown(e, "malaria")
                  : "—"}
              </td>

              {/* Trop-T */}
              <td>
                {activeKeys.includes("tropt")
                  ? renderResultDropdown(e, "tropt")
                  : "—"}
              </td>

              {/* Dengue */}
              <td>
                {activeKeys.includes("dengue_igg")
                  ? renderResultDropdown(e, "dengue_igg")
                  : "—"}
              </td>





              <td>
                {activeKeys.includes("dengue_igm")
                  ? renderResultDropdown(e, "dengue_igm")
                  : "—"}
              </td>

              <td>
                {activeKeys.includes("dengue_ns1")
                  ? renderResultDropdown(e, "dengue_ns1")
                  : "—"}
              </td>

              {/* Typhoid */}
              <td>
                {activeKeys.includes("typhoid_igg")
                  ? renderResultDropdown(e, "typhoid_igg")
                  : "—"}
              </td>

              <td>
                {activeKeys.includes("typhoid_igm")
                  ? renderResultDropdown(e, "typhoid_igm")
                  : "—"}
              </td>

              {/* Chikungunya */}
              <td>
                {activeKeys.includes("chikungunya_igg")
                  ? renderResultDropdown(e, "chikungunya_igg")
                  : "—"}
              </td>

              <td>
                {activeKeys.includes("chikungunya_igm")
                  ? renderResultDropdown(e, "chikungunya_igm")
                  : "—"}
              </td>

              <td>
                {activeKeys.includes("chikungunya_ns1")
                  ? renderResultDropdown(e, "chikungunya_ns1")
                  : "—"}
              </td>
                              {/* Stool Occult Blood */}
                <td>
                  {activeKeys.includes("stool_occult")
                    ? renderResultDropdown(e, "stool_occult")
                    : "—"}
                </td>

                {/* Fluid Occult Blood */}
                <td>
                  {activeKeys.includes("fluid_occult")
                    ? renderResultDropdown(e, "fluid_occult")
                    : "—"}
                </td>

                {/* Sputum Occult Blood */}
                <td>
                  {activeKeys.includes("sputum_occult")
                    ? renderResultDropdown(e, "sputum_occult")
                    : "—"}
                </td>

                {/* Vomit Occult Blood */}
                <td>
                  {activeKeys.includes("vomit_occult")
                    ? renderResultDropdown(e, "vomit_occult")
                    : "—"}
                </td>


                  <td>
                    <select value={e.scanned} disabled={saved} onChange={(ev) => handleScan(e, ev.target.value)}>
                      <option value="No">No</option><option value="Yes">Yes</option>
                    </select>
                  </td>
                  
                  <td style={{ textAlign: "center" }}>
                  {(isCriticalReported || isPendingCritical) && (
                    <span
                      style={{
                        color: "red",
                        fontWeight: "bold",
                        fontSize: "10px",
                      }}
                    >
                      {isCriticalReported
                        ? "CRITICAL REPORTED"
                        : "CRITICAL PENDING SAVE"}
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
                missingReq
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
              disabled={saving || saved || !scanned || missingReq}
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

</>
);
}