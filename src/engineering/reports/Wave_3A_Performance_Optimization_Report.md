# Mango UI – Wave 3A Performance Optimization Report

**Date:** 2026-08-09  
**Scope:** React.memo register rows + InventoryAdjustment query only  
**Constraint:** Clinical behaviour / writes / validation / deduction / telemetry attribution unchanged

---

## 1. Files modified

| File | Change |
|------|--------|
| `src/shared/hooks/useStableCallback.js` | **New** — stable callback identity without stale closures |
| `src/shared/utils/arePatientRowEqual.js` | **New** — shared patient-row memo comparator |
| `src/inventory/InventoryAdjustmentTab.jsx` | `onSnapshot` → `trackedGetDocs`; merge local state after save |
| `src/biochem_main/BiochemistryMain.jsx` | `BiochemRegisterRow` + `memo` + stable handlers |
| `src/biochem_main/HormonesMain.jsx` | `HormonesRegisterRow` + `memo` |
| `src/haem/Haematology.jsx` | `HaemRegisterRow` + `memo` |
| `src/coagulation/CoagulationMain.jsx` | `CoagRegisterRow` + `memo`; helpers module-scoped |
| `src/backroom/BloodGroupRegister.jsx` | `BloodGroupRegisterRow` + `memo` |
| `src/ValidatorUI/ValidatorTable.jsx` | `ValidatorTableRow` + `memo` |
| `src/critical/CriticalAlertDashboard.jsx` | `CriticalAlertRow` + `memo` |
| `src/master/MasterView_Table.jsx` | `MasterRegisterRow` + `memo` |

---

## 2. Components memoized

| Component | Parent surface |
|-----------|----------------|
| `BiochemRegisterRow` | Biochemistry register |
| `HormonesRegisterRow` | Hormones register |
| `HaemRegisterRow` | Haematology register |
| `CoagRegisterRow` | Coagulation register |
| `BloodGroupRegisterRow` | Blood Group register |
| `ValidatorTableRow` | Validator table |
| `CriticalAlertRow` | Critical Alerts Center |
| `MasterRegisterRow` | Master Register table view |

Callbacks stabilized via `useStableCallback` so memo compares succeed across parent re-renders.

---

## 3. Components intentionally NOT memoized (and why)

| Surface | Why skipped |
|---------|-------------|
| **ESR / Serology / Rapid / Urine** | High local typing surface (`localResults` many fields per row) + `getCleanTests()` in render; memo without precomputed `testsDisplay` + field-level compare would either be ineffective or high regression risk. Same pattern as Biochem is ready as a follow-up. |
| **Owner chart/KPI tables** | No dense `<tr>` patient grids; charts recompute from Owner payloads — outside this Wave’s row-memo goal. |
| **MasterAdmin** | Admin full-collection tool; not floor register; query scope is separate Wave. |
| **MasterView_Rectangle / MasterView_Table1** | Alternate/legacy master UIs; Table view is the primary floor path. |
| **InventoryAdjustment “rows”** | Not a patient table — button grid for routing; memo would not help. Optimized via getDocs instead. |
| **VirtualizedTableBody itself** | Already windows DOM; memoizing the body adds little vs memoizing row leaves. |

---

## 4. InventoryAdjustment changes

**Realtime required?** No for this screen.

- Collection is **config** (`doc id = testName`), edited infrequently.
- After save, UI already updated via `setStaticConfig` + local pending clear.
- Cross-user live sync of routing while the tab is open is not a clinical workflow requirement.

**Change:**
- Replaced always-on `onSnapshot(collection(inventory_adjustments))` with **one-shot `trackedGetDocs`** on mount.
- After successful batch save, **merge** saved analyzers into `adjustments` state (same visible result as a snapshot update for the editing user).

**Unchanged:** write batch shape, `setStaticConfig`, confirm/alert UX, deduction consumers, Intake/Mapping/ICC.

**Accepted delta:** another session editing the same tab concurrently will not live-update until remount/revisit. Documented as intentional for config screen.

---

## 5. Estimated CPU reduction

| Area | Estimate |
|------|----------|
| Register scan/remark of 1 row on a 80–150 row day | **40–70%** less React render work in the virtual window (unchanged siblings skip) |
| Critical typing `reportedTo` / `commMethods` for one alert | **~N−1** alert rows skip (N = visible alerts) |
| InventoryAdjustment tab open | Removes continuous snapshot merge CPU |

---

## 6. Estimated rerender reduction

| Scenario | Before | After |
|----------|--------|-------|
| One `localScans` flip | All visible virtual rows reconcile | **1** row (+ VirtualizedTableBody shell) |
| Critical one-field edit | All alert rows | **1** row |
| Validator validate click | Sibling rows may skip if item refs unchanged for others | **1** row typically |

Note: parent still re-renders; memo prevents **child** commit work.

---

## 7. Estimated Firestore read reduction

| Change | Estimate |
|--------|----------|
| InventoryAdjustment | Removes **ongoing listener reads** for the tab lifetime. Mount cost ≈ **1 getDocs** of the small config collection (same order as first snapshot). Subsequent remote edits while open: **0** automatic reads (was: 1 per remote change). |

No other query shapes changed.

---

## 8. Estimated listener reduction

| Listener | Delta |
|----------|-------|
| `inventory_adjustments` onSnapshot while Adjustment tab mounted | **−1 active listener** |
| All clinical register triad / Owner / ICC | **0** (untouched) |

---

## 9. Risks

| Risk | Mitigation / residual |
|------|------------------------|
| Stale row UI if comparator misses a field | Shared `DEPT_REGISTER_ROW_FIELDS` + Critical/Validator custom equals; coag uses `relevantTestsKey` |
| Coag BT/CT / result editing | Stable field callbacks; fields included in compare list |
| InventoryAdjustment multi-user live sync loss | Accepted; local save still mirrors UI |
| ESR/Serology/Rapid/Urine still full row cost | Documented follow-up — not a regression |
| Master `selectedTests` array identity | Compare uses reference equality (same as prior object churn); urgent/edit still update |

---

## 10. Production readiness score

**8.2 / 10**

- InventoryAdjustment change is small, isolated, and aligned with query audit.
- Memo coverage hits the highest-traffic floor registers + Validator + Critical + Master table.
- Residual gap: four Backroom registers without memo (intentional risk control).
- Recommend smoke test: Biochem scan/save/critical, Coag BT/CT save, Blood Group save, Critical report flow, Inventory Adjustment save + remount.

---

## Validation checklist (engineering)

| Check | Status |
|-------|--------|
| Identical UI / workflow (targeted surfaces) | Intended — no business logic edits |
| Identical writes / validation / deduction | Untouched |
| Identical timestamps | Untouched |
| Engineering telemetry / listener attribution | getDocs still via `trackedGetDocs`; listener count −1 for Adjustment only |
| No Owner incremental / other Wave 3 items | Confirmed out of scope |
