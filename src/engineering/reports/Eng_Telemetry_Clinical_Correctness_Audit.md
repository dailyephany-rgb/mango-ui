# Engineering Telemetry ↔ Clinical Correctness Audit

**Date:** 2026-08-09  
**Scope:** Telemetry emit path + Engineering dashboard vs clinical instrumentation  
**Mode:** Observer only — no code changes  

Interactive canvas: [eng-telemetry-clinical-correctness-audit.canvas.tsx](/Users/naka/.cursor/projects/Users-naka-Desktop-mango-ui/canvases/eng-telemetry-clinical-correctness-audit.canvas.tsx)

**Overall correctness: 7.8 / 10**

---

## Verdict

Dashboard data is **mostly correct** relative to what clinical pages emit. Engineering Firebase is isolated from clinical data. Primary clinical listens go through `trackedOnSnapshot` / `trackedGetDocs`, so Active / Waiting / first-snapshot / timeouts / daily merge rolls match the instrumentation.

Caveats are **aggregation and labeling**, not inventing clinical numbers.

---

## Pipeline (correct)

1. Clinical → `trackedFirestore` / shared hooks  
2. `EngTelemetry.track*` → buffer  
3. Heartbeat → `eng_device_status` (live)  
4. Flush → `eng_listener_daily`, `eng_firestore_*`, `eng_page_loads`, …  
5. Dashboard `useEngData` → Engineering Firebase only  

`activeListeners` = `listenerWatch` Map size (tracked streams only).

---

## Clinical coverage (OK)

| Surface | Instrumentation | Dashboard |
|---------|-----------------|-----------|
| Dept registers (triad) | `useMasterDeptSnapshots` → tracked ×3 | Active 3 when register tab enabled |
| Owner | shared master + tracked dept | Correct single shared master listen |
| Critical | tracked (+ dept where) | 1 stream; docs drop when dept scoped |
| Validator / ICC / BloodGroup | tracked | OK |
| InventoryAdjustment | `trackedGetDocs` | Shows as getDocs, **not** active listener |
| Inventory machine tabs | `subscribeInventoryByMachines` → tracked | 1 listen per machine |

---

## What’s correct

- Per-device active / waiting / timeouts / recreates / retries  
- First-snapshot timing (page_loads + listener_daily)  
- Period **Avg merge** from `listener_merge` flush path  
- Adjustment no longer keeps a live listener  
- Owner shared master not N× counted  
- Triad `enabled=false` correctly drops active count  

---

## Gaps

| ID | Sev | Issue |
|----|-----|--------|
| G1 | Medium | Fleet **Active** = sum of `activeListeners` on **all** `deviceStatus` rows (stale/offline last values included) → overstated |
| G2 | Medium | Live heartbeat **avgMergeMs** often empty — `markListenerUpdate` not given `mergeMs`; daily Avg merge still OK |
| G3 | Low | Field `listenerUpdatesPerMin` misnamed; UI already says “Updating streams” |
| G4 | Low | Live docs held = sum across streams (triad ≠ unique patients) — subtext OK |
| G5 | Low | Firestore `queryCount` = events (first + sampled incremental + getDocs) |
| G6 | Low | Component `moduleId` unknown without `EngComponent` mount |

---

## Recommended fixes (optional)

1. **Safe:** `sumFleet` only `devicePresence === "online"`  
2. **Safe:** Wire mergeMs into listenerWatch / heartbeat cost  
3. **Safe:** Rename misleading field (or leave; UI is fine)  
4. **Safe:** Label Firestore page as “query events”

---

## Practical trust guide

| Trust | Treat carefully |
|-------|-----------------|
| Per-device Active / Waiting | Fleet Active sum (until G1) |
| First snap / timeouts / daily tables | Live device Avg merge |
| getDocs vs listener distinction | Absolute “docs held” as unique patients |
