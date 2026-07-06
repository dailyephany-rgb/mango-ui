
// src/owner/charts/StackedStageLines.jsx
import React, { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

/**
 * Enhanced Duration Formatter
 * Converts minutes into Day/Hr/Min format based on duration.
 */
const formatDuration = (totalMinutes) => {
  if (!totalMinutes || totalMinutes <= 0) return "0m";
  const days = Math.floor(totalMinutes / 1440);
  const remainingMinutes = totalMinutes % 1440;
  const hours = Math.floor(remainingMinutes / 60);
  const mins = remainingMinutes % 60;

  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

const CustomTooltip = ({
  active,
  payload
}) => {
  if (
    !active ||
    !payload ||
    !payload.length
  ) {
    return null;
  }

  const {
    regNo,
    diagnosticNo
  } = payload[0].payload;

  const totalTurnaround =
    payload.find(
      p =>
        p.dataKey ===
        "turnaround"
    )?.value ?? 0;

  return (
    <div
  style={{
    background: "rgba(255,255,255,0.98)",
    border: "1px solid #ccc",
    padding: "10px 14px",
    borderRadius: "6px",
    boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
    }}
    >
    <div
  style={{
    fontWeight: "bold",
    marginBottom: 6,
    color: "#333"
  }}
>
  {regNo} / {diagnosticNo}
  </div>

      {payload.map((item, index) => (
        <div
          key={index}
          style={{
            color: item.stroke,
            fontSize: "13px",
            margin: "2px 0"
          }}
        >
          <span
            style={{
              fontWeight: "500"
            }}
          >
            {item.name}:
          </span>{" "}
          {formatDuration(item.value)}
        </div>
      ))}

      <div
        style={{
          marginTop: 6,
          borderTop: "1px solid #ddd",
          paddingTop: 6,
          fontWeight: "bold",
          color: "#000"
        }}
      >
        Total Turnaround:{" "}
        {formatDuration(
          totalTurnaround
        )}
      </div>
    </div>
  );
};
    
      
      
export default function StackedStageLines({
  unifiedRows,
  stage = "turnaround",
  searchTerm = ""
}) {

  const data = useMemo(() => {
    if (!unifiedRows || unifiedRows.length === 0) return [];
    return [...unifiedRows]
  .filter(p => p.timeCollected)
  .filter((p) => {
    if (!searchTerm.trim()) return true;

    const search = searchTerm.toLowerCase();

    return (
      String(p.regNo || "")
        .toLowerCase()
        .includes(search) ||
      String(p.diagnosticNo || "")
        .toLowerCase()
        .includes(search)
    );
  })
  .sort((a, b) =>
    new Date(a.timeCollected) -
    new Date(b.timeCollected)
  )
      .map((p, index) => {
       
        const tC = p.timeCollected
  ? new Date(p.timeCollected).getTime()
  : null;

const tOC = p.timeScanned
  ? new Date(p.timeScanned).getTime()
  : null;

const tRR = p.timeSaved
  ? new Date(p.timeSaved).getTime()
  : null;

const tRD = p.timeGiven
  ? new Date(p.timeGiven).getTime()
  : null;

const collectedToOutsourced =
  tC && tOC
    ? Math.max(
        0,
        Math.round((tOC - tC) / 60000)
      )
    : 0;

      const outsourcedToReceived =
        tOC && tRR
          ? Math.max(
              0,
              Math.round((tRR - tOC) / 60000)
            )
          : 0;

        const receivedToDelivered =
          tRR && tRD
            ? Math.max(
                0,
                Math.round((tRD - tRR) / 60000)
              )
            : 0;

        const turnaround =
          collectedToOutsourced +
          outsourcedToReceived +
          receivedToDelivered;

          return {
            x: index + 1,
            regNo: p.regNo,
            diagnosticNo: p.diagnosticNo || "NA",
          
            collectedToOutsourced,
            outsourcedToReceived,
            receivedToDelivered,
            turnaround
          };
      });
    }, [unifiedRows, searchTerm]);

  const maxVal = data.reduce( (m, d) => Math.max(m,d.turnaround),0);
  const yMax = maxVal > 0 ? Math.ceil(maxVal * 1.1) : 100;

  return (
    <div style={{ width: "100%", height: 500 }}> 
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}> 
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
          <XAxis 
            dataKey="x" 
            label={{ value: "Patient Sequence", position: "insideBottom", offset: -15 }} 
          />
          <YAxis 
            width={65} 
            tickFormatter={formatDuration} 
            domain={[0, yMax]} 
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            verticalAlign="bottom" 
            align="center" 
            wrapperStyle={{ paddingTop: 30 }}
          />

          {/* Collected → Outsourced Collected */}
            {(stage === "turnaround" ||
              stage === "collected") && (
              <Area
                type="monotone"
                name="Collected → Outsourced Collected"
                dataKey="collectedToOutsourced"
                stackId={
                  stage === "turnaround"
                    ? "1"
                    : undefined
                }
                stroke="#2563eb"
                fill="#bfdbfe"
                strokeWidth={2}
              />
            )}

          {/* Outsourced Collected → Report Received */}
          {(stage === "turnaround" ||
            stage === "received") && (
            <Area
              type="monotone"
              name="Outsourced Collected → Report Received"
              dataKey="outsourcedToReceived"
              stackId={
                stage === "turnaround"
                  ? "1"
                  : undefined
              }
              stroke="#0f766e"
              fill="#99f6e4"
              strokeWidth={2}
            />
          )}

        {/* Report Received → Report Delivered */}
        {(stage === "turnaround" ||
          stage === "delivered") && (
          <Area
            type="monotone"
            name="Report Received → Report Delivered"
            dataKey="receivedToDelivered"
            stackId={
              stage === "turnaround"
                ? "1"
                : undefined
            }
            stroke="#d97706"
            fill="#fde68a"
            strokeWidth={2}
          />
        )}

      {/* Overall Turnaround */}
      {stage === "turnaround" && (
        <Area
          type="monotone"
          name="Turnaround"
          dataKey="turnaround"
          stroke="#dc2626"
          fill="none"
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 5 }}
        />
      )}

        
          
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
