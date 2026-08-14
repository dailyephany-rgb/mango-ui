/**
 * Master Admin Compare reconciliation PDF — all four recon tabs.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function cell(v) {
  if (v == null || v === "") return "—";
  return String(v);
}

function ensureSpace(doc, y, need = 28) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + need > pageHeight - 12) {
    doc.addPage();
    return 14;
  }
  return y;
}

function sectionHeading(doc, text, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 10;
  const barH = 8;

  y = ensureSpace(doc, y + 4, barH + 16);
  y += 4;

  doc.setFillColor(30, 58, 138);
  doc.roundedRect(marginX, y - 5.5, pageWidth - marginX * 2, barH, 1.5, 1.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(String(text), marginX + 3, y);
  doc.setTextColor(15, 23, 42);

  return y + barH + 2;
}

function renderSection(doc, y, { title, head, body }) {
  y = sectionHeading(doc, `${title} (${body.length})`, y);

  if (!body.length) {
    y = ensureSpace(doc, y, 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("No rows.", 10, y);
    doc.setTextColor(15, 23, 42);
    return y + 8;
  }

  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    margin: { left: 10, right: 10 },
    styles: {
      fontSize: 7,
      cellPadding: 1.2,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 7,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  return (doc.lastAutoTable?.finalY ?? y) + 6;
}

function ghostTests(row) {
  if (!Array.isArray(row.selectedTests)) return "—";
  return (
    row.selectedTests
      .map((t) => (typeof t === "string" ? t : t?.test))
      .filter(Boolean)
      .join(", ") || "—"
  );
}

/**
 * @param {object} reconData
 */
export function downloadCompareReconPdf(reconData) {
  if (!reconData) return;

  const missing = reconData.missing || [];
  const ghost = reconData.ghost || [];
  const mismatch = reconData.mismatch || [];
  const extraInLab = reconData.extraInLab || [];
  const stats = reconData.stats || {};

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(30, 58, 138);
  doc.text("Mango LIMS — Master Register Compare Report", pageWidth / 2, y, {
    align: "center",
  });
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(`Match Rate: ${stats.rate ?? "—"}%`, 10, y);
  y += 4.5;
  doc.text(`Total Hospital Bills: ${stats.total ?? 0}`, 10, y);
  y += 4.5;
  doc.text(`Lab Total (Filtered): ${stats.labTotal ?? 0}`, 10, y);
  y += 4.5;
  doc.text(`Generated: ${new Date().toLocaleString()}`, 10, y);
  y += 8;

  y = renderSection(doc, y, {
    title: "Entry exist only in hospital system",
    head: ["DIAGNOSTIC NO", "REG NO", "NAME", "HOSPITAL (CONVERTED LIST)"],
    body: missing.map((m) => [
      cell(m.diagnosticNo),
      cell(m.regNo),
      cell(m.name),
      cell(m.testsString),
    ]),
  });

  y = renderSection(doc, y, {
    title: "Entry exist only in our system",
    head: ["DIAGNOSTIC NO", "NAME", "SOURCE", "REGISTERED TESTS"],
    body: ghost.map((m) => [
      cell(m.diagnosticNo),
      cell(m.name),
      cell(m.source),
      cell(ghostTests(m)),
    ]),
  });

  y = renderSection(doc, y, {
    title: "Tests missing in our system",
    head: [
      "DIAGNOSTIC NO",
      "NAME",
      "HOSPITAL (ALL TESTS)",
      "OUR SYSTEM (LAB)",
      "MISSING IN LAB",
    ],
    body: mismatch.map((m) => [
      cell(m.lab?.diagnosticNo),
      cell(m.lab?.name),
      cell(m.hTests),
      cell(m.actual),
      cell(m.missingTests),
    ]),
  });

  renderSection(doc, y, {
    title: "Tests missing in hospital system",
    head: [
      "DIAGNOSTIC NO",
      "NAME",
      "HOSPITAL (ALL TESTS)",
      "OUR SYSTEM (LAB)",
      "EXTRA IN LAB",
    ],
    body: extraInLab.map((m) => [
      cell(m.lab?.diagnosticNo),
      cell(m.lab?.name),
      cell(m.hTests),
      cell(m.actual),
      cell(m.extraTests),
    ]),
  });

  const dateStr = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  doc.save(`compare-recon-${dateStr}.pdf`);
}
