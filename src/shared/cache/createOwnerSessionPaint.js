/**
 * Behaviour-preserving session paint for read-heavy subscribeOverview streams.
 * Paints cache immediately (if any), then live snapshot replaces UI + cache.
 *
 * N5: onData delivery scheduled via startTransition — KPI payload identical,
 * React paint may defer under load (no Firestore / aggregation changes).
 */
import { startTransition } from "react";
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
  // Mutable so client-side source changes can re-key cache without new listeners.
  let key = ownerCacheKey(dept, dateRange, source);
  const paintStarted = performance.now();
  let painted = false;

  const deliver = (payload) => {
    if (typeof onData !== "function") return;
    startTransition(() => {
      onData(payload);
    });
  };

  const paintCache = () => {
    const cached = getCache(key);
    // #region agent log
    if (dept === "workflow") {
      fetch('http://127.0.0.1:7777/ingest/9a9945a0-51cf-4a66-869a-fb7fed73753f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'30adf1'},body:JSON.stringify({sessionId:'30adf1',runId:'pre-fix',hypothesisId:'H3',location:'createOwnerSessionPaint.js:paintCache',message:'Workflow paintCache check',data:{key,hasCache:cached!=null,cachedRecordCount:cached?.records?.length??null,dateFrom:dateRange?.from||null,dateTo:dateRange?.to||null},timestamp:Date.now()})}).catch(()=>{});
    }
    // #endregion
    if (cached != null && typeof onData === "function") {
      painted = true;
      deliver(cached);
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
    deliver(payload);
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

  const setSourceKey = (nextSource) => {
    key = ownerCacheKey(dept, dateRange, nextSource);
  };

  return { key, paintCache, onDataLive, setSourceKey };
}
