# Mango Engineering Dashboard — Human Guide

A plain-language guide to the **Mango Engineering** operations dashboard (`/engineering.html`).  
This dashboard is **observer-only**: it watches how lab computers and pages behave. It does **not** change patient results, saves, validation, or inventory.

---

## What this dashboard is for

Think of it as a **flight recorder for the lab software**:

- Which workstations are online?
- Which pages feel slow?
- Is the database answering quickly?
- Did something hang (page never finished loading)?
- After a software update, did things get better or worse?

**Clinical Firebase** (patient / lab data) and **Engineering Firebase** (telemetry) are separate. This screen only reads Engineering data (`eng_*`).

---

## Before you look at any tab: Global filters

At the top of every tab (except Settings) you will see **Global filters**. They apply to almost all numbers and tables.

| Control | What it does |
|--------|----------------|
| **Date range** | Today, Yesterday, Last 7 Days, Last 30 Days, This / Previous Month, All Time, or a custom range |
| **Department** | Limit to one area (Biochemistry, Haematology, Owner, etc.) or All |
| **Device** | One workstation, or All Devices |
| **Build** | One software build / version, or All Builds |
| **Search** | Free text match on department / page / build / labels |
| **Refresh** | Re-fetch data now |
| **Reset Filters** | Back to defaults |
| **Export PDF** | Download a multi-section report for the **current** filter settings |

**Tips**

- Always note the date range in the header (“Yesterday”, “Last 7 Days”, …). Numbers only mean something inside that window.
- “All Time” is limited by **retention** (daily summaries are kept longer than detailed per-load samples). If Timeline looks empty but Departments still has averages, that is normal.
- If a tab looks empty but Health looks busy, try **Refresh**, widen the date range, or set Department / Device back to **All**.

---

## Quick vocabulary (used on many tabs)

| Term | Everyday meaning |
|------|------------------|
| **Device / workstation** | A computer or iPad running the lab UI |
| **Page** | A screen that was opened (e.g. Biochemistry, OwnerBiochem, Mango) |
| **Department** | Logical area of the lab software (Owner, Biochemistry, Critical, …) |
| **Page load** | One open of a page; starts when the page begins loading |
| **ms / s** | Milliseconds / seconds. **1000ms = 1 second**. Lower is usually better for load times |
| **Average (avg)** | Typical value across samples |
| **P95 (95th percentile)** | “Most people”: 95% of samples were this fast or faster; only ~5% were slower. Better than average for spotting “often slow” |
| **First snapshot** | First time the page got a real answer from Firestore (live data arrived). If this never happens, the page feels stuck |
| **Listener** | A live subscription to Firestore (keeps a list/table up to date). “Waiting” = still waiting for first data |
| **Hung** | Page load finished its timer **without** getting a first snapshot — classic “spinner forever / blank table” pattern (often Wi‑Fi / iPad) |
| **Slow** | Total load time ≥ about **2 seconds** |
| **Critical** (status) | Total load time ≥ about **4 seconds** |
| **Ok** | Load completed with a first snapshot and under the slow threshold |
| **Online / Stale / Offline** (device) | Recently heartbeating / recently seen but quiet / not seen for a long time |
| **Build** | Software version string (e.g. `dev` or a deploy id) |
| **Load ID** | Unique ID for one page open. Same ID links **Timeline** ↔ **Components** |
| **—** | No measurement for that cell (missing or not instrumented) |

---

## Suggested reading order (first time)

1. **Health** — “Is the fleet OK today?”  
2. **Devices** — “Which machine is unhappy?”  
3. **Departments** — “Which area of the lab is slow?”  
4. **Timeline** — “What happened on a bad load?”  
5. **Listeners** / **Firestore** — “Is the database / live data the bottleneck?”  
6. **Components** — “Which part of the page was slow or never opened?”  
7. **Errors** / **Network** — confirm failures and connectivity  
8. **Builds** — compare before/after a deploy  
9. **Export PDF** — save a snapshot for review or for an AI assistant  

---

## Tab-by-tab guide

### 1. Health (Fleet Health)

**Purpose:** One-screen “how are we doing?” for the filtered period.

**Main cards**

| Card | Meaning | What “bad” looks like |
|------|---------|------------------------|
| **Health score** (0–100 + grade A–F) | Composite score from errors, slow queries, offline events, and how many devices are online | Low score / D–F |
| **Devices online** | How many workstations are currently heartbeating | Many stale/offline during working hours |
| **Errors (period)** | Count of recorded client errors in the date range | Sudden spike vs yesterday |
| **P95 page load** | How slow the slower opens are | Rising over days; large gap vs average |
| **Open alerts** | Unresolved engineering alerts | Non-zero and growing |
| **Slow queries** | Firestore queries marked slow (vs total observed) | High slow / total ratio |
| **Waiting listeners** | Live: streams still waiting for first data | Non-zero on floor devices |
| **Hung loads** | Live: loads that never got first snapshot | Non-zero |
| **Avg first snapshot** | How long until live data first arrives | High or climbing |
| **Listener retries** | How often listeners were retried on devices | Rising with hangs |

**Also:** table of **Devices waiting on listeners** (who is stuck right now), and **Score factors** (why the score dropped).

**How to use it:** Start here every morning. If Health is fine, you rarely need deep tabs. If not, note which card is red, then go to Devices / Timeline / Errors.

---

### 2. Devices

**Purpose:** Per-workstation view — who is online, what page they are on, listeners, memory, recent load times.

**What you will see**

- List of devices with **presence** (online / stale / offline), department, current page, listener counts, heap memory.
- Click a device to see **recent page loads** for that machine (average / fastest / slowest).

**How to use it**

- Find a machine staff complain about.
- Compare its load times to others in the same department.
- Check if it is the only one with waiting listeners or high memory.

---

### 3. Departments

**Purpose:** Compare lab areas (Biochemistry, Owner, Critical, …) for the selected date range.

**Each card roughly shows**

| Field | Meaning |
|-------|---------|
| Large time (e.g. 1.44s) | Average page-load time for that department in the range (prefers daily aggregates when available) |
| **Last** | Most recent sample time + page name |
| **Period** | How many loads, fastest / slowest / p95, errors |
| **Active devices** | Online devices currently tagged to that department |
| **Load timeline** | Day-by-day sparkline of load times in the range |

**Important nuances**

- **Owner** is one department that includes many Owner analytics pages.
- **Period average** vs **lifetime average**: if the card says there were no loads in range, it may show a longer-term average — read the subtitle.
- Empty department cards for a day often mean that area was not opened (or telemetry was off / not writing).

**How to use it:** Spot which department got slower after a deploy or on a bad Wi‑Fi day.

---

### 4. Firestore

**Purpose:** Database query health from the **client’s** point of view (not a Firebase Console billing screen).

**You will see**

- Bar chart: queries by collection  
- Table: slow / max duration queries (collection, kind, counts, page)

**How to use it:** If pages are slow but CPU seems fine, check whether a collection’s queries are slow or very frequent.

---

### 5. FS by Component (Firestore by Component)

**Purpose:** Same idea as Firestore, but broken down by **page → module → collection → query**, so you can see *which feature* caused reads/writes/listener opens.

**KPIs** often include reads, writes, listener opens, slow queries, avg snapshot docs, avg query time, avg first snapshot, estimated cost hints.

**How to use it:** After Timeline shows a slow page, open this tab filtered to that page and find the heavy module/collection.

---

### 6. Listeners

**Purpose:** Health of **live** Firestore streams (tables that update without refresh).

**Fleet cards (examples)**

| Card | Meaning |
|------|---------|
| **Active (fleet)** | Sum of currently open tracked listeners across devices |
| **Waiting (fleet)** | Streams that have not received first data yet |
| **Live docs held / payload** | How much live data devices are holding |
| **Timeouts 10s / 30s** | Streams that waited too long |
| **Recreates / Retries** | Listener teardown/rebuild and user/system retries |
| **Avg / P95 / Slowest first snapshot** | How long until first data arrives |
| **Period changes / merge** | How busy incremental updates were |

**Daily table:** per day / device / collection — opens, snapshots, changes, reconnects, errors, timeouts, reasons, etc.

**How to use it:** Hung Timeline rows + waiting listeners usually point here (especially iPads on weak Wi‑Fi).

---

### 7. Memory

**Purpose:** Browser heap samples (mainly Chromium). Helps spot devices that grow memory over the day.

**Columns** typically: day, device, used / total / limit heap, cache entries, samples, page.

**Note:** Not all browsers report heap the same way. Empty data does not always mean “no problem.”

---

### 8. React

**Purpose:** UI main-thread stress — **long tasks** (browser was busy and felt janky) and render sampling counts.

**How to use it:** If Firestore is fast but the UI still feels laggy, check long tasks on that device/day.

---

### 9. Performance

**Purpose:** Aggregate trends for the filter range: average / P95 load, memory, Firestore latency, snapshot latency, React long tasks, interactive time — often with small sparklines and a detail table.

**How to use it:** “Are we getting better or worse this week?” — compare sparklines, not a single number.

---

### 10. Timeline

**Purpose:** Flight log of **individual page loads** (and mixed events: errors, reconnects, timeouts).

**Performance timeline table (main)**

| Column | Meaning |
|--------|---------|
| **Time** | When the load happened |
| **Load ID** | Click to copy; match with Components |
| **Device / Department / Page / Build** | Where and what |
| **Total Load** | End-to-end load time |
| **React Mount** | Time to React mount |
| **First Query / First Snapshot** | Time until first Firestore data (often the critical stage) |
| **Table Render** | Not fully instrumented (often “—”) |
| **Interactive / Ready** | When UI became usable / total ready |
| **Status** | ok / slow / hung / critical |

Click a row to expand a **waterfall** of stages.

**Toolbar:** filter by page and event kind; export CSV.

**How to use it**

1. Filter to the complaining department or device.  
2. Sort by Total Load or look for **HUNG**.  
3. Copy Load ID → open **Components** and find the same ID.

---

### 11. Components

**Purpose:** For one page open (one Load ID), which **UI pieces** mounted, how long they took, and which never opened (“Not Mounted” — e.g. a tab nobody clicked).

**How to use it:** Diagnose “page is slow” into “Filters OK, Charts slow” or “Alerts Table never got a snapshot.”

---

### 12. Network

**Purpose:** Connectivity symptoms: hung loads, waiting listeners, retries, listener timeouts, offline/online style daily stats.

**How to use it:** If many hung loads appear only on certain devices or rooms, suspect Wi‑Fi / network before blaming a code deploy.

---

### 13. Errors

**Purpose:** Client-side error messages recorded by telemetry (source, message, counts, dept, device).

**How to use it:** Pair with Timeline timestamps. A burst of errors after a deploy is a strong signal.

---

### 14. Builds

**Purpose:** Which software builds were seen, how often, platform/browser, first day seen — useful for “before vs after release.”

**How to use it:** Set Global filter **Build** to the new deploy and compare Health / Performance / Timeline to the previous build.

---

### 15. Settings

**Purpose:** Engineering ops settings (telemetry on/off concepts, ops gate / PIN allowlist in Engineering Firebase). Not a clinical settings screen.

---

### 16. Audit

**Purpose:** Log of engineering-ops style actions (who did what), when present.

---

## Common situations (cheat sheet)

| What staff say | Where to look first | What you hope to see |
|----------------|---------------------|----------------------|
| “Biochem is hanging on iPad” | Health → Network / Listeners → Timeline (Hung) → that Device | Waiting listeners, hung loads, timeouts; same device repeatedly |
| “Owner is slow after update” | Builds → filter new Build → Departments (Owner) → Performance | Higher avg/P95 vs previous build |
| “One PC is bad, others fine” | Devices | That device slower / more waiting / more errors |
| “Table empty forever” | Timeline status **hung**, first snapshot **—** | Listener / network issue, not “slow chart” |
| “Page opens but charts lag” | Timeline ok but high Interactive; Components / React | Mounted Charts slow; long tasks |
| “Numbers look empty” | Filters, Refresh, retention, Eng write banner | Wrong day; telemetry quota; page never opened |

---

## Export PDF — what you get

**Export PDF** (global filter bar) builds **“Mango Engineering Report”** using the **same filters** you have selected.

Typical sections:

1. Cover (range, department, device, build)  
2. Fleet Health  
3. Devices  
4. Departments  
5. Firestore (daily)  
6. Firestore by Component (+ sample loads)  
7. Listeners (daily)  
8. Memory  
9. React  
10. Performance · Page loads  
11. Components  
12. Network  
13. Errors (+ Alerts)  
14. Builds  
15. Audit  

Use the PDF when you want a frozen snapshot for a meeting, a ticket, or to paste into an AI chat together with the **AI Diagnosis Guide**.

---

## Important limitations (so you are not misled)

1. **Observer only** — it does not prove clinical correctness; it measures client performance and telemetry.  
2. **Missing data ≠ healthy** — if Engineering writes are blocked (quota), Timeline freezes on old data. Watch for a red write-health banner.  
3. **Sample caps** — tables often show the latest N samples (hundreds), not every load forever.  
4. **Not Mounted** on Components can be normal (tab never opened).  
5. **Active listeners “fleet” sum** can include stale device heartbeats until those devices go offline.  
6. Some stages (e.g. Table Render) are intentionally **not instrumented** yet.

---

## One-minute daily checklist

1. Open Engineering → set date to **Today** (or **Yesterday** for a morning review).  
2. **Health**: score, hung loads, waiting listeners, errors.  
3. If anything is off → **Devices** (who?) → **Timeline** (hung/slow?) → **Listeners** / **Errors**.  
4. After a deploy → **Builds** + compare **Departments** / **Performance**.  
5. Optional: **Export PDF** and archive or send for analysis.

---

*This guide matches the Mango Engineering dashboard tabs and Export PDF structure. For automated diagnosis language, see `Eng_Dashboard_AI_Diagnosis_Guide.md`.*
