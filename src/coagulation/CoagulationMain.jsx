
import React, { useEffect, useState, useMemo } from "react";
import "./CoagulationMain.css";
import { db } from "../firebaseConfig.js";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import coagRouting from "../coag_testRouting.json";

// 🚨 Define the unique key for this department
const CURRENT_DEPT = "Coagulation";

export default function CoagulationMain() {
  const [masterEntries, setMasterEntries] = useState([]);
  const [coagDocs, setCoagDocs] = useState({});
  const [loading, setLoading] = useState(true);
  const [savedSet, setSavedSet] = useState(new Set());
  
  const [criticalReportedSet, setCriticalReportedSet] = useState(new Set());
  
  // UPDATE: Load localScans from LocalStorage to survive refresh
  const [localScans, setLocalScans] = useState(() => {
    const saved = localStorage.getItem("coagulation_localScans");
    return saved ? JSON.parse(saved) : {};
  });
  
  // FINAL FIX: Persist localScanTimes to survive refresh
  const [localScanTimes, setLocalScanTimes] = useState(() => {
    const saved = localStorage.getItem("coagulation_localScanTimes");
    return saved ? JSON.parse(saved) : {};
  }); 

  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const coagTests = coagRouting.Analyzer?.tests || coagRouting?.tests || [];
  const getTestName = (t) => (typeof t === "string" ? t : t?.test || "");

  const normalize = (str) =>
    str
      .toLowerCase()
      .replace(/\(.*?\)/g, "")
      .replace(/[^a-z ]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  useEffect(() => {
    // FIX: Set local date to roll over at midnight local time
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const today = `${y}-${m}-${d}`;

    setDateFrom(today);
    setDateTo(today);
  }, []);

  const normalizeSource = (raw) => {
    if (!raw) return "Unknown";
    const s = raw.trim().toLowerCase();
    if (s.includes("opd")) return "OPD";
    if (s.includes("ipd")) return "IPD";
    if (s.includes("third") || s.includes("3rd")) return "Third Floor";
    return "Unknown";
  };

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
    return coagTests.some((ref) =>
      lower.includes(normalize(ref.split("(")[0]))
    );
  };

  const getRelevantCoagTests = (patient) => {
    const arr =
      patient.selectedTests || patient.testsSelected || patient.tests || [];
    return arr.map(getTestName).filter((nm) => isCoagTestName(nm));
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

  const getRequiredFields = (tests) => {
    const req = {};
    const testNames = tests.map(t => t.toUpperCase());
    const isProfile = testNames.some(t => t.includes("COAGULATION PROFILE"));
    if (isProfile || testNames.some(t => t.includes("PT-INR") || t.includes("PROTHOMBIN"))) {
      req.pt = true;
      req.inr = true;
    }
    if (isProfile || testNames.some(t => t.includes("APTT"))) req.aptt = true;
    if (isProfile || testNames.some(t => t.includes("(B.T.)") || t.includes("BLEEDING TIME"))) req.bt = true;
    if (isProfile || testNames.some(t => t.includes("(C.T.)") || t.includes("CLOTTING TIME"))) req.ct = true;
    return req;
  };

  const areRequiredFieldsFilled = (patient, required) => {
    return !Object.entries(required).some(
      ([field, needed]) =>
        needed && !(patient[field] && patient[field].toString().trim() && patient[field] !== "MM:SS")
    );
  };

  // Optimized Snapshots
  useEffect(() => {
    const unsubMaster = onSnapshot(collection(db, "master_register"), (snap) => {
      setMasterEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    const unsubCoag = onSnapshot(collection(db, "coagulation_register"), (snap) => {
      const docsMap = {};
      const sSet = new Set();
      snap.docs.forEach((d) => {
        const data = d.data();
        // FIX: Use composite ID for tracking
        const compositeKey = `${data.regNo}_${data.diagnosticNo}`;
        docsMap[compositeKey] = data;
        if (data.saved === "Yes" || data.status === "saved") sSet.add(compositeKey);
      });
      setCoagDocs(docsMap);
      setSavedSet(sSet);
    });

    const unsubCritical = onSnapshot(collection(db, "critical_alerts"), (snap) => {
      const cSet = new Set();
      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.regNo && String(data.dept).toLowerCase() === CURRENT_DEPT.toLowerCase()) {
          // FIX: Critical alerts also mapped via composite key
          const cKey = `${data.regNo}_${data.diagnosticNo}`;
          cSet.add(cKey);
        }
      });
      setCriticalReportedSet(cSet);
    });

    return () => {
      unsubMaster();
      unsubCoag();
      unsubCritical();
    };
  }, []);

  const patients = useMemo(() => {
    const filteredMaster = masterEntries.filter((entry) => {
      const arr = entry.selectedTests || entry.testsSelected || entry.tests || [];
      return arr.some((t) => isCoagTestName(getTestName(t)));
    });

    return filteredMaster.map((entry) => {
      // FIX: Use composite key as unique identifier
      const compositeKey = `${entry.regNo}_${entry.diagnosticNo}`;
      const saved = coagDocs[compositeKey] || {};
      const localScan = localScans[compositeKey];

      const currentScanned = localScan ?? saved.scanned ?? "No";
      const isSaved = savedSet.has(compositeKey);

      return {
        ...entry,
        ...saved,
        compositeKey: compositeKey,
        source: extractSource(entry),
        scanned: currentScanned,
        status: isSaved ? "saved" : currentScanned === "Yes" ? "scanned" : "pending",
        urgent: entry.urgent || false,
        diagnosticNo: entry.diagnosticNo || entry.accessionNo || "-",
        bt: saved.bt ?? saved.BT ?? "",
        ct: saved.ct ?? saved.CT ?? "",
        pt: saved.pt ?? saved.PT ?? "",
        inr: saved.inr ?? saved.INR ?? "",
        aptt: saved.aptt ?? saved.APTT ?? "",
      };
    });
  }, [masterEntries, coagDocs, localScans, savedSet]);

  const triggerCritical = (entry) => {
    const { bt, ct, pt, inr, aptt } = entry;
    let resultsArr = [];
    if (bt && bt !== "MM:SS") resultsArr.push(`BT: ${bt}`);
    if (ct && ct !== "MM:SS") resultsArr.push(`CT: ${ct}`);
    if (pt) resultsArr.push(`PT: ${pt}`);
    if (inr) resultsArr.push(`INR: ${inr}`);
    if (aptt) resultsArr.push(`APTT: ${aptt}`);

    const suggested = resultsArr.join(", ");
    const parameter = window.prompt("Confirm Critical Values (Alert will be sent upon clicking Save):", suggested);
    if (!parameter) return;

    const regKey = entry.compositeKey;
    setCoagDocs(prev => ({
      ...prev,
      [regKey]: { ...(prev[regKey] || {}), pendingCriticalParam: parameter }
    }));
    alert("Critical values confirmed. They will be sent to the Critical UI when you click 'Save'.");
  };

  const handleSave = async (patient) => {
    try {
      const regKey = patient.compositeKey;
      const ref = doc(db, "coagulation_register", regKey);
      const relevant = getRelevantCoagTests(patient);
      
      const rawLocalTime = localScanTimes[regKey];
      const scanTime = rawLocalTime ? new Date(rawLocalTime) : null;
      
      const hasPendingCritical = !!patient.pendingCriticalParam;
      const isCritical = (criticalReportedSet.has(regKey) || hasPendingCritical) ? "Yes" : "No";

      let resultsArr = [];
      if (patient.bt && patient.bt !== "MM:SS") resultsArr.push(`BT: ${patient.bt}`);
      if (patient.ct && patient.ct !== "MM:SS") resultsArr.push(`CT: ${patient.ct}`);
      if (patient.pt) resultsArr.push(`PT: ${patient.pt}`);
      if (patient.inr) resultsArr.push(`INR: ${patient.inr}`);
      if (patient.aptt) resultsArr.push(`APTT: ${patient.aptt}`);
      const resultsString = resultsArr.join(" | ");

      const payload = {
        regNo: patient.regNo,
        diagnosticNo: patient.diagnosticNo || "-",
        name: patient.name || "",
        age: patient.age || "",
        ageUnit: patient.ageUnit || "",
        gender: patient.gender || "-",
        source: patient.source || "-",
        category: patient.category || "-",
        selectedTests: relevant,
        bt: patient.bt || "",
        ct: patient.ct || "",
        pt: patient.pt || "",
        inr: patient.inr || "",
        aptt: patient.aptt || "",
        results: resultsString,
        scanned: "Yes",
        scannedTime: scanTime ? Timestamp.fromDate(scanTime) : (patient.scannedTime || null),
        saved: "Yes",
        savedTime: serverTimestamp(), 
        timePrinted: patient.timePrinted || null,
        timeCollected: patient.timeCollected || null,
        status: "saved",
        critical: isCritical 
      };

      await setDoc(ref, payload, { merge: true });

      if (hasPendingCritical) {
        const criticalId = `${regKey}_${CURRENT_DEPT}`;
        await setDoc(doc(db, "critical_alerts", criticalId), {
          name: patient.name || "",
          regNo: patient.regNo,
          diagnosticNo: patient.diagnosticNo || "—",
          age: patient.age || "",
          ageUnit: patient.ageUnit || "",
          gender: patient.gender || "-",
          doctor: patient.doctor || "Self",
          category: patient.category || "-",
          source: patient.source || "-",
          timePrinted: patient.timePrinted || null,
          timeCollected: patient.timeCollected || null,
          criticalParameter: patient.pendingCriticalParam,
          flaggedAt: serverTimestamp(),
          status: "Pending",
          dept: CURRENT_DEPT,
          selectedTests: relevant
        });
      }

      setCoagDocs(prev => {
        const next = {...prev};
        if(next[regKey]) delete next[regKey].pendingCriticalParam;
        return next;
      });

      setLocalScans(prev => {
        const next = {...prev};
        delete next[regKey];
        localStorage.setItem("coagulation_localScans", JSON.stringify(next));
        return next;
      });

      setLocalScanTimes(prev => {
        const next = {...prev};
        delete next[regKey];
        localStorage.setItem("coagulation_localScanTimes", JSON.stringify(next));
        return next;
      });

      alert(`✅ Saved Coagulation entry for ${patient.name || patient.regNo}`);
    } catch (err) {
      console.error("❌ Error saving:", err);
      alert("Failed to save record.");
    }
  };

  const formatTimeInput = (value) => {
    let cleaned = value.replace(/[^\d:]/g, "");
    if (cleaned.length > 5) cleaned = cleaned.slice(0, 5);
    if (cleaned.indexOf(":") === -1) {
      if (cleaned.length === 3) cleaned = `${cleaned.slice(0, 1)}:${cleaned.slice(1, 3)}`;
      else if (cleaned.length >= 4) cleaned = `${cleaned.slice(0, 2)}:${cleaned.slice(2)}`;
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
    
    setCoagDocs(prev => ({
      ...prev,
      [patient.compositeKey]: { ...(prev[patient.compositeKey] || {}), [field]: formattedValue }
    }));

    let newCursor = cursor;
    if (formattedValue.length > oldValue.length && formattedValue.charAt(cursor) === ':') newCursor = cursor + 1; 
    else if (formattedValue.length < oldValue.length) newCursor = Math.max(0, cursor - (oldValue.length - formattedValue.length));
    
    setTimeout(() => {
        if (input === document.activeElement) {
            const finalPosition = Math.min(newCursor, formattedValue.length);
            input.setSelectionRange(finalPosition, finalPosition);
        }
    }, 0); 
  };
  
  const handleFocus = (e) => {
    if (!e.target.value || e.target.value === "MM:SS") {
        e.target.setSelectionRange(0, 0); 
    }
  };

  const filteredPatients = patients
    .filter((p) => {
      if (regSearch.trim()) {
        const key = String(p.regNo).toLowerCase();
        const acc = String(p.diagnosticNo || "").toLowerCase();
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

  if (loading) return <p>Loading Coagulation data...</p>;

  return (
    <div className="coag-container">
      <h2 className="dept-header">Coagulation Department</h2>

      <div className="filter-bar">
        <input
          className="reg-search"
          placeholder="Search Reg or Diag No..."
          value={regSearch}
          onChange={(e) => setRegSearch(e.target.value)}
        />
        <div className="date-filters">
          <label>Date:</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span>to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="source-buttons">
          {["OPD", "IPD", "Third Floor", "All"].map((src) => (
            <button
              key={src}
              className={`source-btn ${sourceFilter === src ? "active" : ""}`}
              onClick={() => setSourceFilter(src)}
            >
              {src}
            </button>
          ))}
        </div>
      </div>

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
              <th>Critical</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredPatients.map((p) => {
              const relevant = getRelevantCoagTests(p);
              const key = p.compositeKey;
              const isSaved = p.status === "saved";
              const isScanned = p.scanned === "Yes";
              const isCriticalReported = criticalReportedSet.has(key);
              const isPendingCritical = !!p.pendingCriticalParam;
              const requiredFields = getRequiredFields(relevant);
              const missingRequired = !areRequiredFieldsFilled(p, requiredFields);

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
                        : (e) => setCoagDocs(prev => ({
                            ...prev,
                            [p.compositeKey]: { ...(prev[p.compositeKey] || {}), [field]: e.target.value }
                          })) 
                    }
                    onFocus={isBTCT ? handleFocus : undefined}
                    placeholder={isBTCT ? "MM:SS" : ""}
                  />
                );
              };

              return (
                <tr key={p.compositeKey} className={isSaved ? "row-green" : isScanned ? "row-yellow" : "row-normal"}>
                  <td className="sticky-col" style={p.urgent ? { borderLeft: "4px solid red" } : {}}>{p.regNo || "-"}</td>
                  <td className="sticky-col">{p.diagnosticNo || "-"}</td>
                  <td className="sticky-col col-name">{p.name || "-"}</td>
                  <td>{p.age} {p.ageUnit}</td>
                  <td>{p.gender || "-"}</td>
                  <td>{p.source || "-"}</td>
                  <td className="col-tests">{relevant.join(", ") || "-"}</td>
                  <td>{renderField("bt")}</td>
                  <td>{renderField("ct")}</td>
                  <td>{renderField("pt")}</td>
                  <td>{renderField("inr")}</td>
                  <td>{renderField("aptt")}</td>
                  <td>
                    <select
                      value={isScanned ? "Yes" : "No"}
                      disabled={isSaved}
                      onChange={(e) => {
                        const value = e.target.value;
                        const now = new Date().toISOString(); 
                        setLocalScans((prev) => {
                          const updated = { ...prev, [key]: value };
                          localStorage.setItem("coagulation_localScans", JSON.stringify(updated));
                          return updated;
                        });
                        setLocalScanTimes((prev) => {
                          const updatedTimes = { ...prev, [key]: value === "Yes" ? now : null };
                          localStorage.setItem("coagulation_localScanTimes", JSON.stringify(updatedTimes));
                          return updatedTimes;
                        });
                      }}
                    >
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

                  <td>
                    <button
                      onClick={() => triggerCritical(p)}
                      disabled={isCriticalReported || isPendingCritical || isSaved || !isScanned || missingRequired}
                      className="critical-btn"
                      style={{ 
                        backgroundColor: (isCriticalReported || isPendingCritical || isSaved || !isScanned || missingRequired) ? "#ccc" : "#d9534f"
                      }}
                    >
                      Critical
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
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}