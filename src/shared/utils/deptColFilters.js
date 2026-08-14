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
  machine: "",
  lab: "",
  doctor: "",
  person: "",
  relation: "",
  mobile: "",
  collectedBy: "",
  receivedBy: "",
  deliveredBy: "",
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
  if (Array.isArray(patient?.displayTests) && patient.displayTests.length) {
    return patient.displayTests
      .map((t) => (typeof t === "string" ? t : t?.test || ""))
      .join(" ");
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
 * @param {{
 *   getAge?: (p: object) => string,
 *   getTests?: (p: object) => string,
 *   getDiag?: (p: object) => string,
 *   getSavedBy?: (p: object) => string,
 * }} [options]
 */
export function matchesDeptColFilters(patient, colFilters, options = {}) {
  const getAge = options.getAge || defaultAgeHaystack;
  const getTests = options.getTests || defaultTestsHaystack;
  const getDiag =
    options.getDiag ||
    ((p) => p.diagnosticNo || p.accessionNo || p.accNo || "");
  const getSavedBy = options.getSavedBy || ((p) => p.savedBy);

  if (!includesColFilter(patient.regNo, colFilters.regNo)) return false;
  if (!includesColFilter(getDiag(patient), colFilters.diagnosticNo))
    return false;
  if (!includesColFilter(patient.name, colFilters.name)) return false;
  if (!includesColFilter(getAge(patient), colFilters.age)) return false;
  if (!includesColFilter(patient.gender || patient.sex, colFilters.gender))
    return false;
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

  if (String(colFilters.machine || "").trim()) {
    if (String(patient.machine || "") !== String(colFilters.machine)) {
      return false;
    }
  }

  if (
    !includesColFilter(patient.labName || patient.lab, colFilters.lab)
  ) {
    return false;
  }
  if (
    !includesColFilter(
      patient.doctor || patient.doctorName,
      colFilters.doctor
    )
  ) {
    return false;
  }
  if (!includesColFilter(patient.concernedPerson, colFilters.person))
    return false;
  if (!includesColFilter(patient.relation, colFilters.relation)) return false;
  if (!includesColFilter(patient.mobileNo || patient.mobile, colFilters.mobile))
    return false;
  if (!includesColFilter(patient.collectedBy, colFilters.collectedBy))
    return false;
  if (!includesColFilter(patient.receivedBy, colFilters.receivedBy))
    return false;
  if (!includesColFilter(patient.deliveredBy, colFilters.deliveredBy))
    return false;

  if (!includesColFilter(getSavedBy(patient), colFilters.savedBy)) return false;
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
