
import { db } from "../../firebaseConfig.js";
import { scopedTimePrintedQuery } from "../../shared/firestore/scopedTimePrintedQuery.js";
import { createOwnerSessionPaint } from "../../shared/cache/createOwnerSessionPaint.js";
import { trackedOnSnapshot as onSnapshot } from "../../shared/firestore/trackedFirestore.js";
import testTimingsData from "../data/test_timings.json";
import insideRouting from "../../inside_room_routing.json";

/* ====================== DATE UTILS ====================== */

import { toDate, minutesDiff } from "../../shared/utils/dates.js";
import { normalizeTestsFieldUpper as normalizeTestsField } from "../../shared/utils/normalizeTestsFieldUpper.js";
export { toDate, minutesDiff, normalizeTestsField };

/* ================= STAFF DISTRIBUTION =================== */
function buildStaffDistribution(rows, field) {
  const counts = {};

  rows.forEach((r) => {
    const staff = (r[field] || "").trim();

    if (!staff) return;

    counts[staff] = (counts[staff] || 0) + 1;
  });

  const total = Object.values(counts).reduce(
    (sum, value) => sum + value,
    0
  );

  return Object.entries(counts)
    .map(([name, count]) => ({
      name,
      count,
      percentage:
        total > 0
          ? Math.round((count / total) * 100)
          : 0
    }))
    .sort((a, b) => b.count - a.count);
}

/* ================= KPI COMPUTATION ====================== */
export function computeKPIs(filteredMaster = [], mergedLabRows = [], canonTests = [], targetDept = "") {
  const cleanCanon = canonTests.map(t => t.trim().toUpperCase());
  
  // UPDATE: Count unique combinations of RegNo and DiagnosticNo
  const totalPatientsCollected = new Set(filteredMaster.map(m => `${m.regNo || m.id}_${m.diagnosticNo || m.billNo || "NA"}`)).size;
  
  const totalTestsCollected = filteredMaster.reduce((sum, m) => {
    const tests = normalizeTestsField(m.selectedTests || m.tests);
    return sum + tests.filter(t => cleanCanon.includes(t)).length;
  }, 0);

  const savedRows = mergedLabRows.filter(r => r.isSaved);
  
  // UPDATE: Count unique combinations of RegNo and DiagnosticNo
  const totalPatientsSaved = new Set(savedRows.map(r => `${r.regNo}_${r.diagnosticNo}`)).size;
  
  const totalTestsSaved = savedRows.reduce((sum, r) => {
    const tests = normalizeTestsField(r.testArrayRaw || r.test);
    return sum + tests.filter(t => cleanCanon.includes(t)).length;
  }, 0);

  // SLA LOGIC: Collected to Saved
  const deptKey = targetDept.toLowerCase();
  const activeLimit = testTimingsData[deptKey]?.scanned_to_saved ?? 45;
  const violators = [];

  const tats = mergedLabRows
    .filter(r => r.timeCollected && r.timeSaved)
    .map(r => {
      const diff = minutesDiff(r.timeCollected, r.timeSaved);
      const isViolated = diff > activeLimit;

      if (isViolated) {
        violators.push({
          ...r,
          duration: diff,
          allowed: activeLimit,
          excess: diff - activeLimit,
          status: diff <= activeLimit * 1.5 ? "borderline" : "violation"
        });
      }
      return diff;
    })
    .filter(v => v !== null);

  const avgTAT = tats.length ? Math.round(tats.reduce((a, b) => a + b, 0) / tats.length) : 0;
  
  const totalValidForSLA = tats.length;
  const withinCount = totalValidForSLA - violators.length;
  const slaScore = totalValidForSLA > 0 ? Math.round((withinCount / totalValidForSLA) * 100) : 100;

  const savedByDistribution =
  buildStaffDistribution(
    mergedLabRows,
    "savedBy"
  );

  let slowest = { delay: 0, regNo: "N/A" };
  if (tats.length > 0) {
    const maxVal = Math.max(...tats);
    const slowRow = mergedLabRows.find(r => minutesDiff(r.timeCollected, r.timeSaved) === maxVal);
    slowest = { delay: maxVal, regNo: slowRow?.name || slowRow?.regNo || "N/A" };
  }

  const totalPatientsPendingScans =
  Math.max(
    0,
    totalPatientsCollected -
      totalPatientsSaved
  );

const totalTestsPending =
  Math.max(
    0,
    totalTestsCollected -
      totalTestsSaved
  );

const avgCollectedToSaved =
  avgTAT;

  return {
    totalPatientsCollected,
    totalTestsCollected,
    totalPatientsSaved,
    totalTestsSaved,
    totalPatientsPendingScans,
    totalTestsPending,
    avgCollectedToSaved,
    slowestEntry: slowest,
    slaScore,
  
    // Staff Analytics
    savedByDistribution,
  
    // Delay Analytics
    violators: violators.sort((a, b) => b.excess - a.excess),
    totalCount: totalValidForSLA,
    withinCount: withinCount
  };
}

/* ================= MERGE DEPT ROWS ====================== */
export function mergeDeptRows(rows = [], targetDept) {
  const out = {};

  rows.forEach((r) => {
    const regId = r.regNo || r.id;
    const diagNo = r.diagnosticNo || r.billNo || "NA";

    if (!regId) return;

    const key = `${regId}_${diagNo}`;

    if (!out[key]) {
      const testArray = normalizeTestsField(r.selectedTests || r.tests);

      out[key] = {
        regNo: regId,
        diagnosticNo: diagNo,
        name: r.name || r.patientName || r.id || "",
        timePrinted: toDate(r.timePrinted || r.date),
        timeCollected: toDate(r.timeCollected),
        timeSaved: toDate(r.timeSaved || r.savedTime),
        isSaved: !!(r.timeSaved || r.savedTime || r.saved === "Yes"),
        savedBy:
        r.savedBy ||
        r.reportData?.[0]?.savedBy ||
        "",
        test: testArray.join(", ") || "—",
        testArrayRaw: testArray,
        department: r.department || targetDept
      };
    }
  });

  return Object.values(out);
}
    

/* ================= SUBSCRIBE OVERVIEW =================== */
export function subscribeOverview({ onData, dateRange, source, activeRegister, targetDept }) {
  const { paintCache, onDataLive } = createOwnerSessionPaint({
    dept: `inside_lab:${activeRegister || ""}`,
    dateRange,
    source,
    onData,
  });
  paintCache();

  const masterRef = scopedTimePrintedQuery("master_register", dateRange);
  const labRef = scopedTimePrintedQuery("inside_lab_results", dateRange);
  if (!masterRef || !labRef) {
    return () => {};
  }

  const canonTests =
  (insideRouting[activeRegister] || []).map(t =>
    t.trim().toUpperCase()
  );
  let mCache = [], lCache = [];

  const publish = () => {
    // UPDATE: Midnight to Midnight IST filtering
    const from = dateRange?.from ? new Date(dateRange.from + "T00:00:00") : null;
    const to = dateRange?.to ? new Date(dateRange.to + "T23:59:59") : null;

    const masterSourceMap = {};
    mCache.forEach(m => {
        const id = m.regNo || m.id;
        const dNo = m.diagnosticNo || m.billNo || "NA";
        const compositeKey = `${id}_${dNo}`;
        if (id) masterSourceMap[compositeKey] = m.source;
    });

    const filteredMaster = mCache.filter(row => {
      const t = toDate(row.timePrinted || row.date);
      if (!t || (from && t < from) || (to && t > to)) return false;
      if (source && source !== "All" && String(row.source || "").toLowerCase() !== String(source).toLowerCase()) return false;
      const tests = normalizeTestsField(row.selectedTests || row.tests);
      return tests.some(t => canonTests.includes(t));
    });

  
  const filteredLab = lCache.filter(row => {
    const t = toDate(row.timePrinted || row.date);

  if (!t || (from && t < from) || (to && t > to)) return false;

  if (source && source !== "All") {
    const regId = row.regNo || row.id;
    const diagNo = row.diagnosticNo || row.billNo || "NA";
    const currentComposite = `${regId}_${diagNo}`;

    if (
      String(masterSourceMap[currentComposite] || "").toLowerCase() !==
      String(source).toLowerCase()
    ) {
      return false;
    }
  }

  if (
    String(row.department || "").trim().toUpperCase() !==
    String(targetDept || "").trim().toUpperCase()
  ) {
    return false;
  }

  const tests = normalizeTestsField(row.selectedTests || row.tests);

  return tests.some(test => canonTests.includes(test));
});

    const merged = mergeDeptRows(filteredLab, targetDept);

    

   
      const kpis = computeKPIs(filteredMaster, merged, canonTests, targetDept);

    onDataLive({
      unifiedRows: merged.map(r => ({
        ...r,
        regNo: r.diagnosticNo
      })),
    
      kpis: kpis,
    
      // Staff Analytics
      savedByDistribution:
        kpis.savedByDistribution,
    
      // Delay Analytics
      violators: kpis.violators,
      totalCount: kpis.totalCount,
      withinCount: kpis.withinCount
    });
  };

  const unsub1 = onSnapshot(masterRef, (s) => { mCache = s.docs.map(d => ({ id: d.id, ...d.data() })); publish(); });
  
  const unsub2 = onSnapshot(labRef, (s) => {
    lCache = s.docs.map(d => ({ id: d.id, ...d.data() }));
    publish();
  });
  return () => { unsub1(); unsub2(); };
}