
import React, { useEffect, useState } from "react";
import "./Haematology.css";
import { db } from "../firebaseConfig.js";
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

// 🚨 Define the unique key for this department
const CURRENT_DEPT = "Haematology";

export default function Haematology() {
  const [activeTab, setActiveTab] = useState("3-part");
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  // State to track which entries have been marked critical FOR THIS DEPT
  const [criticalReportedSet, setCriticalReportedSet] = useState(new Set());
  // State to temporarily hold the critical parameter until "Save" is pressed
  const [criticalParams, setCriticalParams] = useState({});

  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  // UPDATE: Load localScans and localScanTimes from LocalStorage to survive refresh
  const [localScans, setLocalScans] = useState(() => {
    const saved = localStorage.getItem("haematology_localScans");
    return saved ? JSON.parse(saved) : {};
  });
  
  const [localScanTimes, setLocalScanTimes] = useState(() => {
    const saved = localStorage.getItem("haematology_localScanTimes");
    return saved ? JSON.parse(saved) : {};
  });

  const [savedSet, setSavedSet] = useState(new Set());

  const HAEM_TESTS_CANON = ["haemogram", "hb haemoglobin", "lamellar body count"];

  // HELPER: Prevent Firebase segment errors by replacing / with -
  const safeKey = (val) => String(val || "").replace(/\//g, "-");

  const normalize = (s = "") =>
    String(s)
      .toLowerCase()
      .replace(/[\s,._\-\(\)]+/g, " ")
      .replace(/fluid/g, "")
      .trim();

  const extractTestName = (t) => {
    if (!t) return "";
    if (typeof t === "string") return t;
    if (typeof t === "object" && (t.test || t.name)) return t.test || t.name;
    return "";
  };

  const entryHasCanonicalTest = (entry, canonical) => {
    const target = normalize(canonical);
    const arr = entry.selectedTests || [];
    return arr.some((x) => {
      const raw = extractTestName(x);
      return normalize(raw).includes(target) || target.includes(normalize(raw));
    });
  };

  const getEntryCanonicalTests = (entry) =>
    HAEM_TESTS_CANON.filter((c) => entryHasCanonicalTest(entry, c));

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
    // FIX: Set local date to roll over at midnight local time
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const today = `${y}-${m}-${d}`;

    setDateFrom(today);
    setDateTo(today);
  }, []);

  useEffect(() => {
    const unsubMaster = onSnapshot(
      collection(db, "master_register"),
      async (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const haemEntries = all.filter((entry) =>
          (entry.selectedTests || []).some((t) =>
            HAEM_TESTS_CANON.some((c) =>
              normalize(extractTestName(t)).includes(normalize(c))
            )
          )
        );

        const merged = await Promise.all(
          haemEntries.map(async (entry) => {
            const regNo = entry.regNo || entry.regno || entry.RegNo || entry.Regno || entry.id;
            const diagnosticNo = entry.diagnosticNo || "-";
            
            // FIX: Sanitize the compositeKey immediately
            const compositeKey = safeKey(`${regNo}_${diagnosticNo}`);
            
            const timePrinted = entry.timePrinted || null;
            const timeCollected = entry.timeCollected || null;

            const ref = doc(db, "haematology_register", compositeKey);
            const snapDoc = await getDoc(ref);

            const base = {
              ...entry,
              regNo: String(regNo),
              compositeKey: compositeKey,
              accessionNo: diagnosticNo,
              source: normalizeSource(entry.source || entry.category),
              scanned: localScans[compositeKey] ?? "No",
              status: "pending",
              urgent: entry.urgent || false, 
              timePrinted,
              timeCollected,
            };

            if (snapDoc.exists()) {
              const data = snapDoc.data();
              const isSaved =
                data.saved === "Yes" || data.status?.toLowerCase() === "saved";
              const currentScanned =
                localScans[compositeKey] ?? data.scanned ?? "No";

              return {
                ...base,
                ...data,
                scanned: currentScanned,
                status: isSaved
                  ? "saved"
                  : currentScanned === "Yes"
                  ? "scanned"
                  : "pending",
                timePrinted: data.timePrinted || timePrinted,
                timeCollected: data.timeCollected || timeCollected,
              };
            }

            return base;
          })
        );

        setPatients(merged);
        setLoading(false);
      }
    );

    const unsubHaem = onSnapshot(
      collection(db, "haematology_register"),
      (snap) => {
        const s = new Set();
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data?.saved === "Yes" || data?.status === "saved") {
            const key = d.id;
            s.add(key);
          }
        });
        setSavedSet(s);
      }
    );

    const unsubCritical = onSnapshot(collection(db, "critical_alerts"), (snap) => {
      const cSet = new Set();
      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.regNo && String(data.dept).toLowerCase() === CURRENT_DEPT.toLowerCase()) {
          // FIX: Sanitize search key for consistency
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
  }, [localScans]);

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

    setPatients((prev) =>
      prev.map((p) =>
        p.compositeKey === compositeKey
          ? {
              ...p,
              scanned: value,
              status: value === "Yes" ? "scanned" : "pending",
            }
          : p
      )
    );
  };

  const triggerCritical = async (entry) => {
    const parameter = window.prompt("Enter Critical Parameter & Value (e.g., HB: 4.2):");
    if (!parameter) return;

    const regKey = entry.compositeKey;
    setCriticalParams(prev => ({ ...prev, [regKey]: parameter }));
    setCriticalReportedSet(prev => new Set(prev).add(regKey));
    alert("Parameter captured. This will be sent to Critical Alerts when you click 'Save'.");
  };

  const handleSave = async (compositeKey) => {
    try {
      const patient = patients.find((p) => p.compositeKey === compositeKey);
      if (!patient) return;
      
      const isScanned = localScans[compositeKey] === "Yes" || patient.scanned === "Yes";
      if (!isScanned) {
        alert("Please scan before saving.");
        return;
      }

      const isCritical = (criticalReportedSet.has(compositeKey) || criticalParams[compositeKey]) ? "Yes" : "No";
      const canonicalTests = getEntryCanonicalTests(patient);

      if (criticalParams[compositeKey]) {
        // FIX: Re-verify key is safe for path
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
            timePrinted: patient.timePrinted || null,
            timeCollected: patient.timeCollected || null,
            criticalParameter: criticalParams[compositeKey],
            flaggedAt: serverTimestamp(),
            status: "Pending",
            dept: CURRENT_DEPT,
            selectedTests: canonicalTests,
        });
      }
      
      const rawLocalTime = localScanTimes[compositeKey];
      const scanTime = rawLocalTime ? new Date(rawLocalTime) : null;

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
          scanned: "Yes",
          scannedTime: scanTime ? Timestamp.fromDate(scanTime) : (patient.scannedTime || null),
          saved: "Yes",
          savedTime: serverTimestamp(),
          timePrinted: patient.timePrinted || null,
          timeCollected: patient.timeCollected || null,
          status: "saved",
          critical: isCritical
        },
        { merge: true }
      );
      
      setLocalScans((prev) => {
        const updated = { ...prev };
        delete updated[compositeKey];
        localStorage.setItem("haematology_localScans", JSON.stringify(updated));
        return updated;
      });

      setLocalScanTimes((prev) => {
        const updated = { ...prev };
        delete updated[compositeKey];
        localStorage.setItem("haematology_localScanTimes", JSON.stringify(updated));
        return updated;
      });

      setCriticalParams(prev => { const n = {...prev}; delete n[compositeKey]; return n; });
      
      setSavedSet((prev) => new Set(prev).add(compositeKey));
      alert(`Saved ${patient.name || patient.regNo} successfully! ${isCritical === "Yes" ? "(Critical Alert Sent)" : ""}`);
    } catch (err) {
      console.error("🔥 Save Error:", err);
      alert(`Error saving Haematology entry: ${err.message}`);
    }
  };

  const threePart = patients.filter((p) => is3PartRequired(p.age, p.ageUnit));
  const fivePart = patients.filter((p) => !is3PartRequired(p.age, p.ageUnit));

  const filteredPatients =
    (activeTab === "3-part" ? threePart : fivePart)
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
        if (a.urgent !== b.urgent) {
          return a.urgent ? -1 : 1;
        }
        const dateA = parseDate(a);
        const dateB = parseDate(b);
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA - dateB;
      });

  if (loading) return <p>Loading Haematology data...</p>;

  return (
    <div className="haem-container">
      <div className="header">
        <h2>🩸 Haematology Department</h2>
        <div className="tabs">
          <button className={activeTab === "3-part" ? "active" : ""} onClick={() => setActiveTab("3-part")}>
            3-Part Machine
          </button>
          <button className={activeTab === "5-part" ? "active" : ""} onClick={() => setActiveTab("5-part")}>
            5-Part Machine
          </button>
        </div>
      </div>

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
                <th>Status</th>
                <th>Critical</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.length > 0 ? (
                filteredPatients.map((p) => {
                  const regKey = p.compositeKey;
                  const selCanon = getEntryCanonicalTests(p);
                  const isSaved = p.status === "saved";
                  const isScanned = p.scanned === "Yes";
                  const isCriticalReported = criticalReportedSet.has(regKey);
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
                      <td>{selCanon.some((t) => normalize(t).includes("haemogram")) ? "✅" : "—"}</td>
                      <td>{selCanon.some((t) => normalize(t).includes("hb haemoglobin")) ? "✅" : "—"}</td>
                      <td>{selCanon.some((t) => normalize(t).includes("lamellar body count")) ? "✅" : "—"}</td>
                      <td>
                        <select value={isScanned ? "Yes" : "No"} disabled={isSaved} onChange={(e) => handleScan(p.compositeKey, e.target.value)}>
                          <option value="No">No</option>
                          <option value="Yes">Yes</option>
                        </select>
                      </td>
                      
                      <td style={{ textAlign: 'center' }}>
                        {isCriticalReported && (
                          <span style={{ color: 'red', fontWeight: 'bold', fontSize: '10px' }}>
                            CRITICAL <br /> {isSaved ? "REPORTED" : "PENDING SAVE"}
                          </span>
                        )}
                      </td>

                      <td>
                        <button
                          onClick={() => triggerCritical(p)}
                          disabled={isCriticalReported || isSaved || !isScanned}
                          className="critical-btn"
                        >
                          Critical
                        </button>
                      </td>

                      <td>
                        <button className="save-btn" disabled={isSaved || !isScanned} onClick={() => handleSave(p.compositeKey)}>Save</button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="14" style={{ textAlign: "center", padding: 20 }}>
                    No Haematology entries found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}