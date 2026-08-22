
import React, { useState, useMemo, Suspense, lazy, memo } from "react";
import "./BiochemistryMain.css";
import { db } from "../firebaseConfig.js";
import {
  updateDoc,
  doc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import biochemRouting from "../biochem_testRouting.json";

import {
  handleInventoryDeduction,
  getVitrosDeductibleTests
} from "../inventory/inventorymapping";

import { requireLogin } from "../auth/Authguard.js";
import UserMenu from "../auth/UserMenu";
import {
  getISTLocaleString,
} from "../shared/utils/dates.js";
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
import { EngComponent } from "../engineering/ui/EngComponent.jsx";
import {
  useVisitedTabs,
  StickyTabPanel,
} from "../shared/hooks/useVisitedTabs.jsx";

const HormonesMain = lazy(() => import("./HormonesMain.jsx"));
const DeptInventoryTab = lazy(() =>
  import("../inventory/DeptInventoryTab.jsx")
);
const InventoryAdjustmentTab = lazy(() =>
  import("../inventory/InventoryAdjustmentTab.jsx")
);

const CURRENT_DEPT = "Bio-Chemistry";

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

export default function BiochemistryMain() {
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

  const [activeTab, setActiveTab] = useState("biochem");
  const visitedTabs = useVisitedTabs(activeTab, "biochem");
  const [showColFilters, setShowColFilters] = useState(false);
  const [colFilters, setColFilters] = useState(EMPTY_COL_FILTERS);

  const {
    masterEntries,
    setMasterEntries,
    deptDocs: biochemDocs,
    savedSet,
    criticalReportedSet,
    criticalReady,
    masterError,
    listenStatus,
    retryListen,
  } = useMasterDeptSnapshots({
    deptCollection: "biochemistry_register",
    currentDept: CURRENT_DEPT,
    masterDeptKey: "Bio-Chemistry",
    dateFrom,
    dateTo,
    // Pause parent triad while Hormones / Inventory / Adjustment tabs own their listeners
    enabled: activeTab === "biochem",
  });
  
  const [criticalModalOpen, setCriticalModalOpen] = useState(false);
  const [criticalPatient, setCriticalPatient] = useState(null);

  const [criticalParameterInput, setCriticalParameterInput] = useState("");
  const [criticalReportedByInput, setCriticalReportedByInput] = useState("");
  const [criticalParams, setCriticalParams] = usePersistedObjectState(
    "biochem_pendingCritical",
    {}
  );

  const [localScans, setLocalScans] = usePersistedObjectState(
    "biochem_localScans",
    {}
  );

  const [localScanTimes, setLocalScanTimes] = usePersistedObjectState(
    "biochem_localScanTimes",
    {}
  ); 

  const biochemTests = biochemRouting?.MainAnalyzer?.tests || [];

  const patients = useMemo(() => {
    const filteredMaster = masterEntries.filter((entry) =>
      Array.isArray(entry.selectedTests) && entry.selectedTests.some((t) => biochemTests.includes(getTestName(t)))
    );

    return filteredMaster.map((entry) => {
      const regKey = compositeId(entry.regNo, entry.diagnosticNo);
      const saved = biochemDocs[regKey] || {};
      const localScan = localScans[regKey];
      const localScanTime =localScanTimes[regKey];
      const currentScanned = localScan ?? saved.scanned ?? "No";
      const isSaved = savedSet.has(regKey);
      const testsDisplay =
        entry.selectedTests
          ?.filter((t) => biochemTests.includes(getTestName(t)))
          .map((t) => getTestName(t))
          .join(", ") || "—";

      return {
        ...entry,
        ...saved,
        compositeKey: regKey,
        source: normalizeSource(entry.source || entry.category),
        scanned: currentScanned,
        scannedTime:localScanTime ??saved.scannedTime ??null,
        status: isSaved ? "saved" : currentScanned === "Yes" ? "scanned" : "pending",
        urgent: entry.urgent || false,
        id: entry.id,
        testsDisplay,
      };
    });
  }, [
    masterEntries,
    biochemDocs,
    localScans,
    localScanTimes,
    savedSet,
    biochemTests
  ]);

  const handleInputChange = async (id, field, value) => {
    setMasterEntries((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
    try { await updateDoc(doc(db, "master_register", id), { [field]: value }); } catch (err) { console.error(err); }
  };

  const handleScanToggle = async (patient, value) => {
    const regKey = patient.compositeKey;
    const nowIST = getISTLocaleString(); 

    setLocalScans((prev) => ({ ...prev, [regKey]: value }));

    setLocalScanTimes((prev) => ({
      ...prev,
      [regKey]: value === "Yes" ? nowIST : null,
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
      console.error("Failed to update scan status:", err);
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



  const getInventoryCategory = (category = "") => {
    const c = category.trim().toUpperCase();
  
    // GENERAL GROUP
    if (
      c === "GENERAL" ||
      c === "CAPF" ||
      c === "TPA"
    ) {
      return "GENERAL";
    }
  
    // RGHS GROUP
    if (c === "RGHS") {
      return "RGHS";
    }
  
    // EVERYTHING ELSE
    return "OTHER";
  };

  const handleSave = async (patient) => {
    try {
      const regKey = patient.compositeKey;
      const docRef = doc(db, "biochemistry_register", regKey);
      const relevantTests = patient.selectedTests?.filter((t) => biochemTests.includes(getTestName(t))).map((t) => getTestName(t));
      
      const rawLocalTime = localScanTimes[regKey];
      const scanTime = rawLocalTime ? Timestamp.fromDate(new Date(rawLocalTime)) : null;
      
      const pendingCritical = criticalParams[regKey];

      const isCritical =
        criticalReportedSet.has(regKey) || pendingCritical
          ? "Yes"
          : "No";

          if (pendingCritical) {
        const criticalId = `${regKey}_${CURRENT_DEPT}`;
        await setDoc(doc(db, "critical_alerts", criticalId), {
            name: patient.name || "",
            regNo: patient.regNo || "",
            reportedBy: sessionStorage.getItem("loggedUser") || "Unknown",
            diagnosticNo: patient.diagnosticNo || "—",
            age: patient.age || "",
            ageUnit: patient.ageUnit || "",
            gender: patient.gender || "-",
            doctor: patient.doctor || "Self",
            timePrinted: patient.timePrinted || null,
            timeCollected: patient.timeCollected || null,
            criticalParameter: pendingCritical.parameter,
            criticalReportedBy: pendingCritical.criticalReportedBy,
            flaggedAt: serverTimestamp(),
            status: "Pending",
            dept: CURRENT_DEPT,
            selectedTests: relevantTests || [],
            source: patient.source || "-",
            category: patient.category || "-",
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
        selectedTests: relevantTests || [],
        scanned: "Yes",
        scannedTime: scanTime || (patient.scannedTime || null),
        saved: "Yes",
        savedTime: serverTimestamp(), 
        savedBy: sessionStorage.getItem("loggedUser") || "Unknown",
        timePrinted: patient.timePrinted || null,
        timeCollected: patient.timeCollected || null,
        status: "saved",
        critical: isCritical 
      };

      await setDoc(docRef, payload, { merge: true });

      await updateDoc(
        doc(db, "report_details", regKey),
        {
          [`routineReportsScanned.${CURRENT_DEPT}`]: true,
          [`routineReportsSaved.${CURRENT_DEPT}`]: true,
        }
      );

      // TRIGGER INVENTORY DEDUCTION
      
      if (relevantTests && relevantTests.length > 0) {

        const deductionCategory =
          getInventoryCategory(patient.category);
      
        const deductibleTests =
          await getVitrosDeductibleTests(
            relevantTests
          );
      
        await handleInventoryDeduction(
          deductibleTests,
          deductionCategory
        );
      }
       
      
      setLocalScans(prev => { 
        const n = {...prev}; delete n[regKey]; 
        return n; 
      });
      setLocalScanTimes(prev => {
        const n = {...prev}; delete n[regKey];
        return n;
      });
      setCriticalParams((prev) => {
        const n = { ...prev };
        delete n[regKey];
        return n;
      });
      alert(`Saved entry for ${payload.name} ${isCritical === "Yes" ? "(Critical Alert Sent)" : ""}`);
    } catch (err) { 
        console.error(err); 
        alert("Save failed.");
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

  const onRemarkChange = useStableCallback((id, value) => {
    handleInputChange(id, "result", value);
  });
  const onScan = useStableCallback((patient, value) => {
    handleScanToggle(patient, value);
  });
  const onCritical = useStableCallback((patient) => {
    triggerCritical(patient);
  });
  const onSave = useStableCallback((patient) => {
    handleSave(patient);
  });

  return (
    <EngComponent name="Biochemistry.jsx" type="Page" parent={null}>
    <div className="biochem-register-container">
      <EngComponent name="Toolbar" type="Layout" parent="Biochemistry.jsx">
      <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "10px"
  }}
>
  <div className="tab-container">
    <button
      className={`tab-btn ${activeTab === "biochem" ? "active" : ""}`}
      onClick={() => setActiveTab("biochem")}
    >
      Biochemistry
    </button>

    <button
      className={`tab-btn ${activeTab === "hormones" ? "active" : ""}`}
      onClick={() => setActiveTab("hormones")}
    >
      Hormones
    </button>

    <button
      className={`tab-btn ${activeTab === "inventory" ? "active" : ""}`}
      onClick={() => setActiveTab("inventory")}
    >
      Inventory
    </button>

          <button
        className={`tab-btn ${activeTab === "adjustment" ? "active" : ""}`}
        onClick={() => setActiveTab("adjustment")}
      >
        Inventory Adjustment
      </button>






  </div>

  <UserMenu />
</div>
      </EngComponent>

      {visitedTabs.biochem && (
      <StickyTabPanel active={activeTab === "biochem"}>
      <div>        
              <h2 className="dept-header">
          Biochemistry Department — Main Analyzer
        </h2>
          <EngComponent name="Filter Bar" type="Layout" parent="Biochemistry.jsx">
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
          </EngComponent>

          <ListenStatusBanner
            listenStatus={listenStatus}
            masterError={masterError}
            onRetry={retryListen}
          />
          <EngComponent
            name="Patient Register Table"
            type="Tables"
            parent="Biochemistry.jsx"
          >
          {!criticalReady ? (
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 8 }}>
              Loading critical flags…
            </p>
          ) : null}
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
                  <th>Source</th>
                  <th>Age</th>
                  <th>Gender</th>
                  <th>Category</th>
                  <th>Selected Tests</th>
                  <th>Remark</th>
                  <th>Scanned</th>
                  <th>Status</th>
                  <th>Saved By</th>
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
                        placeholder="e.g. OPD"
                        value={colFilters.source}
                        onChange={(e) => setColFilter("source", e.target.value)}
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
                        placeholder="e.g. lft"
                        value={colFilters.tests}
                        onChange={(e) => setColFilter("tests", e.target.value)}
                      />
                    </th>
                    <th className="col-filter-cell col-filter-locked" />
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
                columnCount={14}
                renderRow={(p) => (
                  <BiochemRegisterRow
                    key={p.compositeKey}
                    patient={p}
                    isCriticalReported={criticalReportedSet.has(p.compositeKey)}
                    isPendingCritical={!!criticalParams[p.compositeKey]}
                    onRemarkChange={onRemarkChange}
                    onScan={onScan}
                    onCritical={onCritical}
                    onSave={onSave}
                  />
                )}
              />
            </table>
          </div>
          </EngComponent>
      </div>
      </StickyTabPanel>
      )}

      {visitedTabs.hormones && (
        <StickyTabPanel active={activeTab === "hormones"}>
        <EngComponent name="Hormones Tab" type="Page" parent="Biochemistry.jsx">
        <Suspense fallback={<p>Loading Hormones…</p>}>
          <HormonesMain enabled={activeTab === "hormones"} />
        </Suspense>
        </EngComponent>
        </StickyTabPanel>
      )}

      {visitedTabs.inventory && (
        <StickyTabPanel active={activeTab === "inventory"}>
        <EngComponent name="Inventory Tab" type="Tables" parent="Biochemistry.jsx">
        <Suspense fallback={<p>Loading Inventory…</p>}>
          <DeptInventoryTab department="Biochemistry" machineType="Main" />
        </Suspense>
        </EngComponent>
        </StickyTabPanel>
      )}

      {visitedTabs.adjustment && (
        <StickyTabPanel active={activeTab === "adjustment"}>
        <EngComponent
          name="InventoryAdjustmentTab"
          type="Tables"
          parent="Biochemistry.jsx"
          moduleId="InventoryAdjustmentTab"
        >
        <Suspense fallback={<p>Loading Adjustment…</p>}>
          <InventoryAdjustmentTab />
        </Suspense>
        </EngComponent>
        </StickyTabPanel>
      )}

      
      {criticalModalOpen && (
      <EngComponent name="Critical Alerts" type="Dialogs" parent="Biochemistry.jsx">
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
        parameterPlaceholder="e.g. K+: 7.2"
      />
      </EngComponent>
      )}

    </div>
    </EngComponent>
  );
}

const BiochemRegisterRow = memo(function BiochemRegisterRow({
  patient: p,
  isCriticalReported,
  isPendingCritical,
  onRemarkChange,
  onScan,
  onCritical,
  onSave,
}) {
  const isSaved = p.status === "saved";
  const isScanned = p.scanned === "Yes";
  const rowClass = `${isSaved ? "row-green" : isScanned ? "row-yellow" : "row-normal"}`.trim();
  const isCriticalRed =
    isCriticalReported || isPendingCritical || (isScanned && !isSaved);

  return (
    <tr className={rowClass}>
      <td style={p.urgent ? { borderLeft: "4px solid red" } : {}}>
        {p.regNo || "—"}
      </td>
      <td>{p.diagnosticNo || "—"}</td>
      <td>{p.name || "—"}</td>
      <td>{p.source || "—"}</td>
      <td>{p.age || "—"}</td>
      <td>{p.gender || "-"}</td>
      <td>{p.category || "—"}</td>
      <td>{p.testsDisplay || "—"}</td>
      <td>
        <input
          type="text"
          value={p.result || ""}
          disabled={!isScanned || isSaved}
          onChange={(e) => onRemarkChange(p.id, e.target.value)}
          placeholder="Remark"
        />
      </td>
      <td>
        <select
          value={isScanned ? "Yes" : "No"}
          disabled={isSaved}
          onChange={(e) => onScan(p, e.target.value)}
        >
          <option value="No">No</option>
          <option value="Yes">Yes</option>
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
            CRITICAL {isCriticalReported ? "REPORTED" : "PENDING SAVE"}
          </span>
        )}
      </td>
      <td style={{ fontWeight: "600", color: "#1e3a8a" }}>
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
          disabled={isSaved || !isScanned}
          onClick={() => onSave(p)}
        >
          💾 Save
        </button>
      </td>
    </tr>
  );
}, arePatientRowEqual(DEPT_REGISTER_ROW_FIELDS));
