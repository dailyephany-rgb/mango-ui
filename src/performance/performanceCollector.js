/**
 * Public recording API for passive instrumentation.
 */

import {
  mutate,
  recordToRing,
  isMonitorEnabled,
  getState,
  addCountedReads,
} from "./performanceStore.js";
import {
  classifyCollection,
  departmentForCollection,
  resolvePageIdentity,
} from "./firestoreMetrics.js";
import { getHeapEstimate } from "./renderMetrics.js";
import { PAGE_LOAD_SLOW_MS, PAGE_LOAD_RED_MS } from "./pageLoadBands.js";

let pageCtx = null;
let firstSnapshotRecorded = false;
let pageLoadStartedAt = 0;
let cacheHitOnLoad = false;
let queryCountOnPage = 0;

export function getPageContext() {
  if (!pageCtx) pageCtx = resolvePageIdentity();
  return pageCtx;
}

export function setPageContext(ctx) {
  pageCtx = ctx;
}

export function markPageLoadStart(navStartMs) {
  pageLoadStartedAt = navStartMs || performance.now();
  firstSnapshotRecorded = false;
  cacheHitOnLoad = false;
  queryCountOnPage = 0;
}

export function markCacheHitOnLoad() {
  cacheHitOnLoad = true;
}

export function recordEvent(partial) {
  if (!isMonitorEnabled()) return;
  const ctx = getPageContext();
  recordToRing("events", {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: Date.now(),
    page: ctx.page,
    department: ctx.department,
    ...partial,
  });
}

export function recordCacheEvent(partial) {
  if (!isMonitorEnabled()) return;
  const ctx = getPageContext();
  recordToRing("cacheEvents", {
    at: Date.now(),
    page: ctx.page,
    department: ctx.department,
    ...partial,
  });
  if (partial.type === "hit") markCacheHitOnLoad();
  if (partial.type === "miss") {
    recordEvent({ kind: "cache_miss", message: `Cache miss ${partial.key || ""}` });
  }
}

export function recordRead({ collection, docCount, source }) {
  if (!isMonitorEnabled()) return;
  const ctx = getPageContext();
  const bucket = classifyCollection(collection);
  const dept =
    departmentForCollection(collection) || ctx.department || "Unknown";
  const n = docCount || 0;
  addCountedReads(n);
  recordToRing("reads", {
    at: Date.now(),
    page: ctx.page,
    department: dept,
    collection: collection || "unknown",
    bucket,
    docCount: n,
    source: source || "snapshot",
  });
}

export function recordQuery(partial) {
  if (!isMonitorEnabled()) return;
  const ctx = getPageContext();
  queryCountOnPage += 1;
  const collection = partial.collection || "unknown";
  recordToRing("queries", {
    at: Date.now(),
    page: ctx.page,
    department:
      departmentForCollection(collection) || ctx.department || "Unknown",
    collection,
    bucket: classifyCollection(collection),
    durationMs: partial.durationMs || 0,
    docCount: partial.docCount || 0,
    kind: partial.kind || "snapshot",
    queryKey: partial.queryKey || collection,
  });

  if ((partial.durationMs || 0) >= 5000) {
    recordEvent({
      kind: "slow_query",
      message: `Query ${collection} ${Math.round(partial.durationMs)}ms`,
      durationMs: partial.durationMs,
      collection,
      docCount: partial.docCount,
    });
  }
  if ((partial.docCount || 0) >= 500) {
    recordEvent({
      kind: "large_snapshot",
      message: `Large snapshot ${collection}: ${partial.docCount} docs`,
      collection,
      docCount: partial.docCount,
    });
  }
}

export function upsertListener(listener) {
  if (!isMonitorEnabled()) return;
  mutate((s) => {
    const idx = s.listeners.findIndex((l) => l.id === listener.id);
    if (idx >= 0) s.listeners[idx] = { ...s.listeners[idx], ...listener };
    else {
      s.listeners.push(listener);
      if (s.listeners.length > 80) s.listeners.splice(0, s.listeners.length - 80);
    }
  });
}

export function closeListener(id) {
  if (!isMonitorEnabled()) return;
  mutate((s) => {
    const l = s.listeners.find((x) => x.id === id);
    if (l) {
      l.state = "Closed";
      l.closedAt = Date.now();
      l.durationMs = (l.closedAt || Date.now()) - (l.startedAt || Date.now());
    }
  });
}

export function onFirstSnapshot({ collection, docCount, arrivalMs }) {
  if (!isMonitorEnabled()) return;
  if (firstSnapshotRecorded) return;
  firstSnapshotRecorded = true;
  const ctx = getPageContext();
  mutate((s) => {
    s.pageMeta[ctx.page] = {
      ...(s.pageMeta[ctx.page] || {}),
      firstSnapshotAt: Date.now(),
      firstSnapshotMs: arrivalMs,
      firstSnapshotCollection: collection,
      firstSnapshotDocs: docCount,
    };
  });
}

/**
 * Finalize a page load measurement and optionally Slow Page Recorder.
 */
export function finalizePageLoad(timings) {
  if (!isMonitorEnabled()) return;
  const ctx = getPageContext();
  const state = getState();
  const prev = (state.pageLoads || [])
    .filter((p) => p.page === ctx.page && (p.totalMs || 0) < PAGE_LOAD_SLOW_MS)
    .slice(-1)[0];

  const activeListeners = (state.listeners || []).filter(
    (l) => l.state === "Active" && l.page === ctx.page
  ).length;

  const heap = getHeapEstimate();
  const record = {
    at: Date.now(),
    page: ctx.page,
    department: ctx.department,
    navigationStart: timings.navigationStart ?? 0,
    firstPaintMs: timings.firstPaintMs ?? null,
    firstRenderMs: timings.firstRenderMs ?? null,
    firstSnapshotMs: timings.firstSnapshotMs ?? null,
    interactiveMs: timings.interactiveMs ?? null,
    totalMs: timings.totalMs ?? null,
    cacheHit: cacheHitOnLoad,
    queryCount: queryCountOnPage,
    listenerCount: activeListeners,
    snapshotDocCount: timings.snapshotDocCount ?? null,
    networkOnline:
      typeof navigator !== "undefined" ? navigator.onLine !== false : true,
    heapUsed: heap?.usedJSHeapSize ?? null,
    previousSuccessfulLoadMs: prev?.totalMs ?? null,
  };

  recordToRing("pageLoads", record);

  mutate((s) => {
    s.pageMeta[ctx.page] = {
      ...(s.pageMeta[ctx.page] || {}),
      lastLoad: record,
    };
  });

  const total = record.totalMs || 0;
  if (total >= PAGE_LOAD_SLOW_MS) {
    const band = total >= PAGE_LOAD_RED_MS ? "red (≥1min)" : "orange (30s–1min)";
    recordEvent({
      kind: "slow_page",
      message: `Slow page ${ctx.page} [${band}]: ${Math.round(total)}ms`,
      ...record,
      replay: buildReplayChain(record, timings),
    });
  }
}

function buildReplayChain(record, timings) {
  return [
    { step: "Opened", atOffsetMs: 0, detail: record.page },
    {
      step: record.cacheHit ? "Cache Hit" : "Cache Miss",
      atOffsetMs: Math.round(timings.firstRenderMs || 50),
      detail: record.cacheHit ? "session paint" : "no session cache",
    },
    {
      step: "Firestore Query",
      atOffsetMs: Math.round(
        (timings.firstSnapshotMs || timings.interactiveMs || totalSafe(record)) *
          0.7
      ),
      detail: `${record.queryCount} queries`,
    },
    {
      step: "Docs",
      atOffsetMs: Math.round(timings.firstSnapshotMs || 0),
      detail: `${record.snapshotDocCount ?? "?"} docs`,
    },
    {
      step: "Snapshot",
      atOffsetMs: Math.round(timings.firstSnapshotMs || 0),
      detail: "first snapshot",
    },
    {
      step: "Interactive",
      atOffsetMs: Math.round(timings.interactiveMs || 0),
      detail: "page interactive",
    },
    {
      step: "Page Loaded",
      atOffsetMs: Math.round(record.totalMs || 0),
      detail: `${Math.round(record.totalMs || 0)}ms`,
    },
  ];
}

function totalSafe(record) {
  return record.totalMs || 0;
}

export function recordOwnerPaint(durationMs, key) {
  recordCacheEvent({ type: "owner_paint", durationMs, key });
}

export function recordOwnerRefresh(durationMs, key) {
  recordCacheEvent({ type: "owner_refresh", durationMs, key });
}

/**
 * Incremental docChanges() processing metrics (client-side CPU, not billed reads).
 * @param {{
 *  label?: string,
 *  initial?: boolean,
 *  added?: number,
 *  modified?: number,
 *  removed?: number,
 *  processed?: number,
 *  mapSize?: number,
 *  durationMs?: number,
 * }} stats
 */
export function recordIncrementalSync(stats) {
  if (!isMonitorEnabled()) return;
  const ctx = getPageContext();
  recordToRing("incrementalSync", {
    at: Date.now(),
    page: ctx.page,
    department: ctx.department,
    label: stats.label || "",
    initial: !!stats.initial,
    added: stats.added || 0,
    modified: stats.modified || 0,
    removed: stats.removed || 0,
    processed: stats.processed || 0,
    mapSize: stats.mapSize || 0,
    durationMs: stats.durationMs || 0,
  });
}
