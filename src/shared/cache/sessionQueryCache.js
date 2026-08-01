/**
 * Session query cache — sessionStorage + TTL.
 * Isolated helper; no business logic.
 */

const PREFIX = "mango.sqc.v1:";

function emitCache(partial) {
  try {
    import("../../performance/performanceCollector.js")
      .then((m) => m.recordCacheEvent?.(partial))
      .catch(() => {});
  } catch {
    /* ignore */
  }
}

function storageKey(key) {
  return `${PREFIX}${key}`;
}

function now() {
  return Date.now();
}

/** Remove expired entries (best-effort sweep). */
export function clearExpired() {
  if (typeof sessionStorage === "undefined") return;
  const keys = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k && k.startsWith(PREFIX)) keys.push(k);
  }
  const t = now();
  for (const k of keys) {
    try {
      const raw = sessionStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.expiresAt !== "number" || parsed.expiresAt <= t) {
        sessionStorage.removeItem(k);
      }
    } catch {
      sessionStorage.removeItem(k);
    }
  }
}

/**
 * @param {string} key
 * @returns {any|null} cached value or null if missing/expired
 */
export function getCache(key) {
  if (typeof sessionStorage === "undefined" || !key) return null;
  try {
    const raw = sessionStorage.getItem(storageKey(key));
    if (!raw) {
      emitCache({ type: "miss", key, layer: "session" });
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.expiresAt !== "number") {
      sessionStorage.removeItem(storageKey(key));
      emitCache({ type: "miss", key, layer: "session" });
      return null;
    }
    if (parsed.expiresAt <= now()) {
      sessionStorage.removeItem(storageKey(key));
      emitCache({
        type: "expire",
        key,
        layer: "session",
        lifetimeMs: Math.max(0, parsed.expiresAt - (now() - 60_000)),
      });
      emitCache({ type: "miss", key, layer: "session" });
      return null;
    }
    emitCache({
      type: "hit",
      key,
      layer: "session",
      lifetimeMs: Math.max(0, parsed.expiresAt - now()),
    });
    return reviveTimestamps(parsed.value);
  } catch {
    try {
      sessionStorage.removeItem(storageKey(key));
    } catch {
      /* ignore */
    }
    emitCache({ type: "miss", key, layer: "session" });
    return null;
  }
}

/**
 * @param {string} key
 * @param {any} value — must be JSON-serializable
 * @param {number} ttlMs — time to live in milliseconds
 */
export function setCache(key, value, ttlMs) {
  if (typeof sessionStorage === "undefined" || !key) return;
  const ttl = typeof ttlMs === "number" && ttlMs > 0 ? ttlMs : 60_000;
  try {
    const payload = {
      expiresAt: now() + ttl,
      value,
    };
    sessionStorage.setItem(storageKey(key), JSON.stringify(payload));
    emitCache({ type: "set", key, layer: "session", ttlMs: ttl });
  } catch (err) {
    // Quota or circular structure — fail soft
    console.warn("[sessionQueryCache] setCache failed:", err?.message || err);
  }
}

/** @param {string} key */
export function removeCache(key) {
  if (typeof sessionStorage === "undefined" || !key) return;
  try {
    sessionStorage.removeItem(storageKey(key));
  } catch {
    /* ignore */
  }
}

/**
 * Revive Firestore Timestamp shapes after JSON.parse
 * so callers can still use .toDate().
 */
function reviveTimestamps(input) {
  if (input == null || typeof input !== "object") return input;

  if (Array.isArray(input)) {
    return input.map(reviveTimestamps);
  }

  const seconds =
    typeof input.seconds === "number"
      ? input.seconds
      : typeof input._seconds === "number"
        ? input._seconds
        : null;
  const nanoseconds =
    typeof input.nanoseconds === "number"
      ? input.nanoseconds
      : typeof input._nanoseconds === "number"
        ? input._nanoseconds
        : 0;

  if (
    seconds != null &&
    Object.keys(input).every((k) =>
      ["seconds", "nanoseconds", "_seconds", "_nanoseconds", "type"].includes(k)
    )
  ) {
    return {
      seconds,
      nanoseconds,
      toDate() {
        return new Date(seconds * 1000 + nanoseconds / 1e6);
      },
    };
  }

  const out = {};
  for (const k of Object.keys(input)) {
    out[k] = reviveTimestamps(input[k]);
  }
  return out;
}

/** Default TTL for Owner / analytics session paint (ms). */
export const SESSION_QUERY_TTL_MS = 60_000;

/** Build a stable owner cache key. */
export function ownerCacheKey(dept, dateRange, source) {
  return `owner:${dept}:${dateRange?.from || ""}:${dateRange?.to || ""}:${source || "All"}`;
}
