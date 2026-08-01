/**
 * Behaviour-preserving session paint for read-heavy subscribeOverview streams.
 * Paints cache immediately (if any), then live snapshot replaces UI + cache.
 */
import {
  getCache,
  setCache,
  ownerCacheKey,
  SESSION_QUERY_TTL_MS,
} from "./sessionQueryCache.js";

/**
 * @param {object} opts
 * @param {string} opts.dept — cache namespace (e.g. "coag", "biochem")
 * @param {object} opts.dateRange
 * @param {string} opts.source
 * @param {(payload: any) => void} opts.onData
 * @returns {{ onDataLive: (payload: any) => void, paintCache: () => void }}
 */
export function createOwnerSessionPaint({ dept, dateRange, source, onData }) {
  const key = ownerCacheKey(dept, dateRange, source);
  const paintStarted = performance.now();
  let painted = false;

  const paintCache = () => {
    const cached = getCache(key);
    if (cached != null && typeof onData === "function") {
      painted = true;
      onData(cached);
      try {
        import("../../performance/performanceCollector.js").then((m) => {
          m.recordOwnerPaint?.(performance.now() - paintStarted, key);
        });
      } catch {
        /* ignore */
      }
    }
  };

  const onDataLive = (payload) => {
    const refreshMs = performance.now() - paintStarted;
    if (payload != null) {
      setCache(key, payload, SESSION_QUERY_TTL_MS);
    }
    if (typeof onData === "function") {
      onData(payload);
    }
    if (painted) {
      try {
        import("../../performance/performanceCollector.js").then((m) => {
          m.recordOwnerRefresh?.(refreshMs, key);
        });
      } catch {
        /* ignore */
      }
    }
  };

  return { key, paintCache, onDataLive };
}
