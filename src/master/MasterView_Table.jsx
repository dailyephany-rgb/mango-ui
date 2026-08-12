
import React, { useState, memo } from "react";
import "./MasterView_Table.css";
import { db } from "../firebaseConfig.js";
import {
  doc,
  deleteDoc,
  setDoc,
} from "firebase/firestore";
import { useMasterRegisterSnapshots } from "../shared/hooks/useMasterRegisterSnapshots.js";
import { useStableCallback } from "../shared/hooks/useStableCallback.js";
import SafeDateInput from "../shared/components/SafeDateInput.jsx";

const MasterRegisterRow = memo(function MasterRegisterRow({
  entry: e,
  onToggleUrgent,
  onEdit,
  onDelete,
}) {
  return (
    <tr>
      <td style={e.urgent ? { borderLeft: "4px solid red" } : {}}>{e.regNo}</td>
      <td>{e.diagnosticNo || "—"}</td>
      <td>{e.name}</td>
      <td>{e.father}</td>
      <td>{e.doctor}</td>
      <td>{e.category}</td>
      <td>{e.source}</td>
      <td>
        {e.selectedTests?.length > 0 ? (
          <ul>
            {e.selectedTests.map((t, i) => (
              <li key={i}>
                {t.dept}—{t.test}
              </li>
            ))}
          </ul>
        ) : (
          "—"
        )}
      </td>
      <td>
        <button
          className={`urgent-btn ${e.urgent ? "is-urgent" : ""}`}
          onClick={() => onToggleUrgent(e.id, e.urgent)}
        >
          {e.urgent ? "Urgent" : "Normal"}
        </button>
      </td>
      <td className="action-cell">
        <div className="action-btns-wrapper">
          <button className="edit-btn-action" onClick={() => onEdit(e)}>
            Edit
          </button>
          <button
            className="delete-btn-action"
            onClick={() => onDelete(e.id, e.name)}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}, (prev, next) => {
  if (prev.onToggleUrgent !== next.onToggleUrgent) return false;
  if (prev.onEdit !== next.onEdit) return false;
  if (prev.onDelete !== next.onDelete) return false;
  const a = prev.entry;
  const b = next.entry;
  return (
    a.id === b.id &&
    a.regNo === b.regNo &&
    a.diagnosticNo === b.diagnosticNo &&
    a.name === b.name &&
    a.father === b.father &&
    a.doctor === b.doctor &&
    a.category === b.category &&
    a.source === b.source &&
    a.urgent === b.urgent &&
    a.selectedTests === b.selectedTests
  );
});

export default function MasterView_Table() {
  
  
  const [dateFrom, setDateFrom] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  const [dateTo, setDateTo] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  const [sourceFilter, setSourceFilter] = useState("All");
  const [searchReg, setSearchReg] = useState("");

  const {
    masterEntries,
    loading,
  } = useMasterRegisterSnapshots({
    dateFrom,
    dateTo,
  });

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

  

  // Keep master_register + report_details in sync (Card view reads report_details)
  const toggleUrgent = async (docId, currentUrgent) => {
    const next = !currentUrgent;
    try {
      await Promise.all([
        setDoc(doc(db, "master_register", docId), { urgent: next }, { merge: true }),
        setDoc(doc(db, "report_details", docId), { urgent: next }, { merge: true }),
      ]);
    } catch (error) {
      console.error("Error updating urgency: ", error);
    }
  };

  const handleEdit = (entry) => {
    localStorage.setItem("editPatientData", JSON.stringify(entry));
    window.location.href = "/"; 
  };

  const handleDelete = async (docId, name) => {
    const confirmDelete = window.confirm(`Are you sure you want to delete entry for ${name}?`);
    if (confirmDelete) {
      try {
        await Promise.all([
          deleteDoc(doc(db, "master_register", docId)),
          deleteDoc(doc(db, "report_details", docId)),
        ]);
        alert("✅ Deleted successfully.");
      } catch (error) {
        console.error(error);
        alert(`❌ Error deleting entry: ${error.message}`);
      }
    }
  };

  const filteredEntries = masterEntries
    .filter((entry) => {
      


      const matchesSource = sourceFilter === "All" || entry.source?.toLowerCase() === sourceFilter.toLowerCase();
      
      const searchLower = searchReg.toLowerCase();
      const matchesSearch = !searchReg || 
        (entry.regNo?.toLowerCase().includes(searchLower)) || 
        (entry.diagnosticNo?.toLowerCase().includes(searchLower));

        return matchesSource && matchesSearch;
    })
    .sort((a, b) => {
      if (a.urgent !== b.urgent) {
        return a.urgent ? -1 : 1;
      }
      const dateA = parseDate(a);
      const dateB = parseDate(b);
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateA - dateB; 
    });

  const onToggleUrgent = useStableCallback((docId, currentUrgent) => {
    toggleUrgent(docId, currentUrgent);
  });
  const onEdit = useStableCallback((entry) => {
    handleEdit(entry);
  });
  const onDelete = useStableCallback((docId, name) => {
    handleDelete(docId, name);
  });

  return (
    <div className="master-container">
      <div className="header-bar"><h2>📋 Master Register — Table View</h2></div>
      <div className="filter-bar">
        <div className="filter-left">
          <input type="text" placeholder="Search Reg or Diag No..." value={searchReg} onChange={(e) => setSearchReg(e.target.value)} />
          <label>Date:</label>
          <SafeDateInput aria-label="Date from" value={dateFrom} onChange={(v) => v && setDateFrom(v)} />
          <span>to</span>
          <SafeDateInput aria-label="Date to" value={dateTo} onChange={(v) => v && setDateTo(v)} />
        </div>
        <div className="source-buttons">
          {["OPD", "IPD", "Third Floor", "All"].map((src) => (
            <button key={src} className={sourceFilter === src ? "active" : ""} onClick={() => setSourceFilter(src)}>{src}</button>
          ))}
        </div>
      </div>
      <div className="table-wrapper">
        <table className="master-table">
          <thead>
            <tr>
              <th>Reg No</th><th>Diagnostic No</th><th>Name</th><th>Father</th><th>Doctor</th><th>Category</th><th>Source</th><th>Tests</th>
              <th>Status</th> 
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => (
              <MasterRegisterRow
                key={e.id}
                entry={e}
                onToggleUrgent={onToggleUrgent}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
