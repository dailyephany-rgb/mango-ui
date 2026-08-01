/** Network / query duration aggregates from measured samples. */

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1
  );
  return sorted[Math.max(0, idx)];
}

export function summarizeDurations(samples) {
  const durations = samples
    .map((s) => s.durationMs)
    .filter((n) => typeof n === "number" && n >= 0)
    .sort((a, b) => a - b);
  if (!durations.length) {
    return { count: 0, avg: 0, median: 0, p95: 0, max: 0, min: 0 };
  }
  const sum = durations.reduce((a, b) => a + b, 0);
  return {
    count: durations.length,
    avg: sum / durations.length,
    median: percentile(durations, 50),
    p95: percentile(durations, 95),
    max: durations[durations.length - 1],
    min: durations[0],
  };
}

export function sinceMs(ms) {
  return Date.now() - ms;
}

export function filterSince(items, msAgo) {
  const cut = Date.now() - msAgo;
  return (items || []).filter((i) => (i.at || i.startedAt || 0) >= cut);
}

export function startOfTodayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function todayKey() {
  return toDateKey(new Date());
}

export function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local midnight for YYYY-MM-DD */
export function dayStartMs(dateStr) {
  if (!dateStr) return startOfTodayMs();
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return startOfTodayMs();
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

/** Exclusive end: next local midnight after YYYY-MM-DD */
export function dayEndExclusiveMs(dateStr) {
  if (!dateStr) {
    return startOfTodayMs() + 24 * 60 * 60 * 1000;
  }
  const start = dayStartMs(dateStr);
  return start + 24 * 60 * 60 * 1000;
}

/**
 * Filter items whose `at` (or `startedAt`) falls in [from, to] inclusive days.
 */
export function filterByDateRange(items, fromStr, toStr) {
  const from = dayStartMs(fromStr);
  const toEx = dayEndExclusiveMs(toStr);
  return (items || []).filter((i) => {
    const t = i.at || i.startedAt || 0;
    return t >= from && t < toEx;
  });
}
