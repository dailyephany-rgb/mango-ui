/**
 * First-class Firestore-by-Component module registry (observer-only).
 * Maps EngComponent names / pages → canonical moduleId.
 * Shared hooks are NEVER modules — attributed to the mounting module.
 */

/** @typedef {{ id: string, label: string, group: string, pageKeys?: string[] }} ModuleDef */

/** @type {ModuleDef[]} */
export const FIRST_CLASS_MODULES = [
  // Registration
  { id: "PatientEntry", label: "Patient Entry", group: "Registration", pageKeys: ["Mango"] },
  { id: "MasterView_Table", label: "MasterView_Table", group: "Registration", pageKeys: ["Mango"] },
  { id: "MasterView_Rectangle", label: "MasterView_Rectangle", group: "Registration", pageKeys: ["Mango"] },
  { id: "MasterView_Table1", label: "MasterView_Table1", group: "Registration", pageKeys: ["Mango"] },
  // Biochemistry
  { id: "BiochemistryMain", label: "BiochemistryMain", group: "Biochemistry", pageKeys: ["Biochemistry"] },
  { id: "HormonesMain", label: "HormonesMain", group: "Biochemistry", pageKeys: ["Biochemistry", "Hormones"] },
  { id: "DeptInventoryTab", label: "DeptInventoryTab", group: "Biochemistry", pageKeys: ["Biochemistry"] },
  { id: "InventoryAdjustmentTab", label: "InventoryAdjustmentTab", group: "Biochemistry", pageKeys: ["Biochemistry"] },
  // Haematology
  { id: "Haematology", label: "Haematology", group: "Haematology", pageKeys: ["Haematology"] },
  { id: "HaemInventoryTab", label: "HaemInventoryTab", group: "Haematology", pageKeys: ["Haematology"] },
  // Coagulation
  { id: "CoagulationMain", label: "CoagulationMain", group: "Coagulation", pageKeys: ["Coagulation"] },
  { id: "CoagulationInventoryTab", label: "CoagulationInventoryTab", group: "Coagulation", pageKeys: ["Coagulation"] },
  // Backroom
  { id: "BackroomMain", label: "BackroomMain", group: "Backroom", pageKeys: ["Backroom"] },
  { id: "ESRRegister", label: "ESRRegister", group: "Backroom", pageKeys: ["Backroom"] },
  { id: "BloodGroupRegister", label: "BloodGroupRegister", group: "Backroom", pageKeys: ["Backroom"] },
  { id: "BloodGroupRetesting", label: "Blood Group Retesting", group: "Backroom", pageKeys: ["Backroom"] },
  { id: "SerologyRegister", label: "SerologyRegister", group: "Backroom", pageKeys: ["Backroom"] },
  { id: "RapidCardRegister", label: "RapidCardRegister", group: "Backroom", pageKeys: ["Backroom"] },
  { id: "UrineAnalysisRegister", label: "UrineAnalysisRegister", group: "Backroom", pageKeys: ["Backroom"] },
  { id: "BackroomInventoryTab", label: "BackroomInventoryTab", group: "Backroom", pageKeys: ["Backroom"] },
  // Owner
  { id: "OwnerApp", label: "OwnerApp", group: "Owner", pageKeys: ["OwnerWorkflow"] },
  { id: "workflowfetcher", label: "workflowfetcher", group: "Owner", pageKeys: ["OwnerWorkflow"] },
  { id: "OwnerBiochem", label: "OwnerBiochem", group: "Owner", pageKeys: ["OwnerBiochem"] },
  { id: "OwnerHormones", label: "OwnerHormones", group: "Owner", pageKeys: ["OwnerHormones"] },
  { id: "OwnerHaem", label: "OwnerHaem", group: "Owner", pageKeys: ["Haematology"] },
  { id: "OwnerCoag", label: "OwnerCoag", group: "Owner", pageKeys: ["Coagulation"] },
  { id: "OwnerESR", label: "OwnerESR", group: "Owner", pageKeys: ["OwnerESR", "ESR"] },
  { id: "OwnerSerology", label: "OwnerSerology", group: "Owner", pageKeys: ["OwnerSerology"] },
  { id: "OwnerRapid", label: "OwnerRapid", group: "Owner", pageKeys: ["OwnerRapid"] },
  { id: "OwnerUrine", label: "OwnerUrine", group: "Owner", pageKeys: ["OwnerUrine"] },
  { id: "OwnerBloodGroupTesting", label: "OwnerBloodGroup Testing", group: "Owner", pageKeys: ["OwnerBloodGroup"] },
  { id: "OwnerBloodGroupRetesting", label: "OwnerBloodGroup Retesting", group: "Owner", pageKeys: ["OwnerBloodGroup"] },
  { id: "OwnerLab", label: "OwnerLab", group: "Owner", pageKeys: ["OwnerInsideLab"] },
  { id: "OwnerOutsource", label: "OwnerOutsource", group: "Owner", pageKeys: ["OwnerOutsource"] },
  // Validator / Critical / Analytics
  { id: "ValidatorDashboard", label: "ValidatorDashboard", group: "Validator", pageKeys: ["Validator"] },
  { id: "CriticalAlertDashboard", label: "CriticalAlertDashboard", group: "Validator", pageKeys: ["Critical"] },
  { id: "LabAnalytics", label: "LabAnalytics", group: "Validator", pageKeys: ["LabAnalytics"] },
  // Inventory / ICC
  { id: "InventoryIntake", label: "InventoryIntake", group: "Inventory", pageKeys: ["Inventory"] },
  { id: "InventoryCommandCenter", label: "InventoryCommandCenter", group: "Inventory", pageKeys: ["ICC"] },
  { id: "ICC_LiveInventory", label: "ICC Live Inventory", group: "Inventory", pageKeys: ["ICC"] },
  { id: "ICC_Expiry", label: "ICC Expiry", group: "Inventory", pageKeys: ["ICC"] },
  { id: "ICC_QC", label: "ICC QC & Calibration", group: "Inventory", pageKeys: ["ICC"] },
  { id: "ICC_Ledger", label: "ICC Consumption Ledger", group: "Inventory", pageKeys: ["ICC"] },
  { id: "ICC_Cost", label: "ICC Cost Analytics", group: "Inventory", pageKeys: ["ICC"] },
  { id: "ICC_Consumed", label: "ICC Consumed Inventory", group: "Inventory", pageKeys: ["ICC"] },
  { id: "inventorymapping", label: "inventorymapping", group: "Inventory" },
  // Other
  { id: "InsideLab", label: "InsideLab", group: "Other", pageKeys: ["InsideLab"] },
  { id: "Outsource", label: "Outsource", group: "Other", pageKeys: ["Outsource"] },
  { id: "BackupEntry", label: "BackupEntry", group: "Other", pageKeys: ["Backup"] },
  { id: "BackupInventoryTab", label: "BackupInventoryTab", group: "Other", pageKeys: ["Backup"] },
  // Master Admin
  { id: "MasterAdmin", label: "MasterAdmin", group: "Master Admin", pageKeys: ["MasterAdmin"] },
  { id: "MasterAdmin1", label: "MasterAdmin1", group: "Master Admin", pageKeys: ["MasterAdmin"] },
  // Engineering
  { id: "EngineeringDashboard", label: "Engineering Dashboard", group: "Engineering", pageKeys: ["Engineering"] },
];

const BY_ID = Object.fromEntries(FIRST_CLASS_MODULES.map((m) => [m.id, m]));

/**
 * EngComponent display name → moduleId (context-free).
 * Ambiguous names (Inventory Tab) resolved via parent / page in resolveModuleId.
 */
const NAME_MAP = {
  "Patient Entry": "PatientEntry",
  MasterView_Table: "MasterView_Table",
  MasterView_Rectangle: "MasterView_Rectangle",
  MasterView_Table1: "MasterView_Table1",
  "Biochemistry.jsx": "BiochemistryMain",
  BiochemistryMain: "BiochemistryMain",
  "Hormones Tab": "HormonesMain",
  HormonesMain: "HormonesMain",
  "Haematology.jsx": "Haematology",
  Haematology: "Haematology",
  "Coagulation.jsx": "CoagulationMain",
  CoagulationMain: "CoagulationMain",
  "Backroom.jsx": "BackroomMain",
  BackroomMain: "BackroomMain",
  ESR: "ESRRegister",
  ESRRegister: "ESRRegister",
  "Blood Group": "BloodGroupRegister",
  BloodGroupRegister: "BloodGroupRegister",
  "Blood Group Retesting": "BloodGroupRetesting",
  Serology: "SerologyRegister",
  SerologyRegister: "SerologyRegister",
  "Rapid Card": "RapidCardRegister",
  RapidCardRegister: "RapidCardRegister",
  Urine: "UrineAnalysisRegister",
  UrineAnalysisRegister: "UrineAnalysisRegister",
  "OwnerApp.jsx": "OwnerApp",
  OwnerApp: "OwnerApp",
  "Workflow Fetcher": "workflowfetcher",
  workflowfetcher: "workflowfetcher",
  OwnerBiochem: "OwnerBiochem",
  OwnerHormones: "OwnerHormones",
  OwnerHaem: "OwnerHaem",
  OwnerCoag: "OwnerCoag",
  OwnerESR: "OwnerESR",
  OwnerSerology: "OwnerSerology",
  OwnerRapid: "OwnerRapid",
  OwnerUrine: "OwnerUrine",
  OwnerBloodGroupTesting: "OwnerBloodGroupTesting",
  OwnerBloodGroupRetesting: "OwnerBloodGroupRetesting",
  OwnerLab: "OwnerLab",
  OwnerOutsource: "OwnerOutsource",
  "Validator.jsx": "ValidatorDashboard",
  ValidatorDashboard: "ValidatorDashboard",
  "Critical Dashboard": "CriticalAlertDashboard",
  CriticalAlertDashboard: "CriticalAlertDashboard",
  LabAnalytics: "LabAnalytics",
  "Inventory Intake": "InventoryIntake",
  InventoryIntake: "InventoryIntake",
  InventoryAdjustmentTab: "InventoryAdjustmentTab",
  "ICC Shell": "InventoryCommandCenter",
  InventoryCommandCenter: "InventoryCommandCenter",
  "Live Inventory": "ICC_LiveInventory",
  Expiry: "ICC_Expiry",
  "QC Monitor": "ICC_QC",
  Ledger: "ICC_Ledger",
  "Cost Analytics": "ICC_Cost",
  Consumed: "ICC_Consumed",
  InsideLab: "InsideLab",
  Outsource: "Outsource",
  BackupEntry: "BackupEntry",
  BackupInventoryTab: "BackupInventoryTab",
  MasterAdmin: "MasterAdmin",
  MasterAdmin1: "MasterAdmin1",
  "Dashboard Shell": "EngineeringDashboard",
  EngineeringDashboard: "EngineeringDashboard",
};

/** Presentational EngComponent names — never first-class modules */
const NON_MODULE_NAMES = new Set([
  "Toolbar",
  "Filter Bar",
  "Filters",
  "User Menu",
  "Critical Alerts",
  "Patient Register Table",
  "Alerts Table",
  "Main Register",
  "KPIs",
  "Charts",
  "Staff Analytics",
  "Active Tab",
  "Bill Form",
]);

/**
 * @param {string | null | undefined} componentName
 * @param {{ page?: string, parent?: string | null, moduleId?: string | null }} [ctx]
 * @returns {string}
 */
export function resolveModuleId(componentName, ctx = {}) {
  if (ctx.moduleId && BY_ID[ctx.moduleId]) return ctx.moduleId;
  const name = componentName || "";
  if (NAME_MAP[name]) return NAME_MAP[name];

  // Ambiguous inventory tab — use parent / page
  if (name === "Inventory Tab") {
    const p = String(ctx.parent || "");
    const page = String(ctx.page || "");
    if (p.includes("Haematology") || page === "Haematology") return "HaemInventoryTab";
    if (p.includes("Coagulation") || page === "Coagulation") return "CoagulationInventoryTab";
    if (p.includes("Backroom") || page === "Backroom") return "BackroomInventoryTab";
    return "DeptInventoryTab";
  }

  if (NON_MODULE_NAMES.has(name)) {
    // Climb to parent module if possible
    if (ctx.parent && NAME_MAP[ctx.parent]) return NAME_MAP[ctx.parent];
    return pageFallback(ctx.page);
  }

  return pageFallback(ctx.page);
}

function pageFallback(page) {
  const p = String(page || "");
  for (const m of FIRST_CLASS_MODULES) {
    if (m.pageKeys?.includes(p)) return m.id;
  }
  if (p.startsWith("Owner")) return p;
  return p || "unknown";
}

/**
 * Walk active component stack (top = deepest) → first-class moduleId.
 * @param {string[]} stack
 * @param {{ page?: string, moduleByName?: Map<string, string> }} [ctx]
 */
export function resolveModuleFromStack(stack, ctx = {}) {
  const names = Array.isArray(stack) ? [...stack].reverse() : [];
  for (const name of names) {
    if (NON_MODULE_NAMES.has(name)) continue;
    const forced = ctx.moduleByName?.get(name);
    if (forced && BY_ID[forced]) return forced;
    const id = resolveModuleId(name, { page: ctx.page, parent: null });
    if (id && id !== "unknown" && BY_ID[id]) return id;
    if (NAME_MAP[name]) return NAME_MAP[name];
  }
  return pageFallback(ctx.page);
}

export function getModuleDef(moduleId) {
  return BY_ID[moduleId] || null;
}

export function moduleGroups() {
  const g = {};
  for (const m of FIRST_CLASS_MODULES) {
    (g[m.group] || (g[m.group] = [])).push(m);
  }
  return g;
}

export function isFirstClassModule(id) {
  return !!BY_ID[id];
}
