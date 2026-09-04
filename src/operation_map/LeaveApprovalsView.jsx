import React, { useCallback, useEffect, useState } from "react";
import { getLocalDateString } from "../shared/utils/dates.js";
import {
  createLeaveRequest,
  listLeaveRequestsByStatus,
  approveLeaveRequest,
  rejectLeaveRequest,
} from "./leaveRequestStore.js";

function formatRange(fromDate, toDate) {
  if (!fromDate) return "—";
  if (!toDate || toDate === fromDate) return fromDate;
  return `${fromDate} → ${toDate}`;
}

function LeaveTypeLabel({ row }) {
  if (row.type === "partial") {
    return (
      <span>
        Partial ({row.startTime || "?"} – {row.endTime || "?"})
      </span>
    );
  }
  return <span>Full day</span>;
}

/**
 * Leave Approvals: apply multi-day leave + owner approve/reject queue.
 */
export default function LeaveApprovalsView({
  actor,
  staffList,
  onApproved,
}) {
  const today = getLocalDateString();
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [staffId, setStaffId] = useState(staffList[0]?.id || "");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [type, setType] = useState("full");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("14:00");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!staffId && staffList[0]?.id) setStaffId(staffList[0].id);
  }, [staffList, staffId]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await listLeaveRequestsByStatus(tab);
      setRows(list);
    } catch (err) {
      console.error(err);
      setError(err?.message || String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const person = staffList.find((s) => s.id === staffId);
      await createLeaveRequest(
        {
          staffId,
          staffName: person?.name || staffId,
          fromDate,
          toDate: toDate || fromDate,
          type,
          startTime,
          endTime,
          reason,
        },
        actor
      );
      setReason("");
      setNotice("Leave application submitted — awaiting approval.");
      if (tab !== "pending") setTab("pending");
      else await reload();
    } catch (err) {
      console.error(err);
      setError(err?.message || String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (row) => {
    if (
      !window.confirm(
        `Approve leave for ${row.staffName} (${formatRange(row.fromDate, row.toDate)})?`
      )
    ) {
      return;
    }
    setBusyId(row.id);
    setError("");
    try {
      await approveLeaveRequest(row, actor);
      setNotice(`Approved leave for ${row.staffName}.`);
      await reload();
      if (typeof onApproved === "function") onApproved(row);
    } catch (err) {
      console.error(err);
      setError(err?.message || String(err));
    } finally {
      setBusyId("");
    }
  };

  const handleReject = async (row) => {
    if (!window.confirm(`Reject leave for ${row.staffName}?`)) return;
    setBusyId(row.id);
    setError("");
    try {
      await rejectLeaveRequest(row.id, actor);
      setNotice(`Rejected leave for ${row.staffName}.`);
      await reload();
    } catch (err) {
      console.error(err);
      setError(err?.message || String(err));
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="om-leave-approvals">
      <header className="om-header om-leave-header">
        <div>
          <h1>Leave Approvals</h1>
          <p>Apply multi-day leave and approve pending requests</p>
        </div>
      </header>

      {error ? <p className="om-error">{error}</p> : null}
      {notice ? <p className="om-leave-notice">{notice}</p> : null}

      <div className="om-leave-body">
        <section className="om-leave-card">
          <h2>New leave application</h2>
          <form className="om-leave-form" onSubmit={handleSubmit}>
            <label>Staff</label>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              required
            >
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <div className="om-leave-date-row">
              <div>
                <label>From</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    if (toDate < e.target.value) setToDate(e.target.value);
                  }}
                  required
                />
              </div>
              <div>
                <label>To</label>
                <input
                  type="date"
                  value={toDate}
                  min={fromDate}
                  onChange={(e) => setToDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="full">Full Day</option>
              <option value="partial">Partial (same hours each day)</option>
            </select>

            {type === "partial" ? (
              <div className="om-leave-date-row">
                <div>
                  <label>Start</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label>End</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>
            ) : null}

            <label>Reason (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Reason for leave"
            />

            <button
              type="submit"
              className="om-btn om-btn-primary"
              disabled={submitting || !staffId}
            >
              {submitting ? "Submitting…" : "Submit application"}
            </button>
          </form>
        </section>

        <section className="om-leave-card om-leave-queue">
          <div className="om-leave-tabs">
            {["pending", "approved", "rejected"].map((t) => (
              <button
                key={t}
                type="button"
                className={`om-leave-tab ${tab === t ? "active" : ""}`}
                onClick={() => setTab(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="om-footer-hint">Loading requests…</p>
          ) : rows.length === 0 ? (
            <p className="om-placeholder">No {tab} leave requests.</p>
          ) : (
            <div className="om-leave-list">
              {rows.map((row) => (
                <div className="om-leave-request" key={row.id}>
                  <div className="om-leave-request-main">
                    <strong>{row.staffName || row.staffId}</strong>
                    <div className="om-leave-request-meta">
                      {formatRange(row.fromDate, row.toDate)} ·{" "}
                      <LeaveTypeLabel row={row} />
                    </div>
                    {row.reason ? (
                      <div className="om-leave-request-reason">{row.reason}</div>
                    ) : null}
                    <div className="om-leave-request-meta">
                      Requested by {row.requestedBy || "—"}
                      {row.reviewedBy
                        ? ` · Reviewed by ${row.reviewedBy}`
                        : ""}
                    </div>
                  </div>
                  {tab === "pending" ? (
                    <div className="om-leave-request-actions">
                      <button
                        type="button"
                        className="om-btn om-btn-primary"
                        disabled={busyId === row.id}
                        onClick={() => handleApprove(row)}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="om-btn"
                        disabled={busyId === row.id}
                        onClick={() => handleReject(row)}
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <span className={`om-leave-status-pill ${row.status}`}>
                      {row.status}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Staff-only full page: upcoming approved leave for the lab.
 */
export function StaffApprovedLeavesView({
  actor,
  roster = [],
  myLeave = [],
  onApply,
}) {
  return (
    <div className="om-main">
      <header className="om-header om-leave-header">
        <div>
          <h1>Approved Leaves</h1>
          <p>See who already has approved leave before you apply</p>
        </div>
        <div className="om-header-actions">
          <button
            type="button"
            className="om-btn om-btn-primary"
            onClick={onApply}
          >
            Apply Leave
          </button>
        </div>
      </header>

      <div className="om-leave-body om-staff-leave-body">
        <section className="om-leave-card om-leave-queue">
          <h2>Upcoming approved leave</h2>
          {roster.length === 0 ? (
            <p className="om-placeholder">No upcoming approved leave.</p>
          ) : (
            <div className="om-leave-list">
              {roster.map((row) => {
                const mine =
                  String(row.staffId) === String(actor) ||
                  String(row.staffName).toLowerCase() ===
                    String(actor).toLowerCase();
                return (
                  <div
                    className={`om-leave-request ${mine ? "om-leave-item-mine" : ""}`}
                    key={row.id}
                  >
                    <div className="om-leave-request-main">
                      <strong>
                        {row.staffName || row.staffId}
                        {mine ? " (you)" : ""}
                      </strong>
                      <span>{formatRange(row.fromDate, row.toDate)}</span>
                      <span>
                        <LeaveTypeLabel row={row} />
                      </span>
                    </div>
                    <span className="om-leave-status-pill approved">approved</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="om-leave-card">
          <h2>My leave requests</h2>
          {myLeave.length === 0 ? (
            <p className="om-placeholder">You have not applied for leave yet.</p>
          ) : (
            <div className="om-leave-list">
              {myLeave.map((row) => (
                <div className="om-leave-request" key={row.id}>
                  <div className="om-leave-request-main">
                    <strong>{formatRange(row.fromDate, row.toDate)}</strong>
                    <span>
                      <LeaveTypeLabel row={row} />
                    </span>
                  </div>
                  <span className={`om-leave-status-pill ${row.status}`}>
                    {row.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Modal to submit a leave application from Operation Map Quick Actions.
 * When lockedStaffId is set, staff cannot apply for someone else.
 */
export function ApplyLeaveModal({
  staffList,
  actor,
  onClose,
  onSubmitted,
  lockedStaffId = null,
}) {
  const today = getLocalDateString();
  const locked = Boolean(lockedStaffId);
  const [staffId, setStaffId] = useState(
    lockedStaffId || staffList[0]?.id || ""
  );
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [type, setType] = useState("full");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("14:00");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (lockedStaffId) setStaffId(lockedStaffId);
  }, [lockedStaffId]);

  const lockedName =
    staffList.find((s) => s.id === lockedStaffId)?.name || lockedStaffId;

  return (
    <div className="om-modal-backdrop" onClick={onClose}>
      <div className="om-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Apply Leave</h2>
        <p className="om-leave-modal-hint">
          {locked
            ? "Check Approved Leaves first. This creates a pending application for you. An owner will approve or reject it."
            : "Creates a pending application. Approve it under Leave Approvals."}
        </p>
        {error ? <p className="om-error">{error}</p> : null}
        <label>Staff</label>
        {locked ? (
          <input type="text" value={lockedName || ""} readOnly disabled />
        ) : (
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <label>From</label>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => {
            setFromDate(e.target.value);
            if (toDate < e.target.value) setToDate(e.target.value);
          }}
        />
        <label>To</label>
        <input
          type="date"
          value={toDate}
          min={fromDate}
          onChange={(e) => setToDate(e.target.value)}
        />
        <label>Type</label>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="full">Full Day</option>
          <option value="partial">Partial</option>
        </select>
        {type === "partial" ? (
          <>
            <label>Start</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
            <label>End</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </>
        ) : null}
        <label>Reason</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Optional"
        />
        <div className="om-modal-actions">
          <button type="button" className="om-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="om-btn om-btn-primary"
            disabled={busy || !staffId}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const id = lockedStaffId || staffId;
                const person = staffList.find((s) => s.id === id);
                await createLeaveRequest(
                  {
                    staffId: id,
                    staffName: person?.name || id,
                    fromDate,
                    toDate: toDate || fromDate,
                    type,
                    startTime,
                    endTime,
                    reason,
                  },
                  actor
                );
                if (typeof onSubmitted === "function") onSubmitted();
                onClose();
              } catch (err) {
                console.error(err);
                setError(err?.message || String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
