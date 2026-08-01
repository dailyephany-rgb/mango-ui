
import React, {useMemo,useState} from "react";

import EmergencyBadge
from "../components/EmergencyBadge";

import MetricCard
from "../components/MetricCard";

import DateRangeFilter
from "../components/DateRangeFilter";

import {
  isQCFailure
} from "../utils/qcUtils";


const QCMonitorTab = ({
  qcLogs,
  calibrationLogs,
  fromDate,
  toDate,
  setFromDate,
  setToDate,
}) => {


  const [machineFilter, setMachineFilter] =
    useState("All");
  
  const [eventTypeFilter, setEventTypeFilter] =
    useState("All");

  const [expandedRow, setExpandedRow] =
    useState(null);
  

  const rows = useMemo(() => {

    const qcRows = qcLogs.map(log => ({

      id: log.id,
    
      type: "Control",
    
      machine:
        log.machine ||
        "Unknown",
    
      department:
        log.department ||
        "-",
    
      levelsUsed:
        log.levelsUsed ||
        "-",
    
      performedBy:
        log.performedBy ||
        "-",
    
      batchNo:
        log.batchNo ||
        log.lotNumber ||
        "-",
    
      expiryDate:
        log.expiryDate ||
        "-",
    
      result:
        log.result ||
        "Completed",
    
      remarks:
        log.remarks ||
        "-",
    
      rawLog: log,
    
      timestamp:
        log.timestamp
    
    }));

    const calibrationRows =
  calibrationLogs.map(log => ({

    id: log.id,

    type: "Calibration",

    machine:
      log.machineName ||
      log.machine ||
      "Unknown",

    department:
      log.department ||
      "-",

      levelsUsed: "",

    performedBy:
      log.performedBy ||
      "-",

      batchNo:
      log.batchNo ||
      "-",
    
    expiryDate:
      log.expiryDate ||
      "-",
    
    result:
      log.result ||
      log.status ||
      "-",

    remarks:
      log.remarks ||
      "-",

    rawLog: log,

    timestamp:
      log.timestamp

  }));

    let merged = [
      ...qcRows,
      ...calibrationRows
    ];

    if (machineFilter !== "All") {

      merged = merged.filter(row =>
        row.machine === machineFilter
      );
    
    }

    if (eventTypeFilter !== "All") {

      merged = merged.filter(row =>
        row.type === eventTypeFilter
      );
    
    }

    

    if (fromDate) {

      const from =
        new Date(fromDate);

      merged = merged.filter(row => {

        if (!row.timestamp) {
          return false;
        }

        const rowDate =
          row.timestamp.toDate();

        return rowDate >= from;

      });

    }

    if (toDate) {

      const to =
        new Date(toDate);

      to.setHours(23, 59, 59);

      merged = merged.filter(row => {

        if (!row.timestamp) {
          return false;
        }

        const rowDate =
          row.timestamp.toDate();

        return rowDate <= to;

      });

    }

    return merged.sort((a, b) => {

      if (!a.timestamp || !b.timestamp) {
        return 0;
      }

      return (
        b.timestamp.toDate() -
        a.timestamp.toDate()
      );

    });

  }, [
  
    qcLogs,
    calibrationLogs,
    machineFilter,
    eventTypeFilter,
    fromDate,
    toDate
  ]);

  const groupedRows = useMemo(() => {

    const groups = {};
  
    rows.forEach(row => {
  
      const machine =
        row.machine || "Unknown";
  
      if (!groups[machine]) {
        groups[machine] = [];
      }
  
      groups[machine].push(row);
  
    });
  
    return groups;
  
  }, [rows]);

  return (

    <div className="command-tab-container">

      {/* FILTERS */}

      <div className="command-filter-bar">

        <h2>
          QC & Calibration Monitor
        </h2>

            <DateRangeFilter
            fromDate={fromDate}
            toDate={toDate}
            setFromDate={setFromDate}
            setToDate={setToDate}
          />

          <select
            value={machineFilter}
            onChange={(e) =>
              setMachineFilter(e.target.value)
            }
          >
            <option value="All">
              All Machines
            </option>

            <option value="VITROS 6500">
              VITROS 6500
            </option>

            <option value="ACCESS 2">
              ACCESS 2
            </option>

            <option value="YUMIZEN C-150">
              YUMIZEN C-150
            </option>

            <option value="FIVE PART MACHINE">
              FIVE PART MACHINE
            </option>

            <option value="THREE PART MACHINE">
              THREE PART MACHINE
            </option>

            <option value="YUMIZEN G-800">
              YUMIZEN G-800
            </option>

            <option value="Urine Analyzer">
              Urine Analyzer
            </option>
          </select>

          <select
            value={eventTypeFilter}
            onChange={(e) =>
              setEventTypeFilter(e.target.value)
            }
          >
            <option value="All">
              All Types
            </option>

          <option value="Control">
            Control
          </option>

          <option value="Calibration">
            Calibration
          </option>
        </select>

              </div>

      {/* METRICS */}

      <div className="metric-cards-grid">

  <MetricCard
    label="Total Logs"
    value={rows.length}
  />

  <MetricCard
    label="QC Entries"
    value={
      rows.filter(
        row => row.type === "Control"
      ).length
    }
  />

  <MetricCard
    label="Calibration Entries"
    value={
      rows.filter(
        row =>
          row.type ===
          "Calibration"
      ).length
    }
  />

</div>


      {/* TABLE */}

     
      {Object.entries(groupedRows).map(
  ([machine, machineRows]) => (

    <div
      key={machine}
      className="inventory-section-block"
      style={{
        marginTop: "30px"
      }}
    >

      <h3
        style={{
          marginBottom: "15px",
          color: "var(--neon-blue)"
        }}
      >
        {machine}
      </h3>

      <div className="inventory-command-table">

        <table>

          <thead>

            <tr>

              <th>Date</th>

              <th>Level</th>

              <th>Performed By</th>

              <th>Batch No</th>

              <th>Expiry</th>

              <th>Result</th>

              <th>Details</th>

                </tr>

              </thead>

              <tbody>

              {machineRows.map(row => (

            <React.Fragment key={row.id}>

      <tr>

        <td>
          {
            row.timestamp
              ?.toDate()
              ?.toLocaleString()
          }
        </td>

        <td>
          {row.levelsUsed}
        </td>

        <td>
          {row.performedBy}
        </td>

        <td>
          {row.batchNo}
        </td>

        <td>
          {row.expiryDate}
        </td>

        <td>

          <EmergencyBadge
            isEmergency={
              isQCFailure(row.result)
            }
            emergencyText={row.result}
            safeText={row.result}
          />

        </td>

                <td>

                <button
              className="btn-mini"
              style={{
                minWidth: "90px",
                fontWeight: "600",
                background:
                  expandedRow === row.id
                    ? "#7f1d1d"
                    : "#0f3460",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer"
              }}
              onClick={() =>
                setExpandedRow(
                  expandedRow === row.id
                    ? null
                    : row.id
                )
              }
            >
              {expandedRow === row.id
                ? "▲ Hide"
                : "▼ View"}
            </button>




        </td>

      </tr>

      {expandedRow === row.id && (

        <tr>

          <td
            colSpan="7"
            style={{
              padding: "20px",
              background:
                "rgba(255,255,255,0.03)"
            }}
          >

                    {/* DETAILS GO HERE */}

                    <div
      style={{
        width: "100%",
        overflowX: "auto",
        marginBottom: "20px"
      }}
    >

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse"
        }}
      >

        <tbody>

          <tr>

            <td
              style={{
                border: "1px solid rgba(255,255,255,0.15)",
                padding: "10px"
              }}
            >
              <strong>Machine:</strong> {row.machine}
            </td>



            <td
              style={{
                border: "1px solid rgba(255,255,255,0.15)",
                padding: "10px"
              }}
            >
              <strong>Performed By:</strong> {row.performedBy}
            </td>

          </tr>

          {row.type === "Calibration" && (

    <tr>

      <td
        style={{
          border: "1px solid rgba(255,255,255,0.15)",
          padding: "10px"
        }}
      >
        <strong>Batch No:</strong>{" "}
        {row.batchNo}
      </td>

      <td
        style={{
          border: "1px solid rgba(255,255,255,0.15)",
          padding: "10px"
        }}
      >
        <strong>Department:</strong>{" "}
        {row.department}
      </td>

    </tr>

    )}
      
      <tr>

        <td
          style={{
            border: "1px solid rgba(255,255,255,0.15)",
            padding: "10px"
          }}
        >
          <strong>Expiry Date:</strong> {row.expiryDate}
        </td>

        <td
          style={{
            border: "1px solid rgba(255,255,255,0.15)",
            padding: "10px"
          }}
        >
          <strong>Result:</strong> {row.result}
        </td>

                </tr>

                {row.type === "Calibration" && (

      <tr>

        <td
          style={{
            border: "1px solid rgba(255,255,255,0.15)",
            padding: "10px"
          }}
        >
          <strong>Parameters Calibrated:</strong>{" "}
          {row.rawLog?.parametersCalibrated || "-"}
        </td>

                <td
                  style={{
                    border: "1px solid rgba(255,255,255,0.15)",
                    padding: "10px"
                  }}
                >
                  <strong>Reason:</strong>{" "}
                  {row.rawLog?.reason || "-"}
                </td>

              </tr>
              )}


{row.type === "Calibration" && (

<>

<tr>

  <td
    style={{
      border: "1px solid rgba(255,255,255,0.15)",
      padding: "10px"
    }}
  >
    <strong>Root Cause:</strong>{" "}
    {row.rawLog?.rootCause || "-"}
  </td>

  <td
    style={{
      border: "1px solid rgba(255,255,255,0.15)",
      padding: "10px"
    }}
  >
    <strong>Corrective Action:</strong>{" "}
    {row.rawLog?.correctiveAction || "-"}
  </td>

</tr>

<tr>

  <td
    style={{
      border: "1px solid rgba(255,255,255,0.15)",
      padding: "10px"
    }}
  >
    <strong>Preventative Action:</strong>{" "}
    {row.rawLog?.preventativeAction || "-"}
  </td>

  <td
    style={{
      border: "1px solid rgba(255,255,255,0.15)",
      padding: "10px"
    }}
  >
  </td>

</tr>

</>

)}


                
      





          
     {row.machine === "Urine Analyzer" ? (
              <>


          <tr>

          <td
            style={{
              border: "1px solid rgba(255,255,255,0.15)",
              padding: "10px"
            }}
          >
            <strong>Ketone:</strong>{" "}
            {row.rawLog?.ketone || "-"}
          </td>

          <td
            style={{
              border: "1px solid rgba(255,255,255,0.15)",
              padding: "10px"
            }}
          >
            <strong>Glucose:</strong>{" "}
            {row.rawLog?.glucose || "-"}
          </td>

          </tr>

          <tr>

          <td
            style={{
              border: "1px solid rgba(255,255,255,0.15)",
              padding: "10px"
            }}
          >
            <strong>Protein:</strong>{" "}
            {row.rawLog?.protein || "-"}
          </td>

          <td
            style={{
              border: "1px solid rgba(255,255,255,0.15)",
              padding: "10px"
            }}
          >
            <strong>pH:</strong>{" "}
            {row.rawLog?.ph || "-"}
          </td>

          </tr>

          <tr>

          <td
            style={{
              border: "1px solid rgba(255,255,255,0.15)",
              padding: "10px"
            }}
          >
            <strong>Specific Gravity:</strong>{" "}
            {row.rawLog?.specificGravity || "-"}
          </td>

          <td
            style={{
              border: "1px solid rgba(255,255,255,0.15)",
              padding: "10px"
            }}
          >
            <strong>Remarks:</strong>{" "}
            {row.rawLog?.remarks || "-"}
          </td>

          </tr>

          </>
          ) : (
            <>
            </>
            )}
            {row.type === "Control" && (
            <>

                <tr>

          <td
            style={{
              border: "1px solid rgba(255,255,255,0.15)",
              padding: "10px"
            }}
          >
            <strong>Reason:</strong>{" "}
            {row.rawLog?.reason || "-"}
          </td>

          <td
            style={{
              border: "1px solid rgba(255,255,255,0.15)",
              padding: "10px"
            }}
          >
            <strong>Root Cause:</strong>{" "}
            {row.rawLog?.rootCause || "-"}
          </td>

          </tr>

          <tr>

          <td
            style={{
              border: "1px solid rgba(255,255,255,0.15)",
              padding: "10px"
            }}
          >
            <strong>Corrective Action:</strong>{" "}
            {row.rawLog?.correctiveAction || "-"}
          </td>

          <td
            style={{
              border: "1px solid rgba(255,255,255,0.15)",
              padding: "10px"
            }}
          >
            <strong>Preventative Action:</strong>{" "}
            {row.rawLog?.preventativeAction || "-"}
          </td>

          </tr>

          {row.type === "Control" && (
          <tr>

        <td
          style={{
            border: "1px solid rgba(255,255,255,0.15)",
            padding: "10px",
            verticalAlign: "top"
          }}
        >
          <strong>Baseline Value:</strong>

          <div
            style={{
              marginTop: "5px",
              whiteSpace: "pre-wrap"
            }}
          >
            {row.rawLog?.baseLineValue || "-"}
          </div>
        </td>

        <td
          style={{
            border: "1px solid rgba(255,255,255,0.15)",
            padding: "10px",
            verticalAlign: "top"
          }}
        >
          <strong>Actual Output:</strong>

          <div
            style={{
              marginTop: "5px",
              whiteSpace: "pre-wrap"
            }}
          >
            {row.rawLog?.actualOutput || "-"}
          </div>
        </td>

        </tr>

        )}
        </>
        )}

    </tbody>

  </table>

</div>

{row.rawLog?.controlsUsed?.length > 0 && (

<div
style={{
  marginTop: "20px",
  width: "100%"
}}
>

<h4>
  Controls Used
</h4>

<div
  style={{
    width: "100%",
    overflowX: "auto"
  }}
>

  <table
    style={{
      width: "100%",
      marginTop: "10px"
    }}
  >

    <thead>
      <tr>
        <th>Control Name</th>
        <th>Lot Number</th>
        <th>Expiry</th>
        <th>Qty Used</th>
      </tr>
    </thead>

    <tbody>

      {row.rawLog.controlsUsed.map(
        (ctrl, index) => (

          <tr key={index}>
            <td>{ctrl.controlName}</td>
            <td>{ctrl.lotNumber}</td>
            <td>{ctrl.expiryDate}</td>
            <td>{ctrl.quantityUsed}</td>
          </tr>

        )
      )}

    </tbody>

  </table>        
  </div>

</div>

)}




{row.rawLog?.calibratorsUsed?.length > 0 && (

<div
  style={{
    marginTop: "20px",
    width: "100%"
  }}
>

  <h4>
    Calibrators Used
  </h4>

  <div
    style={{
      width: "100%",
      overflowX: "auto"
    }}
  >

    <table
      style={{
        width: "100%",
        marginTop: "10px"
      }}
    >

      <thead>
        <tr>
          <th>Calibrator Name</th>
          <th>Lot Number</th>
          <th>Expiry</th>
          <th>Qty Used</th>
        </tr>
      </thead>

      <tbody>

        {row.rawLog.calibratorsUsed.map(
          (cal, index) => (

            <tr key={index}>
              <td>{cal.calibratorName}</td>
              <td>{cal.lotNumber}</td>
              <td>{cal.expiryDate}</td>
              <td>{cal.quantityUsed}</td>
            </tr>

          )
        )} 

      </tbody>

    </table>

  </div>

</div>

)}


</td>

</tr>

)}

</React.Fragment>
))}

</tbody>

</table>

</div>

</div>

))}


</div>

  );

};

export default QCMonitorTab;