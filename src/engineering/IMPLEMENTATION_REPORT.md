# Engineering Operations Platform — Implementation & Regression Report

**Date:** 2026-08-07  
**Spec:** `src/doc/architecture/Engineering_Telemetry_Platform_EDS.md`  
**Principle:** Observer only — clinical workflows must be identical when eng is off/offline.

---

## Summary

Implemented the Engineering Operations Platform as an isolated observer:

- Separate Engineering Firebase app (`mango-engineering` via env / options)
- EngTelemetry SDK (buffer, sample, flush, kill switch)
- Heartbeats → `device_status` overwrite + `heartbeat_hourly`
- Observation wiring in `trackedFirestore` + `firebaseConfig` dynamic bootstrap
- Full Engineering Dashboard MPA (`engineering.html`) with all EDS §13 pages
- Failure isolation via `safeRun` / no await on clinical path / kill switch

---

## Files created

| File | Reason |
|------|--------|
| `src/engineering/constants.js` | Collection names, intervals, keys |
| `src/engineering/firebaseEngConfig.js` | Separate Firebase app init |
| `src/engineering/engFirebase.options.js` | Optional local eng credentials |
| `src/engineering/eng.env.example` | Env template |
| `src/engineering/firestore.rules.engineering` | Eng project rules template |
| `src/engineering/index.js` | Public exports |
| `src/engineering/health/scores.js` | Presence + fleet health score |
| `src/engineering/telemetry/killSwitch.js` | `mango.eng.telemetry` |
| `src/engineering/telemetry/safeRun.js` | Swallow errors |
| `src/engineering/telemetry/deviceId.js` | Stable device UUID |
| `src/engineering/telemetry/buffer.js` | Ring + session spill |
| `src/engineering/telemetry/flush.js` | Batched writes to eng Firestore |
| `src/engineering/telemetry/heartbeat.js` | 30s/120s heartbeat |
| `src/engineering/telemetry/EngTelemetry.js` | SDK surface |
| `src/engineering/telemetry/bootstrap.js` | Auto-start on import |
| `src/engineering/dashboard/*` | Full OPS UI |
| `src/main_engineering.jsx` | MPA entry |
| `engineering.html` | HTML shell |

## Files modified

| File | Reason | Risk |
|------|--------|------|
| `src/firebaseConfig.js` | Dynamic import eng bootstrap (mirrors perf) | **Low** — catch, async |
| `src/shared/firestore/trackedFirestore.js` | Emit eng events when eng enabled; passthrough if both off | **Medium** — wrapper path |
| `src/performance/firestoreMetrics.js` | Page identity for `engineering` | **Low** |
| `vite.config.js` | Add `engineering` build input | **Low** |

---

## Clinical isolation checklist

| Check | Status |
|-------|--------|
| Clinical logic / saves / validation / inventory / KPI unchanged | ✓ (no edits) |
| Existing clinical UI unchanged | ✓ |
| Clinical Firestore collections unchanged | ✓ |
| Eng dashboard does not import clinical `db` | ✓ |
| Telemetry never awaited on clinical path | ✓ |
| Kill switch `mango.eng.telemetry=0` → SDK no-op / wrappers passthrough when perf also off | ✓ |
| Eng crash/offline → clinical continues | ✓ (try/catch + local buffer) |

---

## Configure Engineering Firebase

1. Create Firebase project (e.g. `mango-engineering`).
2. Enable Firestore.
3. Deploy rules from `firestore.rules.engineering` (tighten auth for production).
4. Either:
   - Set `VITE_ENG_*` in `.env.local`, or
   - Fill `src/engineering/engFirebase.options.js`.
5. Open `/engineering.html` — should show project id in Health header.
6. Browse a clinical page with telemetry enabled → Devices board updates within ~30s.

Without eng credentials, clinical pages still buffer locally; dashboard shows local-only mode.

---

## Kill switches

| Key | Effect |
|-----|--------|
| `localStorage.mango.eng.telemetry = "0"` | Eng SDK disabled |
| `localStorage.mango.perf.monitor = "0"` | Clinical perf layer disabled (unchanged) |
| Both `"0"` | `tracked*` = pure Firebase passthrough |

---

## Rollback

1. Remove eng import from `firebaseConfig.js`.
2. Revert `trackedFirestore.js` to prior passthrough/perf-only version.
3. Remove `engineering` from `vite.config.js` / delete eng HTML entry.
4. Or set kill switch and leave code dormant.

---

## Remaining TODOs / constraints

1. **No eng Firebase project credentials in repo** — must be provisioned by ops (`VITE_ENG_*` or options file). Until then: local buffer only.
2. **Clinical React Error Boundaries** not wrapped on every `main_*.jsx` — would change clinical error UX; window error hooks + Eng dashboard boundary cover EDS intent without clinical UX change. Optional follow-up.
3. **Owner/hooks injection** (`useMasterDeptSnapshots`, Owner fetchers) — covered via `trackedOnSnapshot` already used by those paths; no extra body instrumentation (per EDS).
4. **`perf_daily` dual-write** still exists in clinical project (Phase-0). EDS: freeze after eng cutover — not removed yet to avoid breaking Performance dashboard.
5. **Ops auth** for Engineering Dashboard — Phase 1 open; tighten with Firebase Auth allowlist later.
6. **Retention Cloud Function** — not deployed; manual/admin cleanup later.
7. **FirstSnapshotMs into eng page events** — page load capture is parallel; first-snapshot timing still primarily in clinical perf store (eng gets query `snapshot_first` events).

---

## Potential edge cases

- Eng Firebase misconfigured → silent local buffer growth; drop oldest non-errors at 500.
- Perf monitor off + eng on → wrappers still instrument for eng only.
- StrictMode double-mount → possible double listener open events in eng (annotated by design).
- `performance.memory` missing in Firefox/Safari → Memory page empty (expected).
- Increment on `durationMaxMs` not used (last-write max) — max may under-represent across devices until dashboard recompute.

---

## Manual testing checklist

- [ ] Clinical page loads with `mango.eng.telemetry=0` — Network tab: no eng project calls
- [ ] Clinical save / scan / validate / inventory deduction unchanged
- [ ] Enable telemetry; open Biochem — buffer grows; heartbeat attempts if configured
- [ ] Open `/engineering.html` — all nav pages render
- [ ] Settings: disable/enable kill switch; audit row if eng configured
- [ ] Block eng host / wrong API key — clinical page still works
- [ ] `trackedOnSnapshot` doc counts match pre-change behaviour (same queries)
- [ ] Build: `npm run build` includes `engineering.html`

---

## Risk summary

| Area | Level |
|------|-------|
| Clinical workflow | Low (observer-only touches) |
| trackedFirestore | Medium (mitigated by dual kill switch + passthrough) |
| Eng cost | Ops project only; configure before fleet rollout |
| Dashboard | Low clinical risk |
