
// ------------------------------------------------------
// Biochemistry (Main) — FULL IMPLEMENTATION
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
import biochemRouting from "../../biochem_testRouting.json";

/* ====================== DATE UTILS ====================== */

import { toDate, minutesDiff } from "../../shared/utils/dates.js";
import { normalizeTestsField } from "../../shared/utils/normalizeTestsField.js";
export { toDate, minutesDiff, normalizeTestsField };

/* ================= BIOCHEM MAIN TESTS =================== */

const BIOCHEM_MAIN_TESTS_CANON = Array.isArray(
  biochemRouting?.MainAnalyzer?.tests
)
  ? biochemRouting.MainAnalyzer.tests
  : [];

const normalizeBiochem = (s = "") =>
  String(s).toLowerCase().replace(/[\s,._\-()]+/g, " ").replace(/fluid/g, "").trim();

  export function isBiochemMainTest(testName) {
    if (!testName) return false;
  
    const normTest = normalizeBiochem(testName);
  
    return BIOCHEM_MAIN_TESTS_CANON.some((canonical) => {
      const target = normalizeBiochem(canonical);
      return normTest === target || normTest.includes(target);
    });
  }

export const extractBiochemMainTestCount = (record) => {
  const tests = normalizeTestsField(record.selectedTests || record.tests || record.test || []);
  return tests.filter(isBiochemMainTest).length;
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

    // Unique key combines RegNo and diagnosticNo
    const key = `${regId}_${diagNo}_biochem_main`;
    if (!out[key]) {
      out[key] = {
        regNo: regId,
        diagnosticNo: diagNo,
        name: r.name || r.patientName || "",
        department: "biochem_main",
        source: r.source || "",
    
        timePrinted: printedDate,
        timeCollected: toDate(r.timeCollected),
        timeScanned: toDate(r.scannedTime || r.timeScanned),
        timeSaved: toDate(r.savedTime || r.timeSaved),
        timeValidated: toDate(r.validatedTime || r.timeValidated),
    
        // NEW
        timeEntered: toDate(
          r.enteredTime || r.timeEntered
        ),
          
        isEntered:
          r.entered === true ||
          !!(r.enteredTime || r.timeEntered),
    
        isSaved:
          r.saved === "Yes" ||
          !!(r.savedTime || r.timeSaved),
    
        isValidated:
          r.validated === true ||
          r.status === "validated" ||
          !!(r.validatedTime || r.timeValidated),
    
        isCritical:
          r.critical === "Yes",
    
        // NEW
        savedBy: r.savedBy || "",
        validatedBy: r.validatedBy || "",
        enteredBy: r.enteredBy || "",
    
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
    const allowed = timingMap["biochem"]?.[stage] ?? timingMap.default?.[stage] ?? 30;
    let start = null;
    let end = null;
    
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
        end = toDate(row.timeEntered);
        break;

        case "turnaround":
        start = toDate(row.timeCollected);
        end = toDate(row.timeValidated);
        break;
    
      default:
        return;
    }
    
    if (!start || !end) return;
    
    const duration = Math.round(
      (end - start) / 60000
    );
    
    if (duration > allowed) {
      const excess = duration - allowed; 
      const status = duration <= allowed * 1.5 ? "borderline" : "violation";
      
      violators.push({
        ...slaTimestampFields(row),
        regNo: row.regNo,
        diagnosticNo: row.diagnosticNo,
        name: row.name,
        test: row.test,
        duration: duration, 
        excess: Math.round(excess), 
        allowed, 
        status,
        department: "biochem_main",
        timeScanned: row.timeScanned,
        timeSaved: row.timeSaved,
        savedBy: row.savedBy || "NA",
        validatedBy: row.validatedBy || "NA",
        enteredBy: row.enteredBy || "NA",
      });
    }
  });
  return violators.sort((a, b) => b.excess - a.excess);
}

/* ================= KPI COMPUTATION ====================== */

export function computeKPIs(masterRows = [], biochemRows = []) {
  const masterBiochem = masterRows.filter((m) => {
    const tests = normalizeTestsField(m.selectedTests || m.tests || m.test || []);
    return tests.some(isBiochemMainTest);
  });

  const totalPatientsCollected = new Set(masterBiochem.map((m) => `${m.regNo}_${m.diagnosticNo || m.billNo || "NA"}`)).size;
  const totalTestsCollected = masterBiochem.reduce((sum, m) => sum + extractBiochemMainTestCount(m), 0);
  
  const savedRows = biochemRows.filter(r => r.isSaved);
  const totalPatientsSaved = new Set(savedRows.map((r) => `${r.regNo}_${r.diagnosticNo}`)).size;
  const totalTestsSaved = savedRows.reduce((sum, r) => sum + extractBiochemMainTestCount(r), 0);
  
  const validatedRows = biochemRows.filter((r) => r.isValidated);
  const totalPatientsValidated = new Set(validatedRows.map((r) => `${r.regNo}_${r.diagnosticNo}`)).size;

  const totalPatientsCritical = biochemRows.filter(r => r.isCritical).length;
  
  const averages = { 
    printedToCollected: [], 
    collectedToScanned: [], 
    scannedToSaved: [], 
    savedToValidated: [],
    collectedToValidated: [] 
  };

  biochemRows.forEach((r) => {
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
    avgTurnaroundTime: avg(averages.collectedToValidated), 
    avgPrintedToCollected: avg(averages.printedToCollected),
    avgCollectedToScanned: avg(averages.collectedToScanned),
    avgScannedToSaved: avg(averages.scannedToSaved),
    avgSavedToValidated: avg(averages.savedToValidated),
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
    (r.isEntered || r.timeEntered)
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
    r.timeEntered
  );

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
      timeEntered: r.timeEntered,
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
    dept: "biochem",
    dateRange,
    source,
    onData,
  });
  paintCache();

  let currentSource = source ?? "All";

  const masterRef = scopedTimePrintedQuery("master_register", dateRange);
  const biochemRef = scopedTimePrintedQuery("biochemistry_register", dateRange);
  if (!masterRef || !biochemRef) {
    const empty = () => {};
    empty.updateSource = () => {};
    return empty;
  }
  
  let masterRows = []; let biochemRows = [];

  const runPublish = () => {
    // UPDATED: Using T00:00:00 to ensure filtering is based on Local Time (IST) 
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
    const filteredBiochem = biochemRows.filter(filterFn);
    const merged = mergeDeptRows(filteredBiochem);
    const unified = unifyForCharts(merged);
    const violators = computeSLAViolations(unified, testTimings);

    onDataLive({
      masterRows: filteredMaster,
      deptRows: merged,
      unifiedRows: unified,
      violators,
      kpis: computeKPIs(filteredMaster, merged),
      staffAnalytics: computeStaffAnalytics(merged),
    });
  };

  const { publish, publishNow, cancel } = createDebouncedPublish(runPublish, 75);

  const unsubMaster = subscribeSharedMasterRegister(dateRange, (snap) => { masterRows = snap.docs.map(d => ({ id: d.id, ...d.data() })); publish(); });
  const unsubBiochem = onSnapshot(biochemRef, (snap) => { biochemRows = snap.docs.map(d => ({ id: d.id, ...d.data() })); publish(); });

  return withOwnerSourceControl(
    () => { cancel(); unsubMaster?.(); unsubBiochem?.(); },
    {
      getSource: () => currentSource,
      setSource: (next) => { currentSource = next; },
      publish: publishNow,
      setSourceKey,
    }
  );
}

export function unifyForCharts(rows = []) {
  return rows.map((r) => ({ ...r, patientName: r.name, tests: r.selectedTests }));
}

export async function fetchTestTimings() { return testTimings || {}; }