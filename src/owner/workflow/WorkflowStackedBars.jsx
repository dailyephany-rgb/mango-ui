
 import React, { useMemo, useState } from "react";
 import {
   ResponsiveContainer,
   BarChart,
   Bar,
   Cell,
   XAxis,
   YAxis,
   CartesianGrid,
   Tooltip,
   Legend,
 } from "recharts";
 
 import {
   ROUTINE_WORKFLOW_CHART_KEYS,
   ROUTINE_WORKFLOW_COLORS,
   ROUTINE_WORKFLOW_LABELS,
 } from "./workflowfetcher";
 
 const PRINTED_STAGE_KEY =
   ROUTINE_WORKFLOW_CHART_KEYS.find(
     (key) => String(key).toLowerCase() === "printed"
   ) ||
   ROUTINE_WORKFLOW_CHART_KEYS.find((key) =>
     String(key).toLowerCase().includes("print")
   ) ||
   "printed";
 
 
 
 function CustomTooltip({ active, payload }) {
   if (!active || !payload?.length) return null;
 
   const patient = payload[0].payload;
 
   return (
     <div
       style={{
         background: "#fff",
         border: "1px solid #d1d5db",
         borderRadius: 8,
         padding: 10,
       }}
     >
       <div style={{ fontWeight: 700 }}>Reg No: {patient.regNo}</div>
 
       {patient.diagnosticNo && (
         <div style={{ marginBottom: 8 }}>Diag No: {patient.diagnosticNo}</div>
       )}
 
       {patient.workflowTimeline?.map((stage) => (
         <div key={stage.key} style={{ marginBottom: 8 }}>
           <div
             
             style={{
              color: ROUTINE_WORKFLOW_COLORS[stage.key],
              fontWeight: 600,
            }}

           >
             {stage.label}
           </div>
 
           <div>
             {stage.startedAt?.toLocaleTimeString([], {
               hour: "2-digit",
               minute: "2-digit",
             })}
             {" → "}
             {stage.completedAt?.toLocaleTimeString([], {
               hour: "2-digit",
               minute: "2-digit",
             })}
           </div>
 
           <div style={{ marginTop: 4 }}>Stage Duration</div>
           <div>{stage.minutes} min</div>
 
        

         </div>
       ))}
 
       <hr />
 
       <div style={{ fontWeight: 600 }}>
       Total Workflow Time: {patient.totalWorkflowMinutes} min
       </div>
     </div>
   );
 }
 
 function WorkflowChart({ data }) {
   const chartKeys = ROUTINE_WORKFLOW_CHART_KEYS.filter(
     (stage) =>
       stage !== PRINTED_STAGE_KEY ||
       data.some((patient) =>
         Object.prototype.hasOwnProperty.call(patient, PRINTED_STAGE_KEY)
       )
   );
 
   return (
     <ResponsiveContainer width="100%" height="100%">
       <BarChart
         data={data}
         margin={{
           top: 20,
           right: 20,
           left: 10,
           bottom: 90,
         }}
       >
         <CartesianGrid strokeDasharray="3 3" />
 
         
 
         <YAxis
           label={{
             value: "Minutes",
             angle: -90,
             position: "insideLeft",
           }}
         />
 
         <Tooltip content={<CustomTooltip />} />
 
          
         {chartKeys.map((stage) => (
           <Bar
             key={stage}
             dataKey={stage}
             stackId="workflow"
             fill={ROUTINE_WORKFLOW_COLORS[stage]}
             name={ROUTINE_WORKFLOW_LABELS[stage]}
             isAnimationActive={false}
           >
             {data.map((patient) => (
               <Cell
               key={`${patient.diagnosticNo}-${stage}`}
               fill={ROUTINE_WORKFLOW_COLORS[stage]}
             />
             ))}
           </Bar>
         ))}
       </BarChart>
     </ResponsiveContainer>
   );
 }
 
 export default function WorkflowStackedBars({ records = [], height = 480 }) {
   const [search, setSearch] = useState("");
   const [printMode, setPrintMode] = useState("with");
   const [isExpanded, setIsExpanded] = useState(false);
 
   const data = useMemo(() => {
     const searchValue = search.trim().toLowerCase();
     const includePrintTime = printMode === "with";
 
     return records
       .filter((record) => {
         if (!searchValue) return true;
 
         return [record.regNo, record.diagnosticNo].some((value) =>
           String(value ?? "")
             .toLowerCase()
             .includes(searchValue)
         );
       })
       .map((record) => {
         const chartData = { ...record.chartData };
         let workflowTimeline = record.workflowTimeline;
         let totalWorkflowMinutes = record.totalWorkflowMinutes;
 
         if (!includePrintTime) {
           const printedStage = workflowTimeline?.find(
             (stage) => stage.key === PRINTED_STAGE_KEY
           );
 
           const printedMinutes =
             Number(printedStage?.minutes) || Number(chartData[PRINTED_STAGE_KEY]) || 0;
 
           const numericTotal = Number(record.totalWorkflowMinutes);
 
           delete chartData[PRINTED_STAGE_KEY];
 
           workflowTimeline = workflowTimeline?.filter(
             (stage) => stage.key !== PRINTED_STAGE_KEY
           );
 
           totalWorkflowMinutes = Number.isFinite(numericTotal)
             ? Math.max(0, numericTotal - printedMinutes)
             : record.totalWorkflowMinutes;
         }
 
         
 
         return {
           x: record.diagnosticNo,
 
           regNo: record.regNo,
           diagnosticNo: record.diagnosticNo,
 
           // This already contains one value per department
           ...chartData,
 
           workflowTimeline,
           
 
           totalWorkflowMinutes,
         };
       });
      }, [records, search, printMode]);
 
   return (
     <>
       <div
         style={{
           display: "flex",
           gap: 8,
           alignItems: "center",
           marginBottom: 12,
           flexWrap: "wrap",
         }}
       >
         <input
           type="search"
           value={search}
           onChange={(event) => setSearch(event.target.value)}
           placeholder="Search reg no or diagnostic no"
           style={{
             border: "1px solid #d1d5db",
             borderRadius: 6,
             padding: "8px 10px",
             minWidth: 240,
           }}
         />
 
         <select
           value={printMode}
           onChange={(event) => setPrintMode(event.target.value)}
           style={{
             border: "1px solid #d1d5db",
             borderRadius: 6,
             padding: "8px 10px",
           }}
         >
           <option value="with">With Print Time</option>
           <option value="without">Without Print Time</option>
         </select>
 
         
 
         <button
           type="button"
           onClick={() => setIsExpanded(true)}
           style={{
             border: "1px solid #d1d5db",
             borderRadius: 6,
             background: "#fff",
             padding: "8px 12px",
             cursor: "pointer",
           }}
         >
           ↗ Expand
         </button>
       </div>



          
 
         <div style={{ width: "100%", height }}>
            {data.length === 0 ? (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#6b7280",
                  fontSize: 16,
                }}
              >
                No workflows match the selected filters.
              </div>
            ) : (
              <WorkflowChart data={data} />
            )}
          </div>

      
              <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 10,
            marginBottom: 12,
            padding: "0 16px",
            color: "#6b7280",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <span>← Earlier Collections</span>
          <span>Later Collections →</span>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 20,
            flexWrap: "wrap",
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {ROUTINE_WORKFLOW_CHART_KEYS.map((stage) => (
            <div
              key={stage}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  background: ROUTINE_WORKFLOW_COLORS[stage],
                  borderRadius: 2,
                  display: "inline-block",
                }}
              />
              <span>{ROUTINE_WORKFLOW_LABELS[stage]}</span>
            </div>
          ))}
        </div>
 
       {isExpanded && (
         <div
           style={{
             position: "fixed",
             inset: 0,
             zIndex: 9999,
             background: "rgba(0, 0, 0, 0.45)",
             display: "flex",
             alignItems: "center",
             justifyContent: "center",
             padding: 24,
           }}
         >
           <div
             style={{
               position: "relative",
               width: "100%",
               height: "100%",
               background: "#fff",
               borderRadius: 8,
               padding: 16,
             }}
           >
             <button
               type="button"
               onClick={() => setIsExpanded(false)}
               style={{
                 position: "absolute",
                 top: 12,
                 right: 12,
                 border: "1px solid #d1d5db",
                 borderRadius: 6,
                 background: "#fff",
                 padding: "6px 10px",
                 cursor: "pointer",
                 zIndex: 1,
               }}
             >
               ✕
             </button>
 
           
             <div
           style={{
             display: "flex",
             flexDirection: "column",
             width: "100%",
             height: "100%",
             paddingTop: 32,
           }}
         >
           <div style={{ flex: 1 }}>
             <WorkflowChart data={data} />
           </div>
         </div>
 
           </div>
         </div>
       )}
     </>
   );
 }