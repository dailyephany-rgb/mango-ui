
import React, {
  useState,
  useEffect,
  useMemo,
  useRef
} from "react";

import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  setDoc,
  doc,
  serverTimestamp,
  Timestamp, 
} from "firebase/firestore";
import OUTSOURCE_MAP from "../Outsource.json"; 
import "./Outsource.css";
import UserMenu from "../auth/UserMenu";

export default function OutsourceRegister() {
  const [entries, setEntries] = useState([]);
  const [activeLab, setActiveLab] = useState("All");
  const [activeSource, setActiveSource] = useState("All");
  const [saving, setSaving] = useState(false);
  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const currentUser = sessionStorage.getItem("loggedUser") ||
  "Unknown User";


  // 🛡️ REFRESH PROTECTION: Load local buffered data from LocalStorage
  const [localOutsourceData, setLocalOutsourceData] = useState(() => {
    const saved = localStorage.getItem("outsource_localBuffer");
    return saved ? JSON.parse(saved) : {};
  });
  const localBufferRef = useRef(localOutsourceData);

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
    localBufferRef.current = localOutsourceData;
  }, [localOutsourceData]);

  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const today = `${y}-${m}-${d}`;

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
          const diagNo = entry.diagnosticNo || entry.accNo || "—";
          const rawTests = entry.selectedTests || [];

          for (const [labName, labTests] of Object.entries(OUTSOURCE_MAP)) {
            const relevantTestsForThisLab = rawTests.filter(t => {
              const testTitle = (typeof t === "string" ? t : t?.test || "").toUpperCase().trim();
              return labTests.some(lt => testTitle === lt.toUpperCase().trim());
            });

            if (relevantTestsForThisLab.length > 0) {
              // UPDATE: Composite Key includes Registration, Diagnostic No, and Lab Name
              const uniqueTrackingId = `${reg}_${diagNo}_${labName.replace(/\s+/g, '')}`;
              
              const firebaseData = trackingMap[uniqueTrackingId] || {};
              const bufferedData =
              localBufferRef.current[
                uniqueTrackingId
              ] || {};

              const outData = {
                status: "Pending",
                concernedPerson: "",
                relation: "",
                mobileNo: "",
              
                isCollected: false,
                isGiven: false,
              
                outsourcedCollectedTime: null,
                reportReceivedTime: null,
                reportDeliveredTime: null,
              
                collectedBy: "",
                receivedBy: "",
                deliveredBy: "",
              
                ...firebaseData,
                ...bufferedData
              };

              expandedEntries.push({
                ...entry,
                regNo: reg,
                uniqueTrackingId: uniqueTrackingId,
                accessionNo: diagNo,
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
      
      let finalCollectedTime = null;

      if (
        entry.outsourcedCollectedTime
      ) {
        finalCollectedTime =
          entry.outsourcedCollectedTime
            .toDate
            ? entry.outsourcedCollectedTime
            : Timestamp.fromDate(
                new Date(
                  entry.outsourcedCollectedTime
                )
              );
      }

      const updatePayload = {
        compositeId: trackingId,
        name: entry.name || "",
        age: entry.age || "",
        ageUnit: entry.ageUnit || "",
        gender: entry.gender || "", 
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
        outsourcedCollectedTime: finalCollectedTime,
        reportReceivedTime: serverTimestamp(), 
        receivedBy: currentUser,
        timePrinted: entry.timePrinted || null,
        timeCollected: entry.timeCollected || null,
        scannedStatus: entry.status === "Scanned" ? "Yes" : "No",
        receivedStatus: "Yes",
        isCollected: true, 
        status: entry.status
      };

      await setDoc(
        doc(
          db,
          "outsource_tracking",
          trackingId
        ),
        updatePayload,
        { merge: true }
      );
      
      setLocalOutsourceData(prev => {
        const updated = { ...prev };
        delete updated[trackingId];
        localStorage.setItem("outsource_localBuffer", JSON.stringify(updated));
        return updated;
      });

    

      alert(`Entry for ${entry.name} (${entry.labName}) Received`);
    } catch (err) {
      console.error(err);
      alert("Error saving data: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleGiven = async (entry) => {
    try {
      setSaving(true);
      const trackingId = entry.uniqueTrackingId;
      await setDoc(
        doc(db, "outsource_tracking", trackingId),
        {
          isGiven: true,
          reportDeliveredTime:
            serverTimestamp(),
          deliveredBy:
            currentUser
        },
        { merge: true }
      );


      alert(`Report for ${entry.name} marked as Given`);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (entry, newStatus) => {
    const trackingId = entry.uniqueTrackingId;
    const now = new Date().toISOString();
  
    if (newStatus === "Scanned") {
      await setDoc(
        doc(db, "outsource_tracking", trackingId),
        {
          status: "Scanned",
          outsourcedCollectedTime: serverTimestamp(),
          collectedBy: currentUser,
        },
        { merge: true }
      );
    }
  
    setEntries((prev) =>
      prev.map((e) =>
        e.uniqueTrackingId !== trackingId
          ? e
          : {
              ...e,
              status: newStatus,
              outsourcedCollectedTime:
                newStatus === "Scanned" ? now : null,
              collectedBy:
                newStatus === "Scanned" ? currentUser : "",
            }
      )
    );
  
    setLocalOutsourceData((prev) => {
      const updated = {
        ...prev,
        [trackingId]: {
          ...(prev[trackingId] || {}),
          status: newStatus,
          outsourcedCollectedTime:
            newStatus === "Scanned" ? now : null,
          collectedBy:
            newStatus === "Scanned" ? currentUser : "",
        },
      };
  
      localStorage.setItem(
        "outsource_localBuffer",
        JSON.stringify(updated)
      );
  
      return updated;
    });
  };
        


  const updateLocalEntry = (uniqueId, field, value) => {
    // Update the UI immediately
    setEntries(prev =>
      prev.map(e =>
        e.uniqueTrackingId === uniqueId
          ? { ...e, [field]: value }
          : e
      )
    );
  
    // Keep the local buffer in sync
    setLocalOutsourceData(prev => {
      const updated = {
        ...prev,
        [uniqueId]: {
          ...(prev[uniqueId] || {}),
          [field]: value
        }
      };
  
      localStorage.setItem(
        "outsource_localBuffer",
        JSON.stringify(updated)
      );
  
      return updated;
    });
  };

  const filteredEntries = useMemo(() => {
    return entries
      .filter((e) => {
        if (activeLab !== "All" && e.labName !== activeLab) return false;
        if (activeSource !== "All" && e.source !== activeSource) return false;
        
        if (regSearch.trim()) {
          const searchStr = regSearch.trim().toLowerCase();
          const regKey = String(e.regNo || "").toLowerCase();
          const accKey = String(e.accessionNo || "").toLowerCase();
          if (!regKey.includes(searchStr) && !accKey.includes(searchStr)) return false;
        }
        
        const d = parseDate(e);
        if (d) {
          const entryDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          if (dateFrom && entryDateStr < dateFrom) return false;
          if (dateTo && entryDateStr > dateTo) return false;
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
  }, [entries, activeLab, activeSource, regSearch, dateFrom, dateTo]);

  return (
    <div className="register-section">

  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "20px"
    }}
  >
    <h3 className="dept-header">
      📦 Outsource Department Register
    </h3>

    <UserMenu />
  </div> 
      
      <div className="filter-bar">
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
              <th className="sticky-col">Diag No</th>
              <th className="sticky-col">Name</th>
              <th>Outsource Collected</th>
              <th>Age</th>
              <th>Test(s)</th>
              <th>Lab</th>
              <th>Person</th>
              <th>Relation</th>
              <th>Mobile</th>

              <th>Collected By</th>
              <th>Received By</th>
              <th>Delivered By</th>

              <th>TAT</th>
              <th>Sample</th>
              <th>Received</th>
              <th>Delivered</th>

            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => {
              const sTime =
              e.outsourcedCollectedTime?.toDate
                ? e.outsourcedCollectedTime.toDate()
                : (
                    e.outsourcedCollectedTime
                      ? new Date(
                          e.outsourcedCollectedTime
                        )
                      : null
                  );

                  const rTime =
                  e.reportReceivedTime?.toDate
                    ? e.reportReceivedTime.toDate()
                    : (
                        e.reportReceivedTime
                          ? new Date(
                              e.reportReceivedTime
                            )
                          : null
                      );
              
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
                    {(e.displayTests || []).map(t => typeof t === 'string' ? t : t.test).join(", ") || "—"}
                  </td>
                  <td><span className="lab-badge">{e.labName}</span></td>
                  <td><input type="text" className="table-input" disabled={!isScanned || e.isGiven}
                   value={e.concernedPerson || ""} onChange={(ev) => updateLocalEntry(e.uniqueTrackingId, "concernedPerson", ev.target.value)} placeholder="Name" /></td>
                  <td><input type="text" className="table-input" disabled={!isScanned || e.isGiven} 
                  value={e.relation || ""} onChange={(ev) => updateLocalEntry(e.uniqueTrackingId, "relation", ev.target.value)} placeholder="Relation" /></td>
                  <td><input type="text" className="table-input" disabled={!isScanned || e.isGiven}
                  value={e.mobileNo || ""} onChange={(ev) => updateLocalEntry(e.uniqueTrackingId, "mobileNo", ev.target.value)} placeholder="Mobile" /></td>
                  <td>{e.collectedBy || "—"}</td>
                  <td>{e.receivedBy || "—"}</td>
                  <td>{e.deliveredBy || "—"}</td>
                  <td style={{ fontWeight: 'bold', color: '#1e3a8a' }}>{tatDisplay}</td>
                  <td>
                   
                   
                  <button
                    className={`collect-btn ${
                      isScanned ? "collected" : ""
                    }`}
                    disabled={isScanned}
                    onClick={() =>
                      handleStatusChange(
                        e,
                        "Scanned"
                      )
                    }
                  >
                    {isScanned
                      ? "Collected"
                      : "Collect"}
                  </button>

                  </td>
                  <td>
                    
                  <button
                    className="save-btn"
                    disabled={
                      saving ||
                      !isScanned ||
                      e.isCollected
                    }
                    onClick={() => handleSave(e)}
                  >
                    {e.isCollected
                      ? "Received"
                      : "Mark Received"}
                  </button>
                  </td>
                  <td>
                  <button
                    className="given-btn"
                    disabled={
                      saving ||
                      !e.isCollected ||
                      e.isGiven ||
                      !fieldsFilled
                    }
                    onClick={() => handleGiven(e)}
                  >
                    {e.isGiven
                      ? "Delivered"
                      : "Deliver"}
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