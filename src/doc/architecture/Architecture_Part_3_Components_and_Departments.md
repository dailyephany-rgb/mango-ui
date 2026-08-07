# Mango LIMS Architecture — Part 3: Components & Departments

[← Part 1](./Architecture_Part_1_Overview_and_Structure.md) · [Index](./README.md) · [Part 4 →](./Architecture_Part_4_Flows_Firebase_Listeners.md)

---

## SECTION 4 — Complete Component Map

### 4.1 Top-level dependency trees (by workstation)

#### Registration hub (`index.html` → `main.jsx`)

```
App (main.jsx)
├── Mango (mango.jsx)                    # Data entry
│   ├── UserMenu
│   └── Firebase: master_register, report_details (getDoc/setDoc)
├── MasterView_Table                     # Master register table
│   └── onSnapshot master_register (day)
└── MasterView_Rectangle                 # Card/rectangle view
    ├── cascadeRoutineStages utils
    └── onSnapshot report_details (day)
```

#### Haematology

```
Haematology
├── requireLogin / UserMenu
├── useRegisterFilters + RegisterFilterBar
├── useMasterDeptSnapshots
│   ├── master_register (Haematology)
│   ├── haematology_register
│   └── critical_alerts (Haematology)
├── CriticalAlertModal
├── HaemInventoryTab (when inventory tab)
│   └── subscribeInventoryByMachines(3-part | 5-part)
├── Parent also subscribeInventoryByMachines(haem3+haem5) when inventory tab
└── handleInventoryDeduction (inventorymapping)
```

#### Biochemistry / Hormones

```
BiochemistryMain
├── useMasterDeptSnapshots (Bio-Chemistry / biochemistry_register)
├── RegisterFilterBar / CriticalAlertModal / UserMenu
├── handleInventoryDeduction + getVitrosDeductibleTests
├── [display:none keep-alive]
│   ├── HormonesMain
│   │   └── useMasterDeptSnapshots (Hormones / hormones_main)
│   ├── DeptInventoryTab → VITROS 6500 live
│   └── InventoryAdjustmentTab → inventory_adjustments
```

#### Coagulation

```
CoagulationMain
├── useMasterDeptSnapshots (Coagulation)
├── CoagulationInventoryTab (conditional mount pattern)
└── handleInventoryDeduction
```

#### Backroom

```
BackroomMain (switch mount — one child at a time)
├── ESRRegister → useMasterDeptSnapshots (ESR)
├── BloodGroupRegister
│   ├── useScopedMasterEntries (Blood-Group)
│   ├── onSnapshot bloodgroup_testing_register
│   └── onSnapshot bloodgroup_retesting_register
├── SerologyRegister → useMasterDeptSnapshots + inventory deduction
├── RapidCardRegister → useMasterDeptSnapshots + inventory deduction
├── UrineAnalysisRegister → useMasterDeptSnapshots + inventory deduction
└── BackroomInventoryTab → machines Backroom + Urine
```

#### Validator

```
ValidatorDashboard
├── getActiveCollection(tab state) → one dept register
├── onSnapshot(activeCollection, timePrinted day)
├── ValidatorTable
├── getDoc / updateDoc / writeBatch → register + report_details
└── reportDetailsStageCascadeFields
```

#### Owner home

```
OwnerProvider
└── OwnerApp
    ├── DateSourceFilter
    ├── subscribeToWorkflowAnalytics → report_details day
    ├── WorkflowKPIBlocks / WorkflowStackedBars / WorkflowStaffDistribution
```

#### Owner department page (pattern)

```
OwnerProvider
└── Owner{Dept}
    ├── DateSourceFilter
    ├── subscribeOverview (dataFetcher_*)
    │   ├── master_register day
    │   └── {dept}_register day
    │   └── client filter source + compute KPIs/SLA/staff
    └── charts/* + components/* (KPIBlocks, DelayTable, TimeBricks, …)
```

#### Inventory Command Center

```
OwnerProvider
└── InventoryCommandCenter
    ├── Live listener (Inventory|Expiry|Cost): inventory_logs live statuses
    ├── Consumed tab: Consumed + consumedAt range
    ├── QC tab: qc_logs + calibration_logs
    ├── Ledger|Cost: consumption_ledger
    ├── Ledger only: combo_consumption_ledger
    └── tabs/* (Live, Expiry, QC, Ledger, Cost, Consumed)
```

#### Auth

```
LoginPage → users.js → sessionStorage loggedUser / loginMode
requireLogin() → redirect /login.html if missing
UserMenu → logout clears session
```

### 4.2 Most-imported shared nodes (from static analysis)

| Imports | File |
|--------:|------|
| 50 | `src/firebaseConfig.js` |
| 36 | `src/shared/utils/dates.js` |
| 34 | `src/shared/firestore/trackedFirestore.js` |
| 30 | `src/owner/OwnerContext.jsx` |
| 13 | `scopedTimePrintedQuery.js` / `createOwnerSessionPaint.js` / `withOwnerSourceControl.js` |
| 12 | `DateSourceFilter.jsx` / `useRegisterFilters.js` |
| 10 | `RegisterFilterBar` / `usePersistedObjectState` |
| 9 | `inventorymapping.js` / `UserMenu.jsx` |

---

## SECTION 5 — Department Documentation

### 5.1 Haematology

| Item | Detail |
|------|--------|
| **Purpose** | Bench UI for haematology tests; 3-part vs 5-part machine; scan/save; criticals; inventory |
| **Entry** | `index_haem.html` → `main_haem.jsx` → `haem/Haematology.jsx` |
| **CSS** | `Haematology.css` (+ Tailwind CDN in HTML) |
| **Context** | None (local filters) |
| **Firestore reads** | `master_register` (array-contains Haematology), `haematology_register`, `critical_alerts`; inventory via machines |
| **Firestore writes** | `haematology_register`, `report_details` stage flags, `critical_alerts`, inventory deduction path |
| **Inventory** | `HaemInventoryTab` + parent `subscribeInventoryByMachines` |
| **Lifecycle** | Mount → filters today → triad listeners → merge patients → user scan/save → optional inventory tab |
| **UI** | Tabs: register / inventory; filter bar; patient table; critical modal |

### 5.2 Biochemistry (Main Analyzer)

| Item | Detail |
|------|--------|
| **Purpose** | Vitros biochem bench register |
| **Entry** | `index_biochem.html` → `main_biochem.jsx` → `BiochemistryMain.jsx` |
| **Supporting** | `HormonesMain.jsx` (sibling tab, display:none keep-alive), `DeptInventoryTab`, `InventoryAdjustmentTab` |
| **Routing JSON** | `biochem_testRouting.json` |
| **Firestore** | master Bio-Chemistry + `biochemistry_register` + criticals; Vitros inventory; `inventory_adjustments` |
| **Deduction** | `getVitrosDeductibleTests` then `handleInventoryDeduction` with category GENERAL/RGHS/OTHER |
| **UI tabs** | biochem / hormones / inventory / inventory adjustment |
| **Note** | Parent `if (loading) return` gates entire page including hidden children until first biochem snapshot |

### 5.3 Hormones

| Item | Detail |
|------|--------|
| **Purpose** | Hormones main analyzer register (same HTML as biochem) |
| **Entry** | Nested under BiochemistryMain (not separate HTML) |
| **File** | `biochem_main/HormonesMain.jsx` |
| **Routing** | `hormone_testRouting.json` |
| **Firestore** | master Hormones + `hormones_main` + criticals |
| **Persisted keys** | `hormones_localScans`, `hormones_localScanTimes`, `hormones_pendingCritical` |
| **Owner page** | Separate `owner_hormones.html` → `OwnerHormones.jsx` |

### 5.4 Coagulation

| Item | Detail |
|------|--------|
| **Purpose** | Coagulation bench register |
| **Entry** | `index_coag.html` → `main_coag.jsx` → `CoagulationMain.jsx` |
| **Routing** | `coag_testRouting.json` |
| **Firestore** | master Coagulation + `coagulation_register` + criticals |
| **Inventory** | `CoagulationInventoryTab` (Yumizen G800) |
| **Owner** | `index_owner_coag.html` → `OwnerCoag.jsx` / `dataFetcher.js` |

### 5.5 ESR

| Item | Detail |
|------|--------|
| **Purpose** | ESR register inside Backroom |
| **Entry** | Via `BackroomMain` tab `esr` |
| **File** | `backroom/ESRRegister.jsx` |
| **Firestore** | master ESR + `esr_register` + criticals |
| **Owner** | `owner_esr.html` → `OwnerESRPage` / `dataFetcher_esr.js` |

### 5.6 Blood Group (Testing & Retesting)

| Item | Detail |
|------|--------|
| **Purpose** | ABO/Rh testing and retesting workflows |
| **Entry** | Backroom tab `blood` |
| **File** | `BloodGroupRegister.jsx` |
| **Master** | `useScopedMasterEntries` departments Blood-Group |
| **Registers** | Always listens **both** `bloodgroup_testing_register` and `bloodgroup_retesting_register` for date range |
| **Owner** | `owner_bloodgroup.html` — mode testing|retesting switches fetcher module |

### 5.7 Serology

| Item | Detail |
|------|--------|
| **Purpose** | Serology card/tests register |
| **File** | `SerologyRegister.jsx` |
| **Firestore** | master Serology + `serology_register` |
| **Inventory** | Deduction via `handleInventoryDeduction` on save |
| **Owner** | `OwnerSerology` / `dataFetcher_serology.js` |

### 5.8 Rapid Card

| Item | Detail |
|------|--------|
| **Purpose** | Rapid card tests |
| **File** | `RapidCardRegister.jsx` |
| **Firestore** | master RapidCard + `rapid_card_register` |
| **Owner** | `OwnerRapidPage` / `dataFetcher_rapid.js` |

### 5.9 Urine Analysis

| Item | Detail |
|------|--------|
| **Purpose** | Urine examination register |
| **File** | `UrineAnalysisRegister.jsx` |
| **Firestore** | master “Urine Examination” + `urine_analysis_register` |
| **Owner** | `OwnerUrine` / `dataFetcher_urine.js` |

### 5.10 Inside Lab (Microbiology-adjacent / pathology suite)

| Item | Detail |
|------|--------|
| **Purpose** | Inside-lab results for registers defined in `inside_room_routing.json` (FNAC, Pathology, Culture, Fluid, …) |
| **Entry** | `index_inside_lab.html` → `InsideLab.jsx` |
| **Firestore** | `useScopedMasterEntries` (dept key from active tab) + `inside_lab_results` day listener |
| **Owner** | `owner_lab.html` → `OwnerLabPage` with tabbed registers; `dataFetcher_lab.js` filters by `activeRegister` / `targetDept` client-side |

There is **no** separate folder named `microbiology`; microbiology-like work is represented under **Inside Lab** routing keys.

### 5.11 Outsource

| Item | Detail |
|------|--------|
| **Purpose** | Track tests sent to external labs (Sterling, Neuberg, Lifecell, Lilac, Reliable, …) |
| **Entry** | `index_outsource.html` → `Outsource.jsx` |
| **Config** | `Outsource.json` |
| **Firestore** | master (All labs = unscoped day; specific lab = array-contains) + `outsource_tracking` |
| **Writes** | Tracking docs + `report_details` outsource stage fields via getDoc/update paths |
| **Owner** | `OwnerOutsourcePage` / `dataFetcher_outsource.js` |

### 5.12 Backup analyzers

| Item | Detail |
|------|--------|
| **Purpose** | Log results run on backup instruments; deduct backup reagents |
| **Entry** | `index_backup.html` → `BackupEntry.jsx` |
| **Firestore** | `backup_entries_logs` (status + savedTime range) when register tab; inventory tab mounts `BackupInventoryTab` |
| **Validator** | Also surfaces `biochem_backup` / `hormones_backup` collections |
| **Deduction** | `handleInventoryDeduction` with backup-mapped test names |

### 5.13 Validator (cross-cutting)

| Item | Detail |
|------|--------|
| **Purpose** | Validate / mark entered / print stages for any department register |
| **Entry** | `index_validator.html` → `ValidatorDashboard.jsx` |
| **Supporting** | `ValidatorTable.jsx`, `validatorConfig.js` |
| **Collections** | Driven by `VALIDATOR_COLLECTIONS` / tab → collection map |
| **report_details** | Completion timestamps via `COMPLETION_FIELDS`; cascade via `routineStageFlags` |

### 5.14 Critical Alerts

| Item | Detail |
|------|--------|
| **Purpose** | Ops dashboard for `critical_alerts` |
| **Entry** | `Critical.html` → `CriticalAlertDashboard.jsx` |
| **Listener** | `flaggedAt` day range |
| **Also** | Each dept register listens dept-scoped criticals via `useMasterDeptSnapshots` |

### 5.15 Master Admin

| Item | Detail |
|------|--------|
| **Purpose** | View/edit any of 14 collections; Excel/routing import helpers |
| **Entry** | `master_admin.html` → `MasterAdmin.jsx` (legacy `MasterAdmin1.jsx` exists) |
| **Listener** | `onSnapshot(collection(db, activeColl))` — **full collection**, client date filter |
| **Writes** | `setDoc` merge on edit |

### 5.16 Lab Analytics

| Item | Detail |
|------|--------|
| **Purpose** | Count/analytics over dept collections |
| **Entry** | `analytics.html` → `LabAnalytics.jsx` |
| **Listener** | Active collection day-scoped `timePrinted` |

### 5.17 Performance & Diagnostics

| Item | Detail |
|------|--------|
| **Purpose** | Client performance telemetry UI |
| **Entry** | `performance.html` → `PerformanceDashboard.jsx` |
| **Storage** | sessionStorage live detail; localStorage rollups; Firestore `perf_daily` |
| **Bootstrap** | `performance/bootstrap.js` hooked from firebaseConfig side-effect |

### 5.18 Inventory Intake

| Item | Detail |
|------|--------|
| **Purpose** | Receive stock / invoices into `inventory_logs` |
| **Entry** | `inventory.html` → `InventoryIntake.jsx` |
| **Listeners** | `inventory_logs` orderBy timeAddedAt limit 50; `invoices` orderBy limit 50 |

---

## Owner Analytics Modules (summary)

| Page | Fetcher | Dept collections |
|------|---------|------------------|
| OwnerApp | `workflowfetcher.subscribeToWorkflowAnalytics` | `report_details` |
| OwnerBiochem | `dataFetcher_biochem_main` | master + biochemistry_register |
| OwnerHormones | `dataFetcher_hormones_main` | master + hormones_main |
| OwnerHaemPage | `dataFetcher_haem` | master + haematology_register |
| OwnerCoag | `dataFetcher.js` | master + coagulation_register |
| OwnerSerology | `dataFetcher_serology` | master + serology_register |
| OwnerRapidPage | `dataFetcher_rapid` | master + rapid_card_register |
| OwnerESRPage | `dataFetcher_esr` | master + esr_register |
| OwnerUrine | `dataFetcher_urine` | master + urine_analysis_register |
| OwnerBloodGroup | testing or retesting fetcher | master + BG register |
| OwnerOutsourcePage | `dataFetcher_outsource` | master + outsource_tracking |
| OwnerLabPage | `dataFetcher_lab` | master + inside_lab_results |

Shared Owner UI building blocks: `DateSourceFilter`, `KPIBlocks*`, `DelayTable`, `PatientListModal*`, charts under `owner/charts/*`, `OwnerUI.css`.

`withOwnerSourceControl.js` exists to allow client-side `source` re-filter without tearing listeners (`unsubscribe.updateSource`). **As of this audit, Owner pages do not call `updateSource`**; their `useEffect` deps still include `source`, so changing source still tears down and recreates Firestore listeners. `dataFetcher_lab.js` does not attach `withOwnerSourceControl`.

See also [Appendix A](./Architecture_Appendix_A_Deep_Module_Notes.md) for localStorage draft keys, Validator `loginMode`, ICC vs `InventoryCommandCentre` stub, and `mango1.jsx` unused status.

---

Continue to [Part 4 — Flows, Firebase, Listeners](./Architecture_Part_4_Flows_Firebase_Listeners.md).
