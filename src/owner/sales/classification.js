/**
 * Sales Data Phase 1 — classification masters & rules.
 * Client-side only; no Firestore writes.
 */

export const CLASSIFICATION = Object.freeze({
  COMPLEMENTARY: "COMPLEMENTARY",
  SEMEN_ANALYSIS: "SEMEN_ANALYSIS",
  CGHS_RGH_LOOP: "CGHS_RGH_LOOP",
  GENERAL_LOOP: "GENERAL_LOOP",
  DARK_BLUE: "DARK_BLUE",
  LIGHT_ORANGE: "LIGHT_ORANGE",
  UNCLASSIFIED: "UNCLASSIFIED",
});

/** Six review bins (Phase 1). UNCLASSIFIED is tracked separately for admin review. */
export const SALES_TABS = Object.freeze([
  {
    id: CLASSIFICATION.COMPLEMENTARY,
    label: "Complementary",
    tone: "complementary",
  },
  {
    id: CLASSIFICATION.SEMEN_ANALYSIS,
    label: "Semen Analysis",
    tone: "semen",
  },
  {
    id: CLASSIFICATION.CGHS_RGH_LOOP,
    label: "CGHS/RGHS",
    tone: "cghs",
  },
  {
    id: CLASSIFICATION.GENERAL_LOOP,
    label: "General",
    tone: "general",
  },
  {
    id: CLASSIFICATION.DARK_BLUE,
    label: "Dark Blue",
    tone: "darkBlue",
  },
  {
    id: CLASSIFICATION.LIGHT_ORANGE,
    label: "Light Orange",
    tone: "lightOrange",
  },
]);

/** Authoritative CGHS/RGHS loop master list (Phase 1). */
export const CGHS_RGH_CATEGORIES = Object.freeze([
  "AAI",
  "CAPF",
  "CGHS",
  "Chiranjeevi",
  "ECHS",
  "ESI",
  "Food Corporation of India",
  "Health Package",
  "IIT",
  "ISRO",
  "ICMR",
  "DRDO",
  "NIFT",
  "Railways",
  "Rajasthan State Government",
  "RGHS",
  "RGHS Reimbursement",
]);

/** Authoritative General loop master list (Phase 1). */
export const GENERAL_CATEGORIES = Object.freeze([
  "GENERAL",
  "Indian Oil",
  "OIL INDIA",
  "ONGC",
  "ONGC PME",
  "Reliance",
  "RHB",
  "TPA",
]);

/**
 * Map real Excel category strings → master list label (normalized key).
 * Does not change the authoritative master lists — only matching aliases.
 */
const CATEGORY_ALIASES = Object.freeze({
  "chiranjeevi swasthya bima yojana": "chiranjeevi",
  "health package": "health package",
  "rghs (reimbursement)": "rghs reimbursement",
  "rghs reimbursement": "rghs reimbursement",
  rghs: "rghs",
  "indian oil corporation limited": "indian oil",
  "indian oil": "indian oil",
});

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeLabel(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function buildMasterSet(list) {
  return new Set(list.map((x) => normalizeLabel(x)));
}

const CGHS_SET = buildMasterSet(CGHS_RGH_CATEGORIES);
const GENERAL_SET = buildMasterSet(GENERAL_CATEGORIES);

/**
 * Resolve category to a master-list normalized key, or null if unmatched.
 * @param {unknown} category
 * @returns {string | null}
 */
export function resolveCategoryKey(category) {
  const raw = normalizeLabel(category);
  if (!raw) return null;
  const aliased = CATEGORY_ALIASES[raw] || raw;
  if (CGHS_SET.has(aliased) || GENERAL_SET.has(aliased)) return aliased;
  // Prefix / contains helpers for known variants (e.g. ONGC PME vs ONGC)
  if (aliased.startsWith("ongc")) {
    if (GENERAL_SET.has("ongc pme") && /\bpme\b/.test(aliased)) return "ongc pme";
    if (GENERAL_SET.has("ongc")) return "ongc";
  }
  if (aliased.includes("rghs")) {
    if (aliased.includes("reimburs")) return "rghs reimbursement";
    return "rghs";
  }
  if (aliased.includes("chiranjeevi")) return "chiranjeevi";
  if (aliased.includes("indian oil")) return "indian oil";
  if (aliased === "health package" || aliased.includes("health package")) {
    return "health package";
  }
  return aliased;
}

/**
 * Discount = 100% rule.
 * Handles Excel forms: "100%", 100, 1 (ratio), and full-amount rupee discount
 * (Discount === Amount) which is how the Jul 2026 export represents 100% off.
 *
 * @param {unknown} discount
 * @param {unknown} amount
 */
export function isComplementaryDiscount(discount, amount) {
  if (discount == null || discount === "") return false;

  if (typeof discount === "string") {
    const t = discount.trim().toLowerCase().replace(/\s+/g, "");
    if (t === "100%" || t === "100") return true;
    if (t.endsWith("%") && Number.parseFloat(t) === 100) return true;
    const asNum = Number(t);
    if (Number.isFinite(asNum)) {
      return isComplementaryDiscount(asNum, amount);
    }
    return false;
  }

  const d = Number(discount);
  if (!Number.isFinite(d)) return false;
  if (d === 100) return true;
  // Ratio form (Excel sometimes stores 100% as 1)
  if (d === 1) return true;

  const a = Number(amount);
  if (Number.isFinite(a) && a > 0) {
    if (Math.abs(d - a) < 0.01) return true;
    if (d > 0 && d / a >= 0.999) return true;
  }
  return false;
}

/**
 * Apply Phase 1 rules in explicit priority order.
 * @param {{ Discount?: unknown, Amount?: unknown, Investigation?: unknown, Category?: unknown }} row
 * @returns {string} CLASSIFICATION id
 */
export function classifySalesRow(row) {
  // Priority 1
  if (isComplementaryDiscount(row?.Discount, row?.Amount)) {
    return CLASSIFICATION.COMPLEMENTARY;
  }
  // Priority 2 — exact investigation match after normalize
  if (normalizeLabel(row?.Investigation) === normalizeLabel("Semen Analysis")) {
    return CLASSIFICATION.SEMEN_ANALYSIS;
  }
  const catKey = resolveCategoryKey(row?.Category);
  // Priority 3
  if (catKey && CGHS_SET.has(catKey)) {
    return CLASSIFICATION.CGHS_RGH_LOOP;
  }
  // Priority 4
  if (catKey && GENERAL_SET.has(catKey)) {
    return CLASSIFICATION.GENERAL_LOOP;
  }
  return CLASSIFICATION.UNCLASSIFIED;
}

export function tabLabel(classificationId) {
  const tab = SALES_TABS.find((t) => t.id === classificationId);
  if (tab) return tab.label;
  if (classificationId === CLASSIFICATION.UNCLASSIFIED) return "Unclassified";
  return classificationId;
}
