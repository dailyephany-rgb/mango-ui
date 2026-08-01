/**
 * Document / composite key helpers — preserve existing ID shapes.
 */

/** Composite Firestore doc id: `{regNo}_{diagnosticNo}`. */
export function compositeId(regNo, diagnosticNo) {
  return `${regNo}_${diagnosticNo}`;
}

/** Replace `/` with `-` (haematology / critical alert safeKey). */
export function safeKey(val) {
  return String(val || "").replace(/\//g, "-");
}
