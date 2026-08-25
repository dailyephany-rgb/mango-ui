/**
 * Classify why an Engineering page-load was marked hung.
 * Observer-only: reads already-flushed eng_* fields. No clinical queries.
 */

import { loadStatus } from "./perfViews.js";

export const HUNG_TIMER_MS = 15000;
export const LATE_SNAP_MS = 10000;
export const ERROR_WINDOW_MS = 180000;

export const CAUSE_LABELS = {
  crash_idb:
    "IndexedDB / persistence assertion (eng_errors) — not a silent first-snapshot hang",
  master_never_first_snapshot:
    "master_register listen opened but never first-snapped (page first-snapshot waits on master)",
  dept_never_first_snapshot:
    "Department register listen opened but never first-snapped (no master_register in this load)",
  late_after_hung_timer:
    "First snapshot arrived after the ~15s hung timer (late snap labeled hung)",
  component_snap_page_hung:
    "A Page slot recorded a snapshot, but the page-load stayed hung (timer vs gate collection)",
  nested_hormones_hung:
    "Nested Hormones tab hung after the parent page slot already had a snapshot",
  missing_fs_breakdown:
    "No eng_fs_component_loads row for this Load ID — daily FS CSV cannot diagnose this hang",
  unknown_wait:
    "Hung with no matching error and no usable FS first-snap evidence",
};

const IDB_RE =
  /INTERNAL ASSERTION|b815|b7de|IndexedDB|QuotaExceeded|IDB|persistence/i;

function normCol(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isMasterCol(name) {
  return normCol(name) === "masterregister";
}

function isKindFirstSnap(kind, extra) {
  if (extra?.firstSnapshot) return true;
  const k = String(kind || extra?.operation || "").toLowerCase();
  return k === "snapshot_first" || k === "first_snapshot";
}

function isKindOpen(kind, extra) {
  const k = String(kind || extra?.operation || extra?.action || "").toLowerCase();
  return k === "listener_open" || k === "open";
}

/**
 * @param {ReturnType<typeof import('./FirestoreByComponentPage.jsx').parseFsLoadDoc> | null} fs
 */
export function summarizeFsCollections(fs) {
  /** @type {Map<string, { collection: string, listeners: number, opens: number, firstSnaps: number, firstSnapMaxMs: number }>} */
  const map = new Map();
  const ensure = (raw) => {
    const collection = String(raw || "unknown");
    if (!map.has(collection)) {
      map.set(collection, {
        collection,
        listeners: 0,
        opens: 0,
        firstSnaps: 0,
        firstSnapMaxMs: 0,
      });
    }
    return map.get(collection);
  };

  if (!fs) return [];

  for (const m of fs.modules || []) {
    for (const c of m.collections || []) {
      const row = ensure(c.collection);
      row.listeners += Number(c.listeners) || 0;
    }
  }
  for (const q of fs.recentQueries || []) {
    const row = ensure(q.collection);
    if (isKindOpen(q.kind, q)) row.opens += Number(q.count) || 1;
    if (isKindFirstSnap(q.kind, q)) {
      row.firstSnaps += Number(q.count) || 1;
      const ms = Number(q.avgMs);
      if (Number.isFinite(ms)) row.firstSnapMaxMs = Math.max(row.firstSnapMaxMs, ms);
    }
  }
  for (const e of fs.recentTimeline || []) {
    const row = ensure(e.collection);
    if (isKindOpen(e.operation, e)) row.opens += 1;
    if (isKindFirstSnap(e.operation, e) || isKindFirstSnap(e.kind, e)) {
      row.firstSnaps += 1;
      const ms = Number(e.durationMs);
      if (Number.isFinite(ms)) row.firstSnapMaxMs = Math.max(row.firstSnapMaxMs, ms);
    }
  }
  return [...map.values()];
}

function gateCollection(cols) {
  const master = cols.find((c) => isMasterCol(c.collection));
  if (master) return master;
  const registers = cols.filter((c) =>
    normCol(c.collection).includes("register")
  );
  registers.sort(
    (a, b) =>
      b.listeners + b.opens - (a.listeners + a.opens) ||
      b.firstSnaps - a.firstSnaps
  );
  return registers[0] || null;
}

function gateOpened(gate) {
  if (!gate) return false;
  return gate.listeners > 0 || gate.opens > 0 || gate.firstSnaps > 0;
}

/**
 * @param {object} load
 * @param {{ includeIncomplete?: boolean }} [opts]
 */
export function isDiagnosableHang(load, opts = {}) {
  if (loadStatus(load) === "hung") return true;
  if (
    opts.includeIncomplete &&
    load?.incomplete === true &&
    load?.firstSnapshotMs == null
  ) {
    return true;
  }
  return false;
}

export function matchingErrors(load, errors) {
  const loadId = String(load?.loadId || load?.id || "");
  const deviceId = load?.deviceId;
  const ts = Number(load?.ts) || 0;
  return (errors || []).filter((err) => {
    if (!err) return false;
    const errLoad = String(err.loadId || "").trim();
    if (errLoad && loadId && errLoad === loadId) return true;
    if (!deviceId || err.deviceId !== deviceId) return false;
    const ets = Number(err.ts) || 0;
    return Math.abs(ets - ts) <= ERROR_WINDOW_MS;
  });
}

function errorLooksIdb(err) {
  const blob = `${err.message || ""} ${err.code || ""} ${err.stack || ""} ${err.source || ""}`;
  return IDB_RE.test(blob);
}

function componentList(componentsDoc) {
  if (!componentsDoc) return [];
  return Array.isArray(componentsDoc.components) ? componentsDoc.components : [];
}

function pageSlot(comps) {
  return (
    comps.find((c) => c.mounted && c.type === "Page" && !c.parent) ||
    comps.find((c) => c.mounted && c.type === "Page") ||
    null
  );
}

function hungComps(comps) {
  return comps.filter((c) => c.mounted && c.status === "hung");
}

function hormonesHung(comps) {
  return comps.some(
    (c) =>
      c.mounted &&
      c.status === "hung" &&
      /hormones/i.test(String(c.name || ""))
  );
}

/**
 * @param {{
 *   load: object,
 *   fsLoad?: object | null,
 *   componentsDoc?: object | null,
 *   errors?: object[],
 * }} args
 */
export function diagnoseHungLoad({
  load,
  fsLoad = null,
  componentsDoc = null,
  errors = [],
}) {
  const comps = componentList(componentsDoc);
  const hung = hungComps(comps);
  const page = pageSlot(comps);
  const matchedErrors = matchingErrors(load, errors);
  const idbErrors = matchedErrors.filter(errorLooksIdb);
  const cols = summarizeFsCollections(fsLoad);
  const gate = gateCollection(cols);
  const hasFs = !!(fsLoad && (cols.length || fsLoad.modules?.length));
  const findings = [];
  const evidence = [];

  if (load.classification) {
    evidence.push(
      `page-load classification=${load.classification} reason=${load.finalReason || "—"} waitingListeners=${load.waitingListeners ?? "—"}`
    );
  }
  evidence.push(
    `page firstSnapshotMs=${load.firstSnapshotMs ?? "null"} totalMs=${load.totalMs ?? "—"} hung=${load.hung === true}`
  );
  if (page) {
    evidence.push(
      `Page slot ${page.name}: status=${page.status} firstSnapshotMs=${page.firstSnapshotMs ?? "null"}`
    );
  }
  if (hung.length) {
    evidence.push(
      `hung components: ${hung.map((c) => c.name).join(", ") || "—"}`
    );
  }
  if (gate) {
    evidence.push(
      `gate collection ${gate.collection}: listeners=${gate.listeners} opens=${gate.opens} firstSnaps=${gate.firstSnaps} firstSnapMaxMs=${gate.firstSnapMaxMs || 0}`
    );
  }

  if (idbErrors.length) {
    findings.push("crash_idb");
    evidence.push(
      `matching eng_errors (${idbErrors.length}): ${idbErrors
        .map((e) => e.message)
        .filter(Boolean)
        .slice(0, 2)
        .join(" | ")}`
    );
  }

  if (hasFs && gate && isMasterCol(gate.collection) && gateOpened(gate) && gate.firstSnaps === 0) {
    findings.push("master_never_first_snapshot");
  } else if (
    hasFs &&
    gate &&
    !isMasterCol(gate.collection) &&
    gateOpened(gate) &&
    gate.firstSnaps === 0
  ) {
    findings.push("dept_never_first_snapshot");
  }

  const lateFromTimeline = (fsLoad?.recentTimeline || []).some((e) => {
    if (!isKindFirstSnap(e.operation, e) && !isKindFirstSnap(e.kind, e)) {
      return false;
    }
    if ((Number(e.durationMs) || 0) >= LATE_SNAP_MS) return true;
    const ets = Number(e.ts);
    const lts = Number(load.ts);
    return Number.isFinite(ets) && Number.isFinite(lts) && ets - lts >= LATE_SNAP_MS;
  });
  if (
    hasFs &&
    gate &&
    gate.firstSnaps > 0 &&
    (gate.firstSnapMaxMs >= LATE_SNAP_MS || lateFromTimeline)
  ) {
    findings.push("late_after_hung_timer");
  }

  if (
    page &&
    page.firstSnapshotMs != null &&
    (load.firstSnapshotMs == null || load.hung === true)
  ) {
    findings.push("component_snap_page_hung");
  }

  if (hormonesHung(comps)) {
    findings.push("nested_hormones_hung");
  }

  if (!hasFs) {
    findings.push("missing_fs_breakdown");
  }

  if (!findings.length) {
    findings.push("unknown_wait");
  }

  const causePriority = [
    "crash_idb",
    "master_never_first_snapshot",
    "dept_never_first_snapshot",
    "late_after_hung_timer",
    "component_snap_page_hung",
    "nested_hormones_hung",
    "missing_fs_breakdown",
    "unknown_wait",
  ];
  const cause =
    causePriority.find((c) => findings.includes(c)) || findings[0];

  return {
    cause,
    label: CAUSE_LABELS[cause] || cause,
    findings,
    evidence,
    matchedErrors,
    hungComponents: hung,
    pageComponent: page,
    gate,
    collections: cols,
    hasFs,
  };
}

export function causeCounts(rows) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const r of rows) {
    const k = r.diagnosis?.cause || "unknown_wait";
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}
