/**
 * Observer-only registry for waiting Firestore listeners + retry helpers.
 * Never changes clinical queries — only wraps recreate of the same tracked subscription.
 */

/** @typedef {'page_load'|'refresh'|'date_change'|'department_change'|'reconnect'|'retry'|'deps_change'|'unknown'} ListenReason */

/** @type {Map<string, {
 *   id: string,
 *   collection: string,
 *   page: string,
 *   department: string,
 *   reason: ListenReason,
 *   startedAt: number,
 *   waiting: boolean,
 *   firstAt: number | null,
 *   docCount: number | null,
 *   payloadBytes: number | null,
 *   durationMs: number | null,
 *   timeout10: boolean,
 *   timeout30: boolean,
 *   recreate: (() => void) | null,
 *   updateCount: number,
 *   changeCountSum: number,
 *   lastUpdateAt: number | null,
 *   lastIntervalMs: number | null,
 *   intervalSumMs: number,
 *   intervalCount: number,
 *   mergeMsSum: number,
 *   mergeMsCount: number,
 *   lastMergeMs: number | null,
 * }>} */
const active = new Map();

/** @type {Map<string, { reason: ListenReason, closedAt: number, collection: string, page: string }>} */
const recentCloses = new Map();

/** @type {Set<() => void>} */
const subscribers = new Set();

const CLOSE_RECREATE_MS = 5000;

function notify() {
  for (const fn of subscribers) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

function closeKey(page, collection) {
  return `${page}::${collection}`;
}

/**
 * @param {() => void} fn
 * @returns {() => void}
 */
export function subscribeListenerWatch(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function getActiveListenerCount() {
  return active.size;
}

/**
 * Live cost rollup across open tracked listeners (observer-only).
 * @returns {{
 *   activeCount: number,
 *   docSum: number,
 *   payloadBytesSum: number,
 *   updateCount: number,
 *   avgIntervalMs: number | null,
 *   updatesPerMin: number | null,
 *   avgMergeMs: number | null,
 * }}
 */
export function getListenerCostSummary() {
  let docSum = 0;
  let payloadBytesSum = 0;
  let updateCount = 0;
  let intervalSum = 0;
  let intervalCount = 0;
  let mergeSum = 0;
  let mergeCount = 0;
  const now = Date.now();
  let recentUpdates = 0;
  for (const e of active.values()) {
    if (e.docCount != null) docSum += e.docCount;
    if (e.payloadBytes != null) payloadBytesSum += e.payloadBytes;
    updateCount += e.updateCount || 0;
    if (e.intervalSumMs && e.intervalCount) {
      intervalSum += e.intervalSumMs;
      intervalCount += e.intervalCount;
    }
    if (e.mergeMsSum && e.mergeMsCount) {
      mergeSum += e.mergeMsSum;
      mergeCount += e.mergeMsCount;
    }
    if (e.lastUpdateAt && now - e.lastUpdateAt < 60_000) {
      recentUpdates += 1;
    }
  }
  return {
    activeCount: active.size,
    docSum,
    payloadBytesSum,
    updateCount,
    avgIntervalMs: intervalCount > 0 ? Math.round(intervalSum / intervalCount) : null,
    updatesPerMin: recentUpdates > 0 ? recentUpdates : null,
    avgMergeMs: mergeCount > 0 ? Math.round(mergeSum / mergeCount) : null,
  };
}

export function getWaitingListeners() {
  return [...active.values()].filter((e) => e.waiting);
}

export function getActiveListenerSnapshots() {
  return [...active.values()].map((e) => ({ ...e }));
}

export function getWaitingCount() {
  let n = 0;
  for (const e of active.values()) if (e.waiting) n += 1;
  return n;
}

export function getHungCount() {
  let n = 0;
  for (const e of active.values()) if (e.waiting && e.timeout30) n += 1;
  return n;
}

export function getLoadingPages() {
  const pages = new Set();
  for (const e of active.values()) {
    if (e.waiting) pages.add(e.page || "unknown");
  }
  return [...pages];
}

/**
 * Infer recreate pairing from a recent close of same page+collection.
 * @param {string} page
 * @param {string} collection
 * @param {ListenReason} annotated
 * @returns {{ reason: ListenReason, recreated: boolean }}
 */
export function resolveOpenReason(page, collection, annotated) {
  const key = closeKey(page, collection);
  const prev = recentCloses.get(key);
  if (prev && Date.now() - prev.closedAt < CLOSE_RECREATE_MS) {
    recentCloses.delete(key);
    if (annotated && annotated !== "page_load" && annotated !== "unknown") {
      return { reason: annotated, recreated: true };
    }
    if (prev.reason === "retry") return { reason: "retry", recreated: true };
    return {
      reason: prev.reason === "page_load" ? "deps_change" : prev.reason,
      recreated: true,
    };
  }
  return {
    reason: annotated || "page_load",
    recreated: false,
  };
}

/**
 * @param {object} entry
 */
export function registerListenerWatch(entry) {
  active.set(entry.id, {
    recreate: null,
    firstAt: null,
    docCount: null,
    payloadBytes: null,
    durationMs: null,
    timeout10: false,
    timeout30: false,
    waiting: true,
    updateCount: 0,
    changeCountSum: 0,
    lastUpdateAt: null,
    lastIntervalMs: null,
    intervalSumMs: 0,
    intervalCount: 0,
    mergeMsSum: 0,
    mergeMsCount: 0,
    lastMergeMs: null,
    ...entry,
  });
  notify();
}

export function setListenerRecreate(id, recreate) {
  const e = active.get(id);
  if (!e) return;
  e.recreate = recreate;
}

export function markListenerFirstSnapshot(id, { docCount, payloadBytes, durationMs, mergeMs }) {
  const e = active.get(id);
  if (!e) return;
  e.waiting = false;
  e.firstAt = Date.now();
  e.docCount = docCount ?? null;
  e.payloadBytes = payloadBytes ?? null;
  e.durationMs = durationMs ?? null;
  e.updateCount = (e.updateCount || 0) + 1;
  e.lastUpdateAt = e.firstAt;
  if (mergeMs != null && Number.isFinite(mergeMs)) {
    e.lastMergeMs = mergeMs;
    e.mergeMsSum = (e.mergeMsSum || 0) + mergeMs;
    e.mergeMsCount = (e.mergeMsCount || 0) + 1;
  }
  notify();
}

/**
 * Incremental update cost (docs / bytes / interval / merge).
 */
export function markListenerUpdate(id, { docCount, payloadBytes, changeCount, mergeMs } = {}) {
  const e = active.get(id);
  if (!e) return;
  const now = Date.now();
  if (e.lastUpdateAt != null) {
    const interval = now - e.lastUpdateAt;
    e.lastIntervalMs = interval;
    e.intervalSumMs = (e.intervalSumMs || 0) + interval;
    e.intervalCount = (e.intervalCount || 0) + 1;
  }
  e.lastUpdateAt = now;
  e.updateCount = (e.updateCount || 0) + 1;
  if (docCount != null) e.docCount = docCount;
  if (payloadBytes != null) e.payloadBytes = payloadBytes;
  if (changeCount != null) e.changeCountSum = (e.changeCountSum || 0) + changeCount;
  if (mergeMs != null && Number.isFinite(mergeMs)) {
    e.lastMergeMs = mergeMs;
    e.mergeMsSum = (e.mergeMsSum || 0) + mergeMs;
    e.mergeMsCount = (e.mergeMsCount || 0) + 1;
  }
  notify();
}

export function markListenerTimeout(id, which) {
  const e = active.get(id);
  if (!e || !e.waiting) return false;
  if (which === 10) e.timeout10 = true;
  if (which === 30) e.timeout30 = true;
  notify();
  return true;
}

export function unregisterListenerWatch(id, reason) {
  const e = active.get(id);
  if (e) {
    recentCloses.set(closeKey(e.page, e.collection), {
      reason: reason || e.reason || "deps_change",
      closedAt: Date.now(),
      collection: e.collection,
      page: e.page,
    });
    active.delete(id);
    notify();
  }
}

/**
 * User-initiated retry: recreate only waiting listeners on this page.
 * Does not reload the browser.
 * @returns {{ attempted: number, ids: string[] }}
 */
export function retryWaitingPageListeners() {
  const waiting = getWaitingListeners();
  const ids = [];
  for (const e of waiting) {
    if (typeof e.recreate === "function") {
      ids.push(e.id);
      try {
        // Mark close reason so reopen pairs as retry
        recentCloses.set(closeKey(e.page, e.collection), {
          reason: "retry",
          closedAt: Date.now(),
          collection: e.collection,
          page: e.page,
        });
        e.recreate();
      } catch {
        /* ignore individual failures */
      }
    }
  }
  notify();
  return { attempted: ids.length, ids };
}

/**
 * Read optional annotation on a Firestore query/ref without affecting queries.
 * @param {any} refOrQuery
 * @returns {ListenReason | null}
 */
export function readListenReasonAnnotation(refOrQuery) {
  try {
    const r = refOrQuery?.__mangoListenReason;
    if (typeof r === "string" && r) return /** @type {ListenReason} */ (r);
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Annotate a query object with a listen reason (telemetry only).
 * @param {any} refOrQuery
 * @param {ListenReason} reason
 */
export function annotateListenReason(refOrQuery, reason) {
  try {
    refOrQuery.__mangoListenReason = reason;
  } catch {
    /* ignore */
  }
  return refOrQuery;
}
