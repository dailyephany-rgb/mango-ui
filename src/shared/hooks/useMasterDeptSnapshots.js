import { useEffect, useState, useRef, startTransition } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { trackedOnSnapshot as onSnapshot } from "../firestore/trackedFirestore.js";
import {
  createIncrementalDocStore,
  compareByTimePrinted,
} from "../firestore/incrementalDocStore.js";
import { db } from "../../firebaseConfig.js";
import { compositeId } from "../utils/ids.js";
import {
  getLocalDateString,
  localDayStart,
  localDayEndExclusive,
} from "../utils/dates.js";
import { annotateListenReason } from "../../engineering/telemetry/listenerWatch.js";
import { subscribeListenerRecovery } from "../firestore/listenerRecovery.js";

/**
 * Shared master + department + critical_alerts subscriptions.
 *
 * Readiness (first useful snapshot):
 *   `loading` clears when master_register first snapshot arrives.
 *   dept + critical hydrate asynchronously and do NOT block the table shell.
 *
 * Snapshot processing is incremental (docChanges) after the first seed.
 * Firestore remains the only source of truth. Clinical write paths unchanged.
 */
export function useMasterDeptSnapshots({
  deptCollection,
  currentDept,
  masterDeptKey = currentDept,
  dateFrom,
  dateTo,
  /** When false, unsubscribe all triad listeners and clear snapshot state. Default true. */
  enabled = true,
  getDeptDocKey = (data) => compositeId(data.regNo, data.diagnosticNo),
  isSavedDoc = (data) =>
    data?.saved === "Yes" || data?.status === "saved",
  criticalBelongsToDept = (data, dept) => data.dept === dept,
  getCriticalKey = (data) => compositeId(data.regNo, data.diagnosticNo),
  mapMasterDoc = (d) => ({ id: d.id, ...d.data() }),
}) {
  const [masterEntries, setMasterEntries] = useState([]);
  const [deptDocs, setDeptDocs] = useState({});
  const [savedSet, setSavedSet] = useState(new Set());
  const [criticalReportedSet, setCriticalReportedSet] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [deptReady, setDeptReady] = useState(false);
  const [criticalReady, setCriticalReady] = useState(false);
  const [masterError, setMasterError] = useState(null);
  const [recoverGen, setRecoverGen] = useState(0);
  const listenGenRef = useRef(0);

  // Online / assertion recovery → remount triad exactly once per nudge.
  useEffect(() => {
    return subscribeListenerRecovery(() => {
      setRecoverGen((n) => n + 1);
    });
  }, []);

  useEffect(() => {
    const clearState = () => {
      setMasterEntries([]);
      setDeptDocs({});
      setSavedSet(new Set());
      setCriticalReportedSet(new Set());
      setLoading(false);
      setDeptReady(false);
      setCriticalReady(false);
      setMasterError(null);
    };

    if (!enabled) {
      clearState();
      return undefined;
    }

    const fromStr = dateFrom || getLocalDateString();
    const toStr = dateTo || getLocalDateString();
    const start = localDayStart(fromStr);
    const endExclusive = localDayEndExclusive(toStr);

    if (!masterDeptKey || !start || !endExclusive) {
      clearState();
      return undefined;
    }

    // Only block UI on the true first subscribe. Re-querying on date/filter
    // changes must NOT set loading — department pages early-return on loading
    // and that unmounts the date inputs (can't type / picker closes).
    const isFirstListen = listenGenRef.current === 0;
    listenGenRef.current += 1;
    if (isFirstListen) setLoading(true);
    setDeptReady(false);
    setCriticalReady(false);
    setMasterError(null);
    const listenReason =
      recoverGen > 0 ? "retry" : isFirstListen ? "page_load" : "deps_change";

    const startTs = Timestamp.fromDate(start);
    const endTs = Timestamp.fromDate(endExclusive);

    const masterStore = createIncrementalDocStore({
      mapDoc: mapMasterDoc,
      compare: compareByTimePrinted,
      label: "master_register",
    });

    const deptById = new Map();
    let deptSeeded = false;

    const criticalById = new Map();
    let criticalSeeded = false;

    const masterQuery = query(
      collection(db, "master_register"),
      where("departments", "array-contains", masterDeptKey),
      where("timePrinted", ">=", startTs),
      where("timePrinted", "<", endTs),
      orderBy("timePrinted", "asc")
    );
    try {
      masterQuery.__mangoCollection = "master_register";
    } catch {
      /* ignore */
    }
    annotateListenReason(masterQuery, listenReason);

    const unsubMaster = onSnapshot(
      masterQuery,
      (snapshot) => {
        const result = masterStore.apply(snapshot);
        if (result.changed) {
          startTransition(() => {
            setMasterEntries(result.values);
          });
        }
        // FIRST USEFUL SNAPSHOT — table usable; dept/critical may still hydrate.
        setLoading(false);
        setMasterError(null);
      },
      (err) => {
        console.error(
          "[useMasterDeptSnapshots] master_register query failed — check composite index (departments + timePrinted):",
          err
        );
        setLoading(false);
        setMasterError(err?.message || String(err));
      }
    );

    const deptQuery = query(
      collection(db, deptCollection),
      where("timePrinted", ">=", startTs),
      where("timePrinted", "<", endTs),
      orderBy("timePrinted", "asc")
    );
    try {
      deptQuery.__mangoCollection = deptCollection;
    } catch {
      /* ignore */
    }
    annotateListenReason(deptQuery, listenReason);

    const publishDeptState = () => {
      const docsMap = {};
      const sSet = new Set();
      for (const { key, data } of deptById.values()) {
        docsMap[key] = data;
        if (isSavedDoc(data)) sSet.add(key);
      }
      startTransition(() => {
        setDeptDocs(docsMap);
        setSavedSet(sSet);
        setDeptReady(true);
      });
    };

    const unsubDept = onSnapshot(
      deptQuery,
      (snap) => {
        const t0 =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const stats = {
          label: deptCollection,
          initial: false,
          added: 0,
          modified: 0,
          removed: 0,
          processed: 0,
        };

        if (!deptSeeded) {
          deptSeeded = true;
          stats.initial = true;
          deptById.clear();
          for (const d of snap.docs) {
            const data = d.data();
            const key = getDeptDocKey(data, d.id);
            deptById.set(d.id, { key, data });
            stats.processed += 1;
            stats.added += 1;
          }
          publishDeptState();
          emitDeptMetrics(stats, t0, deptById.size);
          return;
        }

        const changes = snap.docChanges();
        if (!changes.length) {
          emitDeptMetrics(stats, t0, deptById.size);
          return;
        }

        for (const change of changes) {
          stats.processed += 1;
          if (change.type === "added" || change.type === "modified") {
            const data = change.doc.data();
            const key = getDeptDocKey(data, change.doc.id);
            deptById.set(change.doc.id, { key, data });
            if (change.type === "added") stats.added += 1;
            else stats.modified += 1;
          } else if (change.type === "removed") {
            deptById.delete(change.doc.id);
            stats.removed += 1;
          }
        }
        publishDeptState();
        emitDeptMetrics(stats, t0, deptById.size);
      },
      (err) => {
        console.error(
          `[useMasterDeptSnapshots] ${deptCollection} timePrinted query failed:`,
          err
        );
      }
    );

    const criticalQuery = query(
      collection(db, "critical_alerts"),
      where("dept", "==", currentDept),
      where("flaggedAt", ">=", startTs),
      where("flaggedAt", "<", endTs),
      orderBy("flaggedAt", "asc")
    );
    try {
      criticalQuery.__mangoCollection = "critical_alerts";
    } catch {
      /* ignore */
    }
    annotateListenReason(criticalQuery, listenReason);

    const publishCriticalState = () => {
      const cSet = new Set();
      for (const key of criticalById.values()) {
        if (key) cSet.add(key);
      }
      startTransition(() => {
        setCriticalReportedSet(cSet);
        setCriticalReady(true);
      });
    };

    const unsubCritical = onSnapshot(
      criticalQuery,
      (snap) => {
        if (!criticalSeeded) {
          criticalSeeded = true;
          criticalById.clear();
          for (const docSnap of snap.docs) {
            const data = docSnap.data();
            if (data.regNo && criticalBelongsToDept(data, currentDept)) {
              criticalById.set(docSnap.id, getCriticalKey(data));
            }
          }
          publishCriticalState();
          return;
        }

        const changes = snap.docChanges();
        if (!changes.length) return;

        for (const change of changes) {
          if (change.type === "added" || change.type === "modified") {
            const data = change.doc.data();
            if (data.regNo && criticalBelongsToDept(data, currentDept)) {
              criticalById.set(change.doc.id, getCriticalKey(data));
            } else {
              criticalById.delete(change.doc.id);
            }
          } else if (change.type === "removed") {
            criticalById.delete(change.doc.id);
          }
        }
        publishCriticalState();
      },
      (err) => {
        console.error(
          "[useMasterDeptSnapshots] critical_alerts flaggedAt query failed — check index (dept + flaggedAt):",
          err
        );
      }
    );

    return () => {
      masterStore.clear();
      deptById.clear();
      criticalById.clear();
      unsubMaster();
      unsubDept();
      unsubCritical();
    };
    // Intentional: stable callbacks from call site; re-subscribe on date/dept/collection/enabled/recover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    deptCollection,
    currentDept,
    masterDeptKey,
    dateFrom,
    dateTo,
    enabled,
    recoverGen,
  ]);

  return {
    masterEntries,
    setMasterEntries,
    deptDocs,
    setDeptDocs,
    savedSet,
    criticalReportedSet,
    loading,
    setLoading,
    /** Secondary hydration — do not gate primary table on these. */
    deptReady,
    criticalReady,
    masterError,
  };
}

function emitDeptMetrics(stats, t0, mapSize) {
  const durationMs =
    (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
  try {
    import("../../performance/performanceCollector.js").then((m) => {
      m.recordIncrementalSync?.({
        ...stats,
        mapSize,
        durationMs,
      });
    });
  } catch {
    /* ignore */
  }
  try {
    import("../../engineering/telemetry/EngTelemetry.js").then((m) => {
      m.EngTelemetry?.trackListener?.({
        action: "merge",
        event: "listener_merge",
        collection: stats.label || "unknown",
        durationMs,
        docCount: mapSize,
        changeCount:
          (stats.added || 0) + (stats.modified || 0) + (stats.removed || 0),
        mergeMs: durationMs,
        firstSnapshot: !!stats.initial,
        subsequentSnapshot: !stats.initial,
      });
    });
  } catch {
    /* ignore */
  }
}
