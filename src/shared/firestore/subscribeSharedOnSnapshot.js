/**
 * Refcounted shared onSnapshot for identical Firestore queries.
 * Same query shape as a direct trackedOnSnapshot — only dedupes concurrent subscribers.
 * Replay last snapshot to late joiners so behaviour matches a fresh listen after first seed.
 */
import { trackedOnSnapshot as onSnapshot } from "./trackedFirestore.js";
import { scopedTimePrintedQuery } from "./scopedTimePrintedQuery.js";

/** @type {Map<string, { unsub: () => void, listeners: Set<{onNext: Function, onError?: Function}>, lastSnap: import('firebase/firestore').QuerySnapshot | null }>} */
const shares = new Map();

/**
 * @param {string} shareKey Stable identity for the query (e.g. master_register:2026-01-01:2026-01-01)
 * @param {() => import('firebase/firestore').Query | null} createQuery
 * @param {(snap: import('firebase/firestore').QuerySnapshot) => void} onNext
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe for this subscriber only
 */
export function subscribeSharedOnSnapshot(shareKey, createQuery, onNext, onError) {
  if (!shareKey || typeof createQuery !== "function" || typeof onNext !== "function") {
    return () => {};
  }

  let entry = shares.get(shareKey);
  if (!entry) {
    const q = createQuery();
    if (!q) return () => {};

    const listeners = new Set();
    const unsub = onSnapshot(
      q,
      (snap) => {
        const current = shares.get(shareKey);
        if (!current) return;
        current.lastSnap = snap;
        for (const sub of current.listeners) {
          try {
            sub.onNext(snap);
          } catch (err) {
            console.error("[subscribeSharedOnSnapshot] onNext failed:", err);
          }
        }
      },
      (err) => {
        const current = shares.get(shareKey);
        if (!current) return;
        for (const sub of current.listeners) {
          try {
            sub.onError?.(err);
          } catch {
            /* ignore */
          }
        }
      }
    );

    entry = { unsub, listeners, lastSnap: null };
    shares.set(shareKey, entry);
  }

  const sub = { onNext, onError };
  entry.listeners.add(sub);
  if (entry.lastSnap) {
    try {
      onNext(entry.lastSnap);
    } catch (err) {
      console.error("[subscribeSharedOnSnapshot] replay failed:", err);
    }
  }

  return () => {
    const current = shares.get(shareKey);
    if (!current) return;
    current.listeners.delete(sub);
    if (current.listeners.size === 0) {
      try {
        current.unsub();
      } catch {
        /* ignore */
      }
      shares.delete(shareKey);
    }
  };
}

/**
 * Shared day-scoped master_register listen (Owner analytics).
 * Query shape unchanged vs scopedTimePrintedQuery("master_register", dateRange).
 */
export function subscribeSharedMasterRegister(dateRange, onNext, onError) {
  const from = dateRange?.from || "";
  const to = dateRange?.to || "";
  const shareKey = `master_register:${from}:${to}`;
  return subscribeSharedOnSnapshot(
    shareKey,
    () => scopedTimePrintedQuery("master_register", dateRange),
    onNext,
    onError
  );
}
