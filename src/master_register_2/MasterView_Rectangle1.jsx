
import React, {
  useEffect,
  useState,
  useMemo,
} from "react";

import { db } from "../firebaseConfig.js";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import "./MasterView_Rectangle.css";
import UserMenu from "../auth/UserMenu";

const ROUTINE_DEPARTMENTS = [
  {
    key: "Bio-Chemistry",
    label: "Biochemistry",
    collection: "biochemistry_register",
  },
  {
    key: "Hormones",
    label: "Hormones",
    collection: "hormones_main",
  },
  {
    key: "Blood Group",
    label: "Blood Group",
    collection: "bloodgroup_testing_register",
  },
  {
    key: "Coagulation",
    label: "Coagulation",
    collection: "coagulation_register",
  },
  {
    key: "Haematology",
    label: "Haematology",
    collection: "haematology_register",
  },
  {
    key: "ESR",
    label: "ESR",
    collection: "esr_register",
  },
  {
    key: "Serology",
    label: "Serology",
    collection: "serology_register",
  },
  {
    key: "Rapid Card",
    label: "Rapid Card",
    collection: "rapid_card_register",
  },
  {
    key: "Urine Analysis",
    label: "Urine Analysis",
    collection: "urine_analysis_register",
  },
];

const SPECIAL_DEPARTMENTS = [
  {
    label: "Inside Lab",
    collection: "inside_lab_results",
    workflow: "inside",
  },
  {
    key: "Outsource",
    label: "Outsource",
    collection: "outsource_tracking",
    workflow: "outsource",
  },
];

export default function MasterViewCard() {

  

  const [masterRecords, setMasterRecords] = useState([]);
  const [reportDetails, setReportDetails] = useState({});
  const [deptData, setDeptData] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [reportView, setReportView] = useState("routine");
  const [searchReg, setSearchReg] = useState("");
  
  // FIX: Set local date to roll over at midnight local time
  const getLocalDate = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const [fromDate, setFromDate] = useState(getLocalDate());
  const [toDate, setToDate] = useState(getLocalDate());
  const [sourceFilter, setSourceFilter] = useState("All");

  // DEPARTMENT COLLECTIONS
  const DEPTS = [

    "inside_lab_results",
    "outsource_tracking",
    "biochemistry_register",
    "bloodgroup_testing_register",
    "coagulation_register",
    "esr_register",
    "haematology_register",
    "hormones_main",
    "rapid_card_register",
    "serology_register",
    "urine_analysis_register",
  ];

  // Helper to normalize dates for sorting
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

  const formatTimestamp = (ts) => {
    if (!ts) return "—";
  
    const date = ts.toDate ? ts.toDate() : new Date(ts);
  
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };



  // MASTER REGISTER LISTENER
  // MASTER REGISTER + REPORT DETAILS LISTENERS
useEffect(() => {


  const q = query(
    collection(db, "master_register"),
    orderBy("timePrinted", "asc")
  );

  const unsub = onSnapshot(q, (snap) => {
    setMasterRecords(
      snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }))
    );
  });

  const reportQuery = query(
    collection(db, "report_details")
  );

  const unsubReport = onSnapshot(

    reportQuery,
    (snapshot) => {
      const details = {};

      snapshot.forEach((docSnap) => {
        details[docSnap.id] = docSnap.data();
      });

      setReportDetails(details);
    }
  );

  return () => {
    unsub();
    unsubReport();
  };

}, []);

  




  // DEPARTMENT LISTENERS
  useEffect(() => {
    const unsubArr = [];

    DEPTS.forEach((dept) => {
      const unsub = onSnapshot(collection(db, dept), (snap) => {
        setDeptData((prev) => ({
          ...prev,
          [dept]: snap.docs.map((d) => d.data()),
        }));
      });
      unsubArr.push(unsub);
    });

    return () => unsubArr.forEach((u) => u());
  }, []);

 
  // Helper
const findIn = (dept, reg) =>
(deptData[dept] || []).find((x) => x.regNo === reg);

const isRoutineDepartmentComplete = (dept) => {
  return (
    dept.scanned === "Yes" &&
    dept.saved === "Yes" &&
    dept.validated === true &&
    dept.entered === true
  );
};

  // Merge department statuses
  const merged = useMemo(() => {    
    return masterRecords.map((rec) => {

      const workflow = reportDetails[rec.id] || {};
    
     
    
      
      const reg = rec.regNo;
      let statuses = [];


      const selectedTests = rec.selectedTests || [];


      const hasDepartment = (name) =>
      selectedTests.some((t) => {
        const dept =
          typeof t === "string"
            ? t
            : (t?.dept || "").trim();
    
        return dept.toLowerCase() === name.toLowerCase();
      });

      ROUTINE_DEPARTMENTS.forEach(({ key, label, collection }) => {
        if (!hasDepartment(key)) return;
      
        const departmentRecord = findIn(collection, reg);
      
        statuses.push({
          dept: label,
      
          tests:
            departmentRecord?.selectedTests ||
            selectedTests
              .filter((t) => {
                const dept =
                  typeof t === "string"
                    ? t
                    : (t?.dept || "").trim();
      
                return dept.toLowerCase() === key.toLowerCase();
              })
              .map((t) =>
                typeof t === "string"
                  ? t
                  : t.test
              ),
      
          scanned: departmentRecord?.scanned || "No",
      
          saved: departmentRecord?.saved || "No",
      
          validated: departmentRecord?.validated || false,
      
          entered: departmentRecord?.entered || false,
        });
      });

    

      SPECIAL_DEPARTMENTS.forEach(({ label, collection, workflow }) => {

        if (workflow === "inside") {
      
          const insideRecord =
            (deptData["inside_lab_results"] || []).find(
              (x) =>
                x.regNo === reg &&
                x.diagnosticNo ===
                  (rec.diagnosticNo || rec.accNo)
            );
      
          if (!insideRecord) return;
      
          statuses.push({
            dept: "Inside Lab",
      
            reportType: "special",
      
            tests: insideRecord.selectedTests || [],
      
            saved: insideRecord.isSaved || false,
      
            savedTime: insideRecord.timeSaved,
          });
      
          return;
        }
      
        // Outsource
        const departmentRecord = findIn(collection, reg);
      
        if (!hasDepartment("Outsource") && !departmentRecord)
          return;
      
        statuses.push({
          dept: label,
      
          reportType: "special",
      
          tests:
            departmentRecord?.selectedTests ||
            selectedTests
              .filter((t) => {
                const dept =
                  typeof t === "string"
                    ? t
                    : (t?.dept || "").trim();
      
                return (
                  dept.toLowerCase() === "outsource"
                );
              })
              .map((t) =>
                typeof t === "string"
                  ? t
                  : t.test
              ),
      
          sampleCollected:
            departmentRecord?.status === "Scanned",
      
          outsourceSampleCollectedTime:
            departmentRecord?.outsourcedCollectedTime,
      
          reportReceived:
            departmentRecord?.isCollected || false,
      
          reportReceivedTime:
            departmentRecord?.reportReceivedTime,
      
          reportGiven:
            departmentRecord?.isGiven || false,
      
          reportGivenTime:
            departmentRecord?.reportDeliveredTime,
        });
      
      });


      // OVERALL
      const routineStatuses = statuses.filter(
        s => !s.reportType);
      const specialStatuses = statuses.filter(
        s => s.reportType === "special");
        
        const routineReadyToPrint =
  routineStatuses.length > 0 &&
  routineStatuses.every(isRoutineDepartmentComplete);
  const insideLabItems = specialStatuses.filter(
    s => s.dept === "Inside Lab"
  );
  
  const outsourceItems = specialStatuses.filter(
    s => s.dept === "Outsource"
  );
  
  const insideLabCompleted =
    insideLabItems.length === 0 ||
    insideLabItems.every(s => s.saved);
  
  const outsourceCompleted =
    outsourceItems.length === 0 ||
    outsourceItems.every(
      s =>
        s.sampleCollected &&
        s.reportReceived &&
        s.reportGiven
    );
  
  const specialCompleted =
    insideLabCompleted &&
    outsourceCompleted;

    const overall = routineReadyToPrint
    ? "Completed"
    : routineStatuses.some(
        (s) =>
          s.scanned === "Yes" ||
          s.saved === "Yes" ||
          s.validated ||
          s.entered
      )
    ? "In Progress"
    : "Pending";

       

        const workflowCards = [];

        if (insideLabItems.length > 0) {
          workflowCards.push({
            workflow: "inside",
            statuses: insideLabItems,
            completed: insideLabCompleted,
          });
        }
        
        if (outsourceItems.length > 0) {
          workflowCards.push({
            workflow: "outsource",
            statuses: outsourceItems,
            completed: outsourceCompleted,
          });
        }
        
        return {
          ...rec,
        
          ...workflow,
        
          deptStatuses: statuses,
        
          routineStatuses,
        
          specialStatuses,
        
          workflowCards,
        
          overallStatus: overall,
        
          routineReadyToPrint,
        
          insideLabCompleted,
        
          outsourceCompleted,
        
          specialCompleted,
        };
        
          


    });
}, [masterRecords, deptData, reportDetails]);


  // FILTER & SORT
  const filtered = merged
    .filter((rec) => {
      if (!rec.regNo) return false;

      // SEARCH LOGIC
      const searchLower = searchReg.toLowerCase();
      const matchesSearch = !searchReg || 
        (rec.regNo?.toLowerCase().includes(searchLower)) || 
        (rec.diagnosticNo?.toLowerCase().includes(searchLower));

      let date = parseDate(rec);
      if (!date) return false;

      // FIX: Comparison using local calendar date strings (YYYY-MM-DD)
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      
      const inRange = dateStr >= fromDate && dateStr <= toDate;

      const sourceOk =sourceFilter === "All" ||
      rec.source === sourceFilter;

      const reportOk =
        reportView === "routine"
          ? rec.routineStatuses.length > 0
          : rec.specialStatuses.length > 0;

        return (
          matchesSearch &&
          inRange &&
          sourceOk &&
          reportOk
        );
          })
          .sort((a, b) => {
            const dateA = parseDate(a);
            const dateB = parseDate(b);
            if (!dateA) return 1;
            if (!dateB) return -1;
            return dateA - dateB; 
          });

          const specialDisplayRows = filtered.flatMap((rec) =>
          rec.workflowCards.map((card) => ({
            ...rec,
            workflow: card.workflow,
            workflowStatuses: card.statuses,
            workflowCompleted: card.completed,
            workflowId: `${rec.id}_${card.workflow}`,
          }))
        );

      const toggle = (id) =>
         setExpanded(expanded === id ? null : id);
  
  

         const handlePrint = async (rec) => {
          try {
            await setDoc(
              doc(db, "report_details", rec.id),
              {
                routineReportPrinted: true,
                routineReportPrintedTime: serverTimestamp(),
                routineReportPrintedBy:
                  sessionStorage.getItem("loggedUser") || "Unknown",
              },
              { merge: true }
            );
          } catch (err) {
            console.error(err);
            alert("Failed to mark report as printed.");
          }
        };

    const handleInsideLabReportPrint = async (rec) => {
      try {
        await setDoc(
          doc(db, "report_details", rec.id),
          {
            insideLabReportPrinted: true,
            insideLabReportPrintedTime: serverTimestamp(),
            insideLabReportPrintedBy:
              sessionStorage.getItem("loggedUser") || "Unknown",
          },
          { merge: true }
        );
      } catch (err) {
        console.error(err);
        alert("Failed to mark Inside Lab report as printed.");
      }
    };
    
    const handleWhatsappRequired = async (rec) => {
      try {
        await setDoc(
          doc(db, "report_details", rec.id),
          {
            whatsappRequired: true,
          },
          { merge: true }
        );
      } catch (err) {
        console.error(err);
        alert("Unable to update WhatsApp status.");
      }
    };

    const handleWhatsappSent = async (rec) => {
      try {
        await setDoc(
          doc(db, "report_details", rec.id),
          {
            whatsappSent: true,
            whatsappSentTime: serverTimestamp(),
            whatsappSentBy:
              sessionStorage.getItem("loggedUser") || "Unknown",
          },
          { merge: true }
        );
      } catch (err) {
        console.error(err);
        alert("Unable to mark WhatsApp as sent.");
      }
    };

  const getColor = (s) =>
    s === "Validated"
      ? "status-blue"
      : s === "Completed"
      ? "status-green"
      : s === "In Progress"
      ? "status-yellow"
      : "status-gray";


  const insideLabRows = specialDisplayRows.filter(
    (r) => r.workflow === "inside"
  );

  const outsourceRows = specialDisplayRows.filter(
    (r) => r.workflow === "outsource"
  );

  const renderCardHeader = (
    showPrint = true,
    showWhatsapp = false
  ) => (
    <div className={`card-header-row ${showPrint ? "" : "no-print"}`}>
      <div>Reg No</div>
      <div>Diagnostic</div>
      <div>Name</div>
      <div>Doctor</div>
      <div>Source</div>
      <div>Phone</div>
      <div>Category</div>
      <div>Status</div>
      {showPrint && <div>Print Report</div>}
      {showWhatsapp && <div>WhatsApp</div>}
    </div>
  );

  const renderCommonCardTop = (rec) => (
    <>
      <div>{rec.regNo}</div>
      <div>{rec.diagnosticNo || "—"}</div>
      <div>{rec.name}</div>
      <div>{rec.doctor}</div>
      <div>{rec.source}</div>
      <div>{rec.phone}</div>
      <div>{rec.category}</div>
    </>
  );

  const renderRoutineDropdown = (rec) => (
    <div className="dropdown-content">
      <table>
        <thead>
          <tr>
            <th>Department</th>
            <th>Tests</th>
            <th>Scanned</th>
            <th>Saved</th>
            <th>Validated</th>
            <th>Entered</th>
          </tr>
        </thead>

        <tbody>
          {rec.routineStatuses.map((d, i) => (
            <tr key={i}>
              <td>{d.dept}</td>

              <td>{Array.isArray(d.tests) ? d.tests.join(", ") : "—"}</td>

              <td>{d.scanned}</td>

              <td>{d.saved}</td>

              <td>{d.validated ? "Yes" : "No"}</td>

              <td>{d.entered ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderSpecialDropdown = (rec) => {
    const isInsideLab = rec.workflow === "inside";

    return (
      <div className="dropdown-content">
        {isInsideLab && (
          <>
            <h4>🏥 Inside Lab</h4>

            <table>
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Saved</th>
                </tr>
              </thead>

              <tbody>
                {rec.workflowStatuses.map((d, i) => (
                  <tr key={i}>
                    <td>{d.dept}</td>
                    <td className={d.saved ? "status-yes" : "status-pending"}>
                      {d.saved ? "Yes" : "No"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {!isInsideLab && (
          <>
            <h4>🚚 Outsource</h4>

            <table>
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Collected</th>
                  <th>Received</th>
                  <th>Delivered</th>
                </tr>
              </thead>

              <tbody>
                {rec.workflowStatuses.map((d, i) => (
                  <tr key={i}>
                    <td>{d.dept}</td>

                    <td
                      className={
                        d.sampleCollected ? "status-yes" : "status-pending"
                      }
                    >
                      {d.sampleCollected ? "Yes" : "No"}
                    </td>

                    <td
                      className={
                        d.reportReceived ? "status-yes" : "status-pending"
                      }
                    >
                      {d.reportReceived ? "Yes" : "No"}
                    </td>

                    <td
                      className={d.reportGiven ? "status-yes" : "status-pending"}
                    >
                      {d.reportGiven ? "Yes" : "No"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    );
  };

  const renderRoutineCard = (rec) => (
    <div key={rec.id} className="master-card">
      <div className="card-top" onClick={() => toggle(rec.id)}>
        {renderCommonCardTop(rec)}

        <div className={`status-tag ${getColor(rec.overallStatus)}`}>
          {rec.overallStatus}
        </div>

        <div>
          <button
            className={rec.routineReportPrinted ? "printed-btn printed" : "printed-btn"}
            disabled={!rec.routineReadyToPrint || rec.routineReportPrinted}
            onClick={(e) => {
              e.stopPropagation();
              handlePrint(rec);
            }}
          >
            {rec.routineReportPrinted ? "Printed" : "Print Report"}
          </button>
        </div>

        <div>
          <button
            className={
              rec.whatsappSent
                ? "whatsapp-btn sent"
                : rec.whatsappRequired
                ? "whatsapp-btn required"
                : "whatsapp-btn"
            }
            onClick={(e) => {
              e.stopPropagation();

              if (!rec.whatsappRequired) {
                handleWhatsappRequired(rec);
              } else if (!rec.whatsappSent) {
                handleWhatsappSent(rec);
              }
            }}
            disabled={rec.whatsappSent}
          >
            {rec.whatsappSent
              ? "WhatsApp Sent"
              : rec.whatsappRequired
              ? "Send WhatsApp"
              : "WhatsApp Required"}
          </button>
        </div>
      </div>

      {expanded === rec.id && renderRoutineDropdown(rec)}
    </div>
  );

  const renderSpecialCard = (rec) => {
    const isInsideLab = rec.workflow === "inside";

    return (
      <div key={rec.workflowId} className="master-card">
       <div
        className={`card-top ${isInsideLab ? "" : "no-print"}`}
        onClick={() => toggle(rec.workflowId)}
      >
          {renderCommonCardTop(rec)}

          <div
            className={
              rec.workflowCompleted
                ? "status-tag status-green"
                : "status-tag status-yellow"
            }
          >
            {rec.workflowCompleted ? "Completed" : "Pending"}
          </div>

          
          
          {isInsideLab ? (
  <div>
    <button
      className={
        rec.insideLabReportPrinted
          ? "printed-btn printed"
          : "printed-btn"
      }
      disabled={!rec.workflowCompleted || 
        rec.insideLabReportPrinted}
        onClick={(e) => {
          e.stopPropagation();
          handleInsideLabReportPrint(rec);
        }}
    >
      {rec.insideLabReportPrinted ? "Printed" : "Print Report"}
    </button>
  </div>
) : null}
                  
        </div>

        {expanded === rec.workflowId && renderSpecialDropdown(rec)}
      </div>
    );
  };

  return (
        <div className="master-container">

      <div className="master-header">
        <h2>🩺 Master Register — Card View</h2>

        <UserMenu />
      </div>

      {/* FILTER BAR */}
      <div className="filter-bar master-filter">
        <input
          placeholder="Search Reg or Diag No..."
          value={searchReg}
          onChange={(e) => setSearchReg(e.target.value)}
        />

        <label>Date:</label>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
        <span>to</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
        />

        <div className="filter-bottom-row">
          <div className="source-buttons">
            {["OPD", "IPD", "Third Floor", "All"].map((s) => (
              <button
                key={s}
                className={sourceFilter === s ? "active" : ""}
                onClick={() => setSourceFilter(s)}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="report-view-tabs">
            <button
              className={reportView === "routine" ? "active" : ""}
              onClick={() => setReportView("routine")}
            >
              Routine Reports
            </button>

            <button
              className={reportView === "special" ? "active" : ""}
              onClick={() => setReportView("special")}
            >
              Special Reports
            </button>
          </div>
        </div>
      </div>

      {reportView === "routine" && (
        <>
          {renderCardHeader(true)}
          {filtered.map(renderRoutineCard)}
        </>
      )}

      {reportView === "special" && (
        <>
         <h3 className="special-section-title">
          Inside Lab
          </h3>
          {renderCardHeader(true, false)}
          {insideLabRows.map(renderSpecialCard)}

          <div className="special-divider" />

          <h3 className="special-section-title">
          Outsource
        </h3>

        {renderCardHeader(false, false)}
          {outsourceRows.map(renderSpecialCard)}
        </>
      )}

      {reportView === "routine" && filtered.length === 0 && (
        <p className="no-records">No records found…</p>
      )}

      {reportView === "special" && specialDisplayRows.length === 0 && (
        <p className="no-records">No records found…</p>
      )}
    </div>
  );
}
