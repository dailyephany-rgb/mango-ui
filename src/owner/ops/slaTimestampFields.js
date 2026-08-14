/**
 * Shared timestamp / staff fields for SLA violator rows (turnaround PDF).
 * @param {Record<string, unknown>} row
 */
export function slaTimestampFields(row = {}) {
  return {
    timeCollected: row.timeCollected ?? null,
    timeScanned: row.timeScanned ?? null,
    timeSaved: row.timeSaved ?? null,
    timeValidated: row.timeValidated ?? null,
    savedBy: row.savedBy || "NA",
    validatedBy: row.validatedBy || "NA",
  };
}
