/**
 * Collect turnaround (SLA violator) rows for the Turnaround Report PDF.
 * One-shot subscribeOverview per department, then unsubscribe.
 */
import testTimings from "../data/test_timings.json";

import * as Biochem from "../lib/dataFetcher_biochem_main.js";
import * as Hormones from "../lib/dataFetcher_hormones_main.js";
import * as Haem from "../lib/dataFetcher_haem.js";
import * as Coag from "../lib/dataFetcher.js";
import * as Serology from "../lib/dataFetcher_serology.js";
import * as Rapid from "../lib/dataFetcher_rapid.js";
import * as Urine from "../lib/dataFetcher_urine.js";
import * as Esr from "../lib/dataFetcher_esr.js";
import * as BloodGroupTesting from "../lib/dataFetcher_bloodgroup_testing.js";
import * as BloodGroupRetesting from "../lib/dataFetcher_bloodgroup_retesting.js";
import * as Outsource from "../lib/dataFetcher_outsource.js";
import * as Lab from "../lib/dataFetcher_lab.js";

const OVERVIEW_TIMEOUT_MS = 90_000;

const CLINICAL_SECTIONS = [
  {
    title: "Biochem",
    subscribe: Biochem.subscribeOverview,
    compute: Biochem.computeSLAViolations,
  },
  {
    title: "Hormones",
    subscribe: Hormones.subscribeOverview,
    compute: Hormones.computeSLAViolations,
  },
  {
    title: "Haematology",
    subscribe: Haem.subscribeOverview,
    compute: Haem.computeSLAViolations,
  },
  {
    title: "Coagulation",
    subscribe: Coag.subscribeOverview,
    compute: Coag.computeSLAViolations,
  },
  {
    title: "Serology",
    subscribe: Serology.subscribeOverview,
    compute: Serology.computeSLAViolations,
  },
  {
    title: "Rapid Card",
    subscribe: Rapid.subscribeOverview,
    compute: Rapid.computeSLAViolations,
  },
  {
    title: "Urine",
    subscribe: Urine.subscribeOverview,
    compute: Urine.computeSLAViolations,
  },
  {
    title: "ESR",
    subscribe: Esr.subscribeOverview,
    compute: Esr.computeSLAViolations,
  },
  {
    title: "Blood Group",
    subscribe: BloodGroupTesting.subscribeOverview,
    compute: BloodGroupTesting.computeSLAViolations,
  },
  {
    title: "Blood Group Retesting",
    subscribe: BloodGroupRetesting.subscribeOverview,
    compute: BloodGroupRetesting.computeSLAViolations,
  },
];

const OUTSOURCE_LABS = [
  { id: "SterlingRegister", label: "Sterling", lab: "STERLING" },
  { id: "NeubergRegister", label: "Neuberg", lab: "NEUBERG" },
  { id: "LifecellRegister", label: "Lifecell", lab: "LIFECELL" },
  { id: "LilacRegister", label: "Lilac", lab: "LILAC" },
  { id: "ReliableRegister", label: "Reliable", lab: "RELIABLE" },
];

const INSIDE_LAB_DEPTS = [
  { id: "FnacRegister", label: "FNAC", dept: "FNAC" },
  { id: "PathologyRegister", label: "Pathology", dept: "PATHOLOGY" },
  { id: "CultureRegister", label: "Culture", dept: "CULTURE" },
  { id: "FluidRegister", label: "Fluid", dept: "FLUID" },
];

/**
 * Wait for overview payloads to settle (cache + both snapshots), then unsubscribe.
 * Avoids resolving on a partial first paint when only one Firestore listener has fired.
 *
 * @param {(opts: object) => Function} subscribeOverview
 * @param {object} opts
 * @param {number} [settleMs]
 * @returns {Promise<object>}
 */
function firstOverviewPayload(subscribeOverview, opts, settleMs = 450) {
  return new Promise((resolve, reject) => {
    let done = false;
    let unsub = null;
    let latest = null;
    let settleTimer = null;

    const finish = (payload, err) => {
      if (done) return;
      done = true;
      clearTimeout(hardTimer);
      clearTimeout(settleTimer);
      try {
        if (typeof unsub === "function") unsub();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(payload || {});
    };

    const hardTimer = setTimeout(() => {
      if (latest != null) finish(latest);
      else finish(null, new Error("Timed out waiting for department overview"));
    }, OVERVIEW_TIMEOUT_MS);

    try {
      if (typeof subscribeOverview !== "function") {
        finish(
          null,
          new Error("Department subscribeOverview is not available")
        );
        return;
      }
      unsub = subscribeOverview({
        ...opts,
        onData: (payload) => {
          latest = payload;
          clearTimeout(settleTimer);
          settleTimer = setTimeout(() => finish(latest), settleMs);
        },
      });
    } catch (err) {
      finish(null, err);
    }
  });
}

function dash(v) {
  if (v == null || v === "" || v === "NA") return null;
  return v;
}

/**
 * Normalize any violator into the shared Turnaround PDF row shape.
 * @param {object} v
 * @param {string} deptFallback
 * @param {"clinical"|"outsource"|"inside"} kind
 */
export function normalizeTurnaroundRow(v, deptFallback, kind = "clinical") {
  let timeCollected = dash(v.timeCollected);
  let timeScanned = dash(v.timeScanned);
  let timeSaved = dash(v.timeSaved);
  let timeValidated = dash(v.timeValidated);
  let savedBy = v.savedBy || "NA";
  let validatedBy = v.validatedBy || "NA";

  if (kind === "outsource") {
    timeCollected = dash(v.timeCollected ?? v.timeOutsourcedCollected);
    timeScanned = null;
    timeSaved = dash(v.timeSaved ?? v.timeReportReceived);
    timeValidated = dash(v.timeValidated ?? v.timeReportDelivered);
    savedBy = v.savedBy || v.receivedBy || "NA";
    validatedBy = v.validatedBy || v.deliveredBy || "NA";
  } else if (kind === "inside") {
    timeCollected = dash(v.timeCollected);
    timeScanned = dash(v.timeScanned) || null;
    timeSaved = dash(v.timeSaved);
    timeValidated = null;
    savedBy = v.savedBy || "NA";
    validatedBy = "—";
  }

  return {
    regNo: v.regNo ?? "—",
    diagnosticNo: v.diagnosticNo ?? "NA",
    name: v.name ?? "—",
    test: v.test ?? "—",
    dept: deptFallback || v.department || "—",
    timeCollected,
    timeScanned,
    timeSaved,
    timeValidated,
    savedBy: savedBy === "—" ? "—" : savedBy || "NA",
    validatedBy: validatedBy === "—" ? "—" : validatedBy || "NA",
    duration: v.duration ?? "—",
    allowed: v.allowed ?? "—",
    status: v.status ?? "—",
  };
}

async function collectClinicalSection(section, dateRange, source) {
  const payload = await firstOverviewPayload(section.subscribe, {
    dateRange,
    source,
  });
  const unified = payload.unifiedRows || [];
  const violators = section.compute(unified, testTimings, "turnaround") || [];
  return {
    title: section.title,
    rows: violators.map((v) =>
      normalizeTurnaroundRow(v, section.title, "clinical")
    ),
  };
}

async function collectOutsourceSection(dateRange, source) {
  const chunks = await Promise.all(
    OUTSOURCE_LABS.map(async (tab) => {
      const payload = await firstOverviewPayload(Outsource.subscribeOverview, {
        dateRange,
        source,
        activeRegister: tab.id,
        targetLab: tab.lab,
      });
      const violators = payload.violators || payload.kpis?.violators || [];
      return violators.map((v) =>
        normalizeTurnaroundRow(v, tab.label, "outsource")
      );
    })
  );
  return {
    title: "Outsource",
    rows: chunks.flat().sort((a, b) => (b.duration || 0) - (a.duration || 0)),
  };
}

async function collectInsideLabSection(dateRange, source) {
  const chunks = await Promise.all(
    INSIDE_LAB_DEPTS.map(async (tab) => {
      const payload = await firstOverviewPayload(Lab.subscribeOverview, {
        dateRange,
        source,
        activeRegister: tab.id,
        targetDept: tab.dept,
      });
      const violators = payload.violators || payload.kpis?.violators || [];
      return violators.map((v) =>
        normalizeTurnaroundRow(v, tab.label, "inside")
      );
    })
  );
  return {
    title: "Inside Lab",
    rows: chunks.flat().sort((a, b) => (b.duration || 0) - (a.duration || 0)),
  };
}

/**
 * @param {{ dateRange: { from?: string, to?: string }, source?: string }} opts
 * @returns {Promise<{ sections: Array<{ title: string, rows: object[] }> }>}
 */
export async function collectTurnaroundData({ dateRange, source = "All" }) {
  const clinical = await Promise.all(
    CLINICAL_SECTIONS.map((section) =>
      collectClinicalSection(section, dateRange, source)
    )
  );
  const [outsource, inside] = await Promise.all([
    collectOutsourceSection(dateRange, source),
    collectInsideLabSection(dateRange, source),
  ]);

  return {
    sections: [...clinical, outsource, inside],
  };
}
