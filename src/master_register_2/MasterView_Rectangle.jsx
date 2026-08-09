
import React, {
  useEffect,
  useState,
  useMemo,
} from "react";

import { db } from "../firebaseConfig.js";
import {
  collection,
  query,
  where,
  orderBy,
  Timestamp,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { trackedOnSnapshot as onSnapshot } from "../shared/firestore/trackedFirestore.js";
import SafeDateInput from "../shared/components/SafeDateInput.jsx";

import "./MasterView_Rectangle.css";
import UserMenu from "../auth/UserMenu";
import {
  getLocalDateString,
  localDayStart,
  localDayEndExclusive,
  parseDateField,
} from "../shared/utils/dates.js";
import { cascadeRoutineStages } from "../shared/utils/routineStageFlags.js";

const DEPARTMENT_LOOKUP = {
  "Bio-Chemistry": {
    label: "Biochemistry",
    firestoreKey: "Bio-Chemistry",
    collection: "biochemistry_register",
    workflow: "routine",
  },

  Hormones: {
    label: "Hormones",
    firestoreKey: "Hormones",
    collection: "hormones_main",
    workflow: "routine",
  },

  "Blood-Group": {
    label: "Blood Group",
    firestoreKey: "Blood Group",
    collection: "bloodgroup_testing_register",
    workflow: "routine",
  },

  Coagulation: {
    label: "Coagulation",
    firestoreKey: "Coagulation",
    collection: "coagulation_register",
    workflow: "routine",
  },

  Haematology: {
    label: "Haematology",
    firestoreKey: "Haematology",
    collection: "haematology_register",
    workflow: "routine",
  },

  ESR: {
    label: "ESR",
    firestoreKey: "ESR",
    collection: "esr_register",
    workflow: "routine",
  },

  Serology: {
    label: "Serology",
    firestoreKey: "Serology",
    collection: "serology_register",
    workflow: "routine",
  },

  RapidCard: {
    label: "Rapid Card",
    firestoreKey: "Rapid Card",
    collection: "rapid_card_register",
    workflow: "routine",
  },

  "Urine Examination": {
    label: "Urine Analysis",
    firestoreKey: "Urine Analysis",
    collection: "urine_analysis_register",
    workflow: "routine",
  },

  FnacRegister: {
    label: "FNAC",
    collection: "inside_lab_results",
    workflow: "inside",
  },
  
  PathologyRegister: {
    label: "Pathology",
    collection: "inside_lab_results",
    workflow: "inside",
  },
  
  CultureRegister: {
    label: "Culture",
    collection: "inside_lab_results",
    workflow: "inside",
  },
  
  FluidRegister: {
    label: "Fluid",
    collection: "inside_lab_results",
    workflow: "inside",
  },
  
    STERLING: {
      label: "STERLING",
      collection: "outsource_tracking",
      workflow: "outsource",
    },
  
    NEUBERG: {
      label: "NEUBERG",
      collection: "outsource_tracking",
      workflow: "outsource",
    },
  
    LIFECELL: {
      label: "LIFECELL",
      collection: "outsource_tracking",
      workflow: "outsource",
    },
  
    LILAC: {
      label: "LILAC",
      collection: "outsource_tracking",
      workflow: "outsource",
    },
  
    RELIABLE: {
      label: "RELIABLE",
      collection: "outsource_tracking",
      workflow: "outsource",
    },
  };

export default function MasterViewCard() {

  

  const [reportRecords, setReportRecords] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [reportView, setReportView] = useState("routine");
  const [searchReg, setSearchReg] = useState("");

  const today = getLocalDateString();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [sourceFilter, setSourceFilter] = useState("All");

  const parseDate = (entry) => parseDateField(entry?.timePrinted);

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

  // report_details scoped by timePrinted date range
  useEffect(() => {
    const start = localDayStart(fromDate);
    const endExclusive = localDayEndExclusive(toDate);
    if (!start || !endExclusive) {
      setReportRecords([]);
      return undefined;
    }

    const reportQuery = query(
      collection(db, "report_details"),
      where("timePrinted", ">=", Timestamp.fromDate(start)),
      where("timePrinted", "<", Timestamp.fromDate(endExclusive)),
      orderBy("timePrinted", "asc")
    );

    const unsubReport = onSnapshot(
      reportQuery,
      (snapshot) => {
        setReportRecords(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
        );
      },
      (err) => {
        console.error(
          "[MasterView_Rectangle] report_details timePrinted query failed:",
          err
        );
        setReportRecords([]);
      }
    );

    return () => unsubReport();
  }, [fromDate, toDate]);

 
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
    return reportRecords.map((rec) => {
      const workflow = rec;
    
     
    
    
      let statuses = [];


      const selectedTests = workflow.selectedTests || [];

      

     
     
     
      const processedDepartments = new Set();

selectedTests.forEach((t) => {
  const deptKey =
    typeof t === "string"
      ? t
      : (t?.dept || "").trim();

  if (!deptKey || processedDepartments.has(deptKey)) return;

  processedDepartments.add(deptKey);

  const config = DEPARTMENT_LOOKUP[deptKey];

  if (!config || config.workflow !== "routine") return;

  const cascaded = cascadeRoutineStages({
    scanned: rec.routineReportsScanned?.[config.firestoreKey],
    saved: rec.routineReportsSaved?.[config.firestoreKey],
    validated: rec.routineReportsValidated?.[config.firestoreKey],
    entered: rec.routineReportsEntered?.[config.firestoreKey],
  });

  statuses.push({
    dept: config.label,
    tests: selectedTests
      .filter(
        (x) =>
          typeof x !== "string" &&
          (x.dept || "").trim() === deptKey
      )
      .map((x) => x.test),
    scanned: cascaded.scanned,
    saved: cascaded.saved,
    validated: cascaded.validated,
    entered: cascaded.entered,
  });
 
});

const processedSpecialDepartments = new Set();

selectedTests.forEach((t) => {
  if (typeof t === "string") return;

  const deptKey = (t.dept || "").trim();

  if (!deptKey || processedSpecialDepartments.has(deptKey)) return;

  processedSpecialDepartments.add(deptKey);

  // ---------- Inside Lab ----------
  const config = DEPARTMENT_LOOKUP[deptKey];

if (!config) return;

if (config.workflow === "inside") {
   
  statuses.push({
    dept: deptKey,
  
    reportType: "special",
  
    workflow: "inside",
  
    tests: selectedTests
      .filter(
        x =>
          typeof x !== "string" &&
          (x.dept || "").trim() === deptKey
      )
      .map(x => x.test),
  
    saved:
      rec.insideLabReportsSaved?.[deptKey] || false,
  });

return;
  
  
}

 
  // ---------- Outsource Vendors ----------
if (config.workflow !== "outsource") return;

statuses.push({
  dept: config.label,

  reportType: "special",

  workflow: "outsource",

  tests: selectedTests
    .filter(
      x =>
        typeof x !== "string" &&
        (x.dept || "").trim() === deptKey
    )
    .map(x => x.test),

  sampleCollected:
    rec.outsourceReportsCollected?.[deptKey] || false,

  reportReceived:
    rec.outsourceReportsReceived?.[deptKey] || false,

  reportGiven:
    rec.outsourceReportsDelivered?.[deptKey] || false,
});
});

      // OVERALL
      const routineStatuses = statuses.filter(
        s => !s.reportType);
      const specialStatuses = statuses.filter(
        s => s.reportType === "special");
        
  const routineCompleted = !!rec.routineCompleted;


  const insideLabItems = specialStatuses.filter(
    s => s.workflow === "inside"
);
  
  const outsourceItems = specialStatuses.filter(
    s => s.workflow === "outsource"
  );
  
  const insideLabCompleted = !!rec.insideLabCompleted;

const outsourceCompleted = !!rec.outsourceCompleted;

const calculatedInsideLabCompleted =
  insideLabItems.length > 0 &&
  insideLabItems.every((s) => s.saved);

const calculatedOutsourceCompleted =
  outsourceItems.length > 0 &&
  outsourceItems.every(
    (s) =>
      s.sampleCollected &&
      s.reportReceived &&
      s.reportGiven
  );

const specialCompleted =
  calculatedInsideLabCompleted &&
  calculatedOutsourceCompleted;

 

    const overall = routineCompleted
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
            completed: calculatedInsideLabCompleted,
        });
        }
        
        if (outsourceItems.length > 0) {
          workflowCards.push({
            workflow: "outsource",
            statuses: outsourceItems,
            completed: calculatedOutsourceCompleted,
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
        
          routineCompleted,

        insideLabCompleted,

        outsourceCompleted,

        calculatedInsideLabCompleted,

        calculatedOutsourceCompleted,

        specialCompleted,

        };
        
          


    });
  }, [reportRecords]);



  useEffect(() => {
    const syncWorkflowCompletion = async () => {
      for (const rec of merged) {
        const calculatedRoutineCompleted =
          rec.routineStatuses.length > 0 &&
          rec.routineStatuses.every(isRoutineDepartmentComplete);
  
          const insideLabCards = rec.workflowCards.filter(
            (w) => w.workflow === "inside"
          );
          
          const calculatedInsideLabCompleted =
            rec.calculatedInsideLabCompleted;
          
          const outsourceCards = rec.workflowCards.filter(
            (w) => w.workflow === "outsource"
          );
          
          const calculatedOutsourceCompleted =
            rec.calculatedOutsourceCompleted;
  
        const updateData = {};
  
        // Only write completion fields when complete.
        if (
          calculatedRoutineCompleted &&
          !rec.routineCompleted
        ) {
          updateData.routineCompleted = true;
        }
  
        if (
          insideLabCards.length > 0 &&
          calculatedInsideLabCompleted &&
          !rec.insideLabCompleted
        ) {
          updateData.insideLabCompleted = true;
        }
  
        if (
          outsourceCards.length > 0 &&
          calculatedOutsourceCompleted &&
          !rec.outsourceCompleted
        ) {
          updateData.outsourceCompleted = true;
        }
  
        if (Object.keys(updateData).length > 0) {
          await setDoc(
            doc(db, "report_details", rec.id),
            updateData,
            { merge: true }
          );
        }
      }
    };
  
    syncWorkflowCompletion();
  }, [merged]);

    



  // FILTER & SORT (date applied in Firestore via timePrinted)
  const filtered = merged
    .filter((rec) => {
      if (!rec.regNo) return false;

      const searchLower = searchReg.toLowerCase();
      const matchesSearch = !searchReg || 
        (rec.regNo?.toLowerCase().includes(searchLower)) || 
        (rec.diagnosticNo?.toLowerCase().includes(searchLower));

      const sourceOk =sourceFilter === "All" ||
      rec.source === sourceFilter;

      const reportOk =
        reportView === "routine"
          ? rec.routineStatuses.length > 0
          : rec.specialStatuses.length > 0;

        return (
          matchesSearch &&
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
    showWhatsapp = false,
    printByLabel = "",
    extraClass = ""
  ) => (


    <div
  className={`card-header-row ${
    extraClass || (showPrint ? "" : "no-print")
  }`}
>
      <div>Reg No</div>
      <div>Diagnostic</div>
      <div>Name</div>
      <div>Doctor</div>
      <div>Source</div>
      <div>Phone</div>
      <div>Category</div>
      <div>Status</div>
  
      {showWhatsapp && <div>Receipt Saved By</div>}

      {showPrint && <div>Print</div>}

      {printByLabel && <div>{printByLabel}</div>}

      {showWhatsapp && <div>WhatsApp</div>}

      {showWhatsapp && <div>WhatsApp Sent By</div>}
        
      <div>Expand</div>
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
       <div
          className="card-top"
          onClick={() => toggle(rec.id)}
        >
        {renderCommonCardTop(rec)}

        <div className={`status-tag ${getColor(rec.overallStatus)}`}>
          {rec.overallStatus}
        </div>

        <div>
        {rec.receiptSavedBy || "—"}
      </div>

        <div>
          <button
            className={rec.routineReportPrinted ? "printed-btn printed" : "printed-btn"}
            disabled={
              !rec.routineCompleted ||
              rec.routineReportPrinted
            }

            onClick={(e) => {
              e.stopPropagation();
              handlePrint(rec);
            }}
          >
            {rec.routineReportPrinted ? "Printed" : "Print Report"}
          </button>
        </div>

       <div>
        {rec.routineReportPrintedBy || "—"}
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

         <div>
        {rec.whatsappSentBy || "—"}
      </div>

              <div>
               <button
              className="expand-btn"
              onClick={(e) => {
                e.stopPropagation();
                toggle(rec.id);
              }}
            >
          {expanded === rec.id ? "▲" : "▼"}
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
            className={`card-top ${
              isInsideLab ? "inside-lab" : "no-print"
            }`}
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


{isInsideLab && (
  <div>
    {rec.insideLabReportPrintedBy || "—"}
  </div>
)}

<div>
<button
  className="expand-btn"
  onClick={(e) => {
    e.stopPropagation();
    toggle(rec.workflowId);
  }}
>
    {expanded === rec.workflowId ? "▲" : "▼"}
  </button>
</div>

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
        <SafeDateInput
          aria-label="Date from"
          value={fromDate}
          onChange={(v) => v && setFromDate(v)}
        />
        <span>to</span>
        <SafeDateInput
          aria-label="Date to"
          value={toDate}
          onChange={(v) => v && setToDate(v)}
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
          <div className="card-scroll">
           {renderCardHeader(true, true, "Printed By")}
            {filtered.map(renderRoutineCard)}
          </div>
        )}


      {reportView === "special" && (
        <>
         <h3 className="special-section-title">
          Inside Lab
          </h3>
         <div className="card-scroll">
         {renderCardHeader(true, false,"Inside Lab Printed By","inside-lab")}
          {insideLabRows.map(renderSpecialCard)}
        </div>

          <div className="special-divider" />

          <h3 className="special-section-title">
          Outsource
        </h3>

         <div className="card-scroll">
          {renderCardHeader(false, false)}
          {outsourceRows.map(renderSpecialCard)}
        </div>
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
