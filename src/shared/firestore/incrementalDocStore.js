/**
 * Incremental Firestore snapshot processing via docChanges().
 * Map<documentId, value> is the in-memory source; arrays derived on change only.
 * Firestore remains authoritative — this never writes and never replaces listens.
 */

/**
 * @template T
 * @param {object} opts
 * @param {(docSnap: import('firebase/firestore').QueryDocumentSnapshot) => T} opts.mapDoc
 * @param {(a: T, b: T) => number} [opts.compare] — optional stable order for derived arrays
 * @param {string} [opts.label] — metrics label
 */
export function createIncrementalDocStore({ mapDoc, compare = null, label = "" }) {
  /** @type {Map<string, T>} */
  const map = new Map();
  let seeded = false;

  function deriveArray() {
    const values = [...map.values()];
    if (typeof compare === "function") values.sort(compare);
    return values;
  }

  return {
    get map() {
      return map;
    },
    get size() {
      return map.size;
    },
    get seeded() {
      return seeded;
    },

    clear() {
      map.clear();
      seeded = false;
    },

    /**
     * Apply a QuerySnapshot. Returns whether React state should update.
     * @param {import('firebase/firestore').QuerySnapshot} snapshot
     */
    apply(snapshot) {
      const t0 =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const stats = {
        label,
        initial: false,
        added: 0,
        modified: 0,
        removed: 0,
        processed: 0,
        mapSize: 0,
        durationMs: 0,
      };

      if (!seeded) {
        seeded = true;
        stats.initial = true;
        for (const d of snapshot.docs) {
          map.set(d.id, mapDoc(d));
          stats.processed += 1;
          stats.added += 1;
        }
        stats.mapSize = map.size;
        stats.durationMs =
          (typeof performance !== "undefined" ? performance.now() : Date.now()) -
          t0;
        emitMetrics(stats);
        return {
          changed: true,
          values: deriveArray(),
          stats,
        };
      }

      const changes = snapshot.docChanges();
      if (!changes.length) {
        stats.mapSize = map.size;
        stats.durationMs =
          (typeof performance !== "undefined" ? performance.now() : Date.now()) -
          t0;
        emitMetrics(stats);
        return { changed: false, values: null, stats };
      }

      for (const change of changes) {
        stats.processed += 1;
        if (change.type === "added") {
          map.set(change.doc.id, mapDoc(change.doc));
          stats.added += 1;
        } else if (change.type === "modified") {
          map.set(change.doc.id, mapDoc(change.doc));
          stats.modified += 1;
        } else if (change.type === "removed") {
          map.delete(change.doc.id);
          stats.removed += 1;
        }
      }

      stats.mapSize = map.size;
      stats.durationMs =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        t0;
      emitMetrics(stats);

      return {
        changed: true,
        values: deriveArray(),
        stats,
      };
    },
  };
}

function emitMetrics(stats) {
  try {
    import("../../performance/performanceCollector.js")
      .then((m) => m.recordIncrementalSync?.(stats))
      .catch(() => {});
  } catch {
    /* ignore */
  }
  try {
    import("../../engineering/telemetry/EngTelemetry.js").then((m) => {
      m.EngTelemetry?.trackListener?.({
        action: "merge",
        event: "listener_merge",
        collection: stats.label || "unknown",
        durationMs: stats.durationMs,
        docCount: stats.mapSize,
        changeCount:
          (stats.added || 0) + (stats.modified || 0) + (stats.removed || 0),
        mergeMs: stats.durationMs,
        firstSnapshot: !!stats.initial,
        subsequentSnapshot: !stats.initial,
      });
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Compare mapped master rows by timePrinted (asc), matching orderBy. */
export function compareByTimePrinted(a, b) {
  const ta = toMillis(a?.timePrinted);
  const tb = toMillis(b?.timePrinted);
  if (ta !== tb) return ta - tb;
  const ida = a?.id || "";
  const idb = b?.id || "";
  return ida < idb ? -1 : ida > idb ? 1 : 0;
}

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  return 0;
}
