
// src/owner/charts/StackedStageLines.jsx
import React, { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload[0]) return null;
  const { regNo } = payload[0].payload;

  return (
    <div style={{ background: "white", border: "1px solid #ccc", padding: "8px 12px", borderRadius: "4px" }}>
      <div style={{ fontWeight: "bold", marginBottom: 4 }}>{regNo}</div>
      {payload.map((item, index) => (
        <div key={index} style={{ color: item.stroke }}>
          {item.name}: {item.value} min
        </div>
      ))}
    </div>
  );
};

export default function StackedStageLines({ unifiedRows }) {
  const data = useMemo(() => {
    if (!unifiedRows || unifiedRows.length === 0) return [];

    return [...unifiedRows]
      .sort((a, b) => new Date(a.timeCollected) - new Date(b.timeCollected))
      .map((p, index) => {
        const tC = p.timeCollected ? new Date(p.timeCollected).getTime() : null;
        const tSv = p.timeSaved ? new Date(p.timeSaved).getTime() : null;
        const cs = tC && tSv ? Math.max(0, Math.round((tSv - tC) / 60000)) : 0;

        return {
          x: index + 1,
          regNo: p.regNo,
          collectedToSaved: cs
        };
      });
  }, [unifiedRows]);

  const maxVal = data.reduce((m, d) => Math.max(m, d.collectedToSaved), 0);
  const yMax = Math.ceil((maxVal + 10) / 20) * 20;

  return (
    <div style={{ width: "100%", height: 480 }}> 
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}> 
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="x" label={{ value: "Patient Count", position: "insideBottom", offset: -10 }} />
          <YAxis label={{ value: "Minutes", angle: -90, position: "insideLeft" }} domain={[0, yMax]} />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            verticalAlign="bottom" 
            align="center" 
            wrapperStyle={{ paddingTop: 20, bottom: 0 }}
            payload={[{ value: "Collected → Saved", type: "square", color: "#059669" }]} 
          />
          <Area type="monotone" name="Collected → Saved" dataKey="collectedToSaved" stroke="#059669" fill="#bbf7d0" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}