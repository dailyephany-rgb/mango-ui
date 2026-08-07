
import React, { useState, useEffect, useMemo } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  doc,
  setDoc,
  writeBatch,
  serverTimestamp,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import {
  trackedOnSnapshot as onSnapshot,
  trackedGetDoc as getDoc,
} from "../shared/firestore/trackedFirestore.js";
import { EngComponent } from "../engineering/ui/EngComponent.jsx";

import INSIDE_ROOM_MAP from "../inside_room_routing.json"; 
import "./InsideLab.css";
import {
  parseEntryDate,
  toLocalDateString,
  getLocalDateString,
  localDayStart,
  localDayEndExclusive,
} from "../shared/utils/dates.js";
import { useRegisterFilters } from "../shared/hooks/useRegisterFilters.js";
import { useScopedMasterEntries } from "../shared/hooks/useScopedMasterEntries.js";
import RegisterFilterBar from "../shared/components/RegisterFilterBar.jsx";

export default function InsideLabRegister() {
  const loggedUser =
  sessionStorage.getItem("loggedUser") || "User";

  const logout = () => {
  sessionStorage.clear();
  window.location.href = "/login.html";
  };
  const [labResults, setLabResults] = useState({}); 
  const [localDrafts, setLocalDrafts] = useState({}); 
  const [activeTab, setActiveTab] = useState("PathologyRegister");
  const {
    regSearch,
    setRegSearch,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    sourceFilter: activeSource,
    setSourceFilter: setActiveSource,
  } = useRegisterFilters();

  const { masterEntries: entries } = useScopedMasterEntries({
    masterDeptKey: activeTab,
    dateFrom,
    dateTo,
    mapMasterDoc: (d) => ({
      id: d.id,
      ...d.data(),
      urgent: d.data().urgent || false,
    }),
  });
  
  const [showEdit, setShowEdit] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [results, setResults] = useState([{ testType: "", content: "" }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fromStr = dateFrom || getLocalDateString();
    const toStr = dateTo || getLocalDateString();
    const start = localDayStart(fromStr);
    const endExclusive = localDayEndExclusive(toStr);
    if (!start || !endExclusive) return undefined;

    const labQuery = query(
      collection(db, "inside_lab_results"),
      where("timePrinted", ">=", Timestamp.fromDate(start)),
      where("timePrinted", "<", Timestamp.fromDate(endExclusive)),
      orderBy("timePrinted", "asc")
    );

    const unsubLab = onSnapshot(
      labQuery,
      (snap) => {
        const labData = {};
        snap.docs.forEach((d) => {
          labData[d.id] = d.data();
        });
        setLabResults(labData);
      },
      (err) => {
        console.error(
          "[InsideLab] inside_lab_results timePrinted query failed:",
          err
        );
      }
    );

    return () => unsubLab();
  }, [dateFrom, dateTo]);

  // UPDATE: Generate Department-Specific Composite Key
  
  const getDeptUniqueKey = (entry) => {
    const regNo = String(entry.regNo || entry.id);
    const diagNo = entry.diagnosticNo || entry.accNo || "—";
    return `${regNo}_${diagNo}_${activeTab}`;
  };

  const openEdit = (entry) => {
    setSelectedEntry(entry);
    const uniqueId = getDeptUniqueKey(entry);
    const existingData = localDrafts[uniqueId] || labResults[uniqueId];
    setResults(existingData?.reportData || [{ testType: "", content: "" }]);
    setShowEdit(true);
  };

  const addResultBox = () => {
    setResults([...results, { testType: "", content: "" }]);
  };

  const updateResult = (index, field, value) => {
    const newResults = [...results];
    if (field === "testType") {
      newResults[index].testType = value;
      newResults[index].content = `DIAGNOSTIC PARAMETERS: ${value}:\n\n`;
    } else {
      newResults[index][field] = value;
    }
    setResults(newResults);
  };

  const handleLocalSave = () => {
    if (selectedEntry) {
      const uniqueId = getDeptUniqueKey(selectedEntry);
      const orderedResults = results.map(res => ({
        testType: res.testType,
        content: res.content
      }));

      setLocalDrafts(prev => ({
        ...prev,
        [uniqueId]: { reportData: orderedResults, isDrafted: true }
      }));
    }
    setShowEdit(false);
  };



  const handleFinalize = async (entry) => {
    const uniqueId = getDeptUniqueKey(entry);
  
    const finalData = (
      localDrafts[uniqueId]?.reportData || results
    ).map((res) => ({
      testType: res.testType,
      content: res.content,
    }));
  
    try {
      setSaving(true);
  
      const insideLabRef = doc(
        db,
        "inside_lab_results",
        uniqueId
      );
  
      const reportRef = doc(
        db,
        "report_details",
        entry.id
      );
  
      const reportSnap = await getDoc(reportRef);
  
      const batch = writeBatch(db);

      const department = activeTab;

        const existingInsideLab =
          reportSnap.exists()
            ? reportSnap.data().insideLabReportsSaved || {}
            : {};

        const updatedInsideLab = {
          ...existingInsideLab,
          [department]: true,
        };
  
      // Save Inside Lab report
      batch.set(
        insideLabRef,
        {
          compositeId: uniqueId,
          regNo: entry.regNo || entry.id,
          diagnosticNo:
            entry.diagnosticNo ||
            entry.accNo ||
            "—",
          name: entry.name,
          age: entry.age,
          ageUnit: entry.ageUnit || "",
          gender: entry.gender || entry.sex,
          doctor: entry.doctor,
          source: entry.source || "OPD",
          category: entry.category || "",
          timeCollected:
            entry.timeCollected || null,
          timePrinted:
            entry.timePrinted || null,
          selectedTests: (
            entry.selectedTests || []
          ).map((t) =>
            typeof t === "string"
              ? t
              : t.test
          ),
          department: activeTab,
          reportData: finalData,
          isFinalized: true,
          savedBy: loggedUser,
          isSaved: true,
          timeSaved: serverTimestamp(),
        },
        { merge: true }
      );
  
      batch.set(
        reportRef,
        {
          insideLabReportsSaved: updatedInsideLab,
        },
        { merge: true }
      );
  
      await batch.commit();
  
      setLocalDrafts((prev) => {
        const updated = { ...prev };
        delete updated[uniqueId];
        return updated;
      });
  
      alert(
        `Report saved successfully for ${activeTab.replace(
          "Register",
          ""
        )}`
      );
    } catch (err) {
      console.error(err);
      alert("Failed to save report.");
    } finally {
      setSaving(false);
    }
  };
    

   

  

  const filteredEntries = useMemo(() => {
    return entries
      .filter((e) => {
        const patientTests = (e.selectedTests || []).map(t => 
          (typeof t === "string" ? t : t?.test || "").toUpperCase().trim()
        );
        const matchesTab = patientTests.some(test => 
          INSIDE_ROOM_MAP[activeTab].some(mapped => test === mapped.toUpperCase())
        );
        if (!matchesTab) return false;
        if (activeSource !== "All" && e.source !== activeSource) return false;
        
        if (regSearch.trim()) {
          const searchStr = regSearch.trim().toLowerCase();
          const regKey = String(e.regNo || e.id || "").toLowerCase();
          const diagKey = String(e.diagnosticNo || e.accNo || "").toLowerCase();
          if (!regKey.includes(searchStr) && !diagKey.includes(searchStr)) return false;
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
        if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
        const dateA = parseEntryDate(a, ["timePrinted"]);
        const dateB = parseEntryDate(b, ["timePrinted"]);
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA - dateB;
      });
  }, [entries, activeTab, activeSource, regSearch, dateFrom, dateTo]);

  return (
    <EngComponent name="InsideLab" type="Page" parent={null} moduleId="InsideLab">
    <div className="register-section">
     <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "15px",
  }}
>
  <h3 className="dept-header" style={{ marginBottom: 0 }}>
    🔬 Inside Lab Register
  </h3>

  <details>
    <summary
      style={{
        cursor: "pointer",
        padding: "10px 16px",
        border: "1px solid #ccc",
        borderRadius: "8px",
        background: "#fff",
        listStyle: "none",
        fontWeight: "600",
      }}
    >
      Hi, {loggedUser} ▼
    </summary>

    <div
      style={{
        position: "absolute",
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: "6px",
        marginTop: "4px",
        minWidth: "120px",
        zIndex: 1000,
      }}
    >
      <button
        onClick={logout}
        style={{
          width: "100%",
          padding: "10px",
          border: "none",
          background: "white",
          cursor: "pointer",
        }}
      >
        Logout
      </button>
    </div>
  </details>
</div>
      <RegisterFilterBar
        regSearch={regSearch}
        setRegSearch={setRegSearch}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        sourceFilter={activeSource}
        setSourceFilter={setActiveSource}
        sourceContainerClassName="source-filters"
        useDateLabelSpan
        sourceButtonClassName={(src, active) =>
          `source-btn ${active === src ? "active" : ""}`
        }
      />

      <div className="tab-container">
        {Object.keys(INSIDE_ROOM_MAP).map((tab) => (
          <button key={tab} className={`tab-btn ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
            {tab.replace("Register", "")}
          </button>
        ))}
      </div>

      <div className="table-container">
        <table className="backroom-table">
          <thead>
            <tr>
              <th>Reg No</th>
              <th>Diagnostic No</th>
              <th>Name</th>
              <th>Age/Gender</th>
              <th>Doctor</th>
              <th>Test(s)</th>
              <th>Saved By</th>
              <th>Action</th>
              <th>Finalize</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => {
              const uniqueId = getDeptUniqueKey(e);
              const isSavedInDB = labResults[uniqueId]?.isFinalized;
              const hasLocalChanges = localDrafts[uniqueId]?.isDrafted;

              const filteredTests = (e.selectedTests || [])
                .map(t => typeof t === 'string' ? t : t.test)
                .filter(testName => 
                  INSIDE_ROOM_MAP[activeTab].some(mapped => 
                    testName.toUpperCase() === mapped.toUpperCase()
                  )
                );

              return (
                <tr key={uniqueId} className={isSavedInDB ? "row-green" : hasLocalChanges ? "row-yellow" : ""}>
                  <td style={e.urgent ? { borderLeft: "4px solid red" } : {}}>{e.regNo || e.id}</td>
                  <td>{e.diagnosticNo || e.accNo || "—"}</td>
                  <td>{e.name}</td>
                  <td>{e.age} {e.ageUnit} / {e.gender || e.sex}</td>
                  <td>{e.doctor}</td>
                  <td className="test-list-cell">{filteredTests.join(", ")}</td>
                  
                  <td
                  style={{
                    width: "140px",
                    minWidth: "140px",
                    fontWeight: "600",
                    color: "#1e3a8a",
                  }}
                >
                  {labResults[uniqueId]?.savedBy || "—"}
                </td>

                  <td><button className="edit-btn" onClick={() => openEdit(e)}>Edit</button></td>
                  <td>
                    <button className="save-entry-btn" disabled={saving || isSavedInDB} onClick={() => handleFinalize(e)}>
                      {isSavedInDB ? "Saved" : "Save Entry"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showEdit && (
        <div className="edit-modal-overlay">
          <div className="edit-window full-window">
            <div className="window-header-centered">
              <h2 className="main-report-heading">Report Entry: {selectedEntry?.name}</h2>
              <button className="close-x-corner" onClick={() => setShowEdit(false)}>×</button>
            </div>
            
            <div className="window-body">
              <div className="patient-info-banner">
                <div className="banner-dept-title">
                  {activeTab.replace("Register", "").toUpperCase()} DEPARTMENT
                </div>
                <div className="banner-patient-details">
                  <span><strong>Name:</strong> {selectedEntry?.name}</span>
                  <span><strong>Reg No:</strong> {selectedEntry?.regNo || selectedEntry?.id}</span>
                  <span><strong>Diag No:</strong> {selectedEntry?.diagnosticNo || selectedEntry?.accNo || "—"}</span>
                </div>
                <div className="banner-test-list">
                  <strong>Tests:</strong> {(selectedEntry?.selectedTests || [])
                    .map(t => typeof t === 'string' ? t : t.test)
                    .filter(testName => 
                      INSIDE_ROOM_MAP[activeTab].some(mapped => 
                        testName.toUpperCase() === mapped.toUpperCase()
                      )
                    ).join(", ")}
                </div>
              </div>

              {results.map((res, idx) => (
                <div key={idx} className="result-card">
                  <select className="table-select" value={res.testType} onChange={(e) => updateResult(idx, "testType", e.target.value)}>
                    <option value="">Select Test...</option>
                    {INSIDE_ROOM_MAP[activeTab].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <textarea className="typing-rectangle" value={res.content} onChange={(e) => updateResult(idx, "content", e.target.value)} placeholder="Type results here..." />
                </div>
              ))}
              <div className="add-more-container">
                <button className="add-box-circle" onClick={addResultBox}>+</button>
              </div>
            </div>

            <div className="window-footer-centered">
              <button className="big-green-save-btn" onClick={handleLocalSave}>Save & Return</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </EngComponent>
  );
}