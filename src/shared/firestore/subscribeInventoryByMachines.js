import {
  collection,
  query,
  where,
} from "firebase/firestore";
import { trackedOnSnapshot as onSnapshot } from "./trackedFirestore.js";
import { createIncrementalDocStore } from "./incrementalDocStore.js";
import { db } from "../../firebaseConfig.js";

/** Live stock statuses used by inventory tabs (excludes Consumed history). */
export const INVENTORY_LIVE_STATUSES = ["Activated", "In Storage"];

/**
 * Canonical machineName values for each inventory surface.
 * Biochem main + Hormones main share VITROS 6500 (client-split by reagent lists).
 */
export const INVENTORY_MACHINES = {
  deptMain: ["VITROS 6500"],
  backupBiochem: ["Yumizen C-150", "MISPA i2", "Mispa i2", "GEM 3500"],
  backupHormones: ["Access 2"],
  haem3: ["3 Part Machine"],
  haem5: ["5 Part Machine"],
  coag: ["Yumizen G800"],
  /** Serology/Rapid/Urine strips are Backroom; urine controls are Urine */
  backroom: ["Backroom", "Urine"],
};

/**
 * Subscribe to inventory_logs for one or more machines, live statuses only.
 * One listener per machineName. Snapshot apply is incremental after seed.
 *
 * @param {string[]} machineNames
 * @param {(rows: object[]) => void} onData
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeInventoryByMachines(
  machineNames,
  onData,
  onError
) {
  const machines = [...new Set((machineNames || []).filter(Boolean))];
  if (machines.length === 0) {
    onData([]);
    return () => {};
  }

  const stores = Object.fromEntries(
    machines.map((m) => [
      m,
      createIncrementalDocStore({
        mapDoc: (d) => ({ ...d.data(), id: String(d.id) }),
        label: `inventory_logs:${m}`,
      }),
    ])
  );

  const publish = () => {
    const merged = [];
    const seen = new Set();
    for (const m of machines) {
      for (const row of stores[m].map.values()) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        merged.push(row);
      }
    }
    onData(merged);
  };

  const unsubs = machines.map((machineName) => {
    const q = query(
      collection(db, "inventory_logs"),
      where("machineName", "==", machineName),
      where("status", "in", INVENTORY_LIVE_STATUSES)
    );
    try {
      q.__mangoCollection = "inventory_logs";
    } catch {
      /* ignore */
    }

    return onSnapshot(
      q,
      (snap) => {
        const result = stores[machineName].apply(snap);
        if (result.changed) publish();
      },
      (err) => {
        console.error(
          `[inventory] machineName=${machineName} status-in query failed — check composite index (machineName + status):`,
          err
        );
        if (onError) onError(err);
        stores[machineName].clear();
        publish();
      }
    );
  });

  return () => {
    machines.forEach((m) => stores[m].clear());
    unsubs.forEach((u) => u());
  };
}
