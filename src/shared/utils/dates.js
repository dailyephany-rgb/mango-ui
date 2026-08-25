/**
 * Shared date helpers — behavior-preserving extracts from department registers.
 */

/** Local calendar date as YYYY-MM-DD (matches existing filter default today logic). */
export function getLocalDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** IST calendar date as YYYY-MM-DD (en-CA + Asia/Kolkata). */
export function getISTDateString(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** IST calendar day start (00:00 Asia/Kolkata) for a YYYY-MM-DD string. */
export function istDayStart(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const d = new Date(`${dateStr}T00:00:00+05:30`);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Exclusive IST end bound: start of the day after dateStr.
 * Use with field >= start && field < endExclusive.
 */
export function istDayEndExclusive(dateStr) {
  const start = istDayStart(dateStr);
  if (!start) return null;
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/** Parse a Firestore Timestamp, seconds object, Date, or date string. */
export function parseDateField(field) {
  if (!field) return null;
  if (typeof field === "object" && typeof field.toDate === "function") {
    return field.toDate();
  }
  if (typeof field === "string" || field instanceof Date) {
    const d = new Date(field);
    return isNaN(d) ? null : d;
  }
  if (typeof field === "object" && typeof field.seconds === "number") {
    return new Date(field.seconds * 1000);
  }
  return null;
}

/** Display master_register.timeCollected in department tables (or "—"). */
export function formatTimeCollected(ts) {
  const date = parseDateField(ts);
  if (!date || isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const DEFAULT_ENTRY_DATE_FIELDS = [
  "timePrinted",
  "timeCollected",
  "scannedTime",
  "savedTime",
  "createdAt",
];

/** Pick first parseable date from known entry fields (department register pattern). */
export function parseEntryDate(entry, fields = DEFAULT_ENTRY_DATE_FIELDS) {
  if (!entry) return null;
  for (const key of fields) {
    const d = parseDateField(entry[key]);
    if (d) return d;
  }
  return null;
}

/** Format a Date as local YYYY-MM-DD for date-filter comparisons. */
export function toLocalDateString(date) {
  if (!date || isNaN(date)) return null;
  return getLocalDateString(date);
}

/**
 * Local calendar day start (00:00:00.000) for a YYYY-MM-DD string.
 * Matches register date-bar filtering via toLocalDateString.
 */
export function localDayStart(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * Exclusive end bound: start of the day after dateStr (YYYY-MM-DD).
 * Use with timePrinted >= start && timePrinted < endExclusive.
 */
export function localDayEndExclusive(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d + 1, 0, 0, 0, 0);
}

/** IST locale string used by some scan-time writers (e.g. biochem). */
export function getISTLocaleString(date = new Date()) {
  return date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
}

/**
 * Owner-analytics date coercion — matches historical dataFetcher `toDate`.
 * Prefer this in owner lib; use parseDateField for register UIs.
 */
export function toDate(v) {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Minutes between two date-like values (owner analytics). */
export function minutesDiff(a, b) {
  const A = toDate(a);
  const B = toDate(b);
  return A && B && B > A ? Math.round((B - A) / 60000) : null;
}
