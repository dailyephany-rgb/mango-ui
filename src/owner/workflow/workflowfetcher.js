

import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
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
  MicroBiology: {
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

const toDate = (value) => {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  if (value.seconds) return new Date(value.seconds * 1000);

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

  const routineStatus = !routine.hasRoutine
  ? "Not Required"
  : routine.routineCompletedAt
  ? "Completed"
  : "Pending";

  const insideLabCompletedAt = toDate(
    reportDetails.insideLabCompletedAt
  );
  
  const outsourceCompletedAt = toDate(
    reportDetails.outsourceCompletedAt
  );
  
  const insideLabStatus = !hasInsideLab
    ? "Not Required"
    : insideLabCompletedAt
    ? "Completed"
    : "Pending";
  
  const outsourceStatus = !hasOutsource
    ? "Not Required"
    : outsourceCompletedAt
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
    : routine.routineCompletedAt
    ? "Routine Completed"
    : hasInsideLab && insideLabCompletedAt
    ? "Inside Lab Completed"
    : hasOutsource && outsourceCompletedAt
    ? "Outsource Completed"
    : routine.hasRoutine
    ? "Routine Pending"
    : "No Routine";
    

    let workflowProgress = 0;

    if (routine.routineCompletedAt)
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
        
          workflowTimeline.push({
            key: chartKey,
            label: dept.label,
            startedAt: previousTime,
            completedAt: dept.completedAt,
            minutes,
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
    });

    chartData.printed = minutes;
  }
}

const totalWorkflowMinutes = workflowTimeline.reduce(
  (sum, stage) => sum + stage.minutes,
  0
);

  return {
    id: reportDetails.id,
    regNo: reportDetails.regNo,
    diagnosticNo: reportDetails.diagnosticNo,
    patientName: reportDetails.name || "",
    source: reportDetails.source || "",
    selectedTests,
    timeCollected,
    routineReportPrintedTime,
    routineReportPrinted: !!reportDetails.routineReportPrinted,

    hasRoutine: routine.hasRoutine,
    routineDepartments: routine.departments,
    routineCompletedAt: routine.routineCompletedAt,
    routineReportPrinted: Boolean(reportDetails.routineReportPrinted),
    routineReportPrintedTime,
    routineReportPrintedBy: reportDetails.routineReportPrintedBy || "",

    hasInsideLab,
    insideLabCompleted: Boolean(insideLabCompletedAt),
    insideLabReportPrinted: Boolean (reportDetails.insideLabReportPrinted),
    insideLabReportPrintedTime,
    insideLabReportPrintedBy: reportDetails.insideLabReportPrintedBy || "",

    hasOutsource,
    outsourceCompleted: Boolean(outsourceCompletedAt),

    whatsappRequired: Boolean(reportDetails.whatsappRequired),
    whatsappSent: Boolean(reportDetails.whatsappSent),
    whatsappSentTime,
    whatsappSentBy: reportDetails.whatsappSentBy || "",

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
    routinePending: count(routineRecords, (record) => !record.routineCompletedAt),
    routineCompleted: count(routineRecords, (record) => record.routineCompletedAt),
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
    outsourcePending: count(
      outsourceRecords,
      (record) => !record.outsourceCompleted
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

export const subscribeToWorkflowAnalytics = (onData, onError) => {
  let reportRecords = [];

  const emit = () => {
    const records = mergeWorkflowRecords(reportRecords);

    const stackedBarRecords = records.filter(
      (record) =>
        record.hasRoutine &&
        record.routineCompletedAt &&
        record.routineReportPrinted &&
        record.routineReportPrintedTime
    );

    onData({
      records,
      stackedBarRecords,
      summary: buildWorkflowSummary(records),
    });

  };

  const unsubscribeReport = onSnapshot(
    query(
      collection(db, "report_details"),
      orderBy("timePrinted", "asc")
    ),
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
  

 

