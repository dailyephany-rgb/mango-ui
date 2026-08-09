/**
 * Flush Engineering buffer → Engineering Firestore (batched, best-effort, retried).
 * Never blocks clinical; never throws to callers.
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import {
  getEngDb,
  isEngFirebaseConfigured,
  isEngDbSafe,
} from "../firebaseEngConfig.js";
import {
  noteEngWriteError,
  noteEngWriteOk,
  shouldSkipEngWrite,
} from "./engWriteHealth.js";
import { ENG_COLLECTIONS } from "../constants.js";
import {
  drainEvents,
  loadSpill,
  clearSpill,
  replaceSpill,
  pushEvent,
  spillToSession,
  peekEvents,
  bufferSize,
} from "./buffer.js";
import { getDeviceId, getDeviceLabel } from "./deviceId.js";
import { isEngTelemetryEnabled } from "./killSwitch.js";
import { safeRun } from "./safeRun.js";
import { getRuntimeSettings } from "./runtimeSettings.js";
import { computeHealthScore } from "../health/scores.js";
import {
  dayKey,
  hourKey,
  buildTimeFields,
  buildEngMeta,
  compactMeta,
  SCHEMA_VERSION,
  TELEMETRY_VERSION,
} from "./metadata.js";
import {
  writeRollingDailyDoc,
  percentile,
} from "./rollingAgg.js";
import { expireAtForCollection } from "./expireAt.js";

let flushing = false;
/** When force flush arrives mid-flight, run once more after current finishes. */
let flushAgain = false;
/** @type {object[][]} */
let retryQueue = [];
let retryTimer = null;

/** Meta slice from a buffer event for eng_* persistence */
function metaFromEvent(e, deviceId, deviceLabel) {
  return compactMeta(
    buildEngMeta({
      ts: e.ts || Date.now(),
      deviceId: e.deviceId || deviceId,
      sessionId: e.sessionId || null,
      loadId: e.loadId || null,
      pageId: e.pageId || e.page || null,
      page: e.page || null,
      moduleId: e.moduleId || null,
      componentId: e.componentId || null,
      department: e.department || null,
      buildId: e.buildId || null,
      appVersion: e.appVersion || e.buildId || null,
      platform: e.platform || null,
      browser: e.browser || null,
      label: e.label || deviceLabel || null,
      user: e.user || null,
    })
  );
}

/**
 * @param {{ force?: boolean }} [opts]
 */
export function scheduleFlush(opts = {}) {
  safeRun(() => {
    if (!isEngTelemetryEnabled()) return;
    const run = () => {
      flushNow(opts).catch(() => {});
    };
    if (typeof requestIdleCallback === "function" && !opts.force) {
      requestIdleCallback(() => run(), { timeout: 4000 });
    } else {
      setTimeout(run, opts.force ? 0 : 50);
    }
  }, "eng.scheduleFlush");
}

/**
 * Best-effort leave hint via sendBeacon when VITE_ENG_BEACON_URL is set.
 * Firestore cannot be written via beacon; spill + force flush still run from bootstrap.
 * Never blocks clinical unload.
 */
export function flushViaBeacon() {
  safeRun(() => {
    if (!isEngTelemetryEnabled()) return;
    spillToSession();
    const url =
      (typeof import.meta !== "undefined" &&
        import.meta.env?.VITE_ENG_BEACON_URL) ||
      null;
    if (!url || typeof navigator === "undefined" || !navigator.sendBeacon) {
      return;
    }
    const payload = JSON.stringify({
      type: "mango.eng.flush.hint",
      deviceId: getDeviceId(),
      pending: bufferSize(),
      sample: peekEvents()
        .slice(-5)
        .map((e) => ({
          domain: e.domain,
          ts: e.ts,
          page: e.page,
        })),
      ts: Date.now(),
    });
    navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
  }, "eng.beacon");
}

function enqueueRetry(events) {
  if (!events?.length) return;
  retryQueue.push(events);
  if (retryQueue.length > 5) retryQueue.shift();
  if (retryTimer) return;
  let attempt = 0;
  const tick = () => {
    attempt += 1;
    const delay = Math.min(30_000, 1000 * 2 ** attempt);
    retryTimer = setTimeout(async () => {
      retryTimer = null;
      const batch = retryQueue.shift();
      if (!batch) return;
      try {
        await deliverEvents(batch);
        clearSpill();
      } catch {
        if (attempt < 5) {
          retryQueue.unshift(batch);
          tick();
        } else {
          replaceSpill(batch);
          for (const e of batch) pushEvent(e);
        }
      }
    }, delay);
  };
  tick();
}

/**
 * @param {{ force?: boolean }} [opts]
 */
export async function flushNow(opts = {}) {
  if (flushing) {
    // Never run concurrent flushes (race cleared spill / dropped page_loads).
    if (opts.force) flushAgain = true;
    return;
  }
  if (!isEngTelemetryEnabled()) return;
  if (shouldSkipEngWrite() && !opts.force) return;
  flushing = true;
  try {
    const spilled = loadSpill();
    const drained = drainEvents();
    const events = [...spilled, ...drained];
    if (!events.length) return;

    const db = getEngDb();
    if (!db || !isEngFirebaseConfigured() || !isEngDbSafe(db)) {
      for (const e of events) pushEvent(e);
      return;
    }

    // Clear spill only after successful deliver (crash mid-flush must not lose events).
    try {
      await deliverEvents(events);
      clearSpill();
      noteEngWriteOk();
    } catch (err) {
      noteEngWriteError(err);
      replaceSpill(events);
      enqueueRetry(events);
    }
  } catch {
    /* swallow */
  } finally {
    flushing = false;
    if (flushAgain) {
      flushAgain = false;
      scheduleFlush({ force: true });
    }
  }
}

async function deliverEvents(events) {
  const db = getEngDb();
  if (!db || !isEngDbSafe(db)) throw new Error("eng-db-missing-or-unsafe");
  const deviceId = getDeviceId();
  const deviceLabel = getDeviceLabel() || null;
  const byDomain = groupBy(events, (e) => e.domain || "misc");
  const settings = getRuntimeSettings();

  const results = await Promise.allSettled([
    flushQueries(db, byDomain.firestore || [], deviceId, settings),
    flushListeners(db, byDomain.listeners || [], deviceId),
    flushFirestoreByComponent(
      db,
      byDomain.firestore || [],
      byDomain.listeners || [],
      deviceId,
      deviceLabel,
      settings
    ),
    flushPages(db, byDomain.pages || [], deviceId, deviceLabel),
    flushComponents(db, byDomain.components || [], deviceId, deviceLabel),
    flushMemory(db, byDomain.memory || [], deviceId),
    flushNetwork(db, byDomain.network || [], deviceId),
    flushReact(db, byDomain.react || [], deviceId),
    flushErrors(db, byDomain.errors || [], deviceId),
    flushBuilds(db, byDomain.builds || [], deviceId),
    flushDepartments(db, events, deviceId),
    flushHealthAndAlerts(db, events, deviceId, settings),
  ]);

  const failed = results.some((r) => r.status === "rejected");
  if (failed) throw new Error("eng-flush-partial");
}

function groupBy(arr, keyFn) {
  const out = {};
  for (const item of arr) {
    const k = keyFn(item);
    (out[k] || (out[k] = [])).push(item);
  }
  return out;
}

async function flushQueries(db, events, deviceId, settings) {
  if (!events.length) return;
  const deviceLabel = getDeviceLabel();
  const slowMs = settings.slowQueryMs ?? 2000;
  const agg = {};
  for (const e of events) {
    const col = e.collection || "unknown";
    const kind = e.kind || "unknown";
    const day = dayKey(e.ts || Date.now());
    const key = `${day}|${col}|${kind}`;
    if (!agg[key]) {
      agg[key] = {
        day,
        collection: col,
        kind,
        count: 0,
        docCountSum: 0,
        durationSum: 0,
        durations: [],
        slowCount: 0,
        writes: 0,
        failures: 0,
        reconnects: 0,
        earliestTs: e.ts || Date.now(),
        latestTs: e.ts || Date.now(),
        sample: e,
      };
    }
    const a = agg[key];
    a.count += 1;
    a.docCountSum += e.docCount || 0;
    const dur = e.durationMs || 0;
    a.durationSum += dur;
    a.durations.push(dur);
    if (dur >= slowMs) a.slowCount += 1;
    if (kind === "write") a.writes += 1;
    if (e.failure) a.failures += 1;
    if (e.reconnect) a.reconnects += 1;
    const ts = e.ts || Date.now();
    if (ts < a.earliestTs) a.earliestTs = ts;
    if (ts > a.latestTs) a.latestTs = ts;
    a.sample = e;
  }

  await Promise.all(
    Object.values(agg).map((a) => {
      const id = `${a.day}_${deviceId}_${a.collection}_${a.kind}`.replace(
        /[^a-zA-Z0-9_-]/g,
        "_"
      );
      const meta = metaFromEvent(a.sample, deviceId, deviceLabel);
      return writeRollingDailyDoc(db, ENG_COLLECTIONS.firestoreMetrics, id, {
        meta: {
          ...meta,
          day: a.day,
          dateKey: a.day,
          collection: a.collection,
          kind: a.kind,
          // keep page/module from last sample but prefer event fields
          page: a.sample.page || meta.page,
          moduleId: a.sample.moduleId || meta.moduleId,
        },
        increments: {
          queryCount: a.count,
          docCountSum: a.docCountSum,
          durationSumMs: a.durationSum,
          slowCount: a.slowCount,
          writes: a.writes,
          failures: a.failures,
          reconnects: a.reconnects,
        },
        durations: a.durations,
        earliestTs: a.earliestTs,
        latestTs: a.latestTs,
        avgFrom: {
          sumField: "durationSumMs",
          countField: "queryCount",
          outField: "avgQueryMs",
          batchSum: a.durationSum,
          batchCount: a.count,
        },
      });
    })
  );
}

/**
 * Firestore-by-Component — observer-only aggregates attributed to first-class modules.
 * Writes:
 *   eng_firestore_by_component — daily module × collection × kind
 *   eng_fs_component_loads — one doc per loadId (linked to Timeline / Components)
 */
async function flushFirestoreByComponent(
  db,
  firestoreEvents,
  listenerEvents,
  deviceId,
  deviceLabel,
  settings
) {
  const events = [...(firestoreEvents || []), ...(listenerEvents || [])];
  if (!events.length) return;

  const slowMs = settings.slowQueryMs ?? 2000;
  const dayAgg = {};
  /** @type {Map<string, object>} */
  const byLoad = new Map();

  const ensureDay = (e, col, kind) => {
    const moduleId = e.moduleId || e.page || "unknown";
    const pageId = e.pageId || e.page || "unknown";
    const day = dayKey(e.ts);
    const key = `${day}|${deviceId}|${moduleId}|${col}|${kind}`;
    if (!dayAgg[key]) {
      dayAgg[key] = {
        day,
        deviceId,
        page: pageId,
        moduleId,
        collection: col,
        kind,
        queryCount: 0,
        reads: 0,
        writes: 0,
        listeners: 0,
        docCountSum: 0,
        durationSum: 0,
        durationMax: 0,
        durations: [],
        slowCount: 0,
        firstSnapCount: 0,
        firstSnapSumMs: 0,
        subsequentCount: 0,
        estimatedDocReads: 0,
        queryKeyInc: {},
        constraintsSample: null,
        earliestTs: e.ts || Date.now(),
        latestTs: e.ts || Date.now(),
        sample: e,
      };
    }
    const row = dayAgg[key];
    const ets = e.ts || Date.now();
    if (ets < row.earliestTs) row.earliestTs = ets;
    if (ets > row.latestTs) row.latestTs = ets;
    row.sample = e;
    return row;
  };

  const ensureLoad = (e) => {
    const loadId =
      e.loadId ||
      `${deviceId}_${e.ts || Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    if (!byLoad.has(loadId)) {
      byLoad.set(loadId, {
        loadId,
        ts: e.ts || Date.now(),
        page: e.pageId || e.page || "unknown",
        department: e.department || null,
        deviceId,
        label: e.label || deviceLabel || null,
        buildId: e.buildId || null,
        modules: {},
        queries: {},
        timeline: [],
      });
    }
    const row = byLoad.get(loadId);
    if ((e.ts || 0) > (row.ts || 0)) row.ts = e.ts;
    return row;
  };

  const bumpModule = (load, moduleId, patch) => {
    if (!load.modules[moduleId]) {
      load.modules[moduleId] = {
        moduleId,
        reads: 0,
        writes: 0,
        listeners: 0,
        queries: 0,
        slow: 0,
        docCountSum: 0,
        durationSum: 0,
        firstSnapCount: 0,
        firstSnapSumMs: 0,
        subsequentCount: 0,
        estimatedDocReads: 0,
        collections: {},
      };
    }
    const m = load.modules[moduleId];
    for (const [k, v] of Object.entries(patch)) {
      if (k === "collections") continue;
      m[k] = (m[k] || 0) + (v || 0);
    }
    if (patch._collection) {
      const c = patch._collection;
      if (!m.collections[c]) {
        m.collections[c] = {
          reads: 0,
          writes: 0,
          listeners: 0,
          queries: 0,
          slow: 0,
          docCountSum: 0,
        };
      }
      const mc = m.collections[c];
      mc.reads += patch.reads || 0;
      mc.writes += patch.writes || 0;
      mc.listeners += patch.listeners || 0;
      mc.queries += patch.queries || 0;
      mc.slow += patch.slow || 0;
      mc.docCountSum += patch.docCountSum || 0;
    }
  };

  for (const e of events) {
    const col = e.collection || "unknown";
    const moduleId = e.moduleId || e.page || "unknown";
    const load = ensureLoad(e);
    const dur = e.durationMs || 0;
    const docs = e.docCount || 0;
    const isSlow = e.slow || dur >= slowMs;

    if (e.domain === "listeners") {
      const action = e.action || "";
      // Opens only — snapshot metrics come from firestore-domain trackQuery
      // (avoids double-counting first/incremental snapshots).
      if (action === "open") {
        const a = ensureDay(e, col, "listener_open");
        a.listeners += 1;
        a.queryCount += 1;
        bumpModule(load, moduleId, {
          listeners: 1,
          queries: 1,
          _collection: col,
        });
        if (load.timeline.length < 40) {
          load.timeline.push({
            ts: e.ts,
            moduleId,
            collection: col,
            operation: "listener_open",
            componentId: e.componentId || null,
          });
        }
      }
      continue;
    }

    // firestore domain
    const kind = e.kind || "query";
    const a = ensureDay(e, col, kind);
    a.queryCount += 1;
    a.durationSum += dur;
    a.durationMax = Math.max(a.durationMax, dur);
    if (typeof dur === "number" && Number.isFinite(dur)) a.durations.push(dur);
    a.docCountSum += docs;
    if (isSlow) a.slowCount += 1;
    if (e.firstSnapshot) {
      a.firstSnapCount += 1;
      a.firstSnapSumMs += dur;
    }
    if (e.subsequentSnapshot) a.subsequentCount += 1;

    const isWrite = kind === "write" || kind === "batch_write";
    if (isWrite) {
      a.writes += 1;
    } else {
      a.reads += 1;
      a.estimatedDocReads += docs;
    }

    if (e.queryKey) {
      const qk = String(e.queryKey).slice(0, 160);
      a.queryKeyInc[qk] = (a.queryKeyInc[qk] || 0) + 1;
      load.queries[qk] = load.queries[qk] || {
        queryKey: qk,
        collection: col,
        kind,
        moduleId,
        count: 0,
        durationSum: 0,
        slow: 0,
        constraints: null,
      };
      load.queries[qk].count += 1;
      load.queries[qk].durationSum += dur;
      if (isSlow) load.queries[qk].slow += 1;
      if (e.constraints && !load.queries[qk].constraints) {
        load.queries[qk].constraints = e.constraints;
      }
    }
    if (e.constraints && !a.constraintsSample) {
      a.constraintsSample = e.constraints;
    }

    bumpModule(load, moduleId, {
      reads: isWrite ? 0 : 1,
      writes: isWrite ? 1 : 0,
      queries: 1,
      slow: isSlow ? 1 : 0,
      docCountSum: docs,
      durationSum: dur,
      firstSnapCount: e.firstSnapshot ? 1 : 0,
      firstSnapSumMs: e.firstSnapshot ? dur : 0,
      subsequentCount: e.subsequentSnapshot ? 1 : 0,
      estimatedDocReads: isWrite ? 0 : docs,
      _collection: col,
    });

    if (load.timeline.length < 40) {
      load.timeline.push({
        ts: e.ts,
        moduleId,
        collection: col,
        operation: kind,
        durationMs: dur,
        docCount: docs,
        slow: !!isSlow,
        componentId: e.componentId || null,
      });
    }
  }

  const dayWrites = Object.values(dayAgg).map(async (a) => {
    const id = `${a.day}_${deviceId}_${a.moduleId}_${a.collection}_${a.kind}`.replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );
    const meta = metaFromEvent(a.sample || {}, deviceId, deviceLabel);
    const increments = {
      queryCount: a.queryCount,
      reads: a.reads,
      writes: a.writes,
      listeners: a.listeners,
      docCountSum: a.docCountSum,
      durationSumMs: a.durationSum,
      slowCount: a.slowCount,
      firstSnapCount: a.firstSnapCount,
      firstSnapSumMs: a.firstSnapSumMs,
      subsequentCount: a.subsequentCount,
      estimatedDocReads: a.estimatedDocReads,
    };
    for (const [qk, n] of Object.entries(a.queryKeyInc)) {
      const safe = qk.replace(/[./\[\]]/g, "_").slice(0, 120);
      increments[`qk_${safe}`] = n;
    }
    await writeRollingDailyDoc(db, ENG_COLLECTIONS.firestoreByComponent, id, {
      meta: {
        ...meta,
        day: a.day,
        dateKey: a.day,
        deviceId,
        page: a.page,
        pageId: a.page,
        moduleId: a.moduleId,
        collection: a.collection,
        kind: a.kind,
      },
      increments,
      durations: a.durations,
      earliestTs: a.earliestTs,
      latestTs: a.latestTs,
      absolute: a.constraintsSample
        ? { constraintsSample: a.constraintsSample }
        : undefined,
      avgFrom: {
        sumField: "durationSumMs",
        countField: "queryCount",
        outField: "avgQueryMs",
        batchSum: a.durationSum,
        batchCount: a.queryCount,
      },
    });
  });

  const loadWrites = [...byLoad.values()].map(async (load) => {
    const ref = doc(db, ENG_COLLECTIONS.fsComponentLoads, load.loadId);
    let prevTimeline = [];
    let prevQueries = [];
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const prev = snap.data() || {};
        prevTimeline = Array.isArray(prev.recentTimeline)
          ? prev.recentTimeline
          : [];
        prevQueries = Array.isArray(prev.recentQueries)
          ? prev.recentQueries
          : [];
      }
    } catch {
      /* ignore */
    }

    const payload = {
      loadId: load.loadId,
      ts: load.ts,
      day: dayKey(load.ts),
      deviceId,
      label: load.label,
      page: load.page,
      pageId: load.page,
      department: load.department,
      buildId: load.buildId,
      schemaVersion: SCHEMA_VERSION,
      telemetryVersion: TELEMETRY_VERSION,
      updatedAt: serverTimestamp(),
      expireAt: expireAtForCollection(ENG_COLLECTIONS.fsComponentLoads),
    };
    for (const m of Object.values(load.modules)) {
      const mid = String(m.moduleId).replace(/\./g, "_");
      const p = `m__${mid}`;
      payload[`${p}__reads`] = increment(m.reads || 0);
      payload[`${p}__writes`] = increment(m.writes || 0);
      payload[`${p}__listeners`] = increment(m.listeners || 0);
      payload[`${p}__queries`] = increment(m.queries || 0);
      payload[`${p}__slow`] = increment(m.slow || 0);
      payload[`${p}__docCountSum`] = increment(m.docCountSum || 0);
      payload[`${p}__durationSum`] = increment(m.durationSum || 0);
      payload[`${p}__firstSnapCount`] = increment(m.firstSnapCount || 0);
      payload[`${p}__firstSnapSumMs`] = increment(m.firstSnapSumMs || 0);
      payload[`${p}__subsequentCount`] = increment(m.subsequentCount || 0);
      payload[`${p}__estimatedDocReads`] = increment(
        m.estimatedDocReads || 0
      );
      estBatch += m.estimatedDocReads || 0;
      for (const [cname, c] of Object.entries(m.collections || {})) {
        const safeCol = String(cname).replace(/[^a-zA-Z0-9_]/g, "_");
        const cp = `${p}__c__${safeCol}`;
        payload[`${cp}__reads`] = increment(c.reads || 0);
        payload[`${cp}__writes`] = increment(c.writes || 0);
        payload[`${cp}__listeners`] = increment(c.listeners || 0);
        payload[`${cp}__queries`] = increment(c.queries || 0);
        payload[`${cp}__slow`] = increment(c.slow || 0);
        payload[`${cp}__docCountSum`] = increment(c.docCountSum || 0);
      }
    }
    payload.estimatedDocReads = increment(estBatch);

    const mergedTimeline = [...prevTimeline, ...load.timeline]
      .filter((t) => t && typeof t === "object")
      .sort((a, b) => (a.ts || 0) - (b.ts || 0))
      .slice(-40);
    payload.recentTimeline = mergedTimeline;

    /** @type {Map<string, object>} */
    const qMap = new Map();
    for (const q of prevQueries) {
      if (q?.queryKey) qMap.set(q.queryKey, { ...q });
    }
    for (const q of Object.values(load.queries)) {
      const prev = qMap.get(q.queryKey);
      if (!prev) {
        qMap.set(q.queryKey, {
          queryKey: q.queryKey,
          collection: q.collection,
          kind: q.kind,
          moduleId: q.moduleId,
          count: q.count,
          durationSum: q.durationSum,
          slow: q.slow,
          constraints: q.constraints || null,
        });
      } else {
        prev.count = (prev.count || 0) + (q.count || 0);
        prev.durationSum = (prev.durationSum || 0) + (q.durationSum || 0);
        prev.slow = (prev.slow || 0) + (q.slow || 0);
        if (!prev.constraints && q.constraints) prev.constraints = q.constraints;
      }
    }
    payload.recentQueries = [...qMap.values()]
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, 40)
      .map((q) => ({
        queryKey: q.queryKey,
        collection: q.collection,
        kind: q.kind,
        moduleId: q.moduleId,
        count: q.count,
        avgMs: q.count ? (q.durationSum || 0) / q.count : null,
        slow: q.slow,
        constraints: q.constraints || null,
      }));
    payload.moduleIds = Object.keys(load.modules);
    return setDoc(ref, payload, { merge: true });
  });

  await Promise.all([...dayWrites, ...loadWrites]);
}

async function flushListeners(db, events, deviceId) {
  if (!events.length) return;
  const deviceLabel = getDeviceLabel();
  /** @type {Record<string, object>} */
  const byKey = {};
  for (const e of events) {
    const col = e.collection || "unknown";
    const day = dayKey(e.ts || Date.now());
    const key = `${day}|${col}`;
    if (!byKey[key]) {
      byKey[key] = {
        day,
        collection: col,
        opens: 0,
        closes: 0,
        snapshots: 0,
        errors: 0,
        reconnects: 0,
        recreates: 0,
        timeouts10: 0,
        timeouts30: 0,
        retries: 0,
        retrySuccess: 0,
        retryFailed: 0,
        durationSum: 0,
        durationCount: 0,
        durations: [],
        firstSnapDurations: [],
        firstSnapSumMs: 0,
        firstSnapCount: 0,
        firstSnapMaxMs: 0,
        firstSnapDocSum: 0,
        firstSnapMaxDocs: 0,
        payloadBytesSum: 0,
        payloadBytesMax: 0,
        changeCountSum: 0,
        mergeMsSum: 0,
        mergeMsCount: 0,
        mergeMsMax: 0,
        intervalSumMs: 0,
        intervalCount: 0,
        lastDocCount: 0,
        reasonPageLoad: 0,
        reasonRefresh: 0,
        reasonDateChange: 0,
        reasonDepartmentChange: 0,
        reasonReconnect: 0,
        reasonRetry: 0,
        reasonDepsChange: 0,
        reasonUnknown: 0,
        earliestTs: e.ts || Date.now(),
        latestTs: e.ts || Date.now(),
        sample: e,
      };
    }
    const b = byKey[key];
    const action = e.action;
    const event = e.event || "";
    const ts = e.ts || Date.now();
    if (ts < b.earliestTs) b.earliestTs = ts;
    if (ts > b.latestTs) b.latestTs = ts;
    b.sample = e;
    if (action === "open") {
      b.opens += 1;
      const reason = e.reason || "unknown";
      if (reason === "page_load") b.reasonPageLoad += 1;
      else if (reason === "refresh") b.reasonRefresh += 1;
      else if (reason === "date_change") b.reasonDateChange += 1;
      else if (reason === "department_change") b.reasonDepartmentChange += 1;
      else if (reason === "reconnect") b.reasonReconnect += 1;
      else if (reason === "retry") b.reasonRetry += 1;
      else if (reason === "deps_change") b.reasonDepsChange += 1;
      else b.reasonUnknown += 1;
    } else if (action === "close") b.closes += 1;
    else if (action === "snapshot") {
      b.snapshots += 1;
      b.lastDocCount = e.docCount || b.lastDocCount;
      if (e.durationMs != null) {
        b.durationSum += e.durationMs;
        b.durationCount += 1;
        b.durations.push(e.durationMs);
      }
      if (e.changeCount != null) b.changeCountSum += e.changeCount;
      if (e.payloadBytes != null) {
        b.payloadBytesSum += e.payloadBytes;
        if (e.payloadBytes > b.payloadBytesMax)
          b.payloadBytesMax = e.payloadBytes;
      }
      if (e.avgIntervalMs != null) {
        b.intervalSumMs += e.avgIntervalMs;
        b.intervalCount += 1;
      }
      if (
        event === "first_snapshot_received" ||
        e.event === "first_snapshot_received"
      ) {
        if (e.durationMs != null) {
          b.firstSnapSumMs += e.durationMs;
          b.firstSnapCount += 1;
          b.firstSnapDurations.push(e.durationMs);
          if (e.durationMs > b.firstSnapMaxMs) b.firstSnapMaxMs = e.durationMs;
        }
        if (e.docCount != null) {
          b.firstSnapDocSum += e.docCount;
          if (e.docCount > b.firstSnapMaxDocs) b.firstSnapMaxDocs = e.docCount;
        }
      }
    } else if (action === "merge" || event === "listener_merge") {
      if (e.mergeMs != null || e.durationMs != null) {
        const ms = e.mergeMs ?? e.durationMs;
        b.mergeMsSum += ms;
        b.mergeMsCount += 1;
        if (ms > b.mergeMsMax) b.mergeMsMax = ms;
      }
      if (e.changeCount != null) b.changeCountSum += e.changeCount;
    } else if (action === "error") b.errors += 1;
    else if (action === "reconnect") b.reconnects += 1;
    else if (action === "recreated") b.recreates += 1;
    else if (action === "timeout_10" || event === "first_snapshot_timeout_10")
      b.timeouts10 += 1;
    else if (action === "timeout_30" || event === "first_snapshot_timeout_30")
      b.timeouts30 += 1;
    else if (action === "retry" || event === "retry_clicked") b.retries += 1;
    else if (action === "retry_success" || event === "retry_success")
      b.retrySuccess += 1;
    else if (action === "retry_failed" || event === "retry_failed")
      b.retryFailed += 1;
  }

  await Promise.all(
    Object.values(byKey).map(async (b) => {
      const id = `${b.day}_${deviceId}_${b.collection}`.replace(
        /[^a-zA-Z0-9_-]/g,
        "_"
      );
      const meta = metaFromEvent(b.sample, deviceId, deviceLabel);
      // Rolling max for first snapshot via writeRolling helper durations
      await writeRollingDailyDoc(db, ENG_COLLECTIONS.listenerDaily, id, {
        meta: {
          ...meta,
          day: b.day,
          dateKey: b.day,
          collection: b.collection,
        },
        increments: {
          opens: b.opens,
          closes: b.closes,
          snapshots: b.snapshots,
          errors: b.errors,
          reconnects: b.reconnects,
          recreates: b.recreates,
          timeouts10: b.timeouts10,
          timeouts30: b.timeouts30,
          retries: b.retries,
          retrySuccess: b.retrySuccess,
          retryFailed: b.retryFailed,
          reasonPageLoad: b.reasonPageLoad,
          reasonRefresh: b.reasonRefresh,
          reasonDateChange: b.reasonDateChange,
          reasonDepartmentChange: b.reasonDepartmentChange,
          reasonReconnect: b.reasonReconnect,
          reasonRetry: b.reasonRetry,
          reasonDepsChange: b.reasonDepsChange,
          reasonUnknown: b.reasonUnknown,
          firstSnapshotSumMs: b.firstSnapSumMs,
          firstSnapshotCount: b.firstSnapCount,
          firstSnapshotDocSum: b.firstSnapDocSum,
          payloadBytesSum: b.payloadBytesSum,
          changeCountSum: b.changeCountSum,
          mergeMsSum: b.mergeMsSum,
          mergeMsCount: b.mergeMsCount,
          intervalSumMs: b.intervalSumMs,
          intervalCount: b.intervalCount,
          durationSumMs: b.durationSum,
          durationCount: b.durationCount,
        },
        durations: b.firstSnapDurations,
        earliestTs: b.earliestTs,
        latestTs: b.latestTs,
        absolute: {
          lastDocCount: b.lastDocCount,
          avgSnapshotMs:
            b.durationCount > 0 ? b.durationSum / b.durationCount : null,
          payloadBytesMax: b.payloadBytesMax || null,
          firstSnapshotMaxDocs: b.firstSnapMaxDocs || null,
          mergeMsMax: b.mergeMsMax || null,
          avgMergeMs:
            b.mergeMsCount > 0 ? b.mergeMsSum / b.mergeMsCount : null,
          avgIntervalMs:
            b.intervalCount > 0 ? b.intervalSumMs / b.intervalCount : null,
        },
        legacyMaxField: "firstSnapshotMaxMs",
        avgFrom: {
          sumField: "firstSnapshotSumMs",
          countField: "firstSnapshotCount",
          outField: "avgFirstSnapshotMs",
          batchSum: b.firstSnapSumMs,
          batchCount: b.firstSnapCount,
        },
      });
    })
  );
}

async function flushPages(db, events, deviceId, deviceLabel = null) {
  if (!events.length) return;

  // Group page-load events for rolling daily page aggregates
  /** @type {Record<string, object>} */
  const byPageDay = {};
  for (const e of events) {
    const day = dayKey(e.ts || Date.now());
    const page = e.page || "unknown";
    const key = `${day}|${page}`;
    if (!byPageDay[key]) {
      byPageDay[key] = {
        day,
        page,
        count: 0,
        totals: [],
        snaps: [],
        paintSum: 0,
        renderSum: 0,
        snapSum: 0,
        interactiveSum: 0,
        totalSum: 0,
        earliestTs: e.ts || Date.now(),
        latestTs: e.ts || Date.now(),
        sample: e,
      };
    }
    const a = byPageDay[key];
    a.count += 1;
    a.paintSum += e.firstPaintMs || 0;
    a.renderSum += e.firstRenderMs || 0;
    a.snapSum += e.firstSnapshotMs || 0;
    a.interactiveSum += e.interactiveMs || 0;
    a.totalSum += e.totalMs || 0;
    if (typeof e.totalMs === "number") a.totals.push(e.totalMs);
    if (typeof e.firstSnapshotMs === "number") a.snaps.push(e.firstSnapshotMs);
    const ts = e.ts || Date.now();
    if (ts < a.earliestTs) a.earliestTs = ts;
    if (ts > a.latestTs) a.latestTs = ts;
    a.sample = e;
  }

  const aggWrites = Object.values(byPageDay).map((a) => {
    const id = `${a.day}_${deviceId}_${a.page}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    const meta = metaFromEvent(a.sample, deviceId, deviceLabel);
    const last = a.sample;
    return writeRollingDailyDoc(db, ENG_COLLECTIONS.pages, id, {
      meta: {
        ...meta,
        day: a.day,
        dateKey: a.day,
        page: a.page,
        pageId: a.page,
      },
      increments: {
        loadCount: a.count,
        firstPaintMsSum: a.paintSum,
        firstRenderMsSum: a.renderSum,
        firstSnapshotMsSum: a.snapSum,
        interactiveMsSum: a.interactiveSum,
        totalMsSum: a.totalSum,
      },
      durations: a.totals,
      earliestTs: a.earliestTs,
      latestTs: a.latestTs,
      absolute: {
        lastTotalMs: last.totalMs ?? null,
        lastFirstSnapshotMs: last.firstSnapshotMs ?? null,
        lastInteractiveMs: last.interactiveMs ?? null,
      },
      legacyMaxField: "maxTotalMs",
      legacyMinField: "minTotalMs",
      avgFrom: {
        sumField: "totalMsSum",
        countField: "loadCount",
        outField: "avgTotalMs",
        batchSum: a.totalSum,
        batchCount: a.count,
      },
    });
  });

  // Individual samples for Timeline / waterfall
  const sampleWrites = events.map((e) => {
    const ts = e.ts || Date.now();
    const time = buildTimeFields(ts);
    const loadId =
      e.loadId ||
      `${deviceId}_${ts}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    const meta = metaFromEvent({ ...e, ts }, deviceId, deviceLabel);
    return setDoc(
      doc(db, ENG_COLLECTIONS.pageLoads, loadId),
      {
        ...meta,
        ...time,
        ts,
        loadId,
        firstPaintMs: e.firstPaintMs ?? null,
        firstRenderMs: e.firstRenderMs ?? null,
        firstSnapshotMs: e.firstSnapshotMs ?? null,
        interactiveMs: e.interactiveMs ?? null,
        totalMs: e.totalMs ?? null,
        hung:
          typeof e.hung === "boolean"
            ? e.hung
            : e.firstSnapshotMs == null && e.totalMs != null,
        incomplete: !!e.incomplete && !e.hung,
        finalState: e.finalState ?? null,
        classification: e.classification ?? null,
        finalReason: e.finalReason ?? null,
        online: e.online ?? null,
        visible: e.visible ?? null,
        waitingListeners: e.waitingListeners ?? null,
        kind: (() => {
          const hung =
            typeof e.hung === "boolean"
              ? e.hung
              : e.firstSnapshotMs == null && e.totalMs != null;
          if (hung) return "page_load_hung";
          if (e.incomplete) return "page_load_incomplete";
          return "page_load";
        })(),
        updatedAt: serverTimestamp(),
        expireAt: expireAtForCollection(ENG_COLLECTIONS.pageLoads, ts),
      },
      { merge: true }
    );
  });

  await Promise.all([...aggWrites, ...sampleWrites]);
}

/**
 * One eng_components doc per page-load loadId (component timeline breakdown).
 */
async function flushComponents(db, events, deviceId, deviceLabel) {
  if (!events.length) return;
  const byLoad = new Map();
  for (const e of events) {
    const loadId =
      e.loadId ||
      `${deviceId}_${e.ts || Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    byLoad.set(loadId, e);
  }
  const writes = [...byLoad.entries()].map(([loadId, e]) => {
    const ts = e.ts || Date.now();
    const components = Array.isArray(e.components) ? e.components : [];
    const meta = metaFromEvent({ ...e, ts }, deviceId, deviceLabel);
    // Preserve first-seen ts on merge so Components "Time" stays stable when
    // lazy tabs refresh the same loadId breakdown.
    return getDoc(doc(db, ENG_COLLECTIONS.components, loadId)).then((snap) => {
      const existingTs = snap.exists() ? snap.data()?.ts : null;
      const keepTs =
        existingTs != null && Number.isFinite(Number(existingTs))
          ? Number(existingTs)
          : ts;
      const keepTime = buildTimeFields(keepTs);
      return setDoc(
        doc(db, ENG_COLLECTIONS.components, loadId),
        {
          ...meta,
          ...keepTime,
          loadId,
          ts: keepTs,
          totalMs: e.totalMs ?? null,
          hung: !!e.hung,
          incomplete: !!e.incomplete && !e.hung,
          components,
          updatedAt: serverTimestamp(),
          expireAt: expireAtForCollection(ENG_COLLECTIONS.components, keepTs),
        },
        { merge: true }
      );
    });
  });
  await Promise.all(writes);
}

async function flushMemory(db, events, deviceId) {
  if (!events.length) return;
  const deviceLabel = getDeviceLabel();
  const last = events[events.length - 1];
  const day = dayKey(last.ts || Date.now());
  const id = `${day}_${deviceId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  const first = events[0];
  let growth = null;
  if (
    first?.usedJSHeapSize != null &&
    last?.usedJSHeapSize != null &&
    last.ts > first.ts
  ) {
    const hours = (last.ts - first.ts) / 3_600_000;
    if (hours > 0) {
      growth =
        (last.usedJSHeapSize - first.usedJSHeapSize) /
        (1024 * 1024) /
        hours;
    }
  }
  const meta = metaFromEvent(last, deviceId, deviceLabel);
  const time = buildTimeFields(last.ts || Date.now());
  await Promise.all([
    setDoc(
      doc(db, ENG_COLLECTIONS.memory, id),
      {
        ...meta,
        day,
        dateKey: day,
        sampleCount: increment(events.length),
        usedJSHeapSize: last.usedJSHeapSize || null,
        totalJSHeapSize: last.totalJSHeapSize || null,
        jsHeapSizeLimit: last.jsHeapSizeLimit || null,
        heapGrowthMBPerHour: growth,
        sessionStorageKB: last.sessionStorageKB ?? null,
        localStorageKB: last.localStorageKB ?? null,
        listenerCount: last.listenerCount ?? null,
        engBufferSize: last.engBufferSize ?? null,
        sqcCacheEntries: last.sqcCacheEntries ?? null,
        loadId: last.loadId || meta.loadId || null,
        sessionId: last.sessionId || meta.sessionId || null,
        updatedAt: serverTimestamp(),
        expireAt: expireAtForCollection(ENG_COLLECTIONS.memory),
      },
      { merge: true }
    ),
    setDoc(
      doc(db, ENG_COLLECTIONS.memory, `latest_${deviceId}`),
      {
        ...meta,
        ...time,
        day,
        dateKey: day,
        usedJSHeapSize: last.usedJSHeapSize || null,
        totalJSHeapSize: last.totalJSHeapSize || null,
        jsHeapSizeLimit: last.jsHeapSizeLimit || null,
        heapGrowthMBPerHour: growth,
        sessionStorageKB: last.sessionStorageKB ?? null,
        localStorageKB: last.localStorageKB ?? null,
        listenerCount: last.listenerCount ?? null,
        engBufferSize: last.engBufferSize ?? null,
        sqcCacheEntries: last.sqcCacheEntries ?? null,
        loadId: last.loadId || meta.loadId || null,
        updatedAt: serverTimestamp(),
        expireAt: expireAtForCollection(ENG_COLLECTIONS.memory),
      },
      { merge: true }
    ),
  ]);
}

async function flushNetwork(db, events, deviceId) {
  if (!events.length) return;
  const deviceLabel = getDeviceLabel();
  const last = events[events.length - 1];
  const day = dayKey(last.ts || Date.now());
  const online = events.filter((e) => e.online === true).length;
  const offline = events.filter((e) => e.online === false).length;
  const reconnects = events.filter((e) => e.reconnect).length;
  const latencies = events
    .map((e) => e.latencyMs)
    .filter((n) => typeof n === "number");
  const id = `${day}_${deviceId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  const meta = metaFromEvent(last, deviceId, deviceLabel);
  const time = buildTimeFields(last.ts || Date.now());
  await writeRollingDailyDoc(db, ENG_COLLECTIONS.network, id, {
    meta: { ...meta, day, dateKey: day },
    increments: {
      onlineEvents: online,
      offlineEvents: offline,
      reconnects,
      probeCount: latencies.length,
      flushRetries: events.filter((e) => e.flushRetry).length,
      durationSumMs: latencies.reduce((a, b) => a + b, 0),
    },
    durations: latencies,
    earliestTs: events[0]?.ts || Date.now(),
    latestTs: last.ts || Date.now(),
    absolute: {
      lastOnline: last?.online ?? null,
      lastOfflineAt: last?.online === false ? last.ts : null,
      latencyP95Ms: percentile(latencies, 0.95),
    },
    avgFrom: {
      sumField: "durationSumMs",
      countField: "probeCount",
      outField: "latencyAvgMs",
      batchSum: latencies.reduce((a, b) => a + b, 0),
      batchCount: latencies.length,
    },
  });
  await setDoc(
    doc(db, ENG_COLLECTIONS.network, `latest_${deviceId}`),
    {
      ...meta,
      ...time,
      day,
      dateKey: day,
      online: last?.online ?? null,
      latencyMs: last?.latencyMs ?? null,
      clientTs: Date.now(),
      updatedAt: serverTimestamp(),
      expireAt: expireAtForCollection(ENG_COLLECTIONS.network),
    },
    { merge: true }
  );
}

async function flushReact(db, events, deviceId) {
  if (!events.length) return;
  const deviceLabel = getDeviceLabel();
  const last = events[events.length - 1];
  const day = dayKey(last.ts || Date.now());
  let longTasks = 0;
  let renderSamples = 0;
  let durationSum = 0;
  let slowCommits = 0;
  const durations = [];
  for (const e of events) {
    if (e.kind === "longtask") {
      longTasks += 1;
      durationSum += e.durationMs || 0;
      if (typeof e.durationMs === "number") durations.push(e.durationMs);
      if ((e.durationMs || 0) >= 50) slowCommits += 1;
    } else {
      renderSamples += 1;
    }
  }
  const id = `${day}_${deviceId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  const meta = metaFromEvent(last, deviceId, deviceLabel);
  await writeRollingDailyDoc(db, ENG_COLLECTIONS.reactDaily, id, {
    meta: { ...meta, day, dateKey: day },
    increments: {
      longTasks,
      renderSamples,
      longTaskDurationSumMs: durationSum,
      slowCommitCount: slowCommits,
    },
    durations,
    earliestTs: events[0]?.ts || Date.now(),
    latestTs: last.ts || Date.now(),
    avgFrom: {
      sumField: "longTaskDurationSumMs",
      countField: "longTasks",
      outField: "avgLongTaskMs",
      batchSum: durationSum,
      batchCount: longTasks,
    },
  });
}

async function flushErrors(db, events, deviceId) {
  if (!events.length) return;
  const deviceLabel = getDeviceLabel();
  const byHash = {};
  for (const e of events) {
    const hash = e.stackHash || `raw_${e.ts}`;
    if (!byHash[hash]) byHash[hash] = { ...e, count: 0 };
    byHash[hash].count += 1;
    byHash[hash].ts = e.ts || byHash[hash].ts;
    byHash[hash].message = e.message || byHash[hash].message;
  }
  const writes = Object.values(byHash)
    .slice(-50)
    .map(async (e) => {
      const ts = e.ts || Date.now();
      const time = buildTimeFields(ts);
      const meta = metaFromEvent({ ...e, ts }, deviceId, deviceLabel);
      const id = `${deviceId}_${e.stackHash || "x"}_${time.day}`.replace(
        /[^a-zA-Z0-9_-]/g,
        "_"
      );
      const ref = doc(db, ENG_COLLECTIONS.errors, id);
      let isNew = true;
      try {
        const snap = await getDoc(ref);
        isNew = !snap.exists();
      } catch {
        isNew = true;
      }
      const payload = {
        ...meta,
        ...time,
        ts,
        source: e.source || "unknown",
        name: e.name || null,
        message: String(e.message || "").slice(0, 500),
        stack: String(e.stack || "").slice(0, 2000),
        stackHash: e.stackHash || null,
        count: increment(e.count || 1),
        lastSeenAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        expireAt: expireAtForCollection(ENG_COLLECTIONS.errors, ts),
      };
      if (isNew) payload.createdAt = serverTimestamp();
      return setDoc(ref, payload, { merge: true });
    });
  await Promise.all(writes);
}

async function flushBuilds(db, events, deviceId) {
  if (!events.length) return;
  const e = events[events.length - 1];
  const id = String(e.buildId || "dev").replace(/[^a-zA-Z0-9_.-]/g, "_");
  const time = buildTimeFields(e.ts || Date.now());
  const ref = doc(db, ENG_COLLECTIONS.builds, id);
  let firstSeenDay = time.day;
  let firstSeenAt = e.ts || Date.now();
  try {
    const { getDoc } = await import("firebase/firestore");
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const d = snap.data() || {};
      if (d.firstSeenDay) firstSeenDay = d.firstSeenDay;
      if (d.firstSeenAt) firstSeenAt = d.firstSeenAt;
    }
  } catch {
    /* ignore */
  }
  await setDoc(
    ref,
    {
      buildId: e.buildId || "dev",
      lastDeviceId: deviceId,
      userAgent: e.userAgent || null,
      platform: e.platform || null,
      browser: e.browser || null,
      appVersion: e.appVersion || e.buildId || null,
      schemaVersion: SCHEMA_VERSION,
      telemetryVersion: TELEMETRY_VERSION,
      firstSeenDay,
      firstSeenAt,
      lastSeenAt: serverTimestamp(),
      seenCount: increment(1),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function flushDepartments(db, events, deviceId) {
  if (!events.length) return;
  const deviceLabel = getDeviceLabel();
  const byDept = {};
  for (const e of events) {
    const dept = e.department || "Unknown";
    if (!byDept[dept]) {
      byDept[dept] = {
        errorCount: 0,
        loadSum: 0,
        loadCount: 0,
        loads: [],
        listenerEvents: 0,
        openDelta: 0,
        sample: e,
        earliestTs: e.ts || Date.now(),
        latestTs: e.ts || Date.now(),
      };
    }
    const b = byDept[dept];
    const ts = e.ts || Date.now();
    if (ts < b.earliestTs) b.earliestTs = ts;
    if (ts > b.latestTs) b.latestTs = ts;
    b.sample = e;
    if (e.domain === "errors") b.errorCount += 1;
    if (e.domain === "pages" && e.totalMs != null) {
      b.loadSum += e.totalMs;
      b.loadCount += 1;
      b.loads.push(e.totalMs);
    }
    if (e.domain === "listeners") {
      b.listenerEvents += 1;
      if (e.action === "open") b.openDelta += 1;
      if (e.action === "close") b.openDelta -= 1;
    }
  }

  const lifetimeWrites = Object.entries(byDept).map(([department, b]) =>
    setDoc(
      doc(db, ENG_COLLECTIONS.departments, department.replace(/[\/\\]/g, "_")),
      {
        department,
        lastDeviceId: deviceId,
        deviceId,
        buildId: b.sample.buildId || null,
        platform: b.sample.platform || null,
        errorCount: increment(b.errorCount),
        errorCount1h: increment(b.errorCount),
        loadSumMs: increment(b.loadSum),
        loadCount: increment(b.loadCount),
        listenerEvents: increment(b.listenerEvents),
        openListeners: increment(b.openDelta),
        schemaVersion: SCHEMA_VERSION,
        telemetryVersion: TELEMETRY_VERSION,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
  );

  const dailyWrites = Object.entries(byDept).map(([department, b]) => {
    const day = dayKey(b.latestTs);
    const id = `${day}_${department}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    const meta = metaFromEvent(b.sample, deviceId, deviceLabel);
    return writeRollingDailyDoc(db, ENG_COLLECTIONS.departmentsDaily, id, {
      meta: {
        ...meta,
        day,
        dateKey: day,
        department,
        page: null,
        moduleId: null,
      },
      increments: {
        errorCount: b.errorCount,
        loadCount: b.loadCount,
        loadSumMs: b.loadSum,
        listenerEvents: b.listenerEvents,
        openDelta: b.openDelta,
      },
      durations: b.loads,
      earliestTs: b.earliestTs,
      latestTs: b.latestTs,
      avgFrom: {
        sumField: "loadSumMs",
        countField: "loadCount",
        outField: "avgLoadMs",
        batchSum: b.loadSum,
        batchCount: b.loadCount,
      },
      legacyMaxField: "maxLoadMs",
      legacyMinField: "minLoadMs",
    });
  });

  await Promise.all([...lifetimeWrites, ...dailyWrites]);
}

async function flushHealthAndAlerts(db, events, deviceId, settings) {
  const sampleTs = events[0]?.ts || Date.now();
  const day = dayKey(sampleTs);
  const time = buildTimeFields(sampleTs);
  const errorCount = events.filter((e) => e.domain === "errors").length;
  const slowQueryCount = events.filter(
    (e) =>
      e.domain === "firestore" &&
      (e.durationMs || 0) >= (settings.slowQueryMs ?? 2000)
  ).length;
  const queryCount = events.filter((e) => e.domain === "firestore").length;
  const offlineEvents = events.filter(
    (e) => e.domain === "network" && e.online === false
  ).length;
  const thresholds = settings.alertThresholds || {};

  const health = computeHealthScore({
    errorCount,
    slowQueryCount,
    queryCount,
    offlineEvents,
    devicesOnline: 1,
    devicesTotal: 1,
  });

  // Device-scoped health sample (fleet_latest kept for back-compat but marked)
  await setDoc(
    doc(db, ENG_COLLECTIONS.health, `device_${deviceId}`),
    {
      ...health,
      ...time,
      day,
      dateKey: day,
      errorCount,
      slowQueryCount,
      queryCount,
      offlineEvents,
      deviceId,
      buildId: events[0]?.buildId || null,
      department: events[0]?.department || null,
      page: events[0]?.page || null,
      sessionId: events[0]?.sessionId || null,
      schemaVersion: SCHEMA_VERSION,
      telemetryVersion: TELEMETRY_VERSION,
      scope: "device",
      updatedAt: serverTimestamp(),
      clientTs: Date.now(),
      expireAt: expireAtForCollection(ENG_COLLECTIONS.health),
    },
    { merge: true }
  );

  await setDoc(
    doc(db, ENG_COLLECTIONS.health, "fleet_latest"),
    {
      ...health,
      errorCount,
      slowQueryCount,
      queryCount,
      offlineEvents,
      note: "Single-device flush artifact — prefer dashboard recompute",
      schemaVersion: SCHEMA_VERSION,
      telemetryVersion: TELEMETRY_VERSION,
      deviceId,
      updatedAt: serverTimestamp(),
      clientTs: Date.now(),
      lastDeviceId: deviceId,
      expireAt: expireAtForCollection(ENG_COLLECTIONS.health),
    },
    { merge: true }
  );

  await setDoc(
    doc(db, ENG_COLLECTIONS.health, `daily_${day}`),
    {
      day,
      dateKey: day,
      scoreSum: increment(health.score),
      sampleCount: increment(1),
      errorCount: increment(errorCount),
      slowQueryCount: increment(slowQueryCount),
      schemaVersion: SCHEMA_VERSION,
      telemetryVersion: TELEMETRY_VERSION,
      deviceId,
      updatedAt: serverTimestamp(),
      expireAt: expireAtForCollection(ENG_COLLECTIONS.health),
    },
    { merge: true }
  );

  const alertWrites = [];
  if (errorCount >= (thresholds.errorCount1h || 10)) {
    const id = `errors_${deviceId}_${day}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    alertWrites.push(
      setDoc(
        doc(db, ENG_COLLECTIONS.alerts, id),
        {
          severity: "high",
          title: "Elevated error rate",
          deviceId,
          day,
          dateKey: day,
          ts: sampleTs,
          buildId: events[0]?.buildId || null,
          department: events[0]?.department || null,
          ruleId: "errors_burst",
          schemaVersion: SCHEMA_VERSION,
          telemetryVersion: TELEMETRY_VERSION,
          openedAt: serverTimestamp(),
          count: increment(errorCount),
          expireAt: expireAtForCollection(ENG_COLLECTIONS.alerts, sampleTs),
        },
        { merge: true }
      )
    );
  }
  if (slowQueryCount > 0) {
    const id = `slowq_${deviceId}_${day}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    alertWrites.push(
      setDoc(
        doc(db, ENG_COLLECTIONS.alerts, id),
        {
          severity: "medium",
          title: "Slow Firestore queries observed",
          deviceId,
          day,
          dateKey: day,
          ts: sampleTs,
          buildId: events[0]?.buildId || null,
          department: events[0]?.department || null,
          ruleId: "slow_query",
          schemaVersion: SCHEMA_VERSION,
          telemetryVersion: TELEMETRY_VERSION,
          openedAt: serverTimestamp(),
          count: increment(slowQueryCount),
          expireAt: expireAtForCollection(ENG_COLLECTIONS.alerts, sampleTs),
        },
        { merge: true }
      )
    );
  }
  if (alertWrites.length) await Promise.all(alertWrites);
}

export { dayKey, hourKey, percentile };
