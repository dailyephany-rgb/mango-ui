/**
 * Shared Firestore collection / department maps.
 * Collection names and field keys must stay identical to production data.
 */

export const VALIDATOR_COLLECTIONS = [
  "biochemistry_register",
  "hormones_main",
  "biochem_backup",
  "hormones_backup",
  "coagulation_register",
  "haematology_register",
  "esr_register",
  "bloodgroup_testing_register",
  "bloodgroup_retesting_register",
  "serology_register",
  "rapid_card_register",
  "urine_analysis_register",
];

export const COMPLETION_FIELDS = {
  biochemistry_register: "biochemistryCompletedAt",
  hormones_main: "hormonesCompletedAt",
  coagulation_register: "coagulationCompletedAt",
  haematology_register: "haematologyCompletedAt",
  esr_register: "esrCompletedAt",
  bloodgroup_testing_register: "bloodGroupCompletedAt",
  bloodgroup_retesting_register: "bloodGroupCompletedAt",
  serology_register: "serologyCompletedAt",
  rapid_card_register: "rapidCardCompletedAt",
  urine_analysis_register: "urineCompletedAt",
};

export const ROUTINE_DEPARTMENTS = {
  biochemistry_register: "Bio-Chemistry",
  hormones_main: "Hormones",
  coagulation_register: "Coagulation",
  haematology_register: "Haematology",
  esr_register: "ESR",
  bloodgroup_testing_register: "Blood Group",
  bloodgroup_retesting_register: "Blood Group",
  serology_register: "Serology",
  rapid_card_register: "Rapid Card",
  urine_analysis_register: "Urine Analysis",
};

export const MASTER_ADMIN_DEPARTMENTS = [
  { id: "master_register", label: "Master (Registration)" },
  { id: "biochemistry_register", label: "Biochemistry" },
  { id: "serology_register", label: "Serology" },
  { id: "urine_analysis_register", label: "Urine Analysis" },
  { id: "bloodgroup_testing_register", label: "Blood Group (Test)" },
  { id: "bloodgroup_retesting_register", label: "Blood Group (Retest)" },
  { id: "rapid_card_register", label: "Rapid Card" },
  { id: "esr_register", label: "ESR" },
  { id: "hormones_main", label: "Hormones" },
  { id: "haematology_register", label: "Haematology" },
  { id: "coagulation_register", label: "Coagulation" },
  { id: "outsource_tracking", label: "Outside Tracking" },
  { id: "inside_lab_results", label: "Inside Lab" },
  { id: "critical_alerts", label: "Critical Alerts" },
];

/** Validator display/fallback date fields (query scopes on timePrinted). */
export const VALIDATOR_DATE_FIELDS = [
  "timePrinted",
  "savedTime",
  "timestamp",
  "scannedTime",
];

/**
 * Performance & Diagnostics daily rollups (additive; not LIMS clinical data).
 * Doc id: `${date}__${clientId}` with field `date: YYYY-MM-DD` for range queries.
 */
export const PERF_DAILY_COLLECTION = "perf_daily";
