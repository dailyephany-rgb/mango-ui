
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

import {
  getLocalDateString,
  localDayStart,
  localDayEndExclusive,
} from "../utils/dates.js";
import { annotateListenReason } from "../../engineering/telemetry/listenerWatch.js";

const defaultMapMasterDoc = (d) => ({
  id: d.id,
  ...d.data(),
});

export function useMasterRegisterSnapshots({
  dateFrom,
  dateTo,
  mapMasterDoc = defaultMapMasterDoc,
}) {
  const [masterEntries, setMasterEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const listenGenRef = useRef(0);


  useEffect(() => {
    setLoading(true);
   
    const fromStr = dateFrom || getLocalDateString();
    const toStr = dateTo || getLocalDateString();

const start = localDayStart(fromStr);
const endExclusive = localDayEndExclusive(toStr);

if (!start || !endExclusive) {
  setMasterEntries([]);
  setLoading(false);
  return undefined;
}

listenGenRef.current += 1;
const listenReason =
  listenGenRef.current === 1 ? "page_load" : "date_change";

const startTs = Timestamp.fromDate(start);
const endTs = Timestamp.fromDate(endExclusive);


const masterStore = createIncrementalDocStore({
  mapDoc: mapMasterDoc,
  compare: compareByTimePrinted,
  label: "master_register",
});

const masterQuery = query(
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

    setLoading(false);
  },
  (err) => {
    console.error(
      "[useMasterRegisterSnapshots] master_register query failed:",
      err
    );

    setLoading(false);
  }
);

return () => {
  masterStore.clear();
  unsubMaster();
};


}, [dateFrom, dateTo, mapMasterDoc]);

  return {
    masterEntries,
    setMasterEntries,
    loading,
    setLoading,
  };
}