/**
 * Behaviour-identical Firestore wrappers for passive metrics + Engineering telemetry.
 * Same signatures as firebase/firestore onSnapshot / getDocs / getDoc.
 *
 * Passthrough when BOTH mango.perf.monitor=0 AND mango.eng.telemetry=0.
 * Eng calls are fire-and-forget inside safeRun — never await on clinical path.
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

let listenerSeq = 0;
let snapshotSample = 0;

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
  const id = `L${++listenerSeq}-${collection}-${Date.now()}`;
  const startedAt = Date.now();
  const t0 = now();
  let first = true;

  if (perf) {
    upsertListener({
      id,
      collection,
      department: departmentForCollection(collection) || ctx.department,
      page: ctx.page,
      startedAt,
      state: "Active",
      durationMs: 0,
    });
  }

  if (eng) {
    safeRun(() => {
      EngTelemetry.trackListenerUpsert({
        action: "open",
        collection,
        listenerId: id,
      });
    }, "eng.snap.open");
  }

  const wrapNext = (snap) => {
    const durationMs = now() - t0;
    const docCount = snap?.docs?.length ?? (snap?.exists?.() ? 1 : 0);
    const changes = typeof snap?.docChanges === "function" ? snap.docChanges() : [];
    let added = 0;
    let modified = 0;
    let removed = 0;
    for (const c of changes) {
      if (c.type === "added") added += 1;
      else if (c.type === "modified") modified += 1;
      else if (c.type === "removed") removed += 1;
    }

    if (first) {
      first = false;
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
          EngTelemetry.trackQuery({
            collection,
            durationMs,
            docCount,
            kind: "snapshot_first",
            queryKey: `${ctx.page}:${collection}:listen`,
          });
          EngTelemetry.trackListenerSnapshot({
            collection,
            listenerId: id,
            docCount,
            durationMs,
          });
        }, "eng.snap.first");
      }
    } else {
      if (perf) {
        recordRead({
          collection,
          docCount: added + modified + removed > 0 ? added + modified + removed : docCount,
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
        if (snapshotSample % 10 === 0) {
          safeRun(() => {
            EngTelemetry.trackQuery({
              collection,
              durationMs: now() - t0,
              docCount: added + modified + removed,
              kind: "snapshot_incremental",
              queryKey: `${ctx.page}:${collection}:listen`,
            });
            EngTelemetry.trackListenerSnapshot({
              collection,
              listenerId: id,
              docCount,
              durationMs: now() - t0,
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
      });
    }
    return onNext(snap);
  };

  const wrapError = onError
    ? (err) => {
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
            });
            EngTelemetry.trackError({
              source: "firestore",
              message: err?.message || String(err),
              stack: err?.stack || "",
            });
          }, "eng.snap.err");
        }
        return onError(err);
      }
    : undefined;

  let unsub;
  if (typeof onNext === "object" && onNext !== null && !onError) {
    const observer = onNext;
    unsub = fbOnSnapshot(refOrQuery, {
      ...observer,
      next: (snap) => wrapNext(snap),
      error: observer.error
        ? (err) => {
            if (perf) {
              upsertListener({
                id,
                state: "Error",
                error: String(err?.message || err),
              });
            }
            if (eng) {
              safeRun(() => {
                EngTelemetry.trackListener({
                  action: "error",
                  collection,
                  listenerId: id,
                  error: err?.message || err,
                });
                EngTelemetry.trackError({
                  source: "firestore",
                  message: err?.message || String(err),
                  stack: err?.stack || "",
                });
              }, "eng.snap.err2");
            }
            return observer.error(err);
          }
        : undefined,
    });
  } else if (options !== undefined) {
    unsub = fbOnSnapshot(refOrQuery, wrapNext, wrapError, options);
  } else if (onError !== undefined) {
    unsub = fbOnSnapshot(refOrQuery, wrapNext, wrapError);
  } else {
    unsub = fbOnSnapshot(refOrQuery, wrapNext);
  }

  return () => {
    if (perf) closeListener(id);
    if (eng) {
      safeRun(() => {
        EngTelemetry.trackListenerClose({
          collection,
          listenerId: id,
        });
      }, "eng.snap.close");
    }
    try {
      unsub();
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
      });
    }, "eng.getDoc");
  }
  return snap;
}
