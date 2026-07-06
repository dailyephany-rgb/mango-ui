
// src/owner/charts/StaffAvgCards.jsx

import React from "react";

export default function StaffAvgCards({
  data = [],
}) {
  if (!data.length) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          color: "#6b7280",
        }}
      >
        No staff data available.
      </div>
    );
  }

  const sorted = [...data].sort(
    (a, b) =>
      b.avgMinutes -
      a.avgMinutes
  );

  return (
    <div
      style={{
        display: "grid",
        gap: 14,
        gridTemplateColumns:
          "repeat(auto-fit,minmax(160px,1fr))",
      }}
    >
      {sorted.map(
        (
          staff,
          index
        ) => (
          <div
            key={staff.name}
            style={{
              background:
                "linear-gradient(135deg,#ffffff,#f8fafc)",
              border:
                index === 0
                  ? "2px solid #f59e0b"
                  : "1px solid #e5e7eb",
              borderRadius: 16,
              padding: 22,
              textAlign:
                "center",
              boxShadow:
                "0 2px 10px rgba(0,0,0,0.05)",
            }}
          >
            {index === 0 && (
              <div
                style={{
                  fontSize: 11,
                  color:
                    "#f59e0b",
                  fontWeight: 700,
                  marginBottom: 10,
                }}
              >
                SLOWEST AVG
              </div>
            )}

            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#374151",
                marginBottom: 14,
              }}
            >
              {staff.name}
            </div>

            <div
              style={{
                fontSize: 34,
                fontWeight: 700,
                color: "#2563eb",
              }}
            >
              {staff.avgMinutes}
            </div>

            <div
              style={{
                fontSize: 12,
                color: "#6b7280",
                marginTop: 6,
              }}
            >
              Avg Duration (min)
            </div>
          </div>
        )
      )}
    </div>
  );
}