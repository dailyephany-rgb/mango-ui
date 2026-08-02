/**
 * Merge helpers for session + local + Firestore daily rollups.
 */

import { summarizeCache } from "./cacheMetrics.js";
import { summarizeDurations } from "./networkMetrics.js";

export const ROLLUP_CAPS = {
  pageLoads: 80,
  queries: 150,
  reads: 150,
  events: 80,
  longTasks: 40,
  incrementalSync: 100,
  cacheEvents: 100,
};

export function sampleKey(item) {
  return [
    item.at || item.startedAt || 0,
    item.page || "",
    item.department || "",
    item.collection || "",
    item.kind || item.type || "",
    item.label || "",
    item.durationMs ?? "",
    item.docCount ?? "",
    item.totalMs ?? "",
    item.initial === true ? "1" : item.initial === false ? "0" : "",
  ].join(":");
}

export function mergeUniqueByAt(a, b) {
  const map = new Map();
  for (const item of [...(a || []), ...(b || [])]) {
    if (!item || typeof item !== "object") continue;
    const key = sampleKey(item);
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()].sort(
    (x, y) => (x.at || x.startedAt || 0) - (y.at || y.startedAt || 0)
  );
}

function capTail(arr, n) {
  if (!arr || arr.length <= n) return arr || [];
  return arr.slice(-n);
}

/**
 * Merge two rollup payloads (same day / same device incremental flush).
 * Recomputes summary fields from merged samples where possible.
 */
export function mergeRollupRecords(a = {}, b = {}) {
  const pageLoads = capTail(
    mergeUniqueByAt(a.pageLoads, b.pageLoads),
    ROLLUP_CAPS.pageLoads
  );
  const queries = capTail(
    mergeUniqueByAt(a.queries, b.queries),
    ROLLUP_CAPS.queries
  );
  const reads = capTail(
    mergeUniqueByAt(a.reads, b.reads),
    ROLLUP_CAPS.reads
  );
  const events = capTail(
    mergeUniqueByAt(a.events, b.events),
    ROLLUP_CAPS.events
  );
  const longTasks = capTail(
    mergeUniqueByAt(a.longTasks, b.longTasks),
    ROLLUP_CAPS.longTasks
  );
  const incrementalSync = capTail(
    mergeUniqueByAt(a.incrementalSync, b.incrementalSync),
    ROLLUP_CAPS.incrementalSync
  );
  const cacheEvents = capTail(
    mergeUniqueByAt(a.cacheEvents, b.cacheEvents),
    ROLLUP_CAPS.cacheEvents
  );

  const readsFromSamples = reads.reduce((s, r) => s + (r.docCount || 0), 0);
  const readsTotal = Math.max(
    Number(a.readsTotal) || 0,
    Number(b.readsTotal) || 0,
    readsFromSamples
  );

  const cache = cacheEvents.length
    ? summarizeCache(cacheEvents)
    : b.cache || a.cache || {};

  const queryStats = queries.length
    ? summarizeDurations(queries)
    : b.queryStats || a.queryStats || null;

  return {
    date: b.date || a.date,
    clientId: b.clientId || a.clientId,
    pageLoads,
    queries,
    reads,
    events,
    longTasks,
    incrementalSync,
    cacheEvents,
    readsTotal,
    pageLoadCount: pageLoads.length,
    avgLoadMs: pageLoads.length
      ? pageLoads.reduce((s, l) => s + (l.totalMs || 0), 0) / pageLoads.length
      : 0,
    slowPages: pageLoads.filter((l) => (l.totalMs || 0) > 30000).length,
    cache,
    queryStats,
    scores: b.scores || a.scores || null,
    at: Math.max(Number(a.at) || 0, Number(b.at) || 0, Date.now()),
  };
}

/** Collapse many device-day rollups into sample lists for UI merge. */
export function flattenRollupSamples(rollups) {
  const list = rollups || [];
  return {
    pageLoads: list.flatMap((r) => r.pageLoads || []),
    queries: list.flatMap((r) => r.queries || []),
    reads: list.flatMap((r) => r.reads || []),
    events: list.flatMap((r) => r.events || []),
    longTasks: list.flatMap((r) => r.longTasks || []),
    incrementalSync: list.flatMap((r) => r.incrementalSync || []),
    cacheEvents: list.flatMap((r) => r.cacheEvents || []),
    readsTotal: list.reduce((s, r) => s + (Number(r.readsTotal) || 0), 0),
  };
}
