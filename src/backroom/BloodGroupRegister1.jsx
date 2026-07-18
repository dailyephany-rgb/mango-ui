
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
import "./Backroom.css";

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
  min-width: 1200px; 
  border-collapse: separate; 
  border-spacing: 0;
}
`;

export default function BloodGroupRegister() {
  const [masterEntries, setMasterEntries] = useState([]);
  const [testingDocs, setTestingDocs] = useState({});
  const [retestingDocs, setRetestingDocs] = useState({});
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("testing");

  // 🛡️ INTERNAL BUFFER: Shields dropdown selections from cloud sync wipes
  const [localResults, setLocalResults] = useState(() => {
    const saved = localStorage.getItem("bloodgroup_localResults");
    return saved ? JSON.parse(saved) : {};
  });

  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  // UPDATE: Load localScans from LocalStorage to survive refresh
  const [localScans, setLocalScans] = useState(() => {
    const saved = localStorage.getItem("bloodgroup_localScans");
    return saved ? JSON.parse(saved) : {};
  });
  
  // FINAL FIX: Persist localScanTimes to survive refresh
  const [localScanTimes, setLocalScanTimes] = useState(() => {
    const saved = localStorage.getItem("bloodgroup_localScanTimes");
    return saved ? JSON.parse(saved) : {};
  });

  const normalizeSource = (raw) => {
    if (!raw) return "Unknown";
    const s = raw.trim().toLowerCase();
    if (s.includes("opd")) return "OPD";
    if (s.includes("ipd")) return "IPD";
    if (s.includes("third") || s.includes("3rd")) return "Third Floor";
    return "Unknown";
  };

  const parseDate = (entry) => {
    const f = entry.timePrinted;
    if (!f) return null;
    if (f?.toDate) return f.toDate();
    if (typeof f === "string" || f instanceof Date) {
      const d = new Date(f);
      return isNaN(d) ? null : d;
    }
    if (f?.seconds) return new Date(f.seconds * 1000);
    return null;
  };

  useEffect(() => {
    // FIX: Get local date instead of UTC ISO date to ensure midnight rollover
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const today = `${y}-${m}-${d}`;
    
    setDateFrom(today);
    setDateTo(today);
  }, []);

  useEffect(() => {
    const unsubMaster = onSnapshot(collection(db, "master_register"), (snap) => {
      setMasterEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubTesting = onSnapshot(collection(db, "bloodgroup_testing_register"), (snap) => {
      const data = {};
      snap.docs.forEach(d => { data[d.id] = d.data(); });
      setTestingDocs(data);
    });

    const unsubRetesting = onSnapshot(collection(db, "bloodgroup_retesting_register"), (snap) => {
      const data = {};
      snap.docs.forEach(d => { data[d.id] = d.data(); });
      setRetestingDocs(data);
    });

    return () => {
      unsubMaster();
      unsubTesting();
      unsubRetesting();
    };
  }, []);

  const allMergedData = useMemo(() => {
    const bloodRows = masterEntries.filter(e =>
      Array.isArray(e.selectedTests) &&
      e.selectedTests.some(t =>
        (typeof t === "string" ? t : t?.test || "").toLowerCase().includes("abo group")
      )
    );

    return bloodRows.map(entry => {
      const reg = String(entry.regNo || entry.id);
      const diag = entry.diagnosticNo || entry.accNo || "—";
      // UPDATE: Composite key for unique identification
      const compositeKey = `${reg}_${diag}`;

      const base = {
        ...entry,
        regNo: reg,
        diagnosticNo: diag,
        compositeKey: compositeKey,
        source: normalizeSource(entry.source),
        bloodGroup: "",
        rhFactor: "",
        result: "",
        scanned: "No",
        saved: "No",
        status: "pending",
        urgent: entry.urgent || false,
        timePrinted: entry.timePrinted ?? null,
        timeCollected: entry.timeCollected ?? null,
      };

      const build = (storedData, tab) => {
        // Tracker uses tab + compositeKey
        const scanKey = `${tab}_${compositeKey}`;
        const typing = localResults[scanKey] || {}; 
        
        let row = { ...base, ...storedData, ...typing };
        row.scanned = localScans[scanKey] ?? row.scanned ?? "No";
        row.status = row.saved === "Yes" ? "saved" : row.scanned === "Yes" ? "scanned" : "pending";
        
        if (row.bloodGroup && row.rhFactor) {
            row.result = `${row.bloodGroup} ${row.rhFactor === "Positive" ? "+" : "-"}`;
        }

        return row;
      };

      return {
        testingData: build(testingDocs[compositeKey] || {}, "testing"),
        retestingData: build(retestingDocs[compositeKey] || {}, "retesting")
      };
    });
  }, [masterEntries, testingDocs, retestingDocs, localScans, localResults]);

  const activeEntries = useMemo(() => 
    allMergedData.map(m => activeTab === "testing" ? m.testingData : m.retestingData)
  , [allMergedData, activeTab]);

  const handleChange = (tab, compositeKey, field, value) => {
    const key = `${tab}_${compositeKey}`;
  
    setLocalResults(prev => {
      const updated = {
        ...prev,
        [key]: {
          ...(prev[key] || {}),
          [field]: value
        }
      };
  
      localStorage.setItem(
        "bloodgroup_localResults",
        JSON.stringify(updated)
      );
  
      return updated;
    });
  };

  // UPDATE: Writes both Scan status and Time to LocalStorage using compositeKey
  const handleScan = (tab, compositeKey, value) => {
    const key = `${tab}_${compositeKey}`;
    const now = new Date().toISOString();

    setLocalScans(p => {
        const updated = { ...p, [key]: value };
        localStorage.setItem("bloodgroup_localScans", JSON.stringify(updated));
        return updated;
    });

    setLocalScanTimes(p => {
        const updatedTimes = { ...p, [key]: value === "Yes" ? now : null };
        localStorage.setItem("bloodgroup_localScanTimes", JSON.stringify(updatedTimes));
        return updatedTimes;
    });
  };

  const handleSave = async (tab, entry) => {
    try {
      setSaving(true);
      const compositeKey = entry.compositeKey;
      const key = `${tab}_${compositeKey}`;

      if (entry.scanned !== "Yes") {
        alert("Please scan before saving");
        return;
      }
      if (!entry.bloodGroup || !entry.rhFactor) {
        alert("Fill Blood Group & Rh Factor");
        return;
      }

      const rawLocalTime = localScanTimes[key];
      const scanTime = rawLocalTime ? new Date(rawLocalTime) : null;

      const filteredTests = (entry.selectedTests || [])
        .map((t) => (typeof t === "string" ? t : t?.test || ""))
        .filter((testName) => testName.toLowerCase().includes("abo group"));

      const payload = {
        ...entry,
        selectedTests: filteredTests,
        scanned: "Yes",
        scannedTime: scanTime ? Timestamp.fromDate(scanTime) : (entry.scannedTime || null),
        saved: "Yes",
        savedTime: serverTimestamp(),
        savedBy:  sessionStorage.getItem("loggedUser") || "Unknown",
        timeCollected: entry.timeCollected ?? null,
        status: "saved",
        type: tab,
      };

      const { tests, id, father, doctor, phone, ...dbPayload } = payload;
      const col = tab === "testing" ? "bloodgroup_testing_register" : "bloodgroup_retesting_register";

      // Save using compositeKey
      await setDoc(doc(db, col, compositeKey), dbPayload, { merge: true });
      
      setLocalResults(prev => {
        const n = { ...prev };
        delete n[key];
      
        localStorage.setItem(
          "bloodgroup_localResults",
          JSON.stringify(n)
        );
      
        return n;
      });
      
      // UPDATE: Cleanup LocalStorage after save
      setLocalScans(p => { 
        const n = {...p}; 
        delete n[key]; 
        localStorage.setItem("bloodgroup_localScans", JSON.stringify(n));
        return n; 
      });

      setLocalScanTimes(p => {
        const n = {...p};
        delete n[key];
        localStorage.setItem("bloodgroup_localScanTimes", JSON.stringify(n));
        return n;
      });
      
      alert(`Saved ${tab} entry for ${entry.name}`);
    } catch (err) {
      console.error(err);
      alert("Error saving data");
    } finally {
      setSaving(false);
    }
  };

  const filteredEntries = useMemo(() => {
    return activeEntries
      .filter((p) => {
        if (regSearch.trim()) {
          const searchStr = regSearch.trim().toLowerCase();
          if (!String(p.regNo).toLowerCase().includes(searchStr) && 
              !String(p.diagnosticNo).toLowerCase().includes(searchStr)) return false;
        }
        if (sourceFilter !== "All" && p.source !== sourceFilter) return false;
        
        const d = parseDate(p);
        if (!d) return false;
        
        // FIX: Format entry date as local YYYY-MM-DD
        const entryDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        
        if (dateFrom && entryDateStr < dateFrom) return false;
        if (dateTo && entryDateStr > dateTo) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
        const dateA = parseDate(a);
        const dateB = parseDate(b);
        return (dateA || 0) - (dateB || 0);
      });
  }, [activeEntries, regSearch, sourceFilter, dateFrom, dateTo]);

  const bloodGroups = ["A", "B", "AB", "O"];
  const rhFactors = ["Positive", "Negative"];

  return (
    <div className="register-section">
      <style>{tableFixStyles}</style>
      <h3>🩸 Blood Group & Rh Type Register</h3>

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
              className={sourceFilter === src ? "source-btn active" : "source-btn"}
              onClick={() => setSourceFilter(src)}
            >
              {src}
            </button>
          ))}
        </div>
      </div>

      <div className="tab-container">
        {["testing", "retesting"].map(tab => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="table-scroll-container">
        <table className="backroom-table">
          <thead>
            <tr>
              <th className="sticky-col">Reg No</th>
              <th className="sticky-col">Diag No</th>
              <th className="sticky-col">Name</th>
              <th>Age</th>
              <th>Gender</th>
              <th>Source</th>
              <th>Blood Group</th>
              <th>Rh</th>
              <th>Result</th>
              <th>Scanned</th>
              <th>Saved By</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => (
              <tr key={`${e.compositeKey}_${activeTab}`} className={e.saved === "Yes" ? "row-green" : e.scanned === "Yes" ? "row-yellow" : ""}>
                <td className="sticky-col" style={e.urgent ? { borderLeft: "4px solid red" } : {}}>{e.regNo}</td>
                <td className="sticky-col" style={{ color: "#475569" }}>{e.diagnosticNo}</td>
                <td className="sticky-col">{e.name}</td>
                <td>{e.age}</td>
                <td>{e.gender}</td>
                <td>{e.source}</td>
                <td>
                  <select
                    value={e.bloodGroup}
                    disabled={e.scanned !== "Yes" || e.saved === "Yes"}
                    onChange={(ev) => handleChange(activeTab, e.compositeKey, "bloodGroup", ev.target.value)}
                  >
                    <option value="">Select</option>
                    {bloodGroups.map((bg) => <option key={bg}>{bg}</option>)}
                  </select>
                </td>
                <td>
                  <select
                    value={e.rhFactor}
                    disabled={e.scanned !== "Yes" || e.saved === "Yes"}
                    onChange={(ev) => handleChange(activeTab, e.compositeKey, "rhFactor", ev.target.value)}
                  >
                    <option value="">Select</option>
                    {rhFactors.map((rh) => <option key={rh}>{rh}</option>)}
                  </select>
                </td>
                <td>{e.result}</td>
                <td>
                  <select
                    value={e.scanned}
                    disabled={e.saved === "Yes"}
                    onChange={(ev) => handleScan(activeTab, e.compositeKey, ev.target.value)}
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
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
                  <button className="save-btn" disabled={e.saved === "Yes" || saving} onClick={() => handleSave(activeTab, e)}>
                    Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}