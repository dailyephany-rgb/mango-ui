import {
  collection,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../firebaseConfig.js";
import { istDayStart, istDayEndExclusive } from "../utils/dates.js";

/**
 * Scoped listen: Timestamp field in IST calendar [from, to] (inclusive days).
 * dateRange: { from: "YYYY-MM-DD", to: "YYYY-MM-DD" }
 */
export function scopedTimestampRangeQuery(
  collectionName,
  field,
  dateRange,
  direction = "desc"
) {
  const start = istDayStart(dateRange?.from);
  const endExclusive = istDayEndExclusive(dateRange?.to);
  if (!start || !endExclusive) return null;

  const q = query(
    collection(db, collectionName),
    where(field, ">=", Timestamp.fromDate(start)),
    where(field, "<", Timestamp.fromDate(endExclusive)),
    orderBy(field, direction)
  );
  try {
    q.__mangoCollection = collectionName;
  } catch {
    /* ignore */
  }
  return q;
}
