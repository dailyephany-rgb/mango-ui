
import React, { useState, useEffect, useMemo } from "react";
import { trackedOnSnapshot as onSnapshot } from "../shared/firestore/trackedFirestore.js";
import { getCountByTest } from "./analyticsUtils";
import "./css/LabAnalytics.css";
import OUTSOURCE_MAP from "../Outsource.json";
import INSIDE_ROOM_MAP from "../inside_room_routing.json";
import { getISTDateString } from "../shared/utils/dates.js";
import { scopedTimestampRangeQuery } from "../shared/firestore/scopedTimestampRangeQuery.js";
import {
  getCache,
  setCache,
  SESSION_QUERY_TTL_MS,
} from "../shared/cache/sessionQueryCache.js";
import { EngComponent } from "../engineering/ui/EngComponent.jsx";
import SafeDateInput from "../shared/components/SafeDateInput.jsx";

const DEPARTMENTS = [
  { id: "biochemistry_register", label: "Biochemistry" },
  { id: "biochemistry_combo", label: "Combo" },   
  { id: "serology_register", label: "Serology" },
  { id: "urine_analysis_register", label: "Urine Analysis" },
  { id: "bloodgroup_testing_register", label: "Blood Group (Test)" },
  { id: "rapid_card_register", label: "Rapid Card" },
  { id: "esr_register", label: "ESR" },
  { id: "hormones_main", label: "Hormones" },
  { id: "haematology_register", label: "Haematology" },
  { id: "coagulation_register", label: "Coagulation" },
  { id: "inside_lab_results", label: "Inside Lab" },
  { id: "outsource_tracking", label: "Outsource" }

];

const COMBO_TESTS = [
  "LFT (LIVER FUNCTION TEST)",
  "RFT(RENAL FUNCTION TEST)",
  "LIPID PROFILE",
  "ELECTROLYTES,SERUM",
];

export default function LabAnalytics() {
  const [activeColl, setActiveColl] = useState("biochemistry_register");
  const [entries, setEntries] = useState([]);

  const today = getISTDateString();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [sourceFilter, setSourceFilter] = useState("All");
  const [testSearch, setTestSearch] = useState(""); 
  const [labFilter, setLabFilter] = useState("All");
  const [insideDeptFilter, setInsideDeptFilter] = useState("All");
  const [comboCategory, setComboCategory] = useState("All");

  // Active dept collection scoped by timePrinted (IST date range)
  useEffect(() => {
    const collectionName =
      activeColl === "biochemistry_combo"
        ? "biochemistry_register"
        : activeColl;

    const cacheKey = `labAnalytics:${dateFrom}:${dateTo}:${activeColl}`;
    const cached = getCache(cacheKey);
    if (Array.isArray(cached)) {
      setEntries(cached);
    }

    const q = scopedTimestampRangeQuery(
      collectionName,
      "timePrinted",
      { from: dateFrom, to: dateTo },
      "asc"
    );

    if (!q) {
      setEntries([]);
      return undefined;
    }

    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setEntries(next);
        setCache(cacheKey, next, SESSION_QUERY_TTL_MS);
      },
      (err) => {
        console.error(
          `[LabAnalytics] ${collectionName} timePrinted query failed:`,
          err
        );
        setEntries([]);
      }
    );

    return () => unsub();
  }, [activeColl, dateFrom, dateTo]);


  const selectedOutsourceTests = useMemo(
    () =>
      labFilter === "All"
        ? []
        : (OUTSOURCE_MAP[labFilter] || []).map(test =>
            test.toUpperCase().trim()
          ),
    [labFilter]
  );
  
  const selectedInsideTests = useMemo(
    () =>
      insideDeptFilter === "All"
        ? []
        : (INSIDE_ROOM_MAP[insideDeptFilter] || []).map(test =>
            test.toUpperCase().trim()
          ),
    [insideDeptFilter]
  );

  useEffect(() => {
    setLabFilter("All");
    setInsideDeptFilter("All");
    setComboCategory("All");
  }, [activeColl]);



  // Date applied in Firestore via timePrinted; source/lab/combo stay client-side
  const filteredEntries = entries.filter(item => {
    const matchesSource =
      sourceFilter === "All" ||
      item.source?.toLowerCase() === sourceFilter.toLowerCase();
  
    // Outsource lab filter
    const matchesLab =
      activeColl !== "outsource_tracking" ||
      labFilter === "All" ||
      item.labName === labFilter;
  
    // Inside Lab department filter
    const matchesInsideDept =
      activeColl !== "inside_lab_results" ||
      insideDeptFilter === "All" ||
      (item.selectedTests || []).some(test => {
        const testName =
          (typeof test === "string" ? test : test.test || "")
            .toUpperCase()
            .trim();
  
            return selectedInsideTests.includes(testName); 
      });

      // Combo category filter
          const matchesComboCategory =
          activeColl !== "biochemistry_combo" ||
          comboCategory === "All" ||
          (item.category || "").toLowerCase() === comboCategory.toLowerCase();
  
          return (
            matchesSource &&
            matchesLab &&
            matchesInsideDept &&
            matchesComboCategory
          );
  });

  const statsKey =
  activeColl === "biochemistry_combo"
    ? "biochemistry_register"
    : activeColl;

const allStats = getCountByTest(filteredEntries, statsKey);

 


let displayStats;

if (activeColl === "biochemistry_combo") {

  const categories = [
    "RGHS",
    "CGHS",
    "ECHS",
    "General",
    "Insurance",
    "AAI",
    "CAPF",
    "Chiranjeevi Swasthiya Bima Yojna",
    "Food Cooperation Of India",
    "Health Package",
    "ICMR",
    "IIT",
    "Indian Oil Corporation Of India",
    "ISRO",
    "Oil India",
    "ONGC",
    "Railways",
    "RHB",
    "TPA",
  ];

  displayStats = [];

  COMBO_TESTS.forEach((test) => {

    // If a single category is selected
    if (comboCategory !== "All") {

      const count = filteredEntries.filter(entry =>
        (entry.selectedTests || []).some(
          t => (typeof t === "string" ? t : t.test || "")
            .toUpperCase()
            .trim() === test.toUpperCase().trim()
        )
      ).length;

      if (
        test.toLowerCase().includes(testSearch.toLowerCase())
      ) {
        displayStats.push([test, count]);
      }

    } else {

      // Show every category separately
      categories.forEach(category => {

        const count = entries.filter(entry => {

          if ((entry.category || "").toLowerCase() !== category.toLowerCase()) {
            return false;
          }

          // Existing filters
          const entryDateStr = parseDateForFilter(
            entry.timePrinted || entry.timeCollected || entry.savedTime
          );

          const inRange =
            !entryDateStr ||
            (entryDateStr >= dateFrom && entryDateStr <= dateTo);

          const matchesSource =
            sourceFilter === "All" ||
            entry.source?.toLowerCase() === sourceFilter.toLowerCase();

          const hasTest = (entry.selectedTests || []).some(
            t =>
              (typeof t === "string" ? t : t.test || "")
                .toUpperCase()
                .trim() === test.toUpperCase().trim()
          );

          return inRange && matchesSource && hasTest;

        }).length;

        const cardName = `${test} - ${category}`;
    if (
            cardName.toLowerCase().includes(testSearch.toLowerCase())
          ) {
            displayStats.push([cardName, count]);
          }

      });

    }

  });

} else {

  displayStats = Object.entries(allStats)
    .filter(([testName]) => {

      if (!testName.toLowerCase().includes(testSearch.toLowerCase())) {
        return false;
      }

      if (
        activeColl === "inside_lab_results" &&
        insideDeptFilter !== "All"
      ) {
        return selectedInsideTests.includes(
          testName.toUpperCase().trim()
        );
      }

      if (
        activeColl === "outsource_tracking" &&
        labFilter !== "All"
      ) {
        return selectedOutsourceTests.includes(
          testName.toUpperCase().trim()
        );
      }

      return true;
    })
    .sort(([a], [b]) => a.localeCompare(b));

}
   

  return (
    <EngComponent name="LabAnalytics" type="Page" parent={null} moduleId="LabAnalytics">
    <div className="analytics-container">
      <div className="header-section">
        <h1>{DEPARTMENTS.find(d => d.id === activeColl)?.label} Analytics</h1>
        
        <EngComponent name="Filters" type="Layout" parent="LabAnalytics">
        <div className="filter-controls">
          <div className="filter-row">
            <div className="input-group">
              <label>From</label>
              <SafeDateInput aria-label="Date from" value={dateFrom} onChange={(v) => v && setDateFrom(v)} />
            </div>
            <div className="input-group">
              <label>To</label>
              <SafeDateInput aria-label="Date to" value={dateTo} onChange={(v) => v && setDateTo(v)} />
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

  {activeColl === "outsource_tracking" && (
    <select
      className="dept-select"
      value={labFilter}
      onChange={(e) => setLabFilter(e.target.value)}
    >
      <option value="All">All Labs</option>

      {Object.keys(OUTSOURCE_MAP).map((lab) => (
        <option key={lab} value={lab}>
          {lab}
        </option>
            ))}
          </select>
        )}

      {activeColl === "biochemistry_combo" && (
        <select
          className="dept-select"
          value={comboCategory}
          onChange={(e) => setComboCategory(e.target.value)}
        >
          <option value="All">All Categories</option>
          <option value="RGHS">RGHS</option>
          <option value="CGHS">CGHS</option>
          <option value="ECHS">ECHS</option>
          <option value="General">General</option>
          <option value="Insurance">Insurance</option>
          <option value="AAI">AAI</option>
          <option value="CAPF">CAPF</option>
          <option value="Chiranjeevi Swasthiya Bima Yojna">
            Chiranjeevi Swasthiya Bima Yojna
          </option>
          <option value="Food Cooperation Of India">
            Food Cooperation Of India
          </option>
          <option value="Health Package">Health Package</option>
          <option value="ICMR">ICMR</option>
          <option value="IIT">IIT</option>
          <option value="Indian Oil Corporation Of India">
            Indian Oil Corporation Of India
          </option>
          <option value="ISRO">ISRO</option>
          <option value="Oil India">Oil India</option>
          <option value="ONGC">ONGC</option>
          <option value="Railways">Railways</option>
          <option value="RHB">RHB</option>
          <option value="TPA">TPA</option>
        </select>

      )}

        {activeColl === "inside_lab_results" && (
          <select
            className="dept-select"
            value={insideDeptFilter}
            onChange={(e) => setInsideDeptFilter(e.target.value)}
          >
            <option value="All">All Departments</option>

            {Object.keys(INSIDE_ROOM_MAP).map((dept) => (
              <option key={dept} value={dept}>
                {dept.replace("Register", "")}
              </option>
            ))}
          </select>
        )}

        <select
          className="dept-select"
          value={activeColl}
          onChange={(e) => setActiveColl(e.target.value)}
        >
          {DEPARTMENTS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>

      </div>


        </div>
        </EngComponent>
      </div>

      <EngComponent name="Counts Grid" type="Charts" parent="LabAnalytics">
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
      </EngComponent>
    </div>
    </EngComponent>
  );
}