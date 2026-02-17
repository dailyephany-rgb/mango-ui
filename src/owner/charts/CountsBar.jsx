
// src/owner/charts/CountsBar.jsx
import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function CountsBar({ counts }) {
  const data = [
    {
      name: "Collected",
      value:
        counts.totalPatientsCollected ??
        counts.totalPrinted ?? 0,    // backward compatibility
    },
    {
      name: "Saved",
      value:
        counts.totalPatientsSaved ??
        counts.saved ?? 0,
    },
    {
      name: "Validated",
      value:
        counts.totalPatientsValidated ??
        counts.validated ?? 0,
    },
  ];

  return (
    /* Increased height to 480 to match the Stage Timeline and fill the container */
    <div style={{ width: "100%", height: 480, display: "flex", justifyContent: "center", alignItems: "center" }}>
      <ResponsiveContainer width="100%" height="90%">
        {/* Added margins to ensure the chart is perfectly centered within the container */}
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="value" fill="#2563eb" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

