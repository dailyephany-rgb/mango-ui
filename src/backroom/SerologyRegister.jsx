
import React, { useState, useEffect, useMemo } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  setDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import routing from "../backroom_routing.json";
import "./Backroom.css";

// 🚨 Define the unique key for this department
const CURRENT_DEPT = "Serology";

// CSS to allow horizontal scrolling and trigger the sticky logic from Backroom.css
const tableFixStyles = `
.table-scroll-container {
  width: 100%;
  overflow-x: auto;
  overflow-y: auto;
  max-height: 80vh;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: white;
  position: relative;
}
.backroom-table {
  width: 100%;
  min-width: 1600px; 
  border-collapse: separate; 
  border-spacing: 0;
}
.critical-btn {
  background-color: #ef4444 !important;
  color: white !important;
  border: none;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  font-size: 12px;
  width: 100%;
}
.critical-btn:disabled {
  background-color: #fca5a5 !important;
  cursor: not-allowed;
}
`;

export default function SerologyRegister() {
  const [masterEntries, setMasterEntries] = useState([]);
  const [serologyDocs, setSerologyDocs] = useState({});
  const [saving, setSaving] = useState(false);

  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const [localScans, setLocalScans] = useState({});
  const [localScanTimes, setLocalScanTimes] = useState({}); 
  const [criticalReportedSet, setCriticalReportedSet] = useState(new Set());
  const [pendingCriticalMap, setPendingCriticalMap] = useState({});

  const testsForRegister = routing.SerologyRegister || [
    "HBSAG CARD",
    "HCV CARD",
    "HIV CARD",
    "VDRL (SERUM)",
    "OCCULT BLOOD"
  ];

  const normalize = (s = "") =>
    s.toLowerCase().replace(/[\s,._()-]+/g, "").trim();

  const getSerologySelectedTests = (selectedTests = []) => {
    return selectedTests.filter((testObj) => {
      const name = typeof testObj === "string" ? testObj : testObj?.test || "";
      const n = normalize(name);

      const overlapMarkers = ["hbsag", "hcv", "hiv"];
      const isOverlap = overlapMarkers.some(marker => n.includes(marker));
      if (isOverlap && !n.includes("card")) return false;

      return testsForRegister.some((ref) =>
        normalize(ref).includes(n) || n.includes(normalize(ref))
      );
    });
  };

  const normalizeSource = (raw) => {
    if (!raw) return "Unknown";
    const s = raw.toLowerCase();
    if (s.includes("opd")) return "OPD";
    if (s.includes("ipd")) return "IPD";
    if (s.includes("third") || s.includes("3rd")) return "Third Floor";
    return "Unknown";
  };

  const parseDate = (entry) => {
    const fields = [entry.timePrinted, entry.timeCollected, entry.scannedTime, entry.savedTime, entry.createdAt];
    for (const f of fields) {
      if (!f) continue;
      if (typeof f === "object" && f?.toDate) return f.toDate();
      if (typeof f === "string" || f instanceof Date) {
        const d = new Date(f);
        if (!isNaN(d)) return d;
      }
      if (f?.seconds) return new Date(f.seconds * 1000);
    }
    return null;
  };

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
  }, []);

  useEffect(() => {
    const unsubMaster = onSnapshot(collection(db, "master_register"), (snap) => {
      setMasterEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubSerology = onSnapshot(collection(db, "serology_register"), (snap) => {
      const data = {};
      snap.docs.forEach(d => { data[d.id] = d.data(); });
      setSerologyDocs(data);
    });

    const unsubCritical = onSnapshot(collection(db, "critical_alerts"), (snap) => {
      const cSet = new Set();
      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.regNo && String(data.dept).toLowerCase() === CURRENT_DEPT.toLowerCase()) {
          cSet.add(String(data.regNo));
        }
      });
      setCriticalReportedSet(cSet);
    });

    return () => {
      unsubMaster();
      unsubSerology();
      unsubCritical();
    };
  }, []);

  const mergedEntries = useMemo(() => {
    const filtered = masterEntries.filter((entry) => getSerologySelectedTests(entry.selectedTests || []).length > 0);

    return filtered.map((entry) => {
      const regNo = String(entry.regNo || entry.id);
      const saved = serologyDocs[regNo] || {};
      const localScan = localScans[regNo];

      return {
        ...entry,
        ...saved,
        regNo,
        diagnosticNo: entry.diagnosticNo || entry.accNo || "-",
        source: normalizeSource(entry.source || entry.category),
        results: saved.results || entry.results || { hbsag: "-", hcv: "-", hiv: "-", vdrl: "-", occultblood: "-" },
        scanned: localScan ?? saved.scanned ?? "No",
        scannedTime: saved.scannedTime || null, 
        urgent: entry.urgent || false,
        status: (saved.saved === "Yes" || saved.status === "saved") ? "saved" : localScan === "Yes" ? "scanned" : saved.status || "pending",
        pendingCriticalParam: pendingCriticalMap[regNo]
      };
    });
  }, [masterEntries, serologyDocs, localScans, pendingCriticalMap]);

  const requiredKeys = (entry) => {
    const keys = new Set();
    const selected = getSerologySelectedTests(entry.selectedTests || []);
    selected.forEach((t) => {
      const n = normalize(typeof t === "object" ? t.test : t);
      if (n.includes("hbsag")) keys.add("hbsag");
      if (n.includes("hcv")) keys.add("hcv");
      if (n.includes("hiv")) keys.add("hiv"); 
      if (n.includes("vdrl")) keys.add("vdrl"); 
      if (n.includes("occultblood") || n.includes("occult")) keys.add("occultblood");
    });
    return [...keys];
  };

  const areRequiredFieldsFilled = (entry) => {
    return requiredKeys(entry).every((k) => entry.results?.[k] && entry.results[k] !== "-" && entry.results[k] !== "Pending");
  };

  const handleChange = (regNo, field, value) => {
    setSerologyDocs(prev => ({
      ...prev,
      [regNo]: {
        ...(prev[regNo] || {}),
        results: { ...(prev[regNo]?.results || {}), [field]: value }
      }
    }));
  };

  const handleScan = (regNo, value) => {
    const scanTime = value === "Yes" ? new Date() : null;
    setLocalScans((prev) => ({ ...prev, [regNo]: value }));
    setLocalScanTimes((prev) => ({ ...prev, [regNo]: scanTime }));
  };

  const triggerCritical = (entry) => {
    const relevantKeys = requiredKeys(entry);
    let suggested = "";
    relevantKeys.forEach(k => {
      if (entry.results[k] && entry.results[k] !== "-" && entry.results[k] !== "Pending") {
        suggested += `${k.toUpperCase()}: ${entry.results[k]} `;
      }
    });

    const parameter = window.prompt("Confirm Critical Values (Alert will be sent upon clicking Save):", suggested.trim());
    if (!parameter) return;

    setPendingCriticalMap(prev => ({ ...prev, [entry.regNo]: parameter }));
    alert("Critical values confirmed. They will be sent to the Critical UI when you click 'Save'.");
  };

  const handleSave = async (entry) => {
    try {
      setSaving(true);
      const regNo = entry.regNo;
      const scanTime = localScanTimes[regNo] || (entry.scannedTime?.toDate ? entry.scannedTime.toDate() : (entry.scannedTime ? new Date(entry.scannedTime) : null));

      if (entry.scanned !== "Yes") {
        alert("Please scan before saving.");
        return;
      }
      if (!areRequiredFieldsFilled(entry)) {
        alert("Please fill all required serology result fields.");
        return;
      }

      const cleanedResults = Object.fromEntries(
        Object.entries(entry.results || {}).filter(
          ([_, val]) => val !== "-" && val !== "Pending" && val !== ""
        )
      );

      const simpleTests = getSerologySelectedTests(entry.selectedTests || []).map(t => 
        typeof t === "object" ? t.test : t
      );

      const hasPendingCritical = !!entry.pendingCriticalParam;
      const isCritical = (criticalReportedSet.has(regNo) || hasPendingCritical) ? "Yes" : "No";

      const { pendingCriticalParam, id, phone, tests, father, doctor, ...restOfEntry } = entry;

      const payload = {
        ...restOfEntry,
        selectedTests: simpleTests, 
        results: cleanedResults, 
        scanned: "Yes",
        scannedTime: scanTime ? Timestamp.fromDate(new Date(scanTime)) : null, 
        saved: "Yes",
        savedTime: serverTimestamp(),
        status: "saved",
        critical: isCritical
      };

      await setDoc(doc(db, "serology_register", regNo), payload, { merge: true });

      if (hasPendingCritical) {
        await setDoc(doc(db, "critical_alerts", `${regNo}_${CURRENT_DEPT}`), {
          name: entry.name || "",
          regNo: regNo,
          diagnosticNo: entry.diagnosticNo || "—",
          age: entry.age || "",
          ageUnit: entry.ageUnit || "",
          gender: entry.gender || "-",
          category: entry.category || "-",
          source: entry.source || "-",
          doctor: entry.doctor || "Self",
          timePrinted: entry.timePrinted || null,
          timeCollected: entry.timeCollected || null,
          criticalParameter: entry.pendingCriticalParam,
          flaggedAt: serverTimestamp(),
          status: "Pending",
          dept: CURRENT_DEPT,
          selectedTests: simpleTests
        });
      }

      setPendingCriticalMap(prev => { const n = {...prev}; delete n[regNo]; return n; });
      alert(`✅ Saved Serology entry for ${entry.name} ${hasPendingCritical ? "(Critical Alert Sent)" : ""}`);
    } catch (e) {
      console.error(e);
      alert("Error saving Serology entry.");
    } finally {
      setSaving(false);
    }
  };

  const filteredEntries = mergedEntries
    .filter((e) => {
      if (regSearch) {
        const search = regSearch.toLowerCase();
        if (!String(e.regNo).toLowerCase().includes(search) && 
            !String(e.diagnosticNo).toLowerCase().includes(search))
          return false;
      }
      if (sourceFilter !== "All" && e.source !== sourceFilter) return false;
      const d = parseDate(e);
      if (d) {
        if (dateFrom && d < new Date(dateFrom + "T00:00:00")) return false;
        if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      const dateA = parseDate(a);
      const dateB = parseDate(b);
      return (dateA || 0) - (dateB || 0);
    });

  const hasTest = (entry, searchKey) => {
    const selected = getSerologySelectedTests(entry.selectedTests || []);
    return selected.some((t) => {
      const name = typeof t === "object" ? t.test : t;
      return normalize(name).includes(normalize(searchKey));
    });
  };

  return (
    <div className="register-section">
      <style>{tableFixStyles}</style>
      <h3>🧬 Serology Register</h3>
      
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
            <button 
              key={src} 
              className={sourceFilter === src ? "source-btn active" : "source-btn"} 
              onClick={() => setSourceFilter(src)}
            >
              {src}
            </button>
          ))}
        </div>
      </div>

      <div className="table-scroll-container">
        <table className="backroom-table">
          <thead>
            <tr>
              <th className="sticky-col">Reg No</th>
              <th className="sticky-col">Diag No</th>
              <th className="sticky-col">Patient Name</th>
              <th>Age</th>
              <th>Gender</th>
              <th>Source</th>
              <th>Selected Tests</th>
              <th>HBsAg</th>
              <th>HCV Serum</th>
              <th>HIV</th>
              <th>VDRL</th>
              <th>Occult Blood</th>
              <th>Scanned</th>
              <th>Status</th>
              <th>Critical</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => {
              const regNo = e.regNo;
              const saved = e.status === "saved";
              const scanned = e.scanned === "Yes";
              const isCriticalReported = criticalReportedSet.has(regNo);
              const isPendingCritical = !!e.pendingCriticalParam;
              const missingRequired = !areRequiredFieldsFilled(e);

              return (
                <tr key={regNo} className={saved ? "row-green" : scanned ? "row-yellow" : "row-normal"}>
                  <td className="sticky-col" style={e.urgent ? { borderLeft: "4px solid red" } : {}}>{e.regNo}</td>
                  <td className="sticky-col" style={{ color: "#475569" }}>{e.diagnosticNo}</td>
                  <td className="sticky-col">{e.name}</td>
                  <td>{e.age} {e.ageUnit}</td>
                  <td>{e.gender}</td>
                  <td>{e.source}</td>
                  <td>{getSerologySelectedTests(e.selectedTests || []).map(t => (typeof t === "object" ? t.test : t)).join(", ") || "—"}</td>
                  {[
                    { key: "hbsag", label: "hbsag" },
                    { key: "hcv",   label: "hcv" },
                    { key: "hiv",   label: "hiv" }, 
                    { key: "vdrl",  label: "vdrl" },
                    { key: "occultblood", label: "occult" }
                  ].map(({ key, label }) => (
                    <td key={key}>
                      {hasTest(e, label) ? (
                        <select value={e.results[key] || "Pending"} disabled={!scanned || saved} onChange={(ev) => handleChange(regNo, key, ev.target.value)}>
                          <option>Pending</option>
                          <option>Positive</option>
                          <option>Negative</option>
                        </select>
                      ) : ("—")}
                    </td>
                  ))}
                  <td>
                    <select value={scanned ? "Yes" : "No"} disabled={saved} onChange={(ev) => handleScan(regNo, ev.target.value)}>
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
                      onClick={() => triggerCritical(e)}
                      disabled={isCriticalReported || isPendingCritical || saved || !scanned || missingRequired}
                      className="critical-btn"
                    >
                      Critical
                    </button>
                  </td>

                  <td>
                    <button 
                      className="save-btn" 
                      disabled={saving || saved || !scanned || missingRequired} 
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
  );
}