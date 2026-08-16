import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import "./OperationWorkflowReport.css";

function formatNames(list) {
  if (!list?.length) return "—";
  return list
    .map((x) => (typeof x === "string" ? x : `${x.name} (${x.count})`))
    .join(", ");
}

function Kpi({ label, value, tone }) {
  return (
    <div className={`ow-kpi ${tone || ""}`}>
      <div className="ow-kpi-label">{label}</div>
      <div className="ow-kpi-value">{value ?? "—"}</div>
    </div>
  );
}

/**
 * Operation Workflow compliance report — tables + charts by slot/role.
 */
export default function OperationWorkflowReport({ data, loading, error }) {
  if (loading) {
    return (
      <div className="ow-report">
        <p className="ow-muted">Loading Operation Workflow…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ow-report">
        <p className="ow-error">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="ow-report">
        <p className="ow-muted">
          Click View to compare planned Operation Map staffing with actual
          entries for the selected date range.
        </p>
      </div>
    );
  }

  const { summary, days, slotChart, roleChart, detailMisses } = data;

  return (
    <div className="ow-report">
      <div className="ow-kpi-row">
        <Kpi label="Checked entries" value={summary.checked} />
        <Kpi label="Followed" value={summary.followed} tone="ok" />
        <Kpi label="Not followed" value={summary.notFollowed} tone="bad" />
        <Kpi
          label="Follow rate"
          value={
            summary.followRate == null ? "—" : `${summary.followRate}%`
          }
        />
      </div>

      {summary.daysWithPlans === 0 ? (
        <p className="ow-warn">
          No Operation Map slots saved for this date range. Save a day plan in
          Operation Map first.
        </p>
      ) : null}

      <div className="ow-charts">
        <div className="ow-chart-card">
          <h3>Followed vs not followed by slot</h3>
          {slotChart?.length ? (
            <div className="ow-chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={slotChart} margin={{ top: 8, right: 12, left: 0, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    angle={-28}
                    textAnchor="end"
                    interval={0}
                    height={70}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="followed" name="Followed" stackId="a" fill="#16a34a" />
                  <Bar
                    dataKey="notFollowed"
                    name="Not followed"
                    stackId="a"
                    fill="#dc2626"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="ow-muted">No slot activity to chart.</p>
          )}
        </div>

        <div className="ow-chart-card">
          <h3>Followed vs not followed by role</h3>
          {roleChart?.length ? (
            <div className="ow-chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={roleChart} margin={{ top: 8, right: 12, left: 0, bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    angle={-28}
                    textAnchor="end"
                    interval={0}
                    height={70}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="followed" name="Followed" stackId="a" fill="#2563eb" />
                  <Bar
                    dataKey="notFollowed"
                    name="Not followed"
                    stackId="a"
                    fill="#f97316"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="ow-muted">No role activity to chart.</p>
          )}
        </div>
      </div>

      {(days || []).map((day) => (
        <section key={day.date} className="ow-day">
          <h3 className="ow-day-title">{day.date}</h3>
          {!day.slots?.length ? (
            <p className="ow-muted">No slots on Operation Map for this day.</p>
          ) : (
            day.slots.map((slot) => (
              <div key={slot.id} className="ow-slot">
                <div className="ow-slot-head">
                  <div>
                    <div className="ow-slot-name">{slot.label}</div>
                    <div className="ow-slot-meta">{slot.rangeLabel}</div>
                  </div>
                  <div className="ow-slot-counts">
                    <span className="ow-pill ok">{slot.followedCount} followed</span>
                    <span className="ow-pill bad">
                      {slot.notFollowedCount} not followed
                    </span>
                  </div>
                </div>

                {!slot.roles?.length ? (
                  <p className="ow-muted">
                    No mapped activity fell into this slot.
                  </p>
                ) : (
                  <div className="ow-table-wrap">
                    <table className="ow-table">
                      <thead>
                        <tr>
                          <th>Role</th>
                          <th>Planned</th>
                          <th>Followed</th>
                          <th>Who followed</th>
                          <th>Not followed</th>
                          <th>Who disfollowed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slot.roles.map((role) => (
                          <tr key={`${role.roleKey}-${role.field}`}>
                            <td>{role.roleLabel}</td>
                            <td>{formatNames(role.plannedNames)}</td>
                            <td>{role.followedCount}</td>
                            <td>{formatNames(role.followedBy)}</td>
                            <td>{role.notFollowedCount}</td>
                            <td>{formatNames(role.disfollowedBy)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
        </section>
      ))}

      {detailMisses?.length ? (
        <section className="ow-day">
          <h3 className="ow-day-title">Not followed detail</h3>
          <div className="ow-table-wrap">
            <table className="ow-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Slot</th>
                  <th>Hour</th>
                  <th>Role</th>
                  <th>Planned</th>
                  <th>Actual</th>
                  <th>Action</th>
                  <th>Reg</th>
                </tr>
              </thead>
              <tbody>
                {detailMisses.map((row, idx) => (
                  <tr key={`${row.regNo}-${row.hourKey}-${idx}`}>
                    <td>{row.date}</td>
                    <td>{row.slotLabel}</td>
                    <td>{row.hourKey}</td>
                    <td>{row.roleLabel}</td>
                    <td>{row.planned}</td>
                    <td>{row.actual}</td>
                    <td>{row.action}</td>
                    <td>
                      {row.regNo}
                      {row.diagnosticNo ? ` / ${row.diagnosticNo}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
