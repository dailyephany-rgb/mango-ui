
// ------------------------------------------------------
// ESR Analysis — ALIGNED WITH HORMONES LOGIC
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

/* ================= ESR CANON TESTS =================== */
const ESR_TESTS_CANON = ["ESR"];

// CHANGED TO UPPERCASE TO MATCH HORMONES LOGIC
const normalizeESR = (s = "") =>
  String(s).toUpperCase().replace(/[\s,._\-()]+/g, " ").trim();

export function isESRTest(testName) {
  if (!testName) return false;
  const normTest = normalizeESR(testName);
  return ESR_TESTS_CANON.some((canonical) => {
    const target = normalizeESR(canonical);
    return normTest.includes(target) || target.includes(normTest);
  });
}

export const extractESRTestCount = (record) => {
  const rawTests = normalizeTestsField(record.selectedTests || record.tests || record.test || []);
  return rawTests.filter(isESRTest).length > 0 ? 1 : 0;
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

    // FIXED KEY: Match Hormones structure (RegNo + DiagNo)
    const key = `${regId}_${diagNo}_esr`;
    if (!out[key]) {
      out[key] = {
        regNo: regId,
        diagnosticNo: diagNo,
        name: r.name || r.patientName || "",
        department: "ESR",
        source: r.source || "",
        timePrinted: printedDate, 
        timeCollected: toDate(r.timeCollected),
        timeScanned: toDate(r.scannedTime || r.timeScanned),
        timeSaved: toDate(r.savedTime || r.timeSaved),
        savedBy: r.savedBy || "",
        timeValidated: toDate(r.validatedTime || r.timeValidated),
        validatedBy: r.validatedBy || "",
        isSaved: r.saved === "Yes" || !!(r.savedTime || r.timeSaved),
        isValidated: r.validated === true || r.status === "validated" || !!(r.validatedTime || r.timeValidated),
        enteredBy: r.enteredBy || "", enteredTime: toDate( r.enteredTime),
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
    const allowed = timingMap["esr"]?.[stage] ?? timingMap.default?.[stage] ?? 30;
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
        department: "ESR",
      
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
export function computeKPIs(masterRows = [], esrRows = []) {
  const masterESR = masterRows.filter((m) => {
    const tests = normalizeTestsField(m.selectedTests || m.tests || m.test || []);
    return tests.some(isESRTest);
  });

  // Aligned with Hormones Set logic
  const totalPatientsCollected = new Set(masterESR.map((m) => `${m.regNo}_${m.diagnosticNo || m.billNo || "NA"}`)).size;
  const totalTestsCollected = masterESR.reduce((sum, m) => sum + extractESRTestCount(m), 0);
  
  const savedRows = esrRows.filter(r => r.isSaved);
  const totalPatientsSaved = new Set(savedRows.map((r) => `${r.regNo}_${r.diagnosticNo}`)).size;
  const totalTestsSaved = savedRows.reduce((sum, r) => sum + extractESRTestCount(r), 0);
  
  const validatedRows = esrRows.filter((r) => r.isValidated);
  const totalPatientsValidated = new Set(validatedRows.map((r) => `${r.regNo}_${r.diagnosticNo}`)).size;

  const totalPatientsCritical = esrRows.filter(r => r.isCritical).length;
  
  const averages = { 
    printedToCollected: [], 
    collectedToScanned: [], 
    scannedToSaved: [], 
    savedToValidated: [],
    collectedToValidated: [] 
  };

  esrRows.forEach((r) => {
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

/* ================= SUBSCRIBE OVERVIEW =================== */
export function subscribeOverview({ onData, source = "All", dateRange }) {
  const { paintCache, onDataLive, setSourceKey } = createOwnerSessionPaint({
    dept: "esr",
    dateRange,
    source,
    onData,
  });
  paintCache();

  let currentSource = source ?? "All";

  const masterRef = scopedTimePrintedQuery("master_register", dateRange);
  const esrRef = scopedTimePrintedQuery("esr_register", dateRange);
  if (!masterRef || !esrRef) {
    const empty = () => {};
    empty.updateSource = () => {};
    return empty;
  }
  
  let masterRows = []; let esrRows = [];

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
    const filteredESR = esrRows.filter(filterFn);

    const merged = mergeDeptRows(filteredESR);
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
  const unsubESR = onSnapshot(esrRef, (snap) => { 
    esrRows = snap.docs.map(d => ({ id: d.id, ...d.data() })); 
    console.log("DEBUG: Raw ESR documents from Firestore:", esrRows.length, esrRows);
    publish(); 
  });

  return withOwnerSourceControl(
    () => { unsubMaster?.(); unsubESR?.(); },
    {
      getSource: () => currentSource,
      setSource: (next) => { currentSource = next; },
      publish,
      setSourceKey,
    }
  );
}

export function unifyForCharts(rows = []) {
  return rows.map((r) => ({ ...r, patientName: r.name, tests: r.selectedTests }));
}

export function computeStaffAnalytics(
  rows = []
) {
  /* =========================
     TESTING (savedBy)
  ========================= */

  const savedRows = rows.filter(
    (r) =>
      r.savedBy &&
      r.timeScanned &&
      r.timeSaved
  );

  const totalSaved =
    savedRows.length;

  const distributionMap =
    {};

  const avgMap = {};

  const timelines = {};

  savedRows.forEach((r) => {
    const staff =
      r.savedBy.trim();

    if (!staff) return;

    distributionMap[
      staff
    ] =
      (distributionMap[
        staff
      ] || 0) + 1;

    const duration =
      minutesDiff(
        r.timeScanned,
        r.timeSaved
      );

    if (
      duration != null
    ) {
      if (
        !avgMap[
          staff
        ]
      ) {
        avgMap[
          staff
        ] = [];
      }

      avgMap[
        staff
      ].push(
        duration
      );

      if (
        !timelines[
          staff
        ]
      ) {
        timelines[
          staff
        ] = [];
      }

      timelines[staff].push({
        x: r.diagnosticNo || r.regNo,
        regNo: r.regNo,
        diagnosticNo: r.diagnosticNo || "NA",
        name: r.name,
        test: r.test,
        selectedTests: r.selectedTests || [],
        duration,
        timeScanned: r.timeScanned,
        timeSaved: r.timeSaved,
      });
    }
  });

  const distribution =
    Object.entries(
      distributionMap
    )
      .map(
        ([
          name,
          count,
        ]) => ({
          name,
          count,
          percentage:
            totalSaved
              ? Math.round(
                  (count /
                    totalSaved) *
                    100
                )
              : 0,
        })
      )
      .sort(
        (a, b) =>
          b.count -
          a.count
      );

  const averages =
    Object.entries(
      avgMap
    ).map(
      ([
        name,
        values,
      ]) => ({
        name,
        avgMinutes:
          Math.round(
            values.reduce(
              (
                s,
                v
              ) =>
                s + v,
              0
            ) /
              values.length
          ),
      })
    );

  /* =========================
     VALIDATED (validatedBy)
  ========================= */

  const validatedRows =
    rows.filter(
      (r) =>
        r.validatedBy &&
        r.timeSaved &&
        r.timeValidated
    );

  const totalValidated =
    validatedRows.length;

  const validatedDistributionMap =
    {};

  const validatedAvgMap =
    {};

  const validatedTimelines =
    {};

  validatedRows.forEach(
    (r) => {
      const staff =
        r.validatedBy.trim();

      if (!staff)
        return;

      validatedDistributionMap[
        staff
      ] =
        (validatedDistributionMap[
          staff
        ] ||
          0) + 1;

      const duration =
        minutesDiff(
          r.timeSaved,
          r.timeValidated
        );

      if (
        duration !=
        null
      ) {
        if (
          !validatedAvgMap[
            staff
          ]
        ) {
          validatedAvgMap[
            staff
          ] = [];
        }

        validatedAvgMap[
          staff
        ].push(
          duration
        );

        if (
          !validatedTimelines[
            staff
          ]
        ) {
          validatedTimelines[
            staff
          ] = [];
        }

        validatedTimelines[staff].push({
          x: r.diagnosticNo || r.regNo,
          regNo: r.regNo,
          diagnosticNo: r.diagnosticNo || "NA",
          name: r.name,
          test: r.test,
          selectedTests: r.selectedTests || [],
          duration,
          timeSaved: r.timeSaved,
          timeValidated: r.timeValidated,
        });
      }
    }
  );

  const validatedDistribution =
    Object.entries(
      validatedDistributionMap
    )
      .map(
        ([
          name,
          count,
        ]) => ({
          name,
          count,
          percentage:
            totalValidated
              ? Math.round(
                  (count /
                    totalValidated) *
                    100
                )
              : 0,
        })
      )
      .sort(
        (a, b) =>
          b.count -
          a.count
      );

  const validatedAverages =
    Object.entries(
      validatedAvgMap
    ).map(
      ([
        name,
        values,
      ]) => ({
        name,
        avgMinutes:
          Math.round(
            values.reduce(
              (
                s,
                v
              ) =>
                s + v,
              0
            ) /
              values.length
          ),
      })
    );

  /* =========================
     ENTERED (enteredBy)
  ========================= */

  const enteredRows =
    rows.filter(
      (r) =>
        r.enteredBy &&
        r.timeValidated &&
        r.enteredTime
    );

  const totalEntered =
    enteredRows.length;

  const enteredDistributionMap =
    {};

  const enteredAvgMap =
    {};

  const enteredTimelines =
    {};

  enteredRows.forEach(
    (r) => {
      const staff =
        r.enteredBy.trim();

      if (!staff)
        return;

      enteredDistributionMap[
        staff
      ] =
        (enteredDistributionMap[
          staff
        ] ||
          0) + 1;

      const duration =
        minutesDiff(
          r.timeValidated,
          r.enteredTime
        );

      if (
        duration !=
        null
      ) {
        if (
          !enteredAvgMap[
            staff
          ]
        ) {
          enteredAvgMap[
            staff
          ] = [];
        }

        enteredAvgMap[
          staff
        ].push(
          duration
        );

        if (
          !enteredTimelines[
            staff
          ]
        ) {
          enteredTimelines[
            staff
          ] = [];
        }

        enteredTimelines[staff].push({
          x: r.diagnosticNo || r.regNo,
          regNo: r.regNo,
          diagnosticNo: r.diagnosticNo || "NA",
          name: r.name,
          test: r.test,
          selectedTests: r.selectedTests || [],
          duration,
          timeValidated: r.timeValidated,
          enteredTime: r.enteredTime,
        });
      }
    });
 
  const enteredDistribution =
    Object.entries(
      enteredDistributionMap
    )
      .map(
        ([
          name,
          count,
        ]) => ({
          name,
          count,
          percentage:
            totalEntered
              ? Math.round(
                  (count /
                    totalEntered) *
                    100
                )
              : 0,
        })
      )
      .sort(
        (a, b) =>
          b.count -
          a.count
      );

  const enteredAverages =
    Object.entries(
      enteredAvgMap
    ).map(
      ([
        name,
        values,
      ]) => ({
        name,
        avgMinutes:
          Math.round(
            values.reduce(
              (
                s,
                v
              ) =>
                s + v,
              0
            ) /
              values.length
          ),
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

export async function fetchTestTimings() { return testTimings || {}; }