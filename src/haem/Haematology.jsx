
import React, { useEffect, useState, useMemo } from "react";
import "./Haematology.css";
import { db } from "../firebaseConfig.js";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
  Timestamp,
  query, // Added for inventory query
} from "firebase/firestore";
// Import Inventory Deduction Logic
import { handleInventoryDeduction } from "../inventory/inventorymapping";
// Import the Inventory Tab Component
import HaemInventoryTab from "../inventory/HaemInventoryTab.jsx";
import UserMenu from "../auth/UserMenu";

// 🚨 Define the unique key for this department
const CURRENT_DEPT = "Haematology";

export default function Haematology() {
  const [activeTab, setActiveTab] = useState("register");
  const [masterEntries, setMasterEntries] = useState([]); // Changed to hold raw master data
  const [haemDocs, setHaemDocs] = useState({}); // Stores the haematology_register docs
  const [loading, setLoading] = useState(true);

  // NEW: Lifted Inventory State to eliminate flickering when switching tabs
  const [fullInventory, setFullInventory] = useState([]);

  const [criticalReportedSet, setCriticalReportedSet] = useState(new Set());

const [criticalModalOpen, setCriticalModalOpen] = useState(false);
const [criticalPatient, setCriticalPatient] = useState(null);

const [criticalParameterInput, setCriticalParameterInput] = useState("");
const [criticalReportedByInput, setCriticalReportedByInput] = useState("");

const [criticalParams, setCriticalParams] = useState(() => {
  const saved = localStorage.getItem(
    "haematology_pendingCritical"
  );
  return saved ? JSON.parse(saved) : {};
});

  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const [localScans, setLocalScans] = useState(() => {
    const saved = localStorage.getItem("haematology_localScans");
    return saved ? JSON.parse(saved) : {};
  });
  
  const [localScanTimes, setLocalScanTimes] = useState(() => {
    const saved = localStorage.getItem("haematology_localScanTimes");
    return saved ? JSON.parse(saved) : {};
  });

  const [machineSelections, setMachineSelections] = useState(() => {
    const saved = localStorage.getItem("haematology_machineSelections");
    return saved ? JSON.parse(saved) : {};
  });

  const [savedSet, setSavedSet] = useState(new Set());

  const HAEM_TESTS_CANON = ["haemogram", "hb haemoglobin", "lamellar body count","HEMATOCRIT","RED BLOOD CELL COUNT","TOTAL LEUCOCYTIC COUNT","DIFFERENTIAL LEUCOCYTIC COUNT", "PLATELET COUNT", "RED BLOOD CELL INDICES"];

  const safeKey = (val) => String(val || "").replace(/\//g, "-");

  const extractTestName = (t) => {
    if (!t) return "";
    if (typeof t === "string") return t.toLowerCase();
    if (typeof t === "object" && (t.test || t.name))
      return (t.test || t.name).toLowerCase();
    return "";
  };
  
  const entryHasCanonicalTest = (entry, canonical) => {
    const target = canonical.toLowerCase();
    const arr = entry.selectedTests || [];
  
    return arr.some((x) => {
      const raw = extractTestName(x);
  
      // SAME behavior as before (bidirectional match)
      return raw.includes(target) || target.includes(raw);
    });
  };

  const getEntryCanonicalTests = (entry) => {
    if (entry._cachedCanonical) return entry._cachedCanonical;
  
    const result = HAEM_TESTS_CANON.filter((c) =>
      entryHasCanonicalTest(entry, c)
    );
  
    entry._cachedCanonical = result;
    return result;
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
      entry.scannedTime,
      entry.savedTime,
      entry.createdAt,
    ];

    for (const f of fields) {
      if (!f) continue;
      if (typeof f === "object" && typeof f.toDate === "function")
        return f.toDate();
      if (typeof f === "string") {
        const d = new Date(f);
        if (!isNaN(d)) return d;
      }
      if (typeof f === "object" && typeof f.seconds === "number")
        return new Date(f.seconds * 1000);
    }
    return null;
  };

  const is3PartRequired = (age, ageUnit) => {
    const numAge = Number(age);
    if (isNaN(numAge) || numAge <= 0) return false;
    const unit = String(ageUnit || "years").toLowerCase();
    if (/day|month/.test(unit)) return true;
    if (unit.includes("years") && numAge < 1) return true;
    return false;
  };

  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const today = `${y}-${m}-${d}`;
    setDateFrom(today);
    setDateTo(today);
  }, []);

  useEffect(() => {
    // 1. Master Register
    const unsubMaster = onSnapshot(collection(db, "master_register"), (snap) => {
      setMasterEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  
    // 2. Haematology Register
    const unsubHaem = onSnapshot(collection(db, "haematology_register"), (snap) => {
      const docsMap = {};
      const s = new Set();
  
      snap.docs.forEach((d) => {
        const data = d.data();
        docsMap[d.id] = data;
        if (data?.saved === "Yes" || data?.status === "saved") {
          s.add(d.id);
        }
      });
  
      setHaemDocs(docsMap);
      setSavedSet(s);
    });
  
    // 3. Critical Alerts
    const unsubCritical = onSnapshot(collection(db, "critical_alerts"), (snap) => {
      const cSet = new Set();
  
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (
          data.regNo &&
          String(data.dept).toLowerCase() === CURRENT_DEPT.toLowerCase()
        ) {
          const cKey = safeKey(`${data.regNo}_${data.diagnosticNo}`);
          cSet.add(cKey);
        }
      });
  
      setCriticalReportedSet(cSet);
    });
  
    return () => {
      unsubMaster();
      unsubHaem();
      unsubCritical();
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "inventory") return;
  
    const unsubInv = onSnapshot(
      query(collection(db, "inventory_logs")),
      (snap) => {
        setFullInventory(
          snap.docs.map((d) => ({ ...d.data(), id: String(d.id) }))
        );
      }
    );
  
    return () => unsubInv();
  }, [activeTab]);

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
      const compositeKey = safeKey(`${regNo}_${diagnosticNo}`);
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
      
  const handleScan = (compositeKey, value) => {
    const now = new Date().toISOString();
    setLocalScans((prev) => {
      const updated = { ...prev, [compositeKey]: value };
      localStorage.setItem("haematology_localScans", JSON.stringify(updated));
      return updated;
    });
    setLocalScanTimes((prev) => {
      const updatedTimes = { ...prev, [compositeKey]: value === "Yes" ? now : null };
      localStorage.setItem("haematology_localScanTimes", JSON.stringify(updatedTimes));
      return updatedTimes;
    });
  };


  const handleMachineSelection = (compositeKey, machine) => {
    setMachineSelections((prev) => {
      const updated = {
        ...prev,
        [compositeKey]: machine,
      };
  
      localStorage.setItem(
        "haematology_machineSelections",
        JSON.stringify(updated)
      );
  
      return updated;
    });
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
  
    setCriticalParams((prev) => {
      const updated = {
        ...prev,
        [regKey]: {
          parameter: criticalParameterInput.trim(),
          criticalReportedBy: criticalReportedByInput.trim(),
        },
      };
  
      localStorage.setItem(
        "haematology_pendingCritical",
        JSON.stringify(updated)
      );
  
      return updated;
    });
  
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
      
      setLocalScans((prev) => {
        const updated = { ...prev }; delete updated[compositeKey];
        localStorage.setItem("haematology_localScans", JSON.stringify(updated));
        return updated;
      });
      setLocalScanTimes((prev) => {
        const updated = { ...prev }; delete updated[compositeKey];
        localStorage.setItem("haematology_localScanTimes", JSON.stringify(updated));
        return updated;
      });

      setCriticalParams((prev) => {
        const n = { ...prev };
      
        delete n[compositeKey];
      
        localStorage.setItem(
          "haematology_pendingCritical",
          JSON.stringify(n)
        );
      
        return n;
      });
      
      setMachineSelections((prev) => {
        const updated = { ...prev };
      
        delete updated[compositeKey];
      
        localStorage.setItem(
          "haematology_machineSelections",
          JSON.stringify(updated)
        );
      
        return updated;
      });
      
      alert(`Saved ${patient.name || patient.regNo} successfully!`);
      
      } catch (err) {
        console.error("🔥 Save Error:", err);
        alert(`Error saving: ${err.message}`);
      }  
  };

  const filteredPatients = patients
    .filter((p) => {
        if (regSearch.trim()) {
          const key = String(p.regNo || "").toLowerCase();
          const acc = String(p.diagnosticNo || p.accessionNo || "").toLowerCase();
          if (!key.includes(regSearch.trim().toLowerCase()) && !acc.includes(regSearch.trim().toLowerCase())) return false;
        }
        if (sourceFilter !== "All" && p.source !== sourceFilter) return false;
        
        const eDate = parseDate(p);
        if (eDate) {
          const entryDateStr = `${eDate.getFullYear()}-${String(eDate.getMonth() + 1).padStart(2, '0')}-${String(eDate.getDate()).padStart(2, '0')}`;
          if (dateFrom && entryDateStr < dateFrom) return false;
          if (dateTo && entryDateStr > dateTo) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
        const dateA = parseDate(a);
        const dateB = parseDate(b);
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA - dateB;
      });

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
        /* Pass the pre-loaded background inventory data to the tab */
        <HaemInventoryTab preLoadedInventory={fullInventory} />
      ) : (
        <>
          <div className="filter-bar">
            <input className="reg-search" placeholder="Search Reg or Diag No..." value={regSearch} onChange={(e) => setRegSearch(e.target.value)} />
            <div className="date-filters">
              <label>Date:</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <span>to</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="source-buttons">
              {["OPD", "IPD", "Third Floor", "All"].map((src) => (
                <button key={src} className={`source-btn ${sourceFilter === src ? "active" : ""}`} onClick={() => setSourceFilter(src)}>{src}</button>
              ))}
            </div>
          </div>

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
                <tbody>
                  {filteredPatients.length > 0 ? (
                    filteredPatients.map((p) => {
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
                            <select value={isScanned ? "Yes" : "No"} disabled={isSaved} onChange={(e) => handleScan(p.compositeKey, e.target.value)}>
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
                    })
                  ) : (
                    <tr>
                      <td colSpan="15" style={{ textAlign: "center", padding: 20 }}>No Haematology entries found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
            )}

            {criticalModalOpen && (
              <div className="critical-modal-overlay">
                <div className="critical-modal">
      
                  <h3>Critical Alert</h3>
      
                  <label>Critical Parameter &amp; Value</label>
      
                  <input
                    type="text"
                    value={criticalParameterInput}
                    onChange={(e) => setCriticalParameterInput(e.target.value)}
                    placeholder="e.g. HB: 4.2"
                  />
      
                  <label style={{ marginTop: "15px" }}>
                    Critical Reported By
                  </label>
      
                  <input
                    type="text"
                    value={criticalReportedByInput}
                    onChange={(e) => setCriticalReportedByInput(e.target.value)}
                    placeholder="Enter Name"
                  />
      
                  <div className="modal-actions">
                    <button
                      className="source-btn"
                      onClick={() => {
                        setCriticalModalOpen(false);
                        setCriticalPatient(null);
                      }}
                    >
                      Cancel
                    </button>
      
                    <button
                      className="save-btn"
                      style={{ width: "120px" }}
                      onClick={saveCriticalDetails}
                    >
                      Save
                    </button>
                  </div>
      
                </div>
              </div>
            )}
      
          </div>
        );
      }