/**
 * Critical Report PDF — all Pending/Reported critical alerts (Critical table columns).
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const HEAD = [
  "Reg No",
  "Diag No",
  "Patient Name",
  "Dept",
  "Age/Sex",
  "Doctor",
  "Tests",
  "Critical Finding",
  "Reported By",
  "Reported To",
  "Comm. Via",
  "Time Taken",
  "Crosschecked By",
  "Cross Check",
  "Action",
];

function cell(v) {
  if (v == null || v === "") return "—";
  return String(v);
}

function rowToCells(r) {
  return [
    cell(r.regNo),
    cell(r.diagnosticNo),
    cell(r.name),
    cell(r.dept),
    cell(r.ageSex),
    cell(r.doctor),
    cell(r.tests),
    cell(r.criticalFinding),
    cell(r.reportedBy),
    cell(r.reportedTo),
    cell(r.commVia),
    cell(r.timeTaken),
    cell(r.crossCheckedBy),
    cell(r.crossCheck),
    cell(r.action),
  ];
}

/**
 * @param {{
 *   dateFrom?: string,
 *   dateTo?: string,
 *   source?: string,
 *   rows?: object[],
 *   pendingCount?: number,
 *   reportedCount?: number,
 * }} opts
 */
export async function downloadCriticalPdf(opts = {}) {
  const {
    dateFrom = "",
    dateTo = "",
    source = "All",
    rows = [],
    pendingCount = 0,
    reportedCount = 0,
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
  doc.text("Mango LIMS — Critical Report", pageWidth / 2, y, {
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
  doc.setFont("helvetica", "bold");
  doc.setTextColor(185, 28, 28);
  doc.text(`Pending: ${pendingCount}`, 10, y);
  doc.setTextColor(5, 150, 105);
  doc.text(`Reported: ${reportedCount}`, 42, y);
  doc.setTextColor(51, 65, 85);
  doc.setFont("helvetica", "normal");
  doc.text(`Total: ${rows.length}`, 80, y);
  y += 8;

  if (!rows.length) {
    doc.setTextColor(100, 116, 139);
    doc.text("No critical alerts found for this range.", 10, y);
  } else {
    autoTable(doc, {
      startY: y,
      head: [HEAD],
      body: rows.map(rowToCells),
      margin: { left: 8, right: 8 },
      styles: {
        fontSize: 6,
        cellPadding: 1.1,
        overflow: "linebreak",
        valign: "top",
      },
      headStyles: {
        fillColor: [185, 28, 28],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 6,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell(data) {
        if (data.section !== "body") return;
        const action = String(data.row.raw?.[14] ?? "");
        if (action.includes("Reported")) {
          data.cell.styles.fillColor = [220, 252, 231];
        }
      },
    });
  }

  const from = dateFrom || "start";
  const to = dateTo || "end";
  doc.save(`critical-${from}_to_${to}.pdf`);
}
