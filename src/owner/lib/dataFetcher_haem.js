
// ------------------------------------------------------
// Haematology Analysis — STRICT Time Printed Implementation (CLONE OF ESR)
// ------------------------------------------------------

import { db } from "../../firebaseConfig.js";
import { scopedTimePrintedQuery } from "../../shared/firestore/scopedTimePrintedQuery.js";
import { createOwnerSessionPaint } from "../../shared/cache/createOwnerSessionPaint.js";
import { slaTimestampFields } from "../ops/slaTimestampFields.js";
import { trackedOnSnapshot as onSnapshot } from "../../shared/firestore/trackedFirestore.js";
import { subscribeSharedMasterRegister } from "../../shared/firestore/subscribeSharedOnSnapshot.js";
import { withOwnerSourceControl } from "./withOwnerSourceControl.js";
import { createDebouncedPublish } from "./createDebouncedPublish.js";
import testTimings from "../data/test_timings.json";

/* ====================== DATE UTILS ====================== */

import { toDate, minutesDiff } from "../../shared/utils/dates.js";
import { normalizeTestsField } from "../../shared/utils/normalizeTestsField.js";
export { toDate, minutesDiff, normalizeTestsField };

/* ================= HAEM CANON TESTS =================== */

const HAEM_TESTS_CANON = [
  "HAEMOGRAM",
  "HB HAEMOGLOBIN",
  "LAMELLAR BODY COUNT",
  "HEMATOCRIT",
  "RED BLOOD CELL COUNT",
  "TOTAL LEUCOCYTIC COUNT",
  "DIFFERENTIAL LEUCOCYTIC COUNT",
  "PLATELET COUNT",
  "RED BLOOD CELL INDICES"
];

const normalizeHaem = (s = "") =>
  String(s).toLowerCase().replace(/[\s,._\-()]+/g, " ").trim();

export function isHaemTest(testName) {
  if (!testName) return false;
  const normTest = normalizeHaem(testName);
  return HAEM_TESTS_CANON.some((canonical) => {
    const target = normalizeHaem(canonical);
    return normTest.includes(target) || target.includes(normTest);
  });
}

export const extractHaemTestCount = (record) => {
  const rawTests = normalizeTestsField(record.selectedTests || record.tests || record.test || []);
  const matchingTests = rawTests.filter(testName => isHaemTest(testName));
  // Following ESR logic: count matches, or return 1 if it's in this register
  return matchingTests.length > 0 ? matchingTests.length : (record.regNo ? 1 : 0);
};

/* ================= MERGE DEPT ROWS ====================== */

export function mergeDeptRows(rows = []) {
  const out = {};
  rows.forEach((r) => {
    const regId = r.regNo || r.id;
    const diagNo = r.diagnosticNo || r.billNo || "NA"; // Updated to diagnosticNo
    if (!regId) return;

    const printedDate = toDate(r.timePrinted);
    if (!printedDate) return; 

    // UPDATE: Unique key combines RegNo and diagnosticNo
    const key = `${regId}_${diagNo}_haem`;
    if (!out[key]) {
      out[key] = {
        regNo: regId,
        diagnosticNo: diagNo, // Updated field
        name: r.name || r.patientName || "",
        department: "Haematology",
        source: r.source || "",
        timePrinted: printedDate, 
        timeCollected: toDate(r.timeCollected),
        timeScanned: toDate(r.scannedTime || r.timeScanned),
        timeSaved: toDate(r.savedTime || r.timeSaved),
        timeValidated: toDate(r.validatedTime || r.timeValidated),
        isSaved: r.saved === "Yes" || !!(r.savedTime || r.timeSaved),
        savedBy: r.savedBy || "",
        isValidated: r.validated === true || r.status === "validated" || !!(r.validatedTime || r.timeValidated),
        validatedBy: r.validatedBy || "",
        enteredBy: r.enteredBy || "",
        enteredTime: toDate(r.enteredTime),
        isCritical: r.critical === "Yes", 
        testList: new Set(),
      };
    }
    normalizeTestsField(r.selectedTests || r.tests || r.test).forEach((t) => out[key].testList.add(t));
  });
  
  return Object.values(out).map((r) => ({
    ...r,
    test: Array.from(r.testList).join(", "),
    selectedTests: Array.from(r.testList),
  }));
}

/* ================= SLA VIOLATIONS (STRICT ROUNDING FIX) ======================= */

export function computeSLAViolations(unifiedRows, timingMap, stage = "scanned_to_saved") {
  const violators = [];
  unifiedRows.forEach((row) => {
    const allowed = timingMap["haem"]?.[stage] ?? timingMap.default?.[stage] ?? 30;
    let start;
    let end;

      switch (stage) {
        case "scanned_to_saved":
          start = toDate(
            row.timeScanned
          );
          end = toDate(
            row.timeSaved
          );
          break;

        case "saved_to_validated":
          start = toDate(
            row.timeSaved
          );
          end = toDate(
            row.timeValidated
          );
          break;

        case "validated_to_entered":
          start = toDate(
            row.timeValidated
          );
          end = toDate(
            row.enteredTime
          );
          break;

          case "turnaround":
          start = toDate(row.timeCollected);
          end = toDate(row.timeValidated);
          break;

        default:
          return;
      }

      if (!start || !end)
        return;

      const rawDuration =
        (end - start) /
        60000;

      const duration =
        Math.round(rawDuration);
    
    if (duration > allowed) {
      const excess = duration - allowed; 
      const status = duration <= allowed * 1.5 ? "borderline" : "violation";
      
      violators.push({
        ...slaTimestampFields(row),
        regNo: row.regNo,
        diagnosticNo: row.diagnosticNo,
        name: row.name,
        test: row.test,
        duration,
        excess: Math.round(excess),
        allowed,
        status,
        department: "Haematology",
      
        savedBy:
          row.savedBy || "NA",
      
        validatedBy:
          row.validatedBy || "NA",
      
        enteredBy:
          row.enteredBy || "NA",
      
        timeScanned:
          row.timeScanned,
      
        timeSaved:
          row.timeSaved,
      
        timeValidated:
          row.timeValidated,
      
        enteredTime:
          row.enteredTime,
      });
    }
  });
  return violators.sort((a, b) => b.excess - a.excess);
}

/* ================= KPI COMPUTATION ====================== */

export function computeKPIs(masterRows = [], haemRows = []) {
  const masterHaem = masterRows.filter((m) => {
    const tests = normalizeTestsField(m.selectedTests || m.tests || m.test || []);
    return tests.some(isHaemTest);
  });

  // UPDATE: Counting unique diagnosticNo-based visits
  const totalPatientsCollected = new Set(masterHaem.map((m) => `${m.regNo}_${m.diagnosticNo || m.billNo || "NA"}`)).size;
  const totalTestsCollected = masterHaem.reduce((sum, m) => sum + extractHaemTestCount(m), 0);
  
  const savedRows = haemRows.filter(r => r.isSaved);
  const totalPatientsSaved = new Set(savedRows.map((r) => `${r.regNo}_${r.diagnosticNo}`)).size;
  const totalTestsSaved = savedRows.reduce((sum, r) => sum + extractHaemTestCount(r), 0);
  
  const validatedRows = haemRows.filter((r) => r.isValidated);
  const totalPatientsValidated = new Set(validatedRows.map((r) => `${r.regNo}_${r.diagnosticNo}`)).size;

  const totalPatientsCritical = haemRows.filter(r => r.isCritical).length;
  
  const averages = { 
    printedToCollected: [], 
    collectedToScanned: [], 
    scannedToSaved: [], 
    savedToValidated: [],
    collectedToValidated: [] 
  };

  haemRows.forEach((r) => {
    const A = minutesDiff(r.timePrinted, r.timeCollected);
    const B = minutesDiff(r.timeCollected, r.timeScanned);
    const C = minutesDiff(r.timeScanned, r.timeSaved);
    const D = minutesDiff(r.timeSaved, r.timeValidated);
    const TAT = minutesDiff(r.timeCollected, r.timeValidated);

    if (A != null) averages.printedToCollected.push(A);
    if (B != null) averages.collectedToScanned.push(B);
    if (C != null) averages.scannedToSaved.push(C);
    if (D != null) averages.savedToValidated.push(D);
    if (TAT != null) averages.collectedToValidated.push(TAT);
  });

  const avg = (arr) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;

  return {
    totalPatientsCollected, totalTestsCollected, totalPatientsSaved, totalPatientsValidated,
    totalTestsSaved, totalPatientsPendingScans: Math.max(0, totalPatientsCollected - totalPatientsSaved),
    totalTestsPending: Math.max(0, totalTestsCollected - totalTestsSaved),
    totalPatientsCritical,
    avgPrintedToCollected: avg(averages.printedToCollected),
    avgCollectedToScanned: avg(averages.collectedToScanned),
    avgScannedToSaved: avg(averages.scannedToSaved),
    avgSavedToValidated: avg(averages.savedToValidated),
    avgTurnaroundTime: avg(averages.collectedToValidated),
  };
}

export function computeStaffAnalytics(
  rows = []
) {

    /* =========================
     TESTING (savedBy)
  ========================= */

  const savedRows = rows.filter(
    (r) =>
      (r.isSaved || r.timeSaved) &&
      r.savedBy
  );

  const totalSaved =
    savedRows.length;

  const distributionMap = {};
  const avgMap = {};
  const timelines = {};

  savedRows.forEach((r) => {
    const user = r.savedBy;

    distributionMap[user] =
      (distributionMap[user] || 0) +
      1;

    const mins =
      minutesDiff(
        r.timeScanned,
        r.timeSaved
      );

    if (mins != null) {
      if (!avgMap[user]) {
        avgMap[user] = [];
      }

      avgMap[user].push(mins);

      if (!timelines[user]) {
        timelines[user] = [];
      }

      timelines[user].push({
        regNo: r.regNo,
        diagnosticNo:
          r.diagnosticNo,
        name: r.name,
        duration: mins,
        selectedTests:
          r.selectedTests || [],
      });
    }
  });

  const distribution =
  Object.entries(
    distributionMap
  ).map(
    ([name, count]) => ({
      name,
      count,
      percentage:
        totalSaved > 0
          ? Number(
              (
                (count /
                  totalSaved) *
                100
              ).toFixed(1)
            )
          : 0,
    })
  );
  const averages =
  Object.entries(
    avgMap
  ).map(
    ([name, values]) => ({
      name,
      avgMinutes:
        values.length
          ? Math.round(
              values.reduce(
                (s, v) =>
                  s + v,
                0
              ) /
                values.length
            )
          : 0,
    })
  );

  /* =========================
   VALIDATED (validatedBy)
========================= */

const validatedRows = rows.filter(
  (r) =>
    (r.isValidated ||
      r.timeValidated) &&
    r.validatedBy
);

const totalValidated =
  validatedRows.length;

const validatedDistributionMap =
  {};
const validatedAvgMap = {};
const validatedTimelines = {};

validatedRows.forEach((r) => {
  const user =
    r.validatedBy;

  validatedDistributionMap[
    user
  ] =
    (validatedDistributionMap[
      user
    ] || 0) + 1;

  const mins =
    minutesDiff(
      r.timeSaved,
      r.timeValidated
    );

  if (mins != null) {
    if (
      !validatedAvgMap[user]
    ) {
      validatedAvgMap[
        user
      ] = [];
    }

    validatedAvgMap[
      user
    ].push(mins);

    if (
      !validatedTimelines[
        user
      ]
    ) {
      validatedTimelines[
        user
      ] = [];
    }

    validatedTimelines[
      user
    ].push({
      regNo: r.regNo,
      diagnosticNo:
        r.diagnosticNo,
      name: r.name,
      duration: mins,
      selectedTests:
        r.selectedTests ||
        [],
    });
  }
});

const validatedDistribution =
  Object.entries(
    validatedDistributionMap
  ).map(
    ([name, count]) => ({
      name,
      count,
      percentage:
        totalValidated > 0
          ? Number(
              (
                (count /
                  totalValidated) *
                100
              ).toFixed(1)
            )
          : 0,
    })
  );

const validatedAverages =
  Object.entries(
    validatedAvgMap
  ).map(
    ([name, values]) => ({
      name,
      avgMinutes:
        values.length
          ? Math.round(
              values.reduce(
                (s, v) =>
                  s + v,
                0
              ) /
                values.length
            )
          : 0,
    })
  );

  /* =========================
   ENTERED (enteredBy)
========================= */

const enteredRows = rows.filter(
  (r) =>
    r.enteredTime &&
    r.enteredBy
);

const totalEntered =
  enteredRows.length;

const enteredDistributionMap =
  {};
const enteredAvgMap = {};
const enteredTimelines = {};

enteredRows.forEach((r) => {
  const user =
    r.enteredBy;

  enteredDistributionMap[
    user
  ] =
    (enteredDistributionMap[
      user
    ] || 0) + 1;

  const mins =
    minutesDiff(
      r.timeValidated,
      r.enteredTime
    );

  if (mins != null) {
    if (
      !enteredAvgMap[user]
    ) {
      enteredAvgMap[
        user
      ] = [];
    }

    enteredAvgMap[
      user
    ].push(mins);

    if (
      !enteredTimelines[
        user
      ]
    ) {
      enteredTimelines[
        user
      ] = [];
    }

    enteredTimelines[
      user
    ].push({
      regNo: r.regNo,
      diagnosticNo:
        r.diagnosticNo,
      name: r.name,
      duration: mins,
      selectedTests:
        r.selectedTests ||
        [],
    });
  }
});

const enteredDistribution =
  Object.entries(
    enteredDistributionMap
  ).map(
    ([name, count]) => ({
      name,
      count,
      percentage:
        totalEntered > 0
          ? Number(
              (
                (count /
                  totalEntered) *
                100
              ).toFixed(1)
            )
          : 0,
    })
  );

const enteredAverages =
  Object.entries(
    enteredAvgMap
  ).map(
    ([name, values]) => ({
      name,
      avgMinutes:
        values.length
          ? Math.round(
              values.reduce(
                (s, v) =>
                  s + v,
                0
              ) /
                values.length
            )
          : 0,
    })
  );

  
  return {
    testing: {
      totalSaved,
      distribution,
      averages,
      timelines,
    },
  
    validated: {
      totalValidated,
      distribution:
        validatedDistribution,
      averages:
        validatedAverages,
      timelines:
        validatedTimelines,
    },
  
    entered: {
      totalEntered,
      distribution:
        enteredDistribution,
      averages:
        enteredAverages,
      timelines:
        enteredTimelines,
    },
  };
}

/* ================= SUBSCRIBE OVERVIEW =================== */

export function subscribeOverview({ onData, source = "All", dateRange }) {
  const { paintCache, onDataLive, setSourceKey } = createOwnerSessionPaint({
    dept: "haem",
    dateRange,
    source,
    onData,
  });
  paintCache();

  let currentSource = source ?? "All";

  const masterRef = scopedTimePrintedQuery("master_register", dateRange);
  const haemRef = scopedTimePrintedQuery("haematology_register", dateRange);
  if (!masterRef || !haemRef) {
    const empty = () => {};
    empty.updateSource = () => {};
    return empty;
  }
  
  let masterRows = []; let haemRows = [];

  const runPublish = () => {
    // UPDATE: Use T00:00:00 to force parsing in Indian Standard Time (Local)
    const from = dateRange?.from ? new Date(dateRange.from + "T00:00:00") : null;
    const to = dateRange?.to ? new Date(dateRange.to + "T23:59:59") : null;

    const filterFn = (row) => {
      const t = toDate(row.timePrinted);
      if (!t) return false;
      if (from && t < from) return false;
      if (to && t > to) return false;

      const normSource = currentSource && currentSource !== "All" ? source.trim().toUpperCase() : null;
      if (normSource) {
        const rowSource = (row.source || "").trim().toUpperCase();
        if (rowSource !== normSource) return false;
      }

      return true;
    };

    const filteredMaster = masterRows.filter(filterFn);
    const filteredHaem = haemRows.filter(filterFn);

    const merged = mergeDeptRows(filteredHaem);
    const unified = unifyForCharts(merged);
    
    const violators = computeSLAViolations(unified, testTimings);

    onDataLive({
      masterRows: filteredMaster,
      deptRows: merged,
      unifiedRows: unified,
      violators,
      kpis: computeKPIs(
        filteredMaster,
        merged
      ),
      staffAnalytics:
        computeStaffAnalytics(
          merged
        ),
    });
  };

  const { publish, publishNow, cancel } = createDebouncedPublish(runPublish, 75);

  const unsubMaster = subscribeSharedMasterRegister(dateRange, (snap) => { masterRows = snap.docs.map(d => ({ id: d.id, ...d.data() })); publish(); });
  const unsubHaem = onSnapshot(haemRef, (snap) => { haemRows = snap.docs.map(d => ({ id: d.id, ...d.data() })); publish(); });

  return withOwnerSourceControl(
    () => { cancel(); unsubMaster?.(); unsubHaem?.(); },
    {
      getSource: () => currentSource,
      setSource: (next) => { currentSource = next; },
      publish: publishNow,
      setSourceKey,
    }
  );
}

export function unifyForCharts(rows = []) {
  return rows.map((r) => ({
    ...r,
    patientName: r.name,
    tests: r.selectedTests,
  }));
}

export async function fetchTestTimings() { return testTimings || {}; }