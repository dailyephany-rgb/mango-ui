
// ------------------------------------------------------
// Serology Analytics — Production Ready (Strict Implementation)
// ------------------------------------------------------

import { db } from "../../firebaseConfig.js";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import backroomRouting from "../../backroom_routing.json";
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

/* ================= SEROLOGY CANON TESTS =================== */

const SEROLOGY_TESTS_CANON = Array.isArray(backroomRouting?.SerologyRegister)
  ? backroomRouting.SerologyRegister
  : [
  "HBSAG CARD",
    "HCV (SERUM) CARD",
    "HIV I & II (QUANTITATIVE) CARD",
    "VDRL (SERUM)",
    "OCCULT BLOOD" 
  ];

const normalizeSerology = (s = "") =>
  String(s).toUpperCase().replace(/[\s,._\-()]+/g, " ").trim();

export function isSerologyTest(testName) {
  if (!testName) return false;
  const normTest = normalizeSerology(testName);

  const overlaps = ["HBSAG", "HIV", "HCV", "TROP T"];
  const isOverlapCandidate = overlaps.some(o => normTest.includes(o));
  
  if (isOverlapCandidate && !normTest.includes("CARD")) {
    return false;
  }

  return SEROLOGY_TESTS_CANON.some((canonical) => {
    const target = normalizeSerology(canonical);
    return normTest === target || normTest.includes(target);
  });
}

export const extractSerologyTestCount = (record) => {
  const rawTests = normalizeTestsField(record.selectedTests || record.tests || record.test || []);
  const matchingTests = rawTests.filter(testName => isSerologyTest(testName));
  return matchingTests.length; 
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
    const key = `${regId}_${diagNo}_serology`;
    if (!out[key]) {
      out[key] = {
        regNo: regId,
        diagnosticNo: diagNo,
        name: r.name || r.patientName || "",
        department: "Serology",
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
    const allowed = timingMap["serology"]?.[stage] ?? timingMap.default?.[stage] ?? 30;
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
          end = toDate(row.enteredTime);
          break;

        default:
          return;
      }

      if (!start || !end)
        return;

      const duration =
        Math.round(
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
        department: "Serology",
      
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

export function computeKPIs(masterRows = [], serologyRows = []) {
  const masterSerology = masterRows.filter((m) => {
    const tests = normalizeTestsField(m.selectedTests || m.tests || m.test || []);
    return tests.some(isSerologyTest);
  });

  // UPDATE: Unique diagnosticNo-based visits
  const totalPatientsCollected = new Set(masterSerology.map((m) => `${m.regNo}_${m.diagnosticNo || m.billNo || "NA"}`)).size;
  const totalTestsCollected = masterSerology.reduce((sum, m) => sum + extractSerologyTestCount(m), 0);
  
  const savedRows = serologyRows.filter(r => r.isSaved);
  const totalPatientsSaved = new Set(savedRows.map((r) => `${r.regNo}_${r.diagnosticNo}`)).size;
  const totalTestsSaved = savedRows.reduce((sum, r) => sum + extractSerologyTestCount(r), 0);

  const validatedRows = serologyRows.filter((r) => r.isValidated);
  const totalPatientsValidated = new Set(validatedRows.map((r) => `${r.regNo}_${r.diagnosticNo}`)).size;

  const totalPatientsCritical = serologyRows.filter(r => r.isCritical).length;
  
  const averages = { 
    printedToCollected: [], 
    collectedToScanned: [], 
    scannedToSaved: [], 
    savedToValidated: [],
    collectedToValidated: [] 
  };
  let slowestEntry = null;

  serologyRows.forEach((r) => {
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
    totalPatientsCritical,
    avgPrintedToCollected: avg(averages.printedToCollected),
    avgCollectedToScanned: avg(averages.collectedToScanned),
    avgScannedToSaved: avg(averages.scannedToSaved),
    avgSavedToValidated: avg(averages.savedToValidated),
    avgTurnaroundTime: avg(averages.collectedToValidated),
    slowestEntry,
  };
}

/* ================= SUBSCRIBE OVERVIEW =================== */

export function subscribeOverview({ onData, source = "All", dateRange }) {
  const masterRef = query(collection(db, "master_register"), orderBy("timePrinted", "asc"));
  const serologyRef = query(collection(db, "serology_register"), orderBy("timePrinted", "asc"));
  
  let masterRows = []; let serologyRows = [];

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
    const filteredSerology = serologyRows.filter(filterFn);

    const merged = mergeDeptRows(filteredSerology);
    const unified = unifyForCharts(merged);
    const violators = computeSLAViolations(unified, testTimings);

    onData({
      masterRows: filteredMaster,
      deptRows: merged,
      unifiedRows: unified,
      violators,
      kpis: computeKPIs(filteredMaster, merged),
      staffAnalytics: computeStaffAnalytics( merged),
    });
  };

  const unsubMaster = onSnapshot(masterRef, (snap) => { masterRows = snap.docs.map(d => ({ id: d.id, ...d.data() })); publish(); });
  const unsubSero = onSnapshot(serologyRef, (snap) => { serologyRows = snap.docs.map(d => ({ id: d.id, ...d.data() })); publish(); });

  return () => { unsubMaster?.(); unsubSero?.(); };
}

export function unifyForCharts(rows = []) {
  return rows.map((r) => ({
    ...r,
    regNo: r.diagnosticNo, // Use diagnosticNo as primary label for Time Bricks/Charts
    patientName: r.name,
    tests: r.selectedTests,
  }));
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

      timelines[
        staff
      ].push({
        ...r,
        duration,
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

        validatedTimelines[
          staff
        ].push({
          ...r,
          duration,
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

        enteredTimelines[
          staff
        ].push({
          ...r,
          duration,
        });
      }
    }
  );

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