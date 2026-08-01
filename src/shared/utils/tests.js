/**
 * Test-name helpers used across department registers.
 */

/** Extract display/test name from string or `{ test | name }` object. */
export function getTestName(t) {
  if (typeof t === "string") return t;
  return t?.test || "";
}

/** Lowercased test name (haematology canonical matching). */
export function extractTestName(t) {
  if (!t) return "";
  if (typeof t === "string") return t.toLowerCase();
  if (typeof t === "object" && (t.test || t.name)) {
    return (t.test || t.name).toLowerCase();
  }
  return "";
}

/** Bidirectional includes match against a canonical test name. */
export function entryHasCanonicalTest(entry, canonical) {
  const target = canonical.toLowerCase();
  const arr = entry.selectedTests || [];

  return arr.some((x) => {
    const raw = extractTestName(x);
    return raw.includes(target) || target.includes(raw);
  });
}
