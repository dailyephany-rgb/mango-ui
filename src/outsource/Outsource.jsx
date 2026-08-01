
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
  getDoc,
  doc,
  writeBatch,
  serverTimestamp,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";


import OUTSOURCE_MAP from "../Outsource.json"; 
import "./Outsource.css";
import UserMenu from "../auth/UserMenu";
import {
  parseEntryDate,
  toLocalDateString,
  getLocalDateString,
  localDayStart,
  localDayEndExclusive,
} from "../shared/utils/dates.js";
import { usePersistedObjectState } from "../shared/hooks/usePersistedObjectState.js";
import { useRegisterFilters } from "../shared/hooks/useRegisterFilters.js";
import { useScopedMasterEntries } from "../shared/hooks/useScopedMasterEntries.js";

export default function OutsourceRegister() {
  const [trackingMap, setTrackingMap] = useState({});
  const [activeLab, setActiveLab] = useState("All");
  const [activeSource, setActiveSource] = useState("All");
  const [saving, setSaving] = useState(false);
  const currentUser = sessionStorage.getItem("loggedUser") ||
  "Unknown User";

  const {
    regSearch,
    setRegSearch,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
  } = useRegisterFilters();

  // 🛡️ REFRESH PROTECTION: Load local buffered data from LocalStorage
  const [localOutsourceData, setLocalOutsourceData] = usePersistedObjectState(
    "outsource_localBuffer",
    {}
  );
  const localBufferRef = useRef(localOutsourceData);

  useEffect(() => {
    localBufferRef.current = localOutsourceData;
  }, [localOutsourceData]);

  // "All" → date-only master query; specific lab → departments array-contains
  const { masterEntries } = useScopedMasterEntries({
    masterDeptKey: activeLab === "All" ? null : activeLab,
    dateFrom,
    dateTo,
  });

  useEffect(() => {
    const fromStr = dateFrom || getLocalDateString();
    const toStr = dateTo || getLocalDateString();
    const start = localDayStart(fromStr);
    const endExclusive = localDayEndExclusive(toStr);
    if (!start || !endExclusive) return undefined;

    const trackingQuery = query(
      collection(db, "outsource_tracking"),
      where("timePrinted", ">=", Timestamp.fromDate(start)),
      where("timePrinted", "<", Timestamp.fromDate(endExclusive)),
      orderBy("timePrinted", "asc")
    );

    const unsubTracking = onSnapshot(
      trackingQuery,
      (trackSnap) => {
        const next = {};
        trackSnap.forEach((docSnap) => {
          next[docSnap.id] = docSnap.data();
        });
        setTrackingMap(next);
      },
      (err) => {
        console.error(
          "[Outsource] outsource_tracking timePrinted query failed:",
          err
        );
      }
    );
    return () => unsubTracking();
  }, [dateFrom, dateTo]);

  const entries = useMemo(() => {
    const expandedEntries = [];

    masterEntries.forEach((entry) => {
      const reg = String(entry.regNo || entry.id);
      const diagNo = entry.diagnosticNo || entry.accNo || "—";
      const rawTests = entry.selectedTests || [];

      for (const [labName, labTests] of Object.entries(OUTSOURCE_MAP)) {
        if (activeLab !== "All" && labName !== activeLab) continue;

        const relevantTestsForThisLab = rawTests.filter((t) => {
          const testTitle = (
            typeof t === "string" ? t : t?.test || ""
          )
            .toUpperCase()
            .trim();
          return labTests.some(
            (lt) => testTitle === lt.toUpperCase().trim()
          );
        });

        if (relevantTestsForThisLab.length > 0) {
          const uniqueTrackingId = `${reg}_${diagNo}_${labName.replace(/\s+/g, "")}`;

          const firebaseData = trackingMap[uniqueTrackingId] || {};
          const bufferedData =
            localBufferRef.current[uniqueTrackingId] || {};

          const outData = {
            status: "Pending",
            concernedPerson: "",
            relation: "",
            mobileNo: "",

            isCollected: false,
            isReceived: false,
            isGiven: false,

            outsourcedCollectedTime: null,
            reportReceivedTime: null,
            reportDeliveredTime: null,

            collectedBy: "",
            receivedBy: "",
            deliveredBy: "",

            ...firebaseData,
            ...bufferedData,
          };

          expandedEntries.push({
            ...entry,
            regNo: reg,
            uniqueTrackingId: uniqueTrackingId,
            accessionNo: diagNo,
            source: entry.source || "OPD",
            labName: labName,
            displayTests: relevantTestsForThisLab,
            ...outData,
          });
        }
      }
    });

    return expandedEntries;
  }, [masterEntries, trackingMap, localOutsourceData, activeLab]);

  const handleSave = async (entry) => {
    try {
      setSaving(true);
      const trackingId = entry.uniqueTrackingId;
      
      

      const updatePayload = {
        concernedPerson: entry.concernedPerson || "",
        mobileNo: entry.mobileNo || "",
        relation: entry.relation || "",
      
        reportReceivedTime: serverTimestamp(),
        receivedBy: currentUser,
        receivedStatus: "Yes",
      
        isReceived: true,
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

      const reportRef = doc(db, "report_details", entry.id);

      const reportSnap = await getDoc(reportRef);
      
      const existingReceived =
        reportSnap.exists()
          ? reportSnap.data().outsourceReportsReceived || {}
          : {};
      
      const updatedReceived = {
        ...existingReceived,
        [entry.labName]: true,
      };
      
      await setDoc(
        reportRef,
        {
          outsourceReportsReceived: updatedReceived,
        },
        { merge: true }
      );


      setTrackingMap((prev) => ({
        ...prev,
        [trackingId]: {
          ...(prev[trackingId] || {}),
          isReceived: true,
          reportReceivedTime: new Date().toISOString(),
          receivedBy: currentUser,
        },
      }));
      
      setLocalOutsourceData(prev => {
        const updated = { ...prev };
        delete updated[trackingId];
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
  
      const reportRef = doc(db, "report_details", entry.id);
      const reportSnap = await getDoc(reportRef);
  
      const batch = writeBatch(db);

      batch.set(
        doc(db, "outsource_tracking", trackingId),
        {
          isGiven: true,
          reportDeliveredTime: serverTimestamp(),
          deliveredBy: currentUser,
        },
        { merge: true }
      );
  
      // Outsource tracking
      
      const existingDelivered =reportSnap.exists()
    ? reportSnap.data().outsourceReportsDelivered || {}
    : {};

      const updatedDelivered = {
        ...existingDelivered,
        [entry.labName]: true,
      };

      batch.set(
        reportRef,
        {
          outsourceReportsDelivered: updatedDelivered,
        },
        { merge: true }
      );
  
     
  
      await batch.commit();

      setTrackingMap((prev) => ({
        ...prev,
        [trackingId]: {
          ...(prev[trackingId] || {}),
          isGiven: true,
          reportDeliveredTime: new Date().toISOString(),
          deliveredBy: currentUser,
        },
      }));
  
      alert(`Report for ${entry.name} marked as Delivered`);
    } catch (err) {
      console.error(err);
      alert("Failed to deliver report.");
    } finally {
      setSaving(false);
    }
  };
      

  const handleStatusChange = async (entry, newStatus) => {
    try {
      setSaving(true);
  
      const trackingId = entry.uniqueTrackingId;
      const now = new Date().toISOString();
  
      const trackingRef = doc(db, "outsource_tracking", trackingId);
  
      const existingDoc = await getDoc(trackingRef);

if (newStatus === "Scanned" && !existingDoc.exists()) {
  await setDoc(
    trackingRef,
       
        {
          compositeId: trackingId,
      
          name: entry.name || "",
          age: entry.age || "",
          ageUnit: entry.ageUnit || "",
          gender: entry.gender || "",
      
          regNo: entry.regNo || "",
          diagnosticNo: entry.accessionNo || "",
      
          doctorName: entry.doctor || "",
      
          labName: entry.labName || "",
          source: entry.source || "OPD",
          category: entry.category || "",
      
          selectedTests: (entry.displayTests || []).map(t =>
            typeof t === "string" ? t : t.test
          ),
      
          timePrinted: entry.timePrinted || null,
          timeCollected: entry.timeCollected || null,
      
          status: "Scanned",
          scannedStatus: "Yes",
      
          outsourcedCollectedTime: serverTimestamp(),
          collectedBy: currentUser,
      
          isCollected: true,
          isReceived: false,
          isGiven: false,
        }
      );

      const reportRef = doc(db, "report_details", entry.id);

      const reportSnap = await getDoc(reportRef);
      
      const existingCollected =
        reportSnap.exists()
          ? reportSnap.data().outsourceReportsCollected || {}
          : {};
      
      const updatedCollected = {
        ...existingCollected,
        [entry.labName]: true,
      };
      
      await setDoc(
        reportRef,
        {
          outsourceReportsCollected: updatedCollected,
        },
        { merge: true }
      );
        
    }
  
    setTrackingMap((prev) => ({
      ...prev,
      [trackingId]: {
        ...(prev[trackingId] || {}),
        status: newStatus,
        isCollected: newStatus === "Scanned",
        outsourcedCollectedTime:
          newStatus === "Scanned" ? now : null,
        collectedBy:
          newStatus === "Scanned" ? currentUser : "",
      },
    }));
  
    setLocalOutsourceData((prev) => ({
      ...prev,
      [trackingId]: {
        ...(prev[trackingId] || {}),
        status: newStatus,
        isCollected: newStatus === "Scanned",
        outsourcedCollectedTime:
          newStatus === "Scanned" ? now : null,
        collectedBy:
          newStatus === "Scanned" ? currentUser : "",
      },
    }));
  } catch (err) {
    console.error(err);
    alert("Failed to collect sample.");
  } finally {
    setSaving(false);
  }
};
        


  const updateLocalEntry = (uniqueId, field, value) => {
    // Keep the local buffer in sync (entries recompute from buffer)
    setLocalOutsourceData(prev => ({
      ...prev,
      [uniqueId]: {
        ...(prev[uniqueId] || {}),
        [field]: value
      }
    }));
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
        
        const d = parseEntryDate(e, ["timePrinted"]);
        if (d) {
          const entryDateStr = toLocalDateString(d);
          if (dateFrom && entryDateStr < dateFrom) return false;
          if (dateTo && entryDateStr > dateTo) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const dateA = parseEntryDate(a, ["timePrinted"]);
        const dateB = parseEntryDate(b, ["timePrinted"]);
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

              const isCollected = e.isCollected;
              const fieldsFilled = e.concernedPerson?.trim() && e.relation?.trim() && e.mobileNo?.trim();
             

              return (
                <tr key={e.uniqueTrackingId} 
                className={
                  e.isGiven
                    ? "row-orange"
                    : e.isReceived
                      ? "row-green"
                      : e.isCollected
                        ? "row-yellow"
                        : ""
                }              
                >
                  <td className="sticky-col">{e.regNo}</td>
                  <td className="sticky-col">{e.accessionNo}</td>
                  <td className="sticky-col">{e.name}</td>
                  <td>{sTime ? sTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}</td>
                  <td>{e.age} {e.ageUnit}</td>
                  <td style={{ maxWidth: '180px' }}>
                    {(e.displayTests || []).map(t => typeof t === 'string' ? t : t.test).join(", ") || "—"}
                  </td>
                  <td><span className="lab-badge">{e.labName}</span></td>
                  <td><input type="text" className="table-input" 
                  disabled={!isCollected || e.isGiven}
                   value={e.concernedPerson || ""} onChange={(ev) => updateLocalEntry(e.uniqueTrackingId, "concernedPerson", ev.target.value)} placeholder="Name" /></td>
                  <td><input type="text" className="table-input" 
                  disabled={!isCollected || e.isGiven}
                  value={e.relation || ""} onChange={(ev) => updateLocalEntry(e.uniqueTrackingId, "relation", ev.target.value)} placeholder="Relation" /></td>
                  <td><input type="text" className="table-input" 
                  disabled={!isCollected || e.isGiven}
                  value={e.mobileNo || ""} onChange={(ev) => updateLocalEntry(e.uniqueTrackingId, "mobileNo", ev.target.value)} placeholder="Mobile" /></td>
                  <td>{e.collectedBy || "—"}</td>
                  <td>{e.receivedBy || "—"}</td>
                  <td>{e.deliveredBy || "—"}</td>
                  <td style={{ fontWeight: 'bold', color: '#1e3a8a' }}>{tatDisplay}</td>
                  <td>
                   
                   
                  
                  <button
                      className={`collect-btn ${
                        isCollected ? "collected" : ""
                      }`}
                      disabled={saving || isCollected}
                      onClick={() =>
                        handleStatusChange(
                          e,
                          "Scanned"
                        )
                      }
                    >
                      {isCollected
                        ? "Collected"
                        : "Collect"}
                    </button>

                  </td>
                  <td>
                    
                  <button
                    className="save-btn"
                    disabled={
                      saving ||
                      !e.isCollected ||
                      e.isReceived
                    }
                    onClick={() => handleSave(e)}
                  >
                    {e.isReceived
                    ? "Received"
                    : "Mark Received"}
                  </button>
                  </td>
                  <td>
                  <button
                    className="given-btn"
                   
                    disabled={
                      saving ||
                      !e.isReceived ||
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