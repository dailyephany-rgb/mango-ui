

import React, { createContext, useMemo, useState } from "react";

export const OwnerContext = createContext();

export function OwnerProvider({ children }) {
  const today = new Date().toISOString().slice(0, 10);

  const [dateRange, setDateRange] = useState({
    from: today,
    to: today
  });

  const [source, setSource] = useState("All");

  const value = useMemo(
    () => ({
      dateRange,
      setDateRange,
      source,
      setSource,
    }),
    [dateRange, source]
  );

  return (
    <OwnerContext.Provider value={value}>
      {children}
    </OwnerContext.Provider>
  );
}