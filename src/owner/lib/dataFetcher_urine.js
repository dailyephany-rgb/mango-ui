
// ------------------------------------------------------
// src/owner/lib/dataFetcher_urine.js
// Urine Analysis — Analytics Data Fetcher (STRICT + MULTI-COUNT FIX)
// ------------------------------------------------------

import { db } from "../../firebaseConfig.js";
import { scopedTimePrintedQuery } from "../../shared/firestore/scopedTimePrintedQuery.js";
import { createOwnerSessionPaint } from "../../shared/cache/createOwnerSessionPaint.js";
import { trackedOnSnapshot as onSnapshot } from "../../shared/firestore/trackedFirestore.js";
import { subscribeSharedMasterRegister } from "../../shared/firestore/subscribeSharedOnSnapshot.js";
import { withOwnerSourceControl } from "./withOwnerSourceControl.js";
import testTimings from "../data/test_timings.json";

/* ====================== DATE UTILS ====================== */

import { toDate, minutesDiff } from "../../shared/utils/dates.js";
import { normalizeTestsField } from "../../shared/utils/normalizeTestsField.js";
export { toDate, minutesDiff, normalizeTestsField };

/* ================= URINE CANON TESTS =================== */

const URINE_TESTS_CANON = [
  "PREGNANCY TEST",
  "URINE ANALYSIS",
  "URINE FOR ALBUMIN",
  "URINE FOR BILE PIGMENTS",
  "URINE FOR BILE SALTS",
  "URINE FOR KETONE BODIES",
  "URINE FOR SUGAR"
];

const normalizeUrine = (s = "") =>
  String(s).toLowerCase().replace(/[\s,._\-()]+/g, " ").trim();

export function isUrineTest(testName) {
  if (!testName) return false;
  const normTest = normalizeUrine(testName);
  return URINE_TESTS_CANON.some((canonical) => {
    const target = normalizeUrine(canonical);
    return normTest.includes(target) || target.includes(normTest);
  });
}

export const extractUrineTestCount = (record) => {
  const rawTests = normalizeTestsField(record.selectedTests || record.tests || record.test || []);
  const uniqueMatches = new Set();
  
  rawTests.forEach(testName => {
    const normTest = normalizeUrine(testName);
    URINE_TESTS_CANON.forEach(canonical => {
      const target = normalizeUrine(canonical);
      if (normTest.includes(target) || target.includes(normTest)) {
        uniqueMatches.add(target); 
      }
    });
  });

  const count = uniqueMatches.size;
  return count > 0 ? count : (record.regNo ? 1 : 0);
};

/* ================= MERGE DEPT ROWS ====================== */

export function mergeDeptRows(rows = []) {
  const out = {};
  rows.forEach((r) => {
    const regId = r.regNo || r.id;
    const diagNo = r.diagnosticNo || r.billNo || "NA"; 
    if (!regId) return;

    const printedDate = toDate(r.timePrinted);
    if (!printedDate) return; 

    const key = `${regId}_${diagNo}_urine`;
    if (!out[key]) {
      out[key] = {
        regNo: regId,
        diagnosticNo: diagNo, 
        name: r.name || r.patientName || "",
        department: "Urine Examination",
        source: r.source || "",
        timePrinted: printedDate, 
        timeCollected: toDate(r.timeCollected),
        timeScanned: toDate(r.scannedTime || r.timeScanned),
        timeSaved: toDate(r.savedTime || r.timeSaved),
        savedBy: r.savedBy || "",
        timeValidated: toDate(r.validatedTime || r.timeValidated),
        validatedBy: r.validatedBy || "",
        enteredBy: r.enteredBy || "",
        enteredTime: toDate(r.enteredTime),
        isSaved: r.saved === "Yes" || !!(r.savedTime || r.timeSaved),
        isValidated: r.validated === true || r.status === "validated" || !!(r.validatedTime || r.timeValidated),
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

/* ================= SLA VIOLATIONS ======================= */

export function computeSLAViolations(unifiedRows, timingMap, stage = "scanned_to_saved") {
  const violators = [];
  unifiedRows.forEach((row) => {
    const allowed = timingMap["urine"]?.[stage] ?? timingMap.default?.[stage] ?? 30;
    let start;
    let end;

      switch (stage) {
        case "scanned_to_saved":
          start = toDate(row.timeScanned);
          end = toDate(row.timeSaved);
          break;

        case "saved_to_validated":
          start = toDate(row.timeSaved);
          end = toDate(row.timeValidated);
          break;

        case "validated_to_entered":
          start = toDate(row.timeValidated);
          end = toDate(
            row.enteredTime ||
            row.timeEntered
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

      const duration = Math.round(
        (end - start) / 60000
      );
    
    if (duration > allowed) {
      const excess = duration - allowed; 
      const status = duration <= allowed * 1.5 ? "borderline" : "violation";
      
      violators.push({
        regNo: row.regNo,
        diagnosticNo: row.diagnosticNo,
        name: row.name,
        test: row.test,
        duration,
        excess: Math.round(excess),
        allowed,
        status,
        department: "urine",
      
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

export function computeKPIs(masterRows = [], urineRows = []) {
  const masterUrine = masterRows.filter((m) => {
    const tests = normalizeTestsField(m.selectedTests || m.tests || m.test || []);
    return tests.some(isUrineTest);
  });

  const totalPatientsCollected = new Set(masterUrine.map((m) => `${m.regNo}_${m.diagnosticNo || m.billNo || "NA"}`)).size;
  const totalTestsCollected = masterUrine.reduce((sum, m) => sum + extractUrineTestCount(m), 0);
  
  const savedRows = urineRows.filter(r => r.isSaved);
  const totalPatientsSaved = new Set(savedRows.map((r) => `${r.regNo}_${r.diagnosticNo}`)).size;
  const totalTestsSaved = savedRows.reduce((sum, r) => sum + extractUrineTestCount(r), 0);
  
  const validatedRows = urineRows.filter((r) => r.isValidated);
  const totalPatientsValidated = new Set(validatedRows.map((r) => `${r.regNo}_${r.diagnosticNo}`)).size;

  const totalPatientsCritical = urineRows.filter(r => r.isCritical).length;
  
  const averages = { 
    printedToCollected: [], 
    collectedToScanned: [], 
    scannedToSaved: [], 
    savedToValidated: [],
    collectedToValidated: [] 
  };

  urineRows.forEach((r) => {
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

/* ================= STAFF ANALYTICS ====================== */


export function computeStaffAnalytics(rows = []) {

  const savedRows = rows.filter(
    (r) => (r.isSaved || r.timeSaved) && r.savedBy
  );

  const totalSaved = savedRows.length;

  const distributionMap = {};
  const avgMap = {};
  const timelines = {};

  savedRows.forEach((r) => {
    const user = r.savedBy;
  
    distributionMap[user] =
      (distributionMap[user] || 0) + 1;
  
    const mins = minutesDiff(
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
        x: r.diagnosticNo || r.regNo,
        diagnosticNo: r.diagnosticNo || "NA",
        name: r.name,
        test: r.test,
        selectedTests: r.selectedTests || [],
        duration: mins,
        timeScanned: r.timeScanned,
        timeSaved: r.timeSaved,
      });
    }
  });

    const distribution = Object.entries(
      distributionMap
    ).map(([name, count]) => ({
      name,
      count,
      percentage:
        totalSaved > 0
          ? Number(
              ((count / totalSaved) * 100).toFixed(1)
            )
          : 0,
    }));

     const averages = Object.entries(
      avgMap
    ).map(([name, values]) => ({
      name,
      avgMinutes:
        values.length > 0
          ? Math.round(
              values.reduce(
                (sum, v) => sum + v,
                0
              ) / values.length
            )
          : 0,
    }));

    /* =========================
   VALIDATED (validatedBy)
========================= */

const validatedRows = rows.filter(
  (r) =>
    (r.isValidated || r.timeValidated) &&
    r.validatedBy
);
const totalValidated = validatedRows.length;
const validatedDistributionMap = {};
const validatedAvgMap = {};
const validatedTimelines = {};

validatedRows.forEach((r) => {
  const user = r.validatedBy;

  validatedDistributionMap[user] =
    (validatedDistributionMap[user] || 0) + 1;

  const mins = minutesDiff(
    r.timeSaved,
    r.timeValidated
  );

  if (mins != null) {
    if (!validatedAvgMap[user]) {
      validatedAvgMap[user] = [];
    }

    validatedAvgMap[user].push(mins);

    if (!validatedTimelines[user]) {
      validatedTimelines[user] = [];
    }

    validatedTimelines[user].push({
      x: r.diagnosticNo || r.regNo,
      regNo: r.regNo,
      diagnosticNo: r.diagnosticNo || "NA",
      name: r.name,
      test: r.test,
      selectedTests: r.selectedTests || [],
      duration: mins,
      timeSaved: r.timeSaved,
      timeValidated: r.timeValidated,
    });
  }
});

const validatedDistribution =
  Object.entries(
    validatedDistributionMap
  ).map(([name, count]) => ({
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
    }));
        const validatedAverages =
      Object.entries(
        validatedAvgMap
      ).map(([name, values]) => ({
        name,
        avgMinutes:
          values.length > 0
            ? Math.round(
                values.reduce(
                  (sum, v) =>
                    sum + v,
                  0
                ) / values.length
              )
            : 0,
   }));

/* =========================
   ENTERED (enteredBy)
========================= */

const enteredRows = rows.filter(
  (r) =>
    r.enteredBy &&
    r.timeValidated &&
    r.enteredTime
);

const totalEntered = enteredRows.length;

const enteredDistributionMap = {};
const enteredAvgMap = {};
const enteredTimelines = {};

enteredRows.forEach((r) => {
  const user = r.enteredBy || "Unknown";

  enteredDistributionMap[user] =
    (enteredDistributionMap[user] || 0) + 1;

  const mins = minutesDiff(
    r.timeValidated,
    r.enteredTime
  )

  if (mins != null) {
    if (!enteredAvgMap[user]) {
      enteredAvgMap[user] = [];
    }

    enteredAvgMap[user].push(mins);

    if (!enteredTimelines[user]) {
      enteredTimelines[user] = [];
    }

    enteredTimelines[user].push({
      x: r.diagnosticNo || r.regNo,
      regNo: r.regNo,
      diagnosticNo: r.diagnosticNo || "NA",
      name: r.name,
      test: r.test,
      selectedTests: r.selectedTests || [],
      duration: mins,
      timeValidated: r.timeValidated,
      enteredTime: r.enteredTime,
    });
  }
});

const enteredDistribution = Object.entries(
  enteredDistributionMap
).map(([name, count]) => ({
  name,
  count,
  percentage:
    totalEntered > 0
      ? Number(
          ((count / totalEntered) * 100).toFixed(1)
        )
      : 0,
}));

const enteredAverages = Object.entries(
  enteredAvgMap
).map(([name, values]) => ({
  name,
  avgMinutes:
    values.length > 0
      ? Math.round(
          values.reduce(
            (sum, v) => sum + v,
            0
          ) / values.length
        )
      : 0,
}));

return {
  testing: {
    totalSaved,
    distribution,
    averages,
    timelines,
  },

  validated: {
    totalValidated,
    distribution: validatedDistribution,
    averages: validatedAverages,
    timelines: validatedTimelines,
  },
  entered: {
    totalEntered,
    distribution: enteredDistribution,
    averages: enteredAverages,
    timelines: enteredTimelines,
  },
};

   
}

/* ================= SUBSCRIBE OVERVIEW =================== */

export function subscribeOverview({ onData, source = "All", dateRange }) {
  const { paintCache, onDataLive, setSourceKey } = createOwnerSessionPaint({
    dept: "urine",
    dateRange,
    source,
    onData,
  });
  paintCache();

  let currentSource = source ?? "All";

  const masterRef = scopedTimePrintedQuery("master_register", dateRange);
  const urineRef = scopedTimePrintedQuery("urine_analysis_register", dateRange);
  if (!masterRef || !urineRef) {
    const empty = () => {};
    empty.updateSource = () => {};
    return empty;
  }
  
  let masterRows = []; let urineRows = [];

  const publish = () => {
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
    const filteredUrine = urineRows.filter(filterFn);

    const merged = mergeDeptRows(filteredUrine);
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

  const unsubMaster = subscribeSharedMasterRegister(dateRange, (snap) => { masterRows = snap.docs.map(d => ({ id: d.id, ...d.data() })); publish(); });
  const unsubUrine = onSnapshot(urineRef, (snap) => { urineRows = snap.docs.map(d => ({ id: d.id, ...d.data() })); publish(); });

  return withOwnerSourceControl(
    () => { unsubMaster?.(); unsubUrine?.(); },
    {
      getSource: () => currentSource,
      setSource: (next) => { currentSource = next; },
      publish,
      setSourceKey,
    }
  );
}

export function unifyForCharts(rows = []) {
  return rows.map((r) => ({
    ...r,
    regNo: r.diagnosticNo, // Use diagnosticNo as primary label for charts/TimeBricks
    patientName: r.name,
    tests: r.selectedTests,
  }));
}

export async function fetchTestTimings() { return testTimings || {}; }