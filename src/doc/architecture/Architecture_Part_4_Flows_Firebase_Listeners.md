# Mango LIMS Architecture — Part 4: Page Flows, Firebase, Listeners

[← Part 3](./Architecture_Part_3_Components_and_Departments.md) · [Index](./README.md) · [Part 5 →](./Architecture_Part_5_State_Effects_Performance_CSS.md)

---

## SECTION 6 — Page Flow (canonical patterns)

### 6.1 Department register (useMasterDeptSnapshots pattern)

Applies to: Haematology, Biochemistry, Hormones, Coagulation, ESR, Serology, Rapid, Urine (and similar).

```
User opens HTML (e.g. index_haem.html)
    ↓
main_*.jsx createRoot + StrictMode
    ↓
Page component mounts
    ↓
requireLogin() may redirect to login.html
    ↓
useRegisterFilters() initializes dateFrom/dateTo = today, source=All, search=""
    ↓
useMasterDeptSnapshots({ deptCollection, currentDept, masterDeptKey, dateFrom, dateTo })
    ↓
useEffect builds Timestamp day bounds (local/IST helpers)
    ↓
THREE onSnapshot listeners start:
    1) master_register: departments array-contains masterDeptKey + timePrinted range
    2) {deptCollection}: timePrinted range
    3) critical_alerts: dept == currentDept + flaggedAt range
    ↓
Incremental stores apply snapshots → React state (masterEntries, deptDocs, savedSet, criticalReportedSet)
    ↓
useMemo merges master ∩ routing tests with dept docs + localStorage scans
    ↓
UI renders table / filter bar
    ↓
User interactions:
    - Scan → local persisted state (+ optional Firestore updates)
    - Save → setDoc dept register + updateDoc report_details flags
           → optional inventory deduction (getDocs/getDoc + batch + ledger addDoc)
    - Critical → modal → setDoc critical_alerts
    - Date change → effect cleanup unsubs → new queries
    ↓
Unmount / navigation away → effect cleanup unsubscribes all three
```

### 6.2 Registration (`mango.jsx` via `main.jsx`)

```
Open index.html → App nav → Mango view
    ↓
Form local state (refs + useState)
    ↓
Search tests against test_mapping.json (client)
    ↓
Save/Update:
    getDoc existing master id (edit mode) / setDoc master_register
    setDoc/merge report_details
    ↓
No long-lived register listener on the entry form itself
```

### 6.3 Validator

```
Open index_validator.html
    ↓
Tab state → getActiveCollection()
    ↓
useEffect([activeCollection, dateFrom, dateTo])
    ↓
onSnapshot(dept register, timePrinted day)
    ↓
Client searchTerm filter
    ↓
Validate / Entered / Print actions:
    getDoc report_details
    writeBatch / updateDoc register + report_details (+ cascade fields)
    ↓
Tab change → unsub old collection → subscribe new
```

### 6.4 Owner department analytics

```
Open owner_*.html → OwnerProvider → Owner{Dept}
    ↓
DateSourceFilter binds OwnerContext dateRange + source
    ↓
useEffect subscribeOverview({ source, dateRange, onData })
    ↓
createOwnerSessionPaint paints session cache if present
    ↓
onSnapshot master day + onSnapshot dept day
    ↓
publish(): client filter by local midnight + source → KPIs/SLA/staff → onData
    ↓
Charts/tables render from React state
    ↓
source or dateRange change (current code): effect re-runs → unsub → new listeners
    ↓
Unmount → unsub
```

### 6.5 Inventory Command Center

```
Open commandcenter.html → OwnerProvider → InventoryCommandCenter
    (Provider wraps tree; ICC does not read OwnerContext — uses local fromDate/toDate)
    ↓
activeTab + fromDate/toDate state (default today)
    ↓
Separate useEffects gated by needsLive / needsConsumed / needsQC / needsLedger / needsCombo
    ↓
Sibling tabs sharing a query keep the same listener (Inventory↔Expiry↔Cost live; Ledger↔Cost ledger)
    ↓
Child tabs filter client-side (machine, search)
    ↓
Leave need-family → cleanup unsub
```

### 6.6 Master Admin

```
Open master_admin.html → MasterAdmin
    ↓
activeColl tab state
    ↓
onSnapshot(collection(activeColl)) FULL
    ↓
filteredData client filter date/source/search
    ↓
Inline edit → setDoc merge
    ↓
Change collection tab → unsub → new full listener
```

---

## SECTION 7 — Firebase Architecture

### 7.1 Collections referenced in `src/` (static scan)

| Collection | Role | Example consumers |
|------------|------|-------------------|
| `master_register` | Registration SoT; departments array; selectedTests; timePrinted | Registration, all dept hooks, Owner fetchers, Outsource, InsideLab, Master views/Admin |
| `report_details` | Cross-dept stage flags, completion timestamps, outsource/inside flags | Registration seed, dept saves, Validator, Master Rectangle, Owner workflow |
| `biochemistry_register` | Biochem results / scan/save | BiochemistryMain, Validator, Owner biochem, Master Admin |
| `hormones_main` | Hormones results | HormonesMain, Validator, Owner hormones |
| `haematology_register` | Haem results | Haematology, Validator, Owner haem |
| `coagulation_register` | Coag results | CoagulationMain, Validator, Owner coag |
| `esr_register` | ESR | ESRRegister, Validator, Owner ESR |
| `serology_register` | Serology | SerologyRegister, Validator, Owner |
| `rapid_card_register` | Rapid | RapidCardRegister, Validator, Owner |
| `urine_analysis_register` | Urine | UrineAnalysisRegister, Validator, Owner |
| `bloodgroup_testing_register` | BG testing | BloodGroupRegister, Validator, Owner |
| `bloodgroup_retesting_register` | BG retesting | BloodGroupRegister, Validator, Owner |
| `biochem_backup` / `hormones_backup` | Backup registers (Validator collections list) | Validator |
| `inside_lab_results` | Inside lab | InsideLab, OwnerLab, Master Admin |
| `outsource_tracking` | Outsource tracking | Outsource, OwnerOutsource, Master Admin |
| `critical_alerts` | Critical queue | Dept hooks, Critical dashboard, Master Admin |
| `inventory_logs` | Stock lots | Intake, machine tabs, ICC, deduction |
| `inventory_adjustments` | Vitros vs backup analyzer per test | InventoryAdjustmentTab, getVitrosDeductibleTests |
| `invoices` | Invoice intake companion | InventoryIntake |
| `consumption_ledger` | Consumption audit | inventorymapping → ICC Cost/Ledger |
| `combo_consumption_ledger` | Combo test consumption | inventorymapping → ICC Ledger |
| `qc_logs` / `calibration_logs` | QC / cal events | DeptInventoryTab writes; ICC QC tab |
| `waste_logs` | Waste events | Inventory tabs |
| `maintenance_logs` | Maintenance | Inventory surfaces |
| `backup_entries_logs` | Backup entry documents | BackupEntry |
| `perf_daily` | Performance daily rollups | performance/* |

### 7.2 Relationships (logical)

```
master_register (1 patient accession)
    ├── departments[] / selectedTests[]
    ├── composite key ≈ regNo + diagnosticNo
    │
    ├── {dept}_register docs (same business key)
    ├── report_details/{key} stage maps
    ├── critical_alerts (optional)
    └── outsource_tracking / inside_lab_results (optional)

inventory_logs (reagent bottle)
    ├── status: In Storage | Activated | Consumed
    ├── machineName, reagentName, totalTests, …
    └── consumption_ledger / combo_consumption_ledger rows on deduct
```

### 7.3 Reads

| Pattern | API | Where |
|---------|-----|--------|
| Live day registers | `onSnapshot` + `scopedTimePrintedQuery` or manual where/orderBy | Dept hooks, Owner, Validator, many pages |
| Live inventory by machine | `onSnapshot` where machineName + status in live | `subscribeInventoryByMachines` |
| Full collection listen | `onSnapshot(collection)` | MasterAdmin, InventoryAdjustmentTab |
| Point read | `getDoc` | Saves, Vitros adjustments, Validator report_details, Outsource |
| Query get | `getDocs` | inventorymapping Activated (scoped/fallback), various |

### 7.4 Writes

| Pattern | API | Where |
|---------|-----|--------|
| Upsert register | `setDoc` merge | Dept saves, registration |
| Stage flags | `updateDoc` dotted paths | Dept saves, Validator |
| Batch stock | `writeBatch` update | inventorymapping, inventory tabs |
| Ledger append | `addDoc` | consumptionledger.js, combo in mapping |
| Critical | `setDoc` | Dept critical flows |
| Perf rollup | `setDoc` merge | perfDailyFirestore.js |

### 7.5 Transactions

No widespread `runTransaction` usage identified as a core clinical path in the audited inventory signals; inventory uses **batches** and sequential `addDoc`s.

### 7.6 Indexes (visible in repo)

See `firestore.indexes.json` (Part 1). Day-scoped single-field `timePrinted` / `timestamp` queries rely on automatic single-field indexes unless compounded with inequality/orderBy needing composites.

### 7.7 Shared query utilities

| Utility | Behaviour |
|---------|-----------|
| `scopedTimePrintedQuery` | `timePrinted >= dayStart AND < dayEndExclusive` + `orderBy timePrinted` |
| `scopedTimestampRangeQuery` | Same pattern for named timestamp field |
| `useMasterDeptSnapshots` | Triad listeners + incremental stores |
| `useScopedMasterEntries` | Optional `array-contains` + day range on master |
| `subscribeInventoryByMachines` | One listener per machineName |
| `createOwnerSessionPaint` | Session cache paint then live replace |
| `withOwnerSourceControl` | `unsubscribe.updateSource(next)` re-publish |

---

## SECTION 8 — Listener Audit

Legend: **Cleanup** = effect/subscribe returns unsubscribe. **Deps** = what recreates.

### 8.1 Shared factories

| Location | Collections | Query | Cleanup | Deps / notes |
|----------|-------------|-------|---------|--------------|
| `useMasterDeptSnapshots.js` L92/133/217 | master, dept, critical_alerts | array-contains+timePrinted; timePrinted; dept+flaggedAt | Yes (triple) | `[deptCollection, currentDept, masterDeptKey, dateFrom, dateTo]` |
| `useScopedMasterEntries.js` L75 | master_register | optional array-contains + timePrinted | Yes | `[masterDeptKey, dateFrom, dateTo]` |
| `subscribeInventoryByMachines.js` L83 | inventory_logs | machineName== + status in live | Yes (all machines) | Caller-controlled |
| `trackedFirestore.js` | n/a | wrapper | Returns FB unsub | Caller |

### 8.2 Clinical / ops pages

| Location | Collection(s) | Query shape | Cleanup | Deps | Duplicate risk |
|----------|---------------|-------------|---------|------|----------------|
| `ValidatorDashboard.jsx` ~102 | active dept register | timePrinted day | Yes | collection + dates | Low (one active) |
| `BloodGroupRegister.jsx` 106/120 | testing + retesting | timePrinted day | Yes | dates | Both always on |
| `InsideLab.jsx` 85 | inside_lab_results | timePrinted day | Yes | dates | + scoped master hook |
| `Outsource.jsx` 91 | outsource_tracking | timePrinted day | Yes | dates | + scoped master |
| `BackupEntry.jsx` 119 | backup_entries_logs | status + savedTime range | Yes | tab + dates | Inventory tab may stay mounted |
| `CriticalAlertDashboard.jsx` 66 | critical_alerts | flaggedAt range | Yes | dates | Overlaps dept criticals if both open |
| `MasterView_Table.jsx` / `Table1` | master_register | day | Yes | dates | |
| `MasterView_Rectangle.jsx` 196 | report_details | day | Yes | dates | |
| `MasterAdmin.jsx` 128 | `activeColl` | **full collection** | Yes | `[activeColl]` | Huge; overnight hazard |
| `MasterAdmin1.jsx` | same pattern | full | Yes | activeColl | Legacy duplicate file |
| `LabAnalytics.jsx` 77 | active coll | timePrinted day | Yes | coll + dates | |
| `InventoryIntake.jsx` 60/69 | inventory_logs, invoices | orderBy limit 50 | Yes | `[]` | Stable |
| `InventoryAdjustmentTab.jsx` 60 | inventory_adjustments | full collection | Yes | `[]` | Alive if parent keeps mounted |
| `InventoryCommandCenter.jsx` | inventory_logs / ledgers / qc | tab-gated (see Part 3) | Yes | need flags + dates | Sibling persistence post-C1 |
| `Haematology.jsx` inventory effect | inventory_logs × machines | via subscribe helper | Yes | activeTab | Overlaps HaemInventoryTab |

### 8.3 Owner fetchers (each `subscribeOverview`)

| File | Listeners | Query | Cleanup |
|------|-----------|-------|---------|
| `dataFetcher_biochem_main.js` | master + biochemistry_register | scopedTimePrinted | Yes + updateSource helper |
| `dataFetcher_hormones_main.js` | master + hormones_main | scoped | Yes |
| `dataFetcher_haem.js` | master + haematology_register | scoped | Yes |
| `dataFetcher.js` (coag) | master + coagulation_register | scoped | Yes |
| `dataFetcher_serology.js` | master + serology_register | scoped | Yes |
| `dataFetcher_rapid.js` | master + rapid_card_register | scoped | Yes |
| `dataFetcher_esr.js` | master + esr_register | scoped | Yes |
| `dataFetcher_urine.js` | master + urine_analysis_register | scoped | Yes |
| `dataFetcher_bloodgroup_testing.js` | master + testing | scoped | Yes |
| `dataFetcher_bloodgroup_retesting.js` | master + retesting | scoped | Yes |
| `dataFetcher_outsource.js` | master + outsource_tracking | scoped | Yes |
| `dataFetcher_lab.js` | master + inside_lab_results | scoped | Yes |
| `workflowfetcher.js` | report_details | scoped | Yes |

**Source filtering:** Implemented inside `publish()` / `matchesFilters` / `applyFilters` — **not** as a Firestore `where('source')`.

### 8.4 Idle behaviour

Any open MPA tab keeps its listeners active indefinitely (30 minutes, overnight, until close/navigate). Firestore may re-deliver full snapshots on reconnect. This is an inherent property of the current listener design.

### 8.5 Missing cleanup

Static review of production paths shows **unsubscribe returned** from the audited `useEffect` / `subscribeOverview` sites. No systematic missing-cleanup pattern was identified in those paths.

---

Continue to [Part 5 — State, Effects, Performance, CSS, Notes](./Architecture_Part_5_State_Effects_Performance_CSS.md).
