
import React, { useState, useEffect } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  setDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import OUTSOURCE_MAP from "../Outsource.json"; 
import "./Outsource.css";

export default function OutsourceRegister() {
  const [entries, setEntries] = useState([]);
  const [activeLab, setActiveLab] = useState("All");
  const [activeSource, setActiveSource] = useState("All");
  const [saving, setSaving] = useState(false);
  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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
    const today = new Date().toISOString().slice(0, 10);
    setDateFrom(today);
    setDateTo(today);
  }, []);

  useEffect(() => {
    const unsubMaster = onSnapshot(collection(db, "master_register"), (masterSnap) => {
      const unsubTracking = onSnapshot(collection(db, "outsource_tracking"), (trackSnap) => {
        
        const trackingMap = {};
        trackSnap.forEach(docSnap => {
          trackingMap[docSnap.id] = docSnap.data();
        });

        const allMaster = masterSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        let expandedEntries = [];

        allMaster.forEach((entry) => {
          const reg = String(entry.regNo || entry.id);
          const rawTests = entry.selectedTests || [];

          for (const [labName, labTests] of Object.entries(OUTSOURCE_MAP)) {
            const relevantTestsForThisLab = rawTests.filter(t => {
              const testTitle = (typeof t === "string" ? t : t?.test || "").toUpperCase().trim();
              return labTests.some(lt => testTitle.includes(lt.toUpperCase().trim()));
            });

            if (relevantTestsForThisLab.length > 0) {
              const uniqueTrackingId = `${reg}_${labName.replace(/\s+/g, '')}`;
              const outData = trackingMap[uniqueTrackingId] || {
                status: "Pending",
                concernedPerson: "",
                relation: "",
                mobileNo: "",
                isCollected: false,
                isGiven: false, 
                scannedTime: null,
                receivedTime: null,
                givenTime: null,
              };

              expandedEntries.push({
                ...entry,
                regNo: reg,
                uniqueTrackingId: uniqueTrackingId,
                accessionNo: entry.diagnosticNo || entry.accNo || "—",
                source: entry.source || "OPD",
                labName: labName,
                displayTests: relevantTestsForThisLab,
                ...outData
              });
            }
          }
        });

        setEntries(expandedEntries);
      });
      return () => unsubTracking();
    });
    return () => unsubMaster();
  }, []);

  const handleSave = async (entry) => {
    try {
      setSaving(true);
      const trackingId = entry.uniqueTrackingId;
      
      const updatePayload = {
        name: entry.name || "",
        age: entry.age || "",
        ageUnit: entry.ageUnit || "",
        regNo: entry.regNo || "",
        diagnosticNo: entry.accessionNo || "",
        doctorName: entry.doctor || "",
        concernedPerson: entry.concernedPerson || "",
        mobileNo: entry.mobileNo || "",
        relation: entry.relation || "",
        labName: entry.labName || "",
        source: entry.source || "OPD",
        category: entry.category || "", 
        selectedTests: (entry.displayTests || []).map(t => typeof t === 'string' ? t : t.test),
        scannedTime: entry.scannedTime || null, 
        receivedTime: serverTimestamp(), 
        timePrinted: entry.timePrinted || null,
        timeCollected: entry.timeCollected || null,
        scannedStatus: entry.status === "Scanned" ? "Yes" : "No",
        receivedStatus: "Yes",
        isCollected: true, 
        status: entry.status
      };

      await setDoc(doc(db, "outsource_tracking", trackingId), updatePayload, { merge: true });
      alert(`Entry for ${entry.name} (${entry.labName}) Received`);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleGiven = async (entry) => {
    try {
      setSaving(true);
      const trackingId = entry.uniqueTrackingId;
      await setDoc(doc(db, "outsource_tracking", trackingId), {
        isGiven: true,
        givenTime: serverTimestamp()
      }, { merge: true });
      alert(`Report for ${entry.name} marked as Given`);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = (entry, newStatus) => {
    const now = new Date();
    setEntries(prev => prev.map(e => {
      if (e.uniqueTrackingId === entry.uniqueTrackingId) {
        return { ...e, status: newStatus, scannedTime: newStatus === "Scanned" ? now : null };
      }
      return e;
    }));
  };

  const updateLocalEntry = (uniqueId, field, value) => {
    setEntries(prev => prev.map(e => e.uniqueTrackingId === uniqueId ? { ...e, [field]: value } : e));
  };

  const filteredEntries = entries
    .filter((e) => {
      if (activeLab !== "All" && e.labName !== activeLab) return false;
      if (activeSource !== "All" && e.source !== activeSource) return false;
      
      // Dual Search Logic (Reg No or Diag No)
      if (regSearch.trim()) {
        const searchStr = regSearch.trim().toLowerCase();
        const regKey = String(e.regNo || "").toLowerCase();
        const accKey = String(e.accessionNo || "").toLowerCase();
        if (!regKey.includes(searchStr) && !accKey.includes(searchStr)) return false;
      }
      
      const d = parseDate(e);
      if (d) {
        const dateStr = d.toISOString().split("T")[0];
        if (dateFrom && dateStr < dateFrom) return false;
        if (dateTo && dateStr > dateTo) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const dateA = parseDate(a);
      const dateB = parseDate(b);
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateA - dateB;
    });

  return (
    <div className="register-section">
      <h3 className="dept-header">📦 Outsource Department Register</h3>
      
      <div className="filter-bar">
        {/* Updated Placeholder to Diag No */}
        <input className="reg-search" placeholder="Search Reg or Diag No..." value={regSearch} onChange={(e) => setRegSearch(e.target.value)} />
        <div className="date-filters">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span>to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="source-filters">
          {["OPD", "IPD", "Third Floor", "All"].map((src) => (
            <button key={src} className={`source-btn ${activeSource === src ? "active" : ""}`} onClick={() => setActiveSource(src)}>{src}</button>
          ))}
        </div>
      </div>

      <div className="tab-container">
        {[...Object.keys(OUTSOURCE_MAP), "All"].map((lab) => (
          <button key={lab} className={`tab-btn ${activeLab === lab ? "active" : ""}`} onClick={() => setActiveLab(lab)}>{lab}</button>
        ))}
      </div>

      <div className="table-container">
        <table className="backroom-table">
          <thead>
            <tr>
              <th className="sticky-col">Reg No</th>
              {/* Column Name updated to Diag No */}
              <th className="sticky-col">Diag No</th>
              <th className="sticky-col">Name</th>
              <th>Scanned Time</th>
              <th>Age</th>
              <th>Test(s)</th>
              <th>Lab</th>
              <th>Person</th>
              <th>Relation</th>
              <th>Mobile</th>
              <th>TAT</th>
              <th>Status</th>
              <th>Action</th>
              <th>Report</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => {
              const sTime = e.scannedTime?.toDate ? e.scannedTime.toDate() : (e.scannedTime ? new Date(e.scannedTime) : null);
              const rTime = e.receivedTime?.toDate ? e.receivedTime.toDate() : (e.receivedTime ? new Date(e.receivedTime) : null);
              
              let tatDisplay = "—";
              if (sTime && rTime) {
                const diffMs = rTime - sTime;
                const totalMinutes = Math.floor(diffMs / 60000);
                const totalHours = Math.floor(totalMinutes / 60);
                tatDisplay = totalHours >= 24 ? `${Math.floor(totalHours / 24)}d ${totalHours % 24}h` : `${totalHours}h ${totalMinutes % 60}m`;
              }

              const isScanned = e.status === "Scanned";
              const fieldsFilled = e.concernedPerson?.trim() && e.relation?.trim() && e.mobileNo?.trim();

              return (
                <tr key={e.uniqueTrackingId} className={e.isGiven ? "row-orange" : e.isCollected ? "row-green" : isScanned ? "row-yellow" : ""}>
                  <td className="sticky-col">{e.regNo}</td>
                  <td className="sticky-col">{e.accessionNo}</td>
                  <td className="sticky-col">{e.name}</td>
                  <td>{sTime ? sTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}</td>
                  <td>{e.age} {e.ageUnit}</td>
                  <td style={{ maxWidth: '180px' }}>
                    {(e.displayTests || []).map(t => typeof t === 'string' ? t : t.test).join(", ")}
                  </td>
                  <td><span className="lab-badge">{e.labName}</span></td>
                  <td><input type="text" className="table-input" disabled={!isScanned || e.isCollected} value={e.concernedPerson || ""} onChange={(ev) => updateLocalEntry(e.uniqueTrackingId, "concernedPerson", ev.target.value)} placeholder="Name" /></td>
                  <td><input type="text" className="table-input" disabled={!isScanned || e.isCollected} value={e.relation || ""} onChange={(ev) => updateLocalEntry(e.uniqueTrackingId, "relation", ev.target.value)} placeholder="Relation" /></td>
                  <td><input type="text" className="table-input" disabled={!isScanned || e.isCollected} value={e.mobileNo || ""} onChange={(ev) => updateLocalEntry(e.uniqueTrackingId, "mobileNo", ev.target.value)} placeholder="Mobile" /></td>
                  <td style={{ fontWeight: 'bold', color: '#1e3a8a' }}>{tatDisplay}</td>
                  <td>
                    <select className="table-select" disabled={e.isCollected} value={e.status || "Pending"} onChange={(ev) => handleStatusChange(e, ev.target.value)}>
                      <option value="Pending">Pending</option>
                      <option value="Scanned">Scanned</option>
                    </select>
                  </td>
                  <td>
                    <button className="save-btn" disabled={saving || !(isScanned && fieldsFilled) || e.isCollected} onClick={() => handleSave(e)}>
                      {e.isCollected ? "Received" : "Receive"}
                    </button>
                  </td>
                  <td>
                    <button className="given-btn" disabled={saving || !e.isCollected || e.isGiven} onClick={() => handleGiven(e)}>
                      {e.isGiven ? "Given" : "Give"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}