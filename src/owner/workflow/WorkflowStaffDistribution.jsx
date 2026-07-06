
// src/owner/charts/StaffDistribution.jsx

import React, { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export default function WorkflowStaffDistribution({
  data = {
    routine: [],
    insideLab: [],
    whatsapp: [],
  },
}) {
  
  const [view, setView] = useState("bar");
  const [category, setCategory] = useState("routine");

  const colors = [
    "#2563eb",
    "#16a34a",
    "#dc2626",
    "#ca8a04",
    "#7c3aed",
    "#0891b2",
    "#ea580c",
    "#db2777",
  ];

  const chartData = data[category] || [];

  if (!chartData.length) {
    return (
      <div
        style={{
          height: 380,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          color: "#6b7280",
        }}
      >
        No staff data available.
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "center",
          marginBottom: 18,
        }}
      >
        <div
          style={{
            fontWeight: 600,
            color: "#374151",
          }}
        >
          Total Staff: {chartData.length}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
          }}
        >

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#ffffff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <option value="routine">Routine Reports</option>
          <option value="insideLab">Inside Lab Reports</option>
          <option value="whatsapp">WhatsApp</option>
        </select>



          <button
            onClick={() =>
              setView("bar")
            }
            style={{
              padding:
                "8px 14px",
              borderRadius: 8,
              border:
                "1px solid #d1d5db",
              background:
                view === "bar"
                  ? "#2563eb"
                  : "#ffffff",
              color:
                view === "bar"
                  ? "#ffffff"
                  : "#374151",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Bar
          </button>

          <button
            onClick={() =>
              setView("pie")
            }
            style={{
              padding:
                "8px 14px",
              borderRadius: 8,
              border:
                "1px solid #d1d5db",
              background:
                view === "pie"
                  ? "#2563eb"
                  : "#ffffff",
              color:
                view === "pie"
                  ? "#ffffff"
                  : "#374151",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Pie
          </button>
        </div>
      </div>

      {/* BAR */}
      {view === "bar" && (
        <div
          style={{
            width: "100%",
            height: 360,
          }}
        >
          <ResponsiveContainer>
            <BarChart
             data={[...chartData].sort(
                (a, b) =>
                  b.count -
                  a.count
              )}
              layout="vertical"
              margin={{
                top: 10,
                right: 30,
                left: 40,
                bottom: 10,
              }}
            >
              <XAxis type="number" />

              <YAxis
                type="category"
                dataKey="name"
                width={110}
              />

              <Tooltip
                formatter={(
                  value,
                  name,
                  props
                ) => [
                  `${value} reports`,
                  `${props.payload.percentage}%`,
                ]}
              />

              <Bar
                dataKey="count"
                fill="#2563eb"
                radius={[
                  0,
                  6,
                  6,
                  0,
                ]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* PIE */}
      {view === "pie" && (
        <div
          style={{
            width: "100%",
            height: 360,
          }}
        >
          <ResponsiveContainer>
            <PieChart>
              <Pie
               data={chartData}
                dataKey="count"
                nameKey="name"
                outerRadius={115}
                label={(
                  entry
                ) =>
                  `${entry.percentage}%`
                }
              >
                {chartData.map(
                  (
                    entry,
                    index
                  ) => (
                    <Cell
                      key={
                        entry.name
                      }
                      fill={
                        colors[
                          index %
                            colors.length
                        ]
                      }
                    />
                  )
                )}
              </Pie>

              <Tooltip
                formatter={(
                  value,
                  name,
                  props
                ) => [
                  `${value} reports`,
                  `${props.payload.percentage}%`,
                ]}
              />

              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}