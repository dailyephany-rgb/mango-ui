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
  doc.setFontSize(12);
  doc.setTextColor(30, 58, 138);
  doc.text(text, 14, y);
  doc.setTextColor(15, 23, 42);
  return y + 6;
}

/** Major pending-block heading with bar background for clear section breaks. */
function pendingSectionHeading(doc, text, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const barH = 9;

  y = ensureSpace(doc, y + 8, barH + 18);
  y += 6;

  doc.setFillColor(30, 58, 138);
  doc.roundedRect(marginX, y - 6, pageWidth - marginX * 2, barH, 1.5, 1.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(String(text), marginX + 3.5, y);
  doc.setTextColor(15, 23, 42);

  return y + barH + 4;
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
  y = ensureSpace(doc, y, 36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const name = patient.patientName || patient.name || "—";
  doc.text(
    `${patient.regNo || "—"}  ·  ${patient.diagnosticNo || "—"}  ·  ${name}`,
    14,
    y
  );
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Doctor: ${patient.doctor || "—"}   Source: ${patient.source || "—"}`,
    14,
    y
  );
  doc.setTextColor(15, 23, 42);
  return y + 5;
}

function renderPendingBlock(doc, y, { title, emptyText, patients, buildRows, head }) {
  y = pendingSectionHeading(doc, title, y);

  if (!patients.length) {
    y = ensureSpace(doc, y, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(emptyText, 14, y);
    doc.setTextColor(15, 23, 42);
    return y + 12;
  }

  patients.forEach((p, index) => {
    if (index > 0) {
      y += 6;
      y = ensureSpace(doc, y, 40);
      const pageWidth = doc.internal.pageSize.getWidth();
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.25);
      doc.line(14, y, pageWidth - 14, y);
      y += 8;
    }

    y = patientHeader(doc, p, y);
    const rows = buildRows(p);
    autoTable(doc, {
      startY: y,
      head: [head],
      body: rows.length ? rows : [head.map(() => "—")],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [219, 234, 254], textColor: [30, 58, 138] },
      margin: { left: 14, right: 14 },
    });
    y = (doc.lastAutoTable?.finalY || y) + 10;
  });

  return y + 6;
}

/** Draw owner-style KPI cards in a wrapping row (title / blue value / subtitle). */
function drawKpiCards(doc, cards, startY, opts = {}) {
  const marginX = opts.marginX ?? 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const gap = 3.5;
  const cols = opts.cols ?? Math.min(3, Math.max(1, cards.length));
  const cardW = (pageWidth - marginX * 2 - gap * (cols - 1)) / cols;
  const cardH = 28;
  const pad = 3.5;

  let y = startY;
  let col = 0;

  cards.forEach((card) => {
    if (col === 0) {
      y = ensureSpace(doc, y, cardH + 4);
    }

    const x = marginX + col * (cardW + gap);

    // Card chrome
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(255, 255, 255);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "FD");

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    const titleLines = doc.splitTextToSize(
      String(card.title || ""),
      cardW - pad * 2
    );
    doc.text(titleLines.slice(0, 2), x + pad, y + 5.5);

    // Value (brand blue, large)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(11, 110, 247);
    doc.text(String(card.value ?? 0), x + pad, y + 15.5);

    // Subtitle
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    const subLines = doc.splitTextToSize(
      String(card.subtitle || ""),
      cardW - pad * 2
    );
    doc.text(subLines.slice(0, 2), x + pad, y + 21.5);
    doc.setTextColor(15, 23, 42);

    col += 1;
    if (col >= cols) {
      col = 0;
      y += cardH + gap;
    }
  });

  if (col !== 0) {
    y += cardH + gap;
  }

  return y + 2;
}

function drawKpiSection(doc, title, cards, y, cols) {
  y = ensureSpace(doc, y, 36);
  y = sectionTitle(doc, title, y);
  return drawKpiCards(doc, cards, y, { cols });
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

  // --- KPI cards (same layout/content as Owner WorkflowKPIBlocks) ---
  y = drawKpiSection(
    doc,
    "Routine Reports",
    [
      {
        title: "Routine Patients",
        value: summary.routineTotal ?? 0,
        subtitle: "Reports requiring routine workflow",
      },
      {
        title: "Pending",
        value: summary.routinePending ?? 0,
        subtitle: "Waiting for workflow completion",
      },
      {
        title: "Completed",
        value: summary.routineCompleted ?? 0,
        subtitle: "Routine workflow completed",
      },
      {
        title: "Printed",
        value: summary.routinePrinted ?? 0,
        subtitle: "Routine reports printed",
      },
      {
        title: "WhatsApp Required",
        value: summary.whatsappRequired ?? 0,
        subtitle: "Awaiting WhatsApp",
      },
      {
        title: "WhatsApp Sent",
        value: summary.whatsappSent ?? 0,
        subtitle: "WhatsApp delivered",
      },
    ],
    y,
    3
  );

  y = drawKpiSection(
    doc,
    "Inside Lab",
    [
      {
        title: "Inside Lab Patients",
        value: summary.insideTotal ?? 0,
        subtitle: "Reports requiring inside lab workflow",
      },
      {
        title: "Pending",
        value: summary.insidePending ?? 0,
        subtitle: "Waiting for workflow completion",
      },
      {
        title: "Completed",
        value: summary.insideCompleted ?? 0,
        subtitle: "Inside lab workflow completed",
      },
      {
        title: "Printed",
        value: summary.insidePrinted ?? 0,
        subtitle: "Inside lab reports printed",
      },
    ],
    y,
    2
  );

  y = drawKpiSection(
    doc,
    "Outsource",
    [
      {
        title: "Outsource Patients",
        value: summary.outsourceTotal ?? 0,
        subtitle: "Reports requiring outsource workflow",
      },
      {
        title: "Remaining",
        value: summary.outsourceRemaining ?? 0,
        subtitle: "Samples yet to be collected",
      },
      {
        title: "Collected",
        value: summary.outsourceCollected ?? 0,
        subtitle: "Samples collected and sent",
      },
      {
        title: "Reports Received",
        value: summary.outsourceReportReceived ?? 0,
        subtitle: "Reports received from outsource lab",
      },
      {
        title: "Reports Delivered",
        value: summary.outsourceReportDelivered ?? 0,
        subtitle: "Reports delivered to patients",
      },
    ],
    y,
    3
  );

  y += 8;

  // --- Pending sections (clear banners + spaced patient blocks) ---
  y = renderPendingBlock(doc, y, {
    title: `Routine Pending (${routinePending.length})`,
    emptyText: "No pending routine workflows.",
    patients: routinePending,
    head: ["Department", "Tests", "Scanned", "Saved", "Validated"],
    buildRows: (p) =>
      (p.routineStatuses || []).map((d) => [
        d.dept || "—",
        testsCell(d.tests),
        yesNo(d.scanned),
        yesNo(d.saved),
        yesNo(d.validated),
      ]),
  });

  y = renderPendingBlock(doc, y, {
    title: `Inside Lab Pending (${insidePending.length})`,
    emptyText: "No pending inside-lab workflows.",
    patients: insidePending,
    head: ["Department", "Tests", "Saved"],
    buildRows: (p) =>
      (p.insideStatuses || []).map((d) => [
        d.dept || "—",
        testsCell(d.tests),
        yesNo(d.saved),
      ]),
  });

  y = renderPendingBlock(doc, y, {
    title: `Outsource Incomplete (${outsourcePending.length})`,
    emptyText: "No incomplete outsource workflows.",
    patients: outsourcePending,
    head: ["Department", "Tests", "Collected", "Received", "Delivered"],
    buildRows: (p) =>
      (p.outsourceStatuses || []).map((d) => [
        d.dept || "—",
        testsCell(d.tests),
        yesNo(d.sampleCollected),
        yesNo(d.reportReceived),
        yesNo(d.reportGiven),
      ]),
  });

  const safeFrom = String(dateFrom || "from").replace(/[^\d-]/g, "");
  const safeTo = String(dateTo || "to").replace(/[^\d-]/g, "");
  doc.save(`ops-performance-${safeFrom}_to_${safeTo}.pdf`);
}
