import { useCallback, useRef } from "react";

/**
 * Stable function identity; always invokes the latest `fn`.
 * Use for memoized row callbacks without stale closures.
 */
export function useStableCallback(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args) => ref.current(...args), []);
}
