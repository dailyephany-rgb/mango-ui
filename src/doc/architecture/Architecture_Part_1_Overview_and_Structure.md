# Mango LIMS Architecture — Part 1: Overview & Structure

[← Index](./README.md) · [Part 2: File Inventory →](./Architecture_Part_2_File_Inventory.md)

---

## SECTION 1 — Project Overview

### 1.1 Purpose of the application

Mango is an **internal laboratory information management UI** for a clinical diagnostic laboratory. It supports:

1. **Patient registration** — capture demographics, source/category, selected tests; write `master_register` and seed `report_details`.
2. **Departmental bench work** — Haematology, Biochemistry, Hormones, Coagulation, Backroom (ESR, Blood Group, Serology, Rapid Card, Urine), Inside Lab, Outsource, Backup analyzers.
3. **Validation** — Validator dashboard validates/entered/printed stage flags across department registers and `report_details`.
4. **Inventory** — Intake, per-machine live stock, QC/calibration/waste, Vitros analyzer routing adjustments, automatic test→reagent deduction on save, Command Center analytics.
5. **Owner analytics** — Per-department KPI / SLA / staff / timeline views plus cross-workflow Owner home.
6. **Ops tools** — Master Admin cross-collection editor, Critical Alerts dashboard, Lab Analytics counts, Performance & Diagnostics telemetry.

### 1.2 Major modules

| Module | Location | Role |
|--------|----------|------|
| Registration hub | `src/mango.jsx`, `src/master/*`, `src/master_register_2/*` | Data entry + master views |
| Auth | `src/auth/*` | Login + session gate + user menu |
| Clinical registers | `haem`, `biochem_main`, `coagulation`, `backroom`, `inside_lab`, `outsource`, `backup` | Day-of work |
| Validator | `src/ValidatorUI/*` | Cross-dept validation |
| Critical | `src/critical/*` | Critical alert queue |
| Inventory ops | `src/inventory/*` | Intake, tabs, mapping, adjustments |
| Inventory Command Center | `src/inventory-command-center/*` | Live stock / ledger / cost / QC |
| Owner analytics | `src/owner/*` | KPIs and charts |
| Master Admin | `src/master_admin/*` | Full-collection admin console |
| Analytics | `src/analytics/*` | Lab count analytics |
| Performance | `src/performance/*` | Client telemetry + `perf_daily` |
| Shared platform | `src/shared/*` | Hooks, Firestore helpers, cache, utils |
| Firebase bootstrap | `src/firebaseConfig.js` | App + Firestore + persistent cache |

### 1.3 Overall architecture

```
Browser (separate HTML per workstation)
        │
        ▼
Vite MPA entry (main_*.jsx)
        │
        ▼
React 19 root (often StrictMode)
        │
        ├── Optional OwnerProvider (dateRange + source)
        │
        ▼
Page component tree
        │
        ├── Local React state + localStorage drafts (usePersistedObjectState)
        ├── Shared hooks (useMasterDeptSnapshots, useScopedMasterEntries, …)
        └── trackedOnSnapshot / trackedGetDoc(s) ──► Firestore (vasundhara-4c6e5)
```

**Not present:** Redux, React Query, service workers for data, Firebase Auth for clinical login, a single SPA router for the whole lab.

**Present:** React Router is a dependency (`package.json`) but primary navigation between lab stations is **separate HTML documents**, not in-app routes.

### 1.4 React architecture

- **Component model:** Function components + hooks.
- **Composition:** Department pages compose filter bars, tables, modals, optional inventory tabs.
- **Data loading pattern:** Prefer **live listeners** for registers; one-shot `getDoc`/`getDocs` for saves, Vitros adjustments, deduction.
- **StrictMode:** Most `main_*.jsx` wrap roots in `<React.StrictMode>` (double-mount in development).
- **Context:** Essentially one product context — `OwnerContext` (`dateRange`, `source`) used by Owner pages, Inventory Intake, Command Center, Master Admin, Analytics wrappers.

### 1.5 Firebase architecture

- **SDK:** `firebase` ^12.4.0  
- **Init:** `src/firebaseConfig.js` — single app; `initializeFirestore` with `persistentLocalCache` + `persistentMultipleTabManager` (falls back to `getFirestore`).  
- **Project ID:** `vasundhara-4c6e5` (from config).  
- **Access pattern:** Client SDK from the browser (no Cloud Functions in this repo).  
- **Tracking wrapper:** `trackedOnSnapshot` / `trackedGetDocs` / `trackedGetDoc` in `shared/firestore/trackedFirestore.js` — behaviour-identical to Firebase APIs when performance monitor disabled; records metrics when enabled.  
- **Query helpers:**  
  - `scopedTimePrintedQuery(collection, dateRange)` — IST day bounds on `timePrinted`  
  - `scopedTimestampRangeQuery(collection, field, dateRange)` — generic timestamp range  
  - `subscribeInventoryByMachines(machineNames, onData)` — live stock per `machineName`  
- **Indexes (repo):** `firestore.indexes.json` — composite indexes for `master_register` (departments + timePrinted), `critical_alerts` (dept + flaggedAt), `inventory_logs` (machine+status, status+consumedAt, status+reagentName), `backup_entries_logs` (status+savedTime).

### 1.6 Folder architecture (why folders exist)

| Folder | Why it exists |
|--------|----------------|
| `src/` root | Entry bootstraps (`main_*.jsx`), registration (`mango.jsx`), global CSS, routing JSON, Firebase config |
| `auth/` | Login UI, static users, requireLogin gate, UserMenu |
| `haem/` | Haematology register page |
| `biochem_main/` | Biochemistry + nested Hormones UI |
| `biochem_backup/` | Empty placeholder directory (no source files); backup biochem lives under Validator collections + `backup/` UI |
| `coagulation/` | Coagulation register |
| `backroom/` | Tab shell + ESR / Blood Group / Serology / Rapid / Urine registers |
| `inside_lab/` | Inside-lab (FNAC/Pathology/Culture/Fluid-style) workflow |
| `outsource/` | External lab tracking UI |
| `backup/` | Backup analyzer entry log UI |
| `ValidatorUI/` | Validation dashboard + table + config |
| `critical/` | Critical alerts dashboard |
| `master/` | Master register table view |
| `master_register_2/` | Master “rectangle/card” view + its own `main.jsx` |
| `master_admin/` | Cross-collection admin editor |
| `inventory/` | Intake, mapping, machine tabs, adjustments |
| `inventory-command-center/` | Owner-facing inventory analytics |
| `owner/` | Owner analytics pages, charts, fetchers, workflow |
| `analytics/` | Lab analytics page |
| `performance/` | Perf monitor store, collectors, dashboard, `perf_daily` |
| `shared/` | Cross-cutting hooks, Firestore, cache, utils, shared UI |
| `doc/` | Engineering artifacts (counts JSON, this architecture set) |

---

## SECTION 2 — Full Folder Structure

```
src/
├── main.jsx, main_*.jsx          # Vite bootstraps (one per HTML entry)
├── mango.jsx / mango1.jsx        # Registration UIs
├── mango.css
├── firebaseConfig.js
├── test_mapping.json             # Dept → tests for registration
├── biochem_testRouting.json
├── hormone_testRouting.json
├── coag_testRouting.json
├── backroom_routing.json
├── inside_room_routing.json
├── Outsource.json
├── auth/
├── haem/
├── biochem_main/
├── biochem_backup/               # empty
├── coagulation/
├── backroom/
├── inside_lab/
├── outsource/
├── backup/
├── ValidatorUI/
├── critical/
├── master/
├── master_register_2/
├── master_admin/
├── inventory/
├── inventory-command-center/
│   ├── components/
│   ├── config/
│   ├── tabs/
│   └── utils/
├── owner/
│   ├── charts/
│   ├── components/
│   ├── data/
│   ├── lib/
│   └── workflow/
├── analytics/
│   └── css/
├── performance/
├── shared/
│   ├── cache/
│   ├── components/
│   ├── config/
│   ├── firestore/
│   ├── hooks/
│   └── utils/
└── doc/
    └── architecture/             # This documentation set
```

Root HTML files (28) live at **repo root**, not under `src/`. Each loads a `/src/main_*.jsx` module (see entry map below).

---

## Vite MPA Entry Map

Configured in `vite.config.js` `build.rollupOptions.input`.

| Vite key | HTML file | Bootstrap | Primary UI |
|----------|-----------|-----------|------------|
| `main` | `index.html` | `src/main.jsx` | Registration + Master Table + Master Rectangle (tab switcher) |
| `login` | `login.html` | `src/main_login.jsx` | `LoginPage` |
| `haem` | `index_haem.html` | `src/main_haem.jsx` | `Haematology` |
| `biochem` | `index_biochem.html` | `src/main_biochem.jsx` | `BiochemistryMain` |
| `coag` | `index_coag.html` | `src/main_coag.jsx` | `CoagulationMain` |
| `backroom` | `index_backroom.html` | `src/main_backroom.jsx` | `BackroomMain` |
| `validator` | `index_validator.html` | `src/main_validator.jsx` | `ValidatorDashboard` |
| `inside_lab` | `index_inside_lab.html` | `src/main_inside_lab.jsx` | `InsideLab` |
| `outsource` | `index_outsource.html` | `src/main_outsource.jsx` | `Outsource` |
| `backup` | `index_backup.html` | `src/main_backup.jsx` | `BackupEntry` |
| `critical` | `Critical.html` | `src/main_critical.jsx` | `CriticalAlertDashboard` |
| `inventory` | `inventory.html` | `src/main_inventory.jsx` | `OwnerProvider` → `InventoryIntake` |
| `commandcenter` | `commandcenter.html` | `src/main_commandcenter.jsx` | `OwnerProvider` → `InventoryCommandCenter` |
| `master_admin` | `master_admin.html` | `src/main_master_admin.jsx` | `OwnerProvider` → `MasterAdmin` |
| `counts` | `analytics.html` | `src/main_analytics.jsx` | `OwnerProvider` → `LabAnalytics` |
| `performance` | `performance.html` | `src/main_performance.jsx` | `PerformanceDashboard` |
| `owner` | `index_owner.html` | `src/main_owner.jsx` | `OwnerProvider` → `OwnerApp` |
| `owner_biochem` | `owner_biochem.html` | `src/main_owner_biochem.jsx` | `OwnerBiochem` |
| `owner_hormones` | `owner_hormones.html` | `src/main_owner_hormones.jsx` | `OwnerHormones` |
| `owner_haem` | `index_owner_haem.html` | `src/main_owner_haem.jsx` | `OwnerHaemPage` |
| `owner_coag` | `index_owner_coag.html` | `src/main_owner_coag.jsx` | `OwnerCoag` |
| `owner_urine` | `index_owner_urine.html` | `src/main_owner_urine.jsx` | `OwnerUrine` |
| `owner_esr` | `owner_esr.html` | `src/main_owner_esr.jsx` | `OwnerESRPage` |
| `owner_serology` | `owner_serology.html` | `src/main_owner_serology.jsx` | `OwnerSerology` |
| `owner_rapid` | `owner_rapid.html` | `src/main_owner_rapid.jsx` | `OwnerRapidPage` |
| `owner_bloodgroup` | `owner_bloodgroup.html` | `src/main_owner_bloodgroup.jsx` | `OwnerBloodGroup` |
| `owner_outsource` | `owner_outsource.html` | `src/main_owner_outsource.jsx` | `OwnerOutsourcePage` |
| `owner_inside_lab` | `owner_lab.html` | `src/main_owner_lab.jsx` | `OwnerLabPage` |

**Note:** `src/main_owner_blood_group.jsx` also exists (alternate bootstrap spelling) alongside `main_owner_bloodgroup.jsx`.

**Note:** `master_register_2/main.jsx` exists as an alternate bootstrap for the rectangle view.

---

## Routing / Config JSON (src root)

| File | Role |
|------|------|
| `test_mapping.json` | Registration: department labels → test name lists |
| `biochem_testRouting.json` | Biochem MainAnalyzer test list + routing metadata |
| `hormone_testRouting.json` | Hormones MainAnalyzer tests |
| `coag_testRouting.json` | Coagulation tests |
| `backroom_routing.json` | Backroom test routing |
| `inside_room_routing.json` | Inside-lab register → tests (Owner Lab + InsideLab) |
| `Outsource.json` | External lab → outsourced tests (Outsource UI + Owner Outsource) |
| `analytics/testRoutingMap.json` | Analytics routing map |
| `owner/data/test_timings.json` | SLA timing thresholds for Owner delay calculations |
| `inventory/reagents.json` | Reagent reference data for inventory UIs |

---

## Shared Layer Map (`src/shared`)

| Path | Responsibility |
|------|----------------|
| `config/collections.js` | Validator collections, completion field map, routine dept names, Master Admin dept list, `PERF_DAILY_COLLECTION` |
| `firestore/trackedFirestore.js` | Metrics-aware Firestore wrappers |
| `firestore/scopedTimePrintedQuery.js` | Day-scoped `timePrinted` queries |
| `firestore/scopedTimestampRangeQuery.js` | Day-scoped arbitrary timestamp field |
| `firestore/subscribeInventoryByMachines.js` | Live inventory by machine + `INVENTORY_MACHINES` / `INVENTORY_LIVE_STATUSES` |
| `firestore/incrementalDocStore.js` | Incremental `docChanges` store for listeners |
| `hooks/useMasterDeptSnapshots.js` | master + dept + critical_alerts triad |
| `hooks/useScopedMasterEntries.js` | Scoped master_register only |
| `hooks/useMasterRegisterSnapshots.js` | Master register snapshot helper |
| `hooks/useRegisterFilters.js` | regSearch / dateFrom / dateTo / sourceFilter |
| `hooks/usePersistedObjectState.js` | localStorage-backed object state |
| `cache/sessionQueryCache.js` | Session TTL cache |
| `cache/staticConfigCache.js` | Long-TTL static config (e.g. inventory_adjustments) |
| `cache/createOwnerSessionPaint.js` | Owner subscribe paint-from-cache then live |
| `components/RegisterFilterBar.jsx` | Shared filter UI |
| `components/CriticalAlertModal.jsx` | Critical report modal |
| `utils/dates.js` | IST/local day bounds, parsing, minute diffs |
| `utils/ids.js` | `compositeId` |
| `utils/tests.js` | `getTestName` |
| `utils/source.js` | `normalizeSource` |
| `utils/normalizeTestsField.js` / `Upper.js` | Test array normalization |
| `utils/routineStageFlags.js` | Cascade helpers for routine report stage flags |

---

Continue to [Part 2 — File Inventory](./Architecture_Part_2_File_Inventory.md).
