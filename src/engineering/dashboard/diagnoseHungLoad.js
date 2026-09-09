/**
 * Classify why an Engineering page-load was marked hung.
 * Observer-only: reads already-flushed eng_* fields. No clinical queries.
 */

import { dayKeyFromTs, loadStatus } from "./perfViews.js";

export const HUNG_TIMER_MS = 15000;
export const LATE_SNAP_MS = 10000;
export const ERROR_WINDOW_MS = 180000;

/** Heap used / limit ratio that counts as pressure. */
export const MEMORY_PRESSURE_RATIO = 0.85;
/** Heap growth (MB/h) that counts as pressure. */
export const MEMORY_GROWTH_MB_PER_HOUR = 50;

export const CAUSE_LABELS = {
  crash_idb:
    "IndexedDB / persistence assertion (eng_errors) — not a silent first-snapshot hang",
  network_offline_at_hang:
    "Browser reported offline when the page-load hung",
  memory_pressure_near_hang:
    "Same-day device heap near limit or growing fast (possible SDK / tab pressure)",
  network_degraded_near_hang:
    "Same-day device had offline network events around this hang window",
  master_never_first_snapshot:
    "master_register listen opened but never first-snapped (page first-snapshot waits on master)",
  dept_never_first_snapshot:
    "Department register listen opened but never first-snapped (no master_register in this load)",
  listeners_waiting_no_first_snapshot:
    "Page waited on open listeners that never first-snapped (no per-load FS gate needed)",
  late_after_hung_timer:
    "First snapshot arrived after the ~15s hung timer (late snap labeled hung)",
  component_snap_page_hung:
    "A Page slot recorded a snapshot, but the page-load stayed hung (timer vs gate collection)",
  nested_hormones_hung:
    "Nested Hormones tab hung after the parent page slot already had a snapshot",
  missing_fs_breakdown:
    "No eng_fs_component_loads row for this Load ID — cannot name the gate collection",
  unknown_wait:
    "Hung with no matching error and no usable first-snap / memory / network evidence",
};

const CAUSE_PRIORITY = [
  "crash_idb",
  "network_offline_at_hang",
  "memory_pressure_near_hang",
  "network_degraded_near_hang",
  "master_never_first_snapshot",
  "dept_never_first_snapshot",
  "listeners_waiting_no_first_snapshot",
  "late_after_hung_timer",
  "component_snap_page_hung",
  "nested_hormones_hung",
  "missing_fs_breakdown",
  "unknown_wait",
];

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
 * Pick best eng_memory row for a hung load: loadId match, else day+device.
 * @param {object} load
 * @param {object[]} memoryRows
 */
export function matchMemoryForLoad(load, memoryRows = []) {
  const deviceId = load?.deviceId;
  if (!deviceId || !memoryRows.length) return null;
  const loadId = String(load?.loadId || load?.id || "");
  const day = load?.day || dayKeyFromTs(load?.ts);

  const sameDevice = memoryRows.filter((r) => r && r.deviceId === deviceId);
  if (!sameDevice.length) return null;

  if (loadId) {
    const byLoad = sameDevice.find(
      (r) => String(r.loadId || "").trim() === loadId
    );
    if (byLoad) return byLoad;
  }

  const byDay = sameDevice.filter(
    (r) => (r.day || r.dateKey || dayKeyFromTs(r.ts)) === day
  );
  if (byDay.length) {
    // Prefer non-latest_ aggregate docs with used heap.
    const scored = [...byDay].sort((a, b) => {
      const aLatest = String(a.id || "").startsWith("latest_") ? 1 : 0;
      const bLatest = String(b.id || "").startsWith("latest_") ? 1 : 0;
      if (aLatest !== bLatest) return aLatest - bLatest;
      return (Number(b.usedJSHeapSize) || 0) - (Number(a.usedJSHeapSize) || 0);
    });
    return scored[0];
  }

  const latest = sameDevice.find((r) => String(r.id || "").startsWith("latest_"));
  return latest || sameDevice[0] || null;
}

/**
 * Pick eng_network day aggregate for device+day.
 * @param {object} load
 * @param {object[]} networkRows
 */
export function matchNetworkForLoad(load, networkRows = []) {
  const deviceId = load?.deviceId;
  if (!deviceId || !networkRows.length) return null;
  const day = load?.day || dayKeyFromTs(load?.ts);
  const sameDevice = networkRows.filter((r) => r && r.deviceId === deviceId);
  if (!sameDevice.length) return null;

  const byDay = sameDevice.filter(
    (r) => (r.day || r.dateKey || dayKeyFromTs(r.ts)) === day
  );
  if (byDay.length) {
    const scored = [...byDay].sort((a, b) => {
      const aLatest = String(a.id || "").startsWith("latest_") ? 1 : 0;
      const bLatest = String(b.id || "").startsWith("latest_") ? 1 : 0;
      if (aLatest !== bLatest) return aLatest - bLatest;
      return (Number(b.offlineEvents) || 0) - (Number(a.offlineEvents) || 0);
    });
    return scored[0];
  }
  return (
    sameDevice.find((r) => String(r.id || "").startsWith("latest_")) ||
    sameDevice[0] ||
    null
  );
}

/**
 * @param {object | null} mem
 * @returns {{
 *   heapUsedMB: number | null,
 *   heapLimitMB: number | null,
 *   heapPct: number | null,
 *   heapGrowthMBPerHour: number | null,
 *   pressure: boolean,
 *   unavailable: boolean,
 * }}
 */
export function summarizeMemory(mem) {
  if (!mem) {
    return {
      heapUsedMB: null,
      heapLimitMB: null,
      heapPct: null,
      heapGrowthMBPerHour: null,
      pressure: false,
      unavailable: true,
    };
  }
  const used = Number(mem.usedJSHeapSize);
  const limit = Number(mem.jsHeapSizeLimit);
  const growth = Number(mem.heapGrowthMBPerHour);
  const heapUsedMB = Number.isFinite(used) ? used / 1048576 : null;
  const heapLimitMB = Number.isFinite(limit) ? limit / 1048576 : null;
  let heapPct = null;
  if (heapUsedMB != null && heapLimitMB != null && heapLimitMB > 0) {
    heapPct = heapUsedMB / heapLimitMB;
  }
  const growthOk = Number.isFinite(growth) ? growth : null;
  const pressure =
    (heapPct != null && heapPct >= MEMORY_PRESSURE_RATIO) ||
    (growthOk != null && growthOk >= MEMORY_GROWTH_MB_PER_HOUR);
  const unavailable = heapUsedMB == null && heapLimitMB == null && growthOk == null;
  return {
    heapUsedMB,
    heapLimitMB,
    heapPct,
    heapGrowthMBPerHour: growthOk,
    pressure,
    unavailable,
  };
}

/**
 * @param {{
 *   load: object,
 *   fsLoad?: object | null,
 *   componentsDoc?: object | null,
 *   errors?: object[],
 *   memoryDoc?: object | null,
 *   networkDoc?: object | null,
 * }} args
 */
export function diagnoseHungLoad({
  load,
  fsLoad = null,
  componentsDoc = null,
  errors = [],
  memoryDoc = null,
  networkDoc = null,
}) {
  const comps = componentList(componentsDoc);
  const hung = hungComps(comps);
  const page = pageSlot(comps);
  const matchedErrors = matchingErrors(load, errors);
  const idbErrors = matchedErrors.filter(errorLooksIdb);
  const cols = summarizeFsCollections(fsLoad);
  const gate = gateCollection(cols);
  const hasFs = !!(fsLoad && (cols.length || fsLoad.modules?.length));
  const memSummary = summarizeMemory(memoryDoc);
  const offlineEvents = Number(networkDoc?.offlineEvents) || 0;
  const reconnects = Number(networkDoc?.reconnects) || 0;
  const findings = [];
  const evidence = [];

  if (load.classification) {
    evidence.push(
      `page-load classification=${load.classification} reason=${load.finalReason || "—"} waitingListeners=${load.waitingListeners ?? "—"}`
    );
  }
  evidence.push(
    `page firstSnapshotMs=${load.firstSnapshotMs ?? "null"} totalMs=${load.totalMs ?? "—"} hung=${load.hung === true} online=${load.online ?? "—"} visible=${load.visible ?? "—"}`
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

  if (memSummary.unavailable) {
    findings.push("memory_unavailable");
    evidence.push(
      "memory: unavailable (no Chromium performance.memory / no eng_memory row)"
    );
  } else {
    evidence.push(
      `memory: used=${memSummary.heapUsedMB != null ? memSummary.heapUsedMB.toFixed(1) : "—"}MB limit=${memSummary.heapLimitMB != null ? memSummary.heapLimitMB.toFixed(0) : "—"}MB pct=${memSummary.heapPct != null ? (memSummary.heapPct * 100).toFixed(0) + "%" : "—"} growth=${memSummary.heapGrowthMBPerHour != null ? memSummary.heapGrowthMBPerHour.toFixed(1) : "—"}MB/h`
    );
  }

  if (networkDoc) {
    evidence.push(
      `network day: offlineEvents=${offlineEvents} reconnects=${reconnects}`
    );
  } else {
    evidence.push("network: no eng_network row for device+day");
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

  if (load.online === false) {
    findings.push("network_offline_at_hang");
  }

  if (memSummary.pressure) {
    findings.push("memory_pressure_near_hang");
  }

  if (offlineEvents > 0) {
    findings.push("network_degraded_near_hang");
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

  if (
    load.firstSnapshotMs == null &&
    (Number(load.waitingListeners) || 0) > 0
  ) {
    findings.push("listeners_waiting_no_first_snapshot");
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

  const primaryFindings = findings.filter((f) => f !== "memory_unavailable");
  if (!primaryFindings.length) {
    findings.push("unknown_wait");
  }

  const cause =
    CAUSE_PRIORITY.find((c) => findings.includes(c)) ||
    primaryFindings[0] ||
    "unknown_wait";

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
    memory: memSummary,
    network: {
      offlineEvents,
      reconnects,
      matched: !!networkDoc,
    },
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
