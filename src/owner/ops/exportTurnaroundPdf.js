/**
 * Turnaround Report PDF — SLA delay/turnaround violator tables by department.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const HEAD = [
  "Reg No",
  "Diag No",
  "Name",
  "Test",
  "Dept",
  "Time Collected",
  "Time Scanned",
  "Time Saved",
  "Time Validated",
  "Saved By",
  "Validated By",
  "Duration (min)",
  "Allowed (min)",
  "Status",
];

function formatTs(value) {
  if (value == null || value === "" || value === "NA" || value === "—") {
    return "—";
  }
  try {
    const d =
      value instanceof Date
        ? value
        : typeof value?.toDate === "function"
          ? value.toDate()
          : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  } catch {
    return "—";
  }
}

function cell(v) {
  if (v == null || v === "" || v === "NA") return "—";
  return String(v);
}

function pendingSectionHeading(doc, text, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 10;
  const barH = 8;

  y = ensureSpace(doc, y + 6, barH + 14);
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

function ensureSpace(doc, y, need = 40) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + need > pageHeight - 12) {
    doc.addPage();
    return 14;
  }
  return y;
}

function rowToCells(r) {
  return [
    cell(r.regNo),
    cell(r.diagnosticNo),
    cell(r.name),
    cell(r.test),
    cell(r.dept),
    formatTs(r.timeCollected),
    formatTs(r.timeScanned),
    formatTs(r.timeSaved),
    formatTs(r.timeValidated),
    cell(r.savedBy),
    cell(r.validatedBy),
    cell(r.duration),
    cell(r.allowed),
    cell(r.status),
  ];
}

/**
 * @param {{
 *   dateFrom?: string,
 *   dateTo?: string,
 *   source?: string,
 *   sections?: Array<{ title: string, rows: object[] }>,
 * }} opts
 */
export async function downloadTurnaroundPdf(opts = {}) {
  const {
    dateFrom = "",
    dateTo = "",
    source = "All",
    sections = [],
  } = opts;

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
  doc.text("Mango LIMS — Turnaround Report", pageWidth / 2, y, {
    align: "center",
  });
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(`Date range: ${dateFrom || "—"} → ${dateTo || "—"}`, 10, y);
  y += 4.5;
  doc.text(`Source: ${source || "All"}`, 10, y);
  y += 4.5;
  doc.text(`Generated: ${new Date().toLocaleString()}`, 10, y);
  y += 4.5;
  doc.setTextColor(100, 116, 139);
  doc.text(
    "SLA violators only · Duration = collected → validated (clinical/backroom); outsource & inside-lab use existing delay basis",
    10,
    y
  );
  doc.setTextColor(15, 23, 42);
  y += 8;

  for (const section of sections) {
    const title = section.title || "Department";
    const rows = Array.isArray(section.rows) ? section.rows : [];

    y = pendingSectionHeading(doc, `${title} (${rows.length})`, y);

    if (!rows.length) {
      y = ensureSpace(doc, y, 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("No SLA violations found.", 10, y);
      doc.setTextColor(15, 23, 42);
      y += 8;
      continue;
    }

    autoTable(doc, {
      startY: y,
      head: [HEAD],
      body: rows.map(rowToCells),
      margin: { left: 10, right: 10 },
      styles: {
        fontSize: 6.5,
        cellPadding: 1.2,
        overflow: "linebreak",
        valign: "middle",
      },
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 6.5,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 16 },
        2: { cellWidth: 22 },
        3: { cellWidth: 22 },
        4: { cellWidth: 16 },
        5: { cellWidth: 22 },
        6: { cellWidth: 22 },
        7: { cellWidth: 22 },
        8: { cellWidth: 22 },
        9: { cellWidth: 16 },
        10: { cellWidth: 16 },
        11: { cellWidth: 14 },
        12: { cellWidth: 14 },
        13: { cellWidth: 14 },
      },
    });

    y = (doc.lastAutoTable?.finalY ?? y) + 6;
  }

  const from = dateFrom || "start";
  const to = dateTo || "end";
  doc.save(`turnaround-${from}_to_${to}.pdf`);
}
