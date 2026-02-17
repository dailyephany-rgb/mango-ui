

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

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const { regNo } = payload[0].payload;

  return (
    <div style={{ 
      background: "rgba(255, 255, 255, 0.98)", 
      border: "1px solid #ccc", 
      padding: "10px 14px", 
      borderRadius: "6px", 
      boxShadow: "0 4px 6px rgba(0,0,0,0.1)" 
    }}>
      <div style={{ fontWeight: "bold", marginBottom: 6, color: "#333" }}>{regNo}</div>
      {payload.map((item, index) => (
        <div key={index} style={{ color: item.stroke, fontSize: "13px", margin: "2px 0" }}>
          <span style={{ fontWeight: "500" }}>{item.name}:</span> {formatDuration(item.value)}
        </div>
      ))}
      <div style={{ 
        marginTop: 6, 
        borderTop: "1px solid #ddd", 
        paddingTop: 6, 
        fontWeight: "bold", 
        color: "#000" 
      }}>
        Total Delay: {formatDuration(payload.reduce((sum, entry) => sum + entry.value, 0))}
      </div>
    </div>
  );
};

export default function StackedStageLines({ unifiedRows }) {
  const data = useMemo(() => {
    if (!unifiedRows || unifiedRows.length === 0) return [];
    return [...unifiedRows]
      .filter(p => p.timeScanned)
      .sort((a, b) => new Date(a.timeScanned) - new Date(b.timeScanned))
      .map((p, index) => {
        const tSc = p.timeScanned ? new Date(p.timeScanned).getTime() : null;
        const tSv = p.timeSaved ? new Date(p.timeSaved).getTime() : null;
        const tG = p.timeGiven ? new Date(p.timeGiven).getTime() : null;

        const scannedToSaved = tSc && tSv ? Math.max(0, Math.round((tSv - tSc) / 60000)) : 0;
        const savedToGiven = tSv && tG ? Math.max(0, Math.round((tG - tSv) / 60000)) : 0;

        return { x: index + 1, regNo: p.regNo, scannedToSaved, savedToGiven };
      });
  }, [unifiedRows]);

  const maxVal = data.reduce((m, d) => Math.max(m, (d.scannedToSaved + d.savedToGiven)), 0);
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
          
          <Area 
            type="monotone" 
            name="Scanned → Received" 
            dataKey="scannedToSaved" 
            stackId="1" 
            stroke="#2563eb" 
            fill="#dbeafe" 
            strokeWidth={2}
          />

          <Area 
            type="monotone" 
            name="Received → Given" 
            dataKey="savedToGiven" 
            stackId="1" 
            stroke="#7c3aed" 
            fill="#ddd6fe" 
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
