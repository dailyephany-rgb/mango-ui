/**
 * Compute / stamp expireAt for eng_* docs (ops retention without Admin SDK).
 * Rules allow delete only when request.time > expireAt.
 */

import { Timestamp } from "firebase/firestore";
import {
  ENG_AGG_RETENTION_DAYS,
  ENG_SAMPLE_RETENTION_DAYS,
  ENG_ERROR_RETENTION_DAYS,
} from "../constants.js";
import { getRuntimeSettings } from "./runtimeSettings.js";

const DAY_MS = 86_400_000;

/**
 * @param {number} [days]
 * @param {number} [fromMs]
 * @returns {import('firebase/firestore').Timestamp}
 */
export function expireAtFromDays(days, fromMs = Date.now()) {
  const d = typeof days === "number" && days > 0 ? days : ENG_AGG_RETENTION_DAYS;
  return Timestamp.fromMillis(fromMs + d * DAY_MS);
}

/**
 * Retention days for a collection name.
 * @param {string} collectionName
 */
export function retentionDaysForCollection(collectionName) {
  const settings = getRuntimeSettings();
  const agg = settings.retentionDays ?? ENG_AGG_RETENTION_DAYS;
  const sample = settings.sampleRetentionDays ?? ENG_SAMPLE_RETENTION_DAYS;
  const err = settings.errorRetentionDays ?? ENG_ERROR_RETENTION_DAYS;
  const sampleCols = new Set([
    "eng_page_loads",
    "eng_components",
    "eng_fs_component_loads",
    "eng_heartbeat_hourly",
    "eng_heartbeats",
  ]);
  if (collectionName === "eng_errors" || collectionName === "eng_alerts") {
    return err;
  }
  if (sampleCols.has(collectionName)) return Math.min(sample, agg);
  if (collectionName === "eng_health") return 365;
  if (collectionName === "eng_audit") return Math.min(90, agg);
  return agg;
}

/**
 * @param {string} collectionName
 * @param {number} [fromMs]
 */
export function expireAtForCollection(collectionName, fromMs = Date.now()) {
  return expireAtFromDays(retentionDaysForCollection(collectionName), fromMs);
}
