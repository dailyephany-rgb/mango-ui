
import React, { useState, useEffect } from "react";
import { db } from "../firebaseConfig";
import { collection, onSnapshot } from "firebase/firestore";
import { getCountByTest } from "./analyticsUtils";
import "./css/LabAnalytics.css";

const DEPARTMENTS = [
  { id: "biochemistry_register", label: "Biochemistry" },
  { id: "serology_register", label: "Serology" },
  { id: "urine_analysis_register", label: "Urine Analysis" },
  { id: "bloodgroup_testing_register", label: "Blood Group (Test)" },
  { id: "rapid_card_register", label: "Rapid Card" },
  { id: "esr_register", label: "ESR" },
  { id: "hormones_main", label: "Hormones" },
  { id: "haematology_register", label: "Haematology" },
  { id: "coagulation_register", label: "Coagulation" },
  { id: "inside_lab_results", label: "Inside Lab" }
];

export default function LabAnalytics() {
  const [activeColl, setActiveColl] = useState("biochemistry_register");
  const [entries, setEntries] = useState([]);
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split("T")[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split("T")[0]);
  const [sourceFilter, setSourceFilter] = useState("All");
  const [testSearch, setTestSearch] = useState(""); // New state for Test Name search

  const parseDateForFilter = (field) => {
    if (!field) return null;
    if (field.seconds) return new Date(field.seconds * 1000).toISOString().split("T")[0];
    const d = new Date(field);
    return isNaN(d) ? null : d.toISOString().split("T")[0];
  };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, activeColl), (snap) => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [activeColl]);

  // Filter entries based on Date and Source
  const filteredEntries = entries.filter(item => {
    const entryDateStr = parseDateForFilter(item.timePrinted || item.timeCollected || item.savedTime);
    const inRange = !entryDateStr || (entryDateStr >= dateFrom && entryDateStr <= dateTo);
    const matchesSource = sourceFilter === "All" || item.source?.toLowerCase() === sourceFilter.toLowerCase();
    return inRange && matchesSource;
  });

  const allStats = getCountByTest(filteredEntries, activeColl);

  // NEW: Filter the KPI cards based on the Test Search string
  const displayStats = Object.entries(allStats).filter(([testName]) => 
    testName.toLowerCase().includes(testSearch.toLowerCase())
  );

  return (
    <div className="analytics-container">
      <div className="header-section">
        <h1>{DEPARTMENTS.find(d => d.id === activeColl)?.label} Analytics</h1>
        
        <div className="filter-controls">
          <div className="filter-row">
            <div className="input-group">
              <label>From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="input-group">
              <label>To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="input-group search-box">
              <label>Filter by Test Name</label>
              <input 
                type="text" 
                placeholder="Type test name (e.g. Urea)..." 
                value={testSearch} 
                onChange={(e) => setTestSearch(e.target.value)} 
              />
            </div>
          </div>

          <div className="filter-row second-row">
            <div className="source-toggle">
              {["OPD", "IPD", "Third Floor", "All"].map((src) => (
                <button 
                  key={src} 
                  className={sourceFilter === src ? "active" : ""} 
                  onClick={() => setSourceFilter(src)}
                >
                  {src}
                </button>
              ))}
            </div>
            
            <select className="dept-select" value={activeColl} onChange={(e) => setActiveColl(e.target.value)}>
              {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="analytics-grid">
        {displayStats.length > 0 ? (
          displayStats.map(([test, count]) => (
            <div key={test} className={`stat-card ${count > 0 ? "active-stat" : ""}`}>
              <div className="stat-label">{test}</div>
              <div className="stat-count">{count}</div>
              <div className="stat-footer">Total Registered</div>
            </div>
          ))
        ) : (
          <div className="no-results">No tests found matching "{testSearch}"</div>
        )}
      </div>
    </div>
  );
}