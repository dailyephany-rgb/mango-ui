/**
 * Operations Performance Report PDF — KPIs + pending patient stage tables.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function yesNo(v) {
  if (v === true || v === "Yes") return "Yes";
  if (v === false || v === "No") return "No";
  return v ? "Yes" : "No";
}

function testsCell(tests) {
  if (!Array.isArray(tests) || !tests.length) return "—";
  return tests.join(", ");
}

function sectionTitle(doc, text, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(30, 58, 138);
  doc.text(text, 14, y);
  doc.setTextColor(15, 23, 42);
  return y + 6;
}

function ensureSpace(doc, y, need = 40) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + need > pageHeight - 14) {
    doc.addPage();
    return 16;
  }
  return y;
}

function patientHeader(doc, patient, y) {
  y = ensureSpace(doc, y, 28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const name = patient.patientName || patient.name || "—";
  doc.text(
    `${patient.regNo || "—"}  ·  ${patient.diagnosticNo || "—"}  ·  ${name}`,
    14,
    y
  );
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Doctor: ${patient.doctor || "—"}   Source: ${patient.source || "—"}`,
    14,
    y
  );
  doc.setTextColor(15, 23, 42);
  return y + 2;
}

/**
 * @param {{
 *   dateFrom: string,
 *   dateTo: string,
 *   source?: string,
 *   summary: object,
 *   routinePending: object[],
 *   insidePending: object[],
 *   outsourcePending: object[],
 * }} opts
 */
export async function downloadOpsPerformancePdf(opts = {}) {
  const {
    dateFrom = "",
    dateTo = "",
    source = "All",
    summary = {},
    routinePending = [],
    insidePending = [],
    outsourcePending = [],
  } = opts;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(30, 58, 138);
  doc.text("Mango LIMS — Operations Performance Report", pageWidth / 2, y, {
    align: "center",
  });
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(`Date range: ${dateFrom || "—"} → ${dateTo || "—"}`, 14, y);
  y += 5;
  doc.text(`Source: ${source || "All"}`, 14, y);
  y += 5;
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y);
  y += 10;

  // --- KPI section ---
  y = sectionTitle(doc, "1. KPI Summary", y);
  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value"]],
    body: [
      ["Routine Patients", String(summary.routineTotal ?? 0)],
      ["Routine Pending", String(summary.routinePending ?? 0)],
      ["Routine Completed", String(summary.routineCompleted ?? 0)],
      ["Routine Printed", String(summary.routinePrinted ?? 0)],
      ["WhatsApp Required", String(summary.whatsappRequired ?? 0)],
      ["WhatsApp Sent", String(summary.whatsappSent ?? 0)],
      ["Inside Lab Patients", String(summary.insideTotal ?? 0)],
      ["Inside Lab Pending", String(summary.insidePending ?? 0)],
      ["Inside Lab Completed", String(summary.insideCompleted ?? 0)],
      ["Inside Lab Printed", String(summary.insidePrinted ?? 0)],
      ["Outsource Patients", String(summary.outsourceTotal ?? 0)],
      ["Outsource Remaining", String(summary.outsourceRemaining ?? 0)],
      ["Outsource Collected", String(summary.outsourceCollected ?? 0)],
      ["Reports Received", String(summary.outsourceReportReceived ?? 0)],
      ["Reports Delivered", String(summary.outsourceReportDelivered ?? 0)],
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235] },
    margin: { left: 14, right: 14 },
  });
  y = (doc.lastAutoTable?.finalY || y) + 10;

  // --- Routine pending ---
  y = ensureSpace(doc, y, 20);
  y = sectionTitle(
    doc,
    `2. Routine Pending (${routinePending.length})`,
    y
  );
  if (!routinePending.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("No pending routine workflows.", 14, y);
    y += 8;
  } else {
    for (const p of routinePending) {
      y = patientHeader(doc, p, y);
      const rows = (p.routineStatuses || []).map((d) => [
        d.dept || "—",
        testsCell(d.tests),
        yesNo(d.scanned),
        yesNo(d.saved),
        yesNo(d.validated),
        yesNo(d.entered),
      ]);
      autoTable(doc, {
        startY: y,
        head: [["Department", "Tests", "Scanned", "Saved", "Validated", "Entered"]],
        body: rows.length ? rows : [["—", "—", "—", "—", "—", "—"]],
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [219, 234, 254], textColor: [30, 58, 138] },
        margin: { left: 14, right: 14 },
      });
      y = (doc.lastAutoTable?.finalY || y) + 6;
    }
  }

  // --- Inside pending ---
  y = ensureSpace(doc, y, 20);
  y = sectionTitle(
    doc,
    `3. Inside Lab Pending (${insidePending.length})`,
    y
  );
  if (!insidePending.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("No pending inside-lab workflows.", 14, y);
    y += 8;
  } else {
    for (const p of insidePending) {
      y = patientHeader(doc, p, y);
      const rows = (p.insideStatuses || []).map((d) => [
        d.dept || "—",
        testsCell(d.tests),
        yesNo(d.saved),
      ]);
      autoTable(doc, {
        startY: y,
        head: [["Department", "Tests", "Saved"]],
        body: rows.length ? rows : [["—", "—", "—"]],
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [219, 234, 254], textColor: [30, 58, 138] },
        margin: { left: 14, right: 14 },
      });
      y = (doc.lastAutoTable?.finalY || y) + 6;
    }
  }

  // --- Outsource pending ---
  y = ensureSpace(doc, y, 20);
  y = sectionTitle(
    doc,
    `4. Outsource Incomplete (${outsourcePending.length})`,
    y
  );
  if (!outsourcePending.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("No incomplete outsource workflows.", 14, y);
  } else {
    for (const p of outsourcePending) {
      y = patientHeader(doc, p, y);
      const rows = (p.outsourceStatuses || []).map((d) => [
        d.dept || "—",
        testsCell(d.tests),
        yesNo(d.sampleCollected),
        yesNo(d.reportReceived),
        yesNo(d.reportGiven),
      ]);
      autoTable(doc, {
        startY: y,
        head: [
          ["Department", "Tests", "Collected", "Received", "Delivered"],
        ],
        body: rows.length ? rows : [["—", "—", "—", "—", "—"]],
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [219, 234, 254], textColor: [30, 58, 138] },
        margin: { left: 14, right: 14 },
      });
      y = (doc.lastAutoTable?.finalY || y) + 6;
    }
  }

  const safeFrom = String(dateFrom || "from").replace(/[^\d-]/g, "");
  const safeTo = String(dateTo || "to").replace(/[^\d-]/g, "");
  doc.save(`ops-performance-${safeFrom}_to_${safeTo}.pdf`);
}
