/**
 * Shared register list filter + urgent/date sort (pure).
 * Keeps filter work out of render hot paths when memoized by callers.
 */

import { parseEntryDate, toLocalDateString } from "../utils/dates.js";

/**
 * @param {object[]} patients
 * @param {{ regSearch?: string, sourceFilter?: string, dateFrom?: string, dateTo?: string, getDiag?: (p: object) => string }} filters
 */
export function filterAndSortRegisterPatients(patients, filters = {}) {
  const {
    regSearch = "",
    sourceFilter = "All",
    dateFrom = "",
    dateTo = "",
    getDiag = (p) => p.diagnosticNo || p.accessionNo || "",
  } = filters;
  const searchStr = regSearch.trim().toLowerCase();

  const filtered = (patients || []).filter((p) => {
    if (searchStr) {
      const key = String(p.regNo || "").toLowerCase();
      const diag = String(getDiag(p) || "").toLowerCase();
      if (!key.includes(searchStr) && !diag.includes(searchStr)) return false;
    }
    if (sourceFilter !== "All" && p.source !== sourceFilter) return false;
    const eDate = parseEntryDate(p);
    if (eDate) {
      const entryDateStr = toLocalDateString(eDate);
      if (dateFrom && entryDateStr < dateFrom) return false;
      if (dateTo && entryDateStr > dateTo) return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    const dateA = parseEntryDate(a);
    const dateB = parseEntryDate(b);
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateA - dateB;
  });
}
