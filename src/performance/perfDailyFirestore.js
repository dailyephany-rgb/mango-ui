/**
 * Firestore persistence for Performance daily rollups.
 * Collection: perf_daily
 * Doc id: `${YYYY-MM-DD}__${clientId}`
 *
 * Uses dynamic import of firebase only from callers that already have db —
 * this module imports db directly (safe: firebaseConfig loads bootstrap async).
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebaseConfig.js";
import { PERF_DAILY_COLLECTION } from "../shared/config/collections.js";
import {
  getState,
  isMonitorEnabled,
  getDailyRollups,
  saveDailyRollup,
  saveDailyHealth,
  getHealthHistory,
} from "./performanceStore.js";
import { summarizeCache } from "./cacheMetrics.js";
import {
  summarizeDurations,
  todayKey,
  filterByDateRange,
} from "./networkMetrics.js";
import {
  ROLLUP_CAPS,
  mergeRollupRecords,
  mergeUniqueByAt,
} from "./rollupMerge.js";
import { PAGE_LOAD_SLOW_MS } from "./pageLoadBands.js";

const CLIENT_KEY = "mango.perf.clientId";
const MIN_FLUSH_MS = 45000;

let flushTimer = null;
let lastFlushAt = 0;
let flushInFlight = false;

export function getPerfClientId() {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (id && id.length >= 8) return id;
    id = `c_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    localStorage.setItem(CLIENT_KEY, id);
    return id;
  } catch {
    return `c_anon_${Date.now().toString(36)}`;
  }
}

function stripUndefined(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value
      .map((v) => stripUndefined(v))
      .filter((v) => v !== undefined);
  }
  if (typeof value !== "object") return value;
  // Keep Firestore FieldValue / Timestamp-like objects intact
  if (typeof value.toMillis === "function" || value.isEqual) return value;
  if (Object.prototype.hasOwnProperty.call(value, "_methodName")) return value;

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    const cleaned = stripUndefined(v);
    if (cleaned !== undefined) out[k] = cleaned;
  }
  return out;
}

/**
 * Build today's compact rollup from the in-memory session store.
 */
export function buildSessionDayRollup(dateStr = todayKey()) {
  const state = getState();
  const loads = filterByDateRange(state.pageLoads || [], dateStr, dateStr);
  const queries = filterByDateRange(state.queries || [], dateStr, dateStr);
  const reads = filterByDateRange(state.reads || [], dateStr, dateStr);
  const cacheEvents = filterByDateRange(
    state.cacheEvents || [],
    dateStr,
    dateStr
  );
  const events = filterByDateRange(state.events || [], dateStr, dateStr);
  const longTasks = filterByDateRange(state.longTasks || [], dateStr, dateStr);
  const incrementalSync = filterByDateRange(
    state.incrementalSync || [],
    dateStr,
    dateStr
  );
  const scores =
    getHealthHistory().find((h) => h.date === dateStr)?.scores || null;

  return {
    date: dateStr,
    clientId: getPerfClientId(),
    readsTotal: reads.reduce((a, r) => a + (r.docCount || 0), 0),
    pageLoadCount: loads.length,
    avgLoadMs: loads.length
      ? loads.reduce((a, b) => a + (b.totalMs || 0), 0) / loads.length
      : 0,
    slowPages: loads.filter((l) => (l.totalMs || 0) >= PAGE_LOAD_SLOW_MS).length,
    queryStats: summarizeDurations(queries),
    cache: summarizeCache(cacheEvents),
    scores,
    pageLoads: loads.slice(-ROLLUP_CAPS.pageLoads),
    queries: queries.slice(-ROLLUP_CAPS.queries),
    reads: reads.slice(-ROLLUP_CAPS.reads),
    events: events.slice(-ROLLUP_CAPS.events),
    longTasks: longTasks.slice(-ROLLUP_CAPS.longTasks),
    incrementalSync: incrementalSync.slice(-ROLLUP_CAPS.incrementalSync),
    cacheEvents: cacheEvents.slice(-ROLLUP_CAPS.cacheEvents),
    at: Date.now(),
    loggedUser:
      (typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem("loggedUser")) ||
      "Unknown",
  };
}

function docIdFor(dateStr, clientId) {
  return `${dateStr}__${clientId}`;
}

/**
 * Merge session rollup into localStorage + Firestore for today.
 * @param {{ force?: boolean }} [opts]
 */
export async function flushPerfDaily(opts = {}) {
  if (!isMonitorEnabled()) return null;
  if (flushInFlight) return null;

  const now = Date.now();
  if (!opts.force && now - lastFlushAt < MIN_FLUSH_MS) return null;

  flushInFlight = true;
  const dateStr = todayKey();
  const clientId = getPerfClientId();
  const sessionRollup = buildSessionDayRollup(dateStr);

  try {
    // Local merge (survives within this browser)
    const localExisting =
      getDailyRollups().find((d) => d.date === dateStr) || {};
    const localMerged = mergeRollupRecords(localExisting, sessionRollup);
    saveDailyRollup(dateStr, localMerged);
    if (sessionRollup.scores) {
      saveDailyHealth(dateStr, sessionRollup.scores);
    }

    const ref = doc(db, PERF_DAILY_COLLECTION, docIdFor(dateStr, clientId));
    let remoteExisting = {};
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) remoteExisting = snap.data() || {};
    } catch (err) {
      console.warn(
        "[perf] perf_daily read failed (check Firestore rules):",
        err?.message || err
      );
    }

    const merged = mergeRollupRecords(remoteExisting, sessionRollup);
    const payload = stripUndefined({
      date: dateStr,
      clientId,
      loggedUser: sessionRollup.loggedUser,
      readsTotal: merged.readsTotal,
      pageLoadCount: merged.pageLoadCount,
      avgLoadMs: merged.avgLoadMs,
      slowPages: merged.slowPages,
      queryStats: merged.queryStats,
      cache: merged.cache,
      scores: merged.scores,
      pageLoads: merged.pageLoads,
      queries: merged.queries,
      reads: merged.reads,
      events: merged.events,
      longTasks: merged.longTasks,
      incrementalSync: merged.incrementalSync,
      cacheEvents: merged.cacheEvents,
      at: merged.at,
      source: "mango-ui-perf",
      v: 1,
    });
    payload.updatedAt = serverTimestamp();

    await setDoc(ref, payload, { merge: true });
    lastFlushAt = Date.now();
    return merged;
  } catch (err) {
    console.warn(
      "[perf] perf_daily write failed (check Firestore rules for collection 'perf_daily'):",
      err?.message || err
    );
    return null;
  } finally {
    flushInFlight = false;
  }
}

/**
 * Debounced flush — call from persistTodayHealth / pagehide.
 * @param {{ force?: boolean, delayMs?: number }} [opts]
 */
export function schedulePerfDailyFlush(opts = {}) {
  if (!isMonitorEnabled()) return;
  const delay = opts.force ? 0 : opts.delayMs ?? 2500;
  if (flushTimer != null) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushPerfDaily({ force: !!opts.force }).catch(() => {});
  }, delay);
}

/**
 * Load all device-day rollups in [fromStr, toStr] inclusive.
 * @returns {Promise<object[]>}
 */
export async function fetchPerfDailyRange(fromStr, toStr) {
  if (!fromStr || !toStr) return [];
  try {
    const q = query(
      collection(db, PERF_DAILY_COLLECTION),
      where("date", ">=", fromStr),
      where("date", "<=", toStr),
      orderBy("date", "asc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data() || {};
      return {
        id: d.id,
        ...data,
        date: data.date || String(d.id).split("__")[0],
      };
    });
  } catch (err) {
    console.warn(
      "[perf] perf_daily range query failed:",
      err?.message || err
    );
    return [];
  }
}

/**
 * Combine localStorage rollups + Firestore rollups for a date range.
 */
export function combineLocalAndRemoteRollups(localRollups, remoteRollups) {
  const byKey = new Map();
  for (const r of [...(localRollups || []), ...(remoteRollups || [])]) {
    if (!r?.date) continue;
    const key = `${r.date}__${r.clientId || r.id || "local"}`;
    const prev = byKey.get(key);
    byKey.set(key, prev ? mergeRollupRecords(prev, r) : r);
  }
  return [...byKey.values()].sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
}

export { mergeUniqueByAt };
