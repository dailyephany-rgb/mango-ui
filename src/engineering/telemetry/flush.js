/**
 * Flush Engineering buffer → Engineering Firestore (batched, best-effort, retried).
 * Never blocks clinical; never throws to callers.
 */

import {
  collection,
  doc,
  setDoc,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { getEngDb, isEngFirebaseConfigured } from "../firebaseEngConfig.js";
import { ENG_COLLECTIONS } from "../constants.js";
import { drainEvents, loadSpill, clearSpill, pushEvent, spillToSession, peekEvents, bufferSize } from "./buffer.js";
import { getDeviceId } from "./deviceId.js";
import { isEngTelemetryEnabled } from "./killSwitch.js";
import { safeRun } from "./safeRun.js";
import { getRuntimeSettings } from "./runtimeSettings.js";
import { computeHealthScore } from "../health/scores.js";

let flushing = false;
/** @type {object[][]} */
let retryQueue = [];
let retryTimer = null;

function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hourKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${dayKey(ts)}T${String(d.getHours()).padStart(2, "0")}`;
}

function percentile(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.ceil(p * (s.length - 1)));
  return s[idx];
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
      } catch {
        if (attempt < 5) {
          retryQueue.unshift(batch);
          tick();
        } else {
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
  if (flushing && !opts.force) return;
  if (!isEngTelemetryEnabled()) return;
  flushing = true;
  try {
    const spilled = loadSpill();
    const drained = drainEvents();
    const events = [...spilled, ...drained];
    if (!events.length) return;

    const db = getEngDb();
    if (!db || !isEngFirebaseConfigured()) {
      for (const e of events) pushEvent(e);
      return;
    }

    clearSpill();
    try {
      await deliverEvents(events);
    } catch {
      enqueueRetry(events);
    }
  } catch {
    /* swallow */
  } finally {
    flushing = false;
  }
}

async function deliverEvents(events) {
  const db = getEngDb();
  if (!db) throw new Error("eng-db-missing");
  const deviceId = getDeviceId();
  const byDomain = groupBy(events, (e) => e.domain || "misc");
  const settings = getRuntimeSettings();

  const results = await Promise.allSettled([
    flushQueries(db, byDomain.firestore || [], deviceId, settings),
    flushListeners(db, byDomain.listeners || [], deviceId),
    flushPages(db, byDomain.pages || [], deviceId),
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
  const day = dayKey();
  const slowMs = settings.slowQueryMs ?? 2000;
  const agg = {};
  for (const e of events) {
    const col = e.collection || "unknown";
    const kind = e.kind || "unknown";
    const key = `${col}|${kind}`;
    if (!agg[key]) {
      agg[key] = {
        collection: col,
        kind,
        count: 0,
        docCountSum: 0,
        durationSum: 0,
        durationMax: 0,
        durationMin: Infinity,
        durations: [],
        slowCount: 0,
        writes: 0,
        failures: 0,
        reconnects: 0,
        page: e.page,
        department: e.department,
      };
    }
    const a = agg[key];
    a.count += 1;
    a.docCountSum += e.docCount || 0;
    const dur = e.durationMs || 0;
    a.durationSum += dur;
    a.durationMax = Math.max(a.durationMax, dur);
    a.durationMin = Math.min(a.durationMin, dur);
    a.durations.push(dur);
    if (dur >= slowMs) a.slowCount += 1;
    if (kind === "write") a.writes += 1;
    if (e.failure) a.failures += 1;
    if (e.reconnect) a.reconnects += 1;
  }

  const writes = Object.values(agg).map((a) => {
    const id = `${day}_${deviceId}_${a.collection}_${a.kind}`.replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );
    const avg = a.count ? a.durationSum / a.count : null;
    const p95 = percentile(a.durations, 0.95);
    return setDoc(
      doc(db, ENG_COLLECTIONS.firestoreMetrics, id),
      {
        day,
        deviceId,
        collection: a.collection,
        kind: a.kind,
        page: a.page || null,
        department: a.department || null,
        queryCount: increment(a.count),
        docCountSum: increment(a.docCountSum),
        durationSumMs: increment(a.durationSum),
        durationMaxMs: a.durationMax,
        durationMinMs: Number.isFinite(a.durationMin) ? a.durationMin : null,
        avgQueryMs: avg,
        p95QueryMs: p95,
        slowCount: increment(a.slowCount),
        writes: increment(a.writes),
        failures: increment(a.failures),
        reconnects: increment(a.reconnects),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
  await Promise.all(writes);
}

async function flushListeners(db, events, deviceId) {
  if (!events.length) return;
  const day = dayKey();
  const byCol = {};
  for (const e of events) {
    const col = e.collection || "unknown";
    if (!byCol[col]) {
      byCol[col] = {
        opens: 0,
        closes: 0,
        snapshots: 0,
        errors: 0,
        reconnects: 0,
        durationSum: 0,
        durationCount: 0,
        lastDocCount: 0,
        page: e.page,
        department: e.department,
      };
    }
    const b = byCol[col];
    if (e.action === "open") b.opens += 1;
    else if (e.action === "close") b.closes += 1;
    else if (e.action === "snapshot") {
      b.snapshots += 1;
      b.lastDocCount = e.docCount || b.lastDocCount;
      if (e.durationMs != null) {
        b.durationSum += e.durationMs;
        b.durationCount += 1;
      }
    } else if (e.action === "error") b.errors += 1;
    else if (e.action === "reconnect") b.reconnects += 1;
  }

  const writes = Object.entries(byCol).map(([collectionName, b]) => {
    const id = `${day}_${deviceId}_${collectionName}`.replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );
    return setDoc(
      doc(db, ENG_COLLECTIONS.listenerDaily, id),
      {
        day,
        deviceId,
        collection: collectionName,
        page: b.page || null,
        department: b.department || null,
        opens: increment(b.opens),
        closes: increment(b.closes),
        snapshots: increment(b.snapshots),
        errors: increment(b.errors),
        reconnects: increment(b.reconnects),
        lastDocCount: b.lastDocCount,
        avgSnapshotMs:
          b.durationCount > 0 ? b.durationSum / b.durationCount : null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
  await Promise.all(writes);
}

async function flushPages(db, events, deviceId) {
  if (!events.length) return;
  const aggWrites = events.map((e) => {
    const day = dayKey(e.ts);
    const page = e.page || "unknown";
    const id = `${day}_${deviceId}_${page}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    return setDoc(
      doc(db, ENG_COLLECTIONS.pages, id),
      {
        day,
        deviceId,
        page,
        department: e.department || null,
        buildId: e.buildId || null,
        loadCount: increment(1),
        firstPaintMsSum: increment(e.firstPaintMs || 0),
        firstRenderMsSum: increment(e.firstRenderMs || 0),
        firstSnapshotMsSum: increment(e.firstSnapshotMs || 0),
        interactiveMsSum: increment(e.interactiveMs || 0),
        totalMsSum: increment(e.totalMs || 0),
        lastTotalMs: e.totalMs || null,
        lastFirstSnapshotMs: e.firstSnapshotMs ?? null,
        lastInteractiveMs: e.interactiveMs ?? null,
        maxTotalMs: e.totalMs || null,
        minTotalMs: e.totalMs || null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });

  // Individual samples for Timeline / waterfall (same flush cycle; no extra schedule)
  const sampleWrites = events.map((e) => {
    const ts = e.ts || Date.now();
    const id = `${deviceId}_${ts}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    return setDoc(
      doc(db, ENG_COLLECTIONS.pageLoads, id),
      {
        ts,
        day: dayKey(ts),
        deviceId,
        page: e.page || "unknown",
        department: e.department || null,
        buildId: e.buildId || null,
        user: e.user || null,
        firstPaintMs: e.firstPaintMs ?? null,
        firstRenderMs: e.firstRenderMs ?? null,
        firstSnapshotMs: e.firstSnapshotMs ?? null,
        interactiveMs: e.interactiveMs ?? null,
        totalMs: e.totalMs ?? null,
        kind: "page_load",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });

  await Promise.all([...aggWrites, ...sampleWrites]);
}

async function flushMemory(db, events, deviceId) {
  if (!events.length) return;
  const last = events[events.length - 1];
  const day = dayKey(last.ts);
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
  await Promise.all([
    setDoc(
      doc(db, ENG_COLLECTIONS.memory, id),
      {
        day,
        deviceId,
        page: last.page || null,
        department: last.department || null,
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
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ),
    setDoc(
      doc(db, ENG_COLLECTIONS.memory, `latest_${deviceId}`),
      {
        deviceId,
        ...last,
        day,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ),
  ]);
}

async function flushNetwork(db, events, deviceId) {
  if (!events.length) return;
  const day = dayKey();
  const online = events.filter((e) => e.online === true).length;
  const offline = events.filter((e) => e.online === false).length;
  const reconnects = events.filter((e) => e.reconnect).length;
  const latencies = events
    .map((e) => e.latencyMs)
    .filter((n) => typeof n === "number");
  const avg =
    latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : null;
  const id = `${day}_${deviceId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  const last = events[events.length - 1];
  await Promise.all([
    setDoc(
      doc(db, ENG_COLLECTIONS.network, id),
      {
        day,
        deviceId,
        onlineEvents: increment(online),
        offlineEvents: increment(offline),
        reconnects: increment(reconnects),
        probeCount: increment(latencies.length),
        latencyAvgMs: avg,
        latencyP95Ms: percentile(latencies, 0.95),
        lastOnline: last?.online ?? null,
        lastOfflineAt: last?.online === false ? last.ts : null,
        flushRetries: increment(
          events.filter((e) => e.flushRetry).length
        ),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ),
    setDoc(
      doc(db, ENG_COLLECTIONS.network, `latest_${deviceId}`),
      {
        deviceId,
        online: last?.online ?? null,
        latencyMs: last?.latencyMs ?? null,
        updatedAt: serverTimestamp(),
        clientTs: Date.now(),
      },
      { merge: true }
    ),
  ]);
}

async function flushReact(db, events, deviceId) {
  if (!events.length) return;
  const day = dayKey();
  let longTasks = 0;
  let renderSamples = 0;
  let durationSum = 0;
  let slowCommits = 0;
  for (const e of events) {
    if (e.kind === "longtask") {
      longTasks += 1;
      durationSum += e.durationMs || 0;
      if ((e.durationMs || 0) >= 50) slowCommits += 1;
    } else {
      renderSamples += 1;
    }
  }
  const id = `${day}_${deviceId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  await setDoc(
    doc(db, ENG_COLLECTIONS.reactDaily, id),
    {
      day,
      deviceId,
      longTasks: increment(longTasks),
      renderSamples: increment(renderSamples),
      longTaskDurationSumMs: increment(durationSum),
      slowCommitCount: increment(slowCommits),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function flushErrors(db, events, deviceId) {
  if (!events.length) return;
  const byHash = {};
  for (const e of events) {
    const hash = e.stackHash || `raw_${e.ts}`;
    if (!byHash[hash]) {
      byHash[hash] = { ...e, count: 0 };
    }
    byHash[hash].count += 1;
    byHash[hash].ts = e.ts || byHash[hash].ts;
    byHash[hash].message = e.message || byHash[hash].message;
  }

  const writes = Object.values(byHash)
    .slice(-50)
    .map((e) => {
      const day = dayKey(e.ts);
      const id = `${deviceId}_${e.stackHash || "x"}_${day}`.replace(
        /[^a-zA-Z0-9_-]/g,
        "_"
      );
      return setDoc(
        doc(db, ENG_COLLECTIONS.errors, id),
        {
          deviceId,
          day,
          page: e.page || null,
          department: e.department || null,
          source: e.source || "unknown",
          name: e.name || null,
          message: String(e.message || "").slice(0, 500),
          stack: String(e.stack || "").slice(0, 2000),
          stackHash: e.stackHash || null,
          count: increment(e.count || 1),
          ts: e.ts || Date.now(),
          lastSeenAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
  await Promise.all(writes);
}

async function flushBuilds(db, events, deviceId) {
  if (!events.length) return;
  const e = events[events.length - 1];
  const id = String(e.buildId || "dev").replace(/[^a-zA-Z0-9_.-]/g, "_");
  await setDoc(
    doc(db, ENG_COLLECTIONS.builds, id),
    {
      buildId: e.buildId || "dev",
      lastDeviceId: deviceId,
      userAgent: e.userAgent || null,
      lastSeenAt: serverTimestamp(),
      seenCount: increment(1),
    },
    { merge: true }
  );
}

async function flushDepartments(db, events, deviceId) {
  if (!events.length) return;
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
      };
    }
    const b = byDept[dept];
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
  const writes = Object.entries(byDept).map(([department, b]) =>
    setDoc(
      doc(db, ENG_COLLECTIONS.departments, department.replace(/[\/\\]/g, "_")),
      {
        department,
        lastDeviceId: deviceId,
        errorCount: increment(b.errorCount),
        errorCount1h: increment(b.errorCount),
        loadSumMs: increment(b.loadSum),
        loadCount: increment(b.loadCount),
        avgLoadMs: b.loadCount ? b.loadSum / b.loadCount : null,
        p95LoadMs: percentile(b.loads, 0.95),
        listenerEvents: increment(b.listenerEvents),
        openListeners: increment(b.openDelta),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
  );
  await Promise.all(writes);
}

async function flushHealthAndAlerts(db, events, deviceId, settings) {
  const day = dayKey();
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

  await setDoc(
    doc(db, ENG_COLLECTIONS.health, "fleet_latest"),
    {
      ...health,
      errorCount,
      slowQueryCount,
      queryCount,
      offlineEvents,
      updatedAt: serverTimestamp(),
      clientTs: Date.now(),
      lastDeviceId: deviceId,
    },
    { merge: true }
  );

  await setDoc(
    doc(db, ENG_COLLECTIONS.health, `daily_${day}`),
    {
      day,
      scoreSum: increment(health.score),
      sampleCount: increment(1),
      errorCount: increment(errorCount),
      slowQueryCount: increment(slowQueryCount),
      updatedAt: serverTimestamp(),
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
          department: events[0]?.department || null,
          ruleId: "errors_burst",
          openedAt: serverTimestamp(),
          count: increment(errorCount),
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
          ruleId: "slow_query",
          openedAt: serverTimestamp(),
          count: increment(slowQueryCount),
        },
        { merge: true }
      )
    );
  }
  if (alertWrites.length) await Promise.all(alertWrites);
}

export { dayKey, hourKey, percentile };
