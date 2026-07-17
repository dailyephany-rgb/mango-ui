
// ------------------------------------------------------
// src/owner/lib/dataFetcher_urine.js
// Urine Analysis — Analytics Data Fetcher (STRICT + MULTI-COUNT FIX)
// ------------------------------------------------------

import { db } from "../../firebaseConfig.js";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import testTimings from "../data/test_timings.json";

/* ====================== DATE UTILS ====================== */

export const toDate = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

export const minutesDiff = (a, b) => {
  const A = toDate(a);
  const B = toDate(b);
  return A && B && B > A ? Math.round((B - A) / 60000) : null;
};

/* ================= TEST NORMALIZATION =================== */

export function normalizeTestsField(field) {
  if (!field) return [];
  if (Array.isArray(field)) {
    return field
      .map((v) => {
        if (typeof v === "string") return v;
        if (v && typeof v === "object") return v.test || v.name || v.testName || null;
        return null;
      })
      .filter(Boolean)
      .map((s) => String(s).trim());
  }
  if (typeof field === "string") return field.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

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
        timeValidated: toDate(r.validatedTime || r.timeValidated),
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
  const buildAnalytics = (
    rows,
    staffField,
    startField,
    endField
  ) => {
    const map = {};

    rows.forEach((r) => {
      const staff =
        r?.[staffField]?.trim?.();

      if (!staff) return;

      if (!map[staff]) {
        map[staff] = {
          count: 0,
          durations: [],
          timeline: [],
        };
      }

      map[staff].count++;

      const mins = minutesDiff(
        r[startField],
        r[endField]
      );

      if (mins != null) {
        map[staff].durations.push(
          mins
        );
      }

      const t = toDate(
        r[endField]
      );

      if (t) {
        const hour =
          t.getHours();

        map[staff].timeline.push(
          hour
        );
      }
    });

    return {
      distribution:
        Object.entries(map).map(
          ([name, v]) => ({
            name,
            value: v.count,
          })
        ),

      averages:
        Object.entries(map).map(
          ([name, v]) => ({
            name,
            value:
              v.durations.length
                ? Math.round(
                    v.durations.reduce(
                      (a, b) =>
                        a + b,
                      0
                    ) /
                      v.durations
                        .length
                  )
                : null,
          })
        ),

      timelines:
        Object.fromEntries(
          Object.entries(map).map(
            ([name, v]) => [
              name,
              v.timeline,
            ]
          )
        ),
    };
  };

  return {
    testing: buildAnalytics(
      rows,
      "savedBy",
      "timeScanned",
      "timeSaved"
    ),

    validated:
      buildAnalytics(
        rows,
        "validatedBy",
        "timeSaved",
        "timeValidated"
      ),

    entered: buildAnalytics(
      rows,
      "enteredBy",
      "timeValidated",
      "timeEntered"
    ),
  };
}

/* ================= SUBSCRIBE OVERVIEW =================== */

export function subscribeOverview({ onData, source = "All", dateRange }) {
  const masterRef = query(collection(db, "master_register"), orderBy("timePrinted", "asc"));
  const urineRef = query(collection(db, "urine_analysis_register"), orderBy("timePrinted", "asc"));
  
  let masterRows = []; let urineRows = [];

  const publish = () => {
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
    const filteredUrine = urineRows.filter(filterFn);

    const merged = mergeDeptRows(filteredUrine);
    const unified = unifyForCharts(merged);
    const violators = computeSLAViolations(unified, testTimings);

    onData({
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

  const unsubMaster = onSnapshot(masterRef, (snap) => { masterRows = snap.docs.map(d => ({ id: d.id, ...d.data() })); publish(); });
  const unsubUrine = onSnapshot(urineRef, (snap) => { urineRows = snap.docs.map(d => ({ id: d.id, ...d.data() })); publish(); });

  return () => { unsubMaster?.(); unsubUrine?.(); };
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