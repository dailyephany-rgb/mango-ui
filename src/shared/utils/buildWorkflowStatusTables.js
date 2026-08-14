/**
 * Build Master Card–style department/stage tables from a report_details doc.
 * Shared by Owner Ops Performance Report (and available for Master Card).
 */

import { cascadeRoutineStages } from "./routineStageFlags.js";

export const WORKFLOW_DEPARTMENT_LOOKUP = {
  "Bio-Chemistry": {
    label: "Biochemistry",
    firestoreKey: "Bio-Chemistry",
    workflow: "routine",
  },
  Hormones: {
    label: "Hormones",
    firestoreKey: "Hormones",
    workflow: "routine",
  },
  "Blood-Group": {
    label: "Blood Group",
    firestoreKey: "Blood Group",
    workflow: "routine",
  },
  Coagulation: {
    label: "Coagulation",
    firestoreKey: "Coagulation",
    workflow: "routine",
  },
  Haematology: {
    label: "Haematology",
    firestoreKey: "Haematology",
    workflow: "routine",
  },
  ESR: {
    label: "ESR",
    firestoreKey: "ESR",
    workflow: "routine",
  },
  Serology: {
    label: "Serology",
    firestoreKey: "Serology",
    workflow: "routine",
  },
  RapidCard: {
    label: "Rapid Card",
    firestoreKey: "Rapid Card",
    workflow: "routine",
  },
  "Urine Examination": {
    label: "Urine Analysis",
    firestoreKey: "Urine Analysis",
    workflow: "routine",
  },
  FnacRegister: {
    label: "FNAC",
    workflow: "inside",
  },
  PathologyRegister: {
    label: "Pathology",
    workflow: "inside",
  },
  CultureRegister: {
    label: "Culture",
    workflow: "inside",
  },
  FluidRegister: {
    label: "Fluid",
    workflow: "inside",
  },
  STERLING: {
    label: "STERLING",
    workflow: "outsource",
  },
  NEUBERG: {
    label: "NEUBERG",
    workflow: "outsource",
  },
  LIFECELL: {
    label: "LIFECELL",
    workflow: "outsource",
  },
  LILAC: {
    label: "LILAC",
    workflow: "outsource",
  },
  RELIABLE: {
    label: "RELIABLE",
    workflow: "outsource",
  },
};

function deptKeyOf(test) {
  if (typeof test === "string") return test.trim();
  return (test?.dept || "").trim();
}

function testsForDept(selectedTests, deptKey) {
  return (selectedTests || [])
    .filter(
      (x) => typeof x !== "string" && (x.dept || "").trim() === deptKey
    )
    .map((x) => x.test)
    .filter(Boolean);
}

/**
 * @param {object} reportDetails — report_details document fields
 * @returns {{
 *   routineStatuses: object[],
 *   insideStatuses: object[],
 *   outsourceStatuses: object[],
 * }}
 */
export function buildWorkflowStatusTables(reportDetails = {}) {
  const selectedTests = reportDetails.selectedTests || [];
  const routineStatuses = [];
  const insideStatuses = [];
  const outsourceStatuses = [];
  const processed = new Set();

  selectedTests.forEach((t) => {
    const deptKey = deptKeyOf(t);
    if (!deptKey || processed.has(deptKey)) return;
    processed.add(deptKey);

    const config = WORKFLOW_DEPARTMENT_LOOKUP[deptKey];
    if (!config) return;

    const tests = testsForDept(selectedTests, deptKey);

    if (config.workflow === "routine") {
      const cascaded = cascadeRoutineStages({
        scanned: reportDetails.routineReportsScanned?.[config.firestoreKey],
        saved: reportDetails.routineReportsSaved?.[config.firestoreKey],
        validated: reportDetails.routineReportsValidated?.[config.firestoreKey],
        entered: reportDetails.routineReportsEntered?.[config.firestoreKey],
      });
      routineStatuses.push({
        dept: config.label,
        tests,
        scanned: cascaded.scanned,
        saved: cascaded.saved,
        validated: cascaded.validated,
        entered: cascaded.entered,
      });
      return;
    }

    if (config.workflow === "inside") {
      insideStatuses.push({
        dept: deptKey,
        tests,
        saved: !!reportDetails.insideLabReportsSaved?.[deptKey],
      });
      return;
    }

    if (config.workflow === "outsource") {
      outsourceStatuses.push({
        dept: config.label,
        tests,
        sampleCollected:
          !!reportDetails.outsourceReportsCollected?.[deptKey],
        reportReceived:
          !!reportDetails.outsourceReportsReceived?.[deptKey],
        reportGiven:
          !!reportDetails.outsourceReportsDelivered?.[deptKey],
      });
    }
  });

  return { routineStatuses, insideStatuses, outsourceStatuses };
}
