
import React, { useState, useEffect } from "react";
import { db } from "../firebaseConfig";
import { collection, onSnapshot, doc, setDoc } from "firebase/firestore";
import * as XLSX from "xlsx"; // Import SheetJS
import "./MasterAdmin.css";

const DEPARTMENTS = [
  { id: "master_register", label: "Master (Registration)" },
  { id: "biochemistry_register", label: "Biochemistry" },
  { id: "serology_register", label: "Serology" },
  { id: "urine_analysis_register", label: "Urine Analysis" },
  { id: "bloodgroup_testing_register", label: "Blood Group (Test)" },
  { id: "bloodgroup_retesting_register", label: "Blood Group (Retest)" },
  { id: "rapid_card_register", label: "Rapid Card" },
  { id: "esr_register", label: "ESR" },
  { id: "hormones_main", label: "Hormones" },
  { id: "haematology_register", label: "Haematology" },
  { id: "coagulation_register", label: "Coagulation" },
  { id: "outsource_tracking", label: "Outside Tracking" },
  { id: "inside_lab_results", label: "Inside Lab" },
  { id: "critical_alerts", label: "Critical Alerts" }
];

export default function MasterAdminPanel() {
  const [activeColl, setActiveColl] = useState("master_register");
  const [entries, setEntries] = useState([]);
  
  // INITIALIZE FILTERS TO CURRENT DATE IN IST
  const getISTDateString = () => {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  };

  const [dateFrom, setDateFrom] = useState(getISTDateString());
  const [dateTo, setDateTo] = useState(getISTDateString());
  const [sourceFilter, setSourceFilter] = useState("All");
  const [searchReg, setSearchReg] = useState("");
  const [editId, setEditId] = useState(null);
  const [tempData, setTempData] = useState({});

  const [isCompareView, setIsCompareView] = useState(false);
  const [reconData, setReconData] = useState(null);
  const [reconTab, setReconTab] = useState("missing");

  // --- UPDATED IST UTILITIES ---

  const parseDateForFilter = (field) => {
    if (!field) return null;
    let d;
    if (field.seconds) {
      d = new Date(field.seconds * 1000);
    } else {
      d = new Date(field);
    }
    if (isNaN(d)) return null;

    // Returns YYYY-MM-DD specifically for the Asia/Kolkata timezone
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); 
  };

  const formatDisplayDate = (field) => {
    if (!field) return "-";
    let d;
    if (field.seconds) {
      d = new Date(field.seconds * 1000);
    } else {
      d = new Date(field);
    }
    if (isNaN(d)) return String(field);

    return d.toLocaleString('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour12: true,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit' // <--- ADDED SECONDS HERE
    });
  };

  const formatForInput = (field) => {
    if (!field) return "";
    let d;
    if (field.seconds) {
      d = new Date(field.seconds * 1000);
    } else {
      d = new Date(field);
    }
    if (isNaN(d)) return "";

    // Adjust for datetime-local which expects "YYYY-MM-DDTHH:MM" in local time
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  const isTimeField = (col) => [
    "timeCollected", "timePrinted", "savedTime", "scannedTime", "validatedTime",
    "givenTime", "receivedTime", "startTime", "endTime", "timeSaved", "flaggedAt", "reportedAt"
  ].includes(col);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, activeColl), (snap) => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [activeColl]);

  const filteredData = entries.filter(item => {
    const entryDateStr = parseDateForFilter(item.timePrinted || item.timeCollected || item.savedTime);
    const inRange = !entryDateStr || (entryDateStr >= dateFrom && entryDateStr <= dateTo);
    const matchesSource = sourceFilter === "All" || item.source?.toLowerCase() === sourceFilter.toLowerCase();
    const searchLower = searchReg.toLowerCase();
    const matchesSearch = !searchReg || 
      (item.regNo?.toLowerCase().includes(searchLower)) || 
      (item.diagnosticNo?.toLowerCase().includes(searchLower));
    return inRange && matchesSource && matchesSearch;
  });

  const handleHospitalImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

      const groupedHospital = {};
      json.forEach(row => {
        const regKey = Object.keys(row).find(k => k.toLowerCase().replace(/\s/g, '') === 'regno');
        const diagKey = Object.keys(row).find(k => k.toLowerCase().replace(/\s/g, '') === 'accessionno'); 
        const nameKey = Object.keys(row).find(k => k.toLowerCase().replace(/\s/g, '') === 'name');
        const testKey = Object.keys(row).find(k => k.toLowerCase().replace(/\s/g, '') === 'investigation');

        const diagNo = row[diagKey];
        if (!diagNo) return;

        if (!groupedHospital[diagNo]) {
          groupedHospital[diagNo] = {
            diagnosticNo: diagNo,
            regNo: row[regKey],
            name: row[nameKey] || "Unknown",
            tests: []
          };
        }
        if (row[testKey]) groupedHospital[diagNo].tests.push(String(row[testKey]).toLowerCase().trim());
      });

      const hospitalList = Object.values(groupedHospital);
      const missing = [];
      const mismatch = [];
      const ghost = [];

      hospitalList.forEach(hRow => {
        const labMatch = filteredData.find(l => String(l.diagnosticNo).toLowerCase() === String(hRow.diagnosticNo).toLowerCase());
        
        if (!labMatch) {
            missing.push({ ...hRow, testsString: hRow.tests.join(", ") });
        } else {
          const lTestsArray = labMatch.selectedTests?.map(t => {
            const testName = typeof t === 'string' ? t : t.test;
            return testName.toLowerCase().trim();
          }) || [];
          
          const hTestsArray = hRow.tests;
          const isMissingTest = hTestsArray.some(ht => !lTestsArray.includes(ht));
          if (isMissingTest) {
            mismatch.push({ 
              hospital: hRow, 
              lab: labMatch, 
              hTests: hRow.tests.join(", "), 
              lTests: lTestsArray.join(", ") 
            });
          }
        }
      });

      filteredData.forEach(lRow => {
          if (!lRow.diagnosticNo) return;
          const hMatch = hospitalList.find(h => String(h.diagnosticNo).toLowerCase() === String(lRow.diagnosticNo).toLowerCase());
          if (!hMatch) ghost.push(lRow);
      });

      setReconData({ 
          missing, mismatch, ghost, 
          stats: { 
              total: hospitalList.length, 
              labTotal: filteredData.length,
              rate: hospitalList.length > 0 ? (((hospitalList.length - missing.length) / hospitalList.length) * 100).toFixed(1) : 0
          } 
      });
    };
    reader.readAsArrayBuffer(file);
  };

  const exportToExcel = () => {
    const cols = getColumns();
    const worksheetData = filteredData.map(row => {
      const newRow = {};
      cols.forEach(col => {
        const header = col.replace(/([A-Z])/g, ' $1').toUpperCase();
        let value = row[col];

        if (isTimeField(col)) {
          value = formatDisplayDate(value);
        } else if (col === "selectedTests" && Array.isArray(value)) {
          value = value.map(t => typeof t === 'string' ? t : t.test).join(", ");
        } else if (col === "reportData" && Array.isArray(value)) {
          value = value.map(r => `${r.testType}: ${r.content}`).join(" | ");
        } else if ((col === "results" || col === "result") && typeof value === 'object') {
          value = Object.entries(value || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
        }
        newRow[header] = value || "-";
      });
      return newRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Lab_Report");
    const maxWidths = worksheetData.reduce((acc, row) => {
      Object.keys(row).forEach((key, i) => {
        const valWidth = row[key].toString().length;
        acc[i] = Math.max(acc[i] || 10, valWidth);
      });
      return acc;
    }, []);
    worksheet["!cols"] = maxWidths.map(w => ({ wch: w + 2 }));
    XLSX.writeFile(workbook, `Lab_Report_${activeColl}_${dateFrom}.xlsx`);
  };

  const handleUpdate = async (id) => {
    try {
      await setDoc(doc(db, activeColl, id), tempData, { merge: true });
      setEditId(null);
      alert("Changes Saved Successfully!");
    } catch (err) { alert("Error: " + err.message); }
  };

  const getColumns = () => {
    switch (activeColl) {
        case "master_register":
          return ["regNo", "diagnosticNo", "name", "age", "ageUnit", "gender", "father", "phone", "doctor", "category", "source", "timeCollected", "timePrinted", "selectedTests"];
        case "biochemistry_register":
          return ["regNo", "diagnosticNo", "name", "age", "ageUnit", "gender", "category","scanned","scannedTime","source", "status", "saved", "savedTime", "validated", "validatedTime", "timeCollected", "timePrinted", "selectedTests"];
        case "serology_register":
          return ["regNo", "diagnosticNo", "name", "age", "ageUnit", "gender", "category", "source", "status", "results","scanned","scannedTime","saved", "savedTime", "validated", "validatedTime", "timeCollected", "timePrinted", "selectedTests"];
        case "urine_analysis_register":
          return ["regNo", "diagnosticNo", "name", "age", "ageUnit", "gender", "category", "source", "status", "results","scanned","scannedTime","saved", "savedTime", "validated", "validatedTime", "timeCollected", "timePrinted", "selectedTests"];
        case "bloodgroup_testing_register":
        case "bloodgroup_retesting_register":
          return ["regNo", "diagnosticNo", "name", "age", "ageUnit", "gender", "category", "source", "status", "bloodGroup", "rhFactor", "result","scanned","scannedTime","saved", "savedTime", "validated", "validatedTime", "timeCollected", "timePrinted", "selectedTests"];
        case "rapid_card_register":
          return ["regNo", "diagnosticNo", "name", "age", "ageUnit", "gender", "category", "source", "status", "results","scanned","scannedTime","saved", "savedTime", "validated", "validatedTime", "timeCollected", "timePrinted", "selectedTests"];
        case "esr_register":
          return ["regNo", "diagnosticNo", "name", "age", "ageUnit", "gender", "category", "source", "status", "result","scanned","scannedTime","startTime","endTime","duration","saved", "savedTime", "validated", "validatedTime", "timeCollected", "timePrinted", "selectedTests"];
        case "hormones_main":
          return ["regNo", "diagnosticNo", "name", "age", "ageUnit", "gender", "category","source", "status","scanned","scannedTime","saved", "savedTime", "validated", "validatedTime", "timeCollected", "timePrinted", "selectedTests"];
        case "haematology_register":
          return ["regNo", "diagnosticNo", "name", "age", "ageUnit", "gender", "category", "doctor", "source", "status","scanned","scannedTime","saved", "savedTime", "validated", "validatedTime", "timeCollected", "timePrinted", "selectedTests"];
        case "coagulation_register":
          return ["regNo", "diagnosticNo", "name", "age", "ageUnit", "gender", "category", "source", "status", "results","scanned","scannedTime","saved", "savedTime", "validated", "validatedTime", "timeCollected", "timePrinted", "selectedTests"];
        case "outsource_tracking":
          return ["regNo", "diagnosticNo", "name", "age", "ageUnit", "gender", "category", "labName", "concernedPerson", "mobileNo", "status", "isGiven", "givenTime","receivedStatus","receivedTime","scannedStatus","scannedTime","isCollected","timeCollected", "timePrinted", "selectedTests"];
        case "inside_lab_results":
          return ["regNo", "diagnosticNo", "name", "age", "ageUnit", "gender", "category","department", "reportData", "isFinalized", "isSaved","timeSaved", "timeCollected", "timePrinted", "selectedTests"];
        case "critical_alerts":
          return ["regNo", "diagnosticNo", "name", "age", "ageUnit", "gender", "category", "dept", "doctor", "criticalParameter", "status", "flaggedAt", "reportedAt", "timeCollected", "timePrinted", "selectedTests"];
        default:
          return ["regNo", "diagnosticNo", "name", "age", "ageUnit", "gender", "status"];
      }
  };

  return (
    <div className="master-container">
      <div className="header-bar">
        <h2>📋 Lab Admin Panel — Management View</h2>
        <div style={{ display: "flex", gap: "10px" }}>
           <button onClick={() => setIsCompareView(!isCompareView)} className="btn-update" style={{ backgroundColor: isCompareView ? "#dc2626" : "#4b5563" }}>
                {isCompareView ? "✖ Close Compare" : "🔍 Compare Tab"}
            </button>
            <button onClick={exportToExcel} className="btn-update" style={{ backgroundColor: "#1e3a8a" }}>📥 Export to Excel</button>
        </div>
      </div>

      {isCompareView ? (
        <div className="filter-bar" style={{ borderLeft: "5px solid #2563eb", flexDirection: "column", alignItems: "flex-start" }}>
           <h3>Reconciliation Tool (Accession No ↔ Diagnostic No)</h3>
           <p style={{ fontSize: "12px", color: "#666" }}>Currently Filtering Lab Records: {dateFrom} to {dateTo}</p>
           <input type="file" accept=".xlsx, .xls, .csv" onChange={handleHospitalImport} style={{ margin: "10px 0" }} />
           {reconData && (
             <div style={{ width: "100%" }}>
                <div style={{ display: "flex", gap: "20px", marginBottom: "15px", padding: "10px", backgroundColor: "#f1f5f9", borderRadius: "5px" }}>
                    <span><strong>Match Rate:</strong> {reconData.stats.rate}%</span>
                    <span><strong>Total Hospital Bills:</strong> {reconData.stats.total}</span>
                    <span><strong>Lab Total (Filtered):</strong> {reconData.stats.labTotal}</span>
                </div>
                <div className="source-buttons">
                    <button className={reconTab === "missing" ? "active" : ""} onClick={() => setReconTab("missing")}>Missing in Lab ({reconData.missing.length})</button>
                    <button className={reconTab === "mismatch" ? "active" : ""} onClick={() => setReconTab("mismatch")}>Test Mismatches ({reconData.mismatch.length})</button>
                    <button className={reconTab === "ghost" ? "active" : ""} onClick={() => setReconTab("ghost")}>Ghost (Lab Only) ({reconData.ghost.length})</button>
                </div>
                <div className="table-wrapper" style={{ marginTop: "15px", maxHeight: "400px" }}>
                    <table className="master-table">
                        <thead>
                            {reconTab === "missing" ? (
                              <tr><th>DIAGNOSTIC NO</th><th>REG NO</th><th>NAME</th><th>HOSPITAL TESTS</th></tr>
                            ) : reconTab === "mismatch" ? (
                              <tr><th>DIAGNOSTIC NO</th><th>NAME</th><th>HOSPITAL TESTS</th><th>LAB TESTS</th></tr>
                            ) : (
                              <tr><th>DIAGNOSTIC NO</th><th>NAME</th><th>SOURCE</th><th>REGISTERED TESTS</th></tr>
                            )}
                        </thead>
                        <tbody>
                            {reconTab === "missing" ? (
                                reconData.missing.map((m, i) => (<tr key={i}><td>{m.diagnosticNo}</td><td>{m.regNo}</td><td>{m.name}</td><td>{m.testsString}</td></tr>))
                            ) : reconTab === "mismatch" ? (
                                reconData.mismatch.map((m, i) => (<tr key={i}><td>{m.lab.diagnosticNo}</td><td>{m.lab.name}</td><td style={{ color: "#dc2626", fontWeight: "bold" }}>{m.hTests}</td><td style={{ color: "#16a34a" }}>{m.lTests}</td></tr>))
                            ) : (
                                reconData.ghost.map((m, i) => (<tr key={i}><td>{m.diagnosticNo}</td><td>{m.name}</td><td>{m.source}</td><td>{m.selectedTests?.map(t => typeof t === 'string' ? t : t.test).join(", ")}</td></tr>))
                            )}
                        </tbody>
                    </table>
                </div>
             </div>
           )}
        </div>
      ) : (
        <>
          <div className="filter-bar">
            <div className="filter-left">
              <input type="text" placeholder="Search Reg or Diag No..." value={searchReg} onChange={(e) => setSearchReg(e.target.value)} />
              <label>Date Filter (Printed):</label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <span>to</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
            <div className="source-buttons">
              {["OPD", "IPD", "Third Floor", "All"].map((src) => (
                <button key={src} className={sourceFilter === src ? "active" : ""} onClick={() => setSourceFilter(src)}>{src}</button>
              ))}
            </div>
            <div className="dept-tabs-container" style={{ marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '10px' }}>
              {DEPARTMENTS.map(d => (
                <button key={d.id} onClick={() => { setActiveColl(d.id); setEditId(null); }} className={`dept-tab-btn ${activeColl === d.id ? "active" : ""}`}>{d.label}</button>
              ))}
            </div>
          </div>

          <div className="table-wrapper">
            <table className="master-table">
              <thead>
                <tr>
                  {getColumns().map(col => (<th key={col}>{col.replace(/([A-Z])/g, ' $1').toUpperCase()}</th>))}
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map(row => (
                  <tr key={row.id}>
                    {getColumns().map(col => (
                      <td key={col}>
                        {editId === row.id && !["selectedTests", "results", "result", "reportData"].includes(col) ? (
                          <input className="cell-edit-input" type={isTimeField(col) ? "datetime-local" : "text"} defaultValue={isTimeField(col) ? formatForInput(row[col]) : row[col] ?? ""} onChange={(e) => setTempData({ ...tempData, [col]: isTimeField(col) ? new Date(e.target.value) : e.target.value })} />
                        ) : col === "reportData" ? (
                          <div className="object-cell-view">
                            {row[col]?.map((report, idx) => (
                              <div key={idx} style={{ marginBottom: '8px', borderBottom: editId === row.id ? '1px dashed #ccc' : 'none', paddingBottom: '4px' }}>
                                <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#1e3a8a' }}>{report.testType}</div>
                                {editId === row.id ? (<textarea className="cell-edit-input" style={{ minHeight: '60px', fontFamily: 'inherit' }} defaultValue={report.content} onChange={(e) => {
                                    const updatedReports = [...(tempData.reportData || row.reportData)];
                                    updatedReports[idx] = { ...updatedReports[idx], content: e.target.value };
                                    setTempData({ ...tempData, reportData: updatedReports });
                                  }} />) : (<div style={{ fontSize: '11px', whiteSpace: 'pre-wrap' }}>{report.content || "-"}</div>)}
                              </div>
                            ))}
                          </div>
                        ) : (col === "results" || col === "result") && typeof row[col] === 'object' ? (
                          <div className="object-cell-view">
                            {Object.entries(row[col] || {}).map(([key, val]) => (
                              <div key={key} style={{ fontSize: '11px' }}>
                                <strong>{key.toUpperCase()}:</strong> 
                                {editId === row.id ? (<input type="text" defaultValue={val} onChange={(e) => { const updated = { ...tempData[col], [key]: e.target.value }; setTempData({ ...tempData, [col]: updated }); }} />) : (val || "-")}
                              </div>
                            ))}
                          </div>
                        ) : col === "selectedTests" ? (
                          <ul className="test-list">{row[col]?.map((t, i) => (<li key={i}>{typeof t === 'string' ? t : t.test}</li>))}</ul>
                        ) : editId === row.id && (col === "result" || col === "results") ? (
                            <input className="cell-edit-input" type="text" defaultValue={row[col] ?? ""} onChange={(e) => setTempData({ ...tempData, [col]: e.target.value })} />
                        ) : isTimeField(col) ? formatDisplayDate(row[col]) : String(row[col] ?? "-")}
                      </td>
                    ))}
                    <td className="action-cell">
                      {editId === row.id ? (<button className="btn-update" onClick={() => handleUpdate(row.id)}>Save</button>) : (<button className="edit-btn-action" onClick={() => { setEditId(row.id); setTempData(row); }}>Edit</button>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}