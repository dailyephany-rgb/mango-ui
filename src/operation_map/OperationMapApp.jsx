import React, { useCallback, useEffect, useMemo, useState } from "react";
import UserMenu from "../auth/UserMenu.jsx";
import { getLocalDateString } from "../shared/utils/dates.js";
import {
  ROLE_CONFIG,
  COMMAND_ROLES,
  SECOND_LAYER_ROLES,
  MAIN_DEPT_KEYS,
  BOTTOM_DEPT_KEYS,
  emptyAssignments,
  normalizeAssignments,
  asStaffList,
  getRoleStaffList,
  formatHourLabel,
  formatSlotRange,
  hoursForSlot,
  uniqueAssignedStaffIds,
  staffAssignedInHour,
  assignmentFingerprint,
  isEmptyAssignments,
  isHourOverrideOfSlot,
} from "./roleConfig.js";
import {
  loadDayPlan,
  saveDayPlan,
  addSlotToPlan,
  removeSlotFromPlan,
  cloneDayPlan,
  shiftDateStr,
  ensureHoursForSlots,
  loadStaffMeta,
  saveStaffMeta,
} from "./operationMapStore.js";
import {
  seedStaffFromUsers,
  isOnLeaveForHour,
  getLeaveLabel,
  mergeLeaveForDate,
} from "./staffRoster.js";
import {
  loadApprovedLeaveForDate,
  approvedRequestsToLeaveEntries,
  listLeaveRequestsForStaff,
  listLeaveRequestsByStatus,
} from "./leaveRequestStore.js";
import LeaveApprovalsView, {
  ApplyLeaveModal,
  StaffApprovedLeavesView,
} from "./LeaveApprovalsView.jsx";
import "./operation_map.css";

function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatLeaveRange(fromDate, toDate) {
  if (!fromDate) return "—";
  if (!toDate || toDate === fromDate) return fromDate;
  return `${fromDate} → ${toDate}`;
}

function formatDateHeading(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const today = getLocalDateString();
  const tomorrow = shiftDateStr(today, 1);
  const yesterday = shiftDateStr(today, -1);
  const label = dt.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  if (dateStr === today) return `${label} (Today)`;
  if (dateStr === tomorrow) return `${label} (Tomorrow)`;
  if (dateStr === yesterday) return `${label} (Yesterday)`;
  return label;
}

function cloneAssignments(a) {
  return normalizeAssignments(a);
}

export default function OperationMapApp({ mode = "owner" }) {
  const isStaff = mode === "staff";
  const actor = sessionStorage.getItem("loggedUser") || "Unknown";
  const [view, setView] = useState("map"); // map | leave
  const [date, setDate] = useState(getLocalDateString());
  const [dayPlan, setDayPlan] = useState(null);
  const [approvedLeave, setApprovedLeave] = useState([]);
  const [myLeave, setMyLeave] = useState([]);
  const [approvedRoster, setApprovedRoster] = useState([]);
  const [myLeaveTick, setMyLeaveTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeSlotId, setActiveSlotId] = useState(null);
  const [activeHour, setActiveHour] = useState(null);
  const [staffFilter, setStaffFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null); // addSlot | addLeave | capabilities | addStaff
  const [capStaffId, setCapStaffId] = useState(null);
  const [capDraft, setCapDraft] = useState({
    qualification: "",
    capabilities: "",
  });

  const staffList = useMemo(
    () => seedStaffFromUsers(dayPlan?.extraStaff || []),
    [dayPlan?.extraStaff]
  );

  const staffById = useMemo(() => {
    const m = {};
    staffList.forEach((s) => {
      m[s.id] = s;
    });
    return m;
  }, [staffList]);

  const effectiveLeave = useMemo(
    () =>
      mergeLeaveForDate(
        dayPlan?.leave,
        approvedRequestsToLeaveEntries(approvedLeave)
      ),
    [dayPlan?.leave, approvedLeave]
  );

  const load = useCallback(async (dateStr) => {
    setLoading(true);
    setError("");
    try {
      const [rawPlan, approved] = await Promise.all([
        loadDayPlan(dateStr),
        loadApprovedLeaveForDate(dateStr),
      ]);
      const plan = ensureHoursForSlots(rawPlan);
      setDayPlan(plan);
      setApprovedLeave(approved);
      setDirty(false);
      const firstSlot = plan.slots[0] || null;
      setActiveSlotId(firstSlot?.id || null);
      const hours = firstSlot
        ? hoursForSlot(firstSlot.startTime, firstSlot.endTime)
        : [];
      setActiveHour(hours[0] || null);

      if (
        !isStaff &&
        JSON.stringify(rawPlan?.hours || {}) !== JSON.stringify(plan.hours || {})
      ) {
        await saveDayPlan(plan, actor);
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [isStaff, actor]);

  useEffect(() => {
    if (isStaff || view === "map") load(date);
  }, [date, load, view, isStaff]);

  useEffect(() => {
    if (!isStaff || !actor || actor === "Unknown") {
      setMyLeave([]);
      return;
    }
    let cancelled = false;
    listLeaveRequestsForStaff(actor)
      .then((rows) => {
        if (!cancelled) setMyLeave(rows);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setMyLeave([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isStaff, actor, myLeaveTick]);

  useEffect(() => {
    if (!isStaff) {
      setApprovedRoster([]);
      return;
    }
    let cancelled = false;
    listLeaveRequestsByStatus("approved")
      .then((rows) => {
        if (cancelled) return;
        const today = getLocalDateString();
        const upcoming = (rows || [])
          .filter((r) => (r.toDate || r.fromDate) >= today)
          .sort((a, b) =>
            String(a.fromDate).localeCompare(String(b.fromDate))
          );
        setApprovedRoster(upcoming);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setApprovedRoster([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isStaff, myLeaveTick]);

  const markDirty = (nextPlan) => {
    if (isStaff) return;
    setDayPlan(nextPlan);
    setDirty(true);
  };

  const activeSlot = (dayPlan?.slots || []).find((s) => s.id === activeSlotId);
  const slotHours = activeSlot
    ? hoursForSlot(activeSlot.startTime, activeSlot.endTime)
    : [];

  const hourAssignments = normalizeAssignments(
    (activeHour && dayPlan?.hours?.[activeHour]?.assignments) ||
      emptyAssignments()
  );

  const updateHourAssignments = (mutator) => {
    if (!dayPlan || !activeHour) return;
    const current = dayPlan.hours[activeHour] || {
      slotId: activeSlotId,
      assignments: emptyAssignments(),
    };
    const nextAssign = mutator(cloneAssignments(current.assignments));
    const currentFp = assignmentFingerprint(current.assignments);
    const targetHours = activeSlot
      ? hoursForSlot(activeSlot.startTime, activeSlot.endTime)
      : [activeHour];
    const templateHour = targetHours[0] || activeHour;
    const hoursToWrite =
      activeHour === templateHour
        ? targetHours.filter((hk) => {
            const existing = dayPlan.hours?.[hk]?.assignments;
            const fp = assignmentFingerprint(existing);
            return fp === currentFp || isEmptyAssignments(existing);
          })
        : [activeHour];
    const nextHours = { ...(dayPlan.hours || {}) };
    hoursToWrite.forEach((hk) => {
      const prev = nextHours[hk] || {
        slotId: activeSlotId,
        assignments: emptyAssignments(),
      };
      nextHours[hk] = {
        ...prev,
        slotId: activeSlotId || prev.slotId,
        assignments: cloneAssignments(nextAssign),
      };
    });
    markDirty({ ...dayPlan, hours: nextHours });
  };

  const assignStaff = (staffId, roleKey, field = "staff") => {
    if (!staffId || isOnLeaveForHour(effectiveLeave, staffId, activeHour)) {
      return;
    }
    updateHourAssignments((a) => {
      const next = normalizeAssignments(a);
      const cfg = ROLE_CONFIG[roleKey];
      if (!cfg) return next;

      const max = cfg.maxAssignees || 8;

      if (cfg.hasValidator) {
        const list = asStaffList(next[roleKey]?.[field]);
        if (!list.includes(staffId) && list.length < max) {
          list.push(staffId);
        }
        next[roleKey] = {
          staff: asStaffList(next[roleKey]?.staff),
          validator: asStaffList(next[roleKey]?.validator),
          [field]: list,
        };
        return next;
      }

      if (BOTTOM_DEPT_KEYS.includes(roleKey)) {
        const list = asStaffList(next[roleKey]?.staff);
        if (!list.includes(staffId) && list.length < max) {
          list.push(staffId);
        }
        next[roleKey] = { staff: list };
        return next;
      }

      const list = asStaffList(next[roleKey]);
      if (!list.includes(staffId) && list.length < max) {
        list.push(staffId);
      }
      next[roleKey] = list;
      return next;
    });
  };

  const clearAssignee = (roleKey, field = "staff", staffId = null) => {
    updateHourAssignments((a) => {
      const next = normalizeAssignments(a);
      const cfg = ROLE_CONFIG[roleKey];
      if (!cfg) return next;

      if (cfg.hasValidator) {
        next[roleKey] = {
          staff: asStaffList(next[roleKey]?.staff),
          validator: asStaffList(next[roleKey]?.validator),
          [field]: asStaffList(next[roleKey]?.[field]).filter(
            (id) => id !== staffId
          ),
        };
        return next;
      }

      if (BOTTOM_DEPT_KEYS.includes(roleKey)) {
        next[roleKey] = {
          staff: asStaffList(next[roleKey]?.staff).filter(
            (id) => id !== staffId
          ),
        };
        return next;
      }

      next[roleKey] = asStaffList(next[roleKey]).filter((id) => id !== staffId);
      return next;
    });
  };

  const handleSave = async () => {
    if (!dayPlan) return;
    setSaving(true);
    setError("");
    try {
      await saveDayPlan(dayPlan, actor);
      setDirty(false);
    } catch (err) {
      console.error(err);
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCopyPrevious = async () => {
    if (!window.confirm("Copy previous day's schedule into this date?")) return;
    setError("");
    try {
      const prevDate = shiftDateStr(date, -1);
      const prev = await loadDayPlan(prevDate);
      if (!prev.slots?.length) {
        alert("Previous day has no slots to copy.");
        return;
      }
      if (
        dayPlan?.slots?.length &&
        !window.confirm("Overwrite current day schedule?")
      ) {
        return;
      }
      markDirty(cloneDayPlan(prev, date));
      const first = prev.slots[0];
      setActiveSlotId(first.id);
      const hrs = hoursForSlot(first.startTime, first.endTime);
      setActiveHour(hrs[0] || null);
    } catch (err) {
      console.error(err);
      setError(err?.message || String(err));
    }
  };

  const handleCopyPreviousSlot = () => {
    if (!dayPlan || !activeSlotId || !activeSlot) {
      alert("Select a slot first.");
      return;
    }
    const slots = dayPlan.slots || [];
    const idx = slots.findIndex((s) => s.id === activeSlotId);
    if (idx <= 0) {
      alert("No previous slot on this day to copy from.");
      return;
    }
    if (
      !window.confirm(
        "Copy staff assignments from the previous slot into this slot’s hours?"
      )
    ) {
      return;
    }

    const prevSlot = slots[idx - 1];
    const targetHours = hoursForSlot(activeSlot.startTime, activeSlot.endTime);
    const prevHours = hoursForSlot(prevSlot.startTime, prevSlot.endTime);
    const nextHours = { ...(dayPlan.hours || {}) };

    targetHours.forEach((hk, i) => {
      const sourceKey = prevHours.includes(hk)
        ? hk
        : prevHours[Math.min(i, prevHours.length - 1)];
      const source = sourceKey ? dayPlan.hours?.[sourceKey] : null;
      nextHours[hk] = {
        ...(nextHours[hk] || {}),
        slotId: activeSlotId,
        assignments: source
          ? normalizeAssignments(
              JSON.parse(JSON.stringify(source.assignments || emptyAssignments()))
            )
          : emptyAssignments(),
      };
    });

    markDirty({ ...dayPlan, hours: nextHours });
  };

  const statusOf = (staffId) => {
    if (isOnLeaveForHour(effectiveLeave, staffId, activeHour)) return "leave";
    const where = staffAssignedInHour(hourAssignments, staffId);
    if (where?.roleKey === "backup") return "backup";
    if (where) return "assigned";
    const s = staffById[staffId];
    if (s && s.onDutyDefault === false) return "off";
    return "available";
  };

  const summary = useMemo(() => {
    const total = staffList.length;
    let leave = 0;
    let backup = 0;
    let assigned = 0;
    let available = 0;
    let off = 0;
    staffList.forEach((s) => {
      const st = statusOf(s.id);
      if (st === "leave") leave += 1;
      else if (st === "backup") backup += 1;
      else if (st === "assigned") assigned += 1;
      else if (st === "off") off += 1;
      else available += 1;
    });
    return { total, leave, backup, assigned, available, off };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffList, hourAssignments, effectiveLeave, activeHour]);

  const filteredStaff = staffList.filter((s) => {
    if (search) {
      const q = search.trim().toLowerCase();
      const name = String(s.name || "").toLowerCase();
      const id = String(s.id || "").toLowerCase();
      // Prefix match: "n" → Nakshatra, Naresh; not names that merely contain "n"
      if (!name.startsWith(q) && !id.startsWith(q)) {
        return false;
      }
    }
    const st = statusOf(s.id);
    if (staffFilter === "available") return st === "available";
    if (staffFilter === "backup") return st === "backup";
    return true;
  });

  const leaveNow = effectiveLeave.filter((l) =>
    isOnLeaveForHour([l], l.staffId, activeHour || "00:00")
  );

  const onDropRole = (e, roleKey, field = "staff") => {
    e.preventDefault();
    const staffId = e.dataTransfer.getData("text/staff-id");
    if (staffId) assignStaff(staffId, roleKey, field);
  };

  const openCapabilities = async (staffId) => {
    setCapStaffId(staffId);
    try {
      const meta = await loadStaffMeta(staffId);
      setCapDraft({
        qualification: meta?.qualification || "",
        capabilities: (meta?.capabilities || []).join(", "),
      });
    } catch {
      setCapDraft({ qualification: "", capabilities: "" });
    }
    setModal("capabilities");
  };

  return (
    <div className={`om-root ${isStaff ? "om-staff-mode" : ""}`}>
      <aside className="om-sidebar">
        <div className="om-brand">
          Jodhpur Dairy
          <small>Diagnostics Lab</small>
        </div>
        <div className="om-nav-label">OPERATIONS</div>
        {isStaff ? (
          <>
            <button
              type="button"
              className={`om-nav-item ${view === "map" ? "active" : ""}`}
              onClick={() => setView("map")}
            >
              Operation Schedule
            </button>
            <button
              type="button"
              className={`om-nav-item ${view === "leave" ? "active" : ""}`}
              onClick={() => setView("leave")}
            >
              Approved Leaves
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`om-nav-item ${view === "map" ? "active" : ""}`}
              onClick={() => setView("map")}
            >
              Operation Map
            </button>
            <button
              type="button"
              className={`om-nav-item ${view === "leave" ? "active" : ""}`}
              onClick={() => setView("leave")}
            >
              Leave Approvals
            </button>
          </>
        )}
        <div className="om-sidebar-footer">
          {actor}
          <div style={{ marginTop: 8 }}>
            <UserMenu />
          </div>
        </div>
      </aside>

      {!isStaff && view === "leave" ? (
        <div className="om-main">
          <LeaveApprovalsView
            actor={actor}
            staffList={staffList.length ? staffList : seedStaffFromUsers([])}
            onApproved={async () => {
              await load(date);
            }}
          />
        </div>
      ) : isStaff && view === "leave" ? (
        <StaffApprovedLeavesView
          actor={actor}
          roster={approvedRoster}
          myLeave={myLeave}
          onApply={() => setModal("addLeave")}
        />
      ) : (
      <div className="om-main">
        <header className="om-header">
          <div>
            <h1>{isStaff ? "Operation Schedule" : "Operation Map"}</h1>
            <p>
              {isStaff
                ? "View today’s plan by date, slot, and hour — apply leave if needed"
                : "Plan who works where, by date, slot, and hour"}
            </p>
          </div>
          <div className="om-header-actions">
            <div className="om-date-nav">
              <button
                type="button"
                onClick={() => setDate((d) => shiftDateStr(d, -1))}
                aria-label="Previous day"
              >
                ‹
              </button>
              <div className="om-date-label">{formatDateHeading(date)}</div>
              <button
                type="button"
                onClick={() => setDate((d) => shiftDateStr(d, 1))}
                aria-label="Next day"
              >
                ›
              </button>
            </div>
            {isStaff ? (
              <button
                type="button"
                className="om-btn om-btn-primary"
                onClick={() => setModal("addLeave")}
              >
                Apply Leave
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="om-btn"
                  onClick={handleCopyPrevious}
                >
                  Copy Previous Day
                </button>
                <button
                  type="button"
                  className="om-btn"
                  onClick={handleCopyPreviousSlot}
                  disabled={!activeSlotId || (dayPlan?.slots?.length || 0) < 2}
                  title="Copy assignments from the previous slot into the selected slot"
                >
                  Copy Previous Slot
                </button>
                <button
                  type="button"
                  className={`om-btn om-btn-primary ${dirty ? "dirty" : ""}`}
                  disabled={!dirty || saving || loading}
                  onClick={handleSave}
                >
                  {saving
                    ? "Saving…"
                    : dirty
                      ? "Save Schedule *"
                      : "Save Schedule"}
                </button>
              </>
            )}
          </div>
        </header>

        {error ? <p className="om-error">{error}</p> : null}

        <div className="om-body">
          {loading || !dayPlan ? (
            <p className="om-footer-hint">Loading schedule…</p>
          ) : (
            <>
              <div className="om-slots-row">
                {(dayPlan.slots || []).map((slot, idx) => {
                  const count = uniqueAssignedStaffIds(
                    dayPlan.hours,
                    slot.id
                  ).size;
                  return (
                    <div
                      key={slot.id}
                      className={`om-slot-card ${
                        slot.id === activeSlotId ? "active" : ""
                      }`}
                      onClick={() => {
                        setActiveSlotId(slot.id);
                        const hrs = hoursForSlot(slot.startTime, slot.endTime);
                        setActiveHour(hrs[0] || null);
                      }}
                      onContextMenu={(e) => {
                        if (isStaff) return;
                        e.preventDefault();
                        if (
                          window.confirm(`Remove ${slot.label || "this slot"}?`)
                        ) {
                          const next = removeSlotFromPlan(dayPlan, slot.id);
                          markDirty(next);
                          if (activeSlotId === slot.id) {
                            const first = next.slots[0];
                            setActiveSlotId(first?.id || null);
                            const hrs = first
                              ? hoursForSlot(first.startTime, first.endTime)
                              : [];
                            setActiveHour(hrs[0] || null);
                          }
                        }
                      }}
                    >
                      <div className="om-slot-title">
                        {slot.label || `Slot ${idx + 1}`}
                      </div>
                      <div className="om-slot-time">
                        {formatSlotRange(slot.startTime, slot.endTime)}
                      </div>
                      <div className="om-slot-count">
                        {count} Staff Assigned
                      </div>
                    </div>
                  );
                })}
                {!isStaff ? (
                  <button
                    type="button"
                    className="om-slot-card om-slot-add"
                    onClick={() => setModal("addSlot")}
                  >
                    + Add Slot
                  </button>
                ) : null}
              </div>

              <div className="om-timeline">
                <span className="om-timeline-label">
                  {activeSlot
                    ? `Hours · ${activeSlot.label || "Slot"}`
                    : "Select a slot"}
                </span>
                {slotHours.map((hk) => {
                  const isChanged = isHourOverrideOfSlot(
                    dayPlan,
                    activeSlot,
                    hk
                  );
                  return (
                    <button
                      key={hk}
                      type="button"
                      className={`om-hour-chip ${
                        hk === activeHour ? "active" : ""
                      } ${isChanged ? "changed" : ""}`}
                      onClick={() => setActiveHour(hk)}
                    >
                      {formatHourLabel(hk)}
                      {isChanged ? " *" : ""}
                    </button>
                  );
                })}
              </div>

              <div className={`om-workspace ${isStaff ? "om-workspace-staff" : ""}`}>
                <aside className="om-panel">
                  <h3>{isStaff ? "Today’s roster" : "Available Staff"}</h3>
                  <input
                    className="om-search"
                    placeholder="Search by starting letters…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {!isStaff ? (
                    <div className="om-filter-tabs">
                      {["all", "available", "backup"].map((f) => (
                        <button
                          key={f}
                          type="button"
                          className={staffFilter === f ? "active" : ""}
                          onClick={() => setStaffFilter(f)}
                        >
                          {f === "all"
                            ? "All"
                            : f === "available"
                              ? "Available"
                              : "Backup"}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="om-staff-list">
                    {filteredStaff.map((s) => {
                      const st = statusOf(s.id);
                      const leave = st === "leave";
                      return (
                        <div
                          key={s.id}
                          className={`om-staff-card ${leave ? "unavailable" : ""} ${isStaff ? "om-staff-readonly" : ""}`}
                          draggable={!isStaff && !leave}
                          onDragStart={(e) => {
                            if (isStaff || leave) {
                              e.preventDefault();
                              return;
                            }
                            e.dataTransfer.setData("text/staff-id", s.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDoubleClick={() => {
                            if (!isStaff) openCapabilities(s.id);
                          }}
                          title={
                            isStaff
                              ? s.name
                              : "Drag to assign · Double-click capabilities"
                          }
                        >
                          <div className="om-avatar">{initials(s.name)}</div>
                          <div className="om-staff-meta">
                            <div className="om-staff-name">{s.name}</div>
                            <div className="om-staff-sub">
                              {s.qualification || "—"}
                            </div>
                            <div className="om-status">
                              <span className={`om-dot ${st}`} />
                              {st === "leave"
                                ? "On Leave"
                                : st === "backup"
                                  ? "Backup"
                                  : st === "assigned"
                                    ? "Assigned"
                                    : st === "off"
                                      ? "Not on Duty"
                                      : "Available"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {!isStaff ? (
                    <button
                      type="button"
                      className="om-btn"
                      style={{ width: "100%", marginTop: 10 }}
                      onClick={() => setModal("addStaff")}
                    >
                      + Add Staff
                    </button>
                  ) : null}
                </aside>

                <section className="om-map">
                  {!activeHour ? (
                    <p className="om-footer-hint">
                      {isStaff
                        ? "No slot/hour selected for this day."
                        : "Add a work slot, then select an hour to assign staff."}
                    </p>
                  ) : (
                    <>
                      <div className="om-layer-title">COMMAND</div>
                      <div className="om-layer-row">
                        {COMMAND_ROLES.map((key) => (
                          <RoleCard
                            key={key}
                            roleKey={key}
                            assignments={hourAssignments}
                            staffById={staffById}
                            onDrop={onDropRole}
                            onClear={clearAssignee}
                            readOnly={isStaff}
                          />
                        ))}
                      </div>

                      <div className="om-layer-title">SECOND LAYER</div>
                      <div className="om-layer-row">
                        {SECOND_LAYER_ROLES.map((key) => (
                          <RoleCard
                            key={key}
                            roleKey={key}
                            assignments={hourAssignments}
                            staffById={staffById}
                            onDrop={onDropRole}
                            onClear={clearAssignee}
                            readOnly={isStaff}
                          />
                        ))}
                      </div>

                      <div className="om-layer-title">DEPARTMENTS</div>
                      <div className="om-layer-row">
                        {MAIN_DEPT_KEYS.map((key) => (
                          <RoleCard
                            key={key}
                            roleKey={key}
                            assignments={hourAssignments}
                            staffById={staffById}
                            onDrop={onDropRole}
                            onClear={clearAssignee}
                            readOnly={isStaff}
                          />
                        ))}
                      </div>
                      <div className="om-layer-row">
                        {BOTTOM_DEPT_KEYS.map((key) => (
                          <RoleCard
                            key={key}
                            roleKey={key}
                            assignments={hourAssignments}
                            staffById={staffById}
                            onDrop={onDropRole}
                            onClear={clearAssignee}
                            readOnly={isStaff}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </section>

                <aside className="om-panel om-right">
                  <h3>Slot Summary</h3>
                  {[
                    ["Total Staff", summary.total],
                    ["Assigned", summary.assigned],
                    ["Available", summary.available],
                    ["Backup", summary.backup],
                    ["On Leave", summary.leave],
                    ["Not on Duty", summary.off],
                  ].map(([label, val]) => (
                    <div className="om-summary-row" key={label}>
                      <span>{label}</span>
                      <strong>{val}</strong>
                    </div>
                  ))}

                  <h3>Staff Status Legend</h3>
                  <div className="om-legend">
                    {[
                      ["assigned", "Assigned"],
                      ["available", "Available"],
                      ["backup", "Backup"],
                      ["leave", "On Leave"],
                      ["off", "Not on Duty"],
                    ].map(([k, label]) => (
                      <div key={k} className="om-status">
                        <span className={`om-dot ${k}`} /> {label}
                      </div>
                    ))}
                  </div>

                  <h3>On Leave ({leaveNow.length})</h3>
                  {leaveNow.length === 0 ? (
                    <div className="om-placeholder">No leave this hour</div>
                  ) : (
                    leaveNow.map((l, i) => (
                      <div className="om-leave-item" key={`${l.staffId}_${l.requestId || i}`}>
                        <strong>
                          {staffById[l.staffId]?.name ||
                            l.staffName ||
                            l.staffId}
                        </strong>
                        <span>
                          {getLeaveLabel([l], l.staffId, activeHour) ||
                            "Full Day"}
                        </span>
                      </div>
                    ))
                  )}

                  {isStaff ? (
                    <>
                      <h3>My Leave</h3>
                      {myLeave.length === 0 ? (
                        <div className="om-placeholder">No leave requests yet</div>
                      ) : (
                        myLeave.slice(0, 8).map((row) => (
                          <div className="om-leave-item" key={row.id}>
                            <strong>
                              {formatLeaveRange(row.fromDate, row.toDate)}
                            </strong>
                            <span className={`om-leave-status-pill ${row.status}`}>
                              {row.status}
                            </span>
                          </div>
                        ))
                      )}
                    </>
                  ) : null}

                  <h3>Quick Actions</h3>
                  <div className="om-quick">
                    <button
                      type="button"
                      className="om-btn"
                      onClick={() => setModal("addLeave")}
                    >
                      Apply Leave
                    </button>
                    {!isStaff ? (
                      <>
                        <button
                          type="button"
                          className="om-btn"
                          onClick={() => {
                            const first = staffList[0];
                            if (first) openCapabilities(first.id);
                            else alert("No staff loaded.");
                          }}
                        >
                          Manage Capabilities
                        </button>
                        <button
                          type="button"
                          className="om-btn"
                          onClick={() =>
                            window.print
                              ? window.print()
                              : alert("Use browser print")
                          }
                        >
                          Print / Export
                        </button>
                      </>
                    ) : null}
                  </div>
                </aside>
              </div>

              <p className="om-footer-hint">
                {isStaff
                  ? "Open Approved Leaves in the left menu to see who is already off, then apply if needed."
                  : "Slot assignments copy into every hour. Change a later hour (marked *) to override only that hour. Save Schedule when done."}
              </p>
            </>
          )}
        </div>
      </div>
      )}

      {modal === "addSlot" && !isStaff && (
        <AddSlotModal
          onClose={() => setModal(null)}
          onSave={({ startTime, endTime, label }) => {
            const next = addSlotToPlan(dayPlan, { startTime, endTime, label });
            markDirty(next);
            const slot = next.slots[next.slots.length - 1];
            setActiveSlotId(slot.id);
            const hrs = hoursForSlot(slot.startTime, slot.endTime);
            setActiveHour(hrs[0] || null);
            setModal(null);
          }}
        />
      )}

      {modal === "addLeave" && (
        <ApplyLeaveModal
          staffList={staffList}
          actor={actor}
          lockedStaffId={isStaff ? actor : null}
          onClose={() => setModal(null)}
          onSubmitted={() => {
            if (isStaff) setMyLeaveTick((n) => n + 1);
            else setView("leave");
          }}
        />
      )}

      {modal === "addStaff" && !isStaff && (
        <AddStaffModal
          onClose={() => setModal(null)}
          onSave={(person) => {
            markDirty({
              ...dayPlan,
              extraStaff: [...(dayPlan.extraStaff || []), person],
            });
            setModal(null);
          }}
        />
      )}

      {modal === "capabilities" && !isStaff && (
        <CapabilitiesModal
          staffList={staffList}
          staffId={capStaffId}
          draft={capDraft}
          setDraft={setCapDraft}
          setStaffId={async (id) => {
            setCapStaffId(id);
            const meta = await loadStaffMeta(id);
            setCapDraft({
              qualification: meta?.qualification || "",
              capabilities: (meta?.capabilities || []).join(", "),
            });
          }}
          onClose={() => setModal(null)}
          onSave={async () => {
            await saveStaffMeta(
              capStaffId,
              {
                qualification: capDraft.qualification,
                capabilities: capDraft.capabilities
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              },
              actor
            );
            setModal(null);
          }}
        />
      )}
    </div>
  );
}

function clearStaffFromAssignments(a, staffId) {
  const next = normalizeAssignments(a);
  for (const key of COMMAND_ROLES.concat(SECOND_LAYER_ROLES)) {
    next[key] = asStaffList(next[key]).filter((id) => id !== staffId);
  }
  for (const key of MAIN_DEPT_KEYS) {
    next[key] = {
      staff: asStaffList(next[key]?.staff).filter((id) => id !== staffId),
      validator: asStaffList(next[key]?.validator).filter(
        (id) => id !== staffId
      ),
    };
  }
  for (const key of BOTTOM_DEPT_KEYS) {
    next[key] = {
      staff: asStaffList(next[key]?.staff).filter((id) => id !== staffId),
    };
  }
  return next;
}

function RoleCard({
  roleKey,
  assignments,
  staffById,
  onDrop,
  onClear,
  readOnly = false,
}) {
  const cfg = ROLE_CONFIG[roleKey];
  const [over, setOver] = useState(null);

  if (!cfg) return null;

  const renderSlot = (field, label) => {
    const dropKey = `${roleKey}:${field}`;
    const list = getRoleStaffList(assignments, roleKey, field);
    const content =
      list.length === 0 ? (
        <span className="om-placeholder">
          {readOnly ? "Unassigned" : "Drop staff"}
        </span>
      ) : (
        list.map((id) => (
          <div className="om-assignee" key={id}>
            <span>✓ {staffById[id]?.name || id}</span>
            {!readOnly ? (
              <button
                type="button"
                onClick={() => onClear(roleKey, field, id)}
              >
                ×
              </button>
            ) : null}
          </div>
        ))
      );

    return (
      <div
        className={`om-role-slot ${!readOnly && over === dropKey ? "drop-over" : ""}`}
        onDragOver={(e) => {
          if (readOnly) return;
          e.preventDefault();
          setOver(dropKey);
        }}
        onDragLeave={() => setOver(null)}
        onDrop={(e) => {
          if (readOnly) return;
          setOver(null);
          onDrop(e, roleKey, field);
        }}
      >
        <label>{label}</label>
        {content}
      </div>
    );
  };

  return (
    <div className={`om-role-card ${over ? "drop-over" : ""}`}>
      <h4>{cfg.label}</h4>
      {cfg.hasValidator ? (
        <>
          {renderSlot("staff", "Incharge / Staff")}
          {renderSlot("validator", "Validator")}
        </>
      ) : (
        renderSlot("staff", "Staff")
      )}
    </div>
  );
}

function AddSlotModal({ onClose, onSave }) {
  const [startTime, setStartTime] = useState("11:00");
  const [endTime, setEndTime] = useState("17:00");
  const [label, setLabel] = useState("");
  return (
    <div className="om-modal-backdrop" onClick={onClose}>
      <div className="om-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add Work Slot</h2>
        <label>Label</label>
        <input
          value={label}
          placeholder="Slot 1"
          onChange={(e) => setLabel(e.target.value)}
        />
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
        <div className="om-modal-actions">
          <button type="button" className="om-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="om-btn om-btn-primary"
            onClick={() => onSave({ startTime, endTime, label })}
          >
            Add Slot
          </button>
        </div>
      </div>
    </div>
  );
}

function AddStaffModal({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [qualification, setQualification] = useState("");
  return (
    <div className="om-modal-backdrop" onClick={onClose}>
      <div className="om-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add Staff</h2>
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <label>Qualification</label>
        <input
          value={qualification}
          onChange={(e) => setQualification(e.target.value)}
        />
        <div className="om-modal-actions">
          <button type="button" className="om-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="om-btn om-btn-primary"
            disabled={!name.trim()}
            onClick={() =>
              onSave({
                id: name.trim(),
                name: name.trim(),
                qualification: qualification.trim(),
                onDutyDefault: true,
              })
            }
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function CapabilitiesModal({
  staffList,
  staffId,
  draft,
  setDraft,
  setStaffId,
  onClose,
  onSave,
}) {
  return (
    <div className="om-modal-backdrop" onClick={onClose}>
      <div className="om-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Manage Capabilities</h2>
        <label>Staff</label>
        <select
          value={staffId || ""}
          onChange={(e) => setStaffId(e.target.value)}
        >
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label>Qualification</label>
        <input
          value={draft.qualification}
          onChange={(e) =>
            setDraft((d) => ({ ...d, qualification: e.target.value }))
          }
        />
        <label>Capabilities (comma-separated)</label>
        <input
          value={draft.capabilities}
          placeholder="Biochemistry, Validation, …"
          onChange={(e) =>
            setDraft((d) => ({ ...d, capabilities: e.target.value }))
          }
        />
        <div className="om-modal-actions">
          <button type="button" className="om-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="om-btn om-btn-primary" onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
