
// src/owner/charts/StaffTimeline.jsx

import React, {
  useMemo,
  useState,
  useEffect,
} from "react";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export default function StaffTimeline({
  timelines = {},
}) {
  const staffNames =
    useMemo(
      () =>
        Object.keys(
          timelines
        ),
      [timelines]
    );

  const [
    selectedStaff,
    setSelectedStaff,
  ] = useState("");

  useEffect(() => {
    if (
      staffNames.length &&
      !staffNames.includes(
        selectedStaff
      )
    ) {
      setSelectedStaff(
        staffNames[0]
      );
    }
  }, [
    staffNames,
    selectedStaff,
  ]);

  const data =
    useMemo(() => {
      const rows =
        timelines[
          selectedStaff
        ] || [];

      return [...rows]
        .sort((a, b) =>
          String(
            a.x
          ).localeCompare(
            String(
              b.x
            ),
            undefined,
            {
              numeric:
                true,
            }
          )
        )
        .map((r) => ({
          x: r.x,
          diagnosticNo:
            r.diagnosticNo,
          regNo:
            r.regNo,
          duration:
            r.duration,
          name: r.name,
          tests:
            r.selectedTests ||
            [],
        }));
    }, [
      timelines,
      selectedStaff,
    ]);

  const avg =
    data.length
      ? Math.round(
          data.reduce(
            (
              s,
              d
            ) =>
              s +
              d.duration,
            0
          ) /
            data.length
        )
      : 0;

  const max =
    Math.max(
      ...data.map(
        (d) =>
          d.duration
      ),
      0
    );

  if (!staffNames.length) {
    return (
      <div
        style={{
          padding: 40,
          textAlign:
            "center",
          color:
            "#6b7280",
        }}
      >
        No staff timeline
        data available.
      </div>
    );
  }

  return (
    <div>
      {/* Top Row */}
      <div
        style={{
          display:
            "flex",
          justifyContent:
            "space-between",
          alignItems:
            "center",
          flexWrap:
            "wrap",
          gap: 16,
          marginBottom:
            20,
        }}
      >
        <div
          style={{
            display:
              "flex",
            gap: 24,
            flexWrap:
              "wrap",
            color:
              "#374151",
            fontSize: 14,
          }}
        >
          <div>
            Showing:
            {" "}
            <strong>
              {
                selectedStaff
              }
            </strong>
          </div>

          <div>
            Patients:
            {" "}
            <strong>
              {
                data.length
              }
            </strong>
          </div>

          <div>
            Average:
            {" "}
            <strong>
              {avg}
              m
            </strong>
          </div>

          <div>
            Maximum:
            {" "}
            <strong>
              {max}
              m
            </strong>
          </div>
        </div>

        <select
          value={
            selectedStaff
          }
          onChange={(e) =>
            setSelectedStaff(
              e.target
                .value
            )
          }
          style={{
            padding:
              "8px 12px",
            borderRadius:
              8,
            border:
              "1px solid #d1d5db",
          }}
        >
          {staffNames.map(
            (
              staff
            ) => (
              <option
                key={
                  staff
                }
                value={
                  staff
                }
              >
                {staff}
              </option>
            )
          )}
        </select>
      </div>

      {/* Chart */}
      <div
        style={{
          width: "100%",
          height: 500,
        }}
      >
        <ResponsiveContainer>
          <LineChart
            data={data}
            margin={{
              top: 20,
              right: 30,
              left: 20,
              bottom: 60,
            }}
          >
            <CartesianGrid
              stroke="#e5e7eb"
              strokeDasharray="4 4"
            />

            <XAxis
              dataKey="x"
              angle={-45}
              textAnchor="end"
              height={90}
              interval={0}
            />

            <YAxis
              allowDecimals={
                false
              }
              label={{
                value:
                  "Duration (minutes)",
                angle:
                  -90,
                position:
                  "insideLeft",
              }}
            />

            <Tooltip
              content={({
                active,
                payload,
              }) => {
                if (
                  !active ||
                  !payload?.length
                ) {
                  return null;
                }

                const p =
                  payload[0]
                    .payload;

                return (
                  <div
                    style={{
                      background:
                        "#fff",
                      border:
                        "1px solid #e5e7eb",
                      padding:
                        14,
                      borderRadius:
                        12,
                      boxShadow:
                        "0 4px 12px rgba(0,0,0,0.08)",
                    }}
                  >
                    <div>
                      Reg No:
                      {" "}
                      {
                        p.regNo
                      }
                    </div>

                    <div>
                      Diag No:
                      {" "}
                      {
                        p.diagnosticNo
                      }
                    </div>

                    <div>
                      Patient:
                      {" "}
                      {
                        p.name
                      }
                    </div>

                    <div>
                      Duration:
                      {" "}
                      {
                        p.duration
                      }
                      {" "}
                      min
                    </div>
                  </div>
                );
              }}
            />

            <Line
              type="linear"
              dataKey="duration"
              stroke="#2563eb"
              strokeWidth={3}
              dot={{
                r: 5,
                fill:
                  "#2563eb",
              }}
              activeDot={{
                r: 8,
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}