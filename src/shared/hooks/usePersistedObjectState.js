import { useState, useEffect, useCallback } from "react";
import { safeStorageSet } from "../../engineering/telemetry/safeStorage.js";

/**
 * Object state persisted to localStorage under an exact key.
 * Keys must stay identical to existing department draft keys.
 * Quota failures must not throw into clinical execution.
 */
export function usePersistedObjectState(storageKey, initialValue = {}) {
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    safeStorageSet(localStorage, storageKey, JSON.stringify(state));
  }, [storageKey, state]);

  const setAndPersist = useCallback((updater) => {
    setState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next;
    });
  }, []);

  return [state, setAndPersist];
}
