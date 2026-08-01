/**
 * Normalize patient source labels — matches existing department register behavior.
 */
export function normalizeSource(raw) {
  if (!raw) return "Unknown";
  const s = raw.trim().toLowerCase();
  if (s.includes("opd")) return "OPD";
  if (s.includes("ipd")) return "IPD";
  if (s.includes("third") || s.includes("3rd")) return "Third Floor";
  return "Unknown";
}
