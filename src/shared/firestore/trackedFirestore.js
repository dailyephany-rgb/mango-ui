/**
 * Behaviour-identical Firestore wrappers for passive metrics + Engineering telemetry.
 * Same signatures as firebase/firestore onSnapshot / getDocs / getDoc.
 *
 * Passthrough when BOTH mango.perf.monitor=0 AND mango.eng.telemetry=0.
 * Eng calls are fire-and-forget inside safeRun — never await on clinical path.
 *
 * Observability additions (N1/N2/N6): first-snapshot timing/docCount/payload
 * estimate, listen reason / recreation, 10s/30s wait timeouts, user retry recreate
 * of the SAME query (no schema or query-shape changes).
 */

import {
  onSnapshot as fbOnSnapshot,
  getDocs as fbGetDocs,
  getDoc as fbGetDoc,
} from "firebase/firestore";
import { isMonitorEnabled } from "../../performance/performanceStore.js";
import {
  recordQuery,
  recordRead,
  upsertListener,
  closeListener,
  onFirstSnapshot,
  getPageContext,
} from "../../performance/performanceCollector.js";
import {
  extractCollectionName,
  departmentForCollection,
} from "../../performance/firestoreMetrics.js";
import { isEngTelemetryEnabled } from "../../engineering/telemetry/killSwitch.js";
import { EngTelemetry } from "../../engineering/telemetry/EngTelemetry.js";
import { safeRun } from "../../engineering/telemetry/safeRun.js";
import { getRuntimeSettings } from "../../engineering/telemetry/runtimeSettings.js";
import {
  registerListenerWatch,
  setListenerRecreate,
  markListenerFirstSnapshot,
  markListenerTimeout,
  unregisterListenerWatch,
  resolveOpenReason,
  readListenReasonAnnotation,
  getWaitingCount,
  getHungCount,
  getLoadingPages,
} from "../../engineering/telemetry/listenerWatch.js";

let listenerSeq = 0;
let snapshotSample = 0;

const TIMEOUT_10_MS = 10_000;
const TIMEOUT_30_MS = 30_000;

function now() {
  return performance.now();
}

function engOn() {
  try {
    return isEngTelemetryEnabled();
  } catch {
    return false;
  }
}

function monitoring() {
  return isMonitorEnabled() || engOn();
}

function snapshotEvery() {
  try {
    return getRuntimeSettings().sampleRates?.snapshotEvery ?? 10;
  } catch {
    return 10;
  }
}

function syncWaitHeartbeat() {
  safeRun(() => {
    EngTelemetry.setListenerWaitState({
      waitingListeners: getWaitingCount(),
      hungLoads: getHungCount(),
      loadingPages: getLoadingPages(),
    });
  }, "eng.wait.hb");
}

/** Cheap first-snapshot payload estimate (sample up to 3 docs). */
function estimatePayloadBytes(snap) {
  try {
    const docs = snap?.docs;
    if (!docs?.length) return 0;
    const sampleN = Math.min(3, docs.length);
    let bytes = 0;
    for (let i = 0; i < sampleN; i++) {
      bytes += JSON.stringify(docs[i].data()).length;
    }
    return Math.round((bytes / sampleN) * docs.length);
  } catch {
    return null;
  }
}

/**
 * Read-only best-effort query shape for Query Explorer (never mutates ref).
 * Uses Firebase modular Query private fields when present.
 */
function describeQueryConstraints(refOrQuery) {
  try {
    if (!refOrQuery) return null;
    const out = {
      path: null,
      where: [],
      orderBy: [],
      limit: null,
      limitToLast: null,
      startAt: null,
      endAt: null,
    };
    if (typeof refOrQuery.path === "string") {
      out.path = refOrQuery.path;
    }
    const q = refOrQuery._query;
    if (!q) {
      return out.path || out.where.length ? out : null;
    }
    if (Array.isArray(q.path?.segments)) {
      out.path = q.path.segments.join("/");
    }
    const filters = q.filters || q.explicitFilters || [];
    if (Array.isArray(filters)) {
      for (const f of filters) {
        try {
          const field =
            f.field?.canonicalString?.() ||
            f.field?.toString?.() ||
            f.field?.segments?.join(".") ||
            f.field ||
            "?";
          const op = f.op || f.opStr || f.operator || "==";
          let value = f.value;
          if (value && typeof value === "object" && "arrayValue" in (value || {})) {
            value = "[array]";
          } else if (typeof value === "object") {
            value = JSON.stringify(value).slice(0, 80);
          }
          out.where.push({ field: String(field), op: String(op), value });
        } catch {
          /* skip filter */
        }
      }
    }
    const orderBys = q.orderBy || q.explicitOrderBy || [];
    if (Array.isArray(orderBys)) {
      for (const o of orderBys) {
        try {
          const field =
            o.field?.canonicalString?.() ||
            o.field?.toString?.() ||
            o.field?.segments?.join(".") ||
            "?";
          out.orderBy.push({
            field: String(field),
            dir: o.dir || o.direction || "asc",
          });
        } catch {
          /* skip */
        }
      }
    }
    if (q.limit != null) out.limit = q.limit;
    if (q.limitToLast != null) out.limitToLast = q.limitToLast;
    if (q.startAt != null) out.startAt = true;
    if (q.endAt != null) out.endAt = true;
    const has =
      out.path ||
      out.where.length ||
      out.orderBy.length ||
      out.limit != null ||
      out.limitToLast != null;
    return has ? out : null;
  } catch {
    return null;
  }
}

/**
 * @param {any} refOrQuery
 * @param {any} onNext
 * @param {any} [onError]
 * @param {any} [options]
 */
export function trackedOnSnapshot(refOrQuery, onNext, onError, options) {
  if (!monitoring()) {
    return fbOnSnapshot(refOrQuery, onNext, onError, options);
  }

  const perf = isMonitorEnabled();
  const eng = engOn();
  const collection = extractCollectionName(refOrQuery);
  const ctx = getPageContext();
  const constraints = eng ? describeQueryConstraints(refOrQuery) : null;
  const annotated = readListenReasonAnnotation(refOrQuery);
  const { reason, recreated } = resolveOpenReason(
    ctx.page,
    collection,
    annotated
  );
  const id = `L${++listenerSeq}-${collection}-${Date.now()}`;
  const startedAt = Date.now();
  const t0 = now();
  let first = true;
  let hadError = false;
  let closed = false;
  let unsubInner = () => {};
  /** @type {ReturnType<typeof setTimeout> | null} */
  let t10 = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let t30 = null;
  let pendingRetry = reason === "retry";

  const clearTimers = () => {
    if (t10) {
      clearTimeout(t10);
      t10 = null;
    }
    if (t30) {
      clearTimeout(t30);
      t30 = null;
    }
  };

  const armTimers = () => {
    clearTimers();
    if (!eng) return;
    t10 = setTimeout(() => {
      if (!first || closed) return;
      if (markListenerTimeout(id, 10)) {
        safeRun(() => {
          EngTelemetry.trackListenerTimeout({
            action: "timeout_10",
            event: "first_snapshot_timeout_10",
            collection,
            listenerId: id,
            reason,
            durationMs: TIMEOUT_10_MS,
          });
        }, "eng.snap.t10");
        syncWaitHeartbeat();
      }
    }, TIMEOUT_10_MS);
    t30 = setTimeout(() => {
      if (!first || closed) return;
      if (markListenerTimeout(id, 30)) {
        safeRun(() => {
          EngTelemetry.trackListenerTimeout({
            action: "timeout_30",
            event: "first_snapshot_timeout_30",
            collection,
            listenerId: id,
            reason,
            durationMs: TIMEOUT_30_MS,
          });
          if (pendingRetry) {
            EngTelemetry.trackListenerRetry({
              action: "retry_failed",
              event: "retry_failed",
              collection,
              listenerId: id,
              reason: "retry",
            });
            pendingRetry = false;
          }
        }, "eng.snap.t30");
        syncWaitHeartbeat();
      }
    }, TIMEOUT_30_MS);
  };

  if (perf) {
    upsertListener({
      id,
      collection,
      department: departmentForCollection(collection) || ctx.department,
      page: ctx.page,
      startedAt,
      state: "Active",
      durationMs: 0,
      reason,
    });
  }

  registerListenerWatch({
    id,
    collection,
    page: ctx.page,
    department: departmentForCollection(collection) || ctx.department,
    reason,
    startedAt,
    waiting: true,
  });

  if (eng) {
    safeRun(() => {
      EngTelemetry.trackListenerUpsert({
        action: "open",
        event: "listener_start",
        collection,
        listenerId: id,
        reason,
        recreated,
      });
      if (recreated) {
        EngTelemetry.trackListenerRecreated({
          collection,
          listenerId: id,
          reason,
          recreated: true,
        });
      }
    }, "eng.snap.open");
  }
  armTimers();
  syncWaitHeartbeat();

  const reportListenerError = (err) => {
    hadError = true;
    if (perf) {
      upsertListener({ id, state: "Error", error: String(err?.message || err) });
    }
    if (eng) {
      safeRun(() => {
        EngTelemetry.trackListener({
          action: "error",
          collection,
          listenerId: id,
          error: err?.message || err,
          reason,
        });
        EngTelemetry.trackQuery({
          collection,
          durationMs: 0,
          docCount: 0,
          kind: "snapshot_error",
          failure: true,
          queryKey: `${ctx.page}:${collection}:listen`,
        });
        EngTelemetry.trackError({
          source: "firestore",
          message: err?.message || String(err),
          stack: err?.stack || "",
          name: err?.name,
        });
      }, "eng.snap.err");
    }
  };

  const wrapNext = (snap) => {
    const durationMs = now() - t0;
    const docCount = snap?.docs?.length ?? (snap?.exists?.() ? 1 : 0);
    const changes =
      typeof snap?.docChanges === "function" ? snap.docChanges() : [];
    let added = 0;
    let modified = 0;
    let removed = 0;
    for (const c of changes) {
      if (c.type === "added") added += 1;
      else if (c.type === "modified") modified += 1;
      else if (c.type === "removed") removed += 1;
    }

    if (eng && hadError) {
      safeRun(() => {
        EngTelemetry.trackListenerReconnect({
          collection,
          listenerId: id,
          docCount,
          reason: "reconnect",
        });
        EngTelemetry.trackQuery({
          collection,
          durationMs,
          docCount,
          kind: "snapshot_reconnect",
          reconnect: true,
          queryKey: `${ctx.page}:${collection}:listen`,
        });
      }, "eng.snap.reconnect");
      hadError = false;
    }

    if (first) {
      first = false;
      clearTimers();
      const payloadBytes = eng ? estimatePayloadBytes(snap) : null;
      markListenerFirstSnapshot(id, { docCount, payloadBytes, durationMs });
      syncWaitHeartbeat();

      if (perf) {
        recordQuery({
          collection,
          durationMs,
          docCount,
          kind: "snapshot_first",
          queryKey: `${ctx.page}:${collection}:listen`,
        });
        recordRead({ collection, docCount, source: "snapshot_first" });
        onFirstSnapshot({
          collection,
          docCount,
          arrivalMs: durationMs,
        });
      }
      if (eng) {
        safeRun(() => {
          EngTelemetry.noteFirstSnapshot(durationMs);
          EngTelemetry.trackQuery({
            collection,
            durationMs,
            docCount,
            kind: "snapshot_first",
            queryKey: `${ctx.page}:${collection}:listen`,
            constraints,
            firstSnapshot: true,
          });
          EngTelemetry.trackListenerSnapshot({
            event: "first_snapshot_received",
            collection,
            listenerId: id,
            docCount,
            durationMs,
            payloadBytes,
            reason,
            constraints,
            queryKey: `${ctx.page}:${collection}:listen`,
            firstSnapshot: true,
          });
          EngTelemetry.trackListener({
            action: "snapshot",
            event: "first_snapshot_duration",
            collection,
            listenerId: id,
            durationMs,
            docCount,
            reason,
          });
          EngTelemetry.trackListener({
            action: "snapshot",
            event: "first_snapshot_doccount",
            collection,
            listenerId: id,
            docCount,
            durationMs,
            reason,
          });
          if (pendingRetry) {
            EngTelemetry.trackListenerRetry({
              action: "retry_success",
              event: "retry_success",
              collection,
              listenerId: id,
              reason: "retry",
              durationMs,
              docCount,
            });
            pendingRetry = false;
          }
        }, "eng.snap.first");
      }
    } else {
      if (perf) {
        recordRead({
          collection,
          docCount:
            added + modified + removed > 0
              ? added + modified + removed
              : docCount,
          source: "snapshot_update",
        });
        recordQuery({
          collection,
          durationMs: now() - t0,
          docCount: added + modified + removed,
          kind: "snapshot_incremental",
          queryKey: `${ctx.page}:${collection}:listen`,
        });
      }
      if (eng) {
        snapshotSample += 1;
        const every = snapshotEvery();
        if (snapshotSample % every === 0) {
          safeRun(() => {
            EngTelemetry.trackQuery({
              collection,
              durationMs: now() - t0,
              docCount: added + modified + removed,
              kind: "snapshot_incremental",
              queryKey: `${ctx.page}:${collection}:listen`,
              constraints,
              subsequentSnapshot: true,
            });
            EngTelemetry.trackListenerSnapshot({
              event: "snapshot_incremental",
              collection,
              listenerId: id,
              docCount,
              durationMs: now() - t0,
              subsequentSnapshot: true,
              queryKey: `${ctx.page}:${collection}:listen`,
              constraints,
            });
          }, "eng.snap.inc");
        }
      }
    }

    if (perf) {
      upsertListener({
        id,
        durationMs: Date.now() - startedAt,
        lastDocCount: docCount,
        lastAt: Date.now(),
        lastAdded: added,
        lastModified: modified,
        lastRemoved: removed,
        state: "Active",
      });
    }
    return onNext(snap);
  };

  const wrapError = (err) => {
    reportListenerError(err);
    if (typeof onError === "function") return onError(err);
  };

  const attach = () => {
    if (typeof onNext === "object" && onNext !== null && !onError) {
      const observer = onNext;
      unsubInner = fbOnSnapshot(refOrQuery, {
        ...observer,
        next: (snap) => wrapNext(snap),
        error: (err) => {
          reportListenerError(err);
          if (observer.error) return observer.error(err);
        },
      });
    } else if (options !== undefined) {
      unsubInner = fbOnSnapshot(refOrQuery, wrapNext, wrapError, options);
    } else if (onError !== undefined) {
      unsubInner = fbOnSnapshot(refOrQuery, wrapNext, wrapError);
    } else {
      unsubInner = fbOnSnapshot(refOrQuery, wrapNext, wrapError);
    }
  };

  attach();

  /** User retry: drop and re-attach the SAME query/callbacks (no browser reload). */
  const recreate = () => {
    if (closed) return;
    try {
      unsubInner();
    } catch {
      /* ignore */
    }
    first = true;
    hadError = false;
    pendingRetry = true;
    registerListenerWatch({
      id,
      collection,
      page: ctx.page,
      department: departmentForCollection(collection) || ctx.department,
      reason: "retry",
      startedAt: Date.now(),
      waiting: true,
    });
    setListenerRecreate(id, recreate);
    armTimers();
    syncWaitHeartbeat();
    if (eng) {
      safeRun(() => {
        EngTelemetry.trackListenerUpsert({
          action: "open",
          event: "listener_start",
          collection,
          listenerId: id,
          reason: "retry",
          recreated: true,
        });
        EngTelemetry.trackListenerRecreated({
          collection,
          listenerId: id,
          reason: "retry",
          recreated: true,
        });
      }, "eng.snap.retry.attach");
    }
    attach();
  };
  setListenerRecreate(id, recreate);

  return () => {
    closed = true;
    clearTimers();
    unregisterListenerWatch(id, reason);
    syncWaitHeartbeat();
    if (perf) closeListener(id);
    if (eng) {
      safeRun(() => {
        EngTelemetry.trackListenerClose({
          collection,
          listenerId: id,
          reason,
        });
      }, "eng.snap.close");
    }
    try {
      unsubInner();
    } catch {
      /* ignore */
    }
  };
}

export async function trackedGetDocs(query) {
  if (!monitoring()) return fbGetDocs(query);
  const perf = isMonitorEnabled();
  const eng = engOn();
  const collection = extractCollectionName(query);
  const ctx = getPageContext();
  const constraints = eng ? describeQueryConstraints(query) : null;
  const t0 = now();
  const snap = await fbGetDocs(query);
  const durationMs = now() - t0;
  const docCount = snap.docs?.length || 0;
  if (perf) {
    recordQuery({
      collection,
      durationMs,
      docCount,
      kind: "getDocs",
      queryKey: `${ctx.page}:${collection}:getDocs`,
    });
    recordRead({ collection, docCount, source: "getDocs" });
  }
  if (eng) {
    safeRun(() => {
      EngTelemetry.trackQuery({
        collection,
        durationMs,
        docCount,
        kind: "getDocs",
        queryKey: `${ctx.page}:${collection}:getDocs`,
        constraints,
      });
    }, "eng.getDocs");
  }
  return snap;
}

export async function trackedGetDoc(docRef) {
  if (!monitoring()) return fbGetDoc(docRef);
  const perf = isMonitorEnabled();
  const eng = engOn();
  const collection = extractCollectionName(docRef);
  const ctx = getPageContext();
  const constraints = eng ? describeQueryConstraints(docRef) : null;
  const t0 = now();
  const snap = await fbGetDoc(docRef);
  const durationMs = now() - t0;
  const docCount = snap.exists() ? 1 : 0;
  if (perf) {
    recordQuery({
      collection,
      durationMs,
      docCount,
      kind: "getDoc",
      queryKey: `${ctx.page}:${collection}:getDoc`,
    });
    recordRead({ collection, docCount, source: "getDoc" });
  }
  if (eng) {
    safeRun(() => {
      EngTelemetry.trackQuery({
        collection,
        durationMs,
        docCount,
        kind: "getDoc",
        queryKey: `${ctx.page}:${collection}:getDoc`,
        constraints,
      });
    }, "eng.getDoc");
  }
  return snap;
}
