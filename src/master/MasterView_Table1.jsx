import React, { useEffect, useState } from "react";
import "./MasterView_Table.css";
import { db } from "../firebaseConfig.js";
import {
  collection,
  orderBy,
  query,
  where,
  Timestamp,
  doc,
  deleteDoc,
  setDoc,
} from "firebase/firestore";
import { trackedOnSnapshot as onSnapshot } from "../shared/firestore/trackedFirestore.js";
import {
  getLocalDateString,
  localDayStart,
  localDayEndExclusive,
  parseDateField,
} from "../shared/utils/dates.js";

export default function MasterView_Table() {
  const today = getLocalDateString();
  const [entries, setEntries] = useState([]);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [sourceFilter, setSourceFilter] = useState("All");
  const [searchReg, setSearchReg] = useState("");

  const parseDate = (entry) => parseDateField(entry?.timePrinted);

  // master_register scoped by timePrinted date range
  useEffect(() => {
    const start = localDayStart(dateFrom);
    const endExclusive = localDayEndExclusive(dateTo);
    if (!start || !endExclusive) {
      setEntries([]);
      return undefined;
    }

    const q = query(
      collection(db, "master_register"),
      where("timePrinted", ">=", Timestamp.fromDate(start)),
      where("timePrinted", "<", Timestamp.fromDate(endExclusive)),
      orderBy("timePrinted", "asc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        console.error("[MasterView_Table] timePrinted query failed:", err);
        setEntries([]);
      }
    );
    return () => unsub();
  }, [dateFrom, dateTo]);

  // FIX: Use e.id instead of regNo to target the composite ID in Firestore
  const toggleUrgent = async (docId, currentUrgent) => {
    try {
      await setDoc(doc(db, "master_register", docId), { 
        urgent: !currentUrgent 
      }, { merge: true });
    } catch (error) {
      console.error("Error updating urgency: ", error);
    }
  };

  const handleEdit = (entry) => {
    localStorage.setItem("editPatientData", JSON.stringify(entry));
    window.location.href = "/"; 
  };

  // FIX: Use e.id instead of regNo for deletion
  const handleDelete = async (docId, name) => {
    const confirmDelete = window.confirm(`Are you sure you want to delete entry for ${name}?`);
    if (confirmDelete) {
      try {
        await deleteDoc(doc(db, "master_register", docId));
        alert("✅ Deleted successfully.");
      } catch (error) {
        console.error(error);
      }
    }
  };

  // Date applied in Firestore; source + search stay client-side; urgent floats to top
  const filteredEntries = entries
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

  return (
    <div className="master-container">
      <div className="header-bar"><h2>📋 Master Register — Table View</h2></div>
      <div className="filter-bar">
        <div className="filter-left">
          <input type="text" placeholder="Search Reg or Diag No..." value={searchReg} onChange={(e) => setSearchReg(e.target.value)} />
          <label>Date:</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span>to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
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
              <tr key={e.id}>
                <td style={e.urgent ? { borderLeft: "4px solid red" } : {}}>{e.regNo}</td>
                <td>{e.diagnosticNo || "—"}</td><td>{e.name}</td><td>{e.father}</td><td>{e.doctor}</td><td>{e.category}</td><td>{e.source}</td>
                <td>
                  {e.selectedTests?.length > 0 ? (
                    <ul>{e.selectedTests.map((t, i) => <li key={i}>{t.dept}—{t.test}</li>)}</ul>
                  ) : "—"}
                </td>
                <td>
                   <button 
                    className={`urgent-btn ${e.urgent ? "is-urgent" : ""}`}
                    // Use e.id here
                    onClick={() => toggleUrgent(e.id, e.urgent)}
                  >
                    {e.urgent ? "Urgent" : "Normal"}
                  </button>
                </td>
                <td className="action-cell">
                  <div className="action-btns-wrapper">
                    <button className="edit-btn-action" onClick={() => handleEdit(e)}>Edit</button>
                    {/* Use e.id here */}
                    <button className="delete-btn-action" onClick={() => handleDelete(e.id, e.name)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
