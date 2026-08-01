import { collection, query, where, orderBy, Timestamp } from "firebase/firestore";
import { db } from "../../firebaseConfig.js";
import { localDayStart, localDayEndExclusive } from "../utils/dates.js";

/**
 * Scoped listen query: timePrinted in local calendar [from, to] (inclusive days).
 * dateRange: { from: "YYYY-MM-DD", to: "YYYY-MM-DD" }
 * Returns null if bounds are missing/invalid.
 */
export function scopedTimePrintedQuery(collectionName, dateRange) {
  const start = localDayStart(dateRange?.from);
  const endExclusive = localDayEndExclusive(dateRange?.to);
  if (!start || !endExclusive) return null;

  const q = query(
    collection(db, collectionName),
    where("timePrinted", ">=", Timestamp.fromDate(start)),
    where("timePrinted", "<", Timestamp.fromDate(endExclusive)),
    orderBy("timePrinted", "asc")
  );
  // Passive perf tag — ignored by Firestore
  try {
    q.__mangoCollection = collectionName;
  } catch {
    /* ignore */
  }
  return q;
}
