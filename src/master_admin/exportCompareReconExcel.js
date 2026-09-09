/**
 * Master Admin Compare reconciliation Excel — four sheets matching the recon tabs / PDF.
 */
import * as XLSX from "xlsx";

function cell(v) {
  if (v == null || v === "") return "";
  return String(v);
}

function ghostTests(row) {
  if (!Array.isArray(row.selectedTests)) return "";
  return (
    row.selectedTests
      .map((t) => (typeof t === "string" ? t : t?.test))
      .filter(Boolean)
      .join(", ") || ""
  );
}

function sheetFromRows(headers, rows) {
  const aoa = [headers, ...rows];
  return XLSX.utils.aoa_to_sheet(aoa);
}

/**
 * @param {object} reconData
 */
export function downloadCompareReconExcel(reconData) {
  if (!reconData) return;

  const missing = reconData.missing || [];
  const ghost = reconData.ghost || [];
  const mismatch = reconData.mismatch || [];
  const extraInLab = reconData.extraInLab || [];
  const stats = reconData.stats || {};

  const workbook = XLSX.utils.book_new();

  const summary = XLSX.utils.aoa_to_sheet([
    ["Mango LIMS — Master Register Compare Report"],
    ["Match Rate %", stats.rate ?? ""],
    ["Total Hospital Bills", stats.total ?? 0],
    ["Lab Total (Filtered)", stats.labTotal ?? 0],
    ["Generated", new Date().toLocaleString()],
    [],
    ["Sheet", "Rows"],
    ["Entry only in hospital", missing.length],
    ["Entry only in our system", ghost.length],
    ["Tests missing in our system", mismatch.length],
    ["Tests missing in hospital", extraInLab.length],
  ]);
  XLSX.utils.book_append_sheet(workbook, summary, "Summary");

  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(
      ["DIAGNOSTIC NO", "REG NO", "NAME", "HOSPITAL (CONVERTED LIST)"],
      missing.map((m) => [
        cell(m.diagnosticNo),
        cell(m.regNo),
        cell(m.name),
        cell(m.testsString),
      ])
    ),
    "Only in hospital"
  );

  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(
      ["DIAGNOSTIC NO", "NAME", "SOURCE", "REGISTERED TESTS"],
      ghost.map((m) => [
        cell(m.diagnosticNo),
        cell(m.name),
        cell(m.source),
        cell(ghostTests(m)),
      ])
    ),
    "Only in our system"
  );

  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(
      [
        "DIAGNOSTIC NO",
        "NAME",
        "HOSPITAL (ALL TESTS)",
        "OUR SYSTEM (LAB)",
        "MISSING IN LAB",
      ],
      mismatch.map((m) => [
        cell(m.lab?.diagnosticNo),
        cell(m.lab?.name),
        cell(m.hTests),
        cell(m.actual),
        cell(m.missingTests),
      ])
    ),
    "Tests missing in lab"
  );

  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(
      [
        "DIAGNOSTIC NO",
        "NAME",
        "HOSPITAL (ALL TESTS)",
        "OUR SYSTEM (LAB)",
        "EXTRA IN LAB",
      ],
      extraInLab.map((m) => [
        cell(m.lab?.diagnosticNo),
        cell(m.lab?.name),
        cell(m.hTests),
        cell(m.actual),
        cell(m.extraTests),
      ])
    ),
    "Tests missing in hospital"
  );

  const dateStr = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  XLSX.writeFile(workbook, `compare-recon-${dateStr}.xlsx`);
}
