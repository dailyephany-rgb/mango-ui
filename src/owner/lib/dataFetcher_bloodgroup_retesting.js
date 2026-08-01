
// ------------------------------------------------------
// Blood Group Retesting — STRICT Time Printed Implementation
// ------------------------------------------------------

import { db } from "../../firebaseConfig.js";
import { scopedTimePrintedQuery } from "../../shared/firestore/scopedTimePrintedQuery.js";
import { createOwnerSessionPaint } from "../../shared/cache/createOwnerSessionPaint.js";
import { trackedOnSnapshot as onSnapshot } from "../../shared/firestore/trackedFirestore.js";
import testTimings from "../data/test_timings.json";

/* ====================== DATE UTILS ====================== */

import { toDate, minutesDiff } from "../../shared/utils/dates.js";
import { normalizeTestsField } from "../../shared/utils/normalizeTestsField.js";
export { toDate, minutesDiff, normalizeTestsField };

/* ================= BLOOD GROUP CANON TESTS =================== */

const BG_TESTS_CANON = ["ABO GROUP & RH TYPE"];

const normalizeBG = (s = "") =>
  String(s).toLowerCase().replace(/[\s,._\-()]+/g, " ").trim();

export function isBloodGroupTest(testName) {
  if (!testName) return false;
  const normTest = normalizeBG(testName);
  return BG_TESTS_CANON.some((canonical) => {
    const target = normalizeBG(canonical);
    return normTest.includes(target) || target.includes(normTest);
  });
}

export const extractBloodGroupTestCount = (record) => {
  const rawTests = normalizeTestsField(record.selectedTests || record.tests || record.test || []);
  const hasMatch = rawTests.some(testName => isBloodGroupTest(testName));
  return (hasMatch || record.regNo) ? 1 : 0;
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

    const key = `${regId}_${diagNo}_bloodgroup`;
    if (!out[key]) {
      out[key] = {
        regNo: regId,
        diagnosticNo: diagNo, 
        name: r.name || r.patientName || "",
        department: "Blood Group",
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

/* ================= SLA VIOLATIONS (STRICT ROUNDING) ======================= */

export function computeSLAViolations(unifiedRows, timingMap, stage = "scanned_to_saved") {
  const violators = [];
  unifiedRows.forEach((row) => {
    const allowed = timingMap["bloodgroup"]?.[stage] ?? timingMap.default?.[stage] ?? 30;
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
        department: "Blood Group",
      
        savedBy:
          row.savedBy || "NA",
      
        validatedBy:
          row.validatedBy || "NA",
      
        timeScanned:
          row.timeScanned,
      
        timeSaved:
          row.timeSaved,
      
        timeValidated:
          row.timeValidated,
      });
    }
  });
  return violators.sort((a, b) => b.excess - a.excess);
}

/* ================= KPI COMPUTATION ====================== */

export function computeKPIs(masterRows = [], bgRows = []) {
  const masterBG = masterRows.filter((m) => {
    const tests = normalizeTestsField(m.selectedTests || m.tests || m.test || []);
    return tests.some(isBloodGroupTest);
  });

  const totalPatientsCollected = new Set(masterBG.map((m) => `${m.regNo}_${m.diagnosticNo || m.billNo || "NA"}`)).size;
  const totalTestsCollected = masterBG.reduce((sum, m) => sum + extractBloodGroupTestCount(m), 0);
  
  const savedRows = bgRows.filter(r => r.isSaved);
  const totalPatientsSaved = new Set(savedRows.map((r) => `${r.regNo}_${r.diagnosticNo}`)).size;
  const totalTestsSaved = savedRows.reduce((sum, r) => sum + extractBloodGroupTestCount(r), 0);
  
  const validatedRows = bgRows.filter((r) => r.isValidated);
  const totalPatientsValidated = new Set(validatedRows.map((r) => `${r.regNo}_${r.diagnosticNo}`)).size;
  
  const averages = { 
    printedToCollected: [], 
    collectedToScanned: [], 
    scannedToSaved: [], 
    savedToValidated: [],
    collectedToValidated: [] 
  };
  
  let slowestEntry = null;

  bgRows.forEach((r) => {
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

    if (C != null && (!slowestEntry || C > slowestEntry.delay)) {
      slowestEntry = {
        regNo: r.regNo,
        delay: C,
        patientName: r.name || "",
        tests: r.selectedTests || [],
      };
    }
  });

  const avg = (arr) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;

  return {
    totalPatientsCollected, totalTestsCollected, totalPatientsSaved, totalPatientsValidated,
    totalTestsSaved, totalPatientsPendingScans: Math.max(0, totalPatientsCollected - totalPatientsSaved),
    totalTestsPending: Math.max(0, totalTestsCollected - totalTestsSaved),
    avgPrintedToCollected: avg(averages.printedToCollected),
    avgCollectedToScanned: avg(averages.collectedToScanned),
    avgScannedToSaved: avg(averages.scannedToSaved),
    avgSavedToValidated: avg(averages.savedToValidated),
    avgTurnaroundTime: avg(averages.collectedToValidated),
    slowestEntry,
  };
}


/* ================= STAFF ANALYTICS ====================== */

export function computeStaffAnalytics(rows = []) {

  /* =========================
     TESTING
  ========================= */

  const savedRows = rows.filter(
    (r) => r.savedBy && r.timeScanned && r.timeSaved
  );

  const totalSaved = savedRows.length;
  const distributionMap = {};
  const avgMap = {};
  const timelines = {};

  savedRows.forEach((r) => {
    const user = r.savedBy.trim();

    distributionMap[user] =
      (distributionMap[user] || 0) + 1;

    const mins = minutesDiff(
      r.timeScanned,
      r.timeSaved
    );

    if (mins != null) {
      if (!avgMap[user]) avgMap[user] = [];
      avgMap[user].push(mins);

      if (!timelines[user]) timelines[user] = [];

      timelines[user].push({
        x: r.diagnosticNo || r.regNo,
        regNo: r.regNo,
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

  const distribution = Object.entries(distributionMap)
    .map(([name, count]) => ({
      name,
      count,
      percentage:
        totalSaved > 0
          ? Number(((count / totalSaved) * 100).toFixed(1))
          : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const averages = Object.entries(avgMap).map(
    ([name, values]) => ({
      name,
      avgMinutes:
        values.length > 0
          ? Math.round(
              values.reduce((s, v) => s + v, 0) /
                values.length
            )
          : 0,
    })
  );

  /* =========================
     VALIDATED
  ========================= */

  const validatedRows = rows.filter(
    (r) =>
      r.validatedBy &&
      r.timeSaved &&
      r.timeValidated
  );

  const totalValidated = validatedRows.length;
  const validatedDistributionMap = {};
  const validatedAvgMap = {};
  const validatedTimelines = {};

  validatedRows.forEach((r) => {
    const user = r.validatedBy.trim();

    validatedDistributionMap[user] =
      (validatedDistributionMap[user] || 0) + 1;

    const mins = minutesDiff(
      r.timeSaved,
      r.timeValidated
    );

    if (mins != null) {
      if (!validatedAvgMap[user])
        validatedAvgMap[user] = [];

      validatedAvgMap[user].push(mins);

      if (!validatedTimelines[user])
        validatedTimelines[user] = [];

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

  const validatedDistribution = Object.entries(
    validatedDistributionMap
  )
    .map(([name, count]) => ({
      name,
      count,
      percentage:
        totalValidated > 0
          ? Number(
              ((count / totalValidated) * 100).toFixed(1)
            )
          : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const validatedAverages = Object.entries(
    validatedAvgMap
  ).map(([name, values]) => ({
    name,
    avgMinutes:
      values.length > 0
        ? Math.round(
            values.reduce((s, v) => s + v, 0) /
              values.length
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
      totalEntered: 0,
      distribution: [],
      averages: [],
      timelines: {},
    },
  };
}


/* ================= SUBSCRIBE OVERVIEW =================== */

export function subscribeOverview({ onData, source = "All", dateRange }) {
  const { paintCache, onDataLive } = createOwnerSessionPaint({
    dept: "bloodgroup_retesting",
    dateRange,
    source,
    onData,
  });
  paintCache();

  const masterRef = scopedTimePrintedQuery("master_register", dateRange);
  const bgRef = scopedTimePrintedQuery("bloodgroup_retesting_register", dateRange);
  if (!masterRef || !bgRef) {
    return () => {};
  }
  
  let masterRows = []; let bgRows = [];

  const publish = () => {
    // UPDATED: Strict IST Midnight strings
    const from = dateRange?.from ? new Date(dateRange.from + "T00:00:00") : null;
    const to = dateRange?.to ? new Date(dateRange.to + "T23:59:59") : null;

    const filterFn = (row) => {
      const t = toDate(row.timePrinted);
      if (!t) return false;
      if (from && t < from) return false;
      if (to && t > to) return false;

      const normSource = source && source !== "All" ? source.trim().toUpperCase() : null;
      if (normSource) {
        const rowSource = (row.source || "").trim().toUpperCase();
        if (rowSource !== normSource) return false;
      }
      return true;
    };

    const filteredMaster = masterRows.filter(filterFn);
    const filteredBG = bgRows.filter(filterFn);

    const merged = mergeDeptRows(filteredBG);
    const unified = unifyForCharts(merged);
    
      const violators =
        computeSLAViolations(
          unified,
          testTimings
        );
  
      const staffAnalytics =
        computeStaffAnalytics(
          merged
        );
  
        onDataLive({
          masterRows:
            filteredMaster,
        
          deptRows:
            merged,
        
          unifiedRows:
            unified,
        
          violators,
        
          kpis:
            computeKPIs(
              filteredMaster,
              merged
            ),
        
          staffAnalytics,
        });
  };

  const unsubMaster = onSnapshot(masterRef, (snap) => { masterRows = snap.docs.map(d => ({ id: d.id, ...d.data() })); publish(); });
  const unsubBG = onSnapshot(bgRef, (snap) => { bgRows = snap.docs.map(d => ({ id: d.id, ...d.data() })); publish(); });

  return () => { unsubMaster?.(); unsubBG?.(); };
}

export function unifyForCharts(rows = []) {
  return rows.map((r) => ({
    ...r,
    regNo: r.diagnosticNo, // UPDATED: Maps diagnosticNo to regNo key for TimeBricks display
    patientName: r.name,
    tests: r.selectedTests,
  }));
}

export async function fetchTestTimings() { return testTimings || {}; }