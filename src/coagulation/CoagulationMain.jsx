
import React, { useState, useMemo, lazy, Suspense } from "react";
import "./CoagulationMain.css";
import { db } from "../firebaseConfig.js";
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import coagRouting from "../coag_testRouting.json";

// --- IMPORT FOR DEDUCTION ---
import { handleInventoryDeduction } from "../inventory/inventorymapping";
import VirtualizedTableBody from "../shared/components/VirtualizedTableBody.jsx";
import { filterAndSortRegisterPatients } from "../shared/utils/filterRegisterPatients.js";
import { normalizeSource } from "../shared/utils/source.js";
import { compositeId } from "../shared/utils/ids.js";
import { getTestName } from "../shared/utils/tests.js";
import { usePersistedObjectState } from "../shared/hooks/usePersistedObjectState.js";
import { useRegisterFilters } from "../shared/hooks/useRegisterFilters.js";
import { useMasterDeptSnapshots } from "../shared/hooks/useMasterDeptSnapshots.js";
import RegisterFilterBar from "../shared/components/RegisterFilterBar.jsx";
import CriticalAlertModal from "../shared/components/CriticalAlertModal.jsx";

const CoagulationInventory = lazy(() =>
  import("../inventory/CoagulationInventoryTab")
);

const CURRENT_DEPT = "Coagulation";

export default function CoagulationMain() {
  const loggedUser =
  sessionStorage.getItem("loggedUser") || "User";

const logout = () => {
  sessionStorage.clear();
  window.location.href = "/login.html";
};

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
    deptDocs: coagDocs,
    setDeptDocs: setCoagDocs,
    savedSet,
    criticalReportedSet,
    loading,
  } = useMasterDeptSnapshots({
    deptCollection: "coagulation_register",
    currentDept: CURRENT_DEPT,
    masterDeptKey: "Coagulation",
    dateFrom,
    dateTo,
    criticalBelongsToDept: (data, dept) =>
      String(data.dept).toLowerCase() === String(dept).toLowerCase(),
  });

  const [activeTab, setActiveTab] = useState("tests");
  const [criticalModalOpen, setCriticalModalOpen] = useState(false);
  const [criticalPatient, setCriticalPatient] = useState(null);

  const [criticalParameterInput, setCriticalParameterInput] = useState("");
  const [criticalReportedByInput, setCriticalReportedByInput] = useState("");

  const [localScans, setLocalScans] = usePersistedObjectState(
    "coagulation_localScans",
    {}
  );

  const [localScanTimes, setLocalScanTimes] = usePersistedObjectState(
    "coagulation_localScanTimes",
    {}
  );
  const [localResults, setLocalResults] = usePersistedObjectState(
    "coagulation_localResults",
    {}
  );

  const coagTests = coagRouting.Analyzer?.tests || coagRouting?.tests || [];

  const normalize = (str) =>
    str
      .toLowerCase()
      .replace(/\(.*?\)/g, "")
      .replace(/[^a-z]/g, "")
      .replace(/\s+/g, "")
      .trim();

    const extractSource = (entry) => {
    if (entry?.source) return normalizeSource(entry.source);
    if (Array.isArray(entry.selectedTests) && entry.selectedTests.length > 0) {
      const fromTest = entry.selectedTests.find(
        (t) => t?.source && typeof t.source === "string"
      );
      if (fromTest) return normalizeSource(fromTest.source);
    }
    return "Unknown";
  };

  const isCoagTestName = (name) => {
    if (!name) return false;
    const lower = normalize(name);
    return coagTests.some((ref) => lower.includes(normalize(ref.split("(")[0])));
  };

  const getRelevantCoagTests = (patient) => {
    const arr =
      patient.selectedTests || patient.testsSelected || patient.tests || [];
    return arr.map(getTestName).filter((nm) => isCoagTestName(nm));
  };

  const getRequiredFields = (tests) => {
    const req = {};
    const testNames = tests.map((t) => t.toUpperCase());
    const isProfile = testNames.some((t) => t.includes("COAGULATION PROFILE"));
    if (
      isProfile ||
      testNames.some((t) => t.includes("PT-INR") || t.includes("PROTHOMBIN"))
    ) {
      req.pt = true;
      req.inr = true;
    }
    if (isProfile || testNames.some((t) => t.includes("APTT"))) req.aptt = true;
    if (
      isProfile ||
      testNames.some((t) => t.includes("(B.T.)") || t.includes("BLEEDING TIME"))
    )
      req.bt = true;
    if (
      isProfile ||
      testNames.some((t) => t.includes("(C.T.)") || t.includes("CLOTTING TIME"))
    )
      req.ct = true;
    return req;
  };

  const areRequiredFieldsFilled = (patient, required) => {
    return Object.entries(required).every(([field, needed]) => {
      if (!needed) return true;
  
      const value = patient[field];
  
      if (field === "bt" || field === "ct") {
        return (
          value &&
          value.toString().trim() !== "" &&
          value !== "MM:SS"
        );
      }
  
      return (
        value !== undefined &&
        value !== null &&
        value.toString().trim() !== ""
      );
    });
  };

  const patients = useMemo(() => {
    const filteredMaster = masterEntries.filter((entry) => {
      const arr =
        entry.selectedTests || entry.testsSelected || entry.tests || [];
      return arr.some((t) => isCoagTestName(getTestName(t)));
    });
    return filteredMaster.map((entry) => {
      const compositeKey = compositeId(entry.regNo, entry.diagnosticNo);
      const saved = coagDocs[compositeKey] || {};
      const localScan = localScans[compositeKey];
      const currentScanned = localScan ?? saved.scanned ?? "No";
      const localResult = localResults[compositeKey] || {};
      const isSaved = savedSet.has(compositeKey);
      return {
        ...entry,
        ...saved,
        ...localResult,
        compositeKey: compositeKey,
        source: extractSource(entry),
        scanned: currentScanned,
        status: isSaved
          ? "saved"
          : currentScanned === "Yes"
          ? "scanned"
          : "pending",
        urgent: entry.urgent || false,
        diagnosticNo: entry.diagnosticNo || entry.accessionNo,
        bt: localResult.bt ?? saved.bt ?? saved.BT ?? "MM:SS",
        ct: localResult.ct ??saved.ct ?? saved.CT ?? "MM:SS",
        pt: localResult.pt ?? saved.pt ?? saved.PT ?? "",
        inr: localResult.inr ?? saved.inr ?? saved.INR ?? "",
        aptt: localResult.aptt ?? saved.aptt ?? saved.APTT ?? "",
      };
    });
  }, [masterEntries, coagDocs, localScans, localResults, savedSet]);

  const triggerCritical = (entry) => {
    const { bt, ct, pt, inr, aptt } = entry;
  
    const resultsArr = [];
  
    if (bt && bt !== "MM:SS") resultsArr.push(`BT: ${bt}`);
    if (ct && ct !== "MM:SS") resultsArr.push(`CT: ${ct}`);
    if (pt) resultsArr.push(`PT: ${pt}`);
    if (inr) resultsArr.push(`INR: ${inr}`);
    if (aptt) resultsArr.push(`APTT: ${aptt}`);
  
    setCriticalPatient(entry);
    setCriticalParameterInput(resultsArr.join(", "));
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
  
    // Store pending critical in the component state
    setCoagDocs((prev) => ({
      ...prev,
      [regKey]: {
        ...(prev[regKey] || {}),
        pendingCriticalParam: criticalParameterInput.trim(),
        criticalReportedBy: criticalReportedByInput.trim(),
      },
    }));
  
    // Store pending critical locally
    setLocalResults((prev) => ({
      ...prev,
      [regKey]: {
        ...(prev[regKey] || {}),
        pendingCriticalParam: criticalParameterInput.trim(),
        criticalReportedBy: criticalReportedByInput.trim(),
      },
    }));
  
    setCriticalModalOpen(false);
    setCriticalPatient(null);
  
    alert(
      "Critical details captured. Click Save to send to the Critical Dashboard."
    );
  };

  const handleSave = async (patient) => {
    try {
      const regKey = patient.compositeKey;
      const ref = doc(db, "coagulation_register", regKey);
      const relevant = getRelevantCoagTests(patient);
      const rawLocalTime = localScanTimes[regKey];
      const scanTime = rawLocalTime ? new Date(rawLocalTime) : null;
      const pendingCriticalParam = patient.pendingCriticalParam;
      const pendingCriticalReportedBy = patient.criticalReportedBy;
      const hasPendingCritical = !!pendingCriticalParam;
      const isCritical =
        criticalReportedSet.has(regKey) || hasPendingCritical ? "Yes" : "No";

      let resultsArr = [];
      if (patient.bt && patient.bt !== "MM:SS")
        resultsArr.push(`BT: ${patient.bt}`);
      if (patient.ct && patient.ct !== "MM:SS")
        resultsArr.push(`CT: ${patient.ct}`);
      if (patient.pt) resultsArr.push(`PT: ${patient.pt}`);
      if (patient.inr) resultsArr.push(`INR: ${patient.inr}`);
      if (patient.aptt) resultsArr.push(`APTT: ${patient.aptt}`);
      const resultsString = resultsArr.join(" | ");

      const payload = {
        regNo: patient.regNo,
        diagnosticNo: patient.diagnosticNo,
        name: patient.name || "",
        age: patient.age || "",
        ageUnit: patient.ageUnit || "",
        gender: patient.gender || "",
        source: patient.source || "",
        category: patient.category || "GENERAL",
        selectedTests: relevant,
        bt: patient.bt || "",
        ct: patient.ct || "",
        pt: patient.pt || "",
        inr: patient.inr || "",
        aptt: patient.aptt || "",
        results: resultsString,
        scanned: "Yes",
        scannedTime: scanTime
          ? Timestamp.fromDate(scanTime)
          : patient.scannedTime || null,
        saved: "Yes",
        savedTime: serverTimestamp(),
        savedBy: loggedUser,
        timePrinted: patient.timePrinted || null,
        timeCollected: patient.timeCollected || null,
        status: "saved",
        critical: isCritical,
      };

      await setDoc(ref, payload, { merge: true });

      await updateDoc(
        doc(db, "report_details", regKey),
        {
          // Safeguard: if Save succeeds, Scan must also have succeeded.
          [`routineReportsScanned.${CURRENT_DEPT}`]: true,
          [`routineReportsSaved.${CURRENT_DEPT}`]: true,
        }
      );

      // --- INVENTORY DEDUCTION LOGIC ---
      if (relevant && relevant.length > 0) {
        // Use a Set to ensure only ONE capillary is deducted if both BT and CT are present
        const uniqueKeys = new Set();

        relevant.forEach((test) => {
          const t = test.toUpperCase();
          if (t.includes("PT-INR") || t.includes("PROTHOMBIN")) {
            uniqueKeys.add("PROTHOMBIN TIME (PT-INR),PLASMA");
          } else if (t.includes("APTT")) {
            uniqueKeys.add("APTT (ACT PARTIAL THROMBO PLASTIN TIME)");
          } else if (t.includes("PROFILE")) {
            uniqueKeys.add("COAGULATION PROFILE");
          } else if (
            t.includes("BLEEDING") ||
            t.includes("B.T.") ||
            t.includes("CLOTTING") ||
            t.includes("C.T.")
          ) {
            // Both BT and CT point to this single mapping key
            uniqueKeys.add("BLEEDING TIME (B.T.)");
          }
        });

        const testsToDeduct = Array.from(uniqueKeys);

        if (testsToDeduct.length > 0) {
          try {
            await handleInventoryDeduction(testsToDeduct, "GENERAL");
          } catch (dedErr) {
            console.error("Deduction Logic Error:", dedErr);
          }
        }
      }

      if (hasPendingCritical) {
        const criticalId = `${regKey}_${CURRENT_DEPT}`;
        await setDoc(doc(db, "critical_alerts", criticalId), {
          name: patient.name || "",
          regNo: patient.regNo,
          diagnosticNo: patient.diagnosticNo,
          age: patient.age || "",
          ageUnit: patient.ageUnit || "",
          gender: patient.gender || "",
          doctor: patient.doctor || "Self",
          category: patient.category || "",
          source: patient.source || "",
          reportedBy: loggedUser,
          timePrinted: patient.timePrinted || null,
          timeCollected: patient.timeCollected || null,
          criticalParameter: pendingCriticalParam,
          criticalReportedBy: pendingCriticalReportedBy,
          flaggedAt: serverTimestamp(),
          status: "Pending",
          dept: CURRENT_DEPT,
          selectedTests: relevant,
        });
      }

      setCoagDocs((prev) => {
        const next = { ...prev };
      
        if (next[regKey]) {
          delete next[regKey].pendingCriticalParam;
          delete next[regKey].criticalReportedBy;
        }
      
        return next;
      });

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

      setLocalResults((prev) => {
        const next = { ...prev };
        delete next[regKey];
        return next;
      });

      alert(`Saved Coagulation entry for ${patient.name || patient.regNo}`);
    } catch (err) {
      console.error("Error saving:", err);
      alert("Failed to save record.");
    }
  };

  const formatTimeInput = (value) => {
    let cleaned = value.replace(/[^\d:]/g, "");
    if (cleaned.length > 5) cleaned = cleaned.slice(0, 5);
    if (cleaned.indexOf(":") === -1) {
      if (cleaned.length === 3)
        cleaned = `${cleaned.slice(0, 1)}:${cleaned.slice(1, 3)}`;
      else if (cleaned.length >= 4)
        cleaned = `${cleaned.slice(0, 2)}:${cleaned.slice(2)}`;
    }
    const parts = cleaned.split(":");
    if (parts.length === 2) {
      let minutes = parts[0].slice(0, 2);
      let seconds = parts[1].slice(0, 2);
      return `${minutes}:${seconds}`;
    }
    return cleaned;
  };

  const handleBTCTChange = (e, patient, field) => {
    const input = e.target;
    const cursor = input.selectionStart;
    const oldValue = input.value;
    const formattedValue = formatTimeInput(e.target.value);
    setCoagDocs((prev) => ({
      ...prev,
      [patient.compositeKey]: {
        ...(prev[patient.compositeKey] || {}),
        [field]: formattedValue,
      },
    }));
    setLocalResults((prev) => ({
      ...prev,
      [patient.compositeKey]: {
        ...(prev[patient.compositeKey] || {}),
        [field]: formattedValue,
      },
    }));

    let newCursor = cursor;
    if (
      formattedValue.length > oldValue.length &&
      formattedValue.charAt(cursor - 1) === ":"
    )
      newCursor = cursor + 1;

    setTimeout(() => {
      if (input === document.activeElement) {
        const finalPosition = Math.min(newCursor, formattedValue.length);
        input.setSelectionRange(finalPosition, finalPosition);
      }
    }, 0);
  };

  const handleFocus = (e) => {
    if (!e.target.value || e.target.value === "MM:SS")
      e.target.setSelectionRange(0, 0);
  };

  const filteredPatients = useMemo(
    () =>
      filterAndSortRegisterPatients(patients, {
        regSearch,
        sourceFilter,
        dateFrom,
        dateTo,
        getDiag: (p) => p.diagnosticNo || "",
      }),
    [patients, regSearch, sourceFilter, dateFrom, dateTo]
  );

  const tabBtnStyle = (isActive) => ({
    padding: "8px 25px",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "background 0.2s",
    border: "1px solid #d1d5db",
    backgroundColor: isActive ? "#3b82f6" : "#f9fafb",
    color: isActive ? "#ffffff" : "#1e3a8a",
    marginLeft: "10px",
    outline: "none",
  });

  if (loading) return <p>Loading Coagulation data...</p>;

  return (
    <div className="coag-container">
     
     <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
    marginTop: "10px",
    paddingRight: "20px",
  }}
>
  <div></div>

  <div>
    <button
      style={tabBtnStyle(activeTab === "tests")}
      onClick={() => setActiveTab("tests")}
    >
      Coagulation
    </button>

    <button
      style={tabBtnStyle(activeTab === "inventory")}
      onClick={() => setActiveTab("inventory")}
    >
      Inventory
    </button>
  </div>

  <details>
    <summary
      style={{
        cursor: "pointer",
        padding: "10px 16px",
        border: "1px solid #ccc",
        borderRadius: "8px",
        background: "#fff",
        listStyle: "none",
        fontWeight: "600",
      }}
    >
      Hi, {loggedUser} ▼
    </summary>

    <div
      style={{
        position: "absolute",
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: "6px",
        marginTop: "4px",
        minWidth: "120px",
        zIndex: 1000,
      }}
    >
      <button
        onClick={logout}
        style={{
          width: "100%",
          padding: "10px",
          border: "none",
          background: "white",
          cursor: "pointer",
        }}
      >
        Logout
      </button>
    </div>
  </details>
</div>

      {activeTab === "tests" ? (
        <>
          <h2 className="dept-header">Coagulation Department</h2>
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

          <div className="table-wrapper">
            <table className="dept-table">
              <thead>
                <tr>
                  <th className="sticky-col">Reg No</th>
                  <th className="sticky-col">Diag No</th>
                  <th className="sticky-col">Patient Name</th>
                  <th>Age</th>
                  <th>Gender</th>
                  <th>Source</th>
                  <th>Selected Tests</th>
                  <th>BT</th>
                  <th>CT</th>
                  <th>PT</th>
                  <th>INR</th>
                  <th>APTT</th>
                  <th>Scanned</th>
                  <th>Status</th>
                  <th>Saved By</th>
                  <th>Critical</th>
                  <th>Action</th>
                </tr>
              </thead>
              <VirtualizedTableBody
                items={filteredPatients}
                columnCount={17}
                renderRow={(p) => {
                  const relevant = getRelevantCoagTests(p);
                  const key = p.compositeKey;
                  const isSaved = p.status === "saved";
                  const isScanned = p.scanned === "Yes";
                  const isCriticalReported = criticalReportedSet.has(key);
                  const isPendingCritical = !!p.pendingCriticalParam;

                  const isCriticalRed =
                  isCriticalReported ||
                  isPendingCritical ||
                  (isScanned && !isSaved);

                  const requiredFields = getRequiredFields(relevant);
                  const missingRequired = !areRequiredFieldsFilled(
                    p,
                    requiredFields
                  );
                  const renderField = (field) => {
                    if (!requiredFields[field]) return <span>–</span>;
                    const isBTCT = field === "bt" || field === "ct";
                    const finalDisabled = isSaved || !isScanned;
                    return (
                      <input
                        type="text"
                        value={p[field] || ""}
                        disabled={finalDisabled}
                        onChange={
                          isBTCT
                            ? (e) => handleBTCTChange(e, p, field)
                            : (e) => {
                              const value = e.target.value;
                          
                              setCoagDocs((prev) => ({
                                ...prev,
                                [p.compositeKey]: {
                                  ...(prev[p.compositeKey] || {}),
                                  [field]: value,
                                },
                              }));
                          
                              setLocalResults((prev) => ({
                                ...prev,
                                [p.compositeKey]: {
                                  ...(prev[p.compositeKey] || {}),
                                  [field]: value,
                                },
                              }));
                            }
                        }
                        onFocus={isBTCT ? handleFocus : undefined}
                        placeholder={isBTCT ? "MM:SS" : ""}
                      />
                    );
                  };
                  return (
                    <tr
                      key={p.compositeKey}
                      className={
                        isSaved
                          ? "row-green"
                          : isScanned
                          ? "row-yellow"
                          : "row-normal"
                      }
                    >
                      <td
                        className="sticky-col"
                        style={p.urgent ? { borderLeft: "4px solid red" } : {}}
                      >
                        {p.regNo || "-"}
                      </td>
                      <td className="sticky-col">{p.diagnosticNo || "-"}</td>
                      <td className="sticky-col col-name">{p.name || "-"}</td>
                      <td>
                        {p.age} {p.ageUnit}
                      </td>
                      <td>{p.gender || "-"}</td>
                      <td>{p.source || "-"}</td>
                      <td className="col-tests">
                        {relevant.join(", ") || "-"}
                      </td>
                      <td>{renderField("bt")}</td>
                      <td>{renderField("ct")}</td>
                      <td>{renderField("pt")}</td>
                      <td>{renderField("inr")}</td>
                      <td>{renderField("aptt")}</td>
                      <td>
                        <select
                          value={isScanned ? "Yes" : "No"}
                          disabled={isSaved}
                         
                          onChange={async (e) => {
                            const value = e.target.value;
                            const now = new Date().toISOString();
                          
                            setLocalScans((prev) => ({
                              ...prev,
                              [key]: value,
                            }));
                          
                            setLocalScanTimes((prev) => ({
                              ...prev,
                              [key]: value === "Yes" ? now : null,
                            }));
                          
                            try {
                              await updateDoc(
                                doc(db, "report_details", key),
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
                          }}
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
                          color: "#1e3a8a",
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
                        !isScanned ||
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
                          disabled={isSaved || !isScanned || missingRequired}
                          onClick={() => handleSave(p)}
                        >
                          💾 Save
                        </button>
                      </td>
                    </tr>
                  );
                }}
              />
            </table>
          </div>
        </>
            ) : (
              <Suspense fallback={<p>Loading Inventory…</p>}>
                <CoagulationInventory />
              </Suspense>
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
        parameterPlaceholder="Enter Critical Value"
        actionsClassName="modal-actions"
      />
      )}
      
          </div>
        );
      }