import { useState, useEffect, useCallback } from "react";

/**
 * Object state persisted to localStorage under an exact key.
 * Keys must stay identical to existing department draft keys.
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
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (err) {
      console.error(`Failed to persist ${storageKey}:`, err);
    }
  }, [storageKey, state]);

  const setAndPersist = useCallback((updater) => {
    setState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next;
    });
  }, []);

  return [state, setAndPersist];
}
