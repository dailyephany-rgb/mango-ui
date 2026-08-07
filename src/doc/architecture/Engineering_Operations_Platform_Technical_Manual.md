# Mango LIMS — Engineering Operations Platform  
## Technical Manual (Implementation Review)

**Document type:** Definitive technical manual — documents what was **actually implemented**  
**Audience:** Senior engineers reviewing production readiness  
**Spec under review:** `Engineering_Telemetry_Platform_EDS.md`  
**Companion:** `src/engineering/IMPLEMENTATION_REPORT.md`  
**Clinical SoT (unchanged):** Firebase project `vasundhara-4c6e5`  
**Date:** 2026-08-07  
**Code status:** Implemented; Engineering Firebase credentials **not** provisioned in-repo  

> **Principle:** The Engineering system is an **observer**. If it is disabled, offline, crashing, or deleted, every clinical workflow continues exactly as before.

> **Honesty rule:** Where implementation differs from the EDS, this manual states the difference explicitly. Do not assume EDS ≡ code.

---

# SECTION 1 — Executive Summary

## What the Engineering Platform is

The Engineering Operations Platform is a **passive, failure-isolated telemetry and operations plane** for Mango LIMS. It observes browser workstations running clinical MPAs, records operational metrics (page load, Firestore query timing, listener lifecycle, memory, network, errors, device presence), stores them in a **separate Engineering Firebase project**, and visualizes them in a dedicated Engineering Dashboard (`engineering.html`).

It is **not** a clinical feature. It does not store patients, accessions, results, inventory balances, or Owner KPIs.

## Why it exists

Mango already had a Phase-0 local diagnostics layer (`src/performance/**`, `performance.html`, clinical `perf_daily`). That layer is useful for a single browser session but:

- Lives partly in the **clinical** Firebase project (`perf_daily`)
- Does not provide a durable multi-device ops view
- Is not designed as a fleet health / device board for lab engineering

The Engineering Platform promotes observation into a **dedicated ops backend** so lab engineering can answer:

- Which workstations are online / stale / offline?
- Which pages and clinical **collection names** are slow?
- Where are listener churn, heap pressure, long tasks, and JS errors concentrating?
- What build IDs are running in the wild?

## Problems it solves

| Problem | How the platform addresses it |
|---------|-------------------------------|
| Blind fleet | `device_status` heartbeats every 30s (visible) / 120s (hidden) |
| Cost / latency forensics across devices | Aggregated `firestore_metrics`, `listener_daily`, `pages` |
| Ops visibility without clinical risk | Separate Firebase app name `mango-engineering`; dashboard never imports clinical `db` |
| Need to kill telemetry mid-shift | `localStorage.mango.eng.telemetry = "0"` |
| Local-only diagnostics | Ring buffer + session spill even when Eng Firebase is unconfigured |

## How it integrates with Mango

Integration is **minimal and observational**:

1. `src/firebaseConfig.js` dynamically imports `./engineering/telemetry/bootstrap.js` (same pattern as performance bootstrap). Failure is caught; clinical Firebase init is unaffected.
2. `src/shared/firestore/trackedFirestore.js` optionally emits EngTelemetry events when eng telemetry is enabled (in addition to, or instead of, the clinical perf layer depending on kill switches).
3. `resolvePageIdentity()` gained an `engineering` page mapping.
4. Vite adds MPA entry `engineering.html` → `src/main_engineering.jsx`.

No save, validate, inventory deduction, Owner KPI, or clinical query shape was redesigned for telemetry.

## How it differs from the clinical application

| Dimension | Clinical application | Engineering Platform |
|-----------|---------------------|----------------------|
| Firebase project | `vasundhara-4c6e5` | Separate eng project (when configured) |
| Truth domain | Patients, registers, inventory | Devices, metrics, errors, settings |
| Failure impact | Lab workflow stops | Ops blind; clinical continues |
| Dashboard | Dept / Owner / ICC UIs | `engineering.html` only |
| Writes from clinical pages | Clinical collections | Eng collections only (best-effort) |
| Required for care | Yes | No |

---

# SECTION 2 — Overall Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  CLINICAL LAYER (unchanged responsibilities)                │
│  Registration · Benches · Validator · Inventory · Owner     │
│  shared/hooks · shared/firestore · Owner fetchers · ICC     │
│  Writes: master_register, dept registers, report_details…   │
│  Firebase: vasundhara-4c6e5                                 │
└────────────────────────────┬────────────────────────────────┘
                             │ observe only (no await, no throw)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  TELEMETRY LAYER (optional, failure-isolated)               │
│  EngTelemetry SDK · ring buffer · sample · flush            │
│  Kill switch: localStorage mango.eng.telemetry              │
│  Bootstrap via firebaseConfig dynamic import                │
└────────────────────────────┬────────────────────────────────┘
                             │ async writes (best-effort)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  ENGINEERING FIRESTORE (separate named Firebase app)        │
│  devices · device_status · heartbeat_hourly · metrics …     │
│  App name: "mango-engineering"                              │
└────────────────────────────┬────────────────────────────────┘
                             │ read-only for ops UI
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  ENGINEERING DASHBOARD (MPA: engineering.html)              │
│  Health · Devices · Firestore · Listeners · Memory · …      │
│  Does NOT import clinical db                                │
└─────────────────────────────────────────────────────────────┘
```

### Layer responsibilities

| Layer | Owns | Must not own |
|-------|------|--------------|
| **Clinical** | Patient/accession/inventory truth; all care workflows | Telemetry availability |
| **Telemetry SDK** | Capture, buffer, sample, flush, heartbeat scheduling | Clinical decisions; UI blocking; patient payloads |
| **Engineering Firestore** | Ops metrics source of truth (when configured) | Clinical documents |
| **Engineering Dashboard** | Visualization, local kill switch UI, settings/audit writes to eng only | Clinical writes; clinical collection reads |

### Isolation contracts (as implemented)

1. **Import direction:** Clinical may import Telemetry. Telemetry must not import clinical page modules (it may import shared observation helpers such as `resolvePageIdentity` and optionally `performanceStore` for listener counts). Dashboard uses Eng Firebase + telemetry helpers only.
2. **Async only:** Flush uses `requestIdleCallback` / `setTimeout`; heartbeat uses fire-and-forget `setDoc(...).catch(() => {})`. Track methods do not await network.
3. **Fail-open:** `safeRun` / `safeCall` swallow exceptions; optional `console.debug`.
4. **Kill switch:** `mango.eng.telemetry === "0"` disables SDK init paths and flush; with clinical perf also off, `tracked*` is pure Firebase passthrough.

### Relationship to `src/performance/**`

| Existing piece | Role after Engineering Platform |
|----------------|----------------------------------|
| `trackedOnSnapshot` / `trackedGetDoc(s)` | Shared observation spine; now dual-gated (perf and/or eng) |
| `performanceStore` / `performance.html` | Phase-0 local diagnostics — **still active** |
| Clinical `perf_daily` | **Still written** by performance layer — **not frozen** yet (EDS recommended freeze after eng cutover) |

---

# SECTION 3 — Complete Folder Structure

```
src/engineering/
├── constants.js                 # Keys, intervals, collection name map
├── firebaseEngConfig.js         # Separate Firebase app init
├── engFirebase.options.js       # Optional in-repo eng credentials (null by default)
├── eng.env.example              # VITE_ENG_* template
├── firestore.rules.engineering  # Rules template for eng project
├── index.js                     # Public barrel exports
├── IMPLEMENTATION_REPORT.md     # Ship / regression notes
├── health/
│   └── scores.js                # devicePresence + computeHealthScore
├── telemetry/
│   ├── killSwitch.js
│   ├── safeRun.js
│   ├── deviceId.js
│   ├── buffer.js
│   ├── EngTelemetry.js          # SDK façade
│   ├── flush.js                 # Buffer → eng Firestore aggregates
│   ├── heartbeat.js             # device_status / devices / hourly
│   └── bootstrap.js             # Auto-start when imported
└── dashboard/
    ├── EngineeringApp.jsx       # Shell + nav
    ├── Engineering.css
    ├── EngErrorBoundary.jsx
    ├── useEngData.js            # Dashboard data hooks
    └── pages.jsx                # All §13 page components

# MPA entry (outside src/engineering)
engineering.html
src/main_engineering.jsx
```

### Why each folder exists

| Path | Why |
|------|-----|
| `src/engineering/` | Hard isolation boundary: all eng-owned code lives here |
| `telemetry/` | Capture/buffer/flush/heartbeat — runnable on clinical pages without dashboard UI |
| `dashboard/` | Ops UI only; never needed by clinical MPAs |
| `health/` | Pure score helpers shared by dashboard (no Firebase) |
| Root eng files | Config, constants, rules, env examples — shared by telemetry + dashboard |

---

# SECTION 4 — Every File Documentation

## 4.1 `constants.js`

| | |
|--|--|
| **Purpose** | Single source of eng keys, intervals, thresholds, collection name strings |
| **Imports** | None |
| **Exports** | `ENG_TELEMETRY_KEY`, `ENG_DEVICE_ID_KEY`, `ENG_DEVICE_LABEL_KEY`, `ENG_BUFFER_KEY`, `ENG_BUILD_ID`, heartbeat/flush/memory/network intervals, `BUFFER_CAPACITY`, `SLOW_QUERY_MS`, `DEVICE_ONLINE_MS`, `DEVICE_STALE_MS`, `ENG_COLLECTIONS` |
| **Who calls it** | Nearly all eng modules |
| **Lifecycle** | Module-load constants only |

## 4.2 `firebaseEngConfig.js`

| | |
|--|--|
| **Purpose** | Lazy-init **named** Firebase app `"mango-engineering"` and return Engineering Firestore |
| **Imports** | `firebase/app`, `firebase/firestore`, `engFirebase.options.js` |
| **Exports** | `isEngFirebaseConfigured`, `getEngDb`, `getEngProjectId` |
| **Config order** | (1) `VITE_ENG_PROJECT_ID` + `VITE_ENG_API_KEY` (2) `engFirebaseOptions` object |
| **Who calls it** | `flush.js`, `heartbeat.js`, `useEngData.js`, Health page (project id display) |
| **Lifecycle** | First `getEngDb()` attempt sets `initAttempted`; failures return `null` forever for that page load |
| **Diff vs EDS** | Does not implement multi-database-in-same-project fallback; options A only (separate project via second app) |

## 4.3 `engFirebase.options.js`

| | |
|--|--|
| **Purpose** | Optional non-env config slot; default `null` |
| **Exports** | `engFirebaseOptions` |
| **Note** | Must never hold clinical credentials |

## 4.4 `eng.env.example`

Documentation-only template for `.env.local` (`VITE_ENG_*`, `VITE_ENG_PROBE_URL`).

## 4.5 `firestore.rules.engineering`

| | |
|--|--|
| **Purpose** | Deployable rules template for eng project |
| **Behavior** | Deny-all default; allow listed eng collection names; deny known clinical collection names |
| **Diff vs EDS** | Phase-1 open read/write on eng collections (no Auth allowlist yet) — **must tighten before production** |

## 4.6 `index.js`

Barrel re-exports SDK, kill switch, device id, bootstrap, flush, eng db helpers.

## 4.7 `telemetry/killSwitch.js`

| | |
|--|--|
| **Purpose** | Read/write `localStorage.mango.eng.telemetry` |
| **Enabled when** | Value is **not** exactly `"0"` (missing → enabled) |
| **Exports** | `isEngTelemetryEnabled`, `setEngTelemetryEnabled` |

## 4.8 `telemetry/safeRun.js`

| | |
|--|--|
| **Purpose** | Never throw into clinical callers |
| **Exports** | `safeRun(fn, label)`, `safeCall(fn, fallback)` |

## 4.9 `telemetry/deviceId.js`

| | |
|--|--|
| **Purpose** | Stable workstation UUID in `mango.eng.deviceId`; optional label |
| **Exports** | `getDeviceId`, `getDeviceLabel`, `setDeviceLabel` |

## 4.10 `telemetry/buffer.js`

| | |
|--|--|
| **Purpose** | In-memory ring (500) + sessionStorage spill `mango.eng.buffer.v1` |
| **Drop policy** | Prefer drop oldest **non-error** when full |
| **Exports** | `pushEvent`, `drainEvents`, `peekEvents`, `bufferSize`, `spillToSession`, `loadSpill`, `clearSpill` |

## 4.11 `telemetry/EngTelemetry.js`

| | |
|--|--|
| **Purpose** | Public SDK façade matching EDS §2.2 |
| **Exports** | `EngTelemetry` object (default + named) |
| **Calls** | buffer, flush, heartbeat, killSwitch, deviceId, constants |
| **Called by** | bootstrap, trackedFirestore, EngErrorBoundary, Settings page |
| **Lifecycle** | `init` once → arms flush/memory/network timers + heartbeat; `shutdown` tears down |

## 4.12 `telemetry/flush.js`

| | |
|--|--|
| **Purpose** | Drain buffer (+ spill) → aggregated eng Firestore writes |
| **Exports** | `scheduleFlush`, `flushNow`, `dayKey`, `hourKey` |
| **If eng DB missing** | Re-queues drained events into ring; clinical unaffected |
| **Diff vs EDS** | No `sendBeacon`; no automatic flush ≤5s specifically for errors (errors ride 60s flush / pagehide / manual flush); no writes to `health` collection |

## 4.13 `telemetry/heartbeat.js`

| | |
|--|--|
| **Purpose** | Overwrite `device_status/{deviceId}`; merge `devices/{deviceId}`; increment `heartbeat_hourly` |
| **Intervals** | 30s visible / 120s hidden; re-arm on visibility change |
| **Diff vs EDS** | Does not write `status: online|stale|offline` field (dashboard **computes** presence from `clientTs`); omits some EDS payload fields (`user`, `lastPageLoadMs`, `networkRttMs`, `load.level`) |

## 4.14 `telemetry/bootstrap.js`

| | |
|--|--|
| **Purpose** | Auto-start eng telemetry when module imported |
| **Does** | `EngTelemetry.init`, window error hooks, long-task observer (non-eng/non-perf pages), page-load capture, pagehide flush, listener-count sync from `performanceStore` every 15s |
| **Called from** | `firebaseConfig.js` (dynamic), `main_engineering.jsx` (static) |
| **Skips** | Heavy page-load + long-task capture on pages identified as `Engineering` or `Performance` (still inits for presence) |

## 4.15 `health/scores.js`

| | |
|--|--|
| **Purpose** | Pure presence + fleet health score for dashboard |
| **Exports** | `devicePresence`, `computeHealthScore` |
| **Thresholds** | online ≤90s; stale ≤300s; else offline |

## 4.16 Dashboard files

| File | Purpose |
|------|---------|
| `EngineeringApp.jsx` | Sidebar nav + active page |
| `pages.jsx` | All 13 dashboard pages in one module |
| `useEngData.js` | `useEngCollection`, buffer peek, settings R/W, audit writes |
| `EngErrorBoundary.jsx` | Catch React errors in eng UI → `trackError(source: react)` |
| `Engineering.css` | Dark ops UI theme |

## 4.17 Entry points & clinical touchpoints

| File | Role |
|------|------|
| `engineering.html` | HTML shell |
| `src/main_engineering.jsx` | React root; imports bootstrap **without** clinical `firebaseConfig` |
| `src/firebaseConfig.js` | Dynamic eng bootstrap import |
| `src/shared/firestore/trackedFirestore.js` | Dual monitor gate; eng emit points |
| `src/performance/firestoreMetrics.js` | `engineering` identity map |
| `vite.config.js` | `engineering` build input |

---

# SECTION 5 — Telemetry SDK

## Initialization

Triggered by `startEngineeringTelemetry()` (module auto-run + explicit export):

1. If kill switch off → return.
2. Resolve page identity via `resolvePageIdentity()`.
3. Read `sessionStorage.loggedUser` (username string only).
4. `EngTelemetry.init({ page, department, buildId, user })`.
5. Start heartbeat; arm flush (60s), memory (30s), network (60s).
6. Push one `domain: "builds"` event.
7. Install error hooks; optionally long-task + page-load capture.

Idempotent: second `init` only `setContext`.

## Context

In-memory object: `deviceId`, `buildId`, `page`, `department`, `user`.  
`setContext` updates heartbeat page/department when those fields change.  
**Diff:** Page identity change does **not** currently force an immediate heartbeat beyond visibility/timer paths (EDS asked for immediate on page change — MPA navigations are full reloads, so init covers most cases).

## Buffer

- Hot: in-memory array, capacity **500**
- Spill: `sessionStorage` key `mango.eng.buffer.v1` on leave
- Flush merges spill + drain
- Drop: oldest non-`errors` domain first

## Sampling

| Domain | Rate (implemented) |
|--------|-------------------|
| Errors | 100% enqueue |
| Heartbeats | 100% (direct write, not via ring) |
| Listener open/close/first snapshot | 100% |
| Incremental snapshots | **1/10** (`snapshotSample % 10 === 0`) |
| Renders | **~5%** (`counter % 20 === 0`); long tasks always |
| Memory | 1 / 30s |
| Network probe | 1 / 60s |

## Flush

- Interval: 60s via `scheduleFlush`
- Also: `pagehide`, `visibilitychange → hidden`, Settings “Flush now”, `shutdown`
- Scheduling: `requestIdleCallback` (timeout 4s) or `setTimeout(50)` / `0` if force
- Aggregation by domain then `Promise.allSettled` writers
- Concurrency: `flushing` latch (force can still enter)

## Kill switch

- Key: `mango.eng.telemetry`
- `"0"` → disabled; else enabled
- Settings page can toggle and write audit events if eng DB up
- **Does not** automatically stop already-running timers until reload/`shutdown` (toggle sets storage; subsequent track/flush/heartbeat checks enabled)

## Error handling

All SDK public methods wrapped in `safeRun`. Firestore write failures `.catch(() => {})` or `allSettled`. Flush outer `try/catch` swallows.

## Redaction (as implemented)

**Sent:** deviceId, page, department, username string, collection **names**, timings, counts, truncated message/stack, UA slice.  
**Not sent:** document bodies, query result fields, patient identifiers by design of observation points.  
**Diff vs EDS:** No explicit digit-redaction / stackHash for PHI-looking strings in error messages; messages truncated to 500 chars only.

## Retry logic

**Diff vs EDS:** No structured retry queue with backoff. Behavior:

- Eng DB missing → re-push drained events into ring
- Write failures → swallowed (events already drained — **possible silent loss** on partial failure after drain)
- Heartbeat failures → ignored until next interval

## Shutdown

`EngTelemetry.shutdown()`: spill → force flush → stop heartbeat → clear timers → `initialized = false`. Not auto-called on kill switch toggle.

---

# SECTION 6 — Engineering Firebase

## Project model

- **Recommended & implemented:** Separate Firebase project, second app instance named `mango-engineering`.
- Until `VITE_ENG_*` or `engFirebase.options` is set: **local-only** buffering; dashboard shows “not configured”.

## Collections (implemented names)

| Collection | Written by | Read by dashboard |
|------------|------------|-------------------|
| `devices` | heartbeat | (registry; Devices uses `device_status`) |
| `device_status` | heartbeat | Devices, Health, Listeners |
| `heartbeat_hourly` | heartbeat | **Not displayed** yet |
| `departments` | flush | Departments |
| `firestore_metrics` | flush | Firestore, Health |
| `listener_daily` | flush | Listeners |
| `pages` | flush | Performance, Health |
| `network` | flush | Network |
| `memory` | flush | Memory |
| `react_metrics` | flush | React |
| `errors` | flush | Errors, Health |
| `builds` | flush | Builds |
| `settings` | Settings UI | Settings |
| `audit` | Settings / kill switch | Audit |
| `health` | **Not written** | Declared in constants only |
| `alerts` | **Not written** | Health counts open alerts (empty unless manually seeded) |

## Indexes

**None defined in-repo for eng project.** Dashboard mostly uses whole-collection `onSnapshot` / `limit`. `orderBy` is optional in `useEngCollection` but pages generally do not pass `orderByField` (client-side sort used for errors/audit).

## Update / read / write frequency (order of magnitude)

| Path | Frequency |
|------|-----------|
| Heartbeat overwrite | 1 write / device / 30s visible (plus devices merge + hourly increment) |
| Metric flush | ~1 batch / device / 60s + pagehide |
| Dashboard | Live listeners per open page’s collections |

EDS §16 cost tables still apply as planning guidance for the **eng** project only.

## Retention

**Not automated.** No Cloud Function / admin job implemented. Constants document intent; cleanup is manual / future work.

## Expected growth (when configured)

| Kind | Growth |
|------|--------|
| `device_status` / `devices` | ~N devices (constant) |
| Daily aggregates (`*_` per day×device×collection) | Linear in days × devices × active collections |
| `errors` | Auto-id docs; can grow unbounded without retention |
| Storage | Low tens of MB over 90 days of aggregates (EDS estimate); raw errors dominate if noisy |

---

# SECTION 7 — Device Monitoring

## Registration

On first `getDeviceId()`: UUID stored in `localStorage.mango.eng.deviceId`.  
Each heartbeat merges `devices/{deviceId}` with label, UA, platform, `lastSeenAt`, and sets `firstSeenAt: serverTimestamp()` on merge (note: merge may refresh firstSeenAt depending on Firestore merge semantics for that field — **implementation always sends `firstSeenAt`**, which can overwrite; treat as known quirk).

## Heartbeats

`sendHeartbeat()` writes:

1. `device_status/{deviceId}` — full live payload + `clientTs`
2. `devices/{deviceId}` — registry metadata
3. `heartbeat_hourly/{hour}_{deviceId}` — `beats` increment

## Online / offline / stale

**Not written by clients.** Dashboard `devicePresence(clientTs)`:

| State | Rule |
|-------|------|
| online | `now - clientTs ≤ 90_000` |
| stale | `≤ 300_000` |
| offline | else, or missing `clientTs` |

Also heartbeat includes `online: navigator.onLine` as a field (connectivity flag, distinct from presence).

## Device lifecycle

1. Browser first loads clinical page with eng enabled → deviceId created  
2. Init → first heartbeat  
3. Periodic heartbeats while tab alive  
4. Hidden → 120s interval  
5. pagehide → spill + flush + heartbeat  
6. No heartbeat → appears stale then offline on Devices board  

---

# SECTION 8 — Page Performance

## Capture path (eng bootstrap)

Parallel to clinical performance bootstrap (does **not** duplicate clinical `finalizePageLoad` math exactly):

| Metric | How calculated in eng |
|--------|----------------------|
| `firstPaintMs` | PerformanceObserver `paint` — first `first-paint` / `first-contentful-paint` `startTime` |
| `firstRenderMs` | Double `requestAnimationFrame` → `performance.now()` |
| `interactiveMs` | Set equal to `totalMs` at finalize (**simplified**) |
| `totalMs` | `performance.now()` at finalize |
| Finalize trigger | `window.load` + 800ms, or 15s timeout |
| `firstSnapshotMs` | **Not set** in eng page-load capture object |

## Diff vs EDS §6 / clinical perf layer

Clinical `performance/bootstrap.js` computes:

- `interactiveMs = max(domComplete, firstSnapshotMs)`
- `totalMs = max(interactive, now, loadEventEnd)`
- First snapshot from `onFirstSnapshot` via tracked wrappers

Eng page events:

- Do **not** currently populate `firstSnapshotMs` into page-load track payload
- Eng **does** record `trackQuery(..., kind: "snapshot_first")` separately in `firestore` domain

Dashboard Performance page shows sums / `lastTotalMs` from `pages` aggregates — approximate waterfall, not full EDS T0–T7.

---

# SECTION 9 — Firestore Monitoring

## Observation points

Only via `trackedOnSnapshot` / `trackedGetDocs` / `trackedGetDoc` when eng enabled.

## Metrics captured

| Metric | Implementation |
|--------|----------------|
| Reads (observed doc counts) | `docCount` on queries/snapshots |
| Writes | **Not instrumented** (EDS Phase 1 / default off) |
| Snapshots | Listener events + sampled incrementals |
| Listeners open/close | `action: open\|close` |
| Reconnects | **Not explicitly counted** |
| Retries | **Not explicitly counted** |
| Failures | Listener `action: error` + `trackError(source: firestore)` |
| Slow queries | `durationMs ≥ 2000` → `slowCount` on flush |
| Collection stats | Aggregated in `firestore_metrics` by `day_deviceId_collection_kind` |

## Dual gate with clinical perf

```
if (!perf && !eng) → pure Firebase passthrough
if perf → existing performanceCollector path
if eng → EngTelemetry track* inside safeRun (never awaited)
```

---

# SECTION 10 — React Monitoring

| Capability | Implemented? | How |
|------------|--------------|-----|
| Long tasks | Yes | PerformanceObserver `longtask` in bootstrap (skipped on Eng/Performance pages) |
| Render samples | Partial | `trackRender` ~5%; **no clinical component wrappers** calling it by default |
| React Profiler | No | Not installed on clinical trees |
| Context update counts | No | Explicitly deferred (EDS Phase 2) |
| Slow components by name | No | Only longtask `name` when browser provides it |
| Error Boundary | Eng dashboard only | `EngErrorBoundary`; **not** wrapped around clinical `main_*.jsx` |

---

# SECTION 11 — Memory Monitoring

| Metric | Implemented? | How |
|--------|--------------|-----|
| Heap used / total / limit | Yes (Chromium) | `performance.memory` every 30s |
| Heap growth rate | No | Not computed |
| sessionStorage / localStorage bytes | No | Not summed |
| SQC / cache entry counts | No | Not instrumented |
| Listener growth | Partial | Heartbeat `activeListeners` synced from perf store Active count |
| GC estimation | No | Not implemented |

Non-Chromium browsers: memory samples simply absent.

---

# SECTION 12 — Network Monitoring

| Metric | Implemented? | How |
|--------|--------------|-----|
| Online/offline events | Yes | `window` online/offline → trackNetwork |
| RTT / latency | Optional | HEAD fetch to `VITE_ENG_PROBE_URL` if set; else latency null |
| Reconnects counter | No | Not a dedicated counter (offline/online events only) |
| Eng flush retries | No | No retry policy |
| Snapshot delay vs heartbeat | No | Not implemented |

**Never probes clinical APIs for RTT.**

---

# SECTION 13 — Error Monitoring

| Source | Capture |
|--------|---------|
| `window.onerror` | bootstrap → `source: "window.onerror"` |
| `unhandledrejection` | bootstrap → `source: "unhandledrejection"` |
| Firestore listener errors | trackedFirestore → `source: "firestore"` |
| React (eng UI) | EngErrorBoundary → `source: "react"` |
| Inventory/Owner/Validator specific | **Not special-cased** — classified only by page/department context |

## Classification / deduplication

- Classification = `source` string + page/department context  
- **No stackHash**, **no count merge**, **no hourly dedupe doc IDs**  
- Flush writes last ≤50 error events as `addDoc` auto-ids  

---

# SECTION 14 — Dashboard Documentation

**Entry:** `/engineering.html` → `EngineeringApp`  
**Data:** Engineering Firebase only (`getEngDb`). Never clinical `db`.

| Page | Purpose | Data source | Widgets / interactions |
|------|---------|-------------|------------------------|
| **Health** | Fleet score overview | `device_status`, `errors`, `pages`, `firestore_metrics`, `alerts` + local buffer size | Score ring, online/stale/offline counts, errors 1h, p95 load (from `lastTotalMs` samples), open alerts, slow queries, factors JSON |
| **Devices** | Live board | `device_status` | Filter all/online/stale/offline; row click → detail JSON |
| **Departments** | Dept cards | `departments` | Avg load from `loadSumMs/loadCount`; error & listener event counters |
| **Firestore** | Collection query stats | `firestore_metrics` | Bar chart by collection count; table sorted by `durationMaxMs` |
| **Listeners** | Churn / open | `listener_daily`, `device_status` | Fleet open sum; daily opens/closes/snapshots/errors table |
| **Memory** | Heap daily | `memory` | Table of used/total/limit/samples |
| **React** | Long tasks / samples | `react_metrics` | Daily longTasks, duration sum, renderSamples |
| **Performance** | Page loads | `pages` | Bars by max `lastTotalMs`; waterfall-ish sums table |
| **Network** | Connectivity daily | `network` | Online/offline events, probes, avg RTT |
| **Errors** | Error stream | `errors` | Sorted by `ts`; message + source + page |
| **Builds** | Build adoption | `builds` | buildId, seenCount, last device, UA slice |
| **Settings** | Kill switch, labels, fleet settings | localStorage + `settings/global` | Enable/disable telemetry, flush, device label, save thresholds, show local buffer |
| **Audit** | Ops actions | `audit` | settings.update / telemetry.enable|disable |

### Health score calculation (dashboard)

```
score = 100
  - min(40, errors1h * 2)
  - min(25, round(slow/queryCount * 100)) if queries > 0
  - min(15, offlineEvents * 3)   // note: Health page currently passes memoryPressure=false
                                 // and does not pass offlineEvents into computeHealthScore today
  - 10 if memoryPressure
  - 15 if devicesOnline/devicesTotal < 0.5
clamp 0..100 → grade A–F
```

**Diff:** Health page does not currently feed `offlineEvents` or memory pressure into `computeHealthScore` even though the helper supports them.

---

# SECTION 15 — Data Flow

```
Clinical page loads
  → firebaseConfig initializes clinical Firebase
  → dynamic import engineering/telemetry/bootstrap.js
  → EngTelemetry.init (if kill switch allows)
  → heartbeat timer + flush/memory/network arms

User activity / listeners / getDocs
  → trackedFirestore wrappers
  → EngTelemetry.trackQuery / trackListener* (safeRun, sync return)
  → pushEvent → in-memory ring

Timers / leave
  → scheduleFlush / spillToSession
  → flushNow drains ring + spill
  → if eng DB configured: aggregate setDoc/addDoc to eng collections
  → else: re-queue into ring

Ops opens engineering.html
  → main_engineering.jsx (no clinical firebaseConfig)
  → useEngCollection onSnapshot eng collections
  → pages render widgets
```

Heartbeats **bypass** the ring and write directly to eng Firestore when configured.

---

# SECTION 16 — Engineering Firebase Schema

### `devices`

| | |
|--|--|
| **Purpose** | Workstation registry |
| **Doc ID** | `deviceId` |
| **Fields** | `deviceId`, `label`, `lastSeenAt`, `userAgent`, `platform`, `updatedAt`, `firstSeenAt` |
| **Update** | Each heartbeat (merge) |
| **Retention** | Not enforced |
| **Indexes** | None |

### `device_status`

| | |
|--|--|
| **Purpose** | Live Devices board |
| **Doc ID** | `deviceId` |
| **Fields** | `deviceId`, `label`, `page`, `department`, `buildId`, `activeListeners`, `memoryMB`, `online`, `visibility`, `userAgent`, `platform`, `lastSeenAt`, `clientTs` |
| **Update** | 30s / 120s overwrite |
| **Diff** | No persisted `status` enum |

### `heartbeat_hourly`

| | |
|--|--|
| **Doc ID** | `{yyyy-mm-ddTHH}_{deviceId}` sanitized |
| **Fields** | `hour`, `deviceId`, `beats`, `lastPage`, `updatedAt` |
| **Dashboard** | Not visualized yet |

### `departments`

| | |
|--|--|
| **Doc ID** | department name (slashes stripped) |
| **Fields** | `department`, `lastDeviceId`, `errorCount`, `loadSumMs`, `loadCount`, `listenerEvents`, `updatedAt` |
| **Diff vs EDS** | No `activeDevices`, `p95LoadMs`, `openListeners`, `errorCount1h` as specified; cumulative increments instead |

### `firestore_metrics`

| | |
|--|--|
| **Doc ID** | `{day}_{deviceId}_{collection}_{kind}` sanitized |
| **Fields** | `day`, `deviceId`, `collection`, `kind`, `page`, `department`, `queryCount`, `docCountSum`, `durationSumMs`, `durationMaxMs`, `slowCount`, `updatedAt` |
| **Diff** | No p95; `durationMaxMs` is last-batch max (not cross-flush max via increment) |

### `listener_daily`

| | |
|--|--|
| **Doc ID** | `{day}_{deviceId}_{collection}` |
| **Fields** | opens, closes, snapshots, errors, lastDocCount, page, department |
| **Diff** | Replaces per-listener live docs (EDS preferred aggregates — **this matches cost-aware design**) |

### `pages`

| | |
|--|--|
| **Doc ID** | `{day}_{deviceId}_{page}` |
| **Fields** | loadCount, firstPaint/Render/Snapshot/Interactive/Total **sums**, `lastTotalMs` |

### `network` / `memory` / `react_metrics`

Daily per-device docs as implemented in flush (see §4.12).  
**Diff:** EDS described separate `*_latest` + `*_daily` paths; implementation uses **single daily doc** per domain.

### `errors`

Auto-id; fields: deviceId, day, page, department, source, message, stack, ts, createdAt.

### `builds`

Doc ID = sanitized buildId; `seenCount`, `lastDeviceId`, `userAgent`, `lastSeenAt`.

### `settings` / `audit`

`settings/global`; `audit` auto-id.

### `health` / `alerts`

Declared in `ENG_COLLECTIONS`; **no writer** in current code.

---

# SECTION 17 — Performance Metrics (calculation reference)

| Metric | Formula / source in implementation |
|--------|-------------------------------------|
| Page Load (eng) | `totalMs = performance.now()` at finalize |
| React Mount approx | double rAF `performance.now()` → `firstRenderMs` |
| Interactive (eng) | Currently `= totalMs` at finalize |
| Query Time | `performance.now()` delta around getDocs/getDoc/first snapshot |
| Snapshot Time | Same for snapshot_first; incrementals sampled |
| Memory | `performance.memory.*` |
| Errors | Enqueued count; Health uses errors with `ts ≥ now-1h` |
| Listeners | Opens/closes/snapshots counters; heartbeat Active count from perf store |
| Health Score | See §14 |
| P95 page load (Health) | Sort `pages[].lastTotalMs`; index `ceil(0.95*(n-1))` |
| Slow query | `durationMs ≥ SLOW_QUERY_MS` (2000) |

---

# SECTION 18 — Configuration

## Environment variables

| Variable | Purpose |
|----------|---------|
| `VITE_ENG_API_KEY` | Eng web API key |
| `VITE_ENG_AUTH_DOMAIN` | Auth domain |
| `VITE_ENG_PROJECT_ID` | **Required** with API key to configure |
| `VITE_ENG_STORAGE_BUCKET` | Optional |
| `VITE_ENG_MESSAGING_SENDER_ID` | Optional |
| `VITE_ENG_APP_ID` | Optional |
| `VITE_ENG_BUILD_ID` / `VITE_APP_VERSION` | Build identity (else `"dev"`) |
| `VITE_ENG_PROBE_URL` | Optional RTT probe (eng-only URL) |

## Firebase config file

`engFirebase.options.js` — export object or `null`.

## Kill switches / flags

| Key | Effect |
|-----|--------|
| `mango.eng.telemetry` | Eng SDK (`"0"` off) |
| `mango.perf.monitor` | Clinical perf layer (independent) |

## Sampling & thresholds

Hardcoded in `constants.js` / SDK (not yet driven by `settings/global` at runtime):

- Buffer 500; flush 60s; memory 30s; network 60s  
- Heartbeat 30s/120s  
- Slow query 2000ms  
- Presence 90s/300s  
- Settings UI can **persist** heartbeatSec / slowQueryMs to eng Firebase but **clients do not read those settings to override constants yet**

---

# SECTION 19 — Security

## Isolation from clinical

- Separate Firebase app/project credentials  
- Dashboard never imports clinical `db`  
- Rules template denies clinical collection names on eng project  
- Telemetry payloads exclude document data by construction of wrappers  

## Why patient data should not enter telemetry

Observation points only receive metadata (collection name, counts, timings). Save/validate/deduction bodies were not instrumented. Error messages are truncated but **not** PHI-scrubbed — ops must treat error text as potentially sensitive and tighten redaction before wide rollout.

## Permission model

| Surface | Current |
|---------|---------|
| Eng Firestore rules | Open R/W on allowlisted eng collections (Phase 1 lab) |
| Dashboard auth | **None** (anyone who can open URL + has eng credentials in build) |
| Clinical users.js | Not used for eng auth |

**Production requirement:** Firebase Auth + allowlist before exposing eng project beyond trusted lab network.

## Failure isolation

safeRun, no await on clinical path, kill switch, local buffer when eng down, dynamic import catch in firebaseConfig.

---

# SECTION 20 — Operational Workflow (example day)

1. **Biochem opens** `index_biochem.html`  
2. Clinical Firebase initializes; eng bootstrap dynamic-imports  
3. DeviceId ensured; EngTelemetry init with page=Biochemistry  
4. Heartbeat writes `device_status` (if eng configured)  
5. Page-load timers + long-task observer arm  
6. Dept listeners via `trackedOnSnapshot` → listener open + first snapshot query metrics  
7. Every 30s heartbeat; every 60s flush aggregates  
8. Ops opens `engineering.html` → Devices shows workstation online; Firestore page accumulates collection stats  
9. Tech closes tab → pagehide spill/flush/heartbeat  
10. After 90s without beats → stale; after 300s → offline on board  

---

# SECTION 21 — Failure Scenarios

| Failure | Engineering behaviour | Clinical behaviour |
|---------|----------------------|--------------------|
| Eng Firebase offline / unconfigured | Buffer locally; heartbeat no-ops; re-queue on flush | Unaffected |
| Network loss | Online/offline events; flush fails swallowed; possible event loss after drain | Independent |
| Telemetry disabled | SDK no-op; tracked passthrough if perf also off | Identical to pre-eng for wrappers when both off |
| Dashboard offline | Ops blind; devices still try to write | Unaffected |
| Memory pressure in telemetry | Buffer capped at 500 | Clinical continues; recommend kill switch |
| Listener failure (clinical) | Error tracked if eng on | Existing clinical error path unchanged |
| Clinical Firebase outage | Eng may still heartbeat if eng project reachable | Clinical broken independently |
| Telemetry crash | safeRun swallow | Unaffected |

---

# SECTION 22 — Production Deployment

1. Create Firebase project (e.g. `mango-engineering`); enable Firestore  
2. Deploy rules from `firestore.rules.engineering` (**tighten Auth first**)  
3. Create web app; copy config to `.env.local` `VITE_ENG_*`  
4. Optionally set `VITE_ENG_BUILD_ID` / `VITE_ENG_PROBE_URL`  
5. Build (`npm run build`) — confirm `dist/engineering.html`  
6. Deploy static assets as usual (MPA)  
7. Smoke: clinical page with eng on → Devices updates ≤30–60s  
8. Smoke: `mango.eng.telemetry=0` → no eng writes  
9. Rollback: kill switch, or remove eng import + revert trackedFirestore, or unpublish engineering.html  

---

# SECTION 23 — Validation Checklist

- [ ] Eng project exists; rules deployed; credentials only in env/options  
- [ ] Clinical project credentials unchanged  
- [ ] `engineering.html` loads all 13 nav sections without console fatal errors  
- [ ] With eng configured: heartbeat docs appear in `device_status`  
- [ ] With eng unconfigured: clinical pages still load; buffer grows locally  
- [ ] Kill switch disables new eng activity after reload  
- [ ] Dashboard does not call clinical Firestore (Network tab)  
- [ ] Error injection (`throw` in eng UI) caught by EngErrorBoundary  
- [ ] Build includes engineering entry  
- [ ] Rules deny writing `master_register` on eng project  

---

# SECTION 24 — Regression Checklist

### Clinical must-pass

- [ ] Registration save/scan  
- [ ] Department validate / results path  
- [ ] Inventory deduction  
- [ ] ICC tabs  
- [ ] Owner KPI pages  
- [ ] Validator  
- [ ] Critical alerts  
- [ ] Listener counts / query shapes unchanged (same Firestore queries)  

### Engineering must-pass

- [ ] Dual kill switch matrix (eng on/off × perf on/off)  
- [ ] tracked passthrough when both off  
- [ ] Heartbeat intervals visible/hidden  
- [ ] Flush on pagehide  
- [ ] Settings audit rows  

---

# SECTION 25 — Known Limitations

### Not implemented / deferred

- Clinical MPA React Error Boundaries on every `main_*.jsx`  
- Explicit reconnect/retry counters  
- Write instrumentation  
- React Profiler / context update counting  
- Heap growth, storage footprint, SQC cache size  
- `health` / `alerts` writers; alert rules engine  
- Retention Cloud Function  
- Ops authentication  
- Runtime application of `settings/global` sample rates  
- `sendBeacon` flush  
- Freezing clinical `perf_daily` dual-write  
- Per-listener live docs (aggregates used instead — intentional cost choice)  
- FirstSnapshotMs wired into eng **page** events  
- Digit redaction / stackHash dedupe for errors  
- `heartbeat_hourly` visualization  

### Outstanding risks

- Open eng Firestore rules (Phase 1)  
- Silent metric loss if flush drains then write fails  
- `firstSeenAt` always sent on device merge  
- Error message PHI leakage potential  
- Eng credentials not yet provisioned → local-only until ops configures  

---

# SECTION 26 — Engineering Dashboard Feature Matrix

| Feature | Purpose | Source | Frequency | Page | Dependencies |
|---------|---------|--------|-----------|------|--------------|
| Fleet health score | Ops severity | Computed client-side | On render | Health | device_status, errors, firestore_metrics, pages |
| Device presence | Fleet liveness | device_status.clientTs | Live listen | Devices/Health | heartbeat |
| Device detail | Debug workstation | device_status row | Click | Devices | — |
| Dept cards | Dept load/errors | departments | Live | Departments | flushDepartments |
| Query bars | Hot collections | firestore_metrics | Live | Firestore | trackedQuery flush |
| Slow query table | Latency outliers | durationMaxMs / slowCount | Live | Firestore | SLOW_QUERY_MS |
| Listener churn | Open/close rates | listener_daily | Live | Listeners | tracked listeners |
| Open listeners sum | Current pressure | device_status.activeListeners | Live | Listeners | perf store sync |
| Memory table | Heap | memory | Live | Memory | performance.memory |
| React long tasks | Jank | react_metrics | Live | React | PerformanceObserver |
| Page load bars | Slow pages | pages.lastTotalMs | Live | Performance | bootstrap page load |
| Network daily | Connectivity | network | Live | Network | online/offline/probe |
| Error stream | Failures | errors | Live | Errors | window/firestore/react |
| Builds | Version drift | builds | Live | Builds | init build event |
| Kill switch UI | Disable eng | localStorage | Manual | Settings | killSwitch |
| Flush now | Force delivery | scheduleFlush | Manual | Settings | flush |
| Device label | Human name | localStorage | Manual | Settings | deviceId |
| Fleet settings save | Persist thresholds | settings/global | Manual | Settings | eng DB |
| Audit log | Ops trail | audit | On settings/kill | Audit | addDoc |
| Local buffer peek | Debug without eng DB | ring buffer | 2s poll | Settings/Health | buffer |

---

# SECTION 27 — EDS Compliance Matrix

| EDS section | Status | Notes |
|-------------|--------|-------|
| §1 Architecture layers | **Implemented** | Matches diagram |
| §2 SDK surface | **Implemented** | API present; sampling specifics as coded |
| §2.4 Buffer/spill | **Implemented** | Own spill key (not mango.perf.v1) |
| §2.5 Redaction | **Partial** | No digit scrub / stackHash |
| §3 Separate Firebase project | **Implemented** (config path) | Credentials not in repo |
| §3 Named DB fallback | **Not implemented** | Options A only |
| §3 `devices` | **Implemented** | firstSeenAt quirk |
| §3 heartbeats raw minute history | **Not implemented** | Overwrite + hourly only (EDS preferred cost path) |
| §3 `device_status` | **Implemented** | Status computed in UI, not stored |
| §3 `departments` | **Partial** | Simpler counters |
| §3 per-listener docs | **Not implemented** | `listener_daily` aggregates instead |
| §3 `firestore_metrics` | **Partial** | No p95/writes/reconnects fields |
| §3 `pages` | **Partial** | Sums + lastTotal; limited snapshot timing |
| §3 network/memory/react | **Partial** | Daily docs; fewer fields than EDS |
| §3 `errors` | **Partial** | No dedupe hash/count |
| §3 `audit`/`settings`/`builds` | **Implemented** | |
| §3 `health`/`alerts` | **Not implemented** (collections unused) | |
| §3 Stop `perf_daily` | **Not implemented** | Still dual-writing via perf layer |
| §4 Injection: trackedFirestore | **Implemented** | |
| §4 Injection: shared hooks bodies | **N/A / covered indirectly** | Via tracked wrappers already used |
| §4 Owner/ICC body injection | **Not implemented** | Per EDS “do not change publish math”; covered if they use tracked* |
| §4 firebaseConfig bootstrap | **Implemented** | |
| §4 window errors | **Implemented** | |
| §4 clinical Error Boundaries | **Not implemented** | Eng dashboard only |
| §4 StrictMode annotation | **Not implemented** | |
| §5 Heartbeat identity/timing | **Implemented** | Payload subset |
| §5 Immediate on page change | **Partial** | MPA reload covers; SPA setContext no forced beat |
| §6 Full timing model | **Partial** | Eng simplify interactive; firstSnapshot on pages weak |
| §7 Memory extras | **Partial** | Heap only |
| §8 React extras | **Partial** | Long tasks primarily |
| §9 Listener reconnect metrics | **Not implemented** | |
| §10 Writes metrics | **Not implemented** | |
| §11 Network RTT | **Partial** | Optional probe URL |
| §12 Error dedupe | **Not implemented** | |
| §13 Dashboard pages | **Implemented** | All listed pages present |
| §14 Score weights | **Partial** | Custom computeHealthScore; settings not driving runtime |
| §15 Retention job | **Not implemented** | |
| §16 Cost model | **Documented only** | Planning reference |
| §17 Failure modes | **Implemented** | Matches intent |
| §18 Phases 1–4 | **Largely implemented in one pass** | Phase 5 validation = this review |
| Acceptance: disable eng | **Implemented** | Kill switch |
| Acceptance: no clinical awaits | **Implemented** | |
| Acceptance: no clinical eng writes | **Implemented** | |
| Acceptance: no patient fields | **Mostly** | Error strings risk |

---

# SECTION 28 — Implementation Statistics

| Statistic | Value |
|-----------|-------|
| Files under `src/engineering/` | 21 (including report, rules, env example, CSS) |
| Core code modules (js/jsx/css) | ~18 |
| MPA entries added | `engineering.html`, `main_engineering.jsx` |
| Clinical files modified | 4 (`firebaseConfig.js`, `trackedFirestore.js`, `firestoreMetrics.js`, `vite.config.js`) |
| Approximate LOC (eng + entry, excl. report) | **~3,100** |
| Approximate LOC `trackedFirestore.js` after change | **~340** |
| Engineering collections named | **16** (`ENG_COLLECTIONS`) |
| Collections actively written | **13** (not `health`, `alerts`) |
| Dashboard pages | **13** |
| Telemetry event domains | `pages`, `firestore`, `listeners`, `memory`, `network`, `react`, `errors`, `builds` (+ heartbeat direct writes) |
| Metrics tracked (primary) | Query duration/docCount/kind, listener open/close/snapshot/error, page paint/render/total, heap, online/latency, long tasks, errors, device presence, health score |
| Build verification | `npm run build` includes `dist/engineering.html` |

---

## Document control

| Item | Value |
|------|-------|
| Author role | Principal Software Architect (documentation of implemented system) |
| Code modified for this manual | **None** |
| Source of truth for behaviour | Source files under `src/engineering/**` + listed clinical touchpoints |
| Source of truth for intent | `Engineering_Telemetry_Platform_EDS.md` |
| Next step | Production review using §§22–24; provision eng Firebase; tighten rules/auth; close §25 gaps as required |

**End of Engineering Operations Platform Technical Manual**
