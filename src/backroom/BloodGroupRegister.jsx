
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

  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sourceFilter, setSourceFilter] = useState("All");

  const [localScans, setLocalScans] = useState({});
  const [localScanTimes, setLocalScanTimes] = useState({});

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
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
  }, []);

  // Optimized: Listen to all collections separately to avoid nested getDocs
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

  // Memoized Merged Data: This is the secret to speed.
  const allMergedData = useMemo(() => {
    const bloodRows = masterEntries.filter(e =>
      Array.isArray(e.selectedTests) &&
      e.selectedTests.some(t =>
        (typeof t === "string" ? t : t?.test || "").toLowerCase().includes("abo group")
      )
    );

    return bloodRows.map(entry => {
      const reg = String(entry.regNo || entry.id);
      const base = {
        ...entry,
        regNo: reg,
        diagnosticNo: entry.diagnosticNo || entry.accNo || "—",
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
        let row = { ...base, ...storedData };
        const scanKey = `${tab}_${reg}`;
        row.scanned = localScans[scanKey] ?? row.scanned ?? "No";
        row.status = row.saved === "Yes" ? "saved" : row.scanned === "Yes" ? "scanned" : "pending";
        return row;
      };

      return {
        testingData: build(testingDocs[reg] || {}, "testing"),
        retestingData: build(retestingDocs[reg] || {}, "retesting")
      };
    });
  }, [masterEntries, testingDocs, retestingDocs, localScans]);

  const activeEntries = useMemo(() => 
    allMergedData.map(m => activeTab === "testing" ? m.testingData : m.retestingData)
  , [allMergedData, activeTab]);

  const handleChange = (tab, regNo, field, value) => {
    const setter = tab === "testing" ? setTestingDocs : setRetestingDocs;
    setter(prev => ({
      ...prev,
      [regNo]: {
        ...(prev[regNo] || {}),
        [field]: value,
        result: (field === "bloodGroup" || field === "rhFactor") 
          ? (field === "bloodGroup" ? value : (prev[regNo]?.bloodGroup || "")) && 
            (field === "rhFactor" ? value : (prev[regNo]?.rhFactor || ""))
            ? `${field === "bloodGroup" ? value : prev[regNo].bloodGroup} ${ (field === "rhFactor" ? value : prev[regNo].rhFactor) === "Positive" ? "+" : "-"}`
            : ""
          : (prev[regNo]?.result || "")
      }
    }));
  };

  const handleScan = (tab, regNo, value) => {
    const key = `${tab}_${regNo}`;
    setLocalScans(p => ({ ...p, [key]: value }));
    if (value === "Yes") setLocalScanTimes(p => ({ ...p, [key]: new Date() }));
  };

  const handleSave = async (tab, entry) => {
    try {
      setSaving(true);
      const reg = String(entry.regNo);
      const key = `${tab}_${reg}`;

      if (!localScans[key] && entry.scanned !== "Yes") {
        alert("Please scan before saving");
        return;
      }
      if (!entry.bloodGroup || !entry.rhFactor) {
        alert("Fill Blood Group & Rh Factor");
        return;
      }

      const filteredTests = (entry.selectedTests || [])
        .map((t) => (typeof t === "string" ? t : t?.test || ""))
        .filter((testName) => testName.toLowerCase().includes("abo group"));

      const payload = {
        ...entry,
        selectedTests: filteredTests,
        scanned: "Yes",
        scannedTime: Timestamp.fromDate(localScanTimes[key] || new Date()),
        saved: "Yes",
        savedTime: serverTimestamp(),
        timeCollected: entry.timeCollected ?? null,
        status: "saved",
        type: tab,
      };

      // UPDATED: Removed diagnosticNo from the excluded list so it is saved in dbPayload
      const { tests, id, father, doctor, phone, ...dbPayload } = payload;
      const col = tab === "testing" ? "bloodgroup_testing_register" : "bloodgroup_retesting_register";

      await setDoc(doc(db, col, reg), dbPayload, { merge: true });
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
        const entryDateStr = d.toISOString().split("T")[0];
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
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => (
              <tr key={`${e.regNo}_${activeTab}`} className={e.saved === "Yes" ? "row-green" : e.scanned === "Yes" ? "row-yellow" : ""}>
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
                    onChange={(ev) => handleChange(activeTab, e.regNo, "bloodGroup", ev.target.value)}
                  >
                    <option value="">Select</option>
                    {bloodGroups.map((bg) => <option key={bg}>{bg}</option>)}
                  </select>
                </td>
                <td>
                  <select
                    value={e.rhFactor}
                    disabled={e.scanned !== "Yes" || e.saved === "Yes"}
                    onChange={(ev) => handleChange(activeTab, e.regNo, "rhFactor", ev.target.value)}
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
                    onChange={(ev) => handleScan(activeTab, e.regNo, ev.target.value)}
                  >
                    <option>No</option>
                    <option>Yes</option>
                  </select>
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