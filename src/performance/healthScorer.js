/**
 * Daily engineering health scores + alert rules.
 */

import { getState, saveDailyHealth, getHealthHistory, saveDailyRollup } from "./performanceStore.js";
import { summarizeCache } from "./cacheMetrics.js";
import {
  summarizeDurations,
  todayKey,
  filterByDateRange,
} from "./networkMetrics.js";
import { estimateSessionStorageBytes } from "./performanceStore.js";
import { ROLLUP_CAPS } from "./rollupMerge.js";

function band(score) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Needs Attention";
  return "Critical";
}

function clamp(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function computeHealthScores(state = getState(), fromStr = null, toStr = null) {
  const from = fromStr || todayKey();
  const to = toStr || from;
  const loads = filterByDateRange(state.pageLoads || [], from, to);
  const queries = filterByDateRange(state.queries || [], from, to);
  const cache = summarizeCache(
    filterByDateRange(state.cacheEvents || [], from, to)
  );
  const qStats = summarizeDurations(queries);
  const slowPages = loads.filter((l) => (l.totalMs || 0) > 30000).length;
  const avgLoad =
    loads.length > 0
      ? loads.reduce((a, b) => a + (b.totalMs || 0), 0) / loads.length
      : 0;

  const activeListeners = (state.listeners || []).filter(
    (l) => l.state === "Active"
  ).length;
  const dupes = countDuplicateListeners(state.listeners || []);

  // Architecture: stable baseline — high unless listener leaks / dupes
  let architecture = 90;
  if (dupes > 0) architecture -= Math.min(30, dupes * 10);
  if (activeListeners > 40) architecture -= 10;

  // Firebase: based on query latency + slow queries
  let firebase = 90;
  if (qStats.avg > 2000) firebase -= 25;
  else if (qStats.avg > 1000) firebase -= 10;
  if (qStats.max > 10000) firebase -= 20;
  if (qStats.p95 > 5000) firebase -= 15;

  // Caching
  let caching = 75;
  if (cache.hits + cache.misses > 0) {
    caching = clamp(40 + cache.hitRate * 0.6);
  }

  // Performance (page loads)
  let performance = 90;
  if (avgLoad > 10000) performance -= 30;
  else if (avgLoad > 2000) performance -= 15;
  performance -= Math.min(30, slowPages * 15);

  // Memory
  let memory = 85;
  const ss = estimateSessionStorageBytes();
  const quotaApprox = 5 * 1024 * 1024;
  const ssPct = (ss / quotaApprox) * 100;
  if (ssPct > 80) memory -= 30;
  else if (ssPct > 50) memory -= 10;
  const longTasks = filterByDateRange(state.longTasks || [], from, to);
  if (longTasks.some((t) => t.durationMs > 200)) memory -= 10;

  // Network
  let network = 90;
  if (qStats.avg > 2000) network -= 25;
  if (qStats.max > 10000) network -= 20;

  const scores = {
    architecture: clamp(architecture),
    firebase: clamp(firebase),
    caching: clamp(caching),
    performance: clamp(performance),
    memory: clamp(memory),
    network: clamp(network),
  };
  scores.overall = clamp(
    (scores.architecture +
      scores.firebase +
      scores.caching +
      scores.performance +
      scores.memory +
      scores.network) /
      6
  );
  scores.labels = {
    architecture: band(scores.architecture),
    firebase: band(scores.firebase),
    caching: band(scores.caching),
    performance: band(scores.performance),
    memory: band(scores.memory),
    network: band(scores.network),
    overall: band(scores.overall),
  };
  return scores;
}

export function persistTodayHealth() {
  const state = getState();
  const scores = computeHealthScores(state);
  const date = todayKey();
  saveDailyHealth(date, scores);

  const loads = filterByDateRange(state.pageLoads || [], date, date);
  const queries = filterByDateRange(state.queries || [], date, date);
  const reads = filterByDateRange(state.reads || [], date, date);
  const cacheEvents = filterByDateRange(state.cacheEvents || [], date, date);
  const events = filterByDateRange(state.events || [], date, date);
  const longTasks = filterByDateRange(state.longTasks || [], date, date);
  const incrementalSync = filterByDateRange(
    state.incrementalSync || [],
    date,
    date
  );
  const qStats = summarizeDurations(queries);
  const cache = summarizeCache(cacheEvents);
  const readsTotal = reads.reduce((a, r) => a + (r.docCount || 0), 0);

  saveDailyRollup(date, {
    readsTotal,
    pageLoadCount: loads.length,
    avgLoadMs: loads.length
      ? loads.reduce((a, b) => a + (b.totalMs || 0), 0) / loads.length
      : 0,
    slowPages: loads.filter((l) => (l.totalMs || 0) > 30000).length,
    queryStats: qStats,
    cache,
    scores,
    pageLoads: loads.slice(-ROLLUP_CAPS.pageLoads),
    queries: queries.slice(-ROLLUP_CAPS.queries),
    reads: reads.slice(-ROLLUP_CAPS.reads),
    events: events.slice(-ROLLUP_CAPS.events),
    longTasks: longTasks.slice(-ROLLUP_CAPS.longTasks),
    incrementalSync: incrementalSync.slice(-ROLLUP_CAPS.incrementalSync),
    cacheEvents: cacheEvents.slice(-ROLLUP_CAPS.cacheEvents),
  });

  // Persist to Firestore perf_daily (async; merge-safe)
  import("./perfDailyFirestore.js")
    .then((m) => m.schedulePerfDailyFlush({ delayMs: 2000 }))
    .catch(() => {});

  return scores;
}

export function countDuplicateListeners(listeners) {
  const active = listeners.filter((l) => l.state === "Active");
  const map = new Map();
  let dupes = 0;
  for (const l of active) {
    const key = `${l.page}|${l.collection}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  for (const n of map.values()) {
    if (n > 1) dupes += n - 1;
  }
  return dupes;
}

export function computeAlerts(state = getState(), fromStr = null, toStr = null) {
  const alerts = [];
  const from = fromStr || todayKey();
  const to = toStr || from;
  const loads = filterByDateRange(state.pageLoads || [], from, to);
  const queries = filterByDateRange(state.queries || [], from, to);
  const cache = summarizeCache(
    filterByDateRange(state.cacheEvents || [], from, to)
  );
  const qStats = summarizeDurations(queries);

  for (const l of loads) {
    if ((l.totalMs || 0) > 30000) {
      alerts.push({
        level: "critical",
        text: `Page load >30s: ${l.page} (${Math.round(l.totalMs)}ms)`,
      });
    }
  }
  for (const q of queries) {
    if ((q.durationMs || 0) > 5000) {
      alerts.push({
        level: "warn",
        text: `Firestore query >5s: ${q.collection} (${Math.round(q.durationMs)}ms)`,
      });
    }
  }
  if (qStats.avg > 2000 && qStats.count > 0) {
    alerts.push({
      level: "warn",
      text: `Average query >2s (${Math.round(qStats.avg)}ms)`,
    });
  }
  if (qStats.max > 10000) {
    alerts.push({
      level: "critical",
      text: `Query max >10s (${Math.round(qStats.max)}ms)`,
    });
  }

  const dupes = countDuplicateListeners(state.listeners || []);
  if (dupes > 0) {
    alerts.push({
      level: "warn",
      text: `Duplicate listeners detected (${dupes})`,
    });
  }

  const longRunning = (state.listeners || []).filter(
    (l) =>
      l.state === "Active" && Date.now() - (l.startedAt || 0) > 30 * 60 * 1000
  );
  if (longRunning.length) {
    alerts.push({
      level: "info",
      text: `Long-running listeners: ${longRunning.length}`,
    });
  }

  if (cache.hits + cache.misses >= 5 && cache.missRate > 80) {
    alerts.push({
      level: "warn",
      text: `Cache miss rate >80% (${cache.missRate.toFixed(0)}%)`,
    });
  }

  const ss = estimateSessionStorageBytes();
  if (ss > 0.8 * 5 * 1024 * 1024) {
    alerts.push({
      level: "warn",
      text: `SessionStorage >80% of ~5MB quota`,
    });
  }

  for (const r of filterByDateRange(state.reads || [], from, to)) {
    if ((r.docCount || 0) >= 500) {
      alerts.push({
        level: "warn",
        text: `Large snapshot: ${r.collection} (${r.docCount} docs)`,
      });
    }
  }

  for (const t of filterByDateRange(state.longTasks || [], from, to)) {
    if (t.durationMs >= 100) {
      alerts.push({
        level: "info",
        text: `Long task ${Math.round(t.durationMs)}ms`,
      });
    }
  }

  // de-dupe by text
  const seen = new Set();
  return alerts.filter((a) => {
    if (seen.has(a.text)) return false;
    seen.add(a.text);
    return true;
  });
}

export function buildQueryLeaderboard(queries, sortBy = "slowest") {
  const map = new Map();
  for (const q of queries || []) {
    const key = q.queryKey || q.collection || "unknown";
    if (!map.has(key)) {
      map.set(key, {
        query: key,
        collection: q.collection,
        durations: [],
        docs: [],
        calls: 0,
      });
    }
    const row = map.get(key);
    row.calls += 1;
    row.durations.push(q.durationMs || 0);
    row.docs.push(q.docCount || 0);
  }

  const rows = [...map.values()].map((r) => {
    const stats = summarizeDurations(
      r.durations.map((durationMs) => ({ durationMs }))
    );
    const totalDocs = r.docs.reduce((a, b) => a + b, 0);
    const avgDocs = r.docs.length ? totalDocs / r.docs.length : 0;
    const readCost = totalDocs; // measured docs returned
    return {
      query: r.query,
      collection: r.collection,
      avgMs: stats.avg,
      p95Ms: stats.p95,
      maxMs: stats.max,
      calls: r.calls,
      avgDocs,
      totalDocs,
      readCost,
    };
  });

  const sorters = {
    slowest: (a, b) => b.avgMs - a.avgMs,
    mostCalled: (a, b) => b.calls - a.calls,
    largest: (a, b) => b.avgDocs - a.avgDocs,
    highestCost: (a, b) => b.readCost - a.readCost,
  };
  rows.sort(sorters[sortBy] || sorters.slowest);
  return rows;
}

export function buildDepartmentRankings(state = getState(), fromStr = null, toStr = null) {
  const from = fromStr || todayKey();
  const to = toStr || from;
  const depts = new Map();

  const ensure = (d) => {
    if (!depts.has(d)) {
      depts.set(d, {
        department: d,
        loads: [],
        reads: 0,
        cacheHits: 0,
        cacheMisses: 0,
        queryDurations: [],
        snapshotDocs: [],
        listeners: 0,
        heap: [],
      });
    }
    return depts.get(d);
  };

  for (const p of filterByDateRange(state.pageLoads || [], from, to)) {
    const row = ensure(p.department || "Unknown");
    row.loads.push(p.totalMs || 0);
    if (p.heapUsed) row.heap.push(p.heapUsed);
  }
  for (const r of filterByDateRange(state.reads || [], from, to)) {
    const row = ensure(r.department || "Unknown");
    row.reads += r.docCount || 0;
    row.snapshotDocs.push(r.docCount || 0);
  }
  for (const c of filterByDateRange(state.cacheEvents || [], from, to)) {
    const row = ensure(c.department || "Unknown");
    if (c.type === "hit") row.cacheHits += 1;
    if (c.type === "miss") row.cacheMisses += 1;
  }
  for (const q of filterByDateRange(state.queries || [], from, to)) {
    const row = ensure(q.department || "Unknown");
    row.queryDurations.push(q.durationMs || 0);
  }
  for (const l of (state.listeners || []).filter((x) => x.state === "Active")) {
    const row = ensure(l.department || "Unknown");
    row.listeners += 1;
  }

  return [...depts.values()].map((d) => {
    const avgLoad = d.loads.length
      ? d.loads.reduce((a, b) => a + b, 0) / d.loads.length
      : 0;
    const cacheTotal = d.cacheHits + d.cacheMisses;
    const cacheHitPct = cacheTotal ? (d.cacheHits / cacheTotal) * 100 : 0;
    const avgQuery = d.queryDurations.length
      ? d.queryDurations.reduce((a, b) => a + b, 0) / d.queryDurations.length
      : 0;
    const largestSnap = d.snapshotDocs.length ? Math.max(...d.snapshotDocs) : 0;
    const avgHeap = d.heap.length
      ? d.heap.reduce((a, b) => a + b, 0) / d.heap.length
      : 0;
    return {
      department: d.department,
      avgLoadMs: avgLoad,
      reads: d.reads,
      cacheHitPct,
      avgQueryMs: avgQuery,
      largestSnapshot: largestSnap,
      memoryBytes: avgHeap,
      listenerCount: d.listeners,
    };
  });
}

export { getHealthHistory, band };
