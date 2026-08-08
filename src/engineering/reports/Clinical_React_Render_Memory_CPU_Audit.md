# Clinical React Render & Memory/CPU Audit

**Mango UI · Clinical / Owner / Inventory / Validator only**  
**Engineering dashboards excluded**  
**Audit only — no code changes in this report**

Generated: 2026-08-08  

| Score | Value |
|-------|-------|
| React render health | **7.0 / 10** |
| Memory / CPU health | **6.4 / 10** |
| Combined | **6.7 / 10** |

Interactive canvas: [clinical-react-render-memory-cpu-audit.canvas.tsx](/Users/naka/.cursor/projects/Users-naka-Desktop-mango-ui/canvases/clinical-react-render-memory-cpu-audit.canvas.tsx)

---

## Executive summary

Department registers are **subscription-stable** and already use virtualization, tab-gated triad listeners (`enabled`), incremental master store + `startTransition`, and Owner shared master. Remaining cost is mostly **CPU after each snapshot** (full patient merge / Owner republish) and a few surfaces that still filter in render and paint full tables (Critical, Validator, MasterAdmin).

**Zero** `React.memo` / `memo()` usages in clinical UI trees.

### Top findings

| Finding | Class | Severity | Wave |
|---------|-------|----------|------|
| MasterAdmin full-collection listen + full DOM table | Memory + CPU + listeners | Critical* | 3 |
| Owner `publish()` full merge+KPI+SLA on every master/dept snap | CPU + render fan-out | High | 2–3 |
| Triad → new `deptDocs`/`savedSet` → O(n) patients rebuild | CPU / GC | High (by design) | 3 |
| Critical unused `now` 60s timer + unmemoized filter/sort | Wasted renders | Medium | 1 Safe |
| No memoized row components; per-row selectedTests filter in `renderRow` | Render CPU | Medium | 1–2 |
| Validator filter-in-render + full snap replace + no virtualization | CPU + DOM | Medium | 1–2 |
| InventoryAdjustment full-collection listen | Listeners + memory | Medium | 3 |

\*Critical when MasterAdmin is opened against a large collection on a floor device.

---

## Method

Static code review of clinical `src/` (registers, Owner `dataFetcher_*` + pages, ICC, inventory tabs, Validator, MasterAdmin). No Chrome profiler session attached — severity is structural (effect deps, setState fan-out, O(n) work in render/snapshot handlers).

Related prior work: Clinical Firestore Query Lifecycle Audit (6.8/10); Critical Wave 1 dept Firestore filter already applied.

---

## React ↔ Firestore interaction model

| Stage | What happens | Impact |
|-------|--------------|--------|
| 1. Arm listeners | `useMasterDeptSnapshots` / Owner / ICC / Validator effects | Stable deps in most clinical paths |
| 2. Snapshot | Incremental / `docChanges` → `setState` (often `startTransition`) | 1–2 React updates per burst |
| 3. Derive | `patients` / `filteredPatients` useMemo **or** Owner `publish()` | O(n) merge; Owner also KPI/SLA/staff |
| 4. Commit | `VirtualizedTableBody` ≈ viewport; others map all rows | Registers bounded; Validator/Admin/Critical unbounded |
| 5. Interaction | Search / scan / remark | Memoized filters on registers; remark maps full `masterEntries` |

**Key insight:** Most clinical jank is **rerender after a live snapshot**, not accidental listener recreation.

### Subscription recreation risk

| Surface | Effect deps | Resubscribe risk | Notes |
|---------|-------------|------------------|-------|
| `useMasterDeptSnapshots` | collection, dept, dates, `enabled` | Low | Inline callbacks intentionally omitted from deps |
| Biochem / Haem / Coag | `enabled` ↔ register tab | Low (good) | Triad pauses off register |
| HormonesMain | dates (always on while mounted) | Low | Only mounted on hormones tab (lazy) |
| BloodGroup | dates + `activeTab` | Low | Testing XOR retesting |
| Critical | dates + `deptFilter` | Low | Intentional rebind; uses `dept+flaggedAt` index |
| Validator | collection + dates | Low | Full array replace each snap |
| ICC live | `needsLive` | Low | History tabs = `getDocs` |
| InventoryAdjustment | `[]` | None | Full collection for mount lifetime |
| MasterAdmin | `activeColl` | Med | Entire collection |
| Owner fetchers | dateRange via subscribe | Low | Shared master; full `publish` each snap |

`OwnerContext` creates a new `value={{...}}` each Provider render — Low impact because Provider usually only re-renders when date/source change; still a Safe `useMemo` hygiene fix.

---

## Memory / CPU hotspots

| Location | Work | Cost | Mitigation class |
|----------|------|------|------------------|
| Owner `dataFetcher_*` `publish()` | filter → merge → unify → SLA → KPIs → staff | High | Debounce / skip unchanged / lazy charts |
| `publishDeptState` | Rebuild `docsMap` + `savedSet` from all dept docs | Med–High mid-day | Structural sharing (Medium risk) |
| `filterAndSortRegisterPatients` | `parseEntryDate` inside sort comparator | Med on large days | Cache `dateMs` (Safe) |
| MasterAdmin `filteredData.map` | Full collection + full table DOM | Critical if used | Date-scope + virtualize |
| Critical `filteredAlerts` | filter+sort every render; dead `setInterval` | Med | useMemo + remove timer |
| Validator `currentData` | filter every render; full table | Med | useMemo + virtualize |
| DeptInventory categorize | Large name lists per inventory snap | Med | `Set` lookup (Safe) |
| `VirtualizedTableBody` effect | Depends on full `items` identity | Low but frequent | Depend on `items.length` |
| Per-row `selectedTests.filter/map/join` in `renderRow` | Repeated for visible rows each redraw | Med | Precompute in patients useMemo |

Spreading `{...entry, ...saved}` on every merge creates O(n) short-lived objects per snapshot — virtualization limits DOM, not allocation rate.

---

## Already good

- `VirtualizedTableBody` on Biochem, Hormones, Haem, Coag, Backroom registers (≥40 rows)
- Triad `enabled` pause when not on register tab (Biochem / Haem / Coag)
- Lazy tab mounts (Hormones / Inventory / Adjustment; Backroom registers)
- `incrementalDocStore` + `startTransition` on master path
- `patients` + `filteredPatients` useMemo on registers
- `subscribeSharedMasterRegister` across Owner fetchers
- ICC history on `getDocs`; live stock correctly realtime
- BloodGroup single-mode listener
- Critical dept Firestore filter (Wave 1 query plan — done)

---

## Scorecard

| Dimension | Score | Note |
|-----------|-------|------|
| Listener stability | 8.5 | Few accidental resubscribes |
| Tab / visibility gating | 8.0 | Triad + Backroom + ICC history |
| DOM cost (registers) | 7.5 | Virtualized; Validator/Admin lag |
| Derived-state CPU | 5.5 | Owner + full patients rebuild |
| Memo / React.memo discipline | 4.5 | useMemo yes; memo rows no |
| Dead / wasted render work | 6.0 | Critical timer; some render filters |
| **Combined** | **6.7** | Weighted clinical floor usage |

---

## Roadmap

### Wave 1 — Safe ✅ done (2026-08-08)

1. Critical: remove unused `now` + 60s interval  
2. Critical: `useMemo` for `filteredAlerts` + counts + dept list  
3. Validator: `useMemo` for `currentData`  
4. Precompute selected-tests display string in patients `useMemo` (Biochem/Hormones/Haem; Coag `relevantTests`)  
5. `filterAndSortRegisterPatients`: cache date before sort  
6. `OwnerContext` value `useMemo`  
7. `VirtualizedTableBody`: drop full `items` from effect deps (use length)

### Wave 2 — Low ✅ done (2026-08-08)

1. Validator `VirtualizedTableBody` (+ scroll container)  
2. Owner `publish` debounce 75ms via `createDebouncedPublish` (all dataFetcher_*; source filter uses `publishNow`)  
3. DeptInventory categorize via module-level lists/`Set`  
4. `useCallback` `renderRow` on ValidatorTable (register row callbacks skipped — handlers not stable)  

### Wave 3 — Medium

1. MasterAdmin date-scoped queries + virtualize  
2. Owner incremental merge / skip unchanged KPI payloads  
3. `React.memo` register row components  
4. InventoryAdjustment scoped query or `getDocs` (aligns with query audit)

### Hold / out of scope

- One global master + client filter all depts  
- Changing clinical save / validate / inventory deduction logic  
- Removing live triad without product sign-off  

---

## Evidence anchors

- `src/shared/hooks/useMasterDeptSnapshots.js`
- `src/shared/components/VirtualizedTableBody.jsx`
- `src/shared/utils/filterRegisterPatients.js`
- `src/owner/lib/dataFetcher_biochem_main.js` (pattern shared by other Owner fetchers)
- `src/owner/OwnerContext.jsx`
- `src/critical/CriticalAlertDashboard.jsx`
- `src/ValidatorUI/ValidatorDashboard.jsx`
- `src/master_admin/MasterAdmin.jsx`
- `src/inventory/InventoryAdjustmentTab.jsx`
- `src/biochem_main/BiochemistryMain.jsx` (model for register merge + virtual table)
