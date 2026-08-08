/**
 * Best-effort retention cleanup for Engineering Firestore (client-side ops job).
 * Does not touch clinical Firebase.
 *
 * Security model (after eng rules merge):
 * - Fresh eng_* docs cannot be deleted (wipe protection).
 * - Deletes are allowed only when expireAt is in the past.
 * - For legacy docs without expireAt, we stamp expireAt to the past (update),
 *   then delete — rules allow delete once expireAt is past.
 */

import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  setDoc,
  query,
  limit,
  Timestamp,
} from "firebase/firestore";
import { getEngDb, isEngDbSafe } from "../firebaseEngConfig.js";
import {
  ENG_COLLECTIONS,
  ENG_AGG_RETENTION_DAYS,
  ENG_SAMPLE_RETENTION_DAYS,
  ENG_ERROR_RETENTION_DAYS,
  ENG_SCHEMA_VERSION,
  ENG_TELEMETRY_VERSION,
} from "../constants.js";
import { getRuntimeSettings } from "./runtimeSettings.js";
import { safeRun } from "./safeRun.js";
import { retentionDaysForCollection } from "./expireAt.js";

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

function expireAtMs(data) {
  const e = data?.expireAt;
  if (!e) return null;
  if (typeof e.toMillis === "function") return e.toMillis();
  if (typeof e.seconds === "number") return e.seconds * 1000;
  if (typeof e === "number") return e;
  return null;
}

/**
 * @param {{ maxDeletes?: number }} [opts]
 * @returns {Promise<{ deleted: number, scanned: number, stamped: number, denied: number }>}
 */
export async function runEngRetention(opts = {}) {
  const result = { deleted: 0, scanned: 0, stamped: 0, denied: 0 };
  const db = getEngDb();
  if (!db || !isEngDbSafe(db)) return result;

  const settings = getRuntimeSettings();
  const retention = settings.retentionDays ?? ENG_AGG_RETENTION_DAYS;
  const sampleRetention =
    settings.sampleRetentionDays ?? ENG_SAMPLE_RETENTION_DAYS;
  const errRetention = settings.errorRetentionDays ?? ENG_ERROR_RETENTION_DAYS;
  const maxDeletes = opts.maxDeletes ?? 200;

  const targets = [
    { col: ENG_COLLECTIONS.firestoreMetrics, days: retention },
    { col: ENG_COLLECTIONS.listenerDaily, days: retention },
    { col: ENG_COLLECTIONS.pages, days: retention },
    { col: ENG_COLLECTIONS.pageLoads, days: Math.min(sampleRetention, retention) },
    { col: ENG_COLLECTIONS.components, days: Math.min(sampleRetention, retention) },
    { col: ENG_COLLECTIONS.firestoreByComponent, days: retention },
    {
      col: ENG_COLLECTIONS.fsComponentLoads,
      days: Math.min(sampleRetention, retention),
    },
    { col: ENG_COLLECTIONS.departmentsDaily, days: retention },
    { col: ENG_COLLECTIONS.network, days: retention },
    { col: ENG_COLLECTIONS.memory, days: retention },
    { col: ENG_COLLECTIONS.reactDaily, days: retention },
    {
      col: ENG_COLLECTIONS.heartbeatHourly,
      days: Math.min(sampleRetention, retention),
    },
    {
      col: ENG_COLLECTIONS.heartbeats,
      days: Math.min(sampleRetention, retention),
    },
    { col: ENG_COLLECTIONS.errors, days: errRetention },
    { col: ENG_COLLECTIONS.health, days: 365 },
    { col: ENG_COLLECTIONS.alerts, days: Math.min(60, retention) },
    { col: ENG_COLLECTIONS.audit, days: Math.min(90, retention) },
  ];

  const now = Date.now();

  for (const t of targets) {
    if (result.deleted >= maxDeletes) break;
    try {
      const snap = await getDocs(query(collection(db, t.col), limit(400)));
      for (const d of snap.docs) {
        result.scanned += 1;
        if (result.deleted >= maxDeletes) break;
        const data = d.data() || {};
        const day = dayFromDoc(data) || (data.hour || "").slice(0, 10);
        if (!isOlderThan(day, t.days)) continue;

        const ref = doc(db, t.col, d.id);
        const exp = expireAtMs(data);
        try {
          if (exp == null || exp > now) {
            // Stamp past expireAt so rules allow delete (ops retention path).
            await setDoc(
              ref,
              {
                expireAt: Timestamp.fromMillis(now - 1000),
                schemaVersion: data.schemaVersion ?? ENG_SCHEMA_VERSION,
                telemetryVersion: data.telemetryVersion ?? ENG_TELEMETRY_VERSION,
                deviceId: data.deviceId || "retention",
              },
              { merge: true }
            );
            result.stamped += 1;
          }
          await deleteDoc(ref);
          result.deleted += 1;
        } catch {
          result.denied += 1;
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

export { retentionDaysForCollection };
