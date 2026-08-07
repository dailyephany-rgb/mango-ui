/**
 * Health score helpers for Engineering Dashboard (EDS).
 * Pure functions — no clinical imports.
 */

import { DEVICE_ONLINE_MS, DEVICE_STALE_MS } from "../constants.js";

/**
 * @param {number | null | undefined} clientTs
 * @param {number} [now]
 * @returns {"online"|"stale"|"offline"}
 */
export function devicePresence(clientTs, now = Date.now()) {
  if (clientTs == null || !Number.isFinite(clientTs)) return "offline";
  const age = now - clientTs;
  if (age <= DEVICE_ONLINE_MS) return "online";
  if (age <= DEVICE_STALE_MS) return "stale";
  return "offline";
}

/**
 * Composite health 0–100 from daily aggregates.
 * @param {{
 *   errorCount?: number,
 *   slowQueryCount?: number,
 *   queryCount?: number,
 *   offlineEvents?: number,
 *   memoryPressure?: boolean,
 *   devicesOnline?: number,
 *   devicesTotal?: number,
 * }} s
 * @returns {{ score: number, grade: string, factors: object }}
 */
export function computeHealthScore(s = {}) {
  let score = 100;
  const factors = {};

  const errors = s.errorCount || 0;
  if (errors > 0) {
    const penalty = Math.min(40, errors * 2);
    score -= penalty;
    factors.errors = -penalty;
  }

  const q = s.queryCount || 0;
  const slow = s.slowQueryCount || 0;
  if (q > 0 && slow > 0) {
    const ratio = slow / q;
    const penalty = Math.min(25, Math.round(ratio * 100));
    score -= penalty;
    factors.slowQueries = -penalty;
  }

  if ((s.offlineEvents || 0) > 0) {
    const penalty = Math.min(15, s.offlineEvents * 3);
    score -= penalty;
    factors.network = -penalty;
  }

  if (s.memoryPressure) {
    score -= 10;
    factors.memory = -10;
  }

  const total = s.devicesTotal || 0;
  const online = s.devicesOnline || 0;
  if (total > 0 && online / total < 0.5) {
    score -= 15;
    factors.fleet = -15;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  let grade = "A";
  if (score < 90) grade = "B";
  if (score < 75) grade = "C";
  if (score < 60) grade = "D";
  if (score < 40) grade = "F";
  return { score, grade, factors };
}
