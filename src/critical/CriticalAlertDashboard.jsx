
import React, { useState, useEffect } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  Timestamp
} from "firebase/firestore";
import jsPDF from "jspdf";
import "jspdf-autotable";
import "./CriticalDashboard.css";

export default function CriticalAlertDashboard() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commMethods, setCommMethods] = useState({});
  const [now, setNow] = useState(new Date());

  // 🔹 FILTER STATES
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);

    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const q = query(collection(db, "critical_alerts"));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setAlerts(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Unique departments for dropdown
  const uniqueDepartments = ["All", ...new Set(alerts.map(a => a.dept).filter(Boolean))].sort();

  const parseDate = (ts) => {
    if (!ts) return null;
    if (ts instanceof Timestamp) return ts.toDate();
    if (ts.toDate) return ts.toDate(); 
    if (ts.seconds) return new Date(ts.seconds * 1000);
    const d = new Date(ts);
    return isNaN(d) ? null : d;
  };

  const getTimeDiff = (flaggedAt, reportedAt) => {
    const start = parseDate(flaggedAt);
    const end = parseDate(reportedAt);
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
        // 🚨 UPDATED PDF LABEL
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

  const filteredAlerts = alerts
    .filter((a) => {
      if (a.status !== "Pending" && a.status !== "Reported") return false;
      const search = searchQuery.toLowerCase();
      if (search && !String(a.regNo).toLowerCase().includes(search) && 
                   !String(a.diagnosticNo).toLowerCase().includes(search)) return false;

      if (deptFilter !== "All" && a.dept !== deptFilter) return false;
      if (sourceFilter !== "All" && a.source !== sourceFilter) return false;

      const pDate = parseDate(a.timePrinted || a.flaggedAt);
      if (pDate) {
        const dateStr = pDate.toISOString().slice(0, 10);
        if (dateFrom && dateStr < dateFrom) return false;
        if (dateTo && dateStr > dateTo) return false;
      }
      return true;
    })
    .sort((a, b) => {
        const dateA = parseDate(a.timePrinted || a.flaggedAt) || 0;
        const dateB = parseDate(b.timePrinted || b.flaggedAt) || 0;
        return dateA - dateB;
    });

  const pendingCount = filteredAlerts.filter(a => a.status === "Pending").length;
  const reportedCount = filteredAlerts.filter(a => a.status === "Reported").length;

  return (
    <div className="register-section">
      <div className="header-row-critical">
        <h3 className="dept-header-critical">🚩 Critical Alerts Center</h3>
        <div className="alert-pill">
          Pending: {pendingCount} | Reported: {reportedCount}
        </div>
      </div>

      <div className="filter-bar">
        {/* 🚨 UPDATED PLACEHOLDER */}
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

      <div className="table-scroll-container">
        <table className="backroom-table">
          <thead>
            <tr>
              <th>Reg No</th>
              {/* 🚨 UPDATED COLUMN NAME */}
              <th>Diag No</th>
              <th>Patient Name</th>
              <th>Dept</th>
              <th>Age/Sex</th>
              <th>Doctor</th>
              <th>Tests</th>
              <th>Critical Finding</th>
              <th>Comm. Via</th>
              <th>Time Taken</th>
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
                <td style={{ maxWidth: '200px', fontWeight: 'bold', color: '#dc2626' }}>{alert.criticalParameter}</td>
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
                <td>
                  {alert.status === "Reported" ? (
                    <span style={{ color: '#059669', fontWeight: 'bold' }}>✓ Reported</span>
                  ) : (
                    <button 
                      className="save-btn"
                      disabled={!commMethods[alert.id]}
                      onClick={() => handleMarkDone(alert)}
                    >Report</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
