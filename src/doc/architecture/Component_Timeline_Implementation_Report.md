# Component Timeline — Implementation Report

**Phase:** Engineering Dashboard — Component Timeline  
**Date:** 2026-08-07  
**Constraint:** Observer-only. No clinical query / save / validation / inventory / Owner calculation changes.

---

## Build result

`npm run build` — **SUCCESS** (vite, exit 0). Pre-existing warning only: duplicate `reportedAt` key in `CriticalAlertDashboard.jsx` (unchanged clinical noise).

---

## Collections added

| Collection | Purpose |
|------------|---------|
| `eng_components` | **One document per page load**, keyed by `loadId`. Contains `components[]` breakdown. |

`eng_page_loads` now also stores `loadId` (same id as doc id) so Timeline ↔ Components always match.

---

## Telemetry added

| Piece | Role |
|-------|------|
| `componentCatalog.js` | Expected Tier-1 slots per page (“Not Mounted” fill-in) |
| `componentTimeline.js` | In-memory session: mount / render / snapshot attribution / breakdown |
| `EngComponent.jsx` | `React.Profiler` + mount effect; no-ops when kill switch off |
| `EngTelemetry` | `loadId`, `componentMount/Render/Unmount/Phase`, `pushComponentBreakdown` |
| `flush.js` | `flushComponents()` → `eng_components` |
| `bootstrap.js` | Push breakdown on leave; Engineering shell soft-emit |

**Kill switch:** `mango.eng.telemetry=0` → no mounts recorded, no eng writes, wrappers still render children.

---

## Dashboard additions

- New tab **Components** immediately below **Timeline** (`EngineeringApp.jsx`)
- `ComponentsPage.jsx` — expandable load rows → component table (Mount / Render / Snapshot / Ready / Total / Status)
- Global filters reused (date / dept / device / build / search)

Timeline unchanged (page-level only). Components unchanged as separate tab (no merge).

---

## Files modified / added

**Added**

- `src/engineering/telemetry/componentCatalog.js`
- `src/engineering/telemetry/componentTimeline.js`
- `src/engineering/ui/EngComponent.jsx`
- `src/engineering/dashboard/ComponentsPage.jsx`

**Engineering core**

- `src/engineering/constants.js` — `components: "eng_components"`
- `src/engineering/telemetry/EngTelemetry.js`
- `src/engineering/telemetry/flush.js`
- `src/engineering/telemetry/bootstrap.js`
- `src/engineering/telemetry/retention.js`
- `src/engineering/dashboard/EngineeringApp.jsx`
- `src/engineering/firestore.rules.engineering` (comment list)

**Observer wraps only (no query/save edits)**

- `src/main.jsx`, `src/mango.jsx`
- `src/biochem_main/BiochemistryMain.jsx`
- `src/haem/Haematology.jsx`
- `src/coagulation/CoagulationMain.jsx`
- `src/backroom/BackroomMain.jsx`
- `src/backroom/BloodGroupRegister.jsx` (retesting mount mark only)
- `src/owner/OwnerApp.jsx`
- `src/ValidatorUI/ValidatorDashboard.jsx`
- `src/critical/CriticalAlertDashboard.jsx`
- `src/inventory-command-center/InventoryCommandCenter.jsx`

---

## Example `eng_components` document

```json
{
  "loadId": "a1b2c3d4-….…_1723123456789",
  "ts": 1723123456789,
  "day": "2026-08-07",
  "deviceId": "…",
  "page": "Biochemistry",
  "department": "Biochemistry",
  "buildId": "dev",
  "totalMs": 689,
  "hung": false,
  "components": [
    {
      "name": "Biochemistry.jsx",
      "type": "Page",
      "parent": null,
      "mounted": true,
      "mountMs": 8,
      "renderMs": 12,
      "firstSnapshotMs": 182,
      "mergeMs": null,
      "filterMs": null,
      "sortMs": null,
      "virtualRenderMs": null,
      "readyMs": 182,
      "totalMs": 182,
      "status": "ok",
      "mountedAt": 5
    },
    {
      "name": "Inventory Tab",
      "type": "Tables",
      "parent": "Biochemistry.jsx",
      "mounted": false,
      "mountMs": null,
      "renderMs": null,
      "firstSnapshotMs": null,
      "status": "not_mounted"
    },
    {
      "name": "Hormones Tab",
      "type": "Page",
      "parent": "Biochemistry.jsx",
      "mounted": false,
      "status": "not_mounted"
    }
  ]
}
```

Lazy tabs opened **after** page-load finalize refresh the same `loadId` doc (merge).

---

## Regression / clinical verification

| Check | Result |
|-------|--------|
| Firestore queries unchanged | Yes — no edits to query builders / `where` / `orderBy` / collection names |
| Save / validate / inventory deduction / Owner calculators | Untouched |
| Rendering behaviour | Children identical; only transparent `Profiler` / observer wrappers |
| Telemetry off | Probes no-op; clinical UI unchanged |
| eng_* only | Writes only `eng_page_loads` (+loadId) and `eng_components` |
| Build | Pass |

---

## Success criteria mapping

| Criterion | How met |
|-----------|---------|
| One Components record per Timeline load | Shared `loadId` doc id |
| Not Mounted ≠ 0ms | Catalog slots with `mounted: false`, UI shows “Not Mounted” |
| Major components only | Catalog + EngComponent at shells (~5–15/page) |
| Separate from Timeline | Own tab under Timeline |
