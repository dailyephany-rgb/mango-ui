/**
 * Once-per-session static config cache (Firestore config docs only).
 * Uses sessionQueryCache; no business logic.
 */
import { getCache, setCache, removeCache } from "./sessionQueryCache.js";

/** Long TTL — effectively session-scoped for typical LIMS shifts. */
export const STATIC_CONFIG_TTL_MS = 4 * 60 * 60 * 1000;

/**
 * @param {string} key
 * @returns {any|null}
 */
export function getStaticConfig(key) {
  return getCache(`static:${key}`);
}

/**
 * @param {string} key
 * @param {any} value
 */
export function setStaticConfig(key, value) {
  setCache(`static:${key}`, value, STATIC_CONFIG_TTL_MS);
}

/** @param {string} key */
export function removeStaticConfig(key) {
  removeCache(`static:${key}`);
}
