/**
 * Uppercase test-field normalization used by Inside Lab / Outsource owner fetchers.
 * Preserves selectedTest + toUpperCase behaviour (different from normalizeTestsField).
 */
export function normalizeTestsFieldUpper(field) {
  if (!field) return [];
  if (Array.isArray(field)) {
    return field
      .map((v) => {
        if (v && typeof v === "object") {
          return v.test || v.name || v.testName || v.selectedTest;
        }
        if (typeof v === "string") return v;
        return null;
      })
      .filter(Boolean)
      .map((s) => String(s).trim().toUpperCase());
  }
  if (typeof field === "string") {
    return field
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }
  return [];
}
