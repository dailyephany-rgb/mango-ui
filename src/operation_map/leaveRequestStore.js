/**
 * Operation Map leave requests (pending → approved/rejected).
 * Collection: operation_map_leave_requests/{id}
 */
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { trackedGetDocs as getDocs } from "../shared/firestore/trackedFirestore.js";
import { db } from "../firebaseConfig.js";
import {
  loadDayPlan,
  saveDayPlan,
  shiftDateStr,
  stripStaffFromDayPlan,
} from "./operationMapStore.js";

const LEAVE_REQUESTS = "operation_map_leave_requests";

function eachDateInclusive(fromDate, toDate) {
  if (!fromDate || !toDate || fromDate > toDate) return [];
  const out = [];
  let cur = fromDate;
  let guard = 0;
  while (cur <= toDate && guard < 400) {
    out.push(cur);
    cur = shiftDateStr(cur, 1);
    guard += 1;
  }
  return out;
}

function normalizeRequest(id, data = {}) {
  return {
    id,
    staffId: data.staffId || "",
    staffName: data.staffName || data.staffId || "",
    fromDate: data.fromDate || "",
    toDate: data.toDate || data.fromDate || "",
    type: data.type === "partial" ? "partial" : "full",
    startTime: data.startTime || null,
    endTime: data.endTime || null,
    reason: data.reason || "",
    status: data.status || "pending",
    requestedBy: data.requestedBy || "",
    requestedAt: data.requestedAt || null,
    reviewedBy: data.reviewedBy || "",
    reviewedAt: data.reviewedAt || null,
    reviewNote: data.reviewNote || "",
  };
}

/**
 * @param {object} input
 * @param {string} actor
 */
export async function createLeaveRequest(input, actor) {
  const fromDate = String(input.fromDate || "").trim();
  const toDate = String(input.toDate || input.fromDate || "").trim();
  if (!input.staffId || !fromDate || !toDate) {
    throw new Error("Staff and date range are required");
  }
  if (toDate < fromDate) {
    throw new Error("End date must be on or after start date");
  }

  const payload = {
    staffId: String(input.staffId).trim(),
    staffName: String(input.staffName || input.staffId).trim(),
    fromDate,
    toDate,
    type: input.type === "partial" ? "partial" : "full",
    startTime: input.type === "partial" ? input.startTime || null : null,
    endTime: input.type === "partial" ? input.endTime || null : null,
    reason: String(input.reason || "").trim(),
    status: "pending",
    requestedBy: actor || "Unknown",
    requestedAt: serverTimestamp(),
    reviewedBy: "",
    reviewedAt: null,
    reviewNote: "",
  };

  const ref = await addDoc(collection(db, LEAVE_REQUESTS), payload);
  return normalizeRequest(ref.id, payload);
}

export async function listLeaveRequestsByStatus(status) {
  const q = query(
    collection(db, LEAVE_REQUESTS),
    where("status", "==", status),
    orderBy("requestedAt", "desc")
  );
  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => normalizeRequest(d.id, d.data()));
  } catch (err) {
    // Fallback if composite index missing: filter without orderBy
    console.warn("leave request ordered query failed, falling back", err);
    const snap = await getDocs(
      query(collection(db, LEAVE_REQUESTS), where("status", "==", status))
    );
    const rows = snap.docs.map((d) => normalizeRequest(d.id, d.data()));
    return rows.sort((a, b) => {
      const ta = a.requestedAt?.seconds || a.requestedAt?.toMillis?.() || 0;
      const tb = b.requestedAt?.seconds || b.requestedAt?.toMillis?.() || 0;
      return tb - ta;
    });
  }
}

/**
 * All leave requests for one staff member (any status), newest first.
 */
export async function listLeaveRequestsForStaff(staffId) {
  const id = String(staffId || "").trim();
  if (!id) return [];
  try {
    const snap = await getDocs(
      query(
        collection(db, LEAVE_REQUESTS),
        where("staffId", "==", id),
        orderBy("requestedAt", "desc")
      )
    );
    return snap.docs.map((d) => normalizeRequest(d.id, d.data()));
  } catch (err) {
    console.warn("staff leave ordered query failed, falling back", err);
    const snap = await getDocs(
      query(collection(db, LEAVE_REQUESTS), where("staffId", "==", id))
    );
    const rows = snap.docs.map((d) => normalizeRequest(d.id, d.data()));
    return rows.sort((a, b) => {
      const ta = a.requestedAt?.seconds || a.requestedAt?.toMillis?.() || 0;
      const tb = b.requestedAt?.seconds || b.requestedAt?.toMillis?.() || 0;
      return tb - ta;
    });
  }
}

/**
 * Approved leave covering a calendar date (fromDate <= date <= toDate).
 */
export async function loadApprovedLeaveForDate(dateStr) {
  if (!dateStr) return [];
  const snap = await getDocs(
    query(
      collection(db, LEAVE_REQUESTS),
      where("status", "==", "approved")
    )
  );
  return snap.docs
    .map((d) => normalizeRequest(d.id, d.data()))
    .filter((r) => r.fromDate <= dateStr && r.toDate >= dateStr);
}

/**
 * Map approved requests into the same shape as dayPlan.leave entries.
 */
export function approvedRequestsToLeaveEntries(requests) {
  return (requests || []).map((r) => ({
    staffId: r.staffId,
    staffName: r.staffName,
    type: r.type,
    startTime: r.type === "partial" ? r.startTime : null,
    endTime: r.type === "partial" ? r.endTime : null,
    fromDate: r.fromDate,
    toDate: r.toDate,
    requestId: r.id,
    source: "approved_request",
  }));
}

/**
 * Reject a pending leave request.
 */
export async function rejectLeaveRequest(requestId, actor, reviewNote = "") {
  if (!requestId) throw new Error("Missing leave request id");
  await updateDoc(doc(db, LEAVE_REQUESTS, requestId), {
    status: "rejected",
    reviewedBy: actor || "Unknown",
    reviewedAt: serverTimestamp(),
    reviewNote: String(reviewNote || "").trim(),
  });
}

/**
 * Approve a leave request and strip the staff from any existing day plans
 * in the leave date range.
 */
export async function approveLeaveRequest(request, actor, reviewNote = "") {
  if (!request?.id) throw new Error("Missing leave request");
  const fromDate = request.fromDate;
  const toDate = request.toDate || request.fromDate;
  const staffId = request.staffId;
  if (!staffId || !fromDate || !toDate) {
    throw new Error("Leave request is missing staff or dates");
  }

  await updateDoc(doc(db, LEAVE_REQUESTS, request.id), {
    status: "approved",
    reviewedBy: actor || "Unknown",
    reviewedAt: serverTimestamp(),
    reviewNote: String(reviewNote || "").trim(),
  });

  const dates = eachDateInclusive(fromDate, toDate);
  for (const dateStr of dates) {
    const plan = await loadDayPlan(dateStr);
    const hasContent =
      (plan.slots || []).length > 0 ||
      Object.keys(plan.hours || {}).length > 0;
    if (!hasContent) continue;
    const stripped = stripStaffFromDayPlan(plan, staffId);
    await saveDayPlan(stripped, actor);
  }

  return normalizeRequest(request.id, {
    ...request,
    status: "approved",
    reviewedBy: actor || "Unknown",
    reviewNote: String(reviewNote || "").trim(),
  });
}
