/**
 * Bounded, never-throw web storage for engineering/perf telemetry.
 * Quota failures must not reach clinical Firestore or UI execution.
 */

function isQuotaError(err) {
  const name = String(err?.name || "");
  const code = err?.code;
  const msg = String(err?.message || "").toLowerCase();
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    code === 22 ||
    code === 1014 ||
    msg.includes("quota")
  );
}

/**
 * @param {Storage} storage
 * @param {string} key
 * @param {string} value
 * @returns {boolean}
 */
export function safeStorageSet(storage, key, value) {
  if (!storage || !key) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch (err) {
    if (!isQuotaError(err)) return false;
    try {
      storage.removeItem(key);
    } catch {
      /* ignore */
    }
    try {
      const str = String(value || "");
      const shrunk = str.length > 256 ? str.slice(0, Math.floor(str.length / 8)) : "";
      if (!shrunk) return false;
      storage.setItem(key, shrunk);
      return true;
    } catch {
      try {
        storage.removeItem(key);
      } catch {
        /* ignore */
      }
      return false;
    }
  }
}

/**
 * Persist a JSON array, shrinking on quota until it fits or is dropped.
 * @param {Storage} storage
 * @param {string} key
 * @param {unknown[]} list
 * @returns {boolean}
 */
export function safeStorageSetJsonArray(storage, key, list) {
  if (!storage || !key) return false;
  let items = Array.isArray(list) ? list.slice() : [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      if (!items.length) {
        storage.removeItem(key);
        return true;
      }
      storage.setItem(key, JSON.stringify(items));
      return true;
    } catch (err) {
      if (!isQuotaError(err)) return false;
      if (items.length <= 1) {
        try {
          storage.removeItem(key);
        } catch {
          /* ignore */
        }
        return false;
      }
      items = items.slice(-Math.max(1, Math.floor(items.length / 2)));
    }
  }
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
  return false;
}
