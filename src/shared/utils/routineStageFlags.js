/**
 * Routine workflow stage cascade:
 * Entered ⇒ Validated ⇒ Saved ⇒ Scanned
 * Used for Master Register display and report_details write repair.
 */

/**
 * @param {{ scanned?: boolean|string, saved?: boolean|string, validated?: boolean, entered?: boolean }} raw
 * @returns {{ scanned: "Yes"|"No", saved: "Yes"|"No", validated: boolean, entered: boolean }}
 */
export function cascadeRoutineStages(raw = {}) {
  const entered = !!raw.entered;
  const validated = !!raw.validated || entered;
  const saved =
    raw.saved === true ||
    raw.saved === "Yes" ||
    validated;
  const scanned =
    raw.scanned === true ||
    raw.scanned === "Yes" ||
    saved;

  return {
    scanned: scanned ? "Yes" : "No",
    saved: saved ? "Yes" : "No",
    validated,
    entered,
  };
}

/**
 * Firestore update fields for report_details when a stage is reached.
 * Uses dotted paths so sibling dept keys are preserved.
 *
 * @param {string} dept — e.g. "Haematology"
 * @param {"saved"|"validated"|"entered"} stage
 * @returns {Record<string, true>}
 */
export function reportDetailsStageCascadeFields(dept, stage) {
  if (!dept) return {};

  if (stage === "entered") {
    return {
      [`routineReportsScanned.${dept}`]: true,
      [`routineReportsSaved.${dept}`]: true,
      [`routineReportsValidated.${dept}`]: true,
      [`routineReportsEntered.${dept}`]: true,
    };
  }

  if (stage === "validated") {
    return {
      [`routineReportsScanned.${dept}`]: true,
      [`routineReportsSaved.${dept}`]: true,
      [`routineReportsValidated.${dept}`]: true,
    };
  }

  if (stage === "saved") {
    return {
      [`routineReportsScanned.${dept}`]: true,
      [`routineReportsSaved.${dept}`]: true,
    };
  }

  return {};
}
