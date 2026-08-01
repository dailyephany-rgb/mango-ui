import { useEffect, useState } from "react";
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
import {
  getLocalDateString,
  localDayStart,
  localDayEndExclusive,
} from "../utils/dates.js";

/**
 * Scoped master_register subscription only.
 * Incremental docChanges() after first seed.
 */
export function useScopedMasterEntries({
  masterDeptKey = null,
  dateFrom,
  dateTo,
  mapMasterDoc = (d) => ({ id: d.id, ...d.data() }),
}) {
  const [masterEntries, setMasterEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fromStr = dateFrom || getLocalDateString();
    const toStr = dateTo || getLocalDateString();
    const start = localDayStart(fromStr);
    const endExclusive = localDayEndExclusive(toStr);

    if (!start || !endExclusive) {
      setMasterEntries([]);
      setLoading(false);
      return undefined;
    }

    const startTs = Timestamp.fromDate(start);
    const endTs = Timestamp.fromDate(endExclusive);

    const store = createIncrementalDocStore({
      mapDoc: mapMasterDoc,
      compare: compareByTimePrinted,
      label: "master_register:scoped",
    });

    const masterQuery = masterDeptKey
      ? query(
          collection(db, "master_register"),
          where("departments", "array-contains", masterDeptKey),
          where("timePrinted", ">=", startTs),
          where("timePrinted", "<", endTs),
          orderBy("timePrinted", "asc")
        )
      : query(
          collection(db, "master_register"),
          where("timePrinted", ">=", startTs),
          where("timePrinted", "<", endTs),
          orderBy("timePrinted", "asc")
        );
    try {
      masterQuery.__mangoCollection = "master_register";
    } catch {
      /* ignore */
    }

    const unsub = onSnapshot(
      masterQuery,
      (snapshot) => {
        const result = store.apply(snapshot);
        if (result.changed) {
          setMasterEntries(result.values);
        }
        setLoading(false);
      },
      (err) => {
        console.error(
          "[useScopedMasterEntries] master_register query failed — check indexes:",
          err
        );
        setLoading(false);
      }
    );

    return () => {
      store.clear();
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterDeptKey, dateFrom, dateTo]);

  return { masterEntries, setMasterEntries, loading };
}
