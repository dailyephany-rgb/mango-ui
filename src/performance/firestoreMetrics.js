/**
 * Classify Firestore collections into read buckets + page identity helpers.
 */

const DEPT_COLLECTIONS = {
  biochemistry_register: "Biochemistry",
  hormones_main: "Hormones",
  haematology_register: "Haematology",
  coagulation_register: "Coagulation",
  serology_register: "Serology",
  urine_analysis_register: "Urine",
  rapid_card_register: "RapidCard",
  esr_register: "ESR",
  bloodgroup_testing_register: "BloodGroup",
  bloodgroup_retesting_register: "BloodGroup",
  inside_lab_results: "InsideLab",
  outsource_tracking: "Outsource",
  backup_entries_logs: "Backup",
};

export function classifyCollection(collectionName) {
  const name = collectionName || "unknown";
  if (name === "master_register") return "Master Register";
  if (name === "critical_alerts") return "Critical Alerts";
  if (
    name === "inventory_logs" ||
    name === "inventory_adjustments" ||
    name === "consumption_ledger" ||
    name === "combo_consumption_ledger" ||
    name === "qc_logs" ||
    name === "calibration_logs"
  ) {
    return "Inventory";
  }
  if (name === "report_details") return "Owner";
  if (DEPT_COLLECTIONS[name]) return "Department Register";
  return "Other";
}

export function departmentForCollection(collectionName) {
  return DEPT_COLLECTIONS[collectionName] || null;
}

/** Infer page + department from pathname / HTML filename. */
export function resolvePageIdentity() {
  const path =
    (typeof location !== "undefined" &&
      (location.pathname.split("/").pop() || location.pathname)) ||
    "";
  const p = path.toLowerCase();

  // Include Vite rollup short names (/coag, /haem, /biochem) — without these,
  // pathname "coag" was stored as page "coag" and never showed as Coagulation on Timeline.
  const map = [
    [
      /^(?:index_)?biochem(?:istry)?(?:\.html)?$|owner_biochem/,
      {
        page: p.includes("owner") ? "OwnerBiochem" : "Biochemistry",
        department: "Biochemistry",
        bucket: p.includes("owner") ? "Owner" : "Department Register",
      },
    ],
    [
      /^(?:index_)?haem(?:atology)?(?:\.html)?$|owner_haem/,
      {
        page: "Haematology",
        department: "Haematology",
        bucket: p.includes("owner") ? "Owner" : "Department Register",
      },
    ],
    [
      /^(?:index_)?coag(?:ulation)?(?:\.html)?$|owner_coag/,
      {
        page: "Coagulation",
        department: "Coagulation",
        bucket: p.includes("owner") ? "Owner" : "Department Register",
      },
    ],
    [
      /hormones|owner_hormones/,
      {
        page: p.includes("owner") ? "OwnerHormones" : "Hormones",
        department: "Hormones",
        bucket: p.includes("owner") ? "Owner" : "Department Register",
      },
    ],
    [/index_backroom|backroom/, { page: "Backroom", department: "Backroom", bucket: "Department Register" }],
    [/validator/, { page: "Validator", department: "Validator", bucket: "Department Register" }],
    [/critical/, { page: "Critical", department: "Critical", bucket: "Critical Alerts" }],
    [/commandcenter/, { page: "ICC", department: "Inventory", bucket: "Inventory" }],
    [/inventory\.html|main_inventory/, { page: "Inventory", department: "Inventory", bucket: "Inventory" }],
    [/master_admin/, { page: "MasterAdmin", department: "Admin", bucket: "Other" }],
    [/analytics/, { page: "LabAnalytics", department: "Analytics", bucket: "Analytics" }],
    [/index_owner\.html|main_owner\.jsx/, { page: "OwnerWorkflow", department: "Owner", bucket: "Owner" }],
    [/owner_urine|index_owner_urine/, { page: "OwnerUrine", department: "Urine", bucket: "Owner" }],
    [/owner_esr/, { page: "OwnerESR", department: "ESR", bucket: "Owner" }],
    [/owner_serology/, { page: "OwnerSerology", department: "Serology", bucket: "Owner" }],
    [/owner_rapid/, { page: "OwnerRapid", department: "RapidCard", bucket: "Owner" }],
    [/owner_blood/, { page: "OwnerBloodGroup", department: "BloodGroup", bucket: "Owner" }],
    [/owner_outsource/, { page: "OwnerOutsource", department: "Outsource", bucket: "Owner" }],
    [/owner_lab/, { page: "OwnerInsideLab", department: "InsideLab", bucket: "Owner" }],
    [/index_inside_lab|inside_lab/, { page: "InsideLab", department: "InsideLab", bucket: "Department Register" }],
    [/index_outsource|outsource/, { page: "Outsource", department: "Outsource", bucket: "Department Register" }],
    [/index_backup|backup/, { page: "Backup", department: "Backup", bucket: "Department Register" }],
    [/performance/, { page: "Performance", department: "Engineering", bucket: "Other" }],
    [/engineering/, { page: "Engineering", department: "Engineering", bucket: "Other" }],
    [/^index\.html$|^\/$|mango/, { page: "Mango", department: "Registration", bucket: "Other" }],
  ];

  for (const [re, info] of map) {
    if (re.test(p)) {
      return { ...info, path: p };
    }
  }

  // Owner pages that matched hormones path above carefully — fix owner_hormones
  if (p.includes("owner_hormones")) {
    return { page: "OwnerHormones", department: "Hormones", bucket: "Owner", path: p };
  }
  if (p.includes("owner_biochem") === false && p.includes("hormones")) {
    return { page: "Hormones", department: "Hormones", bucket: "Department Register", path: p };
  }

  return {
    page: p.replace(/\.html$/, "") || "unknown",
    department: "Unknown",
    bucket: "Other",
    path: p,
  };
}

export function extractCollectionName(refOrQuery) {
  try {
    if (!refOrQuery) return "unknown";
    if (typeof refOrQuery === "string") return refOrQuery;
    if (refOrQuery.__mangoCollection) return refOrQuery.__mangoCollection;
    // DocumentReference / CollectionReference
    if (refOrQuery.path && typeof refOrQuery.path === "string") {
      return refOrQuery.path.split("/")[0] || "unknown";
    }
    if (refOrQuery.type === "collection" && refOrQuery.id) return refOrQuery.id;
    if (refOrQuery.id && (refOrQuery.parent == null || refOrQuery.parent === null)) {
      return refOrQuery.id;
    }
    // Modular Query internals (best-effort)
    const segs =
      refOrQuery._query?.path?.segments ||
      refOrQuery._query?.path?.len ||
      null;
    if (Array.isArray(segs) && segs.length) return segs[0];
    if (typeof refOrQuery.toString === "function") {
      const s = String(refOrQuery);
      const m = s.match(/\/?([a-zA-Z0-9_]+)(?:\/|\s|$)/);
      if (m) return m[1];
    }
  } catch {
    /* ignore */
  }
  return "unknown";
}
