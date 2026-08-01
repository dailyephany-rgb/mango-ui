/**
 * Behaviour-identical Firestore wrappers for passive metrics.
 * Same signatures as firebase/firestore onSnapshot / getDocs / getDoc.
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

let listenerSeq = 0;

function now() {
  return performance.now();
}

/**
 * @param {any} refOrQuery
 * @param {any} onNext
 * @param {any} [onError]
 * @param {any} [options]
 */
export function trackedOnSnapshot(refOrQuery, onNext, onError, options) {
  if (!isMonitorEnabled()) {
    return fbOnSnapshot(refOrQuery, onNext, onError, options);
  }

  const collection = extractCollectionName(refOrQuery);
  const ctx = getPageContext();
  const id = `L${++listenerSeq}-${collection}-${Date.now()}`;
  const startedAt = Date.now();
  const t0 = now();
  let first = true;

  upsertListener({
    id,
    collection,
    department: departmentForCollection(collection) || ctx.department,
    page: ctx.page,
    startedAt,
    state: "Active",
    durationMs: 0,
  });

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
    } else {
      // Billable-ish: prefer change counts for update telemetry
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
    upsertListener({
      id,
      durationMs: Date.now() - startedAt,
      lastDocCount: docCount,
      lastAt: Date.now(),
      lastAdded: added,
      lastModified: modified,
      lastRemoved: removed,
    });
    return onNext(snap);
  };

  const wrapError = onError
    ? (err) => {
        upsertListener({ id, state: "Error", error: String(err?.message || err) });
        return onError(err);
      }
    : undefined;

  // Support firebase overload variants
  let unsub;
  if (typeof onNext === "object" && onNext !== null && !onError) {
    // onSnapshot(ref, { next, error, ... })
    const observer = onNext;
    unsub = fbOnSnapshot(refOrQuery, {
      ...observer,
      next: (snap) => wrapNext(snap),
      error: observer.error
        ? (err) => {
            upsertListener({
              id,
              state: "Error",
              error: String(err?.message || err),
            });
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
    closeListener(id);
    try {
      unsub();
    } catch {
      /* ignore */
    }
  };
}

export async function trackedGetDocs(query) {
  if (!isMonitorEnabled()) return fbGetDocs(query);
  const collection = extractCollectionName(query);
  const ctx = getPageContext();
  const t0 = now();
  const snap = await fbGetDocs(query);
  const durationMs = now() - t0;
  const docCount = snap.docs?.length || 0;
  recordQuery({
    collection,
    durationMs,
    docCount,
    kind: "getDocs",
    queryKey: `${ctx.page}:${collection}:getDocs`,
  });
  recordRead({ collection, docCount, source: "getDocs" });
  return snap;
}

export async function trackedGetDoc(docRef) {
  if (!isMonitorEnabled()) return fbGetDoc(docRef);
  const collection = extractCollectionName(docRef);
  const ctx = getPageContext();
  const t0 = now();
  const snap = await fbGetDoc(docRef);
  const durationMs = now() - t0;
  const docCount = snap.exists() ? 1 : 0;
  recordQuery({
    collection,
    durationMs,
    docCount,
    kind: "getDoc",
    queryKey: `${ctx.page}:${collection}:getDoc`,
  });
  recordRead({ collection, docCount, source: "getDoc" });
  return snap;
}
