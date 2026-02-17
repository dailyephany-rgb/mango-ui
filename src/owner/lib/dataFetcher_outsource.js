
import { db } from "../../firebaseConfig.js";
import { collection, onSnapshot } from "firebase/firestore";
// IMPORT the JSON file
import testTimingsData from "../data/test_timings.json";

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

/* ================= KPI COMPUTATION ====================== */
export function computeKPIs(filteredMaster = [], mergedOutsourceRows = [], canonTests = []) {
  const cleanCanon = canonTests.map(t => t.trim().toUpperCase());
  
  const totalPatientsCollected = new Set(filteredMaster.map(m => m.regNo || m.id)).size;
  const totalTestsCollected = filteredMaster.reduce((sum, m) => {
    const tests = normalizeTestsField(m.selectedTests || m.tests);
    return sum + tests.filter(t => cleanCanon.includes(t)).length;
  }, 0);

  const savedRows = mergedOutsourceRows.filter(r => r.isSaved);
  const totalPatientsSaved = new Set(savedRows.map(r => r.regNo)).size;
  const totalTestsSaved = savedRows.reduce((sum, r) => {
    const tests = normalizeTestsField(r.testArrayRaw);
    return sum + tests.filter(t => cleanCanon.includes(t)).length;
  }, 0);

  const totalPatientsGiven = new Set(mergedOutsourceRows.filter(r => r.isGiven).map(r => r.regNo)).size;

  /**
   * DYNAMIC SLA LIMITS FROM JSON
   */
  const currentLabName = mergedOutsourceRows[0]?.labName || "";
  const labKey = Object.keys(testTimingsData).find(
    key => key.toLowerCase() === currentLabName.toLowerCase()
  );
  const labConfig = labKey ? testTimingsData[labKey] : null;
  const activeLimit = labConfig 
    ? (labConfig.collected_to_saved || labConfig.scanned_to_saved || 1440) 
    : 1440;

  // VIOLATORS ARRAY FOR COMPONENTS
  const violators = [];

  // CALCULATION: Received (timeSaved) - Scanned (timeScanned)
  const tatsScannedToReceived = mergedOutsourceRows
    .filter(r => r.timeScanned && r.timeSaved)
    .map(r => {
        const diff = minutesDiff(r.timeScanned, r.timeSaved);
        const isViolated = diff > activeLimit;
        
        if (isViolated) {
          violators.push({
            regNo: r.regNo,
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
  
  const tatsReceivedToGiven = mergedOutsourceRows
    .filter(r => r.timeSaved && r.timeGiven)
    .map(r => minutesDiff(r.timeSaved, r.timeGiven))
    .filter(v => v !== null);

  let slowest = { delay: 0, regNo: "N/A", formatted: "0m" };
  const formatSlowestEntry = (totalMinutes) => {
    if (!totalMinutes || totalMinutes <= 0) return "0m";
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const mins = totalMinutes % 60;
    return days >= 1 ? `${days}d ${hours}h` : `${hours}h ${mins}m`;
  };

  if (tatsScannedToReceived.length > 0) {
    const maxEntry = tatsScannedToReceived.reduce((prev, curr) => (prev.diff > curr.diff) ? prev : curr);
    slowest = { 
      delay: maxEntry.diff, 
      regNo: maxEntry.regNo, 
      formatted: formatSlowestEntry(maxEntry.diff) 
    };
  }

  const avgMinutesSR = tatsScannedToReceived.length 
    ? Math.round(tatsScannedToReceived.reduce((a, b) => a + b.diff, 0) / tatsScannedToReceived.length) 
    : 0;

  const avgMinutesRG = tatsReceivedToGiven.length 
    ? Math.round(tatsReceivedToGiven.reduce((a, b) => a + b, 0) / tatsReceivedToGiven.length) 
    : 0;

  const violationsCount = violators.length;
  const totalValidForSLA = tatsScannedToReceived.length;
  const withinCount = totalValidForSLA - violationsCount;
  const slaScore = totalValidForSLA > 0 ? Math.round((withinCount / totalValidForSLA) * 100) : 100;

  return {
    totalPatientsCollected,
    totalTestsCollected,
    totalPatientsSaved,
    totalTestsSaved,
    totalPatientsGiven,
    totalPatientsPendingReport: Math.max(0, totalPatientsSaved - totalPatientsGiven),
    totalPatientsPendingScans: Math.max(0, totalPatientsCollected - totalPatientsSaved),
    totalTestsPending: Math.max(0, totalTestsCollected - totalTestsSaved),
    avgCollectedToSaved: formatTAT(avgMinutesSR),
    avgSavedToGiven: formatTAT(avgMinutesRG),
    slowestEntry: slowest,
    slaScore,
    // NEW FIELDS FOR COMPONENTS
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

    const regId = r.regNo || r.diagnosticNo || r.id;
    if (!regId) return;

    const isGivenVal = r.isGiven === true || String(r.isGiven).toLowerCase() === "true";

    if (!out[regId]) {
      const testArray = normalizeTestsField(r.selectedTests || r.tests);
      out[regId] = {
        regNo: regId,
        name: r.name || r.patientName || "",
        timePrinted: toDate(r.timePrinted),
        timeCollected: toDate(r.timeCollected), // Separate field pulled
        department: r.labName || targetLab,     // Map labName to department
        timeScanned: toDate(r.scannedTime), 
        
        // --- UPDATED FOR MODAL ---
        receivedTime: toDate(r.receivedTime),
        givenTime: toDate(r.givenTime),
        
        // --- KEPT FOR KPI LOGIC ---
        timeSaved: toDate(r.receivedTime), 
        timeGiven: toDate(r.givenTime),    
        
        isSaved: r.receivedStatus === "Yes",
        isGiven: isGivenVal,
        test: testArray.join(", ") || "—",
        testArrayRaw: testArray,
        labName: targetLab
      };
    } else {
      if (isGivenVal) out[regId].isGiven = true;
      if (r.givenTime) {
          out[regId].givenTime = toDate(r.givenTime);
          out[regId].timeGiven = toDate(r.givenTime);
      }
      if (r.receivedTime) {
          out[regId].receivedTime = toDate(r.receivedTime);
          out[regId].timeSaved = toDate(r.receivedTime);
      }
      if (r.scannedTime) {
          out[regId].timeScanned = toDate(r.scannedTime);
      }
      if (r.timeCollected) out[regId].timeCollected = toDate(r.timeCollected);
      if (r.timePrinted) out[regId].timePrinted = toDate(r.timePrinted);
    }
  });
  return Object.values(out);
}

/* ================= SUBSCRIBE OVERVIEW =================== */
export function subscribeOverview({ onData, dateRange, source, activeRegister, targetLab }) {
  const masterRef = collection(db, "master_register");
  const outsourceRef = collection(db, "outsource_tracking");

  const OUTSOURCE_ROUTING = {
    "SterlingRegister": ["ADRENOCORTICOTROPIC HORMONE ACTH", "AFP (ALPHA FETO PROTEIN )", "ALLERGY MIX PANEL", "ALLERGY TEST-DRUGS", "ALLERGY TEST-FOOD VEG", "ALLERGY TEST-INHALANT", "AMMONIA TEST", "AMOEBIC SEROLOGY", "ANA PROFILE", "ANGIOTENSIN CONVERTING ENZYME (ACE) LEVEL", "ANTI ANA BY IFA", "ANTI CARDIOLIPIN ANTIBODIES IGG,IGM", "ANTI CCP (ANTI CYCLIC CITRULLINATED PEPTIDE ANTIBODIES )", "ANTI DS DNA ( IFA )", "ANTI HAV IGG", "ANTI HAV IGM", "ANTI HBE ANTIBODIES", "ANTI HBS", "ANTI HEV IGM", "ANTI TG (ANTI THYROGLOBULIN) ANTI BODY", "ANTI TPO ANTIBODY", "APLA PANEL (LUPUS ANTICOUGUELANT SCREEN , ACA, APLA IGG IGM BETA 2 GLYCOPROTIEN IGG , IGM )", "BETA 2 GLYCOPROTEIN IGG IGM", "BILE ACID", "BIOPSY EXTRA LARGE", "BIOPSY LARGE", "BIOPSY LARGEST", "BIOPSY MEDIUM", "BIOPSY SMALL", "BODY FLUID FOR ANAEROBIC CULTURE", "BODY FLUID, ROUTINE EXAMINATION", "BONE MARROW EXAMINATION AND BIOPSY","C-ANCA","CA -125 (OVARIAN CANCER )", "CA 15.3", "CA 19-9", "CBNET", "CEA (CARCINO EMBRYONIC ANTIGEN )", "CHIKUNGUNYA PCR", "CHLAMYDIA TRACHOMATIS IGG", "CHLAMYDIA TRACHOMATIS IGM", "COMPLIMENT C3", "COMPLIMENT C4", "COOMBS TEST, DIRECT, BLOOD", "CORTISOL", "C-PEPTIDE", "CULTURE FUNGAL", "CYTOMEGALOVIRUS (CMV) IGM AND IGG", "DHEA-S", "ERYTHROPOIETIN", "FDP (FIBRINOGEN DEGRADATION PRODUCTS)", "FIBRINOGEN LEVEL", "GROWTH HORMONE", "HBEAG", "HEPATITIS A VIRUS IGM ANTIBODIES", "HEPATITIS B VIRUS DNA QUANTITATIVE", "HEPATITIS BE VIRUS ANTIGEN / ANTIBODY EVALUATION", "HEPATITIS E VIRUS IGM ANTIBODIES", "HERPES ZOSTER IGG IGM", "HLA B27 (PCR)", "HOMOCYSTEINE", "HS-CRP (QUANTITATIVE)", "HSV I AND HSV II IGG IGM", "IGE, TOTAL", "IGG LEVEL", "IMMUNOPHENOTYPING FOR PLATELET FUNCTION TEST", "INDIA INK PREPARATION", "INDIRECT COOMBS TEST, SERUM", "INHIBIN B", "INSULIN FASTING", "INSULIN RANDOM", "LACTATE LEVEL", "LBC STERLING", "LUPUS ANTICOAGULANT", "MYELOMA PANEL", "OSMOLALITY URINE","P-ANCA BY ELSA","P24 ANTIGEN", "PARVOVIRUS B 19 IGG", "PARVOVIRUS B 19 IGM", "PROTEIN C", "PROTEIN ELECTROPHORESIS", "PROTEIN S", "PTH", "RH ANTI BODY TITER", "SAAG (SERUM-ASCITES ALBUMIN GRADIENT)", "SERUM FOLIC ACID", "SERUM IGA LEVEL", "SIROLIMUS LEVEL", "STOOL FOR REDUCING SUBSTANCE TEST", "TB GOLD (IGRAS) QUANTIFERON GAMMA INTERFERON", "TB PCR BY GENE EXPERT", "TESTOSTERONE, FREE, SERUM", "THROAT SWAB FOR H1N1", "TISSUE TRANSGLUTAMINASE IGA, TTG", "TORCH-COMPLETE - 10", "TOXO IGG IGM", "TPHA", "TUMOR NECROSIS FACTOR ALPHA", "URINE MYOGLOBIN", "URINE-MICROALBUMIN", "VARICELLA ZOSTER VIRUS (VZV) IGG ANTIBODIES", "VEG. FOOD ALLERGY PANEL"],

    "NeubergRegister": ["HB ELECTROPHORESIS", "NIPT NEUBERG"],

    "LifecellRegister": ["WHOLE EXOME SEQUENCING - NGS", "HBB Gene Sequencing (Betaglobinopathy Gene)", "PAP Smear LBC + HPV", "DICE Panel with TB PCR", "Fetal Autopsy (fetus in 10% Formalin Sol.) with DNA Storage", "Fetal Autopsy + Placentoscope + DNA Storage", "Y Chromosome Microdeletion (YCMD)", "BabyShield 11 Conditions- (Heel-Prick)", "BabyShield 4 Conditions- (Heel-Prick)", "BabyShield 62 Conditions- (Heel-Prick) – TMS", "BabyShield 7 Conditions- (Heel-Prick)"],

    "LilacRegister": ["Combined FTS (Dual Marker + NT)", "Quadruple Marker Test", "InsighT (NIPS)","DMT EVIC DUO PE LUS"],

    "ReliableRegister": [
      "PROCALCITONIN","PRO BNP MARKER","CPKMB","D DIMER","CPK NAC","MAGNESIUM","TOTAL TESTOSTERONE","LIPASE","RUBELLA IGG", "RUBELLA IGM","ASO TITER","G6PD","ADA","URINE-ACR","URINE-PCR"
    ]
  };

  const canonTests = OUTSOURCE_ROUTING[activeRegister] || [];
  let mCache = [], oCache = [];

  const publish = () => {
    const from = dateRange?.from ? new Date(dateRange.from + "T00:00:00") : null;
    const to = dateRange?.to ? new Date(dateRange.to + "T23:59:59") : null;

    console.log(`🔍 DEBUG [${activeRegister}]: Filtering logic started for Lab: ${targetLab}`);

    const filteredMaster = mCache.filter(row => {
      const t = toDate(row.timePrinted);
      if (!t || (from && t < from) || (to && t > to)) return false;
      if (source && source !== "All") {
        if (String(row.source || "").toLowerCase() !== String(source).toLowerCase()) return false;
      }
      const tests = normalizeTestsField(row.selectedTests || row.tests);
      return tests.some(t => canonTests.map(c => c.trim().toUpperCase()).includes(t));
    });

    const filteredOutsource = oCache.filter(row => {
      const t = toDate(row.timePrinted);
      if (!t || (from && t < from) || (to && t > to)) return false;
      if (source && source !== "All") {
        if (String(row.source || "").toLowerCase() !== String(source).toLowerCase()) return false;
      }
      const tests = normalizeTestsField(row.selectedTests || row.tests);
      return tests.some(t => canonTests.map(c => c.trim().toUpperCase()).includes(t));
    });

    // --- DEBUG CONSOLE LOGS ---
    console.log(`✅ Master Register: Found ${filteredMaster.length} matching entries.`);
    if (filteredMaster.length > 0) {
      console.table(filteredMaster.map(e => ({ Reg: e.regNo || e.id, Name: e.name, Tests: normalizeTestsField(e.selectedTests || e.tests).join(", ") })));
    }

    console.log(`✅ Outsource Tracking: Found ${filteredOutsource.length} matching entries.`);
    if (filteredOutsource.length > 0) {
      console.table(filteredOutsource.map(e => ({ Reg: e.regNo, Name: e.name, Lab: e.labName, Tests: normalizeTestsField(e.selectedTests || e.tests).join(", ") })));
    }
    // --------------------------

    const merged = mergeOutsourceRows(filteredOutsource, targetLab);
    const results = computeKPIs(filteredMaster, merged, canonTests);

    onData({
      unifiedRows: merged,
      kpis: results,
      violators: results.violators, 
      totalCount: results.totalCount, 
      withinCount: results.withinCount 
    });
  };

  const unsub1 = onSnapshot(masterRef, (s) => { mCache = s.docs.map(d => ({ id: d.id, ...d.data() })); publish(); });
  const unsub2 = onSnapshot(outsourceRef, (s) => { oCache = s.docs.map(d => ({ id: d.id, ...d.data() })); publish(); });

  return () => { unsub1(); unsub2(); };
}