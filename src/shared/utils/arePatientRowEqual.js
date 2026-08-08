/**
 * Compare memoized register row props: stable callbacks + selected patient fields.
 * Returns true when props are equal (skip re-render).
 */
export function arePatientRowEqual(fieldList) {
  return function patientRowEqual(prev, next) {
    if (prev.isCriticalReported !== next.isCriticalReported) return false;
    if (prev.isPendingCritical !== next.isPendingCritical) return false;
    if (prev.saving !== next.saving) return false;
    if (prev.activeTab !== next.activeTab) return false;

    for (const key of Object.keys(prev)) {
      if (typeof prev[key] === "function") {
        if (prev[key] !== next[key]) return false;
      }
    }

    const a = prev.patient;
    const b = next.patient;
    if (!a || !b) return a === b;
    if (a.compositeKey !== b.compositeKey) return false;

    for (let i = 0; i < fieldList.length; i++) {
      const f = fieldList[i];
      if (a[f] !== b[f]) return false;
    }
    return true;
  };
}

/** Common display/edit fields for dept register rows. */
export const DEPT_REGISTER_ROW_FIELDS = [
  "regNo",
  "diagnosticNo",
  "accessionNo",
  "name",
  "source",
  "age",
  "ageUnit",
  "gender",
  "category",
  "testsDisplay",
  "result",
  "scanned",
  "status",
  "savedBy",
  "urgent",
  "saved",
  "bloodGroup",
  "rhFactor",
  "startTime",
  "endTime",
  "duration",
  "pendingCritText",
  "pendingCriticalParam",
  "bt",
  "ct",
  "pt",
  "inr",
  "aptt",
  "machine",
  "hasHaemogram",
  "hasHb",
  "hasLbc",
  "relevantTestsKey",
];
