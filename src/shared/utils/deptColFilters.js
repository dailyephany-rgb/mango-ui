/** Shared ▼ column-filter helpers for dept register tables. */

export const EMPTY_DEPT_COL_FILTERS = {
  regNo: "",
  diagnosticNo: "",
  name: "",
  age: "",
  gender: "",
  source: "",
  category: "",
  tests: "",
  status: "",
  savedBy: "",
};

export function includesColFilter(value, needle) {
  if (!String(needle || "").trim()) return true;
  return String(value || "")
    .toLowerCase()
    .includes(String(needle).trim().toLowerCase());
}

export function defaultAgeHaystack(patient) {
  return `${patient?.age ?? ""} ${patient?.ageUnit ?? ""}`.trim();
}

export function defaultTestsHaystack(patient) {
  if (patient?.testsDisplay != null && String(patient.testsDisplay).trim()) {
    return String(patient.testsDisplay);
  }
  if (Array.isArray(patient?.relevantTests) && patient.relevantTests.length) {
    return patient.relevantTests.join(" ");
  }
  const list = patient?.selectedTests || [];
  return list
    .map((t) => {
      if (typeof t === "string") return t;
      return `${t?.dept || ""} ${t?.test || ""}`;
    })
    .join(" ");
}

/**
 * @param {object} patient
 * @param {typeof EMPTY_DEPT_COL_FILTERS} colFilters
 * @param {{ getAge?: (p: object) => string, getTests?: (p: object) => string }} [options]
 */
export function matchesDeptColFilters(patient, colFilters, options = {}) {
  const getAge = options.getAge || defaultAgeHaystack;
  const getTests = options.getTests || defaultTestsHaystack;

  if (!includesColFilter(patient.regNo, colFilters.regNo)) return false;
  if (!includesColFilter(patient.diagnosticNo, colFilters.diagnosticNo))
    return false;
  if (!includesColFilter(patient.name, colFilters.name)) return false;
  if (!includesColFilter(getAge(patient), colFilters.age)) return false;
  if (!includesColFilter(patient.gender, colFilters.gender)) return false;
  if (!includesColFilter(patient.source, colFilters.source)) return false;
  if (!includesColFilter(patient.category, colFilters.category)) return false;

  if (String(colFilters.tests || "").trim()) {
    const needle = colFilters.tests.trim().toLowerCase();
    if (!String(getTests(patient) || "").toLowerCase().includes(needle)) {
      return false;
    }
  }

  if (String(colFilters.status || "").trim()) {
    const needle = colFilters.status.trim().toLowerCase();
    if (!String(patient.status || "").toLowerCase().includes(needle)) {
      return false;
    }
  }

  if (!includesColFilter(patient.savedBy, colFilters.savedBy)) return false;
  return true;
}

export function hasActiveDeptColFilters(colFilters) {
  return Object.values(colFilters || {}).some((v) => String(v || "").trim());
}

export function applyDeptColFilters(list, colFilters, options) {
  if (!hasActiveDeptColFilters(colFilters)) return list;
  return (list || []).filter((p) =>
    matchesDeptColFilters(p, colFilters, options)
  );
}
