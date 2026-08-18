/**
 * Operation Workflow compliance: join clinical activity to Operation Map plans.
 *
 * For each Firestore register stage (savedBy+savedTime, validatedBy+validatedTime,
 * mango By+Time pairs, outsource By+Time pairs, insideLab savedBy+timeSaved):
 *   1. Floor the stage timestamp to date + hourKey
 *   2. Load planned assignees for that role at that hour
 *   3. Followed iff the actor is in that hour's planned list
 * Slot is used only to group PDF rows; Planned column unions names across slot hours.
 */
import { trackedGetDocs as getDocs } from "../../shared/firestore/trackedFirestore.js";
import * as Biochem from "../lib/dataFetcher_biochem_main.js";
import * as Hormones from "../lib/dataFetcher_hormones_main.js";
import * as Haem from "../lib/dataFetcher_haem.js";
import * as Coag from "../lib/dataFetcher.js";
import * as Serology from "../lib/dataFetcher_serology.js";
import * as Rapid from "../lib/dataFetcher_rapid.js";
import * as Urine from "../lib/dataFetcher_urine.js";
import * as Esr from "../lib/dataFetcher_esr.js";
import * as BloodGroupTesting from "../lib/dataFetcher_bloodgroup_testing.js";
import * as BloodGroupRetesting from "../lib/dataFetcher_bloodgroup_retesting.js";
import * as Outsource from "../lib/dataFetcher_outsource.js";
import * as Lab from "../lib/dataFetcher_lab.js";
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
} from "../../operation_map/roleConfig.js";
import { toLocalDateString, parseDateField } from "../../shared/utils/dates.js";
import { scopedTimePrintedQuery } from "../../shared/firestore/scopedTimePrintedQuery.js";

const OVERVIEW_TIMEOUT_MS = 90_000;

/** Placeholder actors from registers — never count as workflow entries. */
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
  "unknown",
  "not available",
]);

const CLINICAL_SOURCES = [
  { roleKey: "biochemistry", subscribe: Biochem.subscribeOverview },
  { roleKey: "hormones", subscribe: Hormones.subscribeOverview },
  { roleKey: "haematology", subscribe: Haem.subscribeOverview },
  { roleKey: "coagulation", subscribe: Coag.subscribeOverview },
  { roleKey: "backroom", subscribe: Serology.subscribeOverview },
  { roleKey: "backroom", subscribe: Rapid.subscribeOverview },
  { roleKey: "backroom", subscribe: Urine.subscribeOverview },
  { roleKey: "backroom", subscribe: Esr.subscribeOverview },
  { roleKey: "backroom", subscribe: BloodGroupTesting.subscribeOverview },
  { roleKey: "backroom", subscribe: BloodGroupRetesting.subscribeOverview },
];

const OUTSOURCE_LABS = [
  { id: "SterlingRegister", lab: "STERLING" },
  { id: "NeubergRegister", lab: "NEUBERG" },
  { id: "LifecellRegister", lab: "LIFECELL" },
  { id: "LilacRegister", lab: "LILAC" },
  { id: "ReliableRegister", lab: "RELIABLE" },
];

const INSIDE_LAB_DEPTS = [
  { id: "FnacRegister", dept: "FNAC" },
  { id: "PathologyRegister", dept: "PATHOLOGY" },
  { id: "CultureRegister", dept: "CULTURE" },
  { id: "FluidRegister", dept: "FLUID" },
];

function firstOverviewPayload(subscribeOverview, opts, settleMs = 450) {
  return new Promise((resolve, reject) => {
    let done = false;
    let unsub = null;
    let latest = null;
    let settleTimer = null;

    const finish = (payload, err) => {
      if (done) return;
      done = true;
      clearTimeout(hardTimer);
      clearTimeout(settleTimer);
      try {
        if (typeof unsub === "function") unsub();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(payload || {});
    };

    const hardTimer = setTimeout(() => {
      if (latest != null) finish(latest);
      else finish(null, new Error("Timed out waiting for department overview"));
    }, OVERVIEW_TIMEOUT_MS);

    try {
      if (typeof subscribeOverview !== "function") {
        finish(
          null,
          new Error("Department subscribeOverview is not available")
        );
        return;
      }
      unsub = subscribeOverview({
        ...opts,
        onData: (payload) => {
          latest = payload;
          clearTimeout(settleTimer);
          settleTimer = setTimeout(() => finish(latest), settleMs);
        },
      });
    } catch (err) {
      finish(null, err);
    }
  });
}

function matchesSource(row, source) {
  if (!source || source === "All") return true;
  return (
    String(row.source || "")
      .trim()
      .toUpperCase() === String(source).trim().toUpperCase()
  );
}

async function loadReportDetailsRows(dateRange, source) {
  const q = scopedTimePrintedQuery("report_details", dateRange);
  if (!q) return [];
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => matchesSource(r, source));
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
  return `${String(d.getHours()).padStart(2, "0")}:00`;
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

function roleLabel(roleKey, field) {
  const base = ROLE_CONFIG[roleKey]?.label || roleKey;
  if (field === "validator") return `${base} Validator`;
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
 * Each stage is its own entry matched to the hour of that stage's timestamp.
 */
function emitClinicalRows(events, rows, roleKey) {
  (rows || []).forEach((r) => {
    pushEvent(events, {
      roleKey,
      field: "staff",
      actor: r.savedBy,
      at: firstDate(r.timeSaved, r.savedTime),
      action: "saved",
      regNo: r.regNo,
      diagnosticNo: r.diagnosticNo,
    });
    pushEvent(events, {
      roleKey,
      field: "validator",
      actor: r.validatedBy,
      at: firstDate(r.timeValidated, r.validatedTime),
      action: "validated",
      regNo: r.regNo,
      diagnosticNo: r.diagnosticNo,
    });
  });
}

/** Mango Operator: each By+Time pair is its own entry vs mangoOperator that hour. */
function emitMangoRows(events, records) {
  (records || []).forEach((r) => {
    pushEvent(events, {
      roleKey: "mangoOperator",
      field: "staff",
      actor: r.receiptSavedBy,
      at: firstDate(r.timePrinted, r.receiptSavedTime),
      action: "receipt",
      regNo: r.regNo,
      diagnosticNo: r.diagnosticNo,
    });
    pushEvent(events, {
      roleKey: "mangoOperator",
      field: "staff",
      actor: r.routineReportPrintedBy,
      at: firstDate(r.routineReportPrintedTime),
      action: "routinePrint",
      regNo: r.regNo,
      diagnosticNo: r.diagnosticNo,
    });
    pushEvent(events, {
      roleKey: "mangoOperator",
      field: "staff",
      actor: r.insideLabReportPrintedBy,
      at: firstDate(r.insideLabReportPrintedTime),
      action: "insidePrint",
      regNo: r.regNo,
      diagnosticNo: r.diagnosticNo,
    });
    pushEvent(events, {
      roleKey: "mangoOperator",
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
      field: "staff",
      actor: r.savedBy,
      at: firstDate(r.timeSaved, r.savedTime),
      action: "insideSave",
      regNo: r.regNo,
      diagnosticNo: r.diagnosticNo,
    });
  });
}

/**
 * Outsource stages: each By+Time vs outsource staff list for that hour only.
 * Never reuse another stage's timestamp.
 */
function emitOutsourceRows(events, rows) {
  (rows || []).forEach((r) => {
    pushEvent(events, {
      roleKey: "outsource",
      field: "staff",
      actor: r.collectedBy,
      at: firstDate(r.timeOutsourcedCollected, r.outsourcedCollectedTime),
      action: "collected",
      regNo: r.regNo,
      diagnosticNo: r.diagnosticNo,
    });
    pushEvent(events, {
      roleKey: "outsource",
      field: "staff",
      actor: r.receivedBy,
      at: firstDate(r.timeReportReceived, r.reportReceivedTime),
      action: "received",
      regNo: r.regNo,
      diagnosticNo: r.diagnosticNo,
    });
    pushEvent(events, {
      roleKey: "outsource",
      field: "staff",
      actor: r.deliveredBy,
      at: firstDate(r.timeReportDelivered, r.reportDeliveredTime),
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

function emptyRoleAgg(roleKey, field) {
  return {
    roleKey,
    field,
    roleLabel: roleLabel(roleKey, field),
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

  const [mangoRows, clinicalPayloads, insideChunks, outsourceChunks] =
    await Promise.all([
      loadReportDetailsRows(dateRange, source),
      Promise.all(
        CLINICAL_SOURCES.map(async (src) => {
          const payload = await firstOverviewPayload(src.subscribe, {
            dateRange,
            source,
          });
          return {
            roleKey: src.roleKey,
            rows: payload.unifiedRows || payload.deptRows || [],
          };
        })
      ),
      Promise.all(
        INSIDE_LAB_DEPTS.map(async (tab) => {
          const payload = await firstOverviewPayload(Lab.subscribeOverview, {
            dateRange,
            source,
            activeRegister: tab.id,
            targetDept: tab.dept,
          });
          return payload.deptRows || payload.unifiedRows || [];
        })
      ),
      Promise.all(
        OUTSOURCE_LABS.map(async (tab) => {
          const payload = await firstOverviewPayload(
            Outsource.subscribeOverview,
            {
              dateRange,
              source,
              activeRegister: tab.id,
              targetLab: tab.lab,
            }
          );
          return payload.deptRows || payload.unifiedRows || [];
        })
      ),
    ]);

  emitMangoRows(events, mangoRows);
  clinicalPayloads.forEach(({ roleKey, rows }) =>
    emitClinicalRows(events, rows, roleKey)
  );
  emitInsideRows(events, insideChunks.flat());
  emitOutsourceRows(events, outsourceChunks.flat());

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
    const dateStr = toLocalDateString(ev.at);
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

    // Match against Operation Map hour of this register timestamp only.
    const assignments = normalizeAssignments(
      dayPlan.hours?.[hourKey]?.assignments
    );
    const planned = resolvePlanned(assignments, ev.roleKey, ev.field);
    const aggKey = `${dateStr}|${slot.id}|${ev.roleKey}|${ev.field}`;

    if (!slotRoleMap.has(aggKey)) {
      slotRoleMap.set(aggKey, {
        date: dateStr,
        slot,
        ...emptyRoleAgg(ev.roleKey, ev.field),
      });
    }
    const agg = slotRoleMap.get(aggKey);

    // Planned column = union across all hours in the slot (display).
    // Followed check below still uses only this activity hour's planned list.
    for (const hk of hoursForSlot(slot.startTime, slot.endTime)) {
      const hourPlanned = resolvePlanned(
        normalizeAssignments(dayPlan.hours?.[hk]?.assignments),
        ev.roleKey,
        ev.field
      );
      hourPlanned.forEach((p) => agg.plannedNames.add(p));
    }

    if (!planned.length) {
      agg.skippedNoPlan += 1;
      skippedNoPlan += 1;
      return;
    }

    checked += 1;
    const ok = planned.some((p) => namesMatch(p, ev.actor));
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
        slotLabel: slot.label || formatSlotRange(slot.startTime, slot.endTime),
        hourKey,
        roleLabel: roleLabel(ev.roleKey, ev.field),
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
    const slots = (dayPlan.slots || []).map((slot) => {
      const roles = [];
      for (const [key, agg] of slotRoleMap.entries()) {
        if (!key.startsWith(`${date}|${slot.id}|`)) continue;
        roles.push({
          roleKey: agg.roleKey,
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

      const followedCount = roles.reduce((s, r) => s + r.followedCount, 0);
      const notFollowedCount = roles.reduce(
        (s, r) => s + r.notFollowedCount,
        0
      );
      const entries = followedCount + notFollowedCount;

      return {
        id: slot.id,
        label: slot.label || formatSlotRange(slot.startTime, slot.endTime),
        rangeLabel: formatSlotRange(slot.startTime, slot.endTime),
        startTime: slot.startTime,
        endTime: slot.endTime,
        followedCount,
        notFollowedCount,
        entries,
        followPct: entries
          ? Math.round((followedCount / entries) * 100)
          : null,
        roles,
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
