import { useState } from "react";
import { getLocalDateString } from "../utils/dates.js";

/**
 * Shared register filter state.
 * Preserves existing defaults: empty search, source "All", today for date range.
 * Dates initialize synchronously so master_register queries can scope on first paint.
 * Date setters ignore "" so controlled type="date" inputs never get stuck empty.
 */
export function useRegisterFilters() {
  const today = getLocalDateString();
  const [regSearch, setRegSearch] = useState("");
  const [dateFrom, setDateFromState] = useState(today);
  const [dateTo, setDateToState] = useState(today);
  const [sourceFilter, setSourceFilter] = useState("All");

  const setDateFrom = (v) => {
    if (typeof v === "string" && v.trim()) setDateFromState(v.trim());
  };
  const setDateTo = (v) => {
    if (typeof v === "string" && v.trim()) setDateToState(v.trim());
  };

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
