/**
 * Dashboard-only React context — polls performance store.
 * Date filter merges: live session + localStorage rollups + Firestore perf_daily.
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
  getHealthHistory as getLocalHealthHistory,
  getCountedReadsInRange,
  flushCountedReads,
} from "./performanceStore.js";
import {
  computeHealthScores,
  computeAlerts,
  persistTodayHealth,
  buildQueryLeaderboard,
  buildDepartmentRankings,
} from "./healthScorer.js";
import { summarizeCache } from "./cacheMetrics.js";
import {
  summarizeDurations,
  filterSince,
  todayKey,
  filterByDateRange,
} from "./networkMetrics.js";
import { getHeapEstimate } from "./renderMetrics.js";
import {
  mergeUniqueByAt,
  flattenRollupSamples,
} from "./rollupMerge.js";
import {
  fetchPerfDailyRange,
  combineLocalAndRemoteRollups,
  schedulePerfDailyFlush,
} from "./perfDailyFirestore.js";

const PerfCtx = createContext(null);

function buildFilteredView(state, dateFrom, dateTo, remoteRollups) {
  const sessionLoads = filterByDateRange(state.pageLoads || [], dateFrom, dateTo);
  const sessionQueries = filterByDateRange(state.queries || [], dateFrom, dateTo);
  const sessionReads = filterByDateRange(state.reads || [], dateFrom, dateTo);
  const sessionCache = filterByDateRange(state.cacheEvents || [], dateFrom, dateTo);
  const sessionEvents = filterByDateRange(state.events || [], dateFrom, dateTo);
  const sessionLong = filterByDateRange(state.longTasks || [], dateFrom, dateTo);
  const sessionInc = filterByDateRange(
    state.incrementalSync || [],
    dateFrom,
    dateTo
  );

  const localRollups = getDailyRollupsInRange(dateFrom, dateTo);
  const rollups = combineLocalAndRemoteRollups(localRollups, remoteRollups);
  const flat = flattenRollupSamples(rollups);

  const cacheEvents = mergeUniqueByAt(sessionCache, flat.cacheEvents);
  const cacheFromSummary =
    !cacheEvents.length && rollups.length
      ? rollups.flatMap((r) => {
          const c = r.cache || {};
          const out = [];
          for (let i = 0; i < (c.hits || 0); i++) {
            out.push({ at: r.at || 0, type: "hit", department: "Archived" });
          }
          for (let i = 0; i < (c.misses || 0); i++) {
            out.push({ at: r.at || 0, type: "miss", department: "Archived" });
          }
          return out;
        })
      : cacheEvents;

  return {
    pageLoads: mergeUniqueByAt(sessionLoads, flat.pageLoads),
    queries: mergeUniqueByAt(sessionQueries, flat.queries),
    reads: mergeUniqueByAt(sessionReads, flat.reads),
    cacheEvents: cacheFromSummary,
    events: mergeUniqueByAt(sessionEvents, flat.events),
    longTasks: mergeUniqueByAt(sessionLong, flat.longTasks),
    incrementalSync: mergeUniqueByAt(sessionInc, flat.incrementalSync),
    listeners: state.listeners || [],
    rollups,
    rollupReadsTotal: flat.readsTotal,
    fromArchive:
      sessionLoads.length === 0 &&
      sessionQueries.length === 0 &&
      rollups.length > 0,
  };
}

function healthFromRollups(rollups, dateFrom, dateTo) {
  const byDate = new Map();
  for (const r of rollups || []) {
    if (!r.date || r.date < dateFrom || r.date > dateTo) continue;
    if (!r.scores) continue;
    const prev = byDate.get(r.date);
    if (!prev || (r.at || 0) >= (prev.at || 0)) {
      byDate.set(r.date, { date: r.date, scores: r.scores, at: r.at || 0 });
    }
  }
  for (const h of getLocalHealthHistory()) {
    if (h.date < dateFrom || h.date > dateTo) continue;
    if (!byDate.has(h.date)) byDate.set(h.date, h);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
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
  const [remoteRollups, setRemoteRollups] = useState([]);
  const [remoteStatus, setRemoteStatus] = useState("idle");
  const [remoteError, setRemoteError] = useState("");

  useEffect(() => {
    const unsub = subscribeStore((s) =>
      setState({ ...s, pageLoads: [...(s.pageLoads || [])] })
    );
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    persistTodayHealth();
    schedulePerfDailyFlush({ delayMs: 1500 });
    return () => {
      unsub();
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRemoteStatus("loading");
    setRemoteError("");
    fetchPerfDailyRange(dateFrom, dateTo)
      .then((rows) => {
        if (cancelled) return;
        setRemoteRollups(rows || []);
        setRemoteStatus("ok");
      })
      .catch((err) => {
        if (cancelled) return;
        setRemoteRollups([]);
        setRemoteStatus("error");
        setRemoteError(err?.message || String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo]);

  const filtered = useMemo(
    () => buildFilteredView(state, dateFrom, dateTo, remoteRollups),
    [state, dateFrom, dateTo, remoteRollups, tick]
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
    incrementalSync: filtered.incrementalSync,
  };

  const healthHistory = healthFromRollups(filtered.rollups, dateFrom, dateTo);

  const sampleReads = (filtered.reads || []).reduce(
    (a, r) => a + (r.docCount || 0),
    0
  );
  const countedLocal = getCountedReadsInRange(dateFrom, dateTo);
  const readsInRange = Math.max(
    sampleReads,
    filtered.rollupReadsTotal || 0,
    countedLocal
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
    fromRollupOnly: filtered.fromArchive,
    remoteStatus,
    remoteError,
    remoteCount: remoteRollups.length,
    refreshRemote: () => {
      setRemoteStatus("loading");
      fetchPerfDailyRange(dateFrom, dateTo).then((rows) => {
        setRemoteRollups(rows || []);
        setRemoteStatus("ok");
      });
      schedulePerfDailyFlush({ force: true });
    },
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
    readsInRange,
    readsCountedLocal: countedLocal,
    readsHour: (filtered.reads || [])
      .filter((r) => r.at >= hourAgo)
      .reduce((a, r) => a + (r.docCount || 0), 0),
    readsSession: (state.reads || []).reduce(
      (a, r) => a + (r.docCount || 0),
      0
    ),
    readsToday: readsInRange,
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
        .then((m) =>
          m.downloadPerformancePdf({
            dateFrom,
            dateTo,
            remoteRollups,
          })
        )
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
