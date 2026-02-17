


// src/owner/charts/CountsBar.jsx
import React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function CountsBar({ counts }) {
  const data = [
    {
      name: "Collected",
      value: counts.totalPatientsCollected ?? 0,
    },
    {
      name: "Saved",
      value: counts.totalPatientsSaved ?? 0,
    },
    {
      name: "Given",
      value: counts.totalPatientsGiven ?? 0,
    },
  ];

  return (
    <div style={{ width: "100%", height: 480, display: "flex", justifyContent: "center", alignItems: "center" }}>
      <ResponsiveContainer width="100%" height="90%">
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
