/**
 * Operation Map — stable role keys for planned staffing (audit-ready later).
 * All role slots hold string[] of staff ids (legacy string|null normalized on load).
 */

export const ROLE_CONFIG = {
  mangoOperator: {
    key: "mangoOperator",
    label: "Mango Operator",
    layer: "command",
    maxAssignees: 8,
    hasValidator: false,
  },
  secondInCommand: {
    key: "secondInCommand",
    label: "Second in Command",
    layer: "command",
    maxAssignees: 8,
    hasValidator: false,
  },
  phlebotomist: {
    key: "phlebotomist",
    label: "Phlebotomist",
    layer: "second",
    maxAssignees: 8,
    hasValidator: false,
  },
  thirdFloor: {
    key: "thirdFloor",
    label: "Third Floor",
    layer: "second",
    maxAssignees: 8,
    hasValidator: false,
  },
  biochemistry: {
    key: "biochemistry",
    label: "Biochemistry",
    layer: "department",
    maxAssignees: 8,
    hasValidator: true,
  },
  hormones: {
    key: "hormones",
    label: "Hormones",
    layer: "department",
    maxAssignees: 8,
    hasValidator: true,
  },
  haematology: {
    key: "haematology",
    label: "Haematology",
    layer: "department",
    maxAssignees: 8,
    hasValidator: true,
  },
  coagulation: {
    key: "coagulation",
    label: "Coagulation",
    layer: "department",
    maxAssignees: 8,
    hasValidator: true,
  },
  backroom: {
    key: "backroom",
    label: "Backroom",
    layer: "department",
    maxAssignees: 8,
    hasValidator: true,
  },
  backup: {
    key: "backup",
    label: "Backup",
    layer: "department",
    maxAssignees: 8,
    hasValidator: false,
  },
  insideLab: {
    key: "insideLab",
    label: "Inside Lab",
    layer: "department",
    maxAssignees: 8,
    hasValidator: false,
  },
  outsource: {
    key: "outsource",
    label: "Outsource",
    layer: "department",
    maxAssignees: 8,
    hasValidator: false,
  },
};

export const COMMAND_ROLES = ["mangoOperator", "secondInCommand"];
export const SECOND_LAYER_ROLES = ["phlebotomist", "thirdFloor"];
export const MAIN_DEPT_KEYS = [
  "biochemistry",
  "hormones",
  "haematology",
  "coagulation",
  "backroom",
];
export const BOTTOM_DEPT_KEYS = ["backup", "insideLab", "outsource"];

/** Coerce legacy string|null or array into a clean string[]. */
export function asStaffList(value) {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v || "").trim()).filter(Boolean);
  }
  const s = String(value).trim();
  return s ? [s] : [];
}

export function emptyAssignments() {
  const a = {};
  for (const key of COMMAND_ROLES.concat(SECOND_LAYER_ROLES)) {
    a[key] = [];
  }
  for (const key of MAIN_DEPT_KEYS) {
    a[key] = { staff: [], validator: [] };
  }
  for (const key of BOTTOM_DEPT_KEYS) {
    a[key] = { staff: [] };
  }
  return a;
}

/** Normalize any saved hour assignments to the multi-assignee shape. */
export function normalizeAssignments(raw) {
  const base = emptyAssignments();
  if (!raw || typeof raw !== "object") return base;

  for (const key of COMMAND_ROLES.concat(SECOND_LAYER_ROLES)) {
    base[key] = asStaffList(raw[key]);
  }
  for (const key of MAIN_DEPT_KEYS) {
    const d = raw[key];
    if (d && typeof d === "object" && !Array.isArray(d)) {
      base[key] = {
        staff: asStaffList(d.staff),
        validator: asStaffList(d.validator),
      };
    } else {
      base[key] = { staff: asStaffList(d), validator: [] };
    }
  }
  for (const key of BOTTOM_DEPT_KEYS) {
    const d = raw[key];
    if (d && typeof d === "object" && !Array.isArray(d)) {
      base[key] = { staff: asStaffList(d.staff) };
    } else {
      base[key] = { staff: asStaffList(d) };
    }
  }
  return base;
}

export function getRoleStaffList(assignments, roleKey, field = "staff") {
  const cfg = ROLE_CONFIG[roleKey];
  if (!cfg || !assignments) return [];
  if (cfg.hasValidator || BOTTOM_DEPT_KEYS.includes(roleKey)) {
    return asStaffList(assignments[roleKey]?.[field || "staff"]);
  }
  return asStaffList(assignments[roleKey]);
}

export function timeToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function minutesToTime(mins) {
  const m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function formatHourLabel(hhmm) {
  const mins = timeToMinutes(hhmm);
  if (mins == null) return hhmm;
  let h = Math.floor(mins / 60);
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h} ${suffix}`;
}

export function formatSlotRange(startTime, endTime) {
  return `${formatHourLabel(startTime)} - ${formatHourLabel(endTime)}`;
}

export function hoursForSlot(startTime, endTime) {
  const start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);
  if (start == null || end == null) return [];
  if (end <= start) end += 24 * 60;
  const hours = [];
  for (let t = start; t < end; t += 60) {
    hours.push(minutesToTime(t % (24 * 60)));
  }
  return hours;
}

export function newSlotId() {
  return `slot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createEmptyDayPlan(date) {
  return {
    date,
    slots: [],
    hours: {},
    leave: [],
    extraStaff: [],
    updatedAt: null,
    updatedBy: null,
  };
}

export function collectAssignmentStaff(assignments, into = new Set()) {
  if (!assignments) return into;
  for (const key of COMMAND_ROLES.concat(SECOND_LAYER_ROLES)) {
    asStaffList(assignments[key]).forEach((id) => into.add(id));
  }
  for (const key of MAIN_DEPT_KEYS) {
    const d = assignments[key] || {};
    asStaffList(d.staff).forEach((id) => into.add(id));
    asStaffList(d.validator).forEach((id) => into.add(id));
  }
  for (const key of BOTTOM_DEPT_KEYS) {
    asStaffList(assignments[key]?.staff).forEach((id) => into.add(id));
  }
  return into;
}

export function uniqueAssignedStaffIds(hoursObj, slotId = null) {
  const ids = new Set();
  Object.values(hoursObj || {}).forEach((h) => {
    if (slotId && h.slotId !== slotId) return;
    collectAssignmentStaff(h.assignments, ids);
  });
  return ids;
}

export function staffAssignedInHour(assignments, staffId) {
  if (!staffId || !assignments) return null;
  for (const key of COMMAND_ROLES.concat(SECOND_LAYER_ROLES)) {
    if (asStaffList(assignments[key]).includes(staffId)) {
      return { roleKey: key, field: "staff" };
    }
  }
  for (const key of MAIN_DEPT_KEYS) {
    const d = assignments[key] || {};
    if (asStaffList(d.staff).includes(staffId)) {
      return { roleKey: key, field: "staff" };
    }
    if (asStaffList(d.validator).includes(staffId)) {
      return { roleKey: key, field: "validator" };
    }
  }
  for (const key of BOTTOM_DEPT_KEYS) {
    if (asStaffList(assignments[key]?.staff).includes(staffId)) {
      return { roleKey: key, field: "staff" };
    }
  }
  return null;
}
