/**
 * Flush Engineering buffer → Engineering Firestore (batched, best-effort).
 * Never blocks clinical; never throws to callers.
 */

import {
  collection,
  doc,
  setDoc,
  addDoc,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { getEngDb, isEngFirebaseConfigured } from "../firebaseEngConfig.js";
import { ENG_COLLECTIONS, SLOW_QUERY_MS } from "../constants.js";
import { drainEvents, loadSpill, clearSpill, pushEvent } from "./buffer.js";
import { getDeviceId } from "./deviceId.js";
import { isEngTelemetryEnabled } from "./killSwitch.js";
import { safeRun } from "./safeRun.js";

let flushing = false;

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

/**
 * Schedule a non-blocking flush.
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
      // Re-queue locally — clinical unaffected
      for (const e of events) pushEvent(e);
      return;
    }

    clearSpill();
    const deviceId = getDeviceId();
    const byDomain = groupBy(events, (e) => e.domain || "misc");

    await Promise.allSettled([
      flushQueries(db, byDomain.firestore || [], deviceId),
      flushListeners(db, byDomain.listeners || [], deviceId),
      flushPages(db, byDomain.pages || [], deviceId),
      flushMemory(db, byDomain.memory || [], deviceId),
      flushNetwork(db, byDomain.network || [], deviceId),
      flushReact(db, byDomain.react || [], deviceId),
      flushErrors(db, byDomain.errors || [], deviceId),
      flushBuilds(db, byDomain.builds || [], deviceId),
      flushDepartments(db, events, deviceId),
    ]);
  } catch {
    /* swallow — clinical must continue */
  } finally {
    flushing = false;
  }
}

function groupBy(arr, keyFn) {
  const out = {};
  for (const item of arr) {
    const k = keyFn(item);
    (out[k] || (out[k] = [])).push(item);
  }
  return out;
}

async function flushQueries(db, events, deviceId) {
  if (!events.length) return;
  const day = dayKey();
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
        slowCount: 0,
        page: e.page,
        department: e.department,
      };
    }
    const a = agg[key];
    a.count += 1;
    a.docCountSum += e.docCount || 0;
    a.durationSum += e.durationMs || 0;
    a.durationMax = Math.max(a.durationMax, e.durationMs || 0);
    if ((e.durationMs || 0) >= SLOW_QUERY_MS) a.slowCount += 1;
  }

  const writes = Object.values(agg).map((a) => {
    const id = `${day}_${deviceId}_${a.collection}_${a.kind}`.replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );
    const ref = doc(db, ENG_COLLECTIONS.firestoreMetrics, id);
    return setDoc(
      ref,
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
        slowCount: increment(a.slowCount),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
  await Promise.allSettled(writes);
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
    } else if (e.action === "error") b.errors += 1;
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
        lastDocCount: b.lastDocCount,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
  await Promise.allSettled(writes);
}

async function flushPages(db, events, deviceId) {
  if (!events.length) return;
  const writes = events.map((e) => {
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
        loadCount: increment(1),
        firstPaintMsSum: increment(e.firstPaintMs || 0),
        firstRenderMsSum: increment(e.firstRenderMs || 0),
        firstSnapshotMsSum: increment(e.firstSnapshotMs || 0),
        interactiveMsSum: increment(e.interactiveMs || 0),
        totalMsSum: increment(e.totalMs || 0),
        lastTotalMs: e.totalMs || null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
  await Promise.allSettled(writes);
}

async function flushMemory(db, events, deviceId) {
  if (!events.length) return;
  const last = events[events.length - 1];
  const day = dayKey(last.ts);
  const id = `${day}_${deviceId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  await setDoc(
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
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function flushNetwork(db, events, deviceId) {
  if (!events.length) return;
  const day = dayKey();
  const online = events.filter((e) => e.online === true).length;
  const offline = events.filter((e) => e.online === false).length;
  const latencies = events
    .map((e) => e.latencyMs)
    .filter((n) => typeof n === "number");
  const avg =
    latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : null;
  const id = `${day}_${deviceId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  await setDoc(
    doc(db, ENG_COLLECTIONS.network, id),
    {
      day,
      deviceId,
      onlineEvents: increment(online),
      offlineEvents: increment(offline),
      probeCount: increment(latencies.length),
      latencyAvgMs: avg,
      lastOnline: events[events.length - 1]?.online ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function flushReact(db, events, deviceId) {
  if (!events.length) return;
  const day = dayKey();
  let longTasks = 0;
  let renderSamples = 0;
  let durationSum = 0;
  for (const e of events) {
    if (e.kind === "longtask") {
      longTasks += 1;
      durationSum += e.durationMs || 0;
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
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function flushErrors(db, events, deviceId) {
  if (!events.length) return;
  const writes = events.slice(-50).map((e) =>
    addDoc(collection(db, ENG_COLLECTIONS.errors), {
      deviceId,
      day: dayKey(e.ts),
      page: e.page || null,
      department: e.department || null,
      source: e.source || "unknown",
      message: String(e.message || "").slice(0, 500),
      stack: String(e.stack || "").slice(0, 2000),
      ts: e.ts || Date.now(),
      createdAt: serverTimestamp(),
    })
  );
  await Promise.allSettled(writes);
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

/**
 * Merge department-level counters from mixed events (names/metadata only).
 */
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
        listenerEvents: 0,
      };
    }
    const b = byDept[dept];
    if (e.domain === "errors") b.errorCount += 1;
    if (e.domain === "pages" && e.totalMs != null) {
      b.loadSum += e.totalMs;
      b.loadCount += 1;
    }
    if (e.domain === "listeners") b.listenerEvents += 1;
  }
  const writes = Object.entries(byDept).map(([department, b]) =>
    setDoc(
      doc(db, ENG_COLLECTIONS.departments, department.replace(/[\/\\]/g, "_")),
      {
        department,
        lastDeviceId: deviceId,
        errorCount: increment(b.errorCount),
        loadSumMs: increment(b.loadSum),
        loadCount: increment(b.loadCount),
        listenerEvents: increment(b.listenerEvents),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
  );
  await Promise.allSettled(writes);
}

export { dayKey, hourKey };
