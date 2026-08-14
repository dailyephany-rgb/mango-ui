/**
 * Collect critical_alerts rows for the Critical Report PDF.
 * Same query/filter spirit as CriticalAlertDashboard (Pending + Reported).
 */
import {
  collection,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../firebaseConfig.js";
import { trackedOnSnapshot as onSnapshot } from "../../shared/firestore/trackedFirestore.js";
import {
  getLocalDateString,
  parseDateField,
  toLocalDateString,
  localDayStart,
  localDayEndExclusive,
} from "../../shared/utils/dates.js";

const SNAPSHOT_TIMEOUT_MS = 90_000;
const SETTLE_MS = 350;

function criticalTimeDiff(flaggedAt, reportedAt) {
  const start = parseDateField(flaggedAt);
  const end = parseDateField(reportedAt);
  if (!start || !end) return "-";
  const diffInMins = Math.floor((end - start) / (1000 * 60));
  if (diffInMins < 60) return `${diffInMins}m`;
  const hours = Math.floor(diffInMins / 60);
  const mins = diffInMins % 60;
  return `${hours}h ${mins}m`;
}

function testsCell(tests) {
  if (Array.isArray(tests)) return tests.join(", ") || "—";
  if (tests == null || tests === "") return "—";
  return String(tests);
}

function crossCheckLabel(alert) {
  if (alert.crossChecked) return "✓ Crosschecked";
  if (alert.status === "Reported") return "—";
  return "Awaiting Report";
}

function actionLabel(alert) {
  if (alert.status === "Reported") return "✓ Reported";
  return "Pending";
}

/**
 * @param {object} alert
 */
export function normalizeCriticalRow(alert) {
  const age = alert.age ?? "";
  const gender = alert.gender ?? "";
  const ageSex =
    age !== "" || gender !== ""
      ? `${age}${age !== "" && gender !== "" ? "/" : ""}${gender}`
      : "—";

  return {
    regNo: alert.regNo || "—",
    diagnosticNo: alert.diagnosticNo || "—",
    name: alert.name || "—",
    dept: alert.dept || "—",
    ageSex,
    doctor: alert.doctor || "—",
    tests: testsCell(alert.selectedTests),
    criticalFinding: alert.criticalParameter || "—",
    reportedBy: alert.reportedBy || "—",
    reportedTo: alert.reportedTo || "—",
    commVia: alert.communicatedVia || "—",
    timeTaken: criticalTimeDiff(alert.flaggedAt, alert.reportedAt),
    crossCheckedBy: alert.crossCheckedBy || "—",
    crossCheck: crossCheckLabel(alert),
    action: actionLabel(alert),
    status: alert.status || "—",
  };
}

function fetchCriticalAlertsOnce(dateRange) {
  const fromStr = dateRange?.from || getLocalDateString();
  const toStr = dateRange?.to || getLocalDateString();
  const start = localDayStart(fromStr);
  const endExclusive = localDayEndExclusive(toStr);

  if (!start || !endExclusive) {
    return Promise.resolve([]);
  }

  const startTs = Timestamp.fromDate(start);
  const endTs = Timestamp.fromDate(endExclusive);
  const q = query(
    collection(db, "critical_alerts"),
    where("flaggedAt", ">=", startTs),
    where("flaggedAt", "<", endTs),
    orderBy("flaggedAt", "asc")
  );

  return new Promise((resolve, reject) => {
    let done = false;
    let unsub = null;
    let latest = null;
    let settleTimer = null;

    const finish = (rows, err) => {
      if (done) return;
      done = true;
      clearTimeout(hardTimer);
      clearTimeout(settleTimer);
      try {
        if (typeof unsub === "function") unsub();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(rows || []);
    };

    const hardTimer = setTimeout(() => {
      if (latest != null) finish(latest);
      else finish(null, new Error("Timed out waiting for critical alerts"));
    }, SNAPSHOT_TIMEOUT_MS);

    try {
      unsub = onSnapshot(
        q,
        (snapshot) => {
          latest = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          clearTimeout(settleTimer);
          settleTimer = setTimeout(() => finish(latest), SETTLE_MS);
        },
        (err) => finish(null, err)
      );
    } catch (err) {
      finish(null, err);
    }
  });
}

/**
 * @param {{ dateRange?: { from?: string, to?: string }, source?: string }} opts
 * @returns {Promise<{ rows: object[], pendingCount: number, reportedCount: number }>}
 */
export async function collectCriticalData({
  dateRange,
  source = "All",
} = {}) {
  const fromStr = dateRange?.from || getLocalDateString();
  const toStr = dateRange?.to || getLocalDateString();
  const alerts = await fetchCriticalAlertsOnce(dateRange);

  const filtered = alerts
    .filter((a) => {
      if (a.status !== "Pending" && a.status !== "Reported") return false;
      if (source && source !== "All" && a.source !== source) return false;

      const pDate = parseDateField(a.timePrinted || a.flaggedAt);
      if (pDate) {
        const entryDateStr = toLocalDateString(pDate);
        if (fromStr && entryDateStr < fromStr) return false;
        if (toStr && entryDateStr > toStr) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const dateA = parseDateField(a.timePrinted || a.flaggedAt) || 0;
      const dateB = parseDateField(b.timePrinted || b.flaggedAt) || 0;
      return dateA - dateB;
    });

  const rows = filtered.map(normalizeCriticalRow);
  const pendingCount = filtered.filter((a) => a.status === "Pending").length;
  const reportedCount = filtered.filter((a) => a.status === "Reported").length;

  return { rows, pendingCount, reportedCount };
}
