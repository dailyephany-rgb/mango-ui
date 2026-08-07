/**
 * Claim the next friendly workstation label (ipad-1, mac-2, …) from Eng Firestore.
 * Observer-only — never touches clinical Firebase.
 */

import {
  doc,
  getDoc,
  setDoc,
  runTransaction,
  collection,
  getDocs,
  limit,
  query,
} from "firebase/firestore";
import { getEngDb } from "../firebaseEngConfig.js";
import { ENG_COLLECTIONS } from "../constants.js";
import { normalizeDeviceLabel } from "./deviceId.js";

const COUNTER_DOC = "device_label_counters";

/**
 * @param {string} prefix
 * @returns {Promise<string | null>}
 */
export async function claimNextDeviceLabel(prefix) {
  const kind = normalizeDeviceLabel(prefix) || "desktop";
  const db = getEngDb();
  if (!db) return null;

  // Scan outside the transaction (Firestore txs cannot do collection queries).
  let floor = 0;
  try {
    floor = await scanMaxLabelNumber(db, kind);
  } catch {
    floor = 0;
  }

  try {
    const counterRef = doc(db, ENG_COLLECTIONS.settings, COUNTER_DOC);
    const n = await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const data = snap.exists() ? snap.data() || {} : {};
      let current = Number(data[kind] || 0);
      if (!Number.isFinite(current) || current < 0) current = 0;
      if (floor > current) current = floor;
      const next = current + 1;
      tx.set(
        counterRef,
        {
          [kind]: next,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
      return next;
    });
    return `${kind}-${n}`;
  } catch {
    try {
      const next = floor + 1;
      await setDoc(
        doc(db, ENG_COLLECTIONS.settings, COUNTER_DOC),
        { [kind]: next, updatedAt: Date.now() },
        { merge: true }
      );
      return `${kind}-${next}`;
    } catch {
      return null;
    }
  }
}

/**
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} kind
 */
async function scanMaxLabelNumber(db, kind) {
  let max = 0;
  const re = new RegExp(`^${kind}-(\\d+)$`, "i");
  const consider = (label) => {
    const m = String(label || "")
      .toLowerCase()
      .match(re);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  };

  try {
    const statusSnap = await getDocs(
      query(collection(db, ENG_COLLECTIONS.deviceStatus), limit(300))
    );
    statusSnap.forEach((d) => consider(d.data()?.label));
  } catch {
    /* ignore */
  }

  try {
    const devSnap = await getDocs(
      query(collection(db, ENG_COLLECTIONS.devices), limit(300))
    );
    devSnap.forEach((d) => consider(d.data()?.label));
  } catch {
    /* ignore */
  }

  try {
    const counterSnap = await getDoc(
      doc(db, ENG_COLLECTIONS.settings, COUNTER_DOC)
    );
    if (counterSnap.exists()) {
      const n = Number(counterSnap.data()?.[kind] || 0);
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  } catch {
    /* ignore */
  }

  return max;
}
