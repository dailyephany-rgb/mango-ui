
import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
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
  <div
    key={stage.key}
    style={{ marginBottom: 8 }}
  >
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

    <div>{stage.minutes} min</div>
  </div>
))}
  

      <hr />

      <div style={{ fontWeight: 600 }}>
        Total Workflow Time:{" "}
        {patient.totalWorkflowMinutes}
       min
      </div>
    </div>
  );
}

export default function WorkflowStackedBars({ records = [], height = 480 }) {
  
  const data = useMemo(() => {
    return records.map((record, index) => ({
      x: record.diagnosticNo,
  
      regNo: record.regNo,
      diagnosticNo: record.diagnosticNo,
  
      // This already contains one value per department
      ...record.chartData,
  
      workflowTimeline: record.workflowTimeline,
  
      totalWorkflowMinutes: record.totalWorkflowMinutes,
    }));
  }, [records]);
      

  return (
    <div style={{ width: "100%", height }}>
      
      <ResponsiveContainer>

  <BarChart
    data={data}
    margin={{
      top:20,
      right:20,
      left:10,
      bottom:60,
    }}
  >

    <CartesianGrid strokeDasharray="3 3" />

    <XAxis
      dataKey="x"
      label={{
        value:"Patients",
        position:"insideBottom",
        offset:-15,
      }}
    />

    <YAxis
      label={{
        value:"Minutes",
        angle:-90,
        position:"insideLeft",
      }}
    />

    <Tooltip content={<CustomTooltip />} />

    <Legend
      verticalAlign="bottom"
      height={36}
    />

    {ROUTINE_WORKFLOW_CHART_KEYS.map((stage) => (
      <Bar
      key={stage}
      dataKey={stage}
      stackId="workflow"
      fill={ROUTINE_WORKFLOW_COLORS[stage]}
      name={ROUTINE_WORKFLOW_LABELS[stage]}
      isAnimationActive={false}
    />
    ))}

  </BarChart>

</ResponsiveContainer>


    </div>
  );
}