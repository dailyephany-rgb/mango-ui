/**
 * Parse raw Lab sales Excel into row objects (Phase 1).
 * Does not mutate the uploaded file.
 */

import * as XLSX from "xlsx";
import { classifySalesRow, CLASSIFICATION } from "./classification.js";

/**
 * @param {ArrayBuffer} buffer
 * @returns {{ rows: object[], sheetName: string, fileMeta: { rowCount: number } }}
 */
export function parseSalesExcelBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  return {
    sheetName,
    rows: rawRows,
    fileMeta: { rowCount: rawRows.length },
  };
}

/**
 * @param {object} originalRow
 * @param {number} index
 */
export function buildProcessedEntry(originalRow, index) {
  const classification = classifySalesRow(originalRow);
  const regNo = String(originalRow.Regno ?? originalRow.RegNo ?? "").trim();
  const diagnosticNo = String(originalRow.AccessionNo ?? "").trim();

  return {
    id: `sales-${index}-${regNo || "row"}-${originalRow.BillNo ?? index}`,
    originalRow,
    regNo,
    diagnosticNo,
    name: String(originalRow.Name ?? "").trim(),
    investigation: String(originalRow.Investigation ?? "").trim(),
    category: String(originalRow.Category ?? "").trim(),
    amount: originalRow.Amount,
    discount: originalRow.Discount,
    netamt: originalRow.Netamt,
    originalClassification: classification,
    currentClassification: classification,
    classificationSource: "automatic",
    movedAt: null,
    movedBy: null,
  };
}

/**
 * @param {object[]} rawRows
 */
export function processSalesRows(rawRows) {
  const entries = rawRows.map((row, i) => buildProcessedEntry(row, i));
  const unclassifiedCount = entries.filter(
    (e) => e.currentClassification === CLASSIFICATION.UNCLASSIFIED
  ).length;
  return { entries, unclassifiedCount };
}
