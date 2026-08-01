/**
 * Dashboard-only React context — polls performance store.
 * Supports From/To date filter across session telemetry + daily rollups.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  getState,
  subscribeStore,
  isMonitorEnabled,
  setMonitorEnabled,
  clearMetrics,
  exportMetricsJson,
  getDailyRollupsInRange,
  estimateSessionStorageBytes,
  estimatePerfStoreBytes,
  estimateCachePayloadBytes,
} from "./performanceStore.js";
import {
  computeHealthScores,
  computeAlerts,
  persistTodayHealth,
  buildQueryLeaderboard,
  buildDepartmentRankings,
  getHealthHistory,
} from "./healthScorer.js";
import { summarizeCache } from "./cacheMetrics.js";
import {
  summarizeDurations,
  filterSince,
  todayKey,
  filterByDateRange,
} from "./networkMetrics.js";
import { getHeapEstimate } from "./renderMetrics.js";

const PerfCtx = createContext(null);

function mergeUniqueByAt(a, b) {
  const map = new Map();
  for (const item of [...(a || []), ...(b || [])]) {
    const key = `${item.at || item.startedAt || 0}:${item.page || ""}:${item.collection || ""}:${item.kind || item.type || ""}:${item.durationMs || ""}:${item.docCount || ""}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()].sort((x, y) => (x.at || 0) - (y.at || 0));
}

function buildFilteredView(state, dateFrom, dateTo) {
  const sessionLoads = filterByDateRange(state.pageLoads || [], dateFrom, dateTo);
  const sessionQueries = filterByDateRange(state.queries || [], dateFrom, dateTo);
  const sessionReads = filterByDateRange(state.reads || [], dateFrom, dateTo);
  const sessionCache = filterByDateRange(state.cacheEvents || [], dateFrom, dateTo);
  const sessionEvents = filterByDateRange(state.events || [], dateFrom, dateTo);
  const sessionLong = filterByDateRange(state.longTasks || [], dateFrom, dateTo);

  const rollups = getDailyRollupsInRange(dateFrom, dateTo);
  const rollLoads = rollups.flatMap((r) => r.pageLoads || []);
  const rollQueries = rollups.flatMap((r) => r.queries || []);
  const rollReads = rollups.flatMap((r) => r.reads || []);
  const rollEvents = rollups.flatMap((r) => r.events || []);
  const rollLong = rollups.flatMap((r) => r.longTasks || []);

  // Prefer live session data; fill gaps from localStorage daily rollups
  return {
    pageLoads: mergeUniqueByAt(sessionLoads, rollLoads),
    queries: mergeUniqueByAt(sessionQueries, rollQueries),
    reads: mergeUniqueByAt(sessionReads, rollReads),
    cacheEvents: sessionCache.length
      ? sessionCache
      : rollups.flatMap((r) => {
          const c = r.cache || {};
          const out = [];
          for (let i = 0; i < (c.hits || 0); i++) {
            out.push({ at: r.at || 0, type: "hit", department: "Archived" });
          }
          for (let i = 0; i < (c.misses || 0); i++) {
            out.push({ at: r.at || 0, type: "miss", department: "Archived" });
          }
          return out;
        }),
    events: mergeUniqueByAt(sessionEvents, rollEvents),
    longTasks: mergeUniqueByAt(sessionLong, rollLong),
    incrementalSync: filterByDateRange(
      state.incrementalSync || [],
      dateFrom,
      dateTo
    ),
    listeners: state.listeners || [],
    rollups,
    fromRollupOnly:
      sessionLoads.length === 0 &&
      sessionQueries.length === 0 &&
      rollups.length > 0,
  };
}

export function PerformanceProvider({ children }) {
  const today = todayKey();
  const [state, setState] = useState(() => getState());
  const [tick, setTick] = useState(0);
  const [monitorOn, setMonitorOn] = useState(() => isMonitorEnabled());
  const [leaderSort, setLeaderSort] = useState("slowest");
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);

  useEffect(() => {
    const unsub = subscribeStore((s) =>
      setState({ ...s, pageLoads: [...(s.pageLoads || [])] })
    );
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    persistTodayHealth();
    return () => {
      unsub();
      clearInterval(id);
    };
  }, []);

  const filtered = useMemo(
    () => buildFilteredView(state, dateFrom, dateTo),
    [state, dateFrom, dateTo, tick]
  );

  const hourAgo = Date.now() - 60 * 60 * 1000;
  const rangeState = {
    ...state,
    pageLoads: filtered.pageLoads,
    queries: filtered.queries,
    reads: filtered.reads,
    cacheEvents: filtered.cacheEvents,
    events: filtered.events,
    longTasks: filtered.longTasks,
  };

  const healthHistory = getHealthHistory().filter(
    (h) => h.date >= dateFrom && h.date <= dateTo
  );

  const derived = {
    monitorOn,
    dateFrom,
    dateTo,
    setDateFrom: (v) => {
      setDateFrom(v);
      if (v > dateTo) setDateTo(v);
    },
    setDateTo: (v) => {
      setDateTo(v);
      if (v < dateFrom) setDateFrom(v);
    },
    resetDatesToToday: () => {
      const t = todayKey();
      setDateFrom(t);
      setDateTo(t);
    },
    fromRollupOnly: filtered.fromRollupOnly,
    leaderSort,
    setLeaderSort,
    selectedEventId,
    setSelectedEventId,
    filtered,
    health: computeHealthScores(rangeState, dateFrom, dateTo),
    healthHistory,
    alerts: computeAlerts(rangeState, dateFrom, dateTo),
    cache: summarizeCache(filtered.cacheEvents || []),
    queryStats: summarizeDurations(filtered.queries || []),
    queryStatsHour: summarizeDurations(
      filterSince(filtered.queries || [], 3600000)
    ),
    leaderboard: buildQueryLeaderboard(filtered.queries || [], leaderSort),
    rankings: buildDepartmentRankings(rangeState, dateFrom, dateTo),
    readsInRange: (filtered.reads || []).reduce(
      (a, r) => a + (r.docCount || 0),
      0
    ),
    readsHour: (filtered.reads || [])
      .filter((r) => r.at >= hourAgo)
      .reduce((a, r) => a + (r.docCount || 0), 0),
    readsSession: (state.reads || []).reduce(
      (a, r) => a + (r.docCount || 0),
      0
    ),
    // aliases used by existing UI
    readsToday: (filtered.reads || []).reduce(
      (a, r) => a + (r.docCount || 0),
      0
    ),
    readsByBucket: groupSum(filtered.reads || [], "bucket", "docCount"),
    readsByPage: groupSum(filtered.reads || [], "page", "docCount"),
    readsByDept: groupSum(filtered.reads || [], "department", "docCount"),
    readsByCollection: groupSum(
      filtered.reads || [],
      "collection",
      "docCount"
    ),
    activeListeners: (state.listeners || []).filter((l) => l.state === "Active"),
    sessionStorageBytes: estimateSessionStorageBytes(),
    perfStoreBytes: estimatePerfStoreBytes(),
    cachePayload: estimateCachePayloadBytes(),
    heap: getHeapEstimate(),
    tick,
    toggleMonitor: () => {
      const next = !isMonitorEnabled();
      setMonitorEnabled(next);
      setMonitorOn(next);
    },
    clearAll: () => {
      clearMetrics();
      setState(getState());
    },
    exportJson: () => {
      // Keep JSON available for deep debugging if needed
      const blob = new Blob([exportMetricsJson()], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mango-perf-${dateFrom}_to_${dateTo}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    exportPdf: () => {
      import("./exportPerformancePdf.js")
        .then((m) => m.downloadPerformancePdf({ dateFrom, dateTo }))
        .catch((err) => {
          console.error("[perf] PDF export failed:", err);
          alert("PDF export failed. See console for details.");
        });
    },
  };

  return (
    <PerfCtx.Provider value={{ state, ...derived }}>{children}</PerfCtx.Provider>
  );
}

export function usePerf() {
  const ctx = useContext(PerfCtx);
  if (!ctx) throw new Error("usePerf outside PerformanceProvider");
  return ctx;
}

function groupSum(items, key, valueKey) {
  const map = new Map();
  for (const item of items) {
    const k = item[key] || "unknown";
    map.set(k, (map.get(k) || 0) + (item[valueKey] || 0));
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}
