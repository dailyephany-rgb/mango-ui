# Mango LIMS — Engineering Telemetry Platform  
## Engineering Design Specification (EDS)

**Document type:** Engineering Design Specification (SoT for ops platform)  
**Status:** Implemented under `src/engineering/**` — design remains authoritative for behaviour/isolation  
**Audience:** Engineers maintaining the Engineering Operations Platform  
**Prerequisite reading:** `src/doc/architecture/` (Parts 1–5 + Appendix A)  
**Clinical SoT:** Firebase project `vasundhara-4c6e5` (unchanged)  
**Date:** 2026-08-07  

---

### Non-negotiable principle

> The Engineering system is an **observer**.  
> If it is disabled, offline, crashing, or deleted, **every clinical workflow continues exactly as today**.

Forbidden:

- Reading or writing clinical collections from Engineering Dashboard business logic in a way that clinical pages depend on  
- Awaiting Engineering network I/O on the clinical critical path  
- Throwing from telemetry into React trees without boundaries  
- Changing save/scan/validate/deduction/query shapes  

Allowed:

- Wrapping existing observation points (`trackedFirestore`, bootstraps, hooks) with **optional**, **try/catch-isolated** callbacks  
- Writing **only** to Engineering storage  
- Reading Engineering storage from the Engineering Dashboard MPA only  

---

## Relationship to existing `src/performance/**`

Mango already has a **passive performance layer**:

| Existing piece | Role today |
|----------------|------------|
| `trackedOnSnapshot` / `trackedGetDoc(s)` | Optional metrics when `mango.perf.monitor ≠ "0"` |
| `performanceStore` | sessionStorage ring buffers + localStorage rollups |
| `perf_daily` | Daily rollups **inside the clinical Firebase project** |
| `performance.html` | Local diagnostics UI |

This EDS **does not redesign** that clinical observation spine. It defines the **next platform**:

1. Keep clinical wrappers behaviour-identical and kill-switchable.  
2. Promote telemetry to a **dedicated Engineering backend**.  
3. Add a dedicated Engineering Dashboard that consumes Engineering data only.  
4. Treat current `performance/**` as **Phase-0 / local buffer**; Engineering Platform is the durable, multi-device ops plane.

---

# SECTION 1 — Overall Engineering Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  CLINICAL LAYER (unchanged responsibilities)                │
│  Registration · Benches · Validator · Inventory · Owner     │
│  shared/hooks · shared/firestore · Owner fetchers · ICC     │
│  Writes: master_register, dept registers, report_details…   │
└────────────────────────────┬────────────────────────────────┘
                             │ observe only (no await, no throw)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  TELEMETRY LAYER (optional, failure-isolated)               │
│  EngTelemetry SDK · buffers · sample · redact · flush       │
│  Kill switch: localStorage / build flag                     │
└────────────────────────────┬────────────────────────────────┘
                             │ async writes (best-effort)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  ENGINEERING FIRESTORE (isolated project or named DB)       │
│  devices · heartbeats · metrics · errors · health · audit   │
└────────────────────────────┬────────────────────────────────┘
                             │ read-only for ops
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  ENGINEERING DASHBOARD (separate MPA HTML entry)            │
│  Health · Devices · Firestore · Listeners · Memory · …      │
└─────────────────────────────────────────────────────────────┘
```

### Responsibilities

| Layer | Owns | Must not own |
|-------|------|--------------|
| **Clinical** | Patient/accession/inventory truth | Telemetry availability |
| **Telemetry** | Capture, buffer, sample, flush | Clinical decisions, UI blocking |
| **Engineering Firestore** | Ops metrics SoT | Clinical documents |
| **Engineering Dashboard** | Visualization, alerts, settings | Clinical writes |

### Isolation contracts

1. **Import direction:** Clinical may import Telemetry SDK. Telemetry must not import clinical page modules. Dashboard imports Telemetry types + Engineering `db` only.  
2. **Async only:** Flush uses `queueMicrotask` / `setTimeout` / `requestIdleCallback` / `sendBeacon` / background `fetch` — never `await` inside `onSnapshot` user callbacks or save handlers.  
3. **Fail-open:** Any Telemetry exception is swallowed after optional `console.debug`.  
4. **Kill switch:** If disabled, Telemetry SDK is a no-op; clinical code paths identical to Firebase SDK.

---

# SECTION 2 — Telemetry Layer

## 2.1 Design goals

| Goal | Mechanism |
|------|-----------|
| No business logic | SDK records events; no KPI/SLA/inventory math |
| No patient writes | Engineering Firebase credentials + rules deny clinical collections |
| Asynchronous | Ring buffer → batched flush |
| Failure isolated | `safeRun(() => …)` around every hook |
| Optional | Default-on for lab ops builds; hard-off via `mango.eng.telemetry=0` |

## 2.2 SDK surface (conceptual API — not implementation)

```
EngTelemetry.init({ deviceId, buildId, page, department })
EngTelemetry.setContext({ user, page, department })
EngTelemetry.trackPageLoad(timings)
EngTelemetry.trackQuery({ collection, kind, durationMs, docCount, … })
EngTelemetry.trackListenerUpsert / Close / Snapshot
EngTelemetry.trackRender / LongTask / MemorySample
EngTelemetry.trackError({ source, message, stack, … })
EngTelemetry.trackNetwork({ latencyMs, online, … })
EngTelemetry.heartbeat()   // scheduled
EngTelemetry.flush()       // scheduled + pagehide
EngTelemetry.shutdown()
```

All methods: void, sync return, never throw to caller.

## 2.3 Collection domains

| Domain | Examples |
|--------|----------|
| Page loads | navigation, paint, first snapshot, interactive |
| Firestore | query timing, doc counts, reads/writes counters |
| Memory | heap used/limit, growth rate, cache sizes |
| React | render counts (sampled), long tasks, slow commits |
| Network | online/offline, RTT probe to Engineering endpoint only |
| Errors | window.onerror, unhandledrejection, wrapped SDK errors |
| Listeners | create/destroy/reconnect/doc counts |
| Device status | heartbeat payload |
| Version | build hash, app version, userAgent |

## 2.4 Buffering & sampling

| Rule | Spec |
|------|------|
| Hot buffer | In-memory ring (e.g. 500 events) |
| Spill | sessionStorage (existing `mango.perf.v1` may be reused as local spill in Phase 1) |
| Sample rates | Errors/heartbeats 100%; renders 1–5%; memory 1/30s; network probe 1/60s |
| Drop policy | Drop oldest non-error events when full |
| PII | Never send patient names, regNo, diagnosticNo, test results, selectedTests |

## 2.5 Redaction

Allowed identifiers:

- `deviceId` (generated UUID in localStorage)  
- `page` / `department` (from existing `resolvePageIdentity`)  
- `loggedUser` username string only (already in sessionStorage for clinical)  
- Collection **names**, not document IDs of patient data  

Forbidden in payloads:

- Document data contents  
- Query result fields  
- Excel imports / routing maps content  

---

# SECTION 3 — Engineering Firestore

## 3.1 Recommendation

### **Recommended: Separate Firebase project** (e.g. `mango-engineering`)

| Option | Verdict | Why |
|--------|---------|-----|
| **A. Separate Firebase project** | **Recommended** | Hard quota/rules isolation; clinical outage/rules mistakes cannot be caused by eng traffic; independent billing; clearest “clinical continues if eng gone” story |
| B. Same project, second Firestore database | Acceptable fallback | Strong isolation of data; still shares GCP org/billing; needs multi-db SDK wiring |
| C. Same DB, `engineering_*` collections | **Not recommended for production ops plane** | Shared quota with clinical (already ~300k+ reads/day risk); rules complexity; blast radius |

**Also:** Stop writing new durable telemetry into clinical `perf_daily` once Engineering project is live. Keep `perf_daily` only as transitional local rollup or migrate/copy then freeze.

## 3.2 Database layout (collection design)

Namespace prefix in separate project can be root collections (no need for `engineering/` parent). Below uses root names for clarity.

---

### `devices`

| | |
|--|--|
| **Purpose** | Registry of workstations that ever reported |
| **Doc ID** | `deviceId` (UUID persisted in localStorage `mango.eng.deviceId`) |
| **Fields** | `deviceId`, `label` (optional human name), `firstSeenAt`, `lastSeenAt`, `userAgent`, `platform`, `createdAt`, `updatedAt` |
| **Update frequency** | On first init + rare metadata changes |
| **Retention** | 365 days after lastSeen; soft-delete flag |
| **R/W** | Write: devices on heartbeat; Read: dashboard |
| **Daily size** | ~5–50 docs total (not daily growth) |

### `heartbeats`

| | |
|--|--|
| **Purpose** | Latest + recent liveness samples |
| **Doc ID** | Strategy A: `devices/{id}/heartbeat` singleton for **latest**; Strategy B: `heartbeats/{deviceId}_{yyyyMMddHHmm}` for history |
| **Recommended** | **Latest:** `device_status/{deviceId}` (see below). **History:** `heartbeats/{deviceId}_{isoMinute}` |
| **Fields** | `deviceId`, `page`, `department`, `online`, `version`, `buildId`, `user`, `listenerCount`, `heapUsedMB`, `lastPageLoadMs`, `lastSnapshotMs`, `networkRttMs`, `ts` |
| **Update frequency** | Every 30s while tab visible; every 120s if hidden; immediate on page change |
| **Retention** | History 14 days; latest forever while device active |
| **R/W** | High write (devices × 2–120/hour); dashboard listens latest |
| **Daily size** | 5 devices × 2/min × 12h ≈ **7.2k docs/day** if minute-grain; prefer **overwrite latest + hourly rollup** to cut cost |

**Cost-aware heartbeat design:**  

1. `device_status/{deviceId}` — **single doc overwrite** every 30s (primary).  
2. `heartbeat_hourly/{deviceId}_{yyyyMMddHH}` — merge counters once per hour.  
3. Optional raw samples only when `debugSampling=true`.

### `device_status` (derived / primary live view)

| | |
|--|--|
| **Purpose** | Dashboard “Devices” live board |
| **Doc ID** | `deviceId` |
| **Fields** | Same as heartbeat + `status: online\|stale\|offline`, `staleAfterMs` |
| **Update frequency** | 30s |
| **Retention** | Indefinite while in fleet |
| **Daily size** | N devices (constant) |

### `departments`

| | |
|--|--|
| **Purpose** | Aggregated health by clinical department label |
| **Doc ID** | Canonical dept key (`Haematology`, `Bio-Chemistry`, `Owner-Biochem`, `ICC`, …) |
| **Fields** | `department`, `activeDevices`, `avgLoadMs`, `p95LoadMs`, `openListeners`, `errorCount1h`, `updatedAt` |
| **Update frequency** | Server-side rollup **or** client merge on flush every 5 min |
| **Retention** | 90 days snapshots in `department_daily` |
| **Daily size** | ~20–40 dept keys |

### `listeners`

| | |
|--|--|
| **Purpose** | Per-listener lifecycle telemetry |
| **Doc ID** | `{deviceId}_{listenerId}` for active; history in subcollection or daily aggregate |
| **Fields** | `listenerId`, `collection`, `page`, `department`, `createdAt`, `destroyedAt`, `state`, `reconnects`, `lastSnapshotAt`, `docsLoaded`, `avgSnapshotMs`, `deviceId` |
| **Update frequency** | Create/destroy events; snapshot stats sampled (every Nth snapshot or 10s) |
| **Retention** | Active: while open; closed records 7 days; prefer aggregates |
| **Daily size** | Prefer **not** one doc per snapshot — use `listener_daily/{deviceId}_{date}` counters |

### `firestore_metrics` (collection-level)

| | |
|--|--|
| **Purpose** | Per clinical collection observed read/write/listen stats (names only) |
| **Doc ID** | `{date}_{collection}` or `{deviceId}_{date}_{collection}` then roll up |
| **Fields** | `collection`, `reads`, `writes`, `listenersOpen`, `snapshotCount`, `retries`, `failures`, `reconnects`, `avgQueryMs`, `p95QueryMs`, `maxQueryMs` |
| **Update frequency** | Client increments locally; flush every 60s / pagehide |
| **Retention** | 90 days daily docs |
| **Daily size** | ~25 collections × devices (or 25 after rollup) |

### `pages`

| | |
|--|--|
| **Purpose** | Page-load performance by MPA page |
| **Doc ID** | `{date}_{page}_{deviceId}` session samples **or** `{date}_{page}` aggregate |
| **Fields** | timings (see §6), `count`, `avg`, `p95`, `max`, `min` |
| **Update frequency** | On finalize page load + daily merge |
| **Retention** | Raw samples 7 days; daily agg 180 days |
| **Daily size** | 5 devices × ~20 page opens ≈ 100 samples → roll up |

### `network`

| | |
|--|--|
| **Purpose** | Connectivity quality |
| **Doc ID** | `{deviceId}_latest` + `network_daily/{deviceId}_{date}` |
| **Fields** | `online`, `offlineEvents`, `rttMs`, `reconnects`, `lastOfflineAt`, `probeOk` |
| **Update frequency** | On online/offline + probe 60s |
| **Retention** | Daily 90 days |

### `memory`

| | |
|--|--|
| **Purpose** | Heap and storage pressure |
| **Doc ID** | `memory_latest/{deviceId}` + `memory_daily/{deviceId}_{date}` |
| **Fields** | `heapUsed`, `heapLimit`, `heapGrowthMBPerHour`, `sessionStorageKB`, `localStorageKB`, `sqcCacheEntries`, `listenerCount` |
| **Update frequency** | 30–60s sample |
| **Retention** | Daily 90 days |

### `react_metrics`

| | |
|--|--|
| **Purpose** | Render/long-task aggregates (sampled) |
| **Doc ID** | `react_daily/{deviceId}_{date}` |
| **Fields** | `longTaskCount`, `longTaskTotalMs`, `slowCommitCount`, `estimatedRenders` (if instrumented) |
| **Update frequency** | Flush 5 min |
| **Retention** | 90 days |

### `errors`

| | |
|--|--|
| **Purpose** | Error events |
| **Doc ID** | Auto-id or `{deviceId}_{hash}_{yyyyMMddHH}` for dedupe |
| **Fields** | `ts`, `deviceId`, `page`, `department`, `user`, `source` (react\|firestore\|network\|unhandled\|inventory\|owner\|validator), `name`, `message`, `stackHash`, `count` |
| **Update frequency** | Immediate enqueue; flush ≤5s |
| **Retention** | 60 days |
| **Daily size** | Low if healthy (tens–hundreds) |

### `audit`

| | |
|--|--|
| **Purpose** | Engineering config changes, kill-switch flips, dashboard logins (if any) |
| **Doc ID** | Auto-id |
| **Fields** | `ts`, `actor`, `action`, `detail` |
| **Update frequency** | On ops actions |
| **Retention** | 365 days |

### `health`

| | |
|--|--|
| **Purpose** | Fleet health score snapshots |
| **Doc ID** | `fleet_latest` + `health_daily/{date}` |
| **Fields** | scores (load, firestore, listeners, errors, network), `alertCount`, `offlineDevices` |
| **Update frequency** | Dashboard compute every 60s **or** Cloud Function; clients may write device health only |
| **Retention** | Daily 365 days |

### `settings`

| | |
|--|--|
| **Purpose** | Fleet telemetry settings |
| **Doc ID** | `global` |
| **Fields** | `telemetryEnabled`, `sampleRates`, `heartbeatSec`, `retentionDays`, `alertThresholds` |
| **Update frequency** | Rare |
| **Retention** | Forever |

### `builds`

| | |
|--|--|
| **Purpose** | Deployed frontend builds observed in the wild |
| **Doc ID** | `buildId` (Vite hash / package version + git SHA if injected at build) |
| **Fields** | `buildId`, `firstSeen`, `lastSeen`, `deviceCount` |
| **Update frequency** | On init |
| **Retention** | 180 days |

### Optional: `alerts`

| | |
|--|--|
| **Purpose** | Open engineering alerts |
| **Doc ID** | Auto or stable hash of alert key |
| **Fields** | `severity`, `title`, `deviceId`, `department`, `openedAt`, `resolvedAt`, `ruleId` |

---

# SECTION 4 — Telemetry Injection Points

**Rule:** Attach only at observation wrappers and bootstraps. Do **not** edit save/scan/validate/deduction bodies.

| Location | Why ideal | What to observe | Clinical risk if broken |
|----------|-----------|-----------------|-------------------------|
| `trackedOnSnapshot` | Already sole listener wrapper for most pages | Listener lifecycle, first/subsequent snapshot timing, doc counts, errors | **Must** remain passthrough when eng off; already has monitor gate |
| `trackedGetDocs` / `trackedGetDoc` | Covers deduction, adjustments, validator getDoc | One-shot read timing + doc counts | Same — passthrough |
| `useMasterDeptSnapshots` | Central triad for benches | Mark “dept triad armed”, dept keys, date range (not row data), cleanup | Only add `EngTelemetry.safe` after unsub registration — never alter query |
| `useScopedMasterEntries` | Master-only pages | Same | Same |
| `subscribeInventoryByMachines` | Inventory listen fan-out | Machine names count, open/close | Same |
| Owner `subscribeOverview` / `workflowfetcher` | Analytics listen cost | Paint vs live, publish duration (ms only) | Do not change publish math |
| `createOwnerSessionPaint` | Cache hit/miss already | Cache events | Optional |
| `main_*.jsx` / `firebaseConfig` bootstrap | Page identity earliest | `init`, page load start | Dynamic import of eng SDK like performance bootstrap |
| Page roots (first client render) | React mount timing | `firstRender` | rAF only |
| `window` `error` / `unhandledrejection` | Global errors | Error metrics | Register only if eng enabled |
| React Error Boundary (new, around roots) | Catch React render failures | React errors | Boundary must render children unchanged on success |
| `pagehide` / `visibilitychange` | Flush | Flush + heartbeat | Existing pattern in performance bootstrap |
| **StrictMode** | Dev double-mount | Annotate `reactStrictDev=true` in context | Do not disable StrictMode |

### Explicitly out of scope for injection

- `handleSave` / `handleValidate` / `handleInventoryDeduction` internals  
- `testToReagentMap`  
- Owner KPI compute functions  
- MasterAdmin `setDoc` paths  

---

# SECTION 5 — Device Heartbeat

## 5.1 Identity

| Field | Source |
|-------|--------|
| `deviceId` | `localStorage.mango.eng.deviceId` (create UUID once) |
| `user` | `sessionStorage.loggedUser` or `"anonymous"` |
| `page` / `department` | Existing `resolvePageIdentity()` |
| `version` / `buildId` | `import.meta.env` injected at build |

## 5.2 Payload (latest `device_status`)

```
deviceId, page, department, online, lastHeartbeatAt,
version, buildId, user,
memory.heapUsedMB, memory.heapLimitMB,
listeners.openCount,
perf.lastPageLoadMs, perf.lastFirstSnapshotMs,
network.rttMs, network.online,
load.level: idle|normal|elevated|critical  // derived locally
```

## 5.3 Frequency

| Condition | Interval |
|-----------|----------|
| Tab visible | 30 seconds |
| Tab hidden | 120 seconds |
| Page identity change | Immediate |
| Going offline | Immediate attempt + queue |

## 5.4 Timeout / offline rules (Dashboard)

| State | Rule |
|-------|------|
| **Online** | `now - lastHeartbeatAt ≤ 90s` |
| **Stale** | 90s–300s |
| **Offline** | >300s OR client reported `online:false` |

## 5.5 Clinical independence

Heartbeat writes go **only** to Engineering project. Failure to write does not affect clinical UI.

---

# SECTION 6 — Performance Metrics (definitions)

| Metric | Definition | Calculation |
|--------|------------|-------------|
| **NavigationStart** | Time origin for page | `performance.timing.navigationStart` or `performance.timeOrigin` |
| **FirstPaintMs** | First paint | PerformanceObserver `paint` entry `first-paint` / `first-contentful-paint` |
| **ReactMountMs** | First React commit approximation | Double `requestAnimationFrame` after bootstrap (existing pattern) |
| **FirstSnapshotMs** | Time to first tracked snapshot | `performance.now()` at first `trackedOnSnapshot` callback with `first===true` (existing `onFirstSnapshot`) |
| **FirestoreReadyMs** | Alias / max(ReactMount, first connection) | Optional: time when `db` module evaluated |
| **InteractiveMs** | Usable UI | `max(domComplete, FirstSnapshotMs)` (existing) |
| **TotalLoadMs** | Page ready | `max(InteractiveMs, loadEventEnd, now at finalize)` |
| **QueryDurationMs** | Single getDocs/getDoc/snapshot_first | `t1 - t0` around call |
| **DocsReturned** | Snapshot/get size | `snap.docs.length` or exists 0/1 |
| **RowsRendered** | Table row count after merge | Optional hook in UI: `EngTelemetry.trackRows(n)` — **additive only**, not required for Phase 1 |
| **Reads** | Billed-doc estimate | Sum of doc counts from tracked APIs (existing `recordRead`) |
| **Writes** | Clinical write count | **Do not instrument inside writes in Phase 1**; optional later via wrap of `writeBatch.commit` in eng-only builds — **default off** |
| **ListenerCount** | Open listeners | Len of active listener registry |
| **ReconnectCount** | Listener re-seed after error/online | Increment on snapshot after offline or error recovery |
| **RetryCount** | Failed op then success | Increment on tracked error then success same op id |
| **SlowQuery** | QueryDurationMs ≥ threshold | Default threshold 2000ms (configurable in `settings`) |
| **SlowRender** | Long task ≥ 50ms or commit ≥ 16ms | Long Task API / React profiler sampling |
| **Avg / P95 / Max / Min** | On daily aggregates | Sort samples; P95 = ceil(0.95*(n-1)) index |

---

# SECTION 7 — Memory Metrics

| Metric | How |
|--------|-----|
| Heap used / limit | `performance.memory` when available (Chromium) |
| Heap growth | Δ heap / elapsed hours between samples |
| GC | Not directly available in all browsers — record long-task gaps as weak proxy; label as **estimated** |
| Cache size | Count keys/bytes of `sessionQueryCache` / static config / eng buffer |
| sessionStorage / localStorage | Sum JSON lengths of known `mango.*` prefixes only |
| Active / mounted components | Optional React DevTools-like counter **only if** a thin `EngProfiler` bridge is added later; Phase 1: omit or approximate via page type |
| Listener growth | Δ open listeners over time |

---

# SECTION 8 — React Metrics

| Metric | How |
|--------|-----|
| Render count | Sampled: increment on instrumented wrappers only (ErrorBoundary, optional `useEngRenderProbe` not placed in clinical tables by default) |
| Render time | Long Task API + optional Profiler on Engineering Dashboard itself |
| Slow components | Names from Profiler `onRender` if enabled on **non-clinical** pages first |
| Context updates | Count `OwnerContext` consumer updates **only via** a wrapping provider clone for eng — **do not** modify OwnerContext in Phase 1; Phase 2 may wrap at `main_owner*.jsx` |
| Hidden components | Detect `display:none` keep-alive by page-known flags (e.g. Biochem activeTab) reported as context tags — observational metadata only |

---

# SECTION 9 — Listener Metrics

Every listener (via `trackedOnSnapshot`):

| Field | Source |
|-------|--------|
| Collection | `extractCollectionName` |
| Created / Destroyed | upsert / closeListener |
| State | Active / Closed / Error |
| Reconnects | Count re-entrancy after online |
| Snapshot age | `now - lastSnapshotAt` |
| Documents loaded | last snap size |
| Avg snapshot time | rolling average of callback durations |

Emit:

- Event on create/close  
- Sampled snapshot stats (e.g. 1/10 or every 10s)  
- Aggregate into `firestore_metrics` + `device_status.listenerCount`

---

# SECTION 10 — Firestore Metrics (per collection name)

From tracked wrappers only (clinical collection **names**):

| Metric | Calculation |
|--------|-------------|
| Reads | Σ docCount |
| Writes | Optional Phase 3+; default 0 |
| Avg / P95 query | From query duration samples |
| Current listeners | Count active with that collection |
| Snapshot count | Number of snapshot callbacks observed |
| Retries / Failures / Reconnects | From error + recovery events |

Dashboard shows **observed client metrics**, not Firebase Console billing (document the gap).

---

# SECTION 11 — Network Metrics

| Metric | How |
|--------|-----|
| Connection | `navigator.onLine` + `online`/`offline` events |
| Latency | RTT probe to Engineering Firebase/`https://…/health` **only** — never probe clinical in a way that adds clinical load beyond existing |
| Reconnects | Count transitions offline→online |
| Offline events | Count |
| Retry attempts | Eng flush retries |
| Snapshot delay | Time between expected heartbeat and late snapshot (listener) |

---

# SECTION 12 — Error Metrics

| Source | Capture point |
|--------|---------------|
| React | Error Boundary at MPA root |
| Firestore | `onError` of tracked listeners + getDoc catch in wrappers |
| Network | offline + failed eng flush |
| Unhandled | `window.onerror`, `unhandledrejection` |
| Inventory / Owner / Validator | Classify by `page`/`department` from page identity — **do not** parse patient errors from business alerts |

Store: message, name, stack **hash**, count, lastSeen — not full PHI-bearing strings if message might include reg numbers (truncate/redact digits).

---

# SECTION 13 — Engineering Dashboard

**Separate MPA:** e.g. `engineering.html` → `main_engineering.jsx` → `EngineeringApp`  
**Data source:** Engineering Firebase only  
**Auth:** Separate ops gate (recommended) — not clinical `users.js` passwords long-term; Phase 1 may reuse session + allowlist

### Pages & widgets

| Page | Widgets |
|------|---------|
| **Health** | Fleet score gauge; offline device count; error rate 1h; p95 load; open alerts |
| **Devices** | Table of `device_status`; filters online/stale/offline; sparkline load; jump to device detail |
| **Departments** | Cards per dept: avg load, listeners, errors |
| **Firestore** | Per-collection reads/listeners/p95; top slow queries |
| **Listeners** | Active listeners by device/page; churn (create/destroy/hour) |
| **Memory** | Heap charts; storage footprint; growth alerts |
| **React** | Long tasks; slow commit counts |
| **Performance** | Page load distribution; waterfall of mean timings |
| **Network** | Online %; RTT; offline events |
| **Errors** | Stream + group by stackHash; severity |
| **Audit** | Settings changes log |
| **Builds** | BuildId adoption |
| **Settings** | Sample rates, thresholds, retention, global kill (writes `settings/global`) |

Device detail drawer: last heartbeat, open listeners list, recent errors, last page loads.

---

# SECTION 14 — Performance Calculations

### Total Load Time (primary)

```
T0  = NavigationStart / timeOrigin
T1  = FirstPaintMs          (optional)
T2  = ReactMountMs          (rAF×2)
T3  = FirstSnapshotMs       (first trackedOnSnapshot)
T4  = MergeCompleteMs       (optional: hook end of first publish/setState flush — Phase 2)
T5  = TableRenderMs         (optional rows probe — Phase 2)
T6  = InteractiveMs         = max(domComplete, T3[, T4])
T7  = TotalLoadMs           = max(T6, loadEventEnd, finalizeNow)
```

### Page Ready (ops definition)

`PageReady = TotalLoadMs` when finalize runs (existing 0.8s after window load or 15s timeout).

### Department score (example)

```
score = 100
  - 20 if p95LoadMs > 30000
  - 20 if errorCount1h > 10
  - 20 if any device offline in dept
  - 10 if listenerChurn1h > threshold
clamp 0..100
```

Exact weights live in `settings/global.alertThresholds` (tunable without clinical deploy).

---

# SECTION 15 — Storage Strategy

| Tier | Contents | Where |
|------|----------|-------|
| **L0 Realtime** | `device_status`, open alerts | Engineering Firestore overwrite |
| **L1 Local buffer** | Ring + session spill | Browser only |
| **L2 Hourly/Daily** | Aggregates | `*_daily`, `heartbeat_hourly` |
| **L3 Archive** | Optional export to GCS / BigQuery later | Out of Phase 1–4 |

**Cleanup:** Scheduled function or Dashboard admin job deletes daily docs older than retention.  

**Compression:** Prefer aggregates over raw event docs; never store snapshot payloads.  

**Rollups:** Client local merge → flush counters; Dashboard may recompute fleet health from `device_status` + `*_daily`.

---

# SECTION 16 — Cost Estimate (Engineering project only)

Assumptions:

- Heartbeat = **1 overwrite / 30s / visible device** (not new docs)  
- Metric flush = **~10 writes / device / minute** average (batched counters)  
- Errors negligible  
- Dashboard: 1 ops user listening to `device_status` (N reads on snapshot) + periodic daily fetches  

### Writes/day (order of magnitude)

| Devices | Heartbeat overwrites/day (12h) | Metric flushes/day | **Total writes/day** |
|--------:|-------------------------------:|-------------------:|---------------------:|
| 5 | 5 × 1,440 = 7.2k | ~5 × 7.2k ≈ 36k | **~45k** |
| 10 | 14.4k | ~72k | **~90k** |
| 20 | 28.8k | ~144k | **~175k** |
| 50 | 72k | ~360k | **~430k** |

With aggressive batching (1 flush/min): metric writes drop ~10× → **5 devices ~10–15k writes/day**.

### Reads/day

| Devices | Devices board listener | Dashboard users | **Rough reads/day** |
|--------:|-----------------------:|----------------:|--------------------:|
| 5 | ~5 initial + updates ≈ heartbeat rate | 1 user | **~10–40k** |
| 50 | higher | 2 users | **~100–200k** |

### Storage / bandwidth

- Latest docs: kilobytes  
- 90-day daily aggregates: low tens of MB  
- Bandwidth: small JSON flushes; negligible vs clinical  

**Critical:** These costs hit the **Engineering** project — **not** clinical `vasundhara-4c6e5`.

---

# SECTION 17 — Failure Modes

| Failure | Engineering behaviour | Clinical behaviour |
|---------|----------------------|--------------------|
| Engineering Firestore offline | Buffer locally; drop on overflow; retry; mark device degraded in local UI only | **Unaffected** |
| Engineering slow | Timeouts on flush (e.g. 3s); abandon batch | **Unaffected** |
| Device offline | Queue heartbeats; status offline when back | Clinical may also be offline — independent |
| Telemetry crash | `safeRun` swallow; auto-disable after N faults | **Unaffected** |
| Dashboard crash | Ops blind; devices still try to write | **Unaffected** |
| Memory leak in telemetry | Kill switch; buffer caps | Clinical continues; recommend disable eng |
| Listener failure (clinical) | Record error event if wrappers catch | Existing clinical error paths unchanged |
| Kill switch off | SDK no-op | Identical to pre-eng |

---

# SECTION 18 — Implementation Roadmap

## Phase 1 — Foundation (design → stubs)

| | |
|--|--|
| **Goal** | Eng SDK no-op shell + kill switch + deviceId + separate Firebase config module |
| **Files (new)** | `src/engineering/telemetry/*`, `src/engineering/firebaseEngConfig.js`, `engineering.html`, `main_engineering.jsx` skeleton |
| **Touch clinical?** | Only optional dynamic import beside performance bootstrap — **must no-op if disabled** |
| **LOC** | ~400–700 |
| **Risk** | Low |
| **Regression** | Low if import is dynamic + try/catch |
| **Rollback** | Remove import; delete eng entry |
| **Test** | Clinical pages load with `mango.eng.telemetry=0`; no network to eng project |

## Phase 2 — Telemetry at wrappers

| | |
|--|--|
| **Goal** | Emit from `trackedFirestore` + bootstrap page load + errors + heartbeat local buffer |
| **Files** | Extend wrappers carefully; `bootstrap` parallel path; Error Boundary |
| **Shared** | Reuse `resolvePageIdentity`, collector concepts |
| **LOC** | ~800–1500 |
| **Risk** | Medium (wrapper path) |
| **Regression** | Medium — mitigate with kill switch default tests |
| **Rollback** | Force kill switch; revert wrapper to passthrough-only |
| **Test** | Diff clinical network: only clinical Firebase when eng off; snapshot counts unchanged |

## Phase 3 — Engineering Firestore

| | |
|--|--|
| **Goal** | Create eng project, rules, collections, flush pipeline, retention job |
| **Files** | Flush worker; security rules; indexes for eng DB |
| **LOC** | ~600–1000 |
| **Risk** | Low to clinical; ops cost risk |
| **Rollback** | Point flush to null sink |
| **Test** | Rules deny clinical collection names; load test flush |

## Phase 4 — Dashboard

| | |
|--|--|
| **Goal** | Full OPS UI pages (§13) |
| **Files** | `src/engineering/dashboard/**` |
| **LOC** | ~2000–4000 |
| **Risk** | Low clinical |
| **Rollback** | Unpublish `engineering.html` |
| **Test** | Dashboard works with mocked eng data; no import of clinical `db` writes |

## Phase 5 — Validation

| | |
|--|--|
| **Goal** | Prove isolation + usefulness |
| **Tests** | (1) Disable eng mid-shift — bench save/scan/validate OK (2) Block eng host — clinical OK (3) Compare listener counts vs architecture audit (4) Cost check eng project (5) Redaction review |
| **Risk** | Low |
| **Exit criteria** | Signed isolation checklist by clinical owner + eng lead |

---

## Acceptance criteria for “ZERO clinical workflow change”

1. With telemetry **disabled**, JS bundles behave as today for clinical MPAs (wrappers passthrough).  
2. No new awaits on clinical paths.  
3. No new writes to `vasundhara-4c6e5` clinical collections from eng SDK.  
4. Clinical features work if eng project is deleted.  
5. Patient fields never appear in eng documents.  

---

## Open decisions for review (before coding)

1. Confirm **separate Firebase project** vs named database.  
2. Heartbeat cost profile: overwrite-only vs minute history.  
3. Whether Phase 1 dynamic-imports from `firebaseConfig` (like performance) or only from `main_*.jsx`.  
4. Ops authentication model for Engineering Dashboard.  
5. Fate of clinical `perf_daily` after eng cutover (freeze vs dual-write briefly).  

---

## Document control

| Item | Value |
|------|-------|
| Author role | Lead Software Architect (design) |
| Status | Design source of truth for the Engineering Operations Platform |
| Implementation | Shipped under `src/engineering/**` (observe-only; separate eng Firebase) |
| Depends on | Architecture docs Parts 1–5 + Appendix A |
| Ops config | `src/engineering/eng.env.example`, `firestore.rules.engineering*` |

**End of Engineering Design Specification**
