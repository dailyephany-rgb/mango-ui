/**
 * Operation Map Firestore persistence.
 *
 * Collection: operation_map_days/{YYYY-MM-DD}
 * Optional:   operation_map_staff_meta/{staffId}
 */
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { trackedGetDoc as getDoc } from "../shared/firestore/trackedFirestore.js";
import { db } from "../firebaseConfig.js";
import {
  createEmptyDayPlan,
  emptyAssignments,
  hoursForSlot,
  newSlotId,
  COMMAND_ROLES,
  SECOND_LAYER_ROLES,
  MAIN_DEPT_KEYS,
  BOTTOM_DEPT_KEYS,
} from "./roleConfig.js";

const DAYS = "operation_map_days";
const STAFF_META = "operation_map_staff_meta";

export function dayDocId(dateStr) {
  return String(dateStr || "").trim();
}

export async function loadDayPlan(dateStr) {
  const id = dayDocId(dateStr);
  if (!id) return createEmptyDayPlan(dateStr);

  const snap = await getDoc(doc(db, DAYS, id));
  if (!snap.exists()) {
    return createEmptyDayPlan(dateStr);
  }
  const data = snap.data() || {};
  return {
    date: id,
    slots: Array.isArray(data.slots) ? data.slots : [],
    hours: data.hours && typeof data.hours === "object" ? data.hours : {},
    leave: Array.isArray(data.leave) ? data.leave : [],
    extraStaff: Array.isArray(data.extraStaff) ? data.extraStaff : [],
    updatedAt: data.updatedAt || null,
    updatedBy: data.updatedBy || null,
  };
}

export async function saveDayPlan(dayPlan, actor) {
  const id = dayDocId(dayPlan?.date);
  if (!id) throw new Error("Missing date for Operation Map day");

  const payload = {
    date: id,
    slots: dayPlan.slots || [],
    hours: dayPlan.hours || {},
    leave: dayPlan.leave || [],
    extraStaff: dayPlan.extraStaff || [],
    updatedAt: serverTimestamp(),
    updatedBy: actor || "Unknown",
  };

  await setDoc(doc(db, DAYS, id), payload, { merge: true });
  return payload;
}

export async function loadStaffMeta(staffId) {
  if (!staffId) return null;
  const snap = await getDoc(doc(db, STAFF_META, staffId));
  if (!snap.exists()) {
    return { id: staffId, capabilities: [], qualification: "" };
  }
  return { id: staffId, ...snap.data() };
}

export async function saveStaffMeta(staffId, meta, actor) {
  if (!staffId) return;
  await setDoc(
    doc(db, STAFF_META, staffId),
    {
      ...meta,
      id: staffId,
      updatedAt: serverTimestamp(),
      updatedBy: actor || "Unknown",
    },
    { merge: true }
  );
}

export function ensureHoursForSlots(dayPlan) {
  const next = {
    ...dayPlan,
    hours: { ...(dayPlan.hours || {}) },
  };
  const keep = new Set();

  (dayPlan.slots || []).forEach((slot) => {
    hoursForSlot(slot.startTime, slot.endTime).forEach((hourKey) => {
      keep.add(hourKey);
      if (!next.hours[hourKey]) {
        next.hours[hourKey] = {
          slotId: slot.id,
          assignments: emptyAssignments(),
        };
      } else {
        next.hours[hourKey] = {
          ...next.hours[hourKey],
          slotId: slot.id,
          assignments: next.hours[hourKey].assignments || emptyAssignments(),
        };
      }
    });
  });

  Object.keys(next.hours).forEach((hk) => {
    if (!keep.has(hk)) delete next.hours[hk];
  });

  return next;
}

export function addSlotToPlan(dayPlan, { startTime, endTime, label }) {
  const slot = {
    id: newSlotId(),
    label: label || `Slot ${(dayPlan.slots?.length || 0) + 1}`,
    startTime,
    endTime,
  };
  return ensureHoursForSlots({
    ...dayPlan,
    slots: [...(dayPlan.slots || []), slot],
  });
}

export function removeSlotFromPlan(dayPlan, slotId) {
  return ensureHoursForSlots({
    ...dayPlan,
    slots: (dayPlan.slots || []).filter((s) => s.id !== slotId),
  });
}

export function cloneDayPlan(source, targetDate) {
  const clonedHours = {};
  Object.entries(source.hours || {}).forEach(([hk, val]) => {
    clonedHours[hk] = {
      slotId: val.slotId,
      assignments: JSON.parse(
        JSON.stringify(val.assignments || emptyAssignments())
      ),
    };
  });
  return {
    date: targetDate,
    slots: (source.slots || []).map((s) => ({ ...s })),
    hours: clonedHours,
    leave: (source.leave || []).map((l) => ({ ...l })),
    extraStaff: (source.extraStaff || []).map((s) => ({ ...s })),
    updatedAt: null,
    updatedBy: null,
  };
}

export function shiftDateStr(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Remove a staff member from every hour assignment on a day plan.
 */
export function stripStaffFromDayPlan(dayPlan, staffId) {
  if (!dayPlan || !staffId) return dayPlan;
  const hours = {};
  Object.entries(dayPlan.hours || {}).forEach(([hk, val]) => {
    const a = JSON.parse(
      JSON.stringify(val?.assignments || emptyAssignments())
    );
    for (const key of COMMAND_ROLES.concat(SECOND_LAYER_ROLES)) {
      if (a[key] === staffId) a[key] = null;
    }
    for (const key of MAIN_DEPT_KEYS) {
      if (a[key]?.staff === staffId) a[key].staff = null;
      if (a[key]?.validator === staffId) a[key].validator = null;
    }
    for (const key of BOTTOM_DEPT_KEYS) {
      a[key] = {
        staff: (a[key]?.staff || []).filter((id) => id !== staffId),
      };
    }
    hours[hk] = { ...val, assignments: a };
  });
  return { ...dayPlan, hours };
}
