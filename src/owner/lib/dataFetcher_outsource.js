
import { db } from "../../firebaseConfig.js";
import { collection, onSnapshot } from "firebase/firestore";
// IMPORT the JSON file
import testTimingsData from "../data/test_timings.json";
import OUTSOURCE_ROUTING from "../../Outsource.json";

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

export const formatTAT = (totalMinutes) => {
  if (!totalMinutes || totalMinutes <= 0) return "0m";
  const days = Math.floor(totalMinutes / 1440);
  const remainingMinutes = totalMinutes % 1440;
  const hours = Math.floor(remainingMinutes / 60);
  const mins = remainingMinutes % 60;

  if (days >= 1) {
    return `${days} Day${days > 1 ? 's' : ''} ${hours} Hr${hours !== 1 ? 's' : ''}`;
  }
  return `${hours}h ${mins}m`;
};

/* ================= TEST NORMALIZATION =================== */
export function normalizeTestsField(field) {
  if (!field) return [];
  if (Array.isArray(field)) {
    return field.map(v => {
      if (v && typeof v === "object") return v.test || v.name || v.testName || v.selectedTest;
      if (typeof v === "string") return v;
      return null;
    }).filter(Boolean).map(s => String(s).trim().toUpperCase());
  }
  if (typeof field === "string") return field.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
  return [];
}

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
export function computeKPIs(
  filteredMaster = [],
  mergedOutsourceRows = [],
  canonSet = new Set()
) {
  
  // UPDATE: Unique count based on RegNo + DiagnosticNo
  const totalPatientsCollected = new Set(filteredMaster.map(m => `${m.regNo || m.id}_${m.diagnosticNo || m.billNo || "NA"}`)).size;
  const totalTestsCollected = filteredMaster.reduce((sum, m) => {
    const tests = normalizeTestsField(m.selectedTests || m.tests);
    return sum + tests.filter(t => canonSet.has(t)).length;
  }, 0);

  const savedRows = mergedOutsourceRows.filter(r => r.isSaved);
  // UPDATE: Unique count based on RegNo + DiagnosticNo
  const totalPatientsSaved = new Set(savedRows.map(r => `${r.regNo}_${r.diagnosticNo}`)).size;
  const totalTestsSaved = savedRows.reduce((sum, r) => {
    const tests = normalizeTestsField(r.testArrayRaw);
    return sum + tests.filter(t => canonSet.has(t)).length;
  }, 0);

  const totalPatientsGiven = new Set(mergedOutsourceRows.filter(r => r.isGiven).map(r => `${r.regNo}_${r.diagnosticNo}`)).size;

  /**
   * DYNAMIC SLA LIMITS FROM JSON
   */
  const currentLabName = mergedOutsourceRows[0]?.labName || "";
  const labKey = Object.keys(testTimingsData).find(
    key => key.toLowerCase() === currentLabName.toLowerCase()
  );
  const labConfig = labKey ? testTimingsData[labKey] : null;
  const activeLimit =
  labConfig?.outsource_collected_to_received ??
  1440;

  // VIOLATORS ARRAY FOR COMPONENTS
  const violators = [];

  // CALCULATION: // Report Received - Outsource Collected

  const tatsCollectedToReceived =
  mergedOutsourceRows
    .filter(
      r =>
        r.timeOutsourcedCollected &&
        r.timeReportReceived
    )
    .map(r => {
      const diff = minutesDiff(
        r.timeOutsourcedCollected,
        r.timeReportReceived
      );
        
        const isViolated = diff > activeLimit;
        
        if (isViolated) {
          violators.push({
            regNo: r.regNo,
            diagnosticNo: r.diagnosticNo,
            name: r.name,
            test: r.test,
            department: currentLabName,
            duration: diff,
            allowed: activeLimit,
            excess: diff - activeLimit, // Needed for Histogram buckets
            status: "violation"
          });
        }

        return { 
            regNo: r.regNo, 
            name: r.name, 
            diff: diff,
            isViolated: isViolated
        };
    })
    .filter(v => v.diff !== null);

  // SLA AUDIT LOG
  console.log(`--- SLA AUDIT: ${currentLabName.toUpperCase()} ---`);
  console.log(`Target Limit from JSON: ${activeLimit} mins`);
  
  const tatsReceivedToDelivered =
  mergedOutsourceRows
    .filter(
      r =>
        r.timeReportReceived &&
        r.timeReportDelivered
    )
    .map(r =>
      minutesDiff(
        r.timeReportReceived,
        r.timeReportDelivered
      )
    )
    .filter(v => v !== null);


  let slowest = { delay: 0, regNo: "N/A", formatted: "0m" };
  const formatSlowestEntry = (totalMinutes) => {
    if (!totalMinutes || totalMinutes <= 0) return "0m";
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const mins = totalMinutes % 60;
    return days >= 1 ? `${days}d ${hours}h` : `${hours}h ${mins}m`;
  };

  if (tatsCollectedToReceived.length > 0){
    const maxEntry = tatsCollectedToReceived.reduce(
      (prev, curr) => (prev.diff > curr.diff) ? prev : curr);
    slowest = { 
      delay: maxEntry.diff, 
      regNo: maxEntry.regNo, 
      formatted: formatSlowestEntry(maxEntry.diff) 
    };
  }

  const avgMinutesSR =
  tatsCollectedToReceived.length
    ? Math.round(
        tatsCollectedToReceived.reduce(
          (a, b) => a + b.diff,
          0
        ) /
        tatsCollectedToReceived.length
      )
    : 0;

    const avgMinutesRG =
  tatsReceivedToDelivered.length
    ? Math.round(
        tatsReceivedToDelivered.reduce(
          (a, b) => a + b,
          0
        ) /
        tatsReceivedToDelivered.length
      )
    : 0;

  const violationsCount = violators.length;
  const totalValidForSLA = tatsCollectedToReceived.length;
  const withinCount = totalValidForSLA - violationsCount;
  const slaScore = totalValidForSLA > 0 ? Math.round((withinCount / totalValidForSLA) * 100) : 100;

  const collectedByDistribution =
  buildStaffDistribution(
    mergedOutsourceRows,
    "collectedBy"
  );

const receivedByDistribution =
  buildStaffDistribution(
    mergedOutsourceRows,
    "receivedBy"
  );

const deliveredByDistribution =
  buildStaffDistribution(
    mergedOutsourceRows,
    "deliveredBy"
  ); 

  return {
    totalPatientsCollected,
    totalTestsCollected,
    totalPatientsSaved,
    totalTestsSaved,
    totalPatientsGiven,
    totalPatientsPendingReport: Math.max(0, totalPatientsSaved - totalPatientsGiven),
    totalPatientsPendingScans: Math.max(0, totalPatientsCollected - totalPatientsSaved),
    totalTestsPending: Math.max(0, totalTestsCollected - totalTestsSaved),
    avgCollectedToReceived: formatTAT(avgMinutesSR),
    avgReceivedToDelivered: formatTAT(avgMinutesRG),
    slowestEntry: slowest,
    slaScore,

    // Staff analytics
    collectedByDistribution,
    receivedByDistribution,
    deliveredByDistribution,
    
    // Delay analytics
    violators: violators.sort((a, b) => b.excess - a.excess),
    totalCount: totalValidForSLA,
    withinCount: withinCount
    };
}

/* ================= MERGE LAB ROWS ====================== */
export function mergeOutsourceRows(rows = [], targetLab) {
  const out = {};
  const target = String(targetLab || "").toUpperCase();

  rows.forEach((r) => {
    const rowLab = String(r.labName || "").toUpperCase();
    if (rowLab !== target) return;

    const regId = r.regNo || r.id;
    const diagNo = r.diagnosticNo || r.billNo || "NA"; 
    if (!regId) return;

    const isGivenVal = r.isGiven === true || String(r.isGiven).toLowerCase() === "true";

    // UPDATE: Unique key combines RegNo and DiagnosticNo
    const key = `${regId}_${diagNo}`;

    if (!out[key]) {
      const testArray = normalizeTestsField(r.selectedTests || r.tests);
      out[key] = {
        regNo: regId,
        diagnosticNo: diagNo, 
        name: r.name || r.patientName || "",
        timePrinted: toDate(r.timePrinted),
        timeCollected: toDate(r.timeCollected), 
        department: r.labName || targetLab,     
        timeOutsourcedCollected:
        toDate(r.outsourcedCollectedTime),
        timeReportReceived:toDate(r.reportReceivedTime),
        timeReportDelivered: toDate(r.reportDeliveredTime),  

        // Legacy schema support
        scannedTime:  toDate(r.scannedTime),
        receivedTime: toDate(r.receivedTime),
        
        isSaved: r.receivedStatus === "Yes",
        isGiven: isGivenVal,
        test: testArray.join(", ") || "—",
        testArrayRaw: testArray,
        labName: targetLab,
        collectedBy: r.collectedBy || "",
        receivedBy: r.receivedBy || "",
        deliveredBy: r.deliveredBy || ""
      };
      } else {
      if (isGivenVal) out[key].isGiven = true;
      if (
        r.reportDeliveredTime
      ) {
        out[key]
          .timeReportDelivered =
            toDate(
              r.reportDeliveredTime
            );
      }
      
      if (
        r.reportReceivedTime
      ) {
        out[key]
          .timeReportReceived =
            toDate(
              r.reportReceivedTime
            );
      }
      
      if (
        r.outsourcedCollectedTime
      ) {
        out[key]
          .timeOutsourcedCollected =
            toDate(
              r.outsourcedCollectedTime
            );
      }

      // Legacy schema support
        if (r.scannedTime) {
          out[key].scannedTime =
            toDate(r.scannedTime);
        }

        if (r.receivedTime) {
          out[key].receivedTime =
            toDate(r.receivedTime);
        }
      
        
      if (r.timeCollected) out[key].timeCollected = toDate(r.timeCollected);
      if (r.timePrinted) out[key].timePrinted = toDate(r.timePrinted);
      if (r.collectedBy) {
        out[key].collectedBy =
          r.collectedBy;
      }
      
      if (r.receivedBy) {
        out[key].receivedBy =
          r.receivedBy;
      }
      
      if (r.deliveredBy) {
        out[key].deliveredBy =
          r.deliveredBy;
      }
    }
  });
  return Object.values(out);
}

/* ================= SUBSCRIBE OVERVIEW =================== */
export function subscribeOverview({ onData, dateRange, source, activeRegister, targetLab }) {
  const masterRef = collection(db, "master_register");
  const outsourceRef = collection(db, "outsource_tracking");

  const canonTests = OUTSOURCE_ROUTING[targetLab] || [];

    // Build once instead of repeatedly
    const canonSet = new Set(
      canonTests.map(test => test.trim().toUpperCase())
    );
  let mCache = [], oCache = [];

  const publish = () => {
    // UPDATE: STRICT MIDNIGHT IST STRINGS
    const from = dateRange?.from ? new Date(dateRange.from + "T00:00:00") : null;
    const to = dateRange?.to ? new Date(dateRange.to + "T23:59:59") : null;

    const filteredMaster = mCache.filter(row => {
      const t = toDate(row.timePrinted);
      if (!t || (from && t < from) || (to && t > to)) return false;
      if (source && source !== "All" && String(row.source || "").toLowerCase() !== String(source).toLowerCase()) return false;
      const tests = normalizeTestsField(row.selectedTests || row.tests);
      return tests.some(test => canonSet.has(test));
    });

    const filteredOutsource = oCache.filter(row => {
      const t = toDate(row.timePrinted);
      if (!t || (from && t < from) || (to && t > to)) return false;
      if (source && source !== "All" && String(row.source || "").toLowerCase() !== String(source).toLowerCase()) return false;
      const tests = normalizeTestsField(row.selectedTests || row.tests);
return tests.some(test => canonSet.has(test));
    });

    const merged = mergeOutsourceRows(filteredOutsource, targetLab);
    const results = computeKPIs(
      filteredMaster,
      merged,
      canonTests,
      canonSet
    );

   
    
    onData({
      unifiedRows: merged.map(r => ({
        ...r,
      
        regNo: r.diagnosticNo,
      
        // New workflow fields
        timeCollected: r.timeCollected,
        timeOutsourcedCollected: r.timeOutsourcedCollected,
        timeReportReceived: r.timeReportReceived,
        timeReportDelivered: r.timeReportDelivered,
      
        // Legacy aliases (keep for existing components)
        timeScanned:
          r.timeOutsourcedCollected ||
          r.scannedTime ||
          null,
      
        timeSaved:
          r.timeReportReceived ||
          r.receivedTime ||
          null,
      
        timeGiven:
          r.timeReportDelivered ||
          null
      })),
    
    
      kpis: results,
    
      // Staff analytics
      collectedByDistribution:
        results.collectedByDistribution,
    
      receivedByDistribution:
        results.receivedByDistribution,
    
      deliveredByDistribution:
        results.deliveredByDistribution,
    
      // Delay analytics
      violators: results.violators,
      totalCount: results.totalCount,
      withinCount: results.withinCount
    });
  };

  const unsub1 = onSnapshot(masterRef, (s) => { mCache = s.docs.map(d => ({ id: d.id, ...d.data() })); publish(); });
  const unsub2 = onSnapshot(outsourceRef, (s) => { oCache = s.docs.map(d => ({ id: d.id, ...d.data() })); publish(); });

  return () => { unsub1(); unsub2(); };
}