

import { trackedOnSnapshot as onSnapshot } from "../../shared/firestore/trackedFirestore.js";
import { createOwnerSessionPaint } from "../../shared/cache/createOwnerSessionPaint.js";
import { withOwnerSourceControl } from "../lib/withOwnerSourceControl.js";
import testMapping from "../../test_mapping.json";
import { buildWorkflowStatusTables } from "../../shared/utils/buildWorkflowStatusTables.js";
import {
  istDayStart,
  istDayEndExclusive,
  getISTDateString,
} from "../../shared/utils/dates.js";
import {
  collection,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../firebaseConfig.js";

export const ROUTINE_WORKFLOW_LOOKUP = {
  "Bio-Chemistry": {
    label: "Bio-Chemistry",
    completedAtField: "biochemistryCompletedAt",
  },

  Hormones: {
    label: "Hormones",
    completedAtField: "hormonesCompletedAt",
  },

  Haematology: {
    label: "Haematology",
    completedAtField: "haematologyCompletedAt",
  },

  "Blood-Group": {
    label: "Blood Group",
    completedAtField: "bloodGroupCompletedAt",
  },

  Coagulation: {
    label: "Coagulation",
    completedAtField: "coagulationCompletedAt",
  },

  ESR: {
    label: "ESR",
    completedAtField: "esrCompletedAt",
  },

  Serology: {
    label: "Serology",
    completedAtField: "serologyCompletedAt",
  },

  RapidCard: {
    label: "Rapid Card",
    completedAtField: "rapidCardCompletedAt",
  },

  "Urine Examination": {
    label: "Urine Analysis",
    completedAtField: "urineCompletedAt",
  },
};


export const SPECIAL_WORKFLOW_LOOKUP = {
  FnacRegister: {
    label: "Inside Lab",
    workflow: "inside",
  },

  PathologyRegister: {
    label: "Inside Lab",
    workflow: "inside",
  },

  CultureRegister: {
    label: "Inside Lab",
    workflow: "inside",
  },

  FluidRegister: {
    label: "Inside Lab",
    workflow: "inside",
  },

  STERLING: {
    label: "Outsource",
    workflow: "outsource",
  },

  NEUBERG: {
    label: "Outsource",
    workflow: "outsource",
  },

  LIFECELL: {
    label: "Outsource",
    workflow: "outsource",
  },

  LILAC: {
    label: "Outsource",
    workflow: "outsource",
  },

  RELIABLE: {
    label: "Outsource",
    workflow: "outsource",
  },
};


export const ROUTINE_WORKFLOW_CHART_KEYS = [
  "esr",
  "haematology",
  "biochemistry",
  "bloodGroup",
  "coagulation",
  "hormones",
  "serology",
  "rapidCard",
  "urine",
  "printed",
];

export const ROUTINE_WORKFLOW_COLORS = {
  esr: "#dc2626",
  haematology: "#16a34a",
  biochemistry: "#2563eb",
  bloodGroup: "#f59e0b",
  coagulation: "#06b6d4",
  hormones: "#ca8a04",
  serology: "#7c3aed",
  rapidCard: "#0891b2",
  urine: "#84cc16",
  printed: "#4b5563",
};

export const ROUTINE_WORKFLOW_LABELS = {
  esr: "ESR",
  haematology: "Haematology",
  biochemistry: "Bio-Chemistry",
  bloodGroup: "Blood Group",
  coagulation: "Coagulation",
  hormones: "Hormones",
  serology: "Serology",
  rapidCard: "Rapid Card",
  urine: "Urine Analysis",
  printed: "Report Printed",
};

const ROUTINE_SLA_KEYS = {
  "Bio-Chemistry": "biochem",
  "Hormones": "hormones",
  "Haematology": "haem",
  "Blood-Group": "bloodgroup",
  "Coagulation": "coagulation",
  "ESR": "esr",
  "Serology": "serology",
  "RapidCard": "rapid",
  "Urine Examination": "urine_analysis",
};

const getDepartmentSLA = (departmentKey) => {
  const slaKey = ROUTINE_SLA_KEYS[departmentKey];
  const slaLimit = Number(testMapping?.[slaKey]?.turnaround);

  return Number.isFinite(slaLimit) ? slaLimit : null;
};

const toDate = (value) => {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  if (value.seconds) return new Date(value.seconds * 1000);

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const matchesFilters = (record, source, dateRange) => {
  const printed = toDate(record.timePrinted);
  if (!printed) return false;

  // IST calendar day — same result on every machine for a given YYYY-MM-DD.
  const dateStr = getISTDateString(printed);
  if (!dateStr) return false;
  if (dateRange?.from && dateStr < dateRange.from) return false;
  if (dateRange?.to && dateStr > dateRange.to) return false;

  const normSource =
    source && source !== "All"
      ? source.trim().toUpperCase()
      : null;

  if (normSource) {
    const rowSource =
      (record.source || "").trim().toUpperCase();

    if (rowSource !== normSource) return false;
  }

  return true;
};

const minutesBetween = (start, end) => {
  const startDate = toDate(start);
  const endDate = toDate(end);
  if (!startDate || !endDate || endDate < startDate) return null;
  return Math.round((endDate.getTime() - startDate.getTime()) / 60000);
};

const getTestDepartment = (test) => {
  if (typeof test === "string") return test.trim();
  return (test?.dept || "").trim();
};



const latestDate = (dates) => {
  const validDates = dates.map(toDate).filter(Boolean);
  if (validDates.length === 0) return null;
  return new Date(Math.max(...validDates.map((date) => date.getTime())));
};

const buildRoutineWorkflow = (selectedTests, details) => {
  const processed = new Set();
  const departments = [];

  (selectedTests || []).forEach((test) => {
    const deptKey = getTestDepartment(test);

    if (!deptKey || processed.has(deptKey)) return;

    processed.add(deptKey);

    const config = ROUTINE_WORKFLOW_LOOKUP[deptKey];

if (!config) return;

departments.push({
  key: deptKey,
  ...config,
  completedAt: toDate(details[config.completedAtField]),
});
  });

  const completed =
    departments.length > 0 &&
    departments.every((department) => Boolean(department.completedAt));

  return {
    departments,
    hasRoutine: departments.length > 0,
    routineCompletedAt: completed
      ? latestDate(
          departments.map((department) => department.completedAt)
        )
      : null,
  };
};

const hasSpecialWorkflow = (selectedTests, workflow) => {
  return (selectedTests || []).some((test) => {
    const deptKey = getTestDepartment(test);

    const config = SPECIAL_WORKFLOW_LOOKUP[deptKey];

    return config?.workflow === workflow;
  });
};

const buildWorkflowRecord = (reportDetails) => {
  const selectedTests = reportDetails.selectedTests || [];
  const routine = buildRoutineWorkflow(selectedTests, reportDetails);
  const hasInsideLab = hasSpecialWorkflow(selectedTests, "inside");
  const hasOutsource = hasSpecialWorkflow(selectedTests, "outsource");

  const { routineStatuses, insideStatuses, outsourceStatuses } =
    buildWorkflowStatusTables(reportDetails);

  // Derive completion from stage maps / completedAt — do not rely only on
  // report_details.routineCompleted (written only while Master View is open).
  const stagesComplete =
    routineStatuses.length > 0 &&
    routineStatuses.every(
      (s) => s.scanned === "Yes" && s.saved === "Yes" && !!s.validated
    );
  const routineCompleted =
    !!reportDetails.routineCompleted ||
    stagesComplete ||
    (routine.hasRoutine && !!routine.routineCompletedAt);

  const insideStagesComplete =
    insideStatuses.length > 0 && insideStatuses.every((s) => !!s.saved);
  const insideLabCompleted =
    !!reportDetails.insideLabCompleted || insideStagesComplete;

  const outsourceStagesComplete =
    outsourceStatuses.length > 0 &&
    outsourceStatuses.every(
      (s) => s.sampleCollected && s.reportReceived && s.reportGiven
    );
  const outsourceCompleted =
    !!reportDetails.outsourceCompleted || outsourceStagesComplete;

  const routineStatus = !routine.hasRoutine
    ? "Not Required"
    : routineCompleted || routine.routineCompletedAt
      ? "Completed"
      : "Pending";

  const insideLabStatus = !hasInsideLab
    ? "Not Required"
    : insideLabCompleted
      ? "Completed"
      : "Pending";

  const outsourceStatus = !hasOutsource
    ? "Not Required"
    : outsourceCompleted
      ? "Completed"
      : "Pending";

  const timeCollected = toDate(reportDetails.timeCollected);
  const routineReportPrintedTime = toDate(reportDetails.routineReportPrintedTime);
  const insideLabReportPrintedTime = toDate(
    reportDetails.insideLabReportPrintedTime
  );
  const whatsappSentTime = toDate(reportDetails.whatsappSentTime);

  const workflowStage =
  reportDetails.whatsappSent
    ? "WhatsApp Sent"
    : reportDetails.routineReportPrinted
    ? "Routine Printed"
    : routineCompleted || routine.routineCompletedAt
    ? "Routine Completed"
    
    : hasInsideLab && insideLabCompleted ? "Inside Lab Completed": hasOutsource && outsourceCompleted ? "Outsource Completed"

    : routine.hasRoutine
    ? "Routine Pending"
    : "No Routine";
    

    let workflowProgress = 0;

    if (routineCompleted || routine.routineCompletedAt)
      workflowProgress = 33;

    if (reportDetails.routineReportPrinted)
      workflowProgress = 66;

    if (reportDetails.whatsappSent)
      workflowProgress = 100;

      const workflowTimeline = [];

      const chartData = {};
      
      ROUTINE_WORKFLOW_CHART_KEYS.forEach((k) => {
        chartData[k] = 0;
      });
      
      let previousTime = timeCollected;
      
      const completedDepartments = [...routine.departments]
        .filter((d) => d.completedAt)
        .sort((a, b) => a.completedAt - b.completedAt);
      
      completedDepartments.forEach((dept) => {
        const minutes = minutesBetween(previousTime, dept.completedAt);
      
        
        if (minutes != null) {
          // convert department names to chart keys
          const keyMap = {
            ESR: "esr",
            Haematology: "haematology",
            "Bio-Chemistry": "biochemistry",
            "Blood-Group": "bloodGroup",
            Coagulation: "coagulation",
            Hormones: "hormones",
            Serology: "serology",
            RapidCard: "rapidCard",
            "Urine Examination": "urine",
          };
        
          const chartKey = keyMap[dept.key];
          const elapsedFromCollection = minutesBetween(timeCollected, dept.completedAt);
          const slaLimit = getDepartmentSLA(dept.key);
          const slaViolated =
            slaLimit != null &&
            elapsedFromCollection != null &&
            elapsedFromCollection > slaLimit;
          const slaOverrunMinutes = slaViolated
            ? elapsedFromCollection - slaLimit
            : 0;
        
          workflowTimeline.push({
            key: chartKey,
            label: dept.label,
            startedAt: previousTime,
            completedAt: dept.completedAt,
            minutes,
            elapsedFromCollection,
            slaLimit,
            slaViolated,
            slaOverrunMinutes,
          });
        
          chartData[chartKey] = minutes;
          previousTime = dept.completedAt;
        }
      });

  
if (routineReportPrintedTime && previousTime) {
  const minutes = minutesBetween(previousTime, routineReportPrintedTime);

  if (minutes != null) {
    workflowTimeline.push({
      key: "printed",
      label: "Report Printed",
      startedAt: previousTime,
      completedAt: routineReportPrintedTime,
      minutes,
      elapsedFromCollection: minutesBetween(timeCollected, routineReportPrintedTime),
      slaLimit: null,
      slaViolated: false,
      slaOverrunMinutes: 0,
    });

    chartData.printed = minutes;
  }
}

const totalWorkflowMinutes = workflowTimeline.reduce(
  (sum, stage) => sum + stage.minutes,
  0
);

const outsourceLabs = [...new Set(
  selectedTests
    .map((t) => getTestDepartment(t))
    .filter((dept) => {
      const config = SPECIAL_WORKFLOW_LOOKUP[dept];
      return config?.workflow === "outsource";
    })
)];

const outsourceCollected =
  outsourceLabs.length > 0 &&
  outsourceLabs.every(
    (lab) => reportDetails.outsourceReportsCollected?.[lab]
  );

const outsourceReportReceived =
  outsourceLabs.length > 0 &&
  outsourceLabs.every(
    (lab) => reportDetails.outsourceReportsReceived?.[lab]
  );

const outsourceReportDelivered =
  outsourceLabs.length > 0 &&
  outsourceLabs.every(
    (lab) => reportDetails.outsourceReportsDelivered?.[lab]
  );

  return {
    id: reportDetails.id,
    regNo: reportDetails.regNo,
    diagnosticNo: reportDetails.diagnosticNo,
    patientName: reportDetails.name || "",
    doctor: reportDetails.doctor || "",
    phone: reportDetails.phone || "",
    category: reportDetails.category || "",
    source: reportDetails.source || "",
    selectedTests,
    timeCollected,

    hasRoutine: routine.hasRoutine,
    routineDepartments: routine.departments,
    routineCompletedAt: routine.routineCompletedAt,
    routineCompleted,
    routineReportPrinted: Boolean(reportDetails.routineReportPrinted),
    routineReportPrintedTime,
    routineReportPrintedBy: reportDetails.routineReportPrintedBy || "",
    routineStatuses,

    hasInsideLab,
    insideLabCompleted,
    insideStatuses,

    insideLabReportPrinted: Boolean (reportDetails.insideLabReportPrinted),
    insideLabReportPrintedTime,
    insideLabReportPrintedBy: reportDetails.insideLabReportPrintedBy || "",

    hasOutsource,
    outsourceStatuses,

    outsourceCollected,

    outsourceReportReceived,

    outsourceReportDelivered,

    outsourceCompleted,

    whatsappRequired: Boolean(reportDetails.whatsappRequired),
    whatsappSent: Boolean(reportDetails.whatsappSent),
    whatsappSentTime,
    whatsappSentBy: reportDetails.whatsappSentBy || "",
    receiptSavedBy: reportDetails.receiptSavedBy || "",

      routineStatus,
      insideLabStatus,
      outsourceStatus,
      workflowStage,
      workflowProgress,
      workflowCompleted: Boolean(reportDetails.whatsappSent),

      workflowTimeline,

      chartData,

      totalWorkflowMinutes,


      durations: {
        collectedToRoutineCompleted: minutesBetween(
          timeCollected,
          routine.routineCompletedAt
        ),
      routineCompletedToPrinted: minutesBetween(
        routine.routineCompletedAt,
        routineReportPrintedTime
      ),
      printedToWhatsappSent: minutesBetween(
        routineReportPrintedTime,
        whatsappSentTime
      ),
      collectedToRoutinePrinted: minutesBetween(
        timeCollected,
        routineReportPrintedTime
      ),
      routinePrintedToWhatsappSent: minutesBetween(
        routineReportPrintedTime,
        whatsappSentTime
      ),
    
    },
  };
};

export const mergeWorkflowRecords = (reportRecords) =>
  reportRecords
    .filter((record) => record.regNo)
    .map((record) =>
  buildWorkflowRecord(record)
);

const count = (records, predicate) => records.filter(predicate).length;

const averageMinutes = (records, selector) => {
  const values = records
    .map(selector)
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) return null;

  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length
  );
};

const buildStaffDistribution = (records, field) => {
  const counts = {};

  records.forEach((record) => {
    const staff = record[field]?.trim();

    if (!staff) return;

    counts[staff] = (counts[staff] || 0) + 1;
  });

  const total = Object.values(counts).reduce(
    (sum, count) => sum + count,
    0
  );

  return Object.entries(counts)
    .map(([name, count]) => ({
      name,
      count,
      percentage: total
        ? Math.round((count / total) * 100)
        : 0,
    }))
    .sort((a, b) => b.count - a.count);
};

export const buildWorkflowSummary = (records) => {
  const routineRecords = records.filter((record) => record.hasRoutine);
  const insideLabRecords = records.filter((record) => record.hasInsideLab);
  const outsourceRecords = records.filter((record) => record.hasOutsource);

  return {
    routineTotal: routineRecords.length,
    routinePending: count(routineRecords,(record) => !record.routineCompleted),
    routineCompleted: count(routineRecords,(record) => record.routineCompleted),
    routinePrinted: count(routineRecords, (record) => record.routineReportPrinted),
    whatsappRequired: count(routineRecords, (record) => record.whatsappRequired),
    whatsappSent: count(routineRecords, (record) => record.whatsappSent),

    insideTotal: insideLabRecords.length,
    insidePending: count(
      insideLabRecords,
      (record) => !record.insideLabCompleted
    ),
    insideCompleted: count(
      insideLabRecords,
      (record) => record.insideLabCompleted
    ),
    insidePrinted: count(
      insideLabRecords,
      (record) => record.insideLabReportPrinted
    ),

    outsourceTotal: outsourceRecords.length,

outsourceRemaining: count(
  outsourceRecords,
  (record) => !record.outsourceCollected
),

  outsourceCollected: count(
    outsourceRecords,
    (record) => record.outsourceCollected
  ),

  outsourceReportReceived: count(
    outsourceRecords,
    (record) => record.outsourceReportReceived
  ),

  outsourceReportDelivered: count(
    outsourceRecords,
    (record) => record.outsourceReportDelivered
  ),

  outsourceCompleted: count(
    outsourceRecords,
    (record) => record.outsourceCompleted
  ),

    routineAvgCompletion: averageMinutes(
      records,
      (record) => record.durations.collectedToRoutineCompleted
    ),
    routineAvgPrinting: averageMinutes(
      records,
      (record) => record.durations.routineCompletedToPrinted
    ),
    whatsappAvg: averageMinutes(
      records,
      (record) => record.durations.printedToWhatsappSent
    ),

    staffDistribution: {

      receipt: buildStaffDistribution(
        records,
        "receiptSavedBy"
      ),

      routine: buildStaffDistribution(
        records,
        "routineReportPrintedBy"
      ),
    
      insideLab: buildStaffDistribution(
        records,
        "insideLabReportPrintedBy"
      ),
    
      whatsapp: buildStaffDistribution(
        records,
        "whatsappSentBy"
      ),
    },

  };
};

export const subscribeToWorkflowAnalytics = ({
  onData,
  onError,
  source = "All",
  dateRange,
}) => {
  const { paintCache, onDataLive } = createOwnerSessionPaint({
    dept: "workflow",
    dateRange,
    source,
    onData,
  });
  paintCache();

  let reportRecords = [];

  const emit = () => {
    const filteredReports =
  reportRecords.filter((record) =>
    matchesFilters(record, source, dateRange)
  );
  
    const records =
      mergeWorkflowRecords(filteredReports);

    const stackedBarRecords = records.filter(
      (record) =>
        record.hasRoutine &&
        record.routineCompletedAt &&
        record.routineReportPrinted &&
        record.routineReportPrintedTime
    );

    console.log(
      "Stacked Bar Records:",
      stackedBarRecords.map((r) => ({
        regNo: r.regNo,
        diagnosticNo: r.diagnosticNo,
        hasRoutine: r.hasRoutine,
        routineCompletedAt: r.routineCompletedAt,
        routineReportPrinted: r.routineReportPrinted,
        routineReportPrintedTime: r.routineReportPrintedTime,
        chartData: r.chartData,
      }))
    );

    onDataLive({
      records,
      stackedBarRecords,
      summary: buildWorkflowSummary(records),
    });

  };

  const start = istDayStart(dateRange?.from);
  const endExclusive = istDayEndExclusive(dateRange?.to);
  if (!start || !endExclusive) {
    onDataLive({
      records: [],
      stackedBarRecords: [],
      summary: buildWorkflowSummary([]),
    });
    return () => {};
  }

  const reportQuery = query(
    collection(db, "report_details"),
    where("timePrinted", ">=", Timestamp.fromDate(start)),
    where("timePrinted", "<", Timestamp.fromDate(endExclusive)),
    orderBy("timePrinted", "asc")
  );

  const unsubscribeReport = onSnapshot(
    reportQuery,
    (snapshot) => {
      reportRecords = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      emit();
    },
    onError
  );
  

  return () => {
    unsubscribeReport();
  };
};
  

 

