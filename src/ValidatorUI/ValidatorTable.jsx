
import React, { useState } from "react";

export default function ValidatorTable({
  title,
  data,
  onValidate,
  onEntered,
  searchTerm,
  setSearchTerm,
  loginMode
}) {

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

  // Include Haematology in departments with results if you want to see the "Critical" or "Haemogram" status
  const departmentsWithResults = ["Coagulation", "Serology", "Urine", "Blood Group", "Rapid Card", "ESR", "Haematology"];
  const shouldShowResult = departmentsWithResults.some(dept => title.includes(dept));
  const isESR = title.includes("ESR");
  const supportsCritical =
  !title.includes("Blood Group");

  const renderUrineRoutine = (results = {}) => (
    <div style={{ lineHeight: "1.5" }}>
      <div>Volume: {results.volume || "—"}</div>
      <div>Color: {results.color || "—"}</div>
      <div>Appearance: {results.appearance || "—"}</div>
  
      <br />
  
      <div>SG: {results.sg || "—"}</div>
      <div>Reaction (pH): {results.ph || "—"}</div>
      <div>Protein: {results.albumin || "—"}</div>
      <div>Glucose: {results.sugar || "—"}</div>
      <div>Ketone Bodies: {results.ketoneBodies || "—"}</div>
  
      <br />
  
      <div>RBC: {results.rbc || "—"}</div>
      <div>Pus Cells: {results.pus || "—"}</div>
      <div>Epithelial Cells: {results.epithelium || "—"}</div>
  
      <br />
  
      <div>Crystals: {results.crystals || "—"}</div>
      <div>Bacteria: {results.bacteria || "—"}</div>
      <div>Casts: {results.casts || "—"}</div>
      <div>Yeast Cells: {results.yeastCells || "—"}</div>
      <div>Others: {results.others || "—"}</div>
    </div>
  );
  
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

  const parseToLocalDateStr = (entry) => {
    // UPDATED: timePrinted is now the first priority
    const f = entry.timePrinted || entry.savedTime || entry.scannedTime || entry.timeCollected || entry.timestamp;
    if (!f) return null;
    
    let d;
    if (f.toDate) d = f.toDate();
    else d = new Date(f);

    if (isNaN(d.getTime())) return null;

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const finalData = data.filter((item) => {
    if (sourceFilter !== "All" && item.source !== sourceFilter) return false;
    
    const entryDateStr = parseToLocalDateStr(item);
    
    if (entryDateStr) {
      if (dateFrom && entryDateStr < dateFrom) return false;
      if (dateTo && entryDateStr > dateTo) return false;
    } else if (dateFrom || dateTo) {
        return false;
    }
    
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
            <th>Saved By</th>
            <th>Validated By</th>
            <th>Entered By</th>
            {supportsCritical && (<th>Critical</th>)}
            {shouldShowResult && (<th>Result</th>)}    
            {isESR && <th>Duration</th>}
            <th>Action</th>

          </tr>
        </thead>
        <tbody>
          {finalData.length > 0 ? (
            finalData.map((item) => {
              const hasUrineRoutine =
                title.includes("Urine") &&
                Array.isArray(item.selectedTests) &&
                item.selectedTests.some((t) => {
                  const name =
                    typeof t === "string"
                      ? t
                      : (t.name || t.test || "");

                  return name.toUpperCase().includes("URINE ANALYSIS");
                });

              return (
                <tr
                  key={item.id}
                  className={
                    item.entered
                      ? "row-entered"
                      : item.validated
                      ? "row-validated"
                      : "row-saved"
                  }
                >
     



                <td>{item.regNo || "—"}</td>
                {/* UPDATED: Checks both diagnosticNo and accessionNo */}
                <td>{item.diagnosticNo || item.accessionNo || "—"}</td>
                <td>{item.name || "—"}</td>
               
                <td>{item.source || "—"}</td>

                    <td>
                      {Array.isArray(item.selectedTests)
                        ? item.selectedTests.map(t =>
                            typeof t === "string"
                              ? t.toUpperCase()
                              : (t.name || t.test)
                          ).join(", ")
                        : "—"}
                      </td>

                      <td
                        style={{
                          fontWeight: "600",
                          color: "#1e3a8a"
                        }}
                      >
                        {item.savedBy || "—"}
                      </td>

                      <td
                        style={{
                          fontWeight: "600",
                          color: "#16a34a"
                        }}
                      >
                        {item.validatedBy || "—"}
                      </td>

                      <td
                        style={{
                          fontWeight: "600",
                          color: "#2563eb"
                        }}
                      >
                        {item.enteredBy || "—"}
                      </td>

                      {supportsCritical && (
                      <td style={{ textAlign: "center"}}>
                      {item.critical === "Yes" && (<span style={{color: "red", fontWeight: "bold", fontSize: "10px", lineHeight: "1.4"}} > CRITICAL <br/>REPORTED </span> )} </td> )}
                      {shouldShowResult && (

                  <td style={{ fontWeight: 'bold', color: '#1e3a8a', fontSize: '13px' }}>
                    {/* UPDATED: Checks result, results, and critical parameter */}
                   
                {item.criticalParameter
                ? `CRITICAL: ${item.criticalParameter}`
                : hasUrineRoutine
                  ? renderUrineRoutine(item.results)
                  : renderResult(item.result || item.results)}


                  </td>
                )}
                {isESR && (
                  <td style={{ fontWeight: '600', color: '#dc2626' }}>
                    {item.duration || "—"}
                  </td>
                )}
                  
                  <td>
  {loginMode === "validator" ? (
    <button
      className={`validate-btn ${
        item.validated ? "validated" : ""
      }`}
      disabled={item.validated}
      onClick={() =>
        !item.validated &&
        onValidate(item)
      }
    >
      {item.validated
        ? "Validated"
        : "✅ Validate"}
    </button>
  ) : (
    <button
      className={`entered-btn ${
        item.entered ? "entered" : ""
      }`}
      disabled={
        !item.validated ||
        item.entered
      }
      onClick={() =>
        onEntered(item)
      }
    >
      {item.entered
        ? "Entered"
        : "Enter"}
    </button>
  )}
</td>


              </tr>
                 );
                })
        
            ) : (
              <tr>
                <td
                  colSpan={
                    8 +
                    (supportsCritical ? 1 : 0) +
                    (shouldShowResult ? 1 : 0) +
                    (isESR ? 1 : 0)
                  }
                  className="no-entries"
                >
                  No matching records found.
                </td>
              </tr>
            )}
        </tbody>
      </table>
    </div>
  );
}