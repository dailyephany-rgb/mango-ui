
import React, { useState } from "react";

export default function ValidatorTable({ title, data, onValidate, searchTerm, setSearchTerm }) {
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [dateFrom, setDateFrom] = useState(getTodayDate());
  const [dateTo, setDateTo] = useState(getTodayDate());
  const [sourceFilter, setSourceFilter] = useState("All");

  const departmentsWithResults = ["Coagulation", "Serology", "Urine", "Blood Group", "Rapid Card", "ESR"];
  const shouldShowResult = departmentsWithResults.some(dept => title.includes(dept));
  const isESR = title.includes("ESR");

  const renderResult = (val) => {
    if (!val) return "—";
    if (typeof val !== "object") return String(val);
    return Object.entries(val)
      .filter(([_, value]) => value && value !== "")
      .map(([key, value]) => {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        return `${label}: ${value}`;
      })
      .join(" | ");
  };

  const parseDate = (entry) => {
    const f = entry.timePrinted || entry.timeCollected || entry.savedTime;
    if (!f) return null;
    return f.toDate ? f.toDate() : new Date(f);
  };

  const finalData = data.filter((item) => {
    if (sourceFilter !== "All" && item.source !== sourceFilter) return false;
    const eDate = parseDate(item);
    if (eDate) {
      if (dateFrom && eDate < new Date(dateFrom + "T00:00:00")) return false;
      if (dateTo && eDate > new Date(dateTo + "T23:59:59")) return false;
    } else if (dateFrom || dateTo) return false;
    return true;
  });

  return (
    <div className="validator-table-container">
      <div className="validator-table-title">{title}</div>

      <div className="validator-filter-bar">
        <input
          type="text"
          placeholder="Search Reg / Diag No..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <label>Date:</label>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <span>to</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />

        <div className="source-buttons">
          {["OPD", "IPD", "Third Floor", "All"].map((src) => (
            <button key={src} className={sourceFilter === src ? "active" : ""} onClick={() => setSourceFilter(src)}>{src}</button>
          ))}
        </div>
      </div>

      <table className="validator-table">
        <thead>
          <tr>
            <th>Reg No</th>
            <th>Diagnostic No</th>
            <th>Patient Name</th>
            <th>Source</th>
            <th>Tests</th>
            {shouldShowResult && <th>Result</th>}
            {isESR && <th>Duration</th>}
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {finalData.length > 0 ? (
            finalData.map((item) => (
              <tr key={item.id} className={item.validated ? "row-validated" : "row-saved"}>
                <td>{item.regNo || "—"}</td>
                <td>{item.diagnosticNo || "—"}</td>
                <td>{item.name || "—"}</td>
                <td>{item.source || "—"}</td>
                <td>{Array.isArray(item.selectedTests) ? item.selectedTests.join(", ") : "—"}</td>
                {shouldShowResult && (
                  <td style={{ fontWeight: 'bold', color: '#1e3a8a', fontSize: '13px' }}>
                    {renderResult(item.result || item.results)}
                  </td>
                )}
                {isESR && (
                  <td style={{ fontWeight: '600', color: '#dc2626' }}>
                    {item.duration || "—"}
                  </td>
                )}
                <td>
                  <button 
                    className={`validate-btn ${item.validated ? "validated" : ""}`} 
                    onClick={() => !item.validated && onValidate(item)}
                  >
                    {item.validated ? "Validated" : "✅ Validate"}
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={shouldShowResult ? (isESR ? "8" : "7") : "6"} className="no-entries">No matching records found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}