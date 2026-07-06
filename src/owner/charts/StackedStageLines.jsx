

// src/owner/charts/StackedStageLines.jsx
import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
  ReferenceLine
} from "recharts";

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload[0]) return null;

  // Pulling both regNo and diagnosticNo from the payload
  const { regNo, diagnosticNo } = payload[0].payload;

  const ordered = [
    payload.find(p => p.dataKey === "printedToCollected"),
    payload.find(p => p.dataKey === "collectedToScanned"),
    payload.find(p => p.dataKey === "scannedToSaved"),
    payload.find(p => p.dataKey === "savedToValidated"),
    payload.find((p) => p.dataKey === "validatedToEntered"),
  ].filter(Boolean);

  return (
    <div
      style={{
        background: "white",
        border: "1px solid #ccc",
        padding: "8px 12px",
        borderRadius: "4px"
      }}
    >
      {/* Updated Header: Shows both Reg No and Diag No */}
      <div style={{ fontWeight: "bold", marginBottom: 2 }}>Reg No: {regNo}</div>
      <div style={{ fontWeight: "bold", marginBottom: 6, color: "#555", fontSize: "0.9em" }}>
        Diag No: {diagnosticNo || "NA"}
      </div>

      {ordered.map((item, index) => (
        <div key={index} style={{ color: item.stroke, fontSize: "0.9em" }}>
          {item.name}: {item.value} min
        </div>
      ))}
    </div>
  );
};

      export default function StackedStageLines({
        unifiedRows,
        stageFilter = "turnaround",
        height = 480,
        slaLimit = null,
      })
    {const data = useMemo(() => {
    if (!unifiedRows || unifiedRows.length === 0) return [];

    const sorted = [...unifiedRows].sort(
      (a, b) => new Date(a.timePrinted) - new Date(b.timePrinted)
    );

    const mapped = sorted.map((p, index) => {
      const tP = p.timePrinted   ? new Date(p.timePrinted).getTime() : null;
      const tC = p.timeCollected ? new Date(p.timeCollected).getTime() : null;
      const tS = p.timeScanned   ? new Date(p.timeScanned).getTime() : null;
      const tSv= p.timeSaved     ? new Date(p.timeSaved).getTime() : null;
      const tV = p.timeValidated ? new Date(p.timeValidated).getTime() : null;
      const tE = p.timeEntered ? new Date(p.timeEntered).getTime()
      : null;

      const pc = tP && tC ? Math.max(0, Math.round((tC - tP) / 60000)) : 0;
      const cs = tC && tS ? Math.max(0, Math.round((tS - tC) / 60000)) : 0;
      const ss = tS && tSv ? Math.max(0, Math.round((tSv - tS) / 60000)) : 0;
      const sv = tSv && tV ? Math.max(0, Math.round((tV - tSv) / 60000)) : 0;
      const ve = tV && tE ? Math.max(0,Math.round((tE - tV) / 60000)
      ): 0;
      const turnaround = cs + ss + sv;
      const completeAnalysis = cs + ss + sv + ve;

      return {
        x: index + 1,
        regNo: p.regNo,
        diagnosticNo: p.diagnosticNo,
      
        printedToCollected: pc,
        collectedToScanned: cs,
        scannedToSaved: ss,
        savedToValidated: sv,
        validatedToEntered: ve,
      
        turnaround,
        completeAnalysis,
      };
    });
   
    return mapped;

  }, [unifiedRows]);
  

  const maxVal = data.reduce((m, d) => {
    let value = 0;
  
    switch (stageFilter) {
      case "printed":
        value = d.printedToCollected;
        break;
  
      case "collected":
        value = d.collectedToScanned;
        break;
  
      case "saved":
        value = d.scannedToSaved;
        break;
  
      case "validated":
        value = d.savedToValidated;
        break;
      case "entered":
          value = d.validatedToEntered;
          break;
  
      case "turnaround":
        value = d.turnaround;
        break;

      case "complete":
          value = d.completeAnalysis;
          break;
  
      default:
        value = d.turnaround;
    }
  
    return Math.max(m, value);
  }, 0);

  const yMax = Math.ceil((maxVal + 5) / 20) * 20;

  return (
    <div style={{ width: "100%",height}}> 
      <ResponsiveContainer>
      <AreaChart data={data} margin={{ top: 10,right: 30,left: 0,
    bottom: 80,}}>
          <CartesianGrid strokeDasharray="3 3" />

          {slaLimit != null && (
            
            <ReferenceLine
            y={slaLimit}
            stroke="#dc2626"
            strokeWidth={2}
            ifOverflow="extendDomain"
            label={{
              value: `SLA (${slaLimit} min)`,
              position: "right",
              fill: "#dc2626",
              fontSize: 12,
            }}
          />

          )}

          <XAxis
            dataKey="x"
            interval="preserveStartEnd"
            minTickGap={40}
            height={60}
            label={{
              value: "Patient Count (sorted by Printed Time)",
              position: "insideBottom",
              offset: -25,
            }}
          />

          <YAxis
            label={{ value: "Minutes", angle: -90, position: "insideLeft" }}
            domain={[0, yMax]}
            ticks={[...Array(Math.floor(yMax / 20) + 1)].map((_, i) => i * 20)}
          />

          <Tooltip content={<CustomTooltip />} />

          <Legend
            verticalAlign="bottom"
            align="center"
            wrapperStyle={{
              paddingTop: 20, 
              bottom: 0
            }}
            payload={[
              { value: "Printed → Collected", type: "square", color: "#4f46e5" },
              { value: "Collected → Scanned", type: "square", color: "#dc2626" },
              { value: "Scanned → Saved",   type: "square", color: "#059669" },
              { value: "Saved → Validated", type: "square", color: "#f59e0b" }
            ]}
          />

        {stageFilter === "printed" && (
          <Area
            type="monotone"
            dataKey="printedToCollected"
            stroke="#4f46e5"
            fill="#c7d2fe"
          />
        )}

        {stageFilter === "collected" && (
          <Area
            type="monotone"
            dataKey="collectedToScanned"
            stroke="#dc2626"
            fill="#fecaca"
          />
        )}

        {stageFilter === "saved" && (
          <Area
            type="monotone"
            dataKey="scannedToSaved"
            stroke="#059669"
            fill="#bbf7d0"
          />
        )}

        {stageFilter === "validated" && (
          <Area
            type="monotone"
            dataKey="savedToValidated"
            stroke="#f59e0b"
            fill="#fef3c7"
          />
        )}
        {stageFilter === "entered" && (
        <Area
            type="monotone"
            dataKey="validatedToEntered"
            stroke="#ec4899"
            fill="#fbcfe8"
          />
        )}

        {stageFilter === "turnaround" && (
          <>
            <Area
              type="monotone"
              dataKey="collectedToScanned"
              stroke="#dc2626"
              fill="#fecaca"
              stackId="1"
            />

            <Area
              type="monotone"
              dataKey="scannedToSaved"
              stroke="#059669"
              fill="#bbf7d0"
              stackId="1"
            />

            <Area
              type="monotone"
              dataKey="savedToValidated"
              stroke="#f59e0b"
              fill="#fef3c7"
              stackId="1"
            />
          </>
        )}

{stageFilter === "complete" && (
  <>
    <Area
      type="monotone"
      dataKey="collectedToScanned"
      stroke="#dc2626"
      fill="#fecaca"
      stackId="1"
    />

    <Area
      type="monotone"
      dataKey="scannedToSaved"
      stroke="#059669"
      fill="#bbf7d0"
      stackId="1"
    />

    <Area
      type="monotone"
      dataKey="savedToValidated"
      stroke="#f59e0b"
      fill="#fef3c7"
      stackId="1"
    />

    <Area
      type="monotone"
      dataKey="validatedToEntered"
      stroke="#ec4899"
      fill="fbcfe8"
      stackId="1"
    />
  </>
)}

                </AreaChart>
              </ResponsiveContainer>
            </div>
          );
}