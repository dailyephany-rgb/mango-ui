
import React, { useEffect, useState } from "react";
import "./MasterView_Table.css";
import { db } from "../firebaseConfig.js";
import { collection, onSnapshot, orderBy, query, doc, deleteDoc, setDoc } from "firebase/firestore";

export default function MasterView_Table() {
  const [entries, setEntries] = useState([]);
  const today = new Date().toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [sourceFilter, setSourceFilter] = useState("All");
  const [searchReg, setSearchReg] = useState("");

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
    const q = query(collection(db, "master_register"), orderBy("timePrinted", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setEntries(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  const toggleUrgent = async (regNo, currentUrgent) => {
    try {
      await setDoc(doc(db, "master_register", regNo), { 
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

  const handleDelete = async (regNo, name) => {
    const confirmDelete = window.confirm(`Are you sure you want to delete entry for ${name}?`);
    if (confirmDelete) {
      try {
        await deleteDoc(doc(db, "master_register", regNo));
        alert("✅ Deleted successfully.");
      } catch (error) {
        console.error(error);
      }
    }
  };

  const filteredEntries = entries
    .filter((entry) => {
      let entryDate = parseDate(entry);
      const entryDateStr = entryDate ? entryDate.toISOString().split("T")[0] : null;
      const inRange = !entryDateStr || (entryDateStr >= dateFrom && entryDateStr <= dateTo);
      const matchesSource = sourceFilter === "All" || entry.source?.toLowerCase() === sourceFilter.toLowerCase();
      
      // UPDATED SEARCH LOGIC FOR REG NO AND DIAGNOSTIC NO
      const searchLower = searchReg.toLowerCase();
      const matchesSearch = !searchReg || 
        (entry.regNo?.toLowerCase().includes(searchLower)) || 
        (entry.diagnosticNo?.toLowerCase().includes(searchLower));

      return inRange && matchesSource && matchesSearch;
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
          {/* UPDATED PLACEHOLDER */}
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
                    onClick={() => toggleUrgent(e.regNo, e.urgent)}
                  >
                    {e.urgent ? "Urgent" : "Normal"}
                  </button>
                </td>
                <td className="action-cell">
                  <div className="action-btns-wrapper">
                    <button className="edit-btn-action" onClick={() => handleEdit(e)}>Edit</button>
                    <button className="delete-btn-action" onClick={() => handleDelete(e.regNo, e.name)}>Delete</button>
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