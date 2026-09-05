/**
 * Document / composite key helpers — preserve existing ID shapes.
 *
 * Visit identity: one patient keeps the same regNo; each slip/accession is a
 * separate visit. Firestore ids for that visit are `{regNo}_{diagnosticNo}`.
 */

/** Composite Firestore doc id: `{regNo}_{diagnosticNo}`. */
export function compositeId(regNo, diagnosticNo) {
  return `${regNo}_${diagnosticNo}`;
}

/** Accession / diagnostic number from a register or report row. */
export function visitDiagnosticNo(entry) {
  const v = String(
    entry?.diagnosticNo || entry?.accessionNo || entry?.accNo || ""
  ).trim();
  if (!v || v === "—" || v === "-") return "";
  return v;
}

/**
 * Mango `report_details` doc id for a slip. Same regNo + different accession
 * must yield different ids. Does not apply haem `safeKey`.
 */
export function reportDetailsDocId(entry) {
  const reg = String(entry?.regNo || "").trim();
  const diag = visitDiagnosticNo(entry);
  if (!reg || !diag) return "";
  return compositeId(reg, diag);
}

/** Replace `/` with `-` (haematology / critical alert safeKey). */
export function safeKey(val) {
  return String(val || "").replace(/\//g, "-");
}
