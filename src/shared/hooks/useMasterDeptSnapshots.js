import { useEffect, useState, useRef, useCallback, startTransition } from "react";
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
import {
  subscribeListenerRecovery,
  isListenerTimeoutError,
  dispatchRecovery,
  CLINICAL_FIRST_SNAPSHOT_HUNG_MS,
} from "../firestore/listenerRecovery.js";

/** @typedef {'IDLE'|'CONNECTING'|'READY'|'RECOVERING'|'TIMEOUT'|'ERROR'|'OFFLINE'|'CLOSED'} ClinicalListenStatus */

const MASTER_HUNG_MS = CLINICAL_FIRST_SNAPSHOT_HUNG_MS;

function classifyFailStatus() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "OFFLINE";
  }
  return "ERROR";
}

/**
 * Shared master + department + critical_alerts subscriptions.
 *
 * Readiness: `listenStatus` is CONNECTING until master_register first snapshot
 * (including cache). `loading` is never used as a full-page gate.
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
  const [loading, setLoading] = useState(false);
  const [deptReady, setDeptReady] = useState(false);
  const [criticalReady, setCriticalReady] = useState(false);
  const [masterError, setMasterError] = useState(null);
  const [listenStatus, setListenStatus] = useState(
    /** @type {ClinicalListenStatus} */ ("IDLE")
  );
  const [recoverGen, setRecoverGen] = useState(0);
  const listenGenRef = useRef(0);
  const listenStatusRef = useRef(listenStatus);
  listenStatusRef.current = listenStatus;
  const recoveringRef = useRef(false);

  const retryListen = useCallback(() => {
    const s = listenStatusRef.current;
    if (s === "READY" || s === "CLOSED" || s === "IDLE") return;
    if (s === "RECOVERING" || recoveringRef.current) return;
    recoveringRef.current = true;
    setListenStatus("RECOVERING");
    setMasterError(null);
    dispatchRecovery("user_retry");
    window.setTimeout(() => {
      recoveringRef.current = false;
    }, 1500);
  }, []);

  // Assertion / explicit remount only. timeout/online go through dispatchRecovery
  // (retryWaiting) and must not also increment recoverGen.
  useEffect(() => {
    return subscribeListenerRecovery((reason) => {
      if (reason === "timeout" || reason === "online") return;
      if (reason === "unrecoverable") {
        setLoading(false);
        setListenStatus(
          typeof navigator !== "undefined" && navigator.onLine === false
            ? "OFFLINE"
            : "ERROR"
        );
        setMasterError(
          "Firestore client did not recover. Tap Retry, or reload the page."
        );
        return;
      }
      if (listenStatusRef.current === "RECOVERING" && recoveringRef.current) {
        return;
      }
      recoveringRef.current = true;
      setListenStatus("RECOVERING");
      setRecoverGen((n) => n + 1);
      window.setTimeout(() => {
        recoveringRef.current = false;
      }, 1500);
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
      setListenStatus("CLOSED");
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

    const isFirstListen = listenGenRef.current === 0;
    listenGenRef.current += 1;
    setLoading(false);
    setListenStatus(recoverGen > 0 ? "RECOVERING" : "CONNECTING");
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

    let masterSettled = false;
    const hungTimer = setTimeout(() => {
      if (masterSettled) return;
      masterSettled = true;
      const offline =
        typeof navigator !== "undefined" && navigator.onLine === false;
      setLoading(false);
      setListenStatus(offline ? "OFFLINE" : "TIMEOUT");
      setMasterError(
        offline
          ? "You appear offline. Live data will resume when the network returns."
          : "Live data did not arrive. You can retry without reloading."
      );
      if (!offline) {
        dispatchRecovery("timeout");
      }
    }, MASTER_HUNG_MS);

    const unsubMaster = onSnapshot(
      masterQuery,
      (snapshot) => {
        masterSettled = true;
        clearTimeout(hungTimer);
        const result = masterStore.apply(snapshot);
        if (result.changed) {
          startTransition(() => {
            setMasterEntries(result.values);
          });
        }
        // FIRST USEFUL SNAPSHOT — table usable; dept/critical may still hydrate.
        setLoading(false);
        setMasterError(null);
        setListenStatus("READY");
      },
      (err) => {
        masterSettled = true;
        clearTimeout(hungTimer);
        console.error(
          "[useMasterDeptSnapshots] master_register query failed — check composite index (departments + timePrinted):",
          err
        );
        setLoading(false);
        setMasterError(err?.message || String(err));
        if (isListenerTimeoutError(err)) {
          const offline =
            typeof navigator !== "undefined" && navigator.onLine === false;
          setListenStatus(offline ? "OFFLINE" : "TIMEOUT");
        } else {
          setListenStatus(classifyFailStatus());
        }
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
      clearTimeout(hungTimer);
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
    listenStatus,
    retryListen,
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
