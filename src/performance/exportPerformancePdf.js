/**
 * End-of-day Performance PDF — full multi-page report of all dashboard tabs.
 * Downloads via jsPDF.save() to the browser Downloads folder.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  getState,
  getHealthHistory,
  getDailyRollups,
  getDailyRollupsInRange,
  estimateSessionStorageBytes,
  estimatePerfStoreBytes,
  estimateCachePayloadBytes,
} from "./performanceStore.js";
import {
  computeHealthScores,
  computeAlerts,
  buildQueryLeaderboard,
  buildDepartmentRankings,
} from "./healthScorer.js";
import { summarizeCache } from "./cacheMetrics.js";
import {
  summarizeDurations,
  todayKey,
  filterByDateRange,
} from "./networkMetrics.js";
import { getHeapEstimate } from "./renderMetrics.js";

function ms(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
}

function bytes(n) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function loadBand(totalMs) {
  if (totalMs == null) return "—";
  if (totalMs < 2000) return "Green";
  if (totalMs < 10000) return "Yellow";
  if (totalMs < 30000) return "Orange";
  return "Red";
}

function groupSum(items, key, valueKey) {
  const map = new Map();
  for (const item of items || []) {
    const k = item[key] || "unknown";
    map.set(k, (map.get(k) || 0) + (item[valueKey] || 0));
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function mergeUniqueByAt(a, b) {
  const map = new Map();
  for (const item of [...(a || []), ...(b || [])]) {
    const key = `${item.at || 0}:${item.page || ""}:${item.collection || ""}:${item.kind || item.type || ""}:${item.durationMs || ""}:${item.docCount || ""}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()].sort((x, y) => (x.at || 0) - (y.at || 0));
}

function buildRangeView(state, dateFrom, dateTo) {
  const sessionLoads = filterByDateRange(state.pageLoads || [], dateFrom, dateTo);
  const sessionQueries = filterByDateRange(state.queries || [], dateFrom, dateTo);
  const sessionReads = filterByDateRange(state.reads || [], dateFrom, dateTo);
  const sessionCache = filterByDateRange(state.cacheEvents || [], dateFrom, dateTo);
  const sessionEvents = filterByDateRange(state.events || [], dateFrom, dateTo);
  const sessionLong = filterByDateRange(state.longTasks || [], dateFrom, dateTo);
  const incrementalSync = filterByDateRange(
    state.incrementalSync || [],
    dateFrom,
    dateTo
  );

  const rollups = getDailyRollupsInRange(dateFrom, dateTo);
  return {
    pageLoads: mergeUniqueByAt(
      sessionLoads,
      rollups.flatMap((r) => r.pageLoads || [])
    ),
    queries: mergeUniqueByAt(
      sessionQueries,
      rollups.flatMap((r) => r.queries || [])
    ),
    reads: mergeUniqueByAt(
      sessionReads,
      rollups.flatMap((r) => r.reads || [])
    ),
    cacheEvents: sessionCache,
    events: mergeUniqueByAt(
      sessionEvents,
      rollups.flatMap((r) => r.events || [])
    ),
    longTasks: mergeUniqueByAt(
      sessionLong,
      rollups.flatMap((r) => r.longTasks || [])
    ),
    incrementalSync,
    listeners: state.listeners || [],
  };
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
  y = ensureSpace(doc, y, 16);
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
    doc.text(opts.empty || "No data in range.", 14, y);
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

/**
 * @param {{ dateFrom?: string, dateTo?: string }} [opts]
 */
export async function downloadPerformancePdf(opts = {}) {
  const dateFrom = opts.dateFrom || todayKey();
  const dateTo = opts.dateTo || dateFrom;
  const state = getState();
  const view = buildRangeView(state, dateFrom, dateTo);
  const rangeState = { ...state, ...view };

  const health = computeHealthScores(rangeState, dateFrom, dateTo);
  const alerts = computeAlerts(rangeState, dateFrom, dateTo);
  const cache = summarizeCache(view.cacheEvents || []);
  const qStats = summarizeDurations(view.queries || []);
  const rankings = buildDepartmentRankings(rangeState, dateFrom, dateTo);
  const healthHistory = getHealthHistory().filter(
    (h) => h.date >= dateFrom && h.date <= dateTo
  );

  const readsInRange = (view.reads || []).reduce(
    (a, r) => a + (r.docCount || 0),
    0
  );
  const readsSession = (state.reads || []).reduce(
    (a, r) => a + (r.docCount || 0),
    0
  );
  const slowPages = (view.pageLoads || []).filter(
    (l) => (l.totalMs || 0) > 30000
  ).length;
  const avgLoad = view.pageLoads.length
    ? view.pageLoads.reduce((a, b) => a + (b.totalMs || 0), 0) /
      view.pageLoads.length
    : null;

  const heap = getHeapEstimate();
  const ssBytes = estimateSessionStorageBytes();
  const perfBytes = estimatePerfStoreBytes();
  const cachePayload = estimateCachePayloadBytes();

  let storageEst = null;
  try {
    if (navigator.storage?.estimate) {
      storageEst = await navigator.storage.estimate();
    }
  } catch {
    /* ignore */
  }

  const monthlyReadsEst = readsInRange * 30;
  const monthlyCostEst = (monthlyReadsEst / 100000) * 0.06;

  const initials = (view.incrementalSync || []).filter((r) => r.initial);
  const incOnly = (view.incrementalSync || []).filter(
    (r) => !r.initial && (r.processed || 0) > 0
  );
  const avgProcessed = incOnly.length
    ? incOnly.reduce((a, r) => a + (r.processed || 0), 0) / incOnly.length
    : 0;
  const avgMapMs = (view.incrementalSync || []).length
    ? (view.incrementalSync || []).reduce((a, r) => a + (r.durationMs || 0), 0) /
      view.incrementalSync.length
    : 0;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 16;

  // —— Cover ——
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Mango LIMS — End-of-Day Performance Report", pageWidth / 2, y, {
    align: "center",
  });
  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Analysis range: ${dateFrom} → ${dateTo}`, pageWidth / 2, y, {
    align: "center",
  });
  y += 6;
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, y, {
    align: "center",
  });
  y += 6;
  doc.setTextColor(100);
  doc.text(
    "Engineering Command Center export — all dashboard sections. Read-only. Firestore is source of truth.",
    pageWidth / 2,
    y,
    { align: "center", maxWidth: pageWidth - 28 }
  );
  doc.setTextColor(0);
  y += 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Contents", 14, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const toc = [
    "1. Engineering KPIs",
    "2. Page Load Performance",
    "3. Firestore Read Analytics",
    "4. Query Leaderboard",
    "5. Incremental Sync (docChanges)",
    "6. Cache Effectiveness",
    "7. Active Listeners",
    "8. Network / Query Latency",
    "9. Render / Long Tasks",
    "10. Memory",
    "11. Firebase Cost Estimator",
    "12. Timeline Events",
    "13. Department Rankings",
    "14. Daily Health Score",
    "15. Live Alerts",
  ];
  for (const line of toc) {
    doc.text(line, 18, y);
    y += 4.2;
  }

  // —— 1 KPIs ——
  doc.addPage();
  y = 16;
  y = sectionTitle(doc, "1. Engineering KPIs", y);
  y = addTable(
    doc,
    y,
    ["KPI", "Value"],
    [
      ["Health overall", `${health.overall} (${health.labels?.overall || ""})`],
      ["Architecture", `${health.architecture} (${health.labels?.architecture})`],
      ["Firebase", `${health.firebase} (${health.labels?.firebase})`],
      ["Caching", `${health.caching} (${health.labels?.caching})`],
      ["Performance", `${health.performance} (${health.labels?.performance})`],
      ["Memory score", `${health.memory} (${health.labels?.memory})`],
      ["Network score", `${health.network} (${health.labels?.network})`],
      ["Reads in range (measured docs)", readsInRange.toLocaleString()],
      ["Reads full session", readsSession.toLocaleString()],
      ["Cache hit %", `${cache.hitRate.toFixed(1)}%`],
      ["Cache miss %", `${cache.missRate.toFixed(1)}%`],
      ["Slow pages (>30s)", String(slowPages)],
      ["Avg page load", ms(avgLoad)],
      ["Worst query", ms(qStats.max)],
      ["Query avg / median / p95", `${ms(qStats.avg)} / ${ms(qStats.median)} / ${ms(qStats.p95)}`],
      [
        "Active listeners (now)",
        String(
          (view.listeners || []).filter((l) => l.state === "Active").length
        ),
      ],
      ["Page load samples", String(view.pageLoads.length)],
      ["Query samples", String(view.queries.length)],
      ["Daily rollups on device", String(getDailyRollups().length)],
    ]
  );

  // —— 2 Page loads ——
  y = sectionTitle(doc, "2. Page Load Performance", y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100);
  y = ensureSpace(doc, y, 8);
  doc.text(
    "Bands: Green <2s · Yellow 2–10s · Orange 10–30s · Red >30s (Slow Page Recorder)",
    14,
    y
  );
  doc.setTextColor(0);
  y += 4;
  const loads = [...view.pageLoads].reverse();
  y = addTable(
    doc,
    y,
    [
      "Time",
      "Page",
      "Dept",
      "Paint",
      "Render",
      "Snapshot",
      "Interactive",
      "Total",
      "Band",
      "Cache",
      "Docs",
      "Queries",
    ],
    loads.map((l) => [
      new Date(l.at).toLocaleString(),
      l.page || "",
      l.department || "",
      ms(l.firstPaintMs),
      ms(l.firstRenderMs),
      ms(l.firstSnapshotMs),
      ms(l.interactiveMs),
      ms(l.totalMs),
      loadBand(l.totalMs),
      l.cacheHit ? "Hit" : "Miss",
      l.snapshotDocCount ?? "—",
      l.queryCount ?? "—",
    ]),
    { empty: "No page loads in this date range." }
  );

  // —— 3 Reads ——
  y = sectionTitle(doc, "3. Firestore Read Analytics", y);
  y = addTable(doc, y, ["Metric", "Value"], [
    ["Reads in range", readsInRange.toLocaleString()],
    ["Full session reads", readsSession.toLocaleString()],
  ]);
  y = sectionTitle(doc, "3a. Reads by bucket", y);
  y = addTable(
    doc,
    y,
    ["Bucket", "Docs"],
    groupSum(view.reads, "bucket", "docCount").map((r) => [
      r.name,
      r.value.toLocaleString(),
    ])
  );
  y = sectionTitle(doc, "3b. Top pages", y);
  y = addTable(
    doc,
    y,
    ["Page", "Docs"],
    groupSum(view.reads, "page", "docCount")
      .slice(0, 25)
      .map((r) => [r.name, r.value.toLocaleString()])
  );
  y = sectionTitle(doc, "3c. Top departments", y);
  y = addTable(
    doc,
    y,
    ["Department", "Docs"],
    groupSum(view.reads, "department", "docCount").map((r) => [
      r.name,
      r.value.toLocaleString(),
    ])
  );
  y = sectionTitle(doc, "3d. Top collections", y);
  y = addTable(
    doc,
    y,
    ["Collection", "Docs"],
    groupSum(view.reads, "collection", "docCount")
      .slice(0, 30)
      .map((r) => [r.name, r.value.toLocaleString()])
  );

  // —— 4 Query leaderboards (all sorts) ——
  doc.addPage();
  y = 16;
  y = sectionTitle(doc, "4. Query Leaderboard", y);
  for (const [sortBy, label] of [
    ["slowest", "4a. Slowest (by avg)"],
    ["mostCalled", "4b. Most called"],
    ["largest", "4c. Largest result"],
    ["highestCost", "4d. Highest read cost"],
  ]) {
    y = sectionTitle(doc, label, y);
    const rows = buildQueryLeaderboard(view.queries || [], sortBy).slice(0, 25);
    y = addTable(
      doc,
      y,
      ["Query", "Avg", "P95", "Max", "Calls", "Avg docs", "Total docs"],
      rows.map((r) => [
        (r.collection || r.query || "").slice(0, 42),
        ms(r.avgMs),
        ms(r.p95Ms),
        ms(r.maxMs),
        String(r.calls),
        r.avgDocs.toFixed(0),
        r.totalDocs.toLocaleString(),
      ])
    );
  }

  // —— 5 Incremental ——
  y = sectionTitle(doc, "5. Incremental Sync (docChanges)", y);
  y = addTable(doc, y, ["Metric", "Value"], [
    ["Initial snapshots", String(initials.length)],
    [
      "Docs seeded (initial)",
      String(initials.reduce((a, r) => a + (r.processed || 0), 0)),
    ],
    [
      "Incremental added",
      String(
        incOnly.reduce((a, r) => a + (r.added || 0), 0)
      ),
    ],
    [
      "Incremental modified",
      String((view.incrementalSync || []).reduce((a, r) => a + (r.modified || 0), 0)),
    ],
    [
      "Incremental removed",
      String((view.incrementalSync || []).reduce((a, r) => a + (r.removed || 0), 0)),
    ],
    ["Avg docs / incremental callback", avgProcessed.toFixed(2)],
    ["Avg Map update time", ms(avgMapMs)],
  ]);
  y = sectionTitle(doc, "5a. Recent incremental callbacks", y);
  y = addTable(
    doc,
    y,
    ["Time", "Label", "Kind", "+ / ~ / −", "Processed", "Map", "Duration"],
    [...(view.incrementalSync || [])]
      .reverse()
      .slice(0, 40)
      .map((r) => [
        new Date(r.at).toLocaleTimeString(),
        (r.label || "").slice(0, 28),
        r.initial ? "Initial" : "Incr",
        `${r.added}/${r.modified}/${r.removed}`,
        String(r.processed),
        String(r.mapSize),
        ms(r.durationMs),
      ])
  );

  // —— 6 Cache ——
  doc.addPage();
  y = 16;
  y = sectionTitle(doc, "6. Cache Effectiveness", y);
  y = addTable(doc, y, ["Metric", "Value"], [
    ["Session hits", String(cache.hits)],
    ["Session misses", String(cache.misses)],
    ["Hit %", `${cache.hitRate.toFixed(1)}%`],
    ["Miss %", `${cache.missRate.toFixed(1)}%`],
    ["TTL expirations", String(cache.expires)],
    ["Sets", String(cache.sets)],
    ["Avg remaining TTL on hit", ms(cache.avgLifetimeMs)],
    ["Owner paint (avg)", ms(cache.avgOwnerPaintMs)],
    ["Firestore refresh after paint (avg)", ms(cache.avgOwnerRefreshMs)],
    ["Avg response improvement", ms(cache.avgResponseImprovementMs)],
  ]);

  // —— 7 Listeners ——
  y = sectionTitle(doc, "7. Active Listener Monitor", y);
  y = addTable(
    doc,
    y,
    ["Collection", "Dept", "Page", "Started", "Duration", "State", "Flags"],
    [...(view.listeners || [])]
      .slice()
      .reverse()
      .slice(0, 50)
      .map((l) => {
        const dur =
          l.state === "Active"
            ? Date.now() - (l.startedAt || 0)
            : l.durationMs || 0;
        const flags = [];
        if (l.orphanedHint) flags.push("Orphan?");
        if (dur > 30 * 60 * 1000) flags.push("Long-running");
        return [
          l.collection || "",
          l.department || "",
          l.page || "",
          l.startedAt ? new Date(l.startedAt).toLocaleString() : "—",
          ms(dur),
          l.state || "",
          flags.join(", ") || "—",
        ];
      }),
    { empty: "No listeners recorded." }
  );

  // —— 8 Network ——
  y = sectionTitle(doc, "8. Network / Query Latency", y);
  y = addTable(doc, y, ["Metric", "Value"], [
    ["Samples in range", String(qStats.count)],
    ["Average", ms(qStats.avg)],
    ["Median", ms(qStats.median)],
    ["P95", ms(qStats.p95)],
    ["Max", ms(qStats.max)],
    ["Min", ms(qStats.min)],
    [
      "Warn: avg >2s",
      qStats.avg > 2000 && qStats.count ? "YES" : "No",
    ],
    ["Warn: max >10s", qStats.max > 10000 ? "YES" : "No"],
  ]);

  // —— 9 Render ——
  y = sectionTitle(doc, "9. Render / Long Tasks", y);
  y = addTable(
    doc,
    y,
    ["Time", "Duration", "Name"],
    [...(view.longTasks || [])]
      .reverse()
      .slice(0, 40)
      .map((t) => [
        new Date(t.at).toLocaleTimeString(),
        ms(t.durationMs),
        t.name || "longtask",
      ]),
    { empty: "No long tasks recorded in range." }
  );

  // —— 10 Memory ——
  doc.addPage();
  y = 16;
  y = sectionTitle(doc, "10. Memory", y);
  y = addTable(doc, y, ["Metric", "Value"], [
    ["JS Heap used", bytes(heap?.usedJSHeapSize)],
    ["JS Heap total", bytes(heap?.totalJSHeapSize)],
    ["JS Heap limit", bytes(heap?.jsHeapSizeLimit)],
    ["SessionStorage usage", bytes(ssBytes)],
    ["Perf store size", bytes(perfBytes)],
    ["Session cache payloads", bytes(cachePayload.total)],
    [
      "Largest cache payload",
      cachePayload.largest
        ? `${cachePayload.largest.key} (${bytes(cachePayload.largest.size)})`
        : "—",
    ],
    [
      "Storage estimate (incl. IndexedDB)",
      storageEst
        ? `${bytes(storageEst.usage)} / ${bytes(storageEst.quota)}`
        : "—",
    ],
    [
      "Peak heap from page loads",
      bytes(
        Math.max(
          0,
          ...(view.pageLoads || []).map((l) => l.heapUsed || 0),
          heap?.usedJSHeapSize || 0
        ) || null
      ),
    ],
  ]);

  // —— 11 Cost ——
  y = sectionTitle(doc, "11. Firebase Cost Estimator (estimates)", y);
  y = addTable(doc, y, ["Metric", "Value"], [
    ["Reads in range (measured)", readsInRange.toLocaleString()],
    ["Est. monthly reads (×30)", Math.round(monthlyReadsEst).toLocaleString()],
    ["Est. monthly read cost (USD)", `~$${monthlyCostEst.toFixed(4)}`],
    ["Writes", "Not instrumented"],
    ["Note", "Not a billing invoice — measured client doc counts only"],
  ]);
  y = sectionTitle(doc, "11a. Reads by bucket (cost breakdown)", y);
  y = addTable(
    doc,
    y,
    ["Bucket", "Docs"],
    groupSum(view.reads, "bucket", "docCount").map((r) => [
      r.name,
      r.value.toLocaleString(),
    ])
  );

  // —— 12 Timeline ——
  y = sectionTitle(doc, "12. Timeline Events", y);
  y = addTable(
    doc,
    y,
    ["Time", "Kind", "Page", "Dept", "Message"],
    [...(view.events || [])]
      .reverse()
      .slice(0, 60)
      .map((e) => [
        new Date(e.at).toLocaleString(),
        e.kind || "",
        e.page || "",
        e.department || "",
        String(e.message || "").slice(0, 80),
      ]),
    { empty: "No timeline events in range." }
  );

  // Slow page replay details
  const slowEvents = (view.events || []).filter((e) => e.kind === "slow_page");
  if (slowEvents.length) {
    y = sectionTitle(doc, "12a. Slow page recorder detail", y);
    for (const e of slowEvents.slice(-10)) {
      y = ensureSpace(doc, y, 28);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(
        `${new Date(e.at).toLocaleString()} — ${e.page} (${ms(e.totalMs || e.durationMs)})`,
        14,
        y
      );
      y += 4;
      const replay = e.replay || [];
      y = addTable(
        doc,
        y,
        ["Offset", "Step", "Detail"],
        replay.map((s) => [ms(s.atOffsetMs), s.step || "", s.detail || ""])
      );
    }
  }

  // —— 13 Rankings ——
  doc.addPage();
  y = 16;
  y = sectionTitle(doc, "13. Department Rankings", y);
  y = addTable(
    doc,
    y,
    [
      "Dept",
      "Avg load",
      "Reads",
      "Cache hit %",
      "Avg query",
      "Largest snap",
      "Listeners",
    ],
    [...rankings]
      .sort((a, b) => b.avgLoadMs - a.avgLoadMs)
      .map((r) => [
        r.department,
        ms(r.avgLoadMs),
        r.reads.toLocaleString(),
        `${r.cacheHitPct.toFixed(0)}%`,
        ms(r.avgQueryMs),
        String(r.largestSnapshot),
        String(r.listenerCount),
      ]),
    { empty: "No department ranking data." }
  );

  // —— 14 Health ——
  y = sectionTitle(doc, "14. Daily Health Score", y);
  y = addTable(doc, y, ["Dimension", "Score", "Label"], [
    ["Overall", String(health.overall), health.labels?.overall || ""],
    ["Architecture", String(health.architecture), health.labels?.architecture || ""],
    ["Firebase", String(health.firebase), health.labels?.firebase || ""],
    ["Caching", String(health.caching), health.labels?.caching || ""],
    ["Performance", String(health.performance), health.labels?.performance || ""],
    ["Memory", String(health.memory), health.labels?.memory || ""],
    ["Network", String(health.network), health.labels?.network || ""],
  ]);
  y = sectionTitle(doc, "14a. Health history in range (localStorage)", y);
  y = addTable(
    doc,
    y,
    ["Date", "Overall", "Firebase", "Caching", "Performance", "Memory", "Network"],
    [...healthHistory].reverse().map((h) => [
      h.date,
      String(h.scores?.overall ?? ""),
      String(h.scores?.firebase ?? ""),
      String(h.scores?.caching ?? ""),
      String(h.scores?.performance ?? ""),
      String(h.scores?.memory ?? ""),
      String(h.scores?.network ?? ""),
    ]),
    { empty: "No health history for this range yet." }
  );

  // —— 15 Alerts ——
  y = sectionTitle(doc, "15. Live Alerts", y);
  y = addTable(
    doc,
    y,
    ["Level", "Alert"],
    alerts.map((a) => [a.level || "", a.text || ""]),
    { empty: "No alerts — system looked healthy in this range." }
  );

  // Footer on last page
  y = ensureSpace(doc, y, 20);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
    "End of report. Use with Firestore Console billing for true cost. Client measurements ≠ invoice.",
    14,
    y,
    { maxWidth: pageWidth - 28 }
  );

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(140);
    doc.text(
      `Mango Perf EOD  |  ${dateFrom}→${dateTo}  |  Page ${i} / ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" }
    );
  }

  doc.save(`mango-perf-eod-${dateFrom}_to_${dateTo}.pdf`);
}
