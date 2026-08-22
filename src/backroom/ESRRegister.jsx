
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
import ListenStatusBanner from "../shared/components/ListenStatusBanner.jsx";
import CriticalAlertModal from "../shared/components/CriticalAlertModal.jsx";
import ColFilterToggle, {
  ColFilterInput,
  ColFilterLocked,
  ColFilterClearCell,
} from "../shared/components/ColFilterToggle.jsx";



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
  
`
;

export default function ESRRegister() {
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
    deptDocs: esrDocs,
    criticalReportedSet,
    listenStatus,
    masterError,
    retryListen,
  } = useMasterDeptSnapshots({
    deptCollection: "esr_register",
    currentDept: CURRENT_DEPT,
    masterDeptKey: "ESR",
    dateFrom,
    dateTo,
    getDeptDocKey: (_data, docId) => docId,
    criticalBelongsToDept: (data, dept) =>
      String(data.dept).toLowerCase() === String(dept).toLowerCase(),
    getCriticalKey: (data) => compositeId(data.regNo, data.diagnosticNo),
  });
  const [saving, setSaving] = useState(false);

  // 🛡️ INTERNAL BUFFER: Prevents UI reset during slow syncs
  const [localResults, setLocalResults] = usePersistedObjectState("esr_localResults", {});

  // UPDATE: Load localScans from LocalStorage to survive refresh
  const [localScans, setLocalScans] = usePersistedObjectState("esr_localScans", {});
  
  // FINAL FIX: Persist localScanTimes to survive refresh
  const [localScanTimes, setLocalScanTimes] = usePersistedObjectState("esr_localScanTimes", {});

const [criticalModalOpen, setCriticalModalOpen] = useState(false);
const [criticalPatient, setCriticalPatient] = useState(null);

const [criticalParameterInput, setCriticalParameterInput] = useState("");
const [criticalReportedByInput, setCriticalReportedByInput] = useState("");

const [pendingCritical, setPendingCritical] = usePersistedObjectState("esr_pendingCritical", {});

  const testsForRegister = routing.ESRRegister || ["ESR (ERYTHROCYTE SEDIMENTATION RATE, BLOOD)"];

  const ensureFirestoreTimestamp = (val) => {
    if (!val) return null;
    if (val instanceof Timestamp) return val;
    if (val instanceof Date) return Timestamp.fromDate(val);
    if (typeof val === "object" && val.seconds) return new Timestamp(val.seconds, val.nanoseconds);
    const d = new Date(val);
    return isNaN(d) ? null : Timestamp.fromDate(d);
  };

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
        pendingCritText: pendingCritical[compositeKey]?.parameter
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
  
      return next;
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

  const isEntryReadyToSave = (e) => (e.scanned === "Yes") && e.startTime && e.endTime && e.result && Number(e.duration) > 0;

  const triggerCritical = (entry) => {
    const defaultText = `ESR: ${entry.result} mm/hr (Duration: ${entry.duration} mins)`;
  
    setCriticalPatient(entry);
    setCriticalParameterInput(defaultText);
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
  
    setPendingCritical((prev) => {
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

      const pendingCriticalData = pendingCritical[compositeKey];

      const critParam = pendingCriticalData?.parameter;
      const critReportedBy = pendingCriticalData?.criticalReportedBy;
      const isCritical =
        critParam || criticalReportedSet.has(compositeKey)
      ? "Yes"
      : "No";
        const cleanTests = getCleanTests(entry);

      if (critParam) {
        await setDoc(doc(db, "critical_alerts", `${compositeKey}_${CURRENT_DEPT}`), {
          name: entry.name || "",
          regNo: entry.regNo,
          diagnosticNo: entry.diagnosticNo || "—",
          age: entry.age || "", ageUnit: entry.ageUnit || "", gender: entry.gender || "-",
          category: entry.category || "-", source: entry.source || "-", doctor: entry.doctor || "Self",
          reportedBy: sessionStorage.getItem("loggedUser") || "Unknown",
          criticalParameter: critParam,
          criticalReportedBy: critReportedBy,
          flaggedAt: serverTimestamp(),
          timePrinted: ensureFirestoreTimestamp(entry.timePrinted),
          timeCollected: ensureFirestoreTimestamp(entry.timeCollected),
          status: "Pending", dept: CURRENT_DEPT, selectedTests: cleanTests 
        });
      }

     

      const rawLocalTime = localScanTimes[compositeKey];
      const scanTime = rawLocalTime ? new Date(rawLocalTime) : null;

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
      
        selectedTests: cleanTests,
      
        startTime: entry.startTime || "",
        endTime: entry.endTime || "",
        duration: entry.duration || "",
        result: entry.result || "",
      
        scanned: "Yes",
        scannedTime: scanTime
          ? Timestamp.fromDate(scanTime)
          : (entry.scannedTime || null),
      
        saved: "Yes",
        savedTime: serverTimestamp(),
        savedBy: sessionStorage.getItem("loggedUser") || "Unknown",
      
        timePrinted: ensureFirestoreTimestamp(entry.timePrinted),
        timeCollected: ensureFirestoreTimestamp(entry.timeCollected),
      
        status: "saved",
        critical: isCritical
      };

      await setDoc(doc(db, "esr_register", compositeKey), payload, { merge: true });

      await updateDoc(
        doc(db, "report_details", compositeKey),
        {
          [`routineReportsScanned.${CURRENT_DEPT}`]: true,
          [`routineReportsSaved.${CURRENT_DEPT}`]: true,
        }
      );
      
      setLocalResults((prev) => {
        const n = { ...prev };
        delete n[compositeKey];
      
        return n;
      });
      
      setLocalScans(prev => { 
        const n = { ...prev }; 
        delete n[compositeKey];
        return n; 
      });

      setLocalScanTimes(prev => {
        const n = { ...prev };
        delete n[compositeKey];
        return n;
      });

      setPendingCritical((prev) => {
        const next = { ...prev };
        delete next[compositeKey];
      
        return next;
      });
      
      alert(`Saved ESR for ${entry.name}`);
    } catch (err) { alert("Error saving."); } finally { setSaving(false); }
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
      getTests: (p) => getCleanTests(p).join(" "),
    });
  }, [mergedEntries, regSearch, sourceFilter, dateFrom, dateTo, colFilters]);

  return (
    <div className="register-section">
      <style>{overflowStyles}</style>
      <h3>🩸 ESR Register</h3>
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
      <ListenStatusBanner
        listenStatus={listenStatus}
        masterError={masterError}
        onRetry={retryListen}
        rowCount={masterEntries.length}
      />

      <div className="table-scroll-container">
        <table className="backroom-table">
          <thead>
            <tr>
              <th className="sticky-col">Reg No</th>
              <th className="sticky-col">Diag No</th>
              <th className="sticky-col">
                <ColFilterToggle
                  label="Patient Name"
                  open={showColFilters}
                  active={hasActiveColFilters}
                  onToggle={() => setShowColFilters((v) => !v)}
                />
              </th>
              <th>Age</th><th>Source</th><th>Selected Tests</th>
              <th>Start Time</th><th>End Time</th><th>Duration</th><th>Result</th>
              <th>Scanned</th>
              <th>Status</th>
              <th>Saved By</th>
              <th>Critical</th>
              <th>Action</th>
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
                  value={colFilters.source}
                  onChange={(v) => setColFilter("source", v)}
                  placeholder="e.g. OPD"
                />
                <ColFilterInput
                  value={colFilters.tests}
                  onChange={(v) => setColFilter("tests", v)}
                  placeholder="e.g. esr"
                />
                <ColFilterLocked />
                <ColFilterLocked />
                <ColFilterLocked />
                <ColFilterLocked />
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
            columnCount={15}
            renderRow={(e) => {
             const saved = e.status === "saved";
             const scanned = e.scanned === "Yes";
             
             const isCriticalReported = criticalReportedSet.has(e.compositeKey);
             const isPendingCritical = !!e.pendingCritText;
             
             const isCriticalRed =
               isCriticalReported ||
               isPendingCritical ||
               (scanned && !saved);
             
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
                    <select value={scanned ? "Yes" : "No"} disabled={saved} onChange={(ev) => handleScan(e, ev.target.value)}>
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
                  <td><button className="save-btn" disabled={saving || saved || !ready} onClick={() => handleSave(e)}>Save</button></td>
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
        parameterLabel="Critical Parameter & Value"
        parameterAsTextarea
        parameterReadOnly
        parameterRows={3}
        actionsClassName="modal-actions"
      />
      )}

    </div>
  );
}