/**
 * Engineering Dashboard — multi-tab PDF report.
 * Observer-only: reads eng_* via Engineering Firebase.
 * Respects the same global filters (date / dept / device / build / search).
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getEngDb, isEngFirebaseConfigured, getEngProjectId } from "../firebaseEngConfig.js";
import { ENG_COLLECTIONS } from "../constants.js";
import { filterRowsByGlobal } from "./engFilters.js";
import { computeHealthScore, devicePresence } from "../health/scores.js";
import { summarizeLoads, fmtMs, dayKeyFromTs } from "./perfViews.js";

function ms(n) {
  return fmtMs(n);
}

function fmtTs(ts) {
  if (ts == null) return "—";
  try {
    const n = typeof ts?.toMillis === "function" ? ts.toMillis() : Number(ts);
    if (!Number.isFinite(n)) return "—";
    return new Date(n).toLocaleString();
  } catch {
    return "—";
  }
}

function clientTsOf(row) {
  if (row?.clientTs != null) return row.clientTs;
  if (row?.lastSeenAt?.toMillis) return row.lastSeenAt.toMillis();
  return null;
}

function ensureSpace(doc, y, need = 40) {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + need > pageH - 14) {
    doc.addPage();
    return 16;
  }
  return y;
}

function sectionTitle(doc, title, y) {
  y = ensureSpace(doc, y, 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(30, 50, 80);
  doc.text(title, 14, y);
  doc.setTextColor(0);
  return y + 4;
}

function addTable(doc, y, head, body, opts = {}) {
  if (!body.length) {
    y = ensureSpace(doc, y, 12);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(opts.empty || "No data in selected filters.", 14, y);
    doc.setTextColor(0);
    return y + 6;
  }
  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    styles: { fontSize: opts.fontSize || 7, cellPadding: 1.2 },
    headStyles: { fillColor: [40, 60, 90], fontSize: 7 },
    margin: { left: 14, right: 14 },
    ...opts.table,
  });
  return doc.lastAutoTable.finalY + 8;
}

function kvTable(doc, y, pairs) {
  return addTable(
    doc,
    y,
    ["Metric", "Value"],
    pairs.map(([k, v]) => [k, v == null || v === "" ? "—" : String(v)]),
    { fontSize: 8 }
  );
}

/**
 * One-shot collection fetch (mirrors dashboard query modes).
 * @param {string} collectionName
 * @param {{
 *   timeMode?: 'day'|'ts'|'none',
 *   limitN?: number,
 *   filters?: object,
 *   range?: object,
 *   live?: boolean,
 *   skipTime?: boolean,
 * }} opts
 */
async function fetchFiltered(collectionName, opts = {}) {
  const db = getEngDb();
  if (!db) return [];
  const {
    timeMode = "day",
    limitN = 400,
    filters,
    range,
    live = false,
    skipTime = false,
  } = opts;

  const tryQuery = async (useRange) => {
    const colRef = collection(db, collectionName);
    const constraints = [];
    if (useRange && range && timeMode === "ts") {
      constraints.push(where("ts", ">=", range.startMs));
      if (!range.openEnded) constraints.push(where("ts", "<=", range.endMs));
      constraints.push(orderBy("ts", "desc"));
    } else if (useRange && range && timeMode === "day") {
      constraints.push(where("day", ">=", range.startDay));
      constraints.push(where("day", "<=", range.endDay));
    }
    if (limitN) constraints.push(limit(limitN));
    const qRef = constraints.length ? query(colRef, ...constraints) : colRef;
    const snap = await getDocs(qRef);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  };

  let rows = [];
  try {
    const useRange = timeMode !== "none" && range;
    rows = await tryQuery(!!useRange);
  } catch {
    try {
      rows = await tryQuery(false);
    } catch {
      rows = [];
    }
  }

  if (!filters || !range) return rows;
  return filterRowsByGlobal(rows, filters, range, {
    live,
    skipTime: skipTime || timeMode === "none",
  });
}

function topN(rows, n, sortFn) {
  const list = [...(rows || [])];
  if (sortFn) list.sort(sortFn);
  return list.slice(0, n);
}

/**
 * @param {{
 *   filters: object,
 *   range: ReturnType<import('./engFilters.js').resolveFilterRange>,
 * }} opts
 */
export async function downloadEngReportPdf(opts = {}) {
  const { filters, range } = opts;
  if (!filters || !range) {
    throw new Error("filters and range required");
  }
  if (!isEngFirebaseConfigured() || !getEngDb()) {
    throw new Error("Engineering Firebase not configured");
  }

  const [
    devices,
    pageLoads,
    pages,
    firestore,
    fsByComp,
    fsLoads,
    listeners,
    memory,
    reactRows,
    network,
    errors,
    alerts,
    departments,
    departmentsDaily,
    builds,
    components,
    audit,
    healthDocs,
  ] = await Promise.all([
    fetchFiltered(ENG_COLLECTIONS.deviceStatus, {
      timeMode: "none",
      skipTime: true,
      live: true,
      limitN: 200,
      filters,
      range,
    }),
    fetchFiltered(ENG_COLLECTIONS.pageLoads, {
      timeMode: "ts",
      limitN: 400,
      filters,
      range,
    }),
    fetchFiltered(ENG_COLLECTIONS.pages, {
      timeMode: "day",
      limitN: 400,
      filters,
      range,
    }),
    fetchFiltered(ENG_COLLECTIONS.firestoreMetrics, {
      timeMode: "day",
      limitN: 400,
      filters,
      range,
    }),
    fetchFiltered(ENG_COLLECTIONS.firestoreByComponent, {
      timeMode: "day",
      limitN: 800,
      filters,
      range,
    }),
    fetchFiltered(ENG_COLLECTIONS.fsComponentLoads, {
      timeMode: "ts",
      limitN: 400,
      filters,
      range,
    }),
    fetchFiltered(ENG_COLLECTIONS.listenerDaily, {
      timeMode: "day",
      limitN: 400,
      filters,
      range,
    }),
    fetchFiltered(ENG_COLLECTIONS.memory, {
      timeMode: "day",
      limitN: 400,
      filters,
      range,
    }),
    fetchFiltered(ENG_COLLECTIONS.reactDaily, {
      timeMode: "day",
      limitN: 400,
      filters,
      range,
    }),
    fetchFiltered(ENG_COLLECTIONS.network, {
      timeMode: "day",
      limitN: 400,
      filters,
      range,
    }),
    fetchFiltered(ENG_COLLECTIONS.errors, {
      timeMode: "ts",
      limitN: 300,
      filters,
      range,
    }),
    fetchFiltered(ENG_COLLECTIONS.alerts, {
      timeMode: "day",
      limitN: 200,
      filters,
      range,
    }),
    fetchFiltered(ENG_COLLECTIONS.departments, {
      timeMode: "none",
      skipTime: true,
      live: true,
      limitN: 100,
      filters,
      range,
    }),
    fetchFiltered(ENG_COLLECTIONS.departmentsDaily, {
      timeMode: "day",
      limitN: 800,
      filters,
      range,
    }),
    fetchFiltered(ENG_COLLECTIONS.builds, {
      timeMode: "none",
      skipTime: true,
      limitN: 100,
      filters,
      range,
    }),
    fetchFiltered(ENG_COLLECTIONS.components, {
      timeMode: "ts",
      limitN: 400,
      filters,
      range,
    }),
    fetchFiltered(ENG_COLLECTIONS.audit, {
      timeMode: "ts",
      limitN: 200,
      filters,
      range,
    }),
    fetchFiltered(ENG_COLLECTIONS.health, {
      timeMode: "day",
      limitN: 100,
      filters,
      range,
    }),
  ]);

  const now = Date.now();
  const online = devices.filter(
    (d) => devicePresence(clientTsOf(d), now) === "online"
  ).length;
  const stale = devices.filter(
    (d) => devicePresence(clientTsOf(d), now) === "stale"
  ).length;
  const loadSummary = summarizeLoads(pageLoads);
  const slow = firestore.reduce((a, r) => a + (r.slowCount || 0), 0);
  const qCount = firestore.reduce((a, r) => a + (r.queryCount || 0), 0);
  const offlineEvents = network.reduce((a, r) => a + (r.offlineEvents || 0), 0);
  const health = computeHealthScore({
    errorCount: errors.length,
    slowQueryCount: slow,
    queryCount: qCount,
    offlineEvents,
    devicesOnline: online,
    devicesTotal: devices.length || 1,
  });
  const openAlerts = alerts.filter((a) => !a.resolvedAt).length;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = 16;

  // Cover
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(30, 50, 80);
  doc.text("Mango Engineering Report", 14, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60);
  doc.text("Operations telemetry · observer only · eng_* collections", 14, y);
  y += 8;
  doc.setTextColor(0);
  y = kvTable(doc, y, [
    ["Generated", new Date().toLocaleString()],
    ["Project", getEngProjectId() || "—"],
    ["Date range", range.label],
    ["Start", `${range.startDay} (${new Date(range.startMs).toLocaleString()})`],
    ["End", `${range.endDay} (${new Date(range.endMs).toLocaleString()})`],
    ["Department", filters.department || "all"],
    ["Device", filters.deviceId || "all"],
    ["Build", filters.buildId || "all"],
    ["Search", filters.q || "—"],
    ["Preset", filters.preset || "—"],
  ]);

  // Health
  y = sectionTitle(doc, "1. Fleet Health", y);
  y = kvTable(doc, y, [
    ["Health score", `${health.score} (${health.grade})`],
    ["Devices online / stale / total", `${online} / ${stale} / ${devices.length}`],
    ["Errors (period)", errors.length],
    ["P95 page load", ms(loadSummary.p95)],
    ["Avg page load", ms(loadSummary.avg)],
    ["Page-load samples", loadSummary.count],
    ["Slow queries", `${slow} of ${qCount}`],
    ["Offline network events", offlineEvents],
    ["Open alerts (period)", openAlerts],
    ["Health docs matched", healthDocs.length],
  ]);

  // Devices
  y = sectionTitle(doc, "2. Devices", y);
  y = addTable(
    doc,
    y,
    ["Label", "Device", "Dept", "Page", "Presence", "Listeners", "Heap MB"],
    topN(devices, 40, (a, b) =>
      String(a.label || a.deviceId || "").localeCompare(
        String(b.label || b.deviceId || "")
      )
    ).map((d) => [
      d.label || "—",
      String(d.deviceId || d.id || "").slice(0, 12),
      d.department || "—",
      d.page || "—",
      devicePresence(clientTsOf(d), now),
      d.activeListeners ?? d.listenerCount ?? "—",
      d.memoryMB ?? d.heapUsedMB ?? "—",
    ])
  );

  // Departments
  y = sectionTitle(doc, "3. Departments", y);
  /** @type {Record<string, { loadCount: number, loadSumMs: number, errorCount: number }>} */
  const dailyByDept = {};
  for (const d of departmentsDaily) {
    const name = d.department || "Unknown";
    if (!dailyByDept[name]) {
      dailyByDept[name] = { loadCount: 0, loadSumMs: 0, errorCount: 0 };
    }
    dailyByDept[name].loadCount += d.loadCount || 0;
    dailyByDept[name].loadSumMs += d.loadSumMs || 0;
    dailyByDept[name].errorCount += d.errorCount || 0;
  }
  const deptNames = new Set([
    ...departments.map((d) => d.department || d.id),
    ...Object.keys(dailyByDept),
    ...pageLoads.map((r) => r.department).filter(Boolean),
  ]);
  y = addTable(
    doc,
    y,
    ["Department", "Loads", "Avg load", "P95", "Errors", "Lifetime devices"],
    [...deptNames].sort().map((name) => {
      const daily = dailyByDept[name];
      const loads = pageLoads.filter((r) => r.department === name);
      const stats = summarizeLoads(loads);
      const avgMs =
        daily?.loadCount > 0
          ? Math.round(daily.loadSumMs / daily.loadCount)
          : stats.avg;
      const active = devices.filter(
        (d) =>
          d.department === name &&
          devicePresence(clientTsOf(d), now) === "online"
      ).length;
      return [
        name,
        daily?.loadCount || stats.count || 0,
        ms(avgMs),
        ms(stats.p95 ?? null),
        daily?.errorCount ?? 0,
        active,
      ];
    })
  );

  // Firestore
  y = sectionTitle(doc, "4. Firestore (daily)", y);
  y = addTable(
    doc,
    y,
    ["Day", "Collection", "Kind", "Queries", "Slow", "Avg ms", "Max ms", "P95"],
    topN(
      firestore,
      50,
      (a, b) => (b.queryCount || 0) - (a.queryCount || 0)
    ).map((r) => [
      r.day || "—",
      r.collection || "—",
      r.kind || "—",
      r.queryCount || 0,
      r.slowCount || 0,
      ms(r.avgQueryMs),
      ms(r.durationMaxMs),
      ms(r.p95Ms ?? r.p95QueryMs),
    ])
  );

  // FS by Component
  y = sectionTitle(doc, "5. Firestore by Component", y);
  y = addTable(
    doc,
    y,
    ["Day", "Module", "Collection", "Kind", "Queries", "Reads", "Writes", "Avg"],
    topN(
      fsByComp,
      50,
      (a, b) => (b.queryCount || 0) - (a.queryCount || 0)
    ).map((r) => [
      r.day || "—",
      r.moduleId || "—",
      r.collection || "—",
      r.kind || "—",
      r.queryCount || 0,
      r.reads || 0,
      r.writes || 0,
      ms(r.avgQueryMs),
    ])
  );
  y = sectionTitle(doc, "5b. FS component loads (samples)", y);
  y = addTable(
    doc,
    y,
    ["Time", "Page", "LoadId", "Modules", "Est. reads"],
    topN(fsLoads, 30, (a, b) => (b.ts || 0) - (a.ts || 0)).map((r) => [
      fmtTs(r.ts),
      r.page || "—",
      String(r.loadId || r.id || "").slice(0, 18),
      Array.isArray(r.moduleIds) ? r.moduleIds.length : "—",
      r.estimatedDocReads ?? "—",
    ])
  );

  // Listeners
  y = sectionTitle(doc, "6. Listeners (daily)", y);
  y = addTable(
    doc,
    y,
    ["Day", "Collection", "Opens", "Snapshots", "Errors", "1st snap avg", "Timeouts"],
    topN(listeners, 40, (a, b) => (b.opens || 0) - (a.opens || 0)).map((r) => {
      const avg1 =
        (r.firstSnapshotCount || 0) > 0 && r.firstSnapshotSumMs != null
          ? r.firstSnapshotSumMs / r.firstSnapshotCount
          : r.avgSnapshotMs;
      return [
        r.day || "—",
        r.collection || "—",
        r.opens || 0,
        r.snapshots || 0,
        r.errors || 0,
        ms(avg1),
        (r.timeouts10 || 0) + (r.timeouts30 || 0),
      ];
    })
  );

  // Memory
  y = sectionTitle(doc, "7. Memory", y);
  y = addTable(
    doc,
    y,
    ["Day", "Device", "Samples", "Heap used", "Growth MB/h", "Listeners"],
    topN(memory, 40, (a, b) => String(b.day || "").localeCompare(String(a.day || ""))).map(
      (r) => [
        r.day || "—",
        String(r.deviceId || "").slice(0, 10),
        r.sampleCount || "—",
        r.usedJSHeapSize != null
          ? `${Math.round(r.usedJSHeapSize / (1024 * 1024))} MB`
          : "—",
        r.heapGrowthMBPerHour != null
          ? Number(r.heapGrowthMBPerHour).toFixed(2)
          : "—",
        r.listenerCount ?? "—",
      ]
    )
  );

  // React
  y = sectionTitle(doc, "8. React", y);
  y = addTable(
    doc,
    y,
    ["Day", "Device", "Long tasks", "Renders", "Avg long task", "P95"],
    topN(reactRows, 40, (a, b) => (b.longTasks || 0) - (a.longTasks || 0)).map(
      (r) => [
        r.day || "—",
        String(r.deviceId || "").slice(0, 10),
        r.longTasks || 0,
        r.renderSamples || 0,
        ms(r.avgLongTaskMs),
        ms(r.p95Ms),
      ]
    )
  );

  // Performance / Timeline
  y = sectionTitle(doc, "9. Performance · Page loads", y);
  y = kvTable(doc, y, [
    ["Samples", loadSummary.count],
    ["Average", ms(loadSummary.avg)],
    ["Fastest", ms(loadSummary.fastest)],
    ["Slowest", ms(loadSummary.slowest)],
    ["P95", ms(loadSummary.p95)],
    ["eng_pages daily rows", pages.length],
  ]);
  y = addTable(
    doc,
    y,
    ["Time", "Page", "Dept", "Total", "1st snap", "Hung", "Device"],
    topN(pageLoads, 40, (a, b) => (b.ts || 0) - (a.ts || 0)).map((r) => [
      fmtTs(r.ts),
      r.page || "—",
      r.department || "—",
      ms(r.totalMs),
      ms(r.firstSnapshotMs),
      r.hung ? "yes" : "",
      r.label || String(r.deviceId || "").slice(0, 8),
    ])
  );

  // Components
  y = sectionTitle(doc, "10. Components", y);
  y = addTable(
    doc,
    y,
    ["Time", "Page", "LoadId", "Components", "Total", "Hung"],
    topN(components, 30, (a, b) => (b.ts || 0) - (a.ts || 0)).map((r) => [
      fmtTs(r.ts),
      r.page || "—",
      String(r.loadId || r.id || "").slice(0, 16),
      Array.isArray(r.components) ? r.components.length : "—",
      ms(r.totalMs),
      r.hung ? "yes" : "",
    ])
  );

  // Network
  y = sectionTitle(doc, "11. Network", y);
  y = addTable(
    doc,
    y,
    ["Day", "Device", "Online", "Offline", "Reconnects", "Avg RTT", "P95"],
    topN(network, 40, (a, b) => (b.offlineEvents || 0) - (a.offlineEvents || 0)).map(
      (r) => [
        r.day || "—",
        String(r.deviceId || r.id || "").slice(0, 10),
        r.onlineEvents || 0,
        r.offlineEvents || 0,
        r.reconnects || 0,
        ms(r.latencyAvgMs),
        ms(r.latencyP95Ms ?? r.p95Ms),
      ]
    )
  );

  // Errors
  y = sectionTitle(doc, "12. Errors", y);
  y = addTable(
    doc,
    y,
    ["Time", "Source", "Message", "Count", "Dept", "Device"],
    topN(errors, 40, (a, b) => (b.ts || 0) - (a.ts || 0)).map((r) => [
      fmtTs(r.ts),
      r.source || "—",
      String(r.message || "").slice(0, 60),
      r.count || 1,
      r.department || "—",
      r.label || String(r.deviceId || "").slice(0, 8),
    ])
  );

  // Alerts
  y = sectionTitle(doc, "12b. Alerts", y);
  y = addTable(
    doc,
    y,
    ["Day", "Severity", "Title", "Device", "Resolved"],
    topN(alerts, 30, (a, b) => String(b.day || "").localeCompare(String(a.day || ""))).map(
      (r) => [
        r.day || "—",
        r.severity || "—",
        r.title || "—",
        String(r.deviceId || "").slice(0, 10),
        r.resolvedAt ? "yes" : "open",
      ]
    )
  );

  // Builds
  y = sectionTitle(doc, "13. Builds", y);
  y = addTable(
    doc,
    y,
    ["Build", "Seen", "Platform", "Browser", "First day"],
    topN(builds, 40, (a, b) => (b.seenCount || 0) - (a.seenCount || 0)).map(
      (r) => [
        r.buildId || r.id || "—",
        r.seenCount || "—",
        r.platform || "—",
        r.browser || "—",
        r.firstSeenDay || "—",
      ]
    )
  );

  // Audit
  y = sectionTitle(doc, "14. Audit", y);
  y = addTable(
    doc,
    y,
    ["Time", "Action", "Actor", "Detail"],
    topN(audit, 30, (a, b) => (b.ts || 0) - (a.ts || 0)).map((r) => [
      fmtTs(r.ts),
      r.action || "—",
      r.actor || "—",
      String(r.detail || r.message || "").slice(0, 50),
    ])
  );

  // Footer on last page
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(140);
    doc.text(
      `Mango Engineering · ${range.label} · page ${i}/${pageCount} · ${dayKeyFromTs()}`,
      14,
      doc.internal.pageSize.getHeight() - 8
    );
  }

  const safeRange = String(range.startDay || "start").replace(/[^\d-]/g, "");
  const safeEnd = String(range.endDay || "end").replace(/[^\d-]/g, "");
  doc.save(`eng-report-${safeRange}_to_${safeEnd}.pdf`);
}
