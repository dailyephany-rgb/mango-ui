/**
 * Export Firestore Listener Lifecycle Audit as PDF.
 * Usage: node scripts/export-listener-audit-pdf.mjs [outPath]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { jsPDF } = require("jspdf");
const { autoTable } = require("jspdf-autotable");

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(
  process.argv[2] ||
    resolve(__dirname, "../src/engineering/reports/Mango_UI_Firestore_Listener_Lifecycle_Audit.pdf")
);

function ensureSpace(doc, y, need = 40) {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + need > pageH - 14) {
    doc.addPage();
    return 16;
  }
  return y;
}

function sectionTitle(doc, title, y) {
  y = ensureSpace(doc, y, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(30, 50, 80);
  doc.text(title, 14, y);
  doc.setTextColor(0);
  return y + 5;
}

function para(doc, text, y, size = 9) {
  const clean = String(text ?? "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "-");
  y = ensureSpace(doc, y, 20);
  if (!Number.isFinite(y)) y = 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(clean, 182);
  const safeLines = Array.isArray(lines) ? lines.filter(Boolean) : [clean];
  if (!safeLines.length) return y;
  doc.text(safeLines, 14, y);
  return y + safeLines.length * (size * 0.45) + 3;
}

function addTable(doc, y, head, body) {
  const pageH = doc.internal.pageSize.getHeight();
  if (!Number.isFinite(y) || y > pageH - 40) {
    doc.addPage();
    y = 16;
  }
  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    styles: { fontSize: 7, cellPadding: 1.3, overflow: "linebreak" },
    headStyles: { fillColor: [40, 60, 90], fontSize: 7, textColor: 255 },
    margin: { left: 14, right: 14 },
  });
  return (doc.lastAutoTable?.finalY ?? y) + 8;
}

try {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20, 40, 70);
  doc.text("Firestore Listener Lifecycle & Optimization Audit", 14, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text("Mango UI - Engineering - Observer-only - Clinical logic unchanged", 14, y);
  y += 5;
  doc.text(
    `Generated: ${new Date().toLocaleString()} | Architecture score: 6.5 / 10`,
    14,
    y
  );
  y += 8;
  doc.setTextColor(0);

  y = sectionTitle(doc, "1. Executive summary", y);
  y = para(doc, "Listeners are mostly correctly cleaned up and go through trackedOnSnapshot for Engineering telemetry. The largest waste is structural: parent register pages keep master/dept/critical streams alive while child tabs (Hormones, Inventory) open additional identical-pattern listeners. Owner department fetchers also each open a separate day-scoped master_register stream.", y);
  y = addTable(doc, y, ["Metric", "Value"], [
    ["Listener call sites (approx)", "~55+"],
    ["Baseline per register page", "3 (master + dept + critical)"],
    ["Safe reduction potential", "~20-30% fleet / ~50% nested Biochem+Hormones"],
    ["Architecture score", "6.5 / 10"],
    ["Cleanup correctness", "8 / 10"],
    ["Tracked telemetry coverage", "8 / 10"],
    ["Listener efficiency", "5 / 10"],
    ["Eng active-count accuracy", "6 / 10"],
  ]);

  y = sectionTitle(doc, "2. Phase 1 - Listener inventory", y);
  y = para(doc, "Nearly all clinical listeners import trackedOnSnapshot as onSnapshot. Raw onSnapshot appears mainly on Engineering Dashboard (mango-engineering project).", y);
  y = addTable(
    doc,
    y,
    ["Surface", "Hook / helper", "Collections", "N", "Cleanup", "Lazy?"],
    [
      [
        "Biochem/Hormones/Haem/Coag/ESR/Serology/Rapid/Urine",
        "useMasterDeptSnapshots",
        "master_register + dept_* + critical_alerts",
        "3",
        "effect return unsubs",
        "Inventory tabs lazy",
      ],
      [
        "Registration MasterView_Table",
        "useMasterRegisterSnapshots",
        "master_register",
        "1",
        "Yes",
        "No",
      ],
      [
        "InsideLab / Outsource / BloodGroup",
        "useScopedMasterEntries",
        "master_register",
        "1",
        "Yes",
        "No",
      ],
      [
        "BloodGroupRegister",
        "scoped + local x2",
        "master + testing + retesting",
        "3",
        "Yes",
        "No",
      ],
      [
        "ValidatorDashboard",
        "inline effect",
        "active dept only",
        "1",
        "unsub on tab/date",
        "Tab-switched",
      ],
      [
        "Inventory* tabs",
        "subscribeInventoryByMachines",
        "inventory_logs per machine",
        "1-N",
        "unsubs map",
        "Lazy under tabs",
      ],
      [
        "Owner dept analytics",
        "dataFetcher_*.js",
        "master + dept",
        "2 each",
        "composite unsub",
        "Per HTML page",
      ],
      [
        "Owner overview",
        "subscribeToWorkflowAnalytics",
        "report_details",
        "1",
        "unsubscribe()",
        "No",
      ],
      [
        "ICC",
        "InventoryCommandCenter",
        "inventory_logs / consumed / qc / cal / ledger / combo",
        "~6",
        "per-effect",
        "Partial tab gate",
      ],
      ["Critical dashboard", "inline", "critical_alerts", "1", "Yes", "No"],
      [
        "Engineering Dashboard",
        "useEngData / EngFilterContext",
        "eng_* (mango-engineering)",
        "N",
        "Yes",
        "Ops only",
      ],
    ]
  );
  y = para(doc, "Key files: src/shared/hooks/useMasterDeptSnapshots.js, useScopedMasterEntries.js, useMasterRegisterSnapshots.js, subscribeInventoryByMachines.js, trackedFirestore.js, owner/lib/dataFetcher_*.js, ValidatorUI/ValidatorDashboard.jsx, inventory-command-center/InventoryCommandCenter.jsx", y, 8);

  y = sectionTitle(doc, "3. Phase 2 - Listener lifecycle (tracked path)", y);
  y = para(
    doc,
    "create -> registerWatch + trackListener(open) -> waiting (10s/30s timeouts) -> first_snapshot -> incremental (sampled) -> reconnect/error -> unmount -> trackListenerClose + unregisterWatch -> destroyed", y);
  y = addTable(doc, y, ["Stage", "Implementation", "Gaps"], [
    ["Creation / open", "trackedFirestore trackListenerUpsert", "-"],
    ["Waiting / timeout", "listenerWatch 10s/30s + EngTelemetry", "-"],
    ["First snapshot", "Single emit (post-hardening)", "-"],
    [
      "Incremental",
      "Sampled every N (default 10)",
      "Long-lived duration metrics can look extreme",
    ],
    ["Unsubscribe", "Wrapper return + hook cleanup", "Raw paths must call unsub"],
    [
      "Incomplete lifecycle",
      "Rare if effect deps correct",
      "StrictMode double-mount in DEV only",
    ],
  ]);

  y = sectionTitle(doc, "4. Phase 3 - Navigation (MPA + in-page tabs)", y);
  y = addTable(doc, y, ["Page", "Enter", "Switch tabs", "Leave"], [
    [
      "Biochemistry",
      "3 listeners",
      "Hormones: +3 (parent 3 stay). Inventory: +machine. Parent NOT destroyed",
      "All unsub on unmount",
    ],
    [
      "Hormones standalone",
      "3 via useMasterDeptSnapshots",
      "Similar inventory pattern",
      "Cleanup OK",
    ],
    [
      "Haem / Coag / Backroom",
      "3 baseline",
      "Inventory adds machine listeners",
      "Cleanup OK",
    ],
    [
      "Validator",
      "1 on active collection",
      "Prior unsub; new collection",
      "Good pattern",
    ],
    [
      "Owner overview",
      "1 report_details",
      "Charts lazy; listener stays",
      "Cleanup OK",
    ],
    [
      "Owner dept pages",
      "2 (master+dept) per page",
      "N/A (separate entries)",
      "Cleanup OK",
    ],
    [
      "ICC",
      "Multiple inventory streams",
      "Some effects always mounted",
      "Cleanup per effect",
    ],
    [
      "Engineering",
      "eng_* on mango-engineering",
      "Per-tab collection hooks",
      "No clinical impact",
    ],
  ]);
  y = para(doc, "Unnecessary retention: Nested Hormones under Biochem recreates a full second triad while the first remains - primary optimization target. Date filter changes recreate the 3 register listeners intentionally.", y);

  y = sectionTitle(doc, "5. Phase 4 - Parent / child (Biochemistry)", y);
  y = para(doc, "BiochemistryMain.jsx owns useMasterDeptSnapshots (3) while page mounted. Toolbar/FilterBar: no listeners. Patient register consumes parent state. Lazy HormonesMain owns its own 3 when tab active. Lazy DeptInventoryTab uses subscribeInventoryByMachines. Lazy InventoryAdjustmentTab has own inventory_logs listen.", y);
  y = addTable(doc, y, ["Relationship", "Finding"], [
    ["Child owns listeners", "Hormones / Inventory tabs - yes"],
    [
      "Inherit parent",
      "Register table inherits; Hormones does NOT reuse parent master",
    ],
    [
      "Duplicate parent pattern",
      "Hormones re-subscribes hormones_main + master(Hormones) + critical",
    ],
    [
      "Move higher/lower?",
      "Suspend parent triad while Hormones tab active (Safe-Low if remount restores)",
    ],
  ]);

  y = sectionTitle(doc, "6. Phase 5 - Shared hooks", y);
  y = addTable(doc, y, ["Hook", "Consumers", "Listeners", "Duplicate risk"], [
    [
      "useMasterDeptSnapshots",
      "Biochem, Hormones, Haem, Coag, ESR, Serology, Rapid, Urine",
      "3 each",
      "High when nested (Biochem+Hormones)",
    ],
    [
      "useScopedMasterEntries",
      "InsideLab, Outsource, BloodGroup",
      "1",
      "Low across MPA",
    ],
    ["useMasterRegisterSnapshots", "MasterView_Table", "1", "Low"],
    [
      "subscribeInventoryByMachines",
      "Dept/Haem/Coag/Backroom/Backup inventory",
      "1 per machine",
      "Medium if ICC + tab overlap",
    ],
    [
      "trackedFirestore",
      "All clinical listens above",
      "Wrapper",
      "First-snap double-count fixed",
    ],
  ]);

  y = sectionTitle(doc, "7. Phase 6 - Firestore query shapes", y);
  y = addTable(doc, y, ["Pattern", "Query", "Index", "Simultaneous dupes?"], [
    [
      "Register master",
      "departments array-contains + timePrinted range + orderBy",
      "departments + timePrinted",
      "Yes - every open register; Owner fetchers too",
    ],
    [
      "Register dept",
      "dept_*: timePrinted range + orderBy",
      "timePrinted",
      "One per open register",
    ],
    [
      "Critical",
      "critical_alerts: dept == + flaggedAt range",
      "dept + flaggedAt",
      "One per register page",
    ],
    [
      "Inventory machines",
      "machineName == + status in [Activated, In Storage]",
      "machineName + status",
      "Possible ICC + tab overlap",
    ],
    [
      "Validator",
      "Single active dept timePrinted range",
      "timePrinted",
      "No (by design)",
    ],
  ]);

  y = sectionTitle(doc, "8. Phase 7 - React lifecycle", y);
  y = addTable(doc, y, ["Check", "Finding"], [
    ["Mount -> create", "Shared hooks create in useEffect - correct"],
    [
      "Rerender -> recreate?",
      "Only when deps change (dateFrom/dateTo/dept). Good",
    ],
    ["Cleanup / unsub", "Present on shared hooks and Validator"],
    ["Leaks", "No systemic missing cleanup in shared layer"],
    ["StrictMode double mount", "DEV only; tracked as recreate/open - expected"],
    [
      "Unnecessary recreation",
      "Date changes yes; nested tab stacking yes (structural)",
    ],
  ]);

  y = sectionTitle(doc, "9. Phase 8 - Fleet scaling (model)", y);
  y = para(doc, "Assumptions: each device is a single MPA page; typical register baseline = 3 listeners; ~20% of devices have inventory tab open (+1); no Owner/ICC on those devices.", y);
  y = addTable(doc, y, ["Devices", "Est. active listeners", "Streams", "Notes"], [
    ["1", "3-5", "3-5", "Register +/- inventory"],
    ["3", "9-15", "9-15", "Linear"],
    ["5", "15-25", "15-25", "Linear"],
    ["10", "30-50", "30-50", "Linear"],
    ["20", "60-100", "60-100", "Matches eng report order of magnitude"],
    ["100", "300-500+", "300-500+", "Plus Owner/ICC outliers if concurrent"],
  ]);
  y = para(doc, "Reads scale with snapshot size x churn, not just listener count. Reconnects scale with device network quality x open streams.", y);

  y = sectionTitle(doc, "10. Phase 9 - Engineering telemetry validation", y);
  y = addTable(doc, y, ["Event", "Emitted?", "Notes"], [
    ["listener open / created", "Yes", "trackListenerUpsert"],
    ["waiting", "Yes", "listenerWatch + heartbeat fields"],
    ["first_snapshot", "Yes", "single emit after hardening"],
    ["incremental_update", "Yes", "sampled"],
    ["retry / timeout", "Yes", "10s/30s + retry_success"],
    ["unsubscribe / close", "Yes", "trackListenerClose"],
    ["destroyed", "Via close", "No separate destroyed event name"],
  ]);
  y = para(doc, "Accuracy gaps: (1) setActiveListeners copies performanceStore.listeners every 15s - not a direct count of eng-tracked opens; fleet active listeners can drift vs true Firestore streams. (2) Eng Dashboard eng_* listens are on mango-engineering and correctly excluded from clinical stream accounting. (3) listener_open rows count opens, not concurrent actives.", y);

  y = sectionTitle(doc, "11. Phase 10 - Optimization opportunities", y);
  y = addTable(doc, y, ["ID", "Opportunity", "Evidence", "Risk"], [
    [
      "A/B",
      "Duplicate listener patterns on nested tabs",
      "Biochem parent triad + HormonesMain triad",
      "Low",
    ],
    [
      "C",
      "Multiple master_register day queries across Owner fetchers",
      "dataFetcher_*.js each open master",
      "Medium",
    ],
    [
      "D/E",
      "Suspend parent register listeners while child tab active",
      "BiochemistryMain activeTab gate",
      "Low",
    ],
    [
      "F",
      "Context provider for shared day master within a shell",
      "Would help Owner multi-panel later",
      "Medium",
    ],
    [
      "G/H",
      "Already lazy inventory/hormones - extend to pause parent",
      "lazy() present; parent effect always on",
      "Safe",
    ],
    [
      "I",
      "One master listener + local dept filter (Owner)",
      "Same day range, different array-contains keys today",
      "High",
    ],
    [
      "J",
      "ICC historical tabs -> getDocs instead of live",
      "Consumed/ledger may not need realtime",
      "Medium",
    ],
  ]);

  y = sectionTitle(doc, "12. Phase 11 - Reduction plan", y);
  y = addTable(doc, y, ["Metric", "Current", "Optimized (safe wave)", "Delta"], [
    ["Nested Biochem+Hormones listeners", "6", "3", "-50% on that path"],
    [
      "Fleet (20 register devices, 25% nested tabs)",
      "~70-85",
      "~55-65",
      "~20-30%",
    ],
    [
      "Owner 12 dept pages open concurrently",
      "24",
      "13-16 w/ shared master",
      "up to ~40% (Medium-High risk)",
    ],
    ["Validator", "1", "1", "already optimal"],
  ]);
  y = para(doc, "Prioritized fix plan (no clinical behavior change): (1) Safe - Pause/unmount parent useMasterDeptSnapshots while non-register tabs active. (2) Safe - Fix eng active-listener heartbeats to count tracked opens. (3) Low - Audit ICC; demote non-live tabs to getDocs where UX allows. (4) Medium - Owner shared master session listener (careful with array-contains).", y);

  y = sectionTitle(doc, "13. Phase 12 - Risk assessment", y);
  y = addTable(doc, y, ["Change", "Class", "Why"], [
    [
      "Pause parent listeners on Hormones/Inventory tab",
      "Safe",
      "Same queries remount when returning; UX identical if loading handled",
    ],
    [
      "Eng active count from tracked registry",
      "Safe",
      "Telemetry-only; no clinical path",
    ],
    [
      "ICC getDocs for history tabs",
      "Low",
      "Loses live updates on those tabs only - confirm product OK",
    ],
    [
      "Share Owner master across dept fetchers",
      "Medium",
      "array-contains is per-dept; shared listen needs OR/fan-out design",
    ],
    [
      "One global master listener + client filter all depts",
      "High",
      "Changes query shape / payload / indexes - out of scope for same behaviour",
    ],
  ]);
  y = para(doc, "DO NOT: collapse realtime registers to getDocs, remove critical_alerts listeners, or share unfiltered master across clinical departments without a dedicated design review.", y);

  y = sectionTitle(doc, "14. Final engineering score", y);
  y = addTable(doc, y, ["Dimension", "Score"], [
    ["Cleanup correctness", "8 / 10"],
    ["Tracked telemetry coverage", "8 / 10"],
    ["Listener efficiency", "5 / 10"],
    ["Query hygiene", "7 / 10"],
    ["Eng active-count accuracy", "6 / 10"],
    ["Navigation design", "7 / 10"],
    ["OVERALL listener architecture", "6.5 / 10"],
  ]);
  y = para(doc, "Strong lifecycle discipline; efficiency limited by nested-tab stacking and Owner per-dept master duplication. Safe wave targets ~20-30% fleet listener reduction without clinical behavior change. This audit is evidence-based from the codebase; no clinical logic was modified.", y);

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(
      `Mango UI - Listener Lifecycle Audit - Page ${i} of ${pageCount}`,
      14,
      doc.internal.pageSize.getHeight() - 8
    );
  }

  mkdirSync(dirname(outPath), { recursive: true });
  const buf = Buffer.from(doc.output("arraybuffer"));
  writeFileSync(outPath, buf);
  console.log("Wrote:", outPath, "bytes:", buf.length, "pages:", doc.getNumberOfPages());
} catch (err) {
  console.error("PDF export failed:", err?.message || err);
  console.error(err?.stack);
  process.exit(1);
}
