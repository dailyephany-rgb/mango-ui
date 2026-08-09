/**
 * Global Engineering Dashboard filter helpers (presentation only).
 * Filters existing eng_* docs by day/ts/department/device/build/search.
 */

import { dayKeyFromTs } from "./perfViews.js";
import {
  ENG_AGG_RETENTION_DAYS,
  ENG_SAMPLE_RETENTION_DAYS,
} from "../constants.js";

/** Presets shown in the global filter bar */
export const DATE_PRESETS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "Last 7 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "this_month", label: "This Month" },
  { id: "prev_month", label: "Previous Month" },
  { id: "all_time", label: "All Time" },
  { id: "custom_date", label: "Custom Date Range" },
  { id: "custom_datetime", label: "Custom Date + Time Range" },
];

/** @deprecated use ENG_AGG_RETENTION_DAYS — kept for dashboard copy */
export const ALL_TIME_AGG_DAYS = ENG_AGG_RETENTION_DAYS;
export const ALL_TIME_SAMPLE_DAYS = ENG_SAMPLE_RETENTION_DAYS;

/** Canonical department filter options (labels match ops language) */
export const DEPARTMENT_OPTIONS = [
  { value: "all", label: "All" },
  { value: "Biochemistry", label: "Biochemistry" },
  { value: "Haematology", label: "Haematology" },
  { value: "Hormones", label: "Hormones" },
  { value: "Coagulation", label: "Coagulation" },
  { value: "ESR", label: "ESR" },
  { value: "BloodGroup", label: "Blood Group" },
  { value: "RapidCard", label: "Rapid Card" },
  { value: "Urine", label: "Urine" },
  { value: "Owner", label: "Owner" },
  { value: "Mango", label: "Mango" },
  { value: "Engineering", label: "Engineering" },
];

export const DEFAULT_FILTERS = {
  preset: "7d",
  department: "all",
  deviceId: "all",
  buildId: "all",
  q: "",
  /** yyyy-MM-dd for custom_date / custom_datetime */
  startDate: "",
  endDate: "",
  /** HH:mm for custom_datetime */
  startTime: "00:00",
  endTime: "23:59",
};

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function endOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.getTime();
}

function parseDateInput(dateStr, timeStr = "00:00", end = false) {
  if (!dateStr) return null;
  const [y, m, day] = dateStr.split("-").map(Number);
  if (!y || !m || !day) return null;
  let hh = 0;
  let mm = 0;
  if (timeStr && /^\d{1,2}:\d{2}$/.test(timeStr)) {
    const [h, mi] = timeStr.split(":").map(Number);
    hh = h;
    mm = mi;
  } else if (end) {
    hh = 23;
    mm = 59;
  }
  const d = new Date(y, m - 1, day, hh, mm, end && timeStr === "23:59" ? 59 : 0, end ? 999 : 0);
  return d.getTime();
}

/** Presets whose end is "through now" — keep live listeners open-ended on ts. */
const OPEN_ENDED_PRESETS = new Set([
  "today",
  "7d",
  "30d",
  "this_month",
  "all_time",
]);

/**
 * Resolve filter preset → absolute range.
 * @returns {{ startMs: number, endMs: number, startDay: string, endDay: string, label: string, hasTimePrecision: boolean, openEnded: boolean }}
 */
export function resolveFilterRange(filters = DEFAULT_FILTERS) {
  const now = new Date();
  const preset = filters.preset || "7d";
  let startMs;
  let endMs = Date.now();
  let hasTimePrecision = false;
  let openEnded = false;
  let label = DATE_PRESETS.find((p) => p.id === preset)?.label || preset;

  if (preset === "today") {
    startMs = startOfLocalDay(now);
    endMs = endOfLocalDay(now);
    openEnded = true;
    label = `Today (${dayKeyFromTs(startMs)})`;
  } else if (preset === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    startMs = startOfLocalDay(y);
    endMs = endOfLocalDay(y);
    label = `Yesterday (${dayKeyFromTs(startMs)})`;
  } else if (preset === "7d") {
    startMs = startOfLocalDay(new Date(now.getTime() - 6 * 86400000));
    endMs = endOfLocalDay(now);
    openEnded = true;
  } else if (preset === "30d") {
    startMs = startOfLocalDay(new Date(now.getTime() - 29 * 86400000));
    endMs = endOfLocalDay(now);
    openEnded = true;
  } else if (preset === "this_month") {
    startMs = startOfLocalDay(new Date(now.getFullYear(), now.getMonth(), 1));
    endMs = endOfLocalDay(now);
    openEnded = true;
    label = `This Month (${dayKeyFromTs(startMs).slice(0, 7)})`;
  } else if (preset === "prev_month") {
    const firstThis = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastPrev = new Date(firstThis.getTime() - 1);
    startMs = startOfLocalDay(new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1));
    endMs = endOfLocalDay(lastPrev);
    label = `Previous Month (${dayKeyFromTs(startMs).slice(0, 7)})`;
  } else if (preset === "all_time") {
    // Cap to aggregate retention so UI never promises data past purge windows.
    const days = ENG_AGG_RETENTION_DAYS;
    startMs = startOfLocalDay(new Date(now.getTime() - (days - 1) * 86400000));
    endMs = endOfLocalDay(now);
    openEnded = true;
    label = `All Time (retained ${days}d)`;
  } else if (preset === "custom_date") {
    startMs =
      parseDateInput(filters.startDate, "00:00", false) ??
      startOfLocalDay(new Date(now.getTime() - 6 * 86400000));
    endMs =
      parseDateInput(filters.endDate || filters.startDate, "23:59", true) ??
      endOfLocalDay(now);
    // Custom end date = today → still accept new samples as they arrive
    openEnded = dayKeyFromTs(endMs) === dayKeyFromTs(Date.now());
    label = `${dayKeyFromTs(startMs)} → ${dayKeyFromTs(endMs)}`;
  } else if (preset === "custom_datetime") {
    hasTimePrecision = true;
    startMs =
      parseDateInput(filters.startDate, filters.startTime || "00:00", false) ??
      startOfLocalDay(now);
    endMs =
      parseDateInput(
        filters.endDate || filters.startDate,
        filters.endTime || "23:59",
        true
      ) ?? endOfLocalDay(now);
    label = `${new Date(startMs).toLocaleString()} → ${new Date(endMs).toLocaleString()}`;
  } else {
    startMs = startOfLocalDay(new Date(now.getTime() - 6 * 86400000));
    endMs = endOfLocalDay(now);
    openEnded = OPEN_ENDED_PRESETS.has(preset);
  }

  if (endMs < startMs) {
    const t = startMs;
    startMs = endMs;
    endMs = t;
  }

  return {
    startMs,
    endMs,
    startDay: dayKeyFromTs(startMs),
    endDay: dayKeyFromTs(endMs),
    label,
    hasTimePrecision,
    openEnded,
  };
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

/** Match stored department against filter option (handles BloodGroup / Blood Group, Mango→Registration). */
export function departmentMatches(stored, filterValue) {
  if (!filterValue || filterValue === "all") return true;
  const a = norm(stored);
  const b = norm(filterValue);
  if (!a) return false;
  if (a === b) return true;
  if (b === "bloodgroup" && (a === "bloodgroup" || a.includes("blood"))) return true;
  if (b === "rapidcard" && (a === "rapidcard" || a.includes("rapid"))) return true;
  if (b === "mango" && (a === "mango" || a === "registration")) return true;
  if (b === "owner" && a === "owner") return true;
  return a.includes(b) || b.includes(a);
}

/** Best-effort timestamp for a row */
export function rowTimestampMs(row) {
  if (!row) return null;
  if (row.ts != null) {
    const n = typeof row.ts?.toMillis === "function" ? row.ts.toMillis() : Number(row.ts);
    if (Number.isFinite(n)) return n;
  }
  if (row.clientTs != null && Number.isFinite(Number(row.clientTs))) {
    return Number(row.clientTs);
  }
  if (row.hour && /^\d{4}-\d{2}-\d{2}T\d{2}/.test(row.hour)) {
    const [datePart, hourPart] = row.hour.split("T");
    const [y, m, d] = datePart.split("-").map(Number);
    return new Date(y, m - 1, d, Number(hourPart), 0, 0, 0).getTime();
  }
  if (row.day && /^\d{4}-\d{2}-\d{2}/.test(row.day)) {
    const [y, m, d] = row.day.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
  }
  if (row.updatedAt?.toMillis) return row.updatedAt.toMillis();
  if (row.openedAt?.toMillis) return row.openedAt.toMillis();
  if (row.createdAt?.toMillis) return row.createdAt.toMillis();
  return null;
}

/**
 * @param {object} row
 * @param {object} filters
 * @param {ReturnType<typeof resolveFilterRange>} range
 * @param {{ live?: boolean, skipTime?: boolean }} [opts]
 */
export function rowMatchesGlobalFilter(row, filters, range, opts = {}) {
  if (!row) return false;

  if (!opts.skipTime) {
    // Open-ended presets (Today / Last 7d / …): only enforce lower bound so
    // samples written after subscribe-time still pass client filter.
    const endCap = range?.openEnded
      ? Number.POSITIVE_INFINITY
      : range.endMs;

    // Prefer precise ts when present (page loads, errors, audit)
    const hasPreciseTs =
      row.ts != null &&
      Number.isFinite(
        typeof row.ts?.toMillis === "function" ? row.ts.toMillis() : Number(row.ts)
      );

    if (hasPreciseTs) {
      const ts = rowTimestampMs(row);
      if (ts < range.startMs || ts > endCap) return false;
    } else if (row.hour && /^\d{4}-\d{2}-\d{2}T\d{2}/.test(row.hour)) {
      const ts = rowTimestampMs(row);
      if (ts == null || ts < range.startMs || ts > endCap) return false;
    } else if (row.day && /^\d{4}-\d{2}-\d{2}/.test(row.day)) {
      // Daily aggregates: include whole calendar days that overlap the range
      // Open-ended: allow today and future day keys from clock skew
      if (row.day < range.startDay) return false;
      if (!range.openEnded && row.day > range.endDay) return false;
    } else {
      const ts = rowTimestampMs(row);
      if (ts != null) {
        if (ts < range.startMs || ts > endCap) return false;
      } else if (!opts.live) {
        return false;
      }
    }
  }

  if (!opts.ignoreDepartment && filters.department && filters.department !== "all") {
    if (!departmentMatches(row.department, filters.department)) return false;
  }

  if (filters.deviceId && filters.deviceId !== "all") {
    const id = row.deviceId || (opts.live ? row.id : null);
    if (id !== filters.deviceId) return false;
  }

  if (filters.buildId && filters.buildId !== "all") {
    if (String(row.buildId || "") !== String(filters.buildId)) return false;
  }

  if (filters.q && String(filters.q).trim()) {
    const q = String(filters.q).trim().toLowerCase();
    const blob = [
      row.deviceId,
      row.label,
      row.department,
      row.page,
      row.buildId,
      row.message,
      row.action,
      row.collection,
      row.kind,
      row.source,
      row.actor,
      row.detail,
      row.id,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!blob.includes(q)) return false;
  }

  return true;
}

export function filterRowsByGlobal(rows, filters, range, opts = {}) {
  return (rows || []).filter((r) =>
    rowMatchesGlobalFilter(r, filters, range, opts)
  );
}
