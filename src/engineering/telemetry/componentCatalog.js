/**
 * Expected architectural components per page (Tier-1 only).
 * Used to emit "Not Mounted" slots for siblings that never opened.
 * Names must match EngComponent `name` props.
 */

/** @typedef {{ name: string, type: string, parent: string | null }} CompSpec */

/** @type {Record<string, CompSpec[]>} */
export const COMPONENT_CATALOG = {
  Mango: [
    { name: "Patient Entry", type: "Forms", parent: "Mango" },
    { name: "MasterView_Table", type: "Tables", parent: "Mango" },
    { name: "MasterView_Rectangle", type: "Tables", parent: "Mango" },
    { name: "User Menu", type: "Layout", parent: "Mango" },
  ],
  Biochemistry: [
    { name: "Biochemistry.jsx", type: "Page", parent: null },
    { name: "Toolbar", type: "Layout", parent: "Biochemistry.jsx" },
    { name: "Filter Bar", type: "Layout", parent: "Biochemistry.jsx" },
    { name: "Patient Register Table", type: "Tables", parent: "Biochemistry.jsx" },
    { name: "Critical Alerts", type: "Dialogs", parent: "Biochemistry.jsx" },
    { name: "Inventory Tab", type: "Tables", parent: "Biochemistry.jsx" },
    { name: "Hormones Tab", type: "Page", parent: "Biochemistry.jsx" },
  ],
  Haematology: [
    { name: "Haematology.jsx", type: "Page", parent: null },
    { name: "Toolbar", type: "Layout", parent: "Haematology.jsx" },
    { name: "Filter Bar", type: "Layout", parent: "Haematology.jsx" },
    { name: "Patient Register Table", type: "Tables", parent: "Haematology.jsx" },
    { name: "Critical Alerts", type: "Dialogs", parent: "Haematology.jsx" },
    { name: "Inventory Tab", type: "Tables", parent: "Haematology.jsx" },
  ],
  Coagulation: [
    { name: "Coagulation.jsx", type: "Page", parent: null },
    { name: "Toolbar", type: "Layout", parent: "Coagulation.jsx" },
    { name: "Filter Bar", type: "Layout", parent: "Coagulation.jsx" },
    { name: "Patient Register Table", type: "Tables", parent: "Coagulation.jsx" },
    { name: "Critical Alerts", type: "Dialogs", parent: "Coagulation.jsx" },
    { name: "Inventory Tab", type: "Tables", parent: "Coagulation.jsx" },
  ],
  Backroom: [
    { name: "Backroom.jsx", type: "Page", parent: null },
    { name: "Toolbar", type: "Layout", parent: "Backroom.jsx" },
    { name: "ESR", type: "Tables", parent: "Backroom.jsx" },
    { name: "Blood Group", type: "Tables", parent: "Backroom.jsx" },
    { name: "Blood Group Retesting", type: "Tables", parent: "Backroom.jsx" },
    { name: "Rapid Card", type: "Tables", parent: "Backroom.jsx" },
    { name: "Urine", type: "Tables", parent: "Backroom.jsx" },
    { name: "Serology", type: "Tables", parent: "Backroom.jsx" },
    { name: "Inventory Tab", type: "Tables", parent: "Backroom.jsx" },
  ],
  OwnerWorkflow: [
    { name: "OwnerApp.jsx", type: "Page", parent: null },
    { name: "Filters", type: "Layout", parent: "OwnerApp.jsx" },
    { name: "Workflow Fetcher", type: "Data", parent: "OwnerApp.jsx" },
    { name: "KPIs", type: "Charts", parent: "OwnerApp.jsx" },
    { name: "Charts", type: "Charts", parent: "OwnerApp.jsx" },
    { name: "Staff Analytics", type: "Charts", parent: "OwnerApp.jsx" },
  ],
  Validator: [
    { name: "Validator.jsx", type: "Page", parent: null },
    { name: "Toolbar", type: "Layout", parent: "Validator.jsx" },
    { name: "Filters", type: "Layout", parent: "Validator.jsx" },
    { name: "Main Register", type: "Tables", parent: "Validator.jsx" },
  ],
  Critical: [
    { name: "Critical Dashboard", type: "Page", parent: null },
    { name: "Filters", type: "Layout", parent: "Critical Dashboard" },
    { name: "Alerts Table", type: "Tables", parent: "Critical Dashboard" },
  ],
  Inventory: [
    { name: "Inventory Intake", type: "Page", parent: null },
    { name: "Bill Form", type: "Forms", parent: "Inventory Intake" },
  ],
  ICC: [
    { name: "ICC Shell", type: "Page", parent: null },
    { name: "Live Inventory", type: "Tables", parent: "ICC Shell" },
    { name: "Expiry", type: "Tables", parent: "ICC Shell" },
    { name: "QC Monitor", type: "QC", parent: "ICC Shell" },
    { name: "Ledger", type: "Tables", parent: "ICC Shell" },
    { name: "Cost Analytics", type: "Charts", parent: "ICC Shell" },
  ],
  Engineering: [
    { name: "Dashboard Shell", type: "Page", parent: null },
    { name: "Filter Bar", type: "Layout", parent: "Dashboard Shell" },
    { name: "Active Tab", type: "Layout", parent: "Dashboard Shell" },
  ],
};

/**
 * @param {string} page
 * @returns {CompSpec[]}
 */
export function catalogForPage(page) {
  if (!page) return [];
  if (COMPONENT_CATALOG[page]) return COMPONENT_CATALOG[page];
  if (String(page).startsWith("Owner")) {
    return [
      { name: `${page}`, type: "Page", parent: null },
      { name: "Filters", type: "Layout", parent: page },
      { name: "KPIs", type: "Charts", parent: page },
      { name: "Charts", type: "Charts", parent: page },
    ];
  }
  return [{ name: page, type: "Page", parent: null }];
}
