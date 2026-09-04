/**
 * Operation Workflow compliance: join clinical activity to Operation Map plans.
 *
 * For each register stage:
 *   1. Floor the stage timestamp → IST date + hour → find Operation Map slot
 *   2. Planned = assignees for that map role in that hour (not a slot-wide union)
 *   3. Followed iff the actor is in that hour's planned list
 *   4. Report: Slot N for hours that still match the slot's first-hour template;
 *      overridden hours nest as Operation Map N.M (1-based slot.hour index)
 *
 * All day bounds and hour bucketing use Asia/Kolkata (IST) so the same date
 * range yields the same counts on every machine (Mac / Windows / any TZ).
 * Report rows may split Backroom/Mango/Outsource by register or action (reportKey)
 * without changing Operation Map duty assignment (roleKey).
 */
import { trackedGetDocs as getDocs } from "../../shared/firestore/trackedFirestore.js";
import {
  loadDayPlan,
  shiftDateStr,
} from "../../operation_map/operationMapStore.js";
import {
  ROLE_CONFIG,
  MAIN_DEPT_KEYS,
  BOTTOM_DEPT_KEYS,
  COMMAND_ROLES,
  SECOND_LAYER_ROLES,
  formatSlotRange,
  hoursForSlot,
  asStaffList,
  normalizeAssignments,
  isHourOverrideOfSlot,
  slotHourIndex,
  formatHourRange,
} from "../../operation_map/roleConfig.js";
import {
  parseDateField,
  istDayStart,
  istDayEndExclusive,
  getISTDateString,
} from "../../shared/utils/dates.js";
import {
  collection,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../firebaseConfig.js";

/** Placeholder actors that mean "no real person" — skip (do not count). */
const INVALID_ACTORS = new Set([
  "",
  "-",
  "—",
  "na",
  "n/a",
  "n.a.",
  "none",
  "null",
  "undefined",
  "not available",
]);

/**
 * Actors that are real register events but anonymous — count as Not followed
 * (never match planned staff).
 */
const ANONYMOUS_ACTORS = new Set(["unknown"]);

/** Direct Firestore registers — no Owner overview (overview uses machine-local day). */
const CLINICAL_SOURCES = [
  {
    roleKey: "biochemistry",
    reportKey: "biochemistry",
    collection: "biochemistry_register",
  },
  {
    roleKey: "hormones",
    reportKey: "hormones",
    collection: "hormones_main",
  },
  {
    roleKey: "haematology",
    reportKey: "haematology",
    collection: "haematology_register",
  },
  {
    roleKey: "coagulation",
    reportKey: "coagulation",
    collection: "coagulation_register",
  },
  {
    roleKey: "backroom",
    reportKey: "serology",
    collection: "serology_register",
  },
  {
    roleKey: "backroom",
    reportKey: "rapidCard",
    collection: "rapid_card_register",
  },
  {
    roleKey: "backroom",
    reportKey: "urine",
    collection: "urine_analysis_register",
  },
  {
    roleKey: "backroom",
    reportKey: "esr",
    collection: "esr_register",
  },
  {
    roleKey: "backroom",
    reportKey: "bloodGroupTesting",
    collection: "bloodgroup_testing_register",
  },
  {
    roleKey: "backroom",
    reportKey: "bloodGroupRetesting",
    collection: "bloodgroup_retesting_register",
  },
];

/** Report-only display buckets (Operation Map duties stay on roleKey). */
const REPORT_LABELS = {
  biochemistry: "Biochemistry",
  hormones: "Hormones",
  haematology: "Haematology",
  coagulation: "Coagulation",
  serology: "Serology (Backroom)",
  rapidCard: "Rapid Card (Backroom)",
  urine: "Urine (Backroom)",
  esr: "ESR (Backroom)",
  bloodGroupTesting: "Blood Group Testing (Backroom)",
  bloodGroupRetesting: "Blood Group Retesting (Backroom)",
  mangoReceipt: "Mango (Report Saved By)",
  mangoRoutinePrint: "Mango (Routine Report Printed By)",
  mangoInsidePrint: "Mango (Inside Lab Report Printed By)",
  mangoWhatsapp: "Mango (WhatsApp Sent By)",
  insideLab: "Inside Lab (Saved By)",
  outsourceCollected: "Outsource (Collected By)",
  outsourceReceived: "Outsource (Report Received By)",
  outsourceDelivered: "Outsource (Report Delivered By)",
};

const MANGO_ACTION_REPORT = {
  receipt: "mangoReceipt",
  routinePrint: "mangoRoutinePrint",
  insidePrint: "mangoInsidePrint",
  whatsapp: "mangoWhatsapp",
};

const OUTSOURCE_ACTION_REPORT = {
  collected: "outsourceCollected",
  received: "outsourceReceived",
  delivered: "outsourceDelivered",
};

function matchesSource(row, source) {
  if (!source || source === "All") return true;
  return (
    String(row.source || "")
      .trim()
      .toUpperCase() === String(source).trim().toUpperCase()
  );
}

/** IST calendar day query — identical on every machine for the same YYYY-MM-DD. */
async function loadScopedByField(collectionName, field, dateRange, source) {
  const start = istDayStart(dateRange?.from);
  const endExclusive = istDayEndExclusive(dateRange?.to);
  if (!start || !endExclusive) return [];
  try {
    const q = query(
      collection(db, collectionName),
      where(field, ">=", Timestamp.fromDate(start)),
      where(field, "<", Timestamp.fromDate(endExclusive)),
      orderBy(field, "asc")
    );
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((r) => matchesSource(r, source));
  } catch (err) {
    console.warn(
      `[OperationWorkflow] loadScopedByField ${collectionName}.${field}:`,
      err?.message || err
    );
    return [];
  }
}

/** Merge docs from several timestamp fields (activity may not share timePrinted day). */
async function loadMergedByFields(collectionName, fields, dateRange, source) {
  const chunks = await Promise.all(
    fields.map((field) =>
      loadScopedByField(collectionName, field, dateRange, source)
    )
  );
  const byId = new Map();
  for (const rows of chunks) {
    for (const row of rows) {
      byId.set(row.id, { ...(byId.get(row.id) || {}), ...row });
    }
  }
  return Array.from(byId.values());
}

/**
 * Mango stages often land on report_details whose timePrinted is a prior day.
 * Load each stage by its own activity timestamp field (IST day).
 */
async function loadMangoStageRows(dateRange, source) {
  const [receiptRows, routineRows, insidePrintRows, whatsappRows] =
    await Promise.all([
      loadScopedByField("report_details", "timePrinted", dateRange, source),
      loadScopedByField(
        "report_details",
        "routineReportPrintedTime",
        dateRange,
        source
      ),
      loadScopedByField(
        "report_details",
        "insideLabReportPrintedTime",
        dateRange,
        source
      ),
      loadScopedByField(
        "report_details",
        "whatsappSentTime",
        dateRange,
        source
      ),
    ]);
  return { receiptRows, routineRows, insidePrintRows, whatsappRows };
}

function asDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const parsed = parseDateField(v);
  if (parsed) return parsed;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function normName(v) {
  return String(v || "").trim();
}

function isUsableActor(v) {
  const n = normName(v);
  if (!n) return false;
  return !INVALID_ACTORS.has(n.toLowerCase());
}

function isAnonymousActor(v) {
  return ANONYMOUS_ACTORS.has(normName(v).toLowerCase());
}

/** First usable date among register timestamp aliases. */
function firstDate(...vals) {
  for (const v of vals) {
    const d = asDate(v);
    if (d) return d;
  }
  return null;
}

function namesMatch(a, b) {
  return normName(a).toLowerCase() === normName(b).toLowerCase();
}

function hourKeyFromDate(d) {
  // Operation Map hours are lab/IST hours — never use machine-local getHours().
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  let hour = parts.find((p) => p.type === "hour")?.value || "00";
  if (hour === "24") hour = "00";
  return `${hour.padStart(2, "0")}:00`;
}

function eachDateStr(from, to) {
  if (!from || !to) return [];
  const out = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 400) {
    out.push(cur);
    cur = shiftDateStr(cur, 1);
    guard += 1;
  }
  return out;
}

function roleLabel(roleKey, field, reportKey) {
  const base =
    (reportKey && REPORT_LABELS[reportKey]) ||
    ROLE_CONFIG[roleKey]?.label ||
    roleKey;
  if (field === "validator") {
    // e.g. "Serology Validator (Backroom)" when base is "Serology (Backroom)"
    if (base.includes(" (Backroom)")) {
      return base.replace(" (Backroom)", " Validator (Backroom)");
    }
    return `${base} Validator`;
  }
  return base;
}

function resolvePlanned(assignments, roleKey, field) {
  if (!assignments || !roleKey) return [];
  if (
    COMMAND_ROLES.includes(roleKey) ||
    SECOND_LAYER_ROLES.includes(roleKey)
  ) {
    return asStaffList(assignments[roleKey]);
  }
  if (MAIN_DEPT_KEYS.includes(roleKey)) {
    return asStaffList(assignments[roleKey]?.[field || "staff"]);
  }
  if (BOTTOM_DEPT_KEYS.includes(roleKey)) {
    return asStaffList(assignments[roleKey]?.staff);
  }
  return [];
}

/** Planned names for a role in a single hour. */
function resolvePlannedForHour(dayPlan, hourKey, roleKey, field) {
  return resolvePlanned(
    normalizeAssignments(dayPlan?.hours?.[hourKey]?.assignments),
    roleKey,
    field
  );
}

function slotOrdinal(dayPlan, slot) {
  const idx = (dayPlan?.slots || []).findIndex((s) => s.id === slot?.id);
  return idx >= 0 ? idx + 1 : 1;
}

function workflowLayerLabel(slotN, hourIndex, isOverride) {
  if (!isOverride) return `Slot ${slotN}`;
  return `Operation Map ${slotN}.${hourIndex}`;
}

function rolesFromAggs(slotRoleMap, prefix) {
  const roles = [];
  for (const [key, agg] of slotRoleMap.entries()) {
    if (!key.startsWith(prefix)) continue;
    roles.push({
      roleKey: agg.roleKey,
      reportKey: agg.reportKey,
      field: agg.field,
      roleLabel: agg.roleLabel,
      plannedNames: Array.from(agg.plannedNames).sort(),
      followedCount: agg.followedCount,
      notFollowedCount: agg.notFollowedCount,
      entries: agg.followedCount + agg.notFollowedCount,
      followPct:
        agg.followedCount + agg.notFollowedCount
          ? Math.round(
              (agg.followedCount /
                (agg.followedCount + agg.notFollowedCount)) *
                100
            )
          : null,
      followedBy: nameCountList(agg.followedBy),
      disfollowedBy: nameCountList(agg.disfollowedBy),
      skippedNoPlan: agg.skippedNoPlan,
    });
  }
  roles.sort((a, b) => a.roleLabel.localeCompare(b.roleLabel));
  return roles;
}

function roleTotalsFromList(roles) {
  const followedCount = roles.reduce((s, r) => s + r.followedCount, 0);
  const notFollowedCount = roles.reduce((s, r) => s + r.notFollowedCount, 0);
  const entries = followedCount + notFollowedCount;
  return {
    followedCount,
    notFollowedCount,
    entries,
    followPct: entries
      ? Math.round((followedCount / entries) * 100)
      : null,
  };
}

function findSlotForHour(dayPlan, hourKey) {
  const hourEntry = dayPlan?.hours?.[hourKey];
  if (hourEntry?.slotId) {
    const slot = (dayPlan.slots || []).find((s) => s.id === hourEntry.slotId);
    if (slot) return slot;
  }
  for (const slot of dayPlan?.slots || []) {
    if (hoursForSlot(slot.startTime, slot.endTime).includes(hourKey)) {
      return slot;
    }
  }
  return null;
}

function pushEvent(events, partial) {
  if (!isUsableActor(partial.actor)) return;
  const actor = normName(partial.actor);
  const at = asDate(partial.at);
  if (!actor || !at) return;
  events.push({
    roleKey: partial.roleKey,
    reportKey: partial.reportKey || partial.roleKey,
    field: partial.field || "staff",
    actor,
    at,
    action: partial.action || "",
    regNo: partial.regNo || "",
    diagnosticNo: partial.diagnosticNo || "",
  });
}

/**
 * Dept register: savedBy+savedTime → staff; validatedBy+validatedTime → validator.
 * reportKey splits PDF rows; roleKey is still used for Operation Map planned match.
 */
function emitClinicalRows(events, rows, roleKey, reportKey) {
  const bucket = reportKey || roleKey;
  (rows || []).forEach((r) => {
    pushEvent(events, {
      roleKey,
      reportKey: bucket,
      field: "staff",
      actor: r.savedBy,
      at: firstDate(r.timeSaved, r.savedTime),
      action: "saved",
      regNo: r.regNo,
      diagnosticNo: r.diagnosticNo,
    });
    pushEvent(events, {
      roleKey,
      reportKey: bucket,
      field: "validator",
      actor: r.validatedBy,
      at: firstDate(r.timeValidated, r.validatedTime),
      action: "validated",
      regNo: r.regNo,
      diagnosticNo: r.diagnosticNo,
    });
  });
}

/** Mango: map role mangoOperator; each stage loaded by its own activity time. */
function emitMangoStageEvents(events, stageRows) {
  const { receiptRows, routineRows, insidePrintRows, whatsappRows } =
    stageRows || {};

  (receiptRows || []).forEach((r) => {
    pushEvent(events, {
      roleKey: "mangoOperator",
      reportKey: MANGO_ACTION_REPORT.receipt,
      field: "staff",
      actor: r.receiptSavedBy,
      at: firstDate(r.timePrinted, r.receiptSavedTime),
      action: "receipt",
      regNo: r.regNo,
      diagnosticNo: r.diagnosticNo,
    });
  });
  (routineRows || []).forEach((r) => {
    pushEvent(events, {
      roleKey: "mangoOperator",
      reportKey: MANGO_ACTION_REPORT.routinePrint,
      field: "staff",
      actor: r.routineReportPrintedBy,
      at: firstDate(r.routineReportPrintedTime),
      action: "routinePrint",
      regNo: r.regNo,
      diagnosticNo: r.diagnosticNo,
    });
  });
  (insidePrintRows || []).forEach((r) => {
    pushEvent(events, {
      roleKey: "mangoOperator",
      reportKey: MANGO_ACTION_REPORT.insidePrint,
      field: "staff",
      actor: r.insideLabReportPrintedBy,
      at: firstDate(r.insideLabReportPrintedTime),
      action: "insidePrint",
      regNo: r.regNo,
      diagnosticNo: r.diagnosticNo,
    });
  });
  (whatsappRows || []).forEach((r) => {
    pushEvent(events, {
      roleKey: "mangoOperator",
      reportKey: MANGO_ACTION_REPORT.whatsapp,
      field: "staff",
      actor: r.whatsappSentBy,
      at: firstDate(r.whatsappSentTime),
      action: "whatsapp",
      regNo: r.regNo,
      diagnosticNo: r.diagnosticNo,
    });
  });
}

function emitInsideRows(events, rows) {
  (rows || []).forEach((r) => {
    pushEvent(events, {
      roleKey: "insideLab",
      reportKey: "insideLab",
      field: "staff",
      actor: r.savedBy,
      at: firstDate(r.timeSaved, r.savedTime),
      action: "insideSave",
      regNo: r.regNo,
      diagnosticNo: r.diagnosticNo,
    });
  });
}

/** Outsource: prefer raw Firestore stage timestamps (activity day). */
function emitOutsourceRows(events, rows) {
  (rows || []).forEach((r) => {
    pushEvent(events, {
      roleKey: "outsource",
      reportKey: OUTSOURCE_ACTION_REPORT.collected,
      field: "staff",
      actor: r.collectedBy,
      at: firstDate(r.outsourcedCollectedTime, r.timeOutsourcedCollected),
      action: "collected",
      regNo: r.regNo,
      diagnosticNo: r.diagnosticNo,
    });
    pushEvent(events, {
      roleKey: "outsource",
      reportKey: OUTSOURCE_ACTION_REPORT.received,
      field: "staff",
      actor: r.receivedBy,
      at: firstDate(r.reportReceivedTime, r.timeReportReceived),
      action: "received",
      regNo: r.regNo,
      diagnosticNo: r.diagnosticNo,
    });
    pushEvent(events, {
      roleKey: "outsource",
      reportKey: OUTSOURCE_ACTION_REPORT.delivered,
      field: "staff",
      actor: r.deliveredBy,
      at: firstDate(r.reportDeliveredTime, r.timeReportDelivered),
      action: "delivered",
      regNo: r.regNo,
      diagnosticNo: r.diagnosticNo,
    });
  });
}

function bumpNameCount(map, name) {
  const key = normName(name) || "—";
  map[key] = (map[key] || 0) + 1;
}

function nameCountList(map) {
  return Object.entries(map)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function emptyRoleAgg(roleKey, field, reportKey) {
  return {
    roleKey,
    reportKey: reportKey || roleKey,
    field,
    roleLabel: roleLabel(roleKey, field, reportKey),
    plannedNames: new Set(),
    followedCount: 0,
    notFollowedCount: 0,
    followedBy: {},
    disfollowedBy: {},
    skippedNoPlan: 0,
  };
}

/**
 * @param {{ dateRange: { from?: string, to?: string }, source?: string }} opts
 */
export async function collectOperationWorkflowData({
  dateRange,
  source = "All",
}) {
  const events = [];

  const [mangoStages, clinicalPayloads, insideRows, outsourceRows] =
    await Promise.all([
      loadMangoStageRows(dateRange, source),
      Promise.all(
        CLINICAL_SOURCES.map(async (src) => {
          const rows = await loadMergedByFields(
            src.collection,
            ["timePrinted", "savedTime", "validatedTime"],
            dateRange,
            source
          );
          return {
            roleKey: src.roleKey,
            reportKey: src.reportKey,
            rows,
          };
        })
      ),
      // Prefer activity time; fall back to timePrinted for rows missing timeSaved.
      loadMergedByFields(
        "inside_lab_results",
        ["timeSaved", "timePrinted"],
        dateRange,
        source
      ),
      Promise.all([
        loadScopedByField(
          "outsource_tracking",
          "outsourcedCollectedTime",
          dateRange,
          source
        ),
        loadScopedByField(
          "outsource_tracking",
          "reportReceivedTime",
          dateRange,
          source
        ),
        loadScopedByField(
          "outsource_tracking",
          "reportDeliveredTime",
          dateRange,
          source
        ),
        loadScopedByField(
          "outsource_tracking",
          "timePrinted",
          dateRange,
          source
        ),
      ]).then((chunks) => {
        const byId = new Map();
        for (const rows of chunks) {
          for (const row of rows) {
            byId.set(row.id, { ...(byId.get(row.id) || {}), ...row });
          }
        }
        return Array.from(byId.values());
      }),
    ]);

  emitMangoStageEvents(events, mangoStages);
  clinicalPayloads.forEach(({ roleKey, reportKey, rows }) =>
    emitClinicalRows(events, rows, roleKey, reportKey)
  );
  emitInsideRows(events, insideRows);
  emitOutsourceRows(events, outsourceRows);

  const dates = eachDateStr(dateRange?.from, dateRange?.to);
  const dayPlans = {};
  await Promise.all(
    dates.map(async (d) => {
      dayPlans[d] = await loadDayPlan(d);
    })
  );

  /** @type {Map<string, ReturnType<typeof emptyRoleAgg> & { date: string, slot: object }>} */
  const slotRoleMap = new Map();
  let checked = 0;
  let followed = 0;
  let notFollowed = 0;
  let skippedNoPlan = 0;
  let skippedNoSlot = 0;

  const detailMisses = [];

  events.forEach((ev) => {
    const dateStr = getISTDateString(ev.at);
    if (!dateStr) return;
    if (dateRange?.from && dateStr < dateRange.from) return;
    if (dateRange?.to && dateStr > dateRange.to) return;

    const hourKey = hourKeyFromDate(ev.at);
    const dayPlan = dayPlans[dateStr];
    if (!dayPlan || !(dayPlan.slots || []).length) {
      skippedNoSlot += 1;
      return;
    }

    const slot = findSlotForHour(dayPlan, hourKey);
    if (!slot) {
      skippedNoSlot += 1;
      return;
    }

    const planned = resolvePlannedForHour(
      dayPlan,
      hourKey,
      ev.roleKey,
      ev.field
    );
    const reportKey = ev.reportKey || ev.roleKey;
    const slotN = slotOrdinal(dayPlan, slot);
    const hourIndex = slotHourIndex(slot, hourKey) || 1;
    const isOverride = isHourOverrideOfSlot(dayPlan, slot, hourKey);
    const layerKey = isOverride ? `hour:${hourKey}` : "base";
    const layerLabel = workflowLayerLabel(slotN, hourIndex, isOverride);
    const aggKey = `${dateStr}|${slot.id}|${layerKey}|${ev.roleKey}|${ev.field}|${reportKey}`;

    if (!slotRoleMap.has(aggKey)) {
      slotRoleMap.set(aggKey, {
        date: dateStr,
        slot,
        hourKey,
        isOverride,
        layerLabel,
        ...emptyRoleAgg(ev.roleKey, ev.field, reportKey),
      });
    }
    const agg = slotRoleMap.get(aggKey);
    planned.forEach((p) => agg.plannedNames.add(p));

    if (!planned.length) {
      agg.skippedNoPlan += 1;
      skippedNoPlan += 1;
      return;
    }

    checked += 1;
    // Unknown (and other anonymous actors) never count as followed.
    const ok =
      !isAnonymousActor(ev.actor) &&
      planned.some((p) => namesMatch(p, ev.actor));
    if (ok) {
      followed += 1;
      agg.followedCount += 1;
      bumpNameCount(agg.followedBy, ev.actor);
    } else {
      notFollowed += 1;
      agg.notFollowedCount += 1;
      bumpNameCount(agg.disfollowedBy, ev.actor);
      detailMisses.push({
        date: dateStr,
        slotLabel: layerLabel,
        hourKey,
        roleLabel: roleLabel(ev.roleKey, ev.field, reportKey),
        planned: planned.join(", "),
        actual: ev.actor,
        action: ev.action,
        regNo: ev.regNo,
        diagnosticNo: ev.diagnosticNo,
      });
    }
  });

  const days = dates.map((date) => {
    const dayPlan = dayPlans[date] || { slots: [] };
    const slots = (dayPlan.slots || []).map((slot, slotIdx) => {
      const slotN = slotIdx + 1;
      const hourKeys = hoursForSlot(slot.startTime, slot.endTime);
      const roles = rolesFromAggs(slotRoleMap, `${date}|${slot.id}|base|`);
      const totals = roleTotalsFromList(roles);

      const hourOverrides = hourKeys
        .map((hk, hourIdx) => {
          if (!isHourOverrideOfSlot(dayPlan, slot, hk)) return null;
          const ovRoles = rolesFromAggs(
            slotRoleMap,
            `${date}|${slot.id}|hour:${hk}|`
          );
          if (!ovRoles.length) return null;
          const ovTotals = roleTotalsFromList(ovRoles);
          const hourIndex = hourIdx + 1;
          return {
            id: `${slot.id}-${hk}`,
            hourKey: hk,
            hourIndex,
            label: workflowLayerLabel(slotN, hourIndex, true),
            rangeLabel: formatHourRange(hk),
            ...ovTotals,
            roles: ovRoles,
          };
        })
        .filter(Boolean);

      return {
        id: slot.id,
        slotIndex: slotN,
        label: `Slot ${slotN}`,
        rangeLabel: formatSlotRange(slot.startTime, slot.endTime),
        startTime: slot.startTime,
        endTime: slot.endTime,
        ...totals,
        roles,
        hourOverrides,
      };
    });

    return { date, slots };
  });

  const slotChart = [];
  days.forEach((day) => {
    day.slots.forEach((slot) => {
      slotChart.push({
        name: `${day.date.slice(5)} ${slot.label}`,
        followed: slot.followedCount,
        notFollowed: slot.notFollowedCount,
      });
      (slot.hourOverrides || []).forEach((ov) => {
        slotChart.push({
          name: `${day.date.slice(5)} ${ov.label}`,
          followed: ov.followedCount,
          notFollowed: ov.notFollowedCount,
        });
      });
    });
  });

  const roleTotals = {};
  for (const agg of slotRoleMap.values()) {
    const label = agg.roleLabel;
    if (!roleTotals[label]) {
      roleTotals[label] = { name: label, followed: 0, notFollowed: 0 };
    }
    roleTotals[label].followed += agg.followedCount;
    roleTotals[label].notFollowed += agg.notFollowedCount;
  }
  const roleChart = Object.values(roleTotals).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return {
    summary: {
      totalEvents: events.length,
      checked,
      followed,
      notFollowed,
      followRate: checked ? Math.round((followed / checked) * 100) : null,
      skippedNoPlan,
      skippedNoSlot,
      daysWithPlans: dates.filter((d) => (dayPlans[d]?.slots || []).length)
        .length,
      dayCount: dates.length,
    },
    days,
    slotChart,
    roleChart,
    detailMisses: detailMisses.slice(0, 500),
  };
}
