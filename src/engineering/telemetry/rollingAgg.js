/**
 * Rolling daily aggregate helpers (observer-only).
 * Device-keyed eng docs → safe read-modify-write for min/max/percentiles.
 * Counters still use FieldValue.increment for concurrent-safe sums.
 */

import { doc, getDoc, setDoc, increment, serverTimestamp } from "firebase/firestore";
import { SCHEMA_VERSION, TELEMETRY_VERSION, compactMeta } from "./metadata.js";
import { expireAtForCollection } from "./expireAt.js";

const SAMPLE_CAP = 96;

/**
 * @param {number[]} values
 * @param {number} p 0..1
 */
export function percentile(values, p) {
  if (!values?.length) return null;
  const s = [...values].filter((n) => typeof n === "number" && Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return null;
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil(p * (s.length - 1))));
  return s[idx];
}

/**
 * Cap sample array for percentile estimates (evenly spaced downsample).
 * @param {number[]} prev
 * @param {number[]} next
 * @param {number} [cap]
 */
export function mergeDurationSamples(prev, next, cap = SAMPLE_CAP) {
  const merged = [...(Array.isArray(prev) ? prev : []), ...(Array.isArray(next) ? next : [])].filter(
    (n) => typeof n === "number" && Number.isFinite(n)
  );
  if (merged.length <= cap) return merged;
  const out = [];
  const step = merged.length / cap;
  for (let i = 0; i < cap; i++) {
    out.push(merged[Math.min(merged.length - 1, Math.floor(i * step))]);
  }
  return out;
}

/**
 * Write a rolling daily aggregate document.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} collectionName
 * @param {string} docId
 * @param {{
 *   meta?: Record<string, any>,
 *   increments?: Record<string, number>,
 *   durations?: number[],
 *   absolute?: Record<string, any>,
 *   earliestTs?: number | null,
 *   latestTs?: number | null,
 *   avgFrom?: { sumField: string, countField: string, outField: string, batchSum: number, batchCount: number },
 *   legacyMaxField?: string,
 *   legacyMinField?: string,
 * }} opts
 */
export async function writeRollingDailyDoc(db, collectionName, docId, opts = {}) {
  const ref = doc(db, collectionName, docId);
  let prev = {};
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) prev = snap.data() || {};
  } catch {
    prev = {};
  }

  const durations = (opts.durations || []).filter(
    (n) => typeof n === "number" && Number.isFinite(n)
  );
  const samples = mergeDurationSamples(prev.durationSamples, durations);
  const batchMax = durations.length ? Math.max(...durations) : null;
  const batchMin = durations.length ? Math.min(...durations) : null;
  const prevMax =
    typeof prev.durationMaxMs === "number" ? prev.durationMaxMs : null;
  const prevMin =
    typeof prev.durationMinMs === "number" ? prev.durationMinMs : null;

  /** @type {Record<string, any>} */
  const payload = {
    ...compactMeta(opts.meta || {}),
    schemaVersion: SCHEMA_VERSION,
    telemetryVersion: TELEMETRY_VERSION,
    updatedAt: serverTimestamp(),
    expireAt: expireAtForCollection(collectionName),
  };

  for (const [k, v] of Object.entries(opts.increments || {})) {
    if (typeof v === "number" && v !== 0) payload[k] = increment(v);
  }

  if (opts.absolute) {
    Object.assign(payload, compactMeta(opts.absolute));
  }

  if (batchMax != null) {
    payload.durationMaxMs =
      prevMax == null ? batchMax : Math.max(prevMax, batchMax);
    if (opts.legacyMaxField) payload[opts.legacyMaxField] = payload.durationMaxMs;
  }
  if (batchMin != null) {
    payload.durationMinMs =
      prevMin == null ? batchMin : Math.min(prevMin, batchMin);
    if (opts.legacyMinField) payload[opts.legacyMinField] = payload.durationMinMs;
  }

  if (samples.length) {
    payload.durationSamples = samples;
    payload.p50Ms = percentile(samples, 0.5);
    payload.p90Ms = percentile(samples, 0.9);
    payload.p95Ms = percentile(samples, 0.95);
    payload.p99Ms = percentile(samples, 0.99);
    // Back-compat aliases used by existing dashboard
    payload.p95QueryMs = payload.p95Ms;
  }

  if (opts.avgFrom) {
    const {
      sumField,
      countField,
      outField,
      batchSum,
      batchCount,
    } = opts.avgFrom;
    const prevSum = Number(prev[sumField]) || 0;
    const prevCount = Number(prev[countField]) || 0;
    const newSum = prevSum + (batchSum || 0);
    const newCount = prevCount + (batchCount || 0);
    payload[outField] = newCount ? newSum / newCount : null;
  }

  const earliest =
    opts.earliestTs != null
      ? Math.min(
          typeof prev.earliestTs === "number" ? prev.earliestTs : opts.earliestTs,
          opts.earliestTs
        )
      : prev.earliestTs ?? null;
  const latest =
    opts.latestTs != null
      ? Math.max(
          typeof prev.latestTs === "number" ? prev.latestTs : opts.latestTs,
          opts.latestTs
        )
      : prev.latestTs ?? null;
  if (earliest != null) payload.earliestTs = earliest;
  if (latest != null) payload.latestTs = latest;

  await setDoc(ref, payload, { merge: true });
}
