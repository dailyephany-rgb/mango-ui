/**
 * Best-effort retention cleanup for Engineering Firestore (client-side admin job).
 * Does not touch clinical Firebase.
 */

import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  query,
  limit,
} from "firebase/firestore";
import { getEngDb } from "../firebaseEngConfig.js";
import { ENG_COLLECTIONS } from "../constants.js";
import { getRuntimeSettings } from "./runtimeSettings.js";
import { safeRun } from "./safeRun.js";

const DAY_MS = 86_400_000;

function dayFromDoc(d) {
  if (d.day) return d.day;
  if (d.ts) {
    const t = new Date(d.ts);
    if (!Number.isNaN(t.getTime())) {
      return t.toISOString().slice(0, 10);
    }
  }
  return null;
}

function isOlderThan(dayStr, retentionDays) {
  if (!dayStr || !/^\d{4}-\d{2}-\d{2}/.test(dayStr)) return false;
  const t = Date.parse(dayStr.slice(0, 10));
  if (Number.isNaN(t)) return false;
  return Date.now() - t > retentionDays * DAY_MS;
}

/**
 * Delete old daily aggregate docs. Caps work per call.
 * @param {{ maxDeletes?: number }} [opts]
 * @returns {Promise<{ deleted: number, scanned: number }>}
 */
export async function runEngRetention(opts = {}) {
  const result = { deleted: 0, scanned: 0 };
  const db = getEngDb();
  if (!db) return result;

  const settings = getRuntimeSettings();
  const retention = settings.retentionDays ?? 90;
  const errRetention = settings.errorRetentionDays ?? 60;
  const maxDeletes = opts.maxDeletes ?? 200;

  const targets = [
    { col: ENG_COLLECTIONS.firestoreMetrics, days: retention },
    { col: ENG_COLLECTIONS.listenerDaily, days: retention },
    { col: ENG_COLLECTIONS.pages, days: retention },
    { col: ENG_COLLECTIONS.pageLoads, days: Math.min(14, retention) },
    { col: ENG_COLLECTIONS.network, days: retention },
    { col: ENG_COLLECTIONS.memory, days: retention },
    { col: ENG_COLLECTIONS.reactDaily, days: retention },
    { col: ENG_COLLECTIONS.heartbeatHourly, days: Math.min(14, retention) },
    { col: ENG_COLLECTIONS.heartbeats, days: Math.min(14, retention) },
    { col: ENG_COLLECTIONS.errors, days: errRetention },
    { col: ENG_COLLECTIONS.health, days: 365 },
  ];

  for (const t of targets) {
    if (result.deleted >= maxDeletes) break;
    try {
      const snap = await getDocs(query(collection(db, t.col), limit(400)));
      for (const d of snap.docs) {
        result.scanned += 1;
        if (result.deleted >= maxDeletes) break;
        const data = d.data() || {};
        const day = dayFromDoc(data) || (data.hour || "").slice(0, 10);
        if (isOlderThan(day, t.days)) {
          await deleteDoc(doc(db, t.col, d.id));
          result.deleted += 1;
        }
      }
    } catch {
      /* continue */
    }
  }
  return result;
}

/**
 * Fire-and-forget retention.
 */
export function scheduleEngRetention() {
  safeRun(() => {
    void runEngRetention().catch(() => {});
  }, "eng.retention");
}
