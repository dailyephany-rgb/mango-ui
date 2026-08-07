
import React, { useState, useMemo, lazy, Suspense } from "react";
import "./Haematology.css";
import { db } from "../firebaseConfig.js";
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
// Import Inventory Deduction Logic
import { handleInventoryDeduction } from "../inventory/inventorymapping";
import UserMenu from "../auth/UserMenu";
import VirtualizedTableBody from "../shared/components/VirtualizedTableBody.jsx";
import { filterAndSortRegisterPatients } from "../shared/utils/filterRegisterPatients.js";
import { normalizeSource } from "../shared/utils/source.js";
import { compositeId, safeKey } from "../shared/utils/ids.js";
import {
  extractTestName,
  entryHasCanonicalTest,
} from "../shared/utils/tests.js";
import { usePersistedObjectState } from "../shared/hooks/usePersistedObjectState.js";
import { useRegisterFilters } from "../shared/hooks/useRegisterFilters.js";
import { useMasterDeptSnapshots } from "../shared/hooks/useMasterDeptSnapshots.js";
import RegisterFilterBar from "../shared/components/RegisterFilterBar.jsx";
import CriticalAlertModal from "../shared/components/CriticalAlertModal.jsx";

const HaemInventoryTab = lazy(() => import("../inventory/HaemInventoryTab.jsx"));

// 🚨 Define the unique key for this department
const CURRENT_DEPT = "Haematology";

export default function Haematology() {
  const [activeTab, setActiveTab] = useState("register");

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
    loading,
  } = useMasterDeptSnapshots({
    deptCollection: "haematology_register",
    currentDept: CURRENT_DEPT,
    masterDeptKey: "Haematology",
    dateFrom,
    dateTo,
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

      await updateDoc(
        doc(db, "report_details", compositeKey),
        {
          // Safeguard: if Save succeeds, Scan must also have succeeded.
          [`routineReportsScanned.${CURRENT_DEPT}`]: true,
          [`routineReportsSaved.${CURRENT_DEPT}`]: true,
        }
      );
      
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

  const filteredPatients = useMemo(
    () =>
      filterAndSortRegisterPatients(patients, {
        regSearch,
        sourceFilter,
        dateFrom,
        dateTo,
        getDiag: (p) => p.diagnosticNo || p.accessionNo || "",
      }),
    [patients, regSearch, sourceFilter, dateFrom, dateTo]
  );

  if (loading) return <p>Loading Haematology data...</p>;

  return (
    <div className="haem-container">

      
<div
  className="header"
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  }}
>
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

  <UserMenu />
</div>

      {activeTab === "inventory" ? (
        <Suspense fallback={<p>Loading Inventory…</p>}>
          <HaemInventoryTab />
        </Suspense>
      ) : (
        <>
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

          <div className="table-card">
            <div className="haem-table-wrapper">
              <table className="haem-table">
                <thead>
                  <tr>
                    <th className="sticky-col">Reg No</th>
                    <th className="sticky-col">Diag No</th>
                    <th className="sticky-col">Patient Name</th>
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
                </thead>
                {filteredPatients.length === 0 ? (
                  <tbody>
                    <tr>
                      <td
                        colSpan="15"
                        style={{ textAlign: "center", padding: 20 }}
                      >
                        No Haematology entries found.
                      </td>
                    </tr>
                  </tbody>
                ) : (
                <VirtualizedTableBody
                  items={filteredPatients}
                  columnCount={16}
                  renderRow={(p) => {
                      const regKey = p.compositeKey;
                      const selCanon = p.canonicalTests;
                     
                      const isSaved = p.status === "saved";
                      const isScanned = p.scanned === "Yes";
                      const isCriticalReported = criticalReportedSet.has(regKey);
                      const isPendingCritical = !!criticalParams[regKey];

                      const isCriticalRed =
                        isCriticalReported ||
                        isPendingCritical ||
                        (isScanned && !isSaved);

                      const rowClass = isSaved ? "row-saved" : isScanned ? "row-scanned" : "";


                      return (
                        <tr key={p.compositeKey} className={rowClass}>
                          <td className="sticky-col" style={p.urgent ? { borderLeft: "4px solid red" } : {}}>{p.regNo}</td>
                          <td className="sticky-col">{p.diagnosticNo || p.accessionNo}</td>
                          <td className="sticky-col">{p.name}</td>
                          <td>{p.age} {p.ageUnit ? `(${p.ageUnit})` : ""}</td>
                          <td>{p.gender}</td>
                          <td>{p.source}</td>
                          <td>{selCanon.length ? selCanon.map((s) => s.toUpperCase()).join(", ") : "—"}</td>
                          <td>{selCanon.some((t) => t.includes("haemogram")) ? "✅" : "—"}</td>
                          <td>{selCanon.some((t) => t.includes("hb haemoglobin")) ? "✅" : "—"}</td>
                          <td>{selCanon.some((t) => t.includes("lamellar body count")) ? "✅" : "—"}</td>
                          <td>
                            <select value={isScanned ? "Yes" : "No"} disabled={isSaved} 
                            onChange={(e) => handleScan(p, e.target.value)}>
                              <option value="No">No</option>
                              <option value="Yes">Yes</option>
                            </select>
                          </td>

                          <td>
                            <select
                              value={p.machine}
                              disabled={isSaved}
                              onChange={(e) =>
                                handleMachineSelection(
                                  p.compositeKey,
                                  e.target.value
                                )
                              }
                            >
                              <option value="5-part">
                                5-Part
                              </option>

                              <option value="3-part">
                                3-Part
                              </option>
                            </select>
                          </td>


                          <td style={{ textAlign: 'center' }}>
                           
                          {(isCriticalReported ||
                              isPendingCritical) && (
                              <span
                                style={{
                                  color: "red",
                                  fontWeight: "bold",
                                  fontSize: "10px"
                                }}
                              >
                                CRITICAL <br />
                                {isCriticalReported
                                  ? "REPORTED"
                                  : "PENDING SAVE"}
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
                          {p.savedBy || "—"}
                        </td>


                        <td>
                          <button
                            onClick={() => triggerCritical(p)}
                            disabled={
                              isCriticalReported ||
                              isPendingCritical ||
                              isSaved ||
                              !isScanned
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
                            
                            <button className="save-btn" 
                            disabled={isSaved || !isScanned} onClick={() => handleSave(p.compositeKey)}>Save</button>
                          </td>
                        </tr>
                      );
                  }}
                />
                )}
              </table>
            </div>
          </div>
        </>
            )}

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
        parameterPlaceholder="e.g. HB: 4.2"
        actionsClassName="modal-actions"
      />
      )}
      
          </div>
        );
      }