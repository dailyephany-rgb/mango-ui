/**
 * In-memory component timeline for the current page-load session.
 * Observer-only — never throws to callers.
 */

import { catalogForPage } from "./componentCatalog.js";
import {
  resolveModuleId,
  resolveModuleFromStack,
} from "./moduleRegistry.js";

/** @type {string | null} */
let loadId = null;
/** @type {number} */
let sessionStartedAt = 0;
/** @type {string} */
let pageKey = "unknown";

/** @type {Map<string, string>} name → moduleId */
const moduleByName = new Map();

/**
 * @typedef {{
 *   name: string,
 *   type: string,
 *   parent: string | null,
 *   mounted: boolean,
 *   mountedAt: number | null,
 *   mountMs: number | null,
 *   renderMs: number | null,
 *   firstSnapshotMs: number | null,
 *   mergeMs: number | null,
 *   filterMs: number | null,
 *   sortMs: number | null,
 *   virtualRenderMs: number | null,
 *   readyMs: number | null,
 *   totalMs: number | null,
 *   status: string,
 * }} CompRow
 */

/** @type {Map<string, CompRow>} */
const mounted = new Map();

/** @type {string[]} */
const activeStack = [];

function blankRow(name, type, parent) {
  return {
    name,
    type: type || "Layout",
    parent: parent ?? null,
    moduleId: null,
    mounted: false,
    mountedAt: null,
    mountMs: null,
    renderMs: null,
    firstSnapshotMs: null,
    mergeMs: null,
    filterMs: null,
    sortMs: null,
    virtualRenderMs: null,
    readyMs: null,
    totalMs: null,
    status: "not_mounted",
  };
}

/**
 * @param {{ loadId: string, page: string, startedAt?: number }} opts
 */
export function startComponentSession(opts) {
  try {
    loadId = opts.loadId || null;
    pageKey = opts.page || "unknown";
    sessionStartedAt =
      typeof opts.startedAt === "number" ? opts.startedAt : performance.now();
    mounted.clear();
    activeStack.length = 0;
    moduleByName.clear();
  } catch {
    /* ignore */
  }
}

export function getComponentLoadId() {
  return loadId;
}

export function getActiveComponentName() {
  return activeStack.length ? activeStack[activeStack.length - 1] : null;
}

/**
 * Attribution for Firestore/listener events (observer-only).
 * @returns {{ loadId: string | null, pageId: string, moduleId: string, componentId: string | null }}
 */
export function getFsAttribution() {
  const componentId = getActiveComponentName();
  const parent =
    activeStack.length > 1 ? activeStack[activeStack.length - 2] : null;
  const moduleId = resolveModuleFromStack(activeStack, {
    page: pageKey,
    moduleByName,
  });
  return {
    loadId,
    pageId: pageKey || "unknown",
    moduleId: moduleId || pageKey || "unknown",
    componentId: componentId || null,
    parent,
  };
}

/**
 * @param {{ name: string, type?: string, parent?: string | null, moduleId?: string | null, mountMs?: number | null }} spec
 */
export function markComponentMount(spec) {
  try {
    if (!spec?.name) return;
    const t0 = performance.now();
    const resolvedModule = resolveModuleId(spec.name, {
      page: pageKey,
      parent: spec.parent,
      moduleId: spec.moduleId,
    });
    moduleByName.set(spec.name, resolvedModule);
    const prev = mounted.get(spec.name);
    const row = prev || blankRow(spec.name, spec.type, spec.parent);
    row.mounted = true;
    row.type = spec.type || row.type;
    row.parent = spec.parent !== undefined ? spec.parent : row.parent;
    row.moduleId = resolvedModule;
    // Keep first mount time — remounts (Suspense / tab return) must not rewrite chronology.
    if (row.mountedAt == null) {
      row.mountedAt = Math.round(t0 - sessionStartedAt);
    }
    if (row.status === "not_mounted" || !prev) {
      row.status = "mounting";
    }
    // Production-safe: React.Profiler onRender is a no-op in prod builds.
    // Callers pass mountMs from useLayoutEffect elapsed time.
    if (typeof spec.mountMs === "number" && Number.isFinite(spec.mountMs)) {
      const ms = Math.max(0, Math.round(spec.mountMs));
      if (row.mountMs == null) row.mountMs = ms;
      if (row.renderMs == null) row.renderMs = ms;
      recomputeReady(row);
    }
    if (!activeStack.includes(spec.name)) activeStack.push(spec.name);
    mounted.set(spec.name, row);
  } catch {
    /* ignore */
  }
}

/**
 * First paint commit after mount (Profiler actualDuration).
 * @param {string} name
 * @param {number} actualDuration
 * @param {"mount"|"update"} phase
 */
export function markComponentRender(name, actualDuration, phase) {
  try {
    if (!name || !mounted.has(name)) return;
    const row = mounted.get(name);
    if (phase === "mount" && row.mountMs == null) {
      row.mountMs = Math.round(actualDuration);
      row.status = "mounted";
    }
    if (typeof actualDuration === "number" && Number.isFinite(actualDuration)) {
      row.renderMs =
        row.renderMs == null
          ? Math.round(actualDuration)
          : Math.round(Math.max(row.renderMs, actualDuration));
    }
    recomputeReady(row);
    mounted.set(name, row);
  } catch {
    /* ignore */
  }
}

/**
 * Attribute page first-snapshot wait to the active (or best) data/table component.
 * @param {number} arrivalMs performance.now()-style page age preferred; absolute ok
 */
export function markComponentFirstSnapshot(arrivalMs) {
  try {
    if (arrivalMs == null || !Number.isFinite(arrivalMs)) return;
    const target =
      getActiveComponentName() ||
      [...mounted.values()].find(
        (r) =>
          r.mounted &&
          (r.type === "Data" || r.type === "Tables" || r.type === "Page")
      )?.name;
    if (!target) return;
    const row = mounted.get(target);
    if (!row || row.firstSnapshotMs != null) return;
    const age =
      row.mountedAt != null
        ? Math.max(0, Math.round(arrivalMs - row.mountedAt))
        : Math.round(arrivalMs);
    row.firstSnapshotMs = age;
    if (row.status === "mounting" || row.status === "mounted") {
      row.status = "ok";
    }
    recomputeReady(row);
    mounted.set(target, row);
  } catch {
    /* ignore */
  }
}

/**
 * Optional phase marks (merge / filter / sort / virtual) — no-op if unknown.
 * @param {string} name
 * @param {'merge'|'filter'|'sort'|'virtualRender'|'ready'} phase
 * @param {number} ms
 */
export function markComponentPhase(name, phase, ms) {
  try {
    if (!name || !mounted.has(name) || ms == null || !Number.isFinite(ms)) return;
    const row = mounted.get(name);
    const v = Math.round(ms);
    if (phase === "merge") row.mergeMs = v;
    else if (phase === "filter") row.filterMs = v;
    else if (phase === "sort") row.sortMs = v;
    else if (phase === "virtualRender") row.virtualRenderMs = v;
    else if (phase === "ready") row.readyMs = v;
    recomputeReady(row);
    mounted.set(name, row);
  } catch {
    /* ignore */
  }
}

export function markComponentUnmount(name) {
  try {
    const i = activeStack.lastIndexOf(name);
    if (i >= 0) activeStack.splice(i, 1);
  } catch {
    /* ignore */
  }
}

function recomputeReady(row) {
  const parts = [
    row.mountMs,
    row.renderMs,
    row.firstSnapshotMs,
    row.mergeMs,
    row.filterMs,
    row.sortMs,
    row.virtualRenderMs,
  ].filter((n) => typeof n === "number");
  if (!parts.length) return;
  const ready = Math.max(...parts);
  row.readyMs = ready;
  row.totalMs = ready;
  if (row.mounted && row.status !== "hung") row.status = "ok";
}

/**
 * Build final components[] for eng_components (includes Not Mounted catalog slots).
 * @returns {CompRow[]}
 */
export function buildComponentBreakdown() {
  try {
    const catalog = catalogForPage(pageKey);
    const byName = new Map();
    for (const spec of catalog) {
      byName.set(spec.name, blankRow(spec.name, spec.type, spec.parent));
    }
    for (const [name, row] of mounted) {
      byName.set(name, { ...row });
    }
    const list = [...byName.values()];
    // Stable: catalog order first, then any extras
    const order = new Map(catalog.map((c, i) => [c.name, i]));
    list.sort((a, b) => {
      const ia = order.has(a.name) ? order.get(a.name) : 1000;
      const ib = order.has(b.name) ? order.get(b.name) : 1000;
      if (ia !== ib) return ia - ib;
      return String(a.name).localeCompare(String(b.name));
    });
    return list.map((r) => ({
      name: r.name,
      type: r.type,
      parent: r.parent,
      mounted: !!r.mounted,
      mountMs: r.mounted ? r.mountMs : null,
      renderMs: r.mounted ? r.renderMs : null,
      firstSnapshotMs: r.mounted ? r.firstSnapshotMs : null,
      mergeMs: r.mounted ? r.mergeMs : null,
      filterMs: r.mounted ? r.filterMs : null,
      sortMs: r.mounted ? r.sortMs : null,
      virtualRenderMs: r.mounted ? r.virtualRenderMs : null,
      readyMs: r.mounted ? r.readyMs : null,
      totalMs: r.mounted ? r.totalMs : null,
      status: r.mounted ? r.status || "ok" : "not_mounted",
      mountedAt: r.mounted ? r.mountedAt : null,
    }));
  } catch {
    return [];
  }
}

export function resetComponentSession() {
  loadId = null;
  pageKey = "unknown";
  sessionStartedAt = 0;
  mounted.clear();
  activeStack.length = 0;
  moduleByName.clear();
}
