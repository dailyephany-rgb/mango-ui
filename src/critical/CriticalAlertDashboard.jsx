
import React, { useState, useEffect } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  Timestamp
} from "firebase/firestore";
import { trackedOnSnapshot as onSnapshot } from "../shared/firestore/trackedFirestore.js";
import jsPDF from "jspdf";
import "jspdf-autotable";
import "./CriticalDashboard.css";
import UserMenu from "../auth/UserMenu";
import {
  getLocalDateString,
  parseDateField,
  toLocalDateString,
  localDayStart,
  localDayEndExclusive,
} from "../shared/utils/dates.js";
import { EngComponent } from "../engineering/ui/EngComponent.jsx";

export default function CriticalAlertDashboard() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commMethods, setCommMethods] = useState({});
  const [reportedTo, setReportedTo] = useState({});
  const [now, setNow] = useState(new Date());

  // 🔹 FILTER STATES
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const today = getLocalDateString();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
 

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fromStr = dateFrom || getLocalDateString();
    const toStr = dateTo || getLocalDateString();
    const start = localDayStart(fromStr);
    const endExclusive = localDayEndExclusive(toStr);
    if (!start || !endExclusive) {
      setAlerts([]);
      setLoading(false);
      return undefined;
    }

    const q = query(
      collection(db, "critical_alerts"),
      where("flaggedAt", ">=", Timestamp.fromDate(start)),
      where("flaggedAt", "<", Timestamp.fromDate(endExclusive)),
      orderBy("flaggedAt", "asc")
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setAlerts(data);
        setLoading(false);
      },
      (err) => {
        console.error(
          "[CriticalDashboard] flaggedAt query failed — check index:",
          err
        );
        setLoading(false);
      }
    );
    return () => unsub();
  }, [dateFrom, dateTo]);

  // Unique departments for dropdown
  const uniqueDepartments = ["All", ...new Set(alerts.map(a => a.dept).filter(Boolean))].sort();

  const getTimeDiff = (flaggedAt, reportedAt) => {
    const start = parseDateField(flaggedAt);
    const end = parseDateField(reportedAt);
    if (!start || !end) return "-"; 
    const diffInMs = end - start;
    const diffInMins = Math.floor(diffInMs / (1000 * 60));
    if (diffInMins < 60) return `${diffInMins}m`;
    const hours = Math.floor(diffInMins / 60);
    const mins = diffInMins % 60;
    return `${hours}h ${mins}m`;
  };

  
  const handleMarkDone = async (alert) => {
    const method = commMethods[alert.id];
    if (!method) return alert("Select communication method.");
    
    try {
      const reportTime = new Date();
      await updateDoc(doc(db, "critical_alerts", alert.id), {
        status: "Reported",
        communicatedVia: method,
        reportedAt: serverTimestamp(),
        reportedAt: serverTimestamp(),
      });

      const docPDF = new jsPDF();
      const pageWidth = docPDF.internal.pageSize.getWidth();
      const margin = 20;
      const labelX = 20;
      const valueX = 80;
      const maxLineWidth = pageWidth - valueX - margin;

      docPDF.setFontSize(20);
      docPDF.setFont("helvetica", "bold");
      docPDF.text("CRITICAL REPORT", 105, 20, { align: "center" });
      
      docPDF.setFontSize(12);
      let yPos = 40;
      const rowGap = 8;

      const dataRows = [
        ["REG NO:", alert.regNo || "-"],
        ["DIAG NO:", alert.diagnosticNo || "-"],
        ["DATE:", new Date().toLocaleDateString()],
        ["PATIENT NAME:", alert.name || "-"],
        ["AGE:", alert.age || "-"],
        ["SEX:", alert.gender || "-"],
        ["DOCTOR:", alert.doctor || "-"],
        ["SELECTED TESTS:", Array.isArray(alert.selectedTests) ? alert.selectedTests.join(", ") : alert.selectedTests || "-"],
        ["CRITICAL FINDING:", alert.criticalParameter || "-"],
        ["COMMUNICATED VIA:", method],
        ["TIME TAKEN:", getTimeDiff(alert.flaggedAt, reportTime)]
      ];



      dataRows.forEach((row) => {
        const label = row[0];
        const value = String(row[1]);
        docPDF.setFont("helvetica", "bold");
        docPDF.text(label, labelX, yPos);
        docPDF.setFont("helvetica", "normal");
        const wrappedValue = docPDF.splitTextToSize(value, maxLineWidth);
        docPDF.text(wrappedValue, valueX, yPos);
        const lineHeight = docPDF.internal.getFontSize() * 0.5;
        const textBlockHeight = wrappedValue.length * lineHeight;
        yPos += Math.max(rowGap, textBlockHeight + 2);
        if (yPos > 275) { docPDF.addPage(); yPos = 20; }
      });

      docPDF.save(`Report_${alert.diagnosticNo}_${alert.name}.pdf`);
    } catch (err) {
      console.error("Operation failed:", err);
    }
  };


  const handleCrossCheck = async (alert) => {
    try {
      await updateDoc(
        doc(db, "critical_alerts", alert.id),
        {
          crossChecked: true,
  
          crossCheckedBy:
            sessionStorage.getItem("loggedUser") || "Unknown",
  
          crossCheckedAt: serverTimestamp(),
        }
      );
    } catch (err) {
      console.error("Cross check failed:", err);
    }
  };

  const filteredAlerts = alerts
    .filter((a) => {
      if (a.status !== "Pending" && a.status !== "Reported") return false;
      const search = searchQuery.toLowerCase();
      if (search && !String(a.regNo).toLowerCase().includes(search) && 
                   !String(a.diagnosticNo).toLowerCase().includes(search)) return false;

      if (deptFilter !== "All" && a.dept !== deptFilter) return false;
      if (sourceFilter !== "All" && a.source !== sourceFilter) return false;

      const pDate = parseDateField(a.timePrinted || a.flaggedAt);
      if (pDate) {
        // FIX: Compare using local YYYY-MM-DD for consistency
        const entryDateStr = toLocalDateString(pDate);
        
        if (dateFrom && entryDateStr < dateFrom) return false;
        if (dateTo && entryDateStr > dateTo) return false;
      }
      return true;
    })
    .sort((a, b) => {
        const dateA = parseDateField(a.timePrinted || a.flaggedAt) || 0;
        const dateB = parseDateField(b.timePrinted || b.flaggedAt) || 0;
        return dateA - dateB;
    });

  const pendingCount = filteredAlerts.filter(a => a.status === "Pending").length;
  const reportedCount = filteredAlerts.filter(a => a.status === "Reported").length;

  return (
   
   <EngComponent name="Critical Dashboard" type="Page" parent={null}>
   <div className="register-section">
              <div className="header-row-critical">
          <h3 className="dept-header-critical">
            🚩 Critical Alerts Center
          </h3>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "15px",
            }}
          >
            <div className="alert-pill">
              Pending: {pendingCount} | Reported: {reportedCount}
            </div>
            <UserMenu /></div></div>

      

      <EngComponent name="Filters" type="Layout" parent="Critical Dashboard">
      <div className="filter-bar">
        <input 
          type="text" 
          className="reg-search" 
          placeholder="Search Reg or Diag No..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className="date-filters">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span>to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>

        <select 
          className="reg-search" 
          style={{width: 'auto', minWidth: '150px'}}
          value={deptFilter} 
          onChange={(e) => setDeptFilter(e.target.value)}
        >
          {uniqueDepartments.map(dept => (
            <option key={dept} value={dept}>{dept === "All" ? "All Departments" : dept}</option>
          ))}
        </select>

        <div className="source-buttons">
          {["OPD", "IPD", "Third Floor", "All"].map((src) => (
            <button 
              key={src} 
              className={sourceFilter === src ? "source-btn active" : "source-btn"}
              onClick={() => setSourceFilter(src)}
            >{src}</button>
          ))}
        </div>
      </div>
      </EngComponent>

      <EngComponent name="Alerts Table" type="Tables" parent="Critical Dashboard">
      <div className="table-scroll-container">
        <table className="backroom-table">
          <thead>
            <tr>
              <th>Reg No</th>
              <th>Diag No</th>
              <th>Patient Name</th>
              <th>Dept</th>
              <th>Age/Sex</th>
              <th>Doctor</th>
              <th>Tests</th>
              
              <th>Critical Finding</th>
              <th>Reported By</th>
              <th>Reported To</th>
              <th>Comm. Via</th>
              <th>Time Taken</th>
              <th>Crosschecked By</th>
              <th>Cross Check</th>
              <th>Action</th>
                </tr>

          </thead>
          <tbody>
            {filteredAlerts.map((alert) => (
              <tr 
                key={alert.id} 
                className={alert.status === "Reported" ? "row-green" : ""}
              >
                <td>{alert.regNo}</td>
                <td>{alert.diagnosticNo}</td>
                <td>{alert.name}</td>
                <td style={{ fontWeight: '600' }}>{alert.dept || "-"}</td>
                <td>{alert.age}/{alert.gender}</td>
                <td>{alert.doctor}</td>
                <td style={{ maxWidth: '150px' }}>{Array.isArray(alert.selectedTests) ? alert.selectedTests.join(", ") : alert.selectedTests}</td>

                <td
                  style={{
                    minWidth: "280px",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    textAlign: "left",
                    verticalAlign: "top",
                    fontWeight: "600",
                    color: "#dc2626",
                  }}
                >
                  {alert.criticalParameter}
                </td>

                   <td
                  style={{
                    fontWeight: "600",
                    color: "#1e3a8a"
                  }}
                >
                  {alert.reportedBy || "—"}
                </td>

                <td>
                <input
                  type="text"
                  value={reportedTo[alert.id] || alert.reportedTo || ""}
                  placeholder="Doctor / Nurse"
                  disabled={alert.status === "Reported"}
                  onChange={(e) =>
                    setReportedTo({
                      ...reportedTo,
                      [alert.id]: e.target.value,
                    })
                  }
                />
              </td>



                <td>

                  <select 
                    value={commMethods[alert.id] || alert.communicatedVia || ""} 
                    disabled={alert.status === "Reported"}
                    onChange={(e) => setCommMethods({...commMethods, [alert.id]: e.target.value})}
                  >
                    <option value="">Select Method</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Telephone">Telephone</option>
                  </select>
                </td>

                <td style={{ fontWeight: 'bold', color: '#059669' }}>
  {getTimeDiff(alert.flaggedAt, alert.reportedAt)}
</td>

              <td
                style={{
                  fontWeight: "600",
                  color: "#2563eb"
                }}
              >
                {alert.crossCheckedBy || "—"}
              </td>

              <td>
                {alert.crossChecked ? (
                  <span
                    style={{
                      color: "#2563eb",
                      fontWeight: "bold"
                    }}
                  >
                    ✓ Crosschecked
                  </span>
                ) : alert.status === "Reported" ? (
                 
                  <button
                  className="crosscheck-btn"
                  onClick={() => handleCrossCheck(alert)}
                >
                  Cross Check
                </button>
                ) : (
                  <span
                    style={{
                      color: "#9ca3af",
                      fontSize: "12px"
                    }}
                  >
                    Awaiting Report
                  </span>
                )}
              </td>

              <td>
                {alert.status === "Reported" ? (
                  <span
                    style={{
                      color: "#059669",
                      fontWeight: "bold"
                    }}
                  >
                    ✓ Reported
                  </span>
                ) : (
                  <button
                    className="save-btn"
                    disabled={!commMethods[alert.id]}
                    onClick={() => handleMarkDone(alert)}
                  >
                    Report
                  </button>
                )}
              </td>
                              
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </EngComponent>
    </div>
    </EngComponent>
  );
}