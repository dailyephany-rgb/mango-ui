/**
 * Operation Map — stable role keys for planned staffing (audit-ready later).
 */

export const ROLE_CONFIG = {
  mangoOperator: {
    key: "mangoOperator",
    label: "Mango Operator",
    layer: "command",
    maxAssignees: 1,
    hasValidator: false,
  },
  secondInCommand: {
    key: "secondInCommand",
    label: "Second in Command",
    layer: "command",
    maxAssignees: 1,
    hasValidator: false,
  },
  phlebotomist: {
    key: "phlebotomist",
    label: "Phlebotomist",
    layer: "second",
    maxAssignees: 1,
    hasValidator: false,
  },
  thirdFloor: {
    key: "thirdFloor",
    label: "Third Floor",
    layer: "second",
    maxAssignees: 1,
    hasValidator: false,
  },
  biochemistry: {
    key: "biochemistry",
    label: "Biochemistry",
    layer: "department",
    maxAssignees: 1,
    hasValidator: true,
  },
  hormones: {
    key: "hormones",
    label: "Hormones",
    layer: "department",
    maxAssignees: 1,
    hasValidator: true,
  },
  haematology: {
    key: "haematology",
    label: "Haematology",
    layer: "department",
    maxAssignees: 1,
    hasValidator: true,
  },
  coagulation: {
    key: "coagulation",
    label: "Coagulation",
    layer: "department",
    maxAssignees: 1,
    hasValidator: true,
  },
  backroom: {
    key: "backroom",
    label: "Backroom",
    layer: "department",
    maxAssignees: 1,
    hasValidator: true,
  },
  backup: {
    key: "backup",
    label: "Backup",
    layer: "department",
    maxAssignees: 8,
    hasValidator: false,
    multi: true,
  },
  insideLab: {
    key: "insideLab",
    label: "Inside Lab",
    layer: "department",
    maxAssignees: 4,
    hasValidator: false,
    multi: true,
  },
  outsource: {
    key: "outsource",
    label: "Outsource",
    layer: "department",
    maxAssignees: 4,
    hasValidator: false,
    multi: true,
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

export function emptyAssignments() {
  const a = {
    mangoOperator: null,
    secondInCommand: null,
    phlebotomist: null,
    thirdFloor: null,
  };
  for (const key of MAIN_DEPT_KEYS) {
    a[key] = { staff: null, validator: null };
  }
  for (const key of BOTTOM_DEPT_KEYS) {
    a[key] = { staff: [] };
  }
  return a;
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
    if (assignments[key]) into.add(assignments[key]);
  }
  for (const key of MAIN_DEPT_KEYS) {
    const d = assignments[key];
    if (d?.staff) into.add(d.staff);
    if (d?.validator) into.add(d.validator);
  }
  for (const key of BOTTOM_DEPT_KEYS) {
    (assignments[key]?.staff || []).forEach((id) => into.add(id));
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
    if (assignments[key] === staffId) return { roleKey: key, field: "staff" };
  }
  for (const key of MAIN_DEPT_KEYS) {
    const d = assignments[key] || {};
    if (d.staff === staffId) return { roleKey: key, field: "staff" };
    if (d.validator === staffId) return { roleKey: key, field: "validator" };
  }
  for (const key of BOTTOM_DEPT_KEYS) {
    if ((assignments[key]?.staff || []).includes(staffId)) {
      return { roleKey: key, field: "staff" };
    }
  }
  return null;
}
