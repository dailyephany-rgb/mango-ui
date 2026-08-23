/**
 * In-memory + sessionStorage performance store.
 * Detailed telemetry → sessionStorage (mango.perf.v1)
 * Daily health aggregates → localStorage (mango.perf.health.v1) for 30-day trends
 */

import { mergeRollupRecords } from "./rollupMerge.js";
import { safeStorageSet } from "../engineering/telemetry/safeStorage.js";
import { isIosSafariDevice } from "../shared/device/detectDeviceKind.js";

const STORE_KEY = "mango.perf.v1";
const HEALTH_KEY = "mango.perf.health.v1";
const DAILY_KEY = "mango.perf.daily.v1";
const MONITOR_KEY = "mango.perf.monitor";
/** Running (non-truncated) doc-read counters by YYYY-MM-DD — localStorage */
const READS_COUNTED_KEY = "mango.perf.readsCounted.v1";

const LIMITS = {
  pageLoads: 100,
  queries: 300,
  events: 200,
  listeners: 80,
  reads: 400,
  cacheEvents: 200,
  longTasks: 50,
  incrementalSync: 200,
};

function localTodayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadReadsCountedMap() {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(READS_COUNTED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

let readsCountedByDate = loadReadsCountedMap();
let readsCountedPersistTimer = null;

function skipIosLargeLocalStorage() {
  try {
    return isIosSafariDevice();
  } catch {
    return false;
  }
}

function persistReadsCounted() {
  try {
    if (skipIosLargeLocalStorage()) return;
    if (typeof localStorage === "undefined") return;
    const entries = Object.entries(readsCountedByDate).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    while (entries.length > 45) entries.shift();
    readsCountedByDate = Object.fromEntries(entries);
    localStorage.setItem(READS_COUNTED_KEY, JSON.stringify(readsCountedByDate));
  } catch {
    /* ignore */
  }
}

function scheduleReadsCountedPersist() {
  if (readsCountedPersistTimer != null) return;
  readsCountedPersistTimer = setTimeout(() => {
    readsCountedPersistTimer = null;
    persistReadsCounted();
  }, 800);
}

/**
 * Increment the non-truncated daily doc-read counter (survives ring-buffer trim).
 * @param {number} docCount
 * @param {string} [dateStr]
 */
export function addCountedReads(docCount, dateStr) {
  const n = Number(docCount) || 0;
  if (n <= 0) return;
  const d = dateStr || localTodayKey();
  readsCountedByDate[d] = (Number(readsCountedByDate[d]) || 0) + n;
  scheduleReadsCountedPersist();
}

/** @returns {number} */
export function getCountedReads(dateStr) {
  const d = dateStr || localTodayKey();
  return Number(readsCountedByDate[d]) || 0;
}

/** Sum of running counters for inclusive date range (this browser only). */
export function getCountedReadsInRange(fromStr, toStr) {
  let sum = 0;
  for (const [d, n] of Object.entries(readsCountedByDate)) {
    if (d >= fromStr && d <= toStr) sum += Number(n) || 0;
  }
  return sum;
}

/** Force-flush counter to localStorage (pagehide). */
export function flushCountedReads() {
  if (readsCountedPersistTimer != null) {
    clearTimeout(readsCountedPersistTimer);
    readsCountedPersistTimer = null;
  }
  persistReadsCounted();
}

function emptyState() {
  return {
    v: 1,
    sessionStartedAt: Date.now(),
    pageLoads: [],
    queries: [],
    events: [],
    listeners: [],
    reads: [],
    cacheEvents: [],
    longTasks: [],
    incrementalSync: [],
    pageMeta: {},
  };
}

let state = emptyState();
let persistTimer = null;
let listeners = new Set();

export function isMonitorEnabled() {
  try {
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem(MONITOR_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setMonitorEnabled(enabled) {
  try {
    localStorage.setItem(MONITOR_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function getState() {
  return state;
}

export function subscribeStore(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch {
      /* ignore */
    }
  }
}

function pushRing(arr, item, limit) {
  arr.push(item);
  if (arr.length > limit) arr.splice(0, arr.length - limit);
}

export function mutate(mutator) {
  if (!isMonitorEnabled() && mutator._force !== true) return;
  mutator(state);
  schedulePersist();
  notify();
}

export function recordToRing(key, item) {
  mutate((s) => {
    if (!s[key]) s[key] = [];
    pushRing(s[key], item, LIMITS[key] || 100);
  });
}

function schedulePersist() {
  if (persistTimer != null) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    flushPersist();
  }, 2000);
}

export function flushPersist() {
  if (typeof sessionStorage === "undefined") return;
  if (skipIosLargeLocalStorage()) return;
  const persist = (queriesN, eventsN, readsN) => {
    const slim = {
      v: state.v,
      sessionStartedAt: state.sessionStartedAt,
      pageLoads: state.pageLoads,
      queries: state.queries.slice(-queriesN),
      events: state.events.slice(-eventsN),
      listeners: state.listeners,
      reads: state.reads.slice(-readsN),
      cacheEvents: state.cacheEvents.slice(-50),
      longTasks: state.longTasks.slice(-15),
      incrementalSync: state.incrementalSync.slice(-40),
      pageMeta: state.pageMeta,
    };
    return safeStorageSet(sessionStorage, STORE_KEY, JSON.stringify(slim));
  };
  if (persist(150, 120, 200)) return;
  if (persist(40, 30, 40)) return;
  try {
    sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadPersisted() {
  if (typeof sessionStorage === "undefined") return;
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1) return;
    state = {
      ...emptyState(),
      ...parsed,
      pageLoads: parsed.pageLoads || [],
      queries: parsed.queries || [],
      events: parsed.events || [],
      listeners: parsed.listeners || [],
      reads: parsed.reads || [],
      cacheEvents: parsed.cacheEvents || [],
      longTasks: parsed.longTasks || [],
      incrementalSync: parsed.incrementalSync || [],
      pageMeta: parsed.pageMeta || {},
    };
  } catch {
    /* ignore */
  }
}

export function clearMetrics() {
  state = emptyState();
  try {
    sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
  notify();
}

export function exportMetricsJson() {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      state,
      healthHistory: getHealthHistory(),
      dailyRollups: getDailyRollups(),
      readsCountedByDate: { ...readsCountedByDate },
    },
    null,
    2
  );
}

/** @returns {Array<{date:string, scores:object}>} */
export function getHealthHistory() {
  try {
    const raw = localStorage.getItem(HEALTH_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Persist one day of health scores (keep 30). */
export function saveDailyHealth(dateStr, scores) {
  try {
    if (skipIosLargeLocalStorage()) return;
    const hist = getHealthHistory().filter((h) => h.date !== dateStr);
    hist.push({ date: dateStr, scores, at: Date.now() });
    hist.sort((a, b) => a.date.localeCompare(b.date));
    while (hist.length > 30) hist.shift();
    localStorage.setItem(HEALTH_KEY, JSON.stringify(hist));
  } catch {
    /* ignore */
  }
}

/**
 * Compact daily telemetry rollup so date filter works across days
 * (sessionStorage alone is wiped when the tab closes).
 * Merges with any existing same-day rollup (does not replace).
 * Keep 30 days.
 */
export function saveDailyRollup(dateStr, rollup) {
  try {
    if (skipIosLargeLocalStorage()) return;
    const counted = getCountedReads(dateStr);
    const withCounted = {
      ...rollup,
      date: dateStr,
      readsTotal: Math.max(
        Number(rollup.readsTotal) || 0,
        counted
      ),
    };
    const existing = getDailyRollups().find((d) => d.date === dateStr);
    const merged = existing
      ? mergeRollupRecords(existing, withCounted)
      : { ...withCounted, at: Date.now() };
    // Prefer running counter over truncated sample sums
    merged.readsTotal = Math.max(
      Number(merged.readsTotal) || 0,
      counted,
      Number(existing?.readsTotal) || 0
    );
    const all = getDailyRollups().filter((d) => d.date !== dateStr);
    all.push({ ...merged, date: dateStr, at: Date.now() });
    all.sort((a, b) => a.date.localeCompare(b.date));
    while (all.length > 30) all.shift();
    localStorage.setItem(DAILY_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/** @returns {Array<object>} */
export function getDailyRollups() {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Merge rollups whose date is in [fromStr, toStr] inclusive. */
export function getDailyRollupsInRange(fromStr, toStr) {
  return getDailyRollups().filter(
    (d) => d.date >= fromStr && d.date <= toStr
  );
}

export function estimateSessionStorageBytes() {
  if (typeof sessionStorage === "undefined") return 0;
  let total = 0;
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k) continue;
      const v = sessionStorage.getItem(k) || "";
      total += k.length * 2 + v.length * 2;
    }
  } catch {
    /* ignore */
  }
  return total;
}

export function estimatePerfStoreBytes() {
  try {
    return (sessionStorage.getItem(STORE_KEY) || "").length * 2;
  } catch {
    return 0;
  }
}

export function estimateCachePayloadBytes() {
  if (typeof sessionStorage === "undefined") return { total: 0, largest: null };
  let total = 0;
  let largest = null;
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k || !k.startsWith("mango.sqc.v1:")) continue;
      const v = sessionStorage.getItem(k) || "";
      const size = v.length * 2;
      total += size;
      if (!largest || size > largest.size) {
        largest = { key: k.replace("mango.sqc.v1:", ""), size };
      }
    }
  } catch {
    /* ignore */
  }
  return { total, largest };
}

// Load on module init
loadPersisted();
