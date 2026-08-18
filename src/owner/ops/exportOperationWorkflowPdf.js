/**
 * Operation Workflow Report PDF — planned vs actual by slot/role.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const ROLE_HEAD = [
  "Role",
  "Planned",
  "Entries",
  "Followed",
  "Follow %",
  "Who followed",
  "Not followed",
  "Who disfollowed",
];

const DETAIL_HEAD = [
  "Date",
  "Slot",
  "Hour",
  "Role",
  "Planned",
  "Actual",
  "Action",
  "Reg",
];

function cell(v) {
  if (v == null || v === "") return "—";
  return String(v);
}

function formatNames(list) {
  if (!list?.length) return "—";
  return list
    .map((x) => (typeof x === "string" ? x : `${x.name} (${x.count})`))
    .join(", ");
}

function pctLabel(pct) {
  return pct == null ? "—" : `${pct}%`;
}

function ensureSpace(doc, y, need = 40) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + need > pageHeight - 12) {
    doc.addPage();
    return 14;
  }
  return y;
}

function sectionBar(doc, text, y) {
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

/**
 * @param {{
 *   dateFrom?: string,
 *   dateTo?: string,
 *   source?: string,
 *   summary?: object,
 *   days?: object[],
 *   detailMisses?: object[],
 * }} opts
 */
export async function downloadOperationWorkflowPdf(opts = {}) {
  const {
    dateFrom = "",
    dateTo = "",
    source = "All",
    summary = {},
    days = [],
    detailMisses = [],
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
  doc.text("Mango LIMS — Operation Workflow Report", pageWidth / 2, y, {
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
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    "Match rule: each register actor + timestamp is mapped to an Operation Map slot; Followed if that actor is among anyone planned for that role anywhere in the slot (slot-wide union).",
    10,
    y,
    { maxWidth: pageWidth - 20 }
  );
  y += 8;
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);

  const checked = summary.checked ?? 0;
  const followed = summary.followed ?? 0;
  const notFollowed = summary.notFollowed ?? 0;
  const followRate =
    summary.followRate == null ? "—" : `${summary.followRate}%`;

  doc.setFont("helvetica", "bold");
  doc.text(`Entries checked: ${checked}`, 10, y);
  doc.setTextColor(22, 163, 74);
  doc.text(`Followed: ${followed}`, 55, y);
  doc.setTextColor(220, 38, 38);
  doc.text(`Not followed: ${notFollowed}`, 95, y);
  doc.setTextColor(51, 65, 85);
  doc.text(`Follow rate: ${followRate}`, 145, y);
  doc.setFont("helvetica", "normal");
  y += 8;

  if (!days.length) {
    doc.setTextColor(100, 116, 139);
    doc.text("No Operation Map days in this range.", 10, y);
  }

  days.forEach((day) => {
    y = sectionBar(doc, day.date, y);

    if (!day.slots?.length) {
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text("No slots on Operation Map for this day.", 10, y);
      doc.setTextColor(15, 23, 42);
      y += 6;
      return;
    }

    day.slots.forEach((slot) => {
      const slotTitle = `${slot.label || "Slot"} (${slot.rangeLabel || ""}) · Entries ${slot.entries ?? 0} · Followed ${slot.followedCount ?? 0} · Not followed ${slot.notFollowedCount ?? 0} · ${pctLabel(slot.followPct)}`;
      y = ensureSpace(doc, y, 20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(slotTitle, 10, y);
      y += 4;

      if (!slot.roles?.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text("No mapped activity fell into this slot.", 10, y);
        doc.setTextColor(15, 23, 42);
        y += 6;
        return;
      }

      const body = slot.roles.map((role) => [
        cell(role.roleLabel),
        formatNames(role.plannedNames),
        String(role.entries ?? 0),
        String(role.followedCount ?? 0),
        pctLabel(role.followPct),
        formatNames(role.followedBy),
        String(role.notFollowedCount ?? 0),
        formatNames(role.disfollowedBy),
      ]);

      autoTable(doc, {
        startY: y,
        head: [ROLE_HEAD],
        body,
        margin: { left: 8, right: 8 },
        styles: {
          fontSize: 7,
          cellPadding: 1.2,
          overflow: "linebreak",
          valign: "top",
        },
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 7,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          2: { halign: "right" },
          3: { halign: "right" },
          4: { halign: "right" },
          6: { halign: "right" },
        },
      });
      y = (doc.lastAutoTable?.finalY || y) + 6;
    });
  });

  if (detailMisses?.length) {
    y = sectionBar(doc, "Not followed detail", y);
    autoTable(doc, {
      startY: y,
      head: [DETAIL_HEAD],
      body: detailMisses.map((row) => [
        cell(row.date),
        cell(row.slotLabel),
        cell(row.hourKey),
        cell(row.roleLabel),
        cell(row.planned),
        cell(row.actual),
        cell(row.action),
        cell(
          row.diagnosticNo
            ? `${row.regNo || "—"} / ${row.diagnosticNo}`
            : row.regNo || "—"
        ),
      ]),
      margin: { left: 8, right: 8 },
      styles: {
        fontSize: 6.5,
        cellPadding: 1.1,
        overflow: "linebreak",
        valign: "top",
      },
      headStyles: {
        fillColor: [185, 28, 28],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 6.5,
      },
      alternateRowStyles: { fillColor: [254, 242, 242] },
    });
  }

  const stamp = (dateFrom || dateTo || "range").replace(/\s+/g, "_");
  doc.save(`operation-workflow-${stamp}.pdf`);
}
