# Clinical Firestore Query Lifecycle Audit

**Mango UI · Clinical / Owner / Inventory / Validator only**  
**Engineering telemetry excluded**  
**Audit only — no code changes in this report**

Generated: 2026-08-08  
**Query health score: 6.8 / 10**

Interactive canvas: `.cursor` canvases → `clinical-firestore-query-lifecycle-audit.canvas.tsx`

---

## Executive summary

Bench registers are generally well day-scoped and use shared hooks (`useMasterDeptSnapshots`, etc.). The largest clinical inefficiencies are **full-collection realtime listens** (MasterAdmin) and a few **over-broad** queries (InventoryAdjustment, Critical all-depts). ICC history is already on `getDocs`. Owner day-scoped master is shared via `subscribeSharedMasterRegister`.

| Metric | Value |
|--------|-------|
| Clinical query families | ~55 |
| Realtime families | ~40 |
| One-shot / write helpers | ~15 |
| Full-collection RT listens | 2+ (MasterAdmin ×2, InventoryAdjustment) |
| Queries with `limit` | Essentially only InventoryIntake (50) |
| Clinical `collectionGroup` / cursors | None |
| Overall health | **6.8 / 10** |

### Top findings

| Finding | Impact | Wave |
|---------|--------|------|
| MasterAdmin / MasterAdmin1 listen to entire active collection (no date/dept filter) | High | Wave 2 |
| InventoryAdjustmentTab listens to full `inventory_adjustments` | Medium | Wave 2 |
| Almost no clinical queries use limit/cursor (except Intake) | Medium | Wave 3 |
| Owner day-scoped master is full-day all depts (shared helper already) | Low–Med | Done / hold |
| Critical dashboard queries all depts for day (client filters dept) | Low–Med | Wave 1–2 |
| Register triad (master+dept+critical) is day-scoped | Positive | — |
| ICC history already getDocs; live stock correctly realtime | Positive | — |

---

## Phase 1–2 — Query inventory (families)

Listener type: nearly all clinical reads use `trackedOnSnapshot as onSnapshot` or `trackedGetDocs` / `trackedGetDoc`.

### A. Shared register hooks

| Hook / helper | Collection(s) | Type | Filters / order | Consumers | Purpose |
|---------------|---------------|------|-----------------|-----------|---------|
| `useMasterDeptSnapshots` | `master_register` + dept_* + `critical_alerts` | RT ×3 | array-contains dept + timePrinted; dept timePrinted; critical dept+flaggedAt | Biochem, Hormones, Haem, Coag, ESR, Serology, Rapid, Urine | Bench patient register |
| `useScopedMasterEntries` | `master_register` | RT ×1 | array-contains + timePrinted | InsideLab, Outsource, BloodGroup | Master rows for dept UI |
| `useMasterRegisterSnapshots` | `master_register` | RT ×1 | timePrinted range | MasterView_Table | Registration list |
| `subscribeInventoryByMachines` | `inventory_logs` | RT ×N machines | machineName + status in [Activated, In Storage] | Dept/Haem/Coag/Backroom/Backup inventory tabs | Live machine stock |
| `subscribeSharedMasterRegister` | `master_register` | RT shared | timePrinted day range (all depts) | All Owner `dataFetcher_*` | Owner analytics master |

### B. Page-local clinical queries

| Surface | Collection | Type | Shape | Purpose |
|---------|------------|------|-------|---------|
| ValidatorDashboard | active dept register | RT ×1 | timePrinted day; swaps on tab | Validation queue |
| BloodGroupRegister | testing XOR retesting | RT ×1 | timePrinted day; tab-gated | BG results |
| InsideLab | `inside_lab_results` | RT ×1 | timePrinted day | Inside reports |
| Outsource | `outsource_tracking` | RT ×1 | timePrinted day | Outsource tracking |
| CriticalAlertDashboard | `critical_alerts` | RT ×1 | flaggedAt day (all depts) | Critical board |
| BackupEntry | `backup_entries_logs` | RT ×1 | status==true + savedTime range | Backup register |
| LabAnalytics | selected coll | RT ×1 | timePrinted day | Lab analytics |
| MasterView_Table1 | `master_register` | RT ×1 | timePrinted day | Alt master table |
| MasterView_Rectangle | `report_details` | RT ×1 | timePrinted day | Report completion UI |
| Owner workflow | `report_details` | RT ×1 | timePrinted day | Workflow analytics |
| Owner dataFetcher_* (×12) | dept collection | RT ×1 each | timePrinted day | Dept Owner KPIs |
| ICC live | `inventory_logs` | RT ×1 | status in live statuses | Live stock / expiry / cost |
| ICC history tabs | consumed / qc / cal / ledger / combo | getDocs | timestamp / consumedAt ranges | History analytics |
| InventoryIntake | `inventory_logs` + `invoices` | RT ×2 | orderBy timeAddedAt desc **limit 50** | Recent intake UI |
| InventoryAdjustmentTab | `inventory_adjustments` | RT ×1 | **entire collection** | Vitros vs backup map |
| MasterAdmin / MasterAdmin1 | activeColl | RT ×1 | **collection() — NO filters** | Admin browse/edit |
| inventorymapping deduction | `inventory_logs` | getDocs | status Activated (+ reagentName in) | Deduct on save |
| Mango / InsideLab / Outsource / Validator saves | report_details + dept docs | getDoc + writeBatch | by doc id | Clinical writes |

### Not found in clinical code

- No clinical `collectionGroup()`
- No `startAfter` / `startAt` / `endAt` pagination
- `runTransaction` not used clinically (Engineering only)

---

## Phase 3 — Lifecycle

| Pattern | Starts | Stays alive | Stops | Multi-fire? |
|---------|--------|-------------|-------|-------------|
| Register triad (`enabled`) | Mount / date change / tab return | While register tab active | `enabled=false` or unmount | Yes on date/dept deps |
| Validator active collection | Mount / tab / date | One stream | Tab change unsubs prior | Intentional recreate |
| Owner `subscribeOverview` | Owner page mount / dateRange | Page lifetime | unsub on leave | Date change recreates |
| ICC live | Inventory/Expiry/Cost tabs | While `needsLive` | Leave those tabs | No |
| ICC history getDocs | Tab enter / date change | One-shot | Cancelled on leave | Yes on date change |
| MasterAdmin | Mount / collection switch | Until leave or switch | unsub | Yes — full resync |
| InventoryAdjustment | Mount | Page lifetime | unsub | No deps — once |
| Search typing | Never hits Firestore | — | — | Client filter only |

**Duplicate subscription risk:** Largely mitigated for Biochem/Haem/Coag via `enabled`. Remaining: MasterAdmin full listen; Owner MPA cannot share across browser tabs; InventoryAdjustment always-on full collection.

---

## Phase 4 — Cost model (estimates)

Busy day ~50–200 patients/dept. Orders of magnitude only.

| Query family | Docs (typ.) | Updates | Payload | Notes |
|--------------|-------------|---------|---------|-------|
| Register master (array-contains day) | 20–150 | Low–med | Medium | Dominant bench stream |
| Register dept day | 20–150 | Med (saves) | Medium | Incremental after seed |
| critical_alerts dept+day | 0–20 | Low | Small | Required for modal |
| Owner master day (all depts) | 100–500+ | Low–med | Large | Heaviest Owner read |
| Owner dept day | 20–150 | Low | Medium | Per Owner HTML page |
| report_details day | 50–400 | Med | Large | Workflow + Rectangle |
| inventory_logs live statuses | 50–300 | Low | Medium | No date filter |
| MasterAdmin full collection | Thousands+ | Any write | Very large | Highest clinical risk |
| inventory_adjustments full | Tens–hundreds | Rare | Small–med | Config-like |
| Intake limit 50 | ≤50 | Low | Small | Best limited pattern |

---

## Phase 5 — Duplicate detection

| Duplicate | Instances | Intentional? | Shareable? |
|-----------|-----------|--------------|------------|
| Owner `master_register` day | 12 fetchers (same shape) | Yes historically | Already shared via `subscribeSharedMasterRegister` |
| Register master+dept+critical | Per open bench page | Yes (MPA) | Parent pause done in-page |
| `report_details` day | Owner workflow + MasterView_Rectangle | Separate pages | Only if co-mounted |
| `inventory_logs` by machine | ICC live vs inventory tabs | Possible overlap | Low risk if same machine in both |
| `critical_alerts` | Register triad + Critical dashboard | Different filters | Do not merge |

---

## Phase 6 — Client-side work

| Location | Work | Could be Firestore? | Risk |
|----------|------|---------------------|------|
| All registers | filter source / search / urgent sort | Partial (source where); search stays client | Medium |
| Register consumers | filter selectedTests vs routing JSON | No — app config | Safe |
| MasterAdmin | date + source + search on full set | Yes — move date into query | Low |
| Critical dashboard | dept dropdown filter | Yes — `where(dept==)` when not All | Low / Safe |
| Owner `publish()` | merge / KPI / SLA / source | Mostly must stay client | High |
| VirtualizedTableBody | windowed render | Already mitigates DOM cost | Safe |

---

## Phase 7 — Query scoping

| Query | Issue | Impact |
|-------|-------|--------|
| MasterAdmin `onSnapshot(collection)` | No date, no limit, no dept | **High** |
| InventoryAdjustmentTab full collection | No filter/limit | **Medium** |
| ICC / inventory live statuses | No date (all live stock) | Low |
| Owner master day all depts | Broader than one dept | Medium |
| Critical flaggedAt day all depts | Client filters dept | Medium |
| Most day registers | No limit (OK for day volume) | Low |
| Wide date ranges on Owner/Admin | User can select multi-day/month | **High** |

---

## Phase 8 — Index audit (clinical)

| Query | Index need | In `firestore.indexes.json`? | Status |
|-------|------------|------------------------------|--------|
| master departments array-contains + timePrinted | Composite | Yes | OK |
| critical dept + flaggedAt | Composite | Yes | OK |
| inventory machineName + status | Composite | Yes | OK |
| inventory status + consumedAt | Composite | Yes | OK |
| backup_entries status + savedTime | Composite | Yes | OK |
| dept_* timePrinted range + orderBy | Single-field auto | Not listed | Usually OK |
| inventory status + reagentName `in` | Composite likely | Missing in repo file | **Verify in console** |
| critical flaggedAt only (dashboard) | Single-field | N/A | OK |
| qc/calibration/ledger timestamp ranges | Single-field / auto | Not listed | Verify if errors |

Repo also has many `eng_*` indexes — out of clinical scope.

---

## Phase 9 — Realtime justification

| Query | Verdict | Why |
|-------|---------|-----|
| Bench register triad | **Realtime required** | Multi-user saves / scans / criticals |
| Validator active collection | **Realtime required** | Queue changes as techs save |
| Inventory live stock | **Realtime required** | Activation / deduction races |
| Critical dashboard | Probably realtime | New flags; polling could work |
| Owner analytics | Probably getDocs | Historical KPIs; refresh OK |
| LabAnalytics | Probably getDocs | Report-style |
| MasterAdmin browse | Probably getDocs | Admin tool; day-scoped getDocs safer |
| ICC history | Definitely getDocs | Already converted |
| InventoryAdjustment map | Probably getDocs | Config changes rare |
| Deduction getDocs | Definitely getDocs | Already one-shot |

---

## Phase 10 — Canonical query graphs

### Biochemistry (register tab)

```
BiochemistryMain
  → useMasterDeptSnapshots(enabled)
  → master_register + biochemistry_register + critical_alerts
  → incremental merge
  → filter(tests / source / search)
  → VirtualizedTableBody
  → row actions (setDoc / deduction getDocs)
```

Hormones/Inventory tabs: parent `enabled=false`; child owns own listeners.

### Owner Biochem page

```
OwnerBiochem
  → subscribeOverview
  → shared master_register(day) + biochemistry_register(day)
  → publish merge / KPI / SLA
  → charts (client)
```

### Validator

```
ValidatorDashboard
  → one active collection(day)
  → table
  → validate getDoc(report_details) + writeBatch
```

### ICC

```
Live tabs → inventory_logs status-in RT → tabs
History tabs → getDocs ranges → cache → tables
```

### MasterAdmin (problem path)

```
MasterAdmin
  → onSnapshot(entire activeColl)
  → client date / source / search filter
  → table
```

Highest read amplification.

---

## Phase 11 — Optimization risk tags (proposals only)

| Proposal | Class | Why |
|----------|-------|-----|
| MasterAdmin: add timePrinted day range (+ optional limit) | Low Risk | Same UI if default dates match |
| Critical: `where(dept==)` when dept ≠ All | Safe | Same results; All keeps current query |
| InventoryAdjustment → getDocs + refresh button | Low Risk | Rare edits; confirm UX |
| Owner analytics → getDocs on date apply | Medium Risk | Loses live KPI updates |
| Add limit to multi-day Owner ranges | Medium Risk | Could truncate charts |
| Firestore-side source filter on registers | Medium Risk | Recreates listener; index check |
| Global master + client filter all depts | Very High Risk | Rejected / out of scope |
| Cursor pagination on registers | High Risk | Changes UX / realtime model |

---

## Phase 12 — Estimated impact (if later implemented)

### Wave 1–2 only

- Reads: −15% to −35% on Admin / Critical / Adjustment paths  
- Network: −10% to −25% for those pages  
- CPU: −5% to −15% (less client filter on huge sets)  
- Bench registers: ~0% change (already scoped)

### Also Owner → getDocs (Wave 3)

- Owner streams: −50%+ (no long-lived listens)  
- Snapshot churn: large drop on Owner devices  
- Product tradeoff: manual/auto refresh

---

## Phase 13 — Scorecard

| Metric | Estimate |
|--------|----------|
| Query families | ~55 |
| Realtime families | ~40 |
| getDocs / getDoc helpers | ~15 |
| Duplicate shapes | 5+ |
| Full-collection listens | 2+ |
| With limit | 1 (Intake) |
| Day-scoped registers | Most (healthy) |
| Client filter/sort | High usage |
| Missing index to verify | 1 (`status` + `reagentName`) |
| Potential shared remaining | ICC ↔ inventory machine overlap |
| Potential getDocs conversions | Owner, LabAnalytics, MasterAdmin, Adjustment |
| Est. read reduction (Wave 1–2) | 15–35% on affected pages |
| Est. CPU reduction (Wave 1–2) | 5–15% |
| Est. network reduction (Wave 1–2) | 10–25% |
| **Overall query health** | **6.8 / 10** |

### Already healthy

Day-scoped bench registers · Validator single-collection listen · ICC history getDocs · inventory machine indexes · parent-tab listener pause · Owner shared master helper

---

## Prioritized roadmap (not implemented)

### Wave 1 — Safe (immediate)

1. Critical dashboard: add `where(dept == …)` when dept ≠ All.  
2. Verify inventory `status + reagentName` composite exists in Firebase console.

### Wave 2 — Low Risk

1. MasterAdmin / MasterAdmin1: constrain by `timePrinted` to selected date range (keep multi-day).  
2. InventoryAdjustmentTab: `getDocs` + explicit refresh.

### Wave 3 — Medium Risk

1. Owner / LabAnalytics: optional getDocs or refresh-on-date-apply.  
2. Cap multi-week Owner ranges with warning/limit.

### Wave 4 — High Risk (product)

Firestore-side source filters on registers; cursor pagination; changing Owner chart live semantics.

### Wave 5 — Architectural (future)

SPA Owner shell with shared listeners; pagination for huge history.  
**Excluded:** global master + client filter all depts.

---

*This report does not change application behaviour. Implement only after explicit approval per wave.*
