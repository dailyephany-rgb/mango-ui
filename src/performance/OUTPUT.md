# Performance & Diagnostics Platform — OUTPUT

Engineering Command Center at `performance.html`. Passive instrumentation only (no clinical write-path changes).

## Entry & disable

| Item | Value |
|------|--------|
| URL | `/performance.html` (Vite MPA; **not** linked from lab UI) |
| Monitor ON default | yes |
| Disable | `localStorage.setItem("mango.perf.monitor","0")` then reload |
| Re-enable | `localStorage.removeItem("mango.perf.monitor")` or set `"1"` |
| Detailed telemetry | `sessionStorage` key `mango.perf.v1` |
| 30-day health + rollups | `localStorage` keys `mango.perf.health.v1`, `mango.perf.daily.v1`, `mango.perf.readsCounted.v1` |

## Files created (`src/performance/`)

| File | Role |
|------|------|
| `performanceStore.js` | Ring buffers; throttle persist; monitor gate; read counters |
| `performanceCollector.js` | Record API; page load finalize; **Slow Page Recorder** (≥30s → `slow_page` event + replay chain) |
| `firestoreMetrics.js` | Path → page/dept; collection → bucket |
| `networkMetrics.js` | Duration avg / median / p95 / max; date filters |
| `cacheMetrics.js` | Hit/miss/TTL summaries |
| `renderMetrics.js` | Long-task observer; heap estimate |
| `healthScorer.js` | Daily scores, alerts, query leaderboard, dept rankings |
| `pageLoadBands.js` | Green / yellow / orange / red thresholds |
| `bootstrap.js` | Auto-start from `firebaseConfig`; paint/render/snapshot/interactive |
| `PerformanceContext.jsx` | Dashboard store poll + date merge |
| `PerformanceDashboard.jsx` | Full Command Center UI |
| `Performance.css` | Dashboard styles |
| `exportPerformancePdf.js` | EOD PDF export |
| `rollupMerge.js` | Merge session + archived samples |
| `perfDailyFirestore.js` | Optional cross-device archive (`perf_daily`) — see note below |

Also: `src/shared/firestore/trackedFirestore.js`, `src/main_performance.jsx`, root `performance.html`.

## Files modified (instrumentation / wiring)

| File | Change |
|------|--------|
| `vite.config.js` | `performance` input |
| `src/firebaseConfig.js` | Dynamic import of `performance/bootstrap.js` |
| `sessionQueryCache.js` | Passive hit/miss/expire/set (+ `static:` → layer `static`) |
| `staticConfigCache.js` | Uses session cache (metrics via `static:` keys) |
| `createOwnerSessionPaint.js` | Owner paint vs refresh latency |
| Shared hooks (`useMasterDeptSnapshots`, `useScopedMasterEntries`, …) | Import swap → tracked wrappers |
| Owner `dataFetcher_*.js`, `workflowfetcher.js` | tracked `onSnapshot` |
| `subscribeInventoryByMachines.js` | tracked |
| MasterAdmin, Validator, LabAnalytics, ICC, CriticalAlert (listen) | tracked |

**Untouched by design:** inventory deduction write path, save/scan validators, Owner KPI math, clinical `report_details` merge logic.

## Metrics & collection method

| Metric | How collected |
|--------|----------------|
| Page load (paint, render, snapshot, interactive, total) | Navigation Timing + rAF + first tracked snapshot meta |
| Load colour bands | `<2s` green · `2–30s` yellow · `30–60s` orange · `≥60s` red |
| Slow Page Recorder | `finalizePageLoad` when `totalMs ≥ 30_000`; timeline `kind: slow_page` + replay steps |
| Firestore reads / queries | `trackedOnSnapshot` / `trackedGetDocs` / `trackedGetDoc` |
| Query leaderboard | Aggregated from query ring (slowest / most called / largest / highest cost) |
| Cache hit/miss | `sessionQueryCache` emit → `recordCacheEvent` |
| Owner paint vs refresh | `createOwnerSessionPaint` |
| Active listeners | Wrapper register + unsubscribe close |
| Network latency | Query `durationMs` stats |
| Long tasks | `PerformanceObserver` (`longtask`) |
| Memory | `performance.memory` (Chromium), sessionStorage / store byte estimates, `navigator.storage.estimate` |
| Cost estimator | Measured reads × rate; **writes labelled not instrumented** |
| Daily health (30d) | `healthScorer` → localStorage |
| Engineering KPIs | Derived from filtered view |

## Dashboard sections

KPIs · Page Loads (+ Slow Page Recorder) · Reads · Query Board · Incremental · Cache · Listeners · Network · Render · Memory · Cost · Timeline & Replay · Dept Ranks · Health · Alerts.

## Overhead controls

- Rings: ~100 page loads, ~300 queries, ~200 events, ~80 listeners (+ reads/cache/longTasks caps)
- Persist throttle ≥2s; no snapshot payload cloning (counts/timings only)
- Monitor off → collector no-ops (Eng telemetry path may still run if eng flag on)

**Overhead target:** &lt;1% (no per-component React wraps on lab UI; fire-and-forget dynamic imports for cache emit).

## Production impact

- Clinical save/scan/deduction paths not rewritten for perf.
- Dashboard is isolated MPA entry.
- **Note:** `perfDailyFirestore.js` can write/read `perf_daily` for multi-day archive across devices. Core session metrics and 30-day health work without it (localStorage). Plan baseline was zero Firestore writes for metrics; archive flush is additive and gated by leaving the page / schedule. Disable monitor to stop collection; archive flush only sends what was already collected.

## Manual checklist

1. `npm run build` includes `performance.html` / `assets` for performance entry.
2. Open a register page (e.g. biochem) with monitor ON → use app briefly.
3. Open `/performance.html` (same browser profile) → Page Loads, Reads, Listeners populate.
4. Toggle Monitor OFF → reload a register → no new metrics.
5. Clear metrics from dashboard → rings empty.
6. Export JSON / PDF smoke.
7. Confirm a register **Save** still succeeds (business path unchanged).
8. Grep: clinical write APIs not introduced under `src/performance/` collector path (archive helper is separate).

## UI description

Dark engineering console: date range, monitor toggle, PDF/JSON export, KPI strip, tabbed panels with CSS bar lists/tables (no new chart library on this entry). Timeline click expands replay chain (Opened → Cache → Query → Docs → Snapshot → Interactive → Loaded) for slow loads.
