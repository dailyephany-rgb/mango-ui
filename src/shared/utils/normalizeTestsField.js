/**
 * Shared owner-analytics test-field normalization.
 * Behavior matches historical dataFetcher normalizeTestsField.
 */
export function normalizeTestsField(field) {
  if (!field) return [];
  if (Array.isArray(field)) {
    return field
      .map((v) => {
        if (typeof v === "string") return v;
        if (v && typeof v === "object") {
          return v.test || v.name || v.testName || null;
        }
        return null;
      })
      .filter(Boolean)
      .map((s) => String(s).trim());
  }
  if (typeof field === "string") {
    return field
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}
