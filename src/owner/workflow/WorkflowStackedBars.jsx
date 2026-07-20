
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
 
 const SLA_VIOLATION_COLOR = "#dc2626";
 
 
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
               color:
                 stage.key !== PRINTED_STAGE_KEY && stage.slaViolated
                   ? SLA_VIOLATION_COLOR
                   : ROUTINE_WORKFLOW_COLORS[stage.key],
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
 
           {stage.key !== PRINTED_STAGE_KEY && stage.slaLimit != null && (
             <>
               <div style={{ marginTop: 4 }}>Elapsed From Collection</div>
               <div>{stage.elapsedFromCollection} min</div>
               <div style={{ marginTop: 4 }}>SLA Target</div>
               <div>{stage.slaLimit} min</div>
               <div style={{ marginTop: 4 }}>
                 {stage.slaViolated ? "❌ SLA Violated" : "✅ Within SLA"}
               </div>
               {stage.slaViolated && (
                 <div>{stage.slaOverrunMinutes} minutes over SLA</div>
               )}
             </>
           )}
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
           bottom: 60,
         }}
       >
         <CartesianGrid strokeDasharray="3 3" />
 
         <XAxis
           dataKey="x"
           label={{
             value: "Patients",
             position: "insideBottom",
             offset: -15,
           }}
         />
 
         <YAxis
           label={{
             value: "Minutes",
             angle: -90,
             position: "insideLeft",
           }}
         />
 
         <Tooltip content={<CustomTooltip />} />
 
         <Legend verticalAlign="bottom" height={36} />
 
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
                 fill={
                   stage !== PRINTED_STAGE_KEY && patient.slaLookup?.[stage]
                     ? SLA_VIOLATION_COLOR
                     : ROUTINE_WORKFLOW_COLORS[stage]
                 }
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
 
         const slaLookup = (workflowTimeline || []).reduce((lookup, stage) => {
           if (stage.key !== PRINTED_STAGE_KEY) {
             lookup[stage.key] = Boolean(stage.slaViolated);
           }
 
           return lookup;
         }, {});
 
         return {
           x: record.diagnosticNo,
 
           regNo: record.regNo,
           diagnosticNo: record.diagnosticNo,
 
           // This already contains one value per department
           ...chartData,
 
           workflowTimeline,
           slaLookup,
 
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


       <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          fontSize: 13,
          color: "#4b5563",
        }}
      >
        <span
          style={{
            width: 12,
            height: 12,
            background: SLA_VIOLATION_COLOR,
            borderRadius: 2,
            display: "inline-block",
          }}
        />
        <span>Red segment = Department exceeded SLA</span>
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