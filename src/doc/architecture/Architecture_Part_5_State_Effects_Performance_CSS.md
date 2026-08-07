# Mango LIMS Architecture — Part 5: State, Effects, Performance, CSS, Engineering Notes

[← Part 4](./Architecture_Part_4_Flows_Firebase_Listeners.md) · [Index](./README.md)

---

## SECTION 9 — Filter System

### 9.1 Register filters (bench UIs)

| Control | Hook / component | Default | Where applied |
|---------|------------------|---------|---------------|
| Registration search | `useRegisterFilters` → `regSearch` | `""` | Client filter on regNo / diagnosticNo (page-specific) |
| Date from / to | `dateFrom`, `dateTo` | Today (local date string) | **Drives Firestore query bounds** via hooks |
| Source filter | `sourceFilter` | `"All"` | **Client-side** compare to entry.source (normalized) |
| UI | `RegisterFilterBar.jsx` | — | Controlled inputs |

Date helpers: `localDayStart` / `localDayEndExclusive` / IST variants in `shared/utils/dates.js`.

### 9.2 Owner filters

| Control | Location | Firestore impact |
|---------|----------|------------------|
| Date range | `OwnerContext.dateRange` via `DateSourceFilter` | Recreates scoped listeners (query changes) |
| Source | `OwnerContext.source` | **Client filter in publish()**; does not appear in Firestore `where` |
| Chart/search boxes | Per Owner page local state | Client only |
| Lab/register tabs (Outsource/Lab Owner) | Local `activeReg` | Client canon test sets; listeners still day-scoped master+tracking |

### 9.3 Validator filters

| Control | Application |
|---------|-------------|
| Main/sub/backroom/blood tabs | Select **which collection** is listened |
| dateFrom/dateTo | Firestore timePrinted range |
| searchTerm | Client filter on loaded rows |

### 9.4 Inventory / ICC filters

| Control | Application |
|---------|-------------|
| ICC fromDate/toDate | History listeners (Consumed/QC/Ledger) |
| ICC activeTab | Which listeners attach |
| Machine / search in tabs | Client filter on `inventoryLogs` / ledger rows |
| DeptInventory Biochem vs Hormones sub-tab | Client categorization of VITROS reagents |

### 9.5 Master Admin filters

| Control | Application |
|---------|-------------|
| Collection tabs | Which full collection is listened |
| dateFrom/dateTo/source/search | **Client-only** on already-downloaded docs |

### 9.6 Search algorithms (observed)

- **Registration test search:** substring match over flattened `test_mapping` tests.
- **Register tables:** typically case-insensitive includes on regNo / diagnosticNo / name fields.
- **Owner chart search:** trim + lower-case includes on row fields.
- **No server-side full-text search** is implemented.

### 9.7 Sort

- Firestore: commonly `orderBy("timePrinted", "asc")` or `desc` for history.
- ICC consumed: `orderBy("consumedAt", "desc")`.
- Client sorts: urgent-first / date parse sorts on some register tables.

---

## SECTION 10 — State Management

### 10.1 React Context

| Context | File | State | Consumers |
|---------|------|-------|-----------|
| `OwnerContext` | `owner/OwnerContext.jsx` | `dateRange {from,to}`, `source`, setters | Owner pages, Inventory Intake, Command Center, Master Admin, Analytics wrappers |

No other global React contexts for clinical data.

### 10.2 Props

- Deep prop drilling is limited; pages own data and pass arrays into charts/tables/modals.
- Inventory tabs generally take few/no props (machine lists are internal constants).

### 10.3 Local state

- Ubiquitous `useState` for tabs, modals, selections, loaded rows, KPIs.
- `useRef` for form fields (registration), subscription handles (some patterns), focus indices.

### 10.4 Persisted client state

| Mechanism | Hook / API | Examples |
|-----------|------------|----------|
| localStorage object | `usePersistedObjectState` | `biochem_localScans`, `hormones_localScans`, haem/bloodgroup scan drafts, pending criticals |
| sessionStorage | Auth + perf | `loggedUser`, `loginMode`, performance live detail |
| Session query cache | `sessionQueryCache` | Owner paint, ICC history tabs |
| Static config cache | `staticConfigCache` | `inventory_adjustments:{testName}` |

### 10.5 Derived state

- `useMemo` for patient lists, filtered rows, chart series, KPI regroupings (especially Owner + ICC Cost).
- Incremental doc stores derive ordered arrays from snapshot diffs.

### 10.6 Callbacks

- `useCallback` is **not** a dominant pattern in this codebase; handlers are often inline or plain functions.
- Owner `onData` closures update page state from fetchers.

---

## SECTION 11 — useEffect Audit

A machine extraction of `useEffect` call sites and dependency arrays is stored in [`_useeffects.txt`](./_useeffects.txt) (file path, approx line, deps).

### 11.1 Categories of effects

| Category | Purpose | Typical deps | Cleanup |
|----------|---------|--------------|---------|
| **Firestore subscribe** | Start onSnapshot | dates, collection, tab flags | `return unsub` |
| **Auth gate** | `requireLogin()` on mount | `[]` | none |
| **Persist sync** | Write localStorage when state changes | `[storageKey, state]` | none |
| **UI sync** | Reset staff/delay tabs when BG mode changes | `[mode, …]` | none |
| **One-shot fetch** | `fetchTestTimings()` alongside subscribe | with subscribe effect | none for promise |
| **Perf bootstrap** | Enable collectors | module load / mount | store-specific |

### 11.2 High-risk effect patterns (descriptive, not prescriptive)

| Pattern | Where observed | Risk nature |
|---------|----------------|-------------|
| Full-collection subscribe | MasterAdmin | Large initial + reconnect reads |
| display:none keep-alive children | BiochemistryMain | Hidden listeners stay active |
| Dual BG register subscribe | BloodGroupRegister | Extra day query while on one UI mode |
| Owner `[source, dateRange]` | Owner* pages | Source change recreates identical Firestore queries |
| Parent + child inventory subscribe | Haematology inventory | Overlapping machine listeners |
| StrictMode double mount | All StrictMode entries | Dev-only double subscribe |

### 11.3 Representative effect specs

| Location | Purpose | Deps | Starts | Stops |
|----------|---------|------|--------|-------|
| `useMasterDeptSnapshots` | Triad live data | dept + dates | 3 listeners | unsub ×3 + store clear |
| `ValidatorDashboard` | Active register | collection + dates | 1 listener | unsub |
| `InventoryCommandCenter` live | Live stock | `needsLive` | 1 live query | unsub when false |
| `InventoryCommandCenter` ledger | Ledger history | `needsLedger`, dates | 1 ledger query | unsub |
| `OwnerBiochem` | Analytics stream | `source`, `dateRange` | 2 listeners via fetcher | unsub |
| `InventoryIntake` | Recent logs | `[]` | 2 limited listeners | unsub |
| `InventoryAdjustmentTab` | Adjustments map | `[]` | full collection listen | unsub |
| `Haematology` inventory | Preload machines | `activeTab` | multi-machine listen when inventory | unsub |

---

## SECTION 12 — Performance Map (factual hotspots)

This section maps **where work happens**, without proposing fixes.

### 12.1 Firestore read concentration

| Area | Behaviour |
|------|-----------|
| MasterAdmin | Full collection snapshot per active tab |
| Dept triad hooks | 3 day-scoped listeners per open register |
| Owner pages | 2 day-scoped listeners (master + dept) or 1 (`report_details`) |
| inventorymapping | Activated getDocs (name-scoped with full fallback) per deduction |
| ICC Cost | Live inventory + day ledger simultaneously |
| Biochem page | Hidden Hormones + inventory + adjustments listeners while on biochem tab |
| Overnight open tabs | Listeners remain; reconnect may reseed |

### 12.2 Firestore write concentration

| Area | Behaviour |
|------|-----------|
| Registration | setDoc master + report_details |
| Dept save | setDoc register + updateDoc report_details + optional critical |
| Deduction | batch updates inventory_logs + addDoc ledger(s) |
| Validator | batch/update register + report_details |
| Inventory QC/Cal/Waste | multiple collection writes |
| perf_daily | merge setDoc rollups |

### 12.3 Heavy rendering / computation

| Area | Behaviour |
|------|-----------|
| Owner charts | Recharts / FullCalendar TimeBricks; large unified row maps |
| ICC CostAnalyticsTab | Nested grouping + inventory packet cost joins |
| Dept tables | Map/filter over day census |
| MasterAdmin | Render filtered subset of entire collection in memory |
| Registration | Search over full test catalog |

### 12.4 Large in-memory structures

- Full `testToReagentMap` in `inventorymapping.js`
- Owner fetcher caches (`masterRows`, `biochemRows`, …) for the subscribed day
- MasterAdmin `entries` array for active collection
- Session/local performance stores

---

## SECTION 13 — Import Graph

### 13.1 Entry hubs

```
HTML → main_*.jsx → Page root
                 ↘ optional OwnerProvider
```

### 13.2 Shared spine (highest fan-in)

```
firebaseConfig.js
    ↑
trackedFirestore.js ← performanceCollector (optional)
    ↑
scopedTimePrintedQuery / useMasterDeptSnapshots / Owner dataFetchers / pages
```

```
dates.js ← nearly all time-bounded features
OwnerContext.jsx ← all Owner + several ops pages
inventorymapping.js ← dept save paths
```

### 13.3 Circular dependencies

Static relative-import resolution in this audit did **not** surface an obvious hard cycle among application modules. Performance modules import store/collector; `trackedFirestore` imports performance optionally — direction is firestore→performance metrics, not a clinical data cycle.

### 13.4 Duplicate / legacy files (coexist)

| Pair / set | Notes |
|------------|-------|
| `MasterAdmin.jsx` / `MasterAdmin1.jsx` | Parallel admin implementations |
| `MasterView_Table.jsx` / `MasterView_Table1.jsx` | Parallel table views |
| `main_owner_bloodgroup.jsx` / `main_owner_blood_group.jsx` | Alternate bootstraps |
| `Authguard.js` filename | Imported as `Authguard.js` |
| `InventoryCommandCentre.jsx` vs `inventory-command-center/` | Naming variant; Command Center HTML uses the latter package |

---

## SECTION 14 — CSS Architecture

### 14.1 Global / entry styling

- `mango.css` — registration hub global styles.
- Many HTML shells inject **Tailwind CDN** + inline `body`/`#root` styles (e.g. `index_haem.html`).
- Per-page CSS imports beside major components.

### 14.2 Component CSS files (examples)

| File | Scope |
|------|-------|
| `haem/Haematology.css` | Haem page |
| `biochem_main/BiochemistryMain.css` | Biochem + Hormones (shared import) |
| `coagulation/CoagulationMain.css` | Coag |
| `backroom/Backroom.css` | Backroom shell |
| `ValidatorUI/ValidatorDashboard.css` | Validator |
| `owner/OwnerUI.css` | Owner analytics |
| `inventory/DeptInventory.css` / `InventoryIntake.css` | Inventory |
| `inventory-command-center/commandcenter.css` | ICC |
| `critical/CriticalDashboard.css` | Critical |
| `analytics/css/LabAnalytics.css` (+ `LabAnalytics1.css`) | Analytics |
| `performance/Performance.css` | Perf dashboard |
| `auth/LoginPage.css` | Login |
| `owner/charts/TimeBricks.css` / `TimeBricksOutsource.css` | Timeline charts |

### 14.3 Shared styling approach

- No CSS Modules / styled-components system observed.
- Class names are global strings (e.g. `dept-table`, `tab-btn`, `owner-root`).
- Tailwind utility classes appear where CDN is loaded.

### 14.4 Conflict potential (descriptive)

- Global class names shared across biochem/haem CSS can collide if both style sheets ever load in one document (normally separate MPAs).
- Dual analytics CSS files (`LabAnalytics.css` / `LabAnalytics1.css`) indicate historical layering.
- Inline style objects are used heavily in Owner/ICC for one-off layout.

---

## SECTION 15 — Engineering Notes

### 15.1 Core architectural decisions (as implemented)

1. **MPA over SPA** — Isolate workstations; share code via imports, not a global router.
2. **Firestore as sole clinical SoT** — UI state is ephemeral except drafts in localStorage.
3. **Live listeners for registers** — Prefer continuous sync over request/response lists.
4. **Day-scoped queries** — IST/local calendar bounds on `timePrinted` / timestamps for operational UIs.
5. **Client-side source filtering** on Owner analytics.
6. **Static test→reagent map** in JS for inventory deduction.
7. **Composite business keys** — `regNo` + `diagnosticNo` via `compositeId`.
8. **report_details** as cross-department completion bus.
9. **Passive performance wrappers** around Firestore APIs.
10. **Simple session login** — not Firebase Auth.

### 15.2 Critical files (modify with extreme care)

| File | Why critical |
|------|----------------|
| `firebaseConfig.js` | App singleton + persistence |
| `shared/hooks/useMasterDeptSnapshots.js` | Data plane for most benches |
| `shared/firestore/scopedTimePrintedQuery.js` | Query shape for most day UIs |
| `inventory/inventorymapping.js` | Stock integrity + ledgers |
| `shared/utils/routineStageFlags.js` | Validator/report stage consistency |
| `shared/config/collections.js` | Collection/dept name contracts |
| `ValidatorUI/ValidatorDashboard.jsx` | Cross-dept clinical release path |
| `mango.jsx` | Creates master + report_details |
| `owner/lib/dataFetcher_*.js` | Owner KPI math |
| `owner/workflow/workflowfetcher.js` | Workflow analytics |

### 15.3 Complex files (high local complexity)

- `inventory/inventorymapping.js` — large static map + deduction engine  
- `inventory/DeptInventoryTab.jsx` — QC/Cal/Waste/activate UI + writes  
- `owner/lib/dataFetcher_*.js` — merge/KPI/SLA/staff pipelines  
- `owner/workflow/workflowfetcher.js` — workflow classification  
- `ValidatorUI/ValidatorDashboard.jsx` — multi-tab collection switching + cascades  
- `biochem_main/BiochemistryMain.jsx` — multi-tab keep-alive composition  
- `inventory-command-center/tabs/CostAnalyticsTab.jsx` — cost join logic  
- `mango.jsx` — registration form + mapping search  

### 15.4 Reusable utilities (stable contracts)

- `compositeId`, `getTestName`, `normalizeSource`, date bound helpers  
- `RegisterFilterBar`, `CriticalAlertModal`  
- `tracked*` Firestore wrappers  
- `subscribeInventoryByMachines` + `INVENTORY_MACHINES`  
- Owner chart/KPI component family  

### 15.5 Empty / unused / legacy observations

- `src/biochem_backup/` directory has **no source files**.  
- `MasterAdmin1`, `MasterView_Table1`, alternate bloodgroup main — legacy siblings.  
- HormonesMain imports `DeptInventoryTab` but does not render it (inventory lives on BiochemistryMain).  

### 15.6 Auth note for maintainers

Credentials live in `src/auth/users.js` as a static array checked by `LoginPage`. Session identity is `sessionStorage.loggedUser`. This is a deliberate simple gate for an internal network tool as implemented.

### 15.7 Documentation maintenance

When adding a page:

1. Add HTML + Vite input + `main_*.jsx`.  
2. Update Part 1 entry map.  
3. Re-run inventory script or update Part 2.  
4. Document collections/listeners in Part 4.  

Companion generators used for this audit:

- `src/doc/architecture/_inventory.json`  
- `src/doc/architecture/_meta.json`  
- `src/doc/architecture/_useeffects.txt`  

---

## End of Architecture Series

Return to the [Index (README)](./README.md) for navigation across all parts.
