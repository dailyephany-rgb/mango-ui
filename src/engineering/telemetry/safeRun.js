/**
 * Never throw into clinical callers.
 * @param {() => void} fn
 * @param {string} [label]
 */
export function safeRun(fn, label = "eng") {
  try {
    fn();
  } catch (err) {
    try {
      if (typeof console !== "undefined" && console.debug) {
        console.debug(`[${label}]`, err?.message || err);
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * @template T
 * @param {() => T} fn
 * @param {T} fallback
 * @returns {T}
 */
export function safeCall(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
