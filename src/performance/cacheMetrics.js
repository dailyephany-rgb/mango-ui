/**
 * Cache effectiveness aggregations from recorded cache events.
 */

export function summarizeCache(cacheEvents) {
  const events = cacheEvents || [];
  let hits = 0;
  let misses = 0;
  let expires = 0;
  let sets = 0;
  let lifetimeSum = 0;
  let lifetimeN = 0;
  let paintSum = 0;
  let paintN = 0;
  let refreshSum = 0;
  let refreshN = 0;

  for (const e of events) {
    if (e.type === "hit") hits += 1;
    else if (e.type === "miss") misses += 1;
    else if (e.type === "expire") expires += 1;
    else if (e.type === "set") sets += 1;
    else if (e.type === "owner_paint") {
      paintSum += e.durationMs || 0;
      paintN += 1;
    } else if (e.type === "owner_refresh") {
      refreshSum += e.durationMs || 0;
      refreshN += 1;
    }
    if (typeof e.lifetimeMs === "number") {
      lifetimeSum += e.lifetimeMs;
      lifetimeN += 1;
    }
  }

  const total = hits + misses;
  const hitRate = total ? (hits / total) * 100 : 0;
  const missRate = total ? (misses / total) * 100 : 0;
  const avgPaint = paintN ? paintSum / paintN : 0;
  const avgRefresh = refreshN ? refreshSum / refreshN : 0;
  const improvement =
    avgPaint > 0 && avgRefresh > 0 ? Math.max(0, avgRefresh - avgPaint) : 0;

  return {
    hits,
    misses,
    expires,
    sets,
    hitRate,
    missRate,
    avgLifetimeMs: lifetimeN ? lifetimeSum / lifetimeN : 0,
    avgOwnerPaintMs: avgPaint,
    avgOwnerRefreshMs: avgRefresh,
    avgResponseImprovementMs: improvement,
  };
}
