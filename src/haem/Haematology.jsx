
import React, { useState, useMemo, lazy, Suspense, memo } from "react";
import "./Haematology.css";
import "../shared/styles/colFilters.css";
import { db } from "../firebaseConfig.js";
import {
  doc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
// Import Inventory Deduction Logic
import { handleInventoryDeduction } from "../inventory/inventorymapping";
import UserMenu from "../auth/UserMenu";
import VirtualizedTableBody from "../shared/components/VirtualizedTableBody.jsx";
import { formatTimeCollected } from "../shared/utils/dates.js";
import { filterAndSortRegisterPatients } from "../shared/utils/filterRegisterPatients.js";
import {
  EMPTY_DEPT_COL_FILTERS,
  applyDeptColFilters,
  hasActiveDeptColFilters,
} from "../shared/utils/deptColFilters.js";
import { normalizeSource } from "../shared/utils/source.js";
import { compositeId, safeKey } from "../shared/utils/ids.js";
import { patchReportDetailsRoutineMaps } from "../shared/utils/routineStageFlags.js";
import {
  extractTestName,
  entryHasCanonicalTest,
} from "../shared/utils/tests.js";
import { usePersistedObjectState } from "../shared/hooks/usePersistedObjectState.js";
import { useRegisterFilters } from "../shared/hooks/useRegisterFilters.js";
import { useMasterDeptSnapshots } from "../shared/hooks/useMasterDeptSnapshots.js";
import { useStableCallback } from "../shared/hooks/useStableCallback.js";
import RegisterFilterBar from "../shared/components/RegisterFilterBar.jsx";
import ListenStatusBanner from "../shared/components/ListenStatusBanner.jsx";
import CriticalAlertModal from "../shared/components/CriticalAlertModal.jsx";
import ColFilterToggle, {
  ColFilterInput,
  ColFilterSelect,
  ColFilterLocked,
  ColFilterClearCell,
} from "../shared/components/ColFilterToggle.jsx";
import {
  arePatientRowEqual,
  DEPT_REGISTER_ROW_FIELDS,
} from "../shared/utils/arePatientRowEqual.js";
import { EngComponent } from "../engineering/ui/EngComponent.jsx";
import {
  useVisitedTabs,
  StickyTabPanel,
} from "../shared/hooks/useVisitedTabs.jsx";

const HaemInventoryTab = lazy(() => import("../inventory/HaemInventoryTab.jsx"));

// 🚨 Define the unique key for this department
const CURRENT_DEPT = "Haematology";

export default function Haematology() {
  const [activeTab, setActiveTab] = useState("register");
  const visitedTabs = useVisitedTabs(activeTab, "register");
  const [showColFilters, setShowColFilters] = useState(false);
  const [colFilters, setColFilters] = useState(EMPTY_DEPT_COL_FILTERS);

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
    deptDocs: haemDocs,
    savedSet,
    criticalReportedSet,
    criticalReady,
    masterError,
    listenStatus,
    retryListen,
  } = useMasterDeptSnapshots({
    deptCollection: "haematology_register",
    currentDept: CURRENT_DEPT,
    masterDeptKey: "Haematology",
    dateFrom,
    dateTo,
    enabled: activeTab === "register",
    getDeptDocKey: (_data, docId) => docId,
    criticalBelongsToDept: (data, dept) =>
      String(data.dept).toLowerCase() === String(dept).toLowerCase(),
    getCriticalKey: (data) =>
      safeKey(compositeId(data.regNo, data.diagnosticNo)),
  });

const [criticalModalOpen, setCriticalModalOpen] = useState(false);
const [criticalPatient, setCriticalPatient] = useState(null);

const [criticalParameterInput, setCriticalParameterInput] = useState("");
const [criticalReportedByInput, setCriticalReportedByInput] = useState("");

const [criticalParams, setCriticalParams] = usePersistedObjectState(
  "haematology_pendingCritical",
  {}
);

  const [localScans, setLocalScans] = usePersistedObjectState(
    "haematology_localScans",
    {}
  );
  
  const [localScanTimes, setLocalScanTimes] = usePersistedObjectState(
    "haematology_localScanTimes",
    {}
  );

  const [machineSelections, setMachineSelections] = usePersistedObjectState(
    "haematology_machineSelections",
    {}
  );

  const HAEM_TESTS_CANON = ["haemogram", "hb haemoglobin", "lamellar body count","HEMATOCRIT","RED BLOOD CELL COUNT","TOTAL LEUCOCYTIC COUNT","DIFFERENTIAL LEUCOCYTIC COUNT", "PLATELET COUNT", "RED BLOOD CELL INDICES"];

  const getEntryCanonicalTests = (entry) => {
    if (entry._cachedCanonical) return entry._cachedCanonical;
  
    const result = HAEM_TESTS_CANON.filter((c) =>
      entryHasCanonicalTest(entry, c)
    );
  
    entry._cachedCanonical = result;
    return result;
  };

  const is3PartRequired = (age, ageUnit) => {
    const numAge = Number(age);
    if (isNaN(numAge) || numAge <= 0) return false;
    const unit = String(ageUnit || "years").toLowerCase();
    if (/day|month/.test(unit)) return true;
    if (unit.includes("years") && numAge < 1) return true;
    return false;
  };

  // useMemo combines master and haem register data instantly without async loops
  const patients = useMemo(() => {
    const haemEntries = masterEntries.filter((entry) => {
      const tests = entry.selectedTests || [];
  
      return tests.some((t) => {
        const name = extractTestName(t);
        return HAEM_TESTS_CANON.some((c) => name.includes(c));
      });
    });
  
    return haemEntries.map((entry) => {
      const canonicalTests = getEntryCanonicalTests(entry);
      const regNo = entry.regNo || entry.regno || entry.id;
      const diagnosticNo = entry.diagnosticNo || "-";
      const compositeKey = safeKey(compositeId(regNo, diagnosticNo));
      const savedData = haemDocs[compositeKey] || {};
  
      const currentScanned =
        localScans[compositeKey] ?? savedData.scanned ?? "No";
        const localScanTime = localScanTimes[compositeKey];
      const isSaved = savedSet.has(compositeKey);
      const currentMachine =
      savedData.machine ??
      machineSelections[compositeKey] ??
      "5-part";

  
      return {
        ...entry,
        ...savedData,
        regNo: String(regNo),
        compositeKey,
        accessionNo: diagnosticNo,
        canonicalTests,
        testsDisplay: canonicalTests.length
          ? canonicalTests.map((s) => s.toUpperCase()).join(", ")
          : "—",
        hasHaemogram: canonicalTests.some((t) => t.includes("haemogram")),
        hasHb: canonicalTests.some((t) => t.includes("hb haemoglobin")),
        hasLbc: canonicalTests.some((t) => t.includes("lamellar body count")),
        source: normalizeSource(entry.source || entry.category),
        scanned: currentScanned,
        scannedTime: localScanTime ??savedData.scannedTime ?? null,
        machine: currentMachine,
        status: isSaved
          ? "saved"
          : currentScanned === "Yes"
          ? "scanned"
          : "pending",
        urgent: entry.urgent || false,
      };
    });
  }, [
    masterEntries,
    haemDocs,
    localScans,
    localScanTimes,
    machineSelections,
    savedSet
  ]);
      
  const handleScan = async (patient, value) => {
    const now = new Date().toISOString();
    const regKey = patient.compositeKey;
  
    setLocalScans((prev) => ({ ...prev, [regKey]: value }));
  
    setLocalScanTimes((prev) => ({
      ...prev,
      [regKey]: value === "Yes" ? now : null,
    }));
  
    try {
      await patchReportDetailsRoutineMaps(db, regKey, CURRENT_DEPT, {
        scanned: value === "Yes",
      });
    } catch (err) {
      console.error(
        "Failed to update scan status:",
        err
      );
    }
  };


  const handleMachineSelection = (compositeKey, machine) => {
    setMachineSelections((prev) => ({
      ...prev,
      [compositeKey]: machine,
    }));
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
  
    alert(
      "Critical details captured. Click Save to send to the Critical Dashboard."
    );
  };

  const handleSave = async (compositeKey) => {
    try {
      const patient = patients.find((p) => p.compositeKey === compositeKey);
      if (!patient) return;
      if (patient.scanned !== "Yes") return alert("Please scan before saving.");

      const pendingCritical = criticalParams[compositeKey];

      const isCritical =
        criticalReportedSet.has(compositeKey) || pendingCritical
          ? "Yes"
          : "No";
      const canonicalTests = patient.canonicalTests;
      // --- 1. FIRE-AND-FORGET INVENTORY (Background Task) ---
      
      const selectedMachine = patient.machine || "5-part";

        const machineType =
          selectedMachine === "3-part"
            ? "_three_part"
            : "_five_part";

        const testsToDeduct =
          canonicalTests.map(
            (t) => `${t}${machineType}`
          );

        handleInventoryDeduction(
          testsToDeduct,
          "GENERAL"
        ).catch((e) =>
          console.error(
            "Inventory error:",
            e
          )
        );

      // 2. Critical Alert Save
      if (pendingCritical) {
        const criticalId = safeKey(`${compositeKey}_${CURRENT_DEPT}`);
        await setDoc(doc(db, "critical_alerts", criticalId), {
            name: patient.name || "",
            regNo: patient.regNo || "",
            diagnosticNo: patient.diagnosticNo || patient.accessionNo || "—",
            age: patient.age || "",
            ageUnit: patient.ageUnit || "",
            gender: patient.gender || "-",
            doctor: patient.doctor || "Self",
            category: patient.category || "-",
            source: patient.source || "-",
            reportedBy:  sessionStorage.getItem("loggedUser") || "Unknown",
            timePrinted: patient.timePrinted || null,
            timeCollected: patient.timeCollected || null,
            criticalParameter: pendingCritical.parameter,
            criticalReportedBy: pendingCritical.criticalReportedBy,
            flaggedAt: serverTimestamp(),
            status: "Pending",
            dept: CURRENT_DEPT,
            selectedTests: canonicalTests,
        });
      }
      
      const rawLocalTime = localScanTimes[compositeKey];
      const scanTime = rawLocalTime ? new Date(rawLocalTime) : null;

      // 3. Main Data Save
      await setDoc(
        doc(db, "haematology_register", compositeKey),
        {
          regNo: patient.regNo,
          compositeKey: compositeKey,
          diagnosticNo: patient.diagnosticNo || patient.accessionNo || "—",
          name: patient.name || "",
          age: patient.age || "",
          ageUnit: patient.ageUnit || "",
          gender: patient.gender || "-",
          source: patient.source || "-",
          category: patient.category || "-",
          selectedTests: canonicalTests,
          machine: selectedMachine,
          scanned: "Yes",
          scannedTime: scanTime ? Timestamp.fromDate(scanTime) : (patient.scannedTime || null),
          saved: "Yes",
          savedTime: serverTimestamp(),
          savedBy: sessionStorage.getItem("loggedUser") || "Unknown",
          timePrinted: patient.timePrinted || null,
          timeCollected: patient.timeCollected || null,
          status: "saved",
          critical: isCritical
        },
        { merge: true }
      );

      await patchReportDetailsRoutineMaps(db, compositeKey, CURRENT_DEPT, {
        scanned: true,
        saved: true,
      });
      
      setLocalScans((prev) => {
        const updated = { ...prev }; delete updated[compositeKey];
        return updated;
      });
      setLocalScanTimes((prev) => {
        const updated = { ...prev }; delete updated[compositeKey];
        return updated;
      });

      setCriticalParams((prev) => {
        const n = { ...prev };
        delete n[compositeKey];
        return n;
      });
      
      setMachineSelections((prev) => {
        const updated = { ...prev };
        delete updated[compositeKey];
        return updated;
      });
      
      alert(`Saved ${patient.name || patient.regNo} successfully!`);
      
      } catch (err) {
        console.error("🔥 Save Error:", err);
        alert(`Error saving: ${err.message}`);
      }  
  };

  const setColFilter = (key, value) => {
    setColFilters((prev) => ({ ...prev, [key]: value }));
  };
  const clearColFilters = () => setColFilters(EMPTY_DEPT_COL_FILTERS);
  const hasActiveColFilters = hasActiveDeptColFilters(colFilters);

  const filteredPatients = useMemo(() => {
    const base = filterAndSortRegisterPatients(patients, {
      regSearch,
      sourceFilter,
      dateFrom,
      dateTo,
      getDiag: (p) => p.diagnosticNo || p.accessionNo || "",
    });
    return applyDeptColFilters(base, colFilters);
  }, [patients, regSearch, sourceFilter, dateFrom, dateTo, colFilters]);

  const onScan = useStableCallback((patient, value) => {
    handleScan(patient, value);
  });
  const onMachine = useStableCallback((compositeKey, value) => {
    handleMachineSelection(compositeKey, value);
  });
  const onCritical = useStableCallback((patient) => {
    triggerCritical(patient);
  });
  const onSave = useStableCallback((compositeKey) => {
    handleSave(compositeKey);
  });

  return (
    <EngComponent name="Haematology.jsx" type="Page" parent={null}>
    <div className="haem-container">

      
<div
  className="header"
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  }}
>
  <EngComponent name="Toolbar" type="Layout" parent="Haematology.jsx">
  <div>
    <h2>🩸 Haematology Department</h2>

    <div className="tabs">
  <button
    className={activeTab === "register" ? "active" : ""}
    onClick={() => setActiveTab("register")}
  >
    Haematology Register
  </button>

  <button
    className={activeTab === "inventory" ? "active" : ""}
    onClick={() => setActiveTab("inventory")}
  >
    Inventory
  </button>
</div>
  
   
  </div>
  </EngComponent>

  <UserMenu />
</div>

      {visitedTabs.register && (
        <StickyTabPanel active={activeTab === "register"}>
        <>
          <EngComponent name="Filter Bar" type="Layout" parent="Haematology.jsx">
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
            rowCount={masterEntries.length}
          />
          <EngComponent
            name="Patient Register Table"
            type="Tables"
            parent="Haematology.jsx"
          >
          {!criticalReady ? (
            <p style={{ color: "#64748b", fontSize: 13, marginBottom: 8 }}>
              Loading critical flags…
            </p>
          ) : null}
          <div className="table-card">
            <div className="haem-table-wrapper">
              <table className="haem-table">
                <thead>
                  <tr>
                    <th className="sticky-col">Reg No</th>
                    <th className="sticky-col">Diag No</th>
                    <th className="sticky-col">Time Collected</th>
                    <th className="sticky-col">
                      <ColFilterToggle
                        label="Patient Name"
                        open={showColFilters}
                        active={hasActiveColFilters}
                        onToggle={() => setShowColFilters((v) => !v)}
                      />
                    </th>
                    <th>Age</th>
                    <th>Gender</th>
                    <th>Source</th>
                    <th>Selected Tests</th>
                    <th>Haemogram</th>
                    <th>HBH</th>
                    <th>LBC</th>
                    <th>Scanned</th>
                    <th>Machine</th>
                    <th>Status</th>
                    <th style={{ minWidth: "130px" }}> Saved By</th>
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
                        value={colFilters.timeCollected}
                        onChange={(v) => setColFilter("timeCollected", v)}
                        placeholder="Filter time…"
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
                        placeholder="e.g. haemogram"
                      />
                      <ColFilterLocked />
                      <ColFilterLocked />
                      <ColFilterLocked />
                      <ColFilterLocked />
                      <ColFilterSelect
                        value={colFilters.machine}
                        onChange={(v) => setColFilter("machine", v)}
                        placeholder="All machines"
                        options={[
                          { value: "3-part", label: "3-Part" },
                          { value: "5-part", label: "5-Part" },
                        ]}
                      />
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
                {filteredPatients.length === 0 ? (
                  <tbody>
                    <tr>
                      <td
                        colSpan="17"
                        style={{ textAlign: "center", padding: 20 }}
                      >
                        No Haematology entries found.
                      </td>
                    </tr>
                  </tbody>
                ) : (
                <VirtualizedTableBody
                  items={filteredPatients}
                  columnCount={17}
                  renderRow={(p) => (
                    <HaemRegisterRow
                      key={p.compositeKey}
                      patient={p}
                      isCriticalReported={criticalReportedSet.has(p.compositeKey)}
                      isPendingCritical={!!criticalParams[p.compositeKey]}
                      onScan={onScan}
                      onMachine={onMachine}
                      onCritical={onCritical}
                      onSave={onSave}
                    />
                  )}
                />
                )}
              </table>
            </div>
          </div>
          </EngComponent>
        </>
        </StickyTabPanel>
      )}

      {visitedTabs.inventory && (
        <StickyTabPanel active={activeTab === "inventory"}>
        <EngComponent name="Inventory Tab" type="Tables" parent="Haematology.jsx">
        <Suspense fallback={<p>Loading Inventory…</p>}>
          <HaemInventoryTab />
        </Suspense>
        </EngComponent>
        </StickyTabPanel>
      )}

            {criticalModalOpen && (
      <EngComponent name="Critical Alerts" type="Dialogs" parent="Haematology.jsx">
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
        parameterPlaceholder="e.g. HB: 4.2"
        actionsClassName="modal-actions"
      />
      </EngComponent>
      )}
      
          </div>
    </EngComponent>
        );
      }

const HaemRegisterRow = memo(function HaemRegisterRow({
  patient: p,
  isCriticalReported,
  isPendingCritical,
  onScan,
  onMachine,
  onCritical,
  onSave,
}) {
  const isSaved = p.status === "saved";
  const isScanned = p.scanned === "Yes";
  const isCriticalRed =
    isCriticalReported || isPendingCritical || (isScanned && !isSaved);
  const rowClass = isSaved ? "row-saved" : isScanned ? "row-scanned" : "";

  return (
    <tr className={rowClass}>
      <td
        className="sticky-col"
        style={p.urgent ? { borderLeft: "4px solid red" } : {}}
      >
        {p.regNo}
      </td>
      <td className="sticky-col">{p.diagnosticNo || p.accessionNo}</td>
      <td className="sticky-col">{formatTimeCollected(p.timeCollected)}</td>
      <td className="sticky-col">{p.name}</td>
      <td>
        {p.age} {p.ageUnit ? `(${p.ageUnit})` : ""}
      </td>
      <td>{p.gender}</td>
      <td>{p.source}</td>
      <td>{p.testsDisplay || "—"}</td>
      <td>{p.hasHaemogram ? "✅" : "—"}</td>
      <td>{p.hasHb ? "✅" : "—"}</td>
      <td>{p.hasLbc ? "✅" : "—"}</td>
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
      <td>
        <select
          value={p.machine}
          disabled={isSaved}
          onChange={(e) => onMachine(p.compositeKey, e.target.value)}
        >
          <option value="5-part">5-Part</option>
          <option value="3-part">3-Part</option>
        </select>
      </td>
      <td style={{ textAlign: "center" }}>
        {(isCriticalReported || isPendingCritical) && (
          <span
            style={{ color: "red", fontWeight: "bold", fontSize: "10px" }}
          >
            CRITICAL <br />
            {isCriticalReported ? "REPORTED" : "PENDING SAVE"}
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
          disabled={isSaved || !isScanned}
          onClick={() => onSave(p.compositeKey)}
        >
          Save
        </button>
      </td>
    </tr>
  );
}, arePatientRowEqual(DEPT_REGISTER_ROW_FIELDS));
