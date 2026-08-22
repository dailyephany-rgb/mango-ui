
import React, { useState, useMemo, memo } from "react";
import "./BiochemistryMain.css";
import { db } from "../firebaseConfig.js";
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";


import hormoneRouting from "../hormone_testRouting.json";
// NEW: Import inventory components and service
import DeptInventoryTab from "../inventory/DeptInventoryTab.jsx";
import {
  handleInventoryDeduction,
  getVitrosDeductibleTests
} from "../inventory/inventorymapping";
import { normalizeSource } from "../shared/utils/source.js";
import { compositeId } from "../shared/utils/ids.js";
import { getTestName } from "../shared/utils/tests.js";
import { usePersistedObjectState } from "../shared/hooks/usePersistedObjectState.js";
import { useRegisterFilters } from "../shared/hooks/useRegisterFilters.js";
import { useMasterDeptSnapshots } from "../shared/hooks/useMasterDeptSnapshots.js";
import { useStableCallback } from "../shared/hooks/useStableCallback.js";
import RegisterFilterBar from "../shared/components/RegisterFilterBar.jsx";
import ListenStatusBanner from "../shared/components/ListenStatusBanner.jsx";
import CriticalAlertModal from "../shared/components/CriticalAlertModal.jsx";
import VirtualizedTableBody from "../shared/components/VirtualizedTableBody.jsx";
import { filterAndSortRegisterPatients } from "../shared/utils/filterRegisterPatients.js";
import {
  arePatientRowEqual,
  DEPT_REGISTER_ROW_FIELDS,
} from "../shared/utils/arePatientRowEqual.js";



// Define the unique key for this department
const CURRENT_DEPT = "Hormones";

const EMPTY_COL_FILTERS = {
  regNo: "",
  diagnosticNo: "",
  name: "",
  source: "",
  age: "",
  gender: "",
  category: "",
  tests: "",
  status: "",
  savedBy: "",
};

function matchesColFilters(patient, colFilters) {
  const includes = (value, needle) => {
    if (!needle.trim()) return true;
    return String(value || "")
      .toLowerCase()
      .includes(needle.trim().toLowerCase());
  };

  if (!includes(patient.regNo, colFilters.regNo)) return false;
  if (!includes(patient.diagnosticNo, colFilters.diagnosticNo)) return false;
  if (!includes(patient.name, colFilters.name)) return false;
  if (!includes(patient.source, colFilters.source)) return false;
  if (!includes(patient.age, colFilters.age)) return false;
  if (!includes(patient.gender, colFilters.gender)) return false;
  if (!includes(patient.category, colFilters.category)) return false;

  if (colFilters.tests.trim()) {
    const needle = colFilters.tests.trim().toLowerCase();
    const haystack = String(patient.testsDisplay || "").toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  if (colFilters.status.trim()) {
    const needle = colFilters.status.trim().toLowerCase();
    const label = String(patient.status || "").toLowerCase();
    if (!label.includes(needle)) return false;
  }

  if (!includes(patient.savedBy, colFilters.savedBy)) return false;
  return true;
}

export default function HormonesMain({ enabled = true }) {
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
  const [colFilters, setColFilters] = useState(EMPTY_COL_FILTERS);

  const {
    masterEntries,
    deptDocs,
    savedSet,
    criticalReportedSet,
    listenStatus,
    masterError,
    retryListen,
  } = useMasterDeptSnapshots({
    deptCollection: "hormones_main",
    currentDept: CURRENT_DEPT,
    masterDeptKey: "Hormones",
    dateFrom,
    dateTo,
    enabled,
    isSavedDoc: (data) =>
      data.status === "saved" || data.saved === "Yes",
  });
  
  // NEW: State to toggle between Register and Inventory view
  

const [criticalModalOpen, setCriticalModalOpen] = useState(false);
const [criticalPatient, setCriticalPatient] = useState(null);

const [criticalParameterInput, setCriticalParameterInput] = useState("");
const [criticalReportedByInput, setCriticalReportedByInput] = useState("");

const [criticalParams, setCriticalParams] = usePersistedObjectState(
  "hormones_pendingCritical",
  {}
);

  // UPDATE: Persistent LocalStorage for Scans and Scan Times
  const [localScans, setLocalScans] = usePersistedObjectState(
    "hormones_localScans",
    {}
  );

  const [localScanTimes, setLocalScanTimes] = usePersistedObjectState(
    "hormones_localScanTimes",
    {}
  ); 

  const hormoneTests = hormoneRouting.MainAnalyzer?.tests || hormoneRouting?.tests || [];

  const patients = useMemo(() => {
    const filtered = masterEntries.filter(
      (entry) =>
        Array.isArray(entry.selectedTests) &&
        entry.selectedTests.some((t) => hormoneTests.includes(getTestName(t)))
    );

    return filtered.map((entry) => {
      // FIX: Ensure patient identifier matches the composite ID logic
      const compositeKey = compositeId(entry.regNo, entry.diagnosticNo);
      const savedData = deptDocs[compositeKey] || {};
      const localScan = localScans[compositeKey];

      const isSaved = savedSet.has(compositeKey);
      const currentScanned = localScan ?? savedData.scanned ?? "No";
      const testsDisplay =
        entry.selectedTests
          ?.filter((t) => hormoneTests.includes(getTestName(t)))
          .map((t) => getTestName(t))
          .join(", ") || "—";

      return {
        ...entry,
        ...savedData,
        compositeKey: compositeKey,
        source: normalizeSource(entry.source || entry.category),
        scanned: currentScanned,
        status: isSaved ? "saved" : currentScanned === "Yes" ? "scanned" : "pending",
        urgent: entry.urgent || false,
        timePrinted: savedData.timePrinted || entry.timePrinted || null,
        timeCollected: savedData.timeCollected || entry.timeCollected || null,
        testsDisplay,
      };
    });
  }, [masterEntries, deptDocs, localScans, savedSet, hormoneTests]);

  // UPDATE: Writes both Scan status and ISO Time string to LocalStorage using composite key
  const handleScan = async (patient, value) => {
    const regKey = patient.compositeKey;
    const now = new Date().toISOString();
  
    setLocalScans((prev) => ({ ...prev, [regKey]: value }));
  
    setLocalScanTimes((prev) => ({
      ...prev,
      [regKey]: value === "Yes" ? now : null,
    }));
  
    try {
      
      await updateDoc(
        doc(db, "report_details", regKey),
        {
          // Safeguard: if Save succeeds, Scan must also have succeeded.
          [`routineReportsScanned.${CURRENT_DEPT}`]: true,
          [`routineReportsSaved.${CURRENT_DEPT}`]: true,
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
    setCriticalPatient(entry);
    setCriticalParameterInput("");
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
  
    const regKey = criticalPatient.compositeKey;
  
    setCriticalParams((prev) => ({
      ...prev,
      [regKey]: {
        parameter: criticalParameterInput.trim(),
        criticalReportedBy: criticalReportedByInput.trim(),
      },
    }));
  
    setCriticalModalOpen(false);
    setCriticalPatient(null);
  
    alert("Critical details captured. Click Save to send to the Critical Dashboard.");
  };

  const handleSave = async (patient) => {
    const regKey = patient.compositeKey;

    try {
      const ref = doc(db, "hormones_main", regKey);
      
      // FINAL FIX: Retrieve time from persistent local state
      const rawLocalTime = localScanTimes[regKey];
      const scanTime = rawLocalTime ? new Date(rawLocalTime) : null;
      
      const pendingCritical = criticalParams[regKey];

      const isCritical =
        criticalReportedSet.has(regKey) || pendingCritical
          ? "Yes"
          : "No";
      const relevantTests = (patient.selectedTests || [])
        .map((t) => getTestName(t))
        .filter((testName) => hormoneTests.includes(testName));

        if (pendingCritical) {
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
            reportedBy: sessionStorage.getItem("loggedUser") || "Unknown",
            category: patient.category || "-",
            timePrinted: patient.timePrinted || null,
            timeCollected: patient.timeCollected || null,
            criticalParameter: pendingCritical.parameter,
            criticalReportedBy: pendingCritical.criticalReportedBy,
            flaggedAt: serverTimestamp(),
            status: "Pending",
            dept: CURRENT_DEPT,
            selectedTests: relevantTests,
        });
      }

      const payload = {
        regNo: patient.regNo,
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
        savedBy: sessionStorage.getItem("loggedUser") || "Unknown",
        timePrinted: patient.timePrinted || null,
        timeCollected: patient.timeCollected || null,
        status: "saved",
        critical: isCritical
      };

      await setDoc(ref, payload, { merge: true });

      await updateDoc(
        doc(db, "report_details", regKey),
        {
          [`routineReportsScanned.${CURRENT_DEPT}`]: true,
          [`routineReportsSaved.${CURRENT_DEPT}`]: true,
        }
      );

      // NEW: TRIGGER INVENTORY DEDUCTION


      if (relevantTests && relevantTests.length > 0) {

        const deductibleTests =
          await getVitrosDeductibleTests(
            relevantTests
          );
      
        console.log(
          "[Hormones] Original Tests:",
          relevantTests
        );
      
        console.log(
          "[Hormones] Vitros Deductible Tests:",
          deductibleTests
        );
      
        await handleInventoryDeduction(
          deductibleTests,
          "Hormones",
          "Main"
        );
      }
      // UPDATE: Cleanup both local storage items on successful save
      setLocalScans((prev) => {
        const next = { ...prev };
        delete next[regKey];
        return next;
      });

      setLocalScanTimes((prev) => {
        const next = { ...prev };
        delete next[regKey];
        return next;
      });

      setCriticalParams(prev => { const n = {...prev}; delete n[regKey]; return n; });

      alert(`Saved Hormone entry for ${patient.name}`);
    } catch (error) {
      console.error("Error saving hormone entry:", error);
      alert("Error saving data.");
    }
  };

  const setColFilter = (key, value) => {
    setColFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearColFilters = () => setColFilters(EMPTY_COL_FILTERS);

  const hasActiveColFilters = Object.values(colFilters).some((v) =>
    String(v || "").trim()
  );

  const filteredPatients = useMemo(() => {
    const base = filterAndSortRegisterPatients(patients, {
      regSearch,
      sourceFilter,
      dateFrom,
      dateTo,
      getDiag: (p) => p.diagnosticNo || "",
    });
    if (!hasActiveColFilters) return base;
    return base.filter((p) => matchesColFilters(p, colFilters));
  }, [
    patients,
    regSearch,
    sourceFilter,
    dateFrom,
    dateTo,
    colFilters,
    hasActiveColFilters,
  ]);

  const onScan = useStableCallback((patient, value) => {
    handleScan(patient, value);
  });
  const onCritical = useStableCallback((patient) => {
    triggerCritical(patient);
  });
  const onSave = useStableCallback((patient) => {
    handleSave(patient);
  });

  return (
    <div className="biochem-register-container">
      {/* Tab Switcher for Register vs Inventory */}
     
        <>
          <h2 className="dept-header">Hormones Department — Main Analyzer</h2>

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
          />

          <div className="table-wrapper">
            <table className="dept-table">
              <thead>
                <tr>
                  <th>Reg No</th>
                  <th>Diag No</th>
                  <th>
                    <span className="th-with-filter">
                      Patient Name
                      <button
                        type="button"
                        className={`col-filter-toggle ${
                          showColFilters ? "open" : ""
                        } ${hasActiveColFilters ? "active" : ""}`}
                        aria-label="Toggle column filters"
                        aria-expanded={showColFilters}
                        title="Column filters"
                        onClick={() => setShowColFilters((v) => !v)}
                      >
                        ▼
                      </button>
                    </span>
                  </th>
                  <th>Age</th>
                  <th>Gender</th>
                  <th>Source</th>
                  <th>Category</th>
                  <th>Selected Tests</th>
                  <th>Scanned</th>
                  <th>Status</th>
                  <th style={{ minWidth: "130px" }}>Saved By</th>
                  <th>Critical</th>
                  <th>Action</th>
                </tr>
                {showColFilters ? (
                  <tr className="col-filter-row">
                    <th className="col-filter-cell">
                      <input
                        type="text"
                        placeholder="Filter reg…"
                        value={colFilters.regNo}
                        onChange={(e) => setColFilter("regNo", e.target.value)}
                      />
                    </th>
                    <th className="col-filter-cell">
                      <input
                        type="text"
                        placeholder="Filter diag…"
                        value={colFilters.diagnosticNo}
                        onChange={(e) =>
                          setColFilter("diagnosticNo", e.target.value)
                        }
                      />
                    </th>
                    <th className="col-filter-cell">
                      <input
                        type="text"
                        placeholder="Filter name…"
                        value={colFilters.name}
                        onChange={(e) => setColFilter("name", e.target.value)}
                      />
                    </th>
                    <th className="col-filter-cell">
                      <input
                        type="text"
                        placeholder="Filter age…"
                        value={colFilters.age}
                        onChange={(e) => setColFilter("age", e.target.value)}
                      />
                    </th>
                    <th className="col-filter-cell">
                      <input
                        type="text"
                        placeholder="M / F"
                        value={colFilters.gender}
                        onChange={(e) => setColFilter("gender", e.target.value)}
                      />
                    </th>
                    <th className="col-filter-cell">
                      <input
                        type="text"
                        placeholder="e.g. OPD"
                        value={colFilters.source}
                        onChange={(e) => setColFilter("source", e.target.value)}
                      />
                    </th>
                    <th className="col-filter-cell">
                      <input
                        type="text"
                        placeholder="e.g. General"
                        value={colFilters.category}
                        onChange={(e) =>
                          setColFilter("category", e.target.value)
                        }
                      />
                    </th>
                    <th className="col-filter-cell">
                      <input
                        type="text"
                        placeholder="e.g. tsh"
                        value={colFilters.tests}
                        onChange={(e) => setColFilter("tests", e.target.value)}
                      />
                    </th>
                    <th className="col-filter-cell col-filter-locked" />
                    <th className="col-filter-cell">
                      <input
                        type="text"
                        placeholder="saved / scanned / pending"
                        value={colFilters.status}
                        onChange={(e) => setColFilter("status", e.target.value)}
                      />
                    </th>
                    <th className="col-filter-cell">
                      <input
                        type="text"
                        placeholder="Filter saved by…"
                        value={colFilters.savedBy}
                        onChange={(e) =>
                          setColFilter("savedBy", e.target.value)
                        }
                      />
                    </th>
                    <th className="col-filter-cell col-filter-locked" />
                    <th className="col-filter-cell col-filter-actions">
                      {hasActiveColFilters ? (
                        <button
                          type="button"
                          className="col-filter-clear"
                          onClick={clearColFilters}
                        >
                          Clear
                        </button>
                      ) : null}
                    </th>
                  </tr>
                ) : null}
              </thead>
              <VirtualizedTableBody
                items={filteredPatients}
                columnCount={13}
                renderRow={(p) => (
                  <HormonesRegisterRow
                    key={p.compositeKey}
                    patient={p}
                    isCriticalReported={criticalReportedSet.has(p.compositeKey)}
                    isPendingCritical={!!criticalParams[p.compositeKey]}
                    onScan={onScan}
                    onCritical={onCritical}
                    onSave={onSave}
                  />
                )}
              />
            </table>
          </div>
        </>
        
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
        parameterPlaceholder="e.g. TSH: 0.01"
        actionsClassName="modal-actions"
      />
      )}
    
        </div>
      );
    }

const HormonesRegisterRow = memo(function HormonesRegisterRow({
  patient: p,
  isCriticalReported,
  isPendingCritical,
  onScan,
  onCritical,
  onSave,
}) {
  const isSaved = p.status === "saved";
  const isScanned = p.scanned === "Yes";
  const isCriticalRed =
    isCriticalReported || isPendingCritical || (isScanned && !isSaved);

  return (
    <tr
      className={
        isSaved ? "row-green" : isScanned ? "row-yellow" : "row-normal"
      }
    >
      <td style={p.urgent ? { borderLeft: "4px solid red" } : {}}>
        {p.regNo || "—"}
      </td>
      <td>{p.diagnosticNo || "—"}</td>
      <td>{p.name || "—"}</td>
      <td>{p.age || "—"}</td>
      <td>{p.gender || "-"}</td>
      <td>{p.source || "—"}</td>
      <td>{p.category || "—"}</td>
      <td>{p.testsDisplay || "—"}</td>
      <td>
        <select
          value={isScanned ? "Yes" : "No"}
          onChange={(e) => onScan(p, e.target.value)}
          disabled={isSaved}
        >
          <option value="No">No</option>
          <option value="Yes">Yes</option>
        </select>
      </td>
      <td style={{ textAlign: "center" }}>
        {isCriticalReported && (
          <span style={{ color: "red", fontWeight: "bold", fontSize: "10px" }}>
            CRITICAL {isSaved ? "REPORTED" : "PENDING SAVE"}
          </span>
        )}
      </td>
      <td style={{ minWidth: "130px", fontWeight: "600", color: "#1e3a8a" }}>
        {p.savedBy || "—"}
      </td>
      <td>
        <button
          onClick={() => onCritical(p)}
          disabled={
            isCriticalReported || isPendingCritical || isSaved || !isScanned
          }
          className={`critical-btn ${!isCriticalRed ? "critical-btn-green" : ""}`}
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
          onClick={() => onSave(p)}
          disabled={isSaved || !isScanned}
        >
          💾 Save
        </button>
      </td>
    </tr>
  );
}, arePatientRowEqual(DEPT_REGISTER_ROW_FIELDS));
