import React, { useEffect, useState } from "react";

/**
 * Keep tab panels mounted after first visit (hide inactive instead of unmount).
 * Speeds tab switches; does not change fetch/save logic.
 */
export function useVisitedTabs(activeTab, initialTab = "overview") {
  const [visited, setVisited] = useState(() => ({
    [initialTab ?? activeTab]: true,
  }));
  useEffect(() => {
    if (!activeTab) return;
    setVisited((v) => (v[activeTab] ? v : { ...v, [activeTab]: true }));
  }, [activeTab]);
  return visited;
}

/** Hide inactive panel without unmounting children. */
export function StickyTabPanel({ active, children }) {
  return (
    <div
      style={{ display: active ? undefined : "none" }}
      aria-hidden={!active || undefined}
    >
      {children}
    </div>
  );
}
