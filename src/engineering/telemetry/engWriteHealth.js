/**
 * Track Engineering Firestore write health (quota / permission failures).
 * Observer-only — never throws to callers.
 */

/** @type {{ code: string, message: string, at: number } | null} */
let lastError = null;
/** @type {number} */
let lastOkAt = 0;
/** @type {number} */
let backoffUntil = 0;

/**
 * @param {unknown} err
 */
export function noteEngWriteError(err) {
  try {
    const code = String(err?.code || err?.name || "write-failed");
    const message = String(err?.message || err || "write failed").slice(0, 300);
    lastError = { code, message, at: Date.now() };
    // Back off heartbeats/flushes when quota is exhausted (free-tier daily cap).
    if (/resource-exhausted|quota/i.test(code) || /resource-exhausted|quota/i.test(message)) {
      backoffUntil = Date.now() + 15 * 60_000;
    }
  } catch {
    /* ignore */
  }
}

export function noteEngWriteOk() {
  lastOkAt = Date.now();
  lastError = null;
  backoffUntil = 0;
}

/** @returns {boolean} */
export function shouldSkipEngWrite() {
  return Date.now() < backoffUntil;
}

/**
 * @returns {{
 *   ok: boolean,
 *   quotaExceeded: boolean,
 *   lastError: { code: string, message: string, at: number } | null,
 *   lastOkAt: number,
 *   backoffUntil: number,
 * }}
 */
export function getEngWriteHealth() {
  const quotaExceeded = !!(
    lastError &&
    (/resource-exhausted|quota/i.test(lastError.code) ||
      /resource-exhausted|quota/i.test(lastError.message))
  );
  return {
    ok: !lastError || (lastOkAt > 0 && lastOkAt >= (lastError?.at || 0)),
    quotaExceeded,
    lastError,
    lastOkAt,
    backoffUntil,
  };
}
