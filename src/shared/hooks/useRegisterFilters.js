import { useState } from "react";
import { getLocalDateString } from "../utils/dates.js";

/**
 * Shared register filter state.
 * Preserves existing defaults: empty search, source "All", today for date range.
 * Dates initialize synchronously so master_register queries can scope on first paint.
 */
export function useRegisterFilters() {
  const today = getLocalDateString();
  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [sourceFilter, setSourceFilter] = useState("All");

  return {
    regSearch,
    setRegSearch,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    sourceFilter,
    setSourceFilter,
  };
}
