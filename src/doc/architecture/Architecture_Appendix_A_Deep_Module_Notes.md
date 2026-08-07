# Mango LIMS Architecture — Appendix A: Deep Module Notes

[← Index](./README.md)

Supplementary factual notes merged from secondary code audits of clinical/ops modules and Owner/inventory/shared/performance. Prefer Parts 1–5 for navigation; use this appendix for denser workflow and wiring detail.

---

## A.1 Registration accuracy

| Fact | Detail |
|------|--------|
| Production registration | `src/mango.jsx` via `index.html` → `main.jsx` |
| `mango1.jsx` | Near-duplicate; **not referenced** by any HTML entry; QR scan UI non-functional there |
| Edit flow | Loads `localStorage.editPatientData` once; Master Table edit writes that key then redirects to `/` |
| Save writes | `master_register` setDoc merge; `report_details` setDoc merge with workflow stub maps on create |
| Doc id | Typically `regNo_diagnosticNo` (or `originalId` in edit mode) |

## A.2 Auth accuracy

| Fact | Detail |
|------|--------|
| Auth mechanism | Static `users.js` credentials; `sessionStorage.loggedUser`, `department`, optional `loginMode` |
| Gate | `Authguard.js` `requireLogin()` → `/login.html` |
| Validator modes | Login can set `loginMode` to `validator` or `entered` (controls Validate vs Enter buttons) |
| Firestore | Auth module does not use Firestore |

## A.3 Common clinical save pattern

```
Scan (localStorage draft + often report_details scanned flags)
  → Save requires scanned
  → setDoc {dept}_register (composite key)
  → updateDoc report_details routineReportsScanned/Saved (or specialty maps)
  → optional critical_alerts setDoc
  → optional handleInventoryDeduction / getVitrosDeductibleTests
  → clear localStorage draft keys for that patient
```

## A.4 Department localStorage draft keys (observed)

| Module | Keys |
|--------|------|
| Haematology | `haematology_localScans`, `haematology_localScanTimes`, `haematology_machineSelections`, `haematology_pendingCritical` |
| Biochemistry | `biochem_localScans`, `biochem_localScanTimes`, `biochem_pendingCritical` |
| Hormones | `hormones_localScans`, `hormones_localScanTimes`, `hormones_pendingCritical` |
| Coagulation | `coagulation_localScans`, `coagulation_localScanTimes`, `coagulation_localResults` |
| Outsource | `outsource_localBuffer` |
| Backroom registers | Per-register persisted scan/result keys via `usePersistedObjectState` |

## A.5 Haematology inventory wiring

- When `activeTab === "inventory"`, parent `Haematology.jsx` may subscribe **both** haem3 + haem5 machines and pass `preLoadedInventory`.
- `HaemInventoryTab` also runs `subscribeInventoryByMachines` for the **active** 3-part or 5-part machine.
- Deduction suffixes tests with `_three_part` / `_five_part` before `handleInventoryDeduction`.

## A.6 Validator collection picker

Driven by `getActiveCollection(main, sub, backroom, bloodSub)` in `ValidatorDashboard.jsx`:

| Main | Collection examples |
|------|---------------------|
| biochem | `biochemistry_register` / `hormones_main` |
| backup | `biochem_backup` / `hormones_backup` |
| coag / haem | `coagulation_register` / `haematology_register` |
| backroom | esr / blood testing|retesting / serology / rapid / urine registers |

`validatorConfig.js` may label hormones as `hormones_register` in places; **live dashboard uses `hormones_main`**.

## A.7 Inside Lab tabs

From `inside_room_routing.json`: `FnacRegister`, `PathologyRegister`, `CultureRegister`, `FluidRegister` (and their test lists). Master scope uses tab id as `departments` array-contains key. Results in `inside_lab_results` with composite id including active tab.

## A.8 Outsource labs

UI labs include All + Sterling, Neuberg, Lifecell, Lilac, Reliable (from `Outsource.json`). Stages: collect → receive → deliver updating `outsource_tracking` and `report_details` outsource maps.

## A.9 Backup entry vs Validator backups

- `BackupEntry.jsx` writes **`backup_entries_logs`** (manual multi-row form) and deducts inventory.
- Validator listens to **`biochem_backup` / `hormones_backup`** collections — not the same path as `BackupEntry` addDoc logs.

## A.10 Owner source-control wiring (current)

| Component | Behaviour today |
|-----------|-----------------|
| `withOwnerSourceControl` | Implemented on most `subscribeOverview` return values (`updateSource` → republish) |
| Owner pages | `useEffect` deps still include **`source`** → full unsub/resubscribe on source change |
| Pages calling `updateSource` | **Not observed** in Owner page code |
| `dataFetcher_lab.js` | Does not attach `withOwnerSourceControl`; source changes recreate listeners |

Session paint keys: `owner:{dept}:{from}:{to}:{source}` in sessionStorage (`mango.sqc.v1:`), TTL ~60s.

## A.11 OwnerProvider wrapping non-Owner pages

| Entry | Wraps Provider? | Reads OwnerContext? |
|-------|-----------------|---------------------|
| Owner pages | Yes | Yes (`dateRange`, `source`) |
| Inventory Intake | Yes (bootstrap) | No (local date filters) |
| Inventory Command Center | Yes (bootstrap) | **No** — ICC uses its own `fromDate`/`toDate` |
| Master Admin | Yes | Typically not for clinical filters |
| Lab Analytics | Yes | May share date/source patterns via provider where wired |

## A.12 Inventory Command Center vs legacy stub

| Path | Role |
|------|------|
| `src/inventory-command-center/InventoryCommandCenter.jsx` | Live ICC (commandcenter.html) |
| `src/inventory/InventoryCommandCentre.jsx` | Static placeholder; **not** the MPA entry |

ICC live stock is never session-cached; history tabs use `icc:*` session cache keys.

## A.13 Inventory machine map (`INVENTORY_MACHINES`)

| Key | Machines |
|-----|----------|
| `deptMain` | VITROS 6500 |
| `backupBiochem` | Yumizen C-150, MISPA i2, Mispa i2, GEM 3500 |
| `backupHormones` | Access 2 |
| `haem3` / `haem5` | 3 Part Machine / 5 Part Machine |
| `coag` | Yumizen G800 |
| `backroom` | Backroom, Urine |

Live statuses: `Activated`, `In Storage`.

## A.14 Performance storage keys

| Key | Storage | Role |
|-----|---------|------|
| `mango.perf.monitor` | localStorage | Enable/disable monitor (`"0"` off) |
| `mango.perf.v1` | sessionStorage | Live detail ring buffers |
| `mango.perf.health.v1` / `daily.v1` / `readsCounted.v1` | localStorage | Health + daily rollups + read counter |
| `perf_daily` | Firestore | Cross-device daily rollups |

Bootstrapped via side-effect import from `firebaseConfig.js`.

## A.15 Firestore indexes vs query calendars

| Helper | Calendar |
|--------|----------|
| `scopedTimePrintedQuery` (Owner/workflow) | **Local** day bounds |
| `scopedTimestampRangeQuery` (ICC) | **IST** day bounds |
| Dept `useMasterDeptSnapshots` | Local day helpers in hook |

Composite indexes in repo `firestore.indexes.json` cover master departments+timePrinted, critical dept+flaggedAt, inventory machine+status / status+consumedAt / status+reagentName, backup_entries status+savedTime. Other range+orderBy pairs may rely on automatic single-field indexes or console indexes not listed in the file.

## A.16 Unused / legacy shells

| Item | Note |
|------|------|
| `mango1.jsx` | No HTML entry |
| `MasterView_Table1.jsx` | Not used by `main.jsx` (Table uses hook-based `MasterView_Table.jsx`) |
| `MasterAdmin1.jsx` | Parallel admin copy |
| `master_register_2/main.jsx` | Alternate shell; no HTML reference found |
| `biochem_backup/` folder | Empty of source files |
| `InventoryCommandCentre.jsx` | Placeholder only |

---

## Sources

Deep notes contributed by code audits:

- [Clinical/ops modules audit](957dc248-7780-4200-ae8a-dc0c99085ef7)
- [Owner/inventory/shared/performance audit](e4c90609-1927-42fa-a16a-f372c2587bb9)
