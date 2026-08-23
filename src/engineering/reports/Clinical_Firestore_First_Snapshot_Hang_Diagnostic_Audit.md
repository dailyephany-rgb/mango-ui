# FIRESTORE CLINICAL PAGE HANG — REPOSITORY-WIDE DIAGNOSTIC AUDIT

**Mango UI · Diagnosis only — no code was changed**  
**Date:** 22 August 2026  
**Scope:** Why clinical pages sometimes hang/buffer indefinitely and fail to receive their FIRST Firestore snapshot.

This report is a diagnosis-only audit of the current repository. No code was changed.

The hang is **not proven to be “persistence is broken.”** What the code *does* prove is: clinical UI waits forever for a master first snapshot that Firestore sometimes never delivers, telemetry can mark the page hung while that listener is still open, and recovery can run more than one recreate path for the same failure without ever flipping the page out of loading.

---

## A. CONFIRMED PROBLEMS

Only problems proven from repository code.

### A1. Clinical loading never clears unless master snapshot or master `onError`

| | |
|---|---|
| **File** | `src/shared/hooks/useMasterDeptSnapshots.js` |
| **Function** | `useMasterDeptSnapshots` |
| **Lines** | 53, 97–99, 138–158, 314–324 |
| **Execution path** | Mount → `setLoading(true)` on first listen → `trackedOnSnapshot(masterQuery)` → `setLoading(false)` only in master `onNext` or master `onError` |
| **Problem** | If the SDK never calls `onNext` or `onError`, `loading` stays `true` forever. |
| **Evidence** | No timeout, hung, or retry-exhausted path sets `loading` or `masterError`. 30s auto-retry in `trackedOnSnapshot` resets `first` and re-attaches; it does not touch React `loading`. After `maxAutoRetries()` (3), `scheduleAutoRetry` returns and the wrapper stays open (`closed === false`). |
| **Severity** | **P0** — this is the UI hang. |

Callers that gate the table on this flag include `BiochemistryMain.jsx` (~512), `Haematology.jsx` (~493), `CoagulationMain.jsx` (~636), `HormonesMain.jsx` (~428).

### A2. Telemetry “hung / Never arrived” does not cancel the listener

| | |
|---|---|
| **File** | `src/engineering/telemetry/bootstrap.js` |
| **Function** | `capturePageLoad` → `finish("timeout15")` |
| **Lines** | 151–237, especially 237 |
| **Execution path** | 15s timer → `finish("timeout15")` → `classifyPageLoadOutcome` can yield `HUNG` / `NO_SNAPSHOT_TIMEOUT` → `EngTelemetry.trackPageLoad` |
| **Problem** | Finalize is observer-only. The Firestore listen remains waiting. |
| **Evidence** | `finish` never calls unsubscribe, `recreate`, or `setLoading`. `trackedFirestore.js` 10s/30s timers only mark watch state and may `scheduleAutoRetry`; they do not unmount React. |
| **Severity** | **P0 for diagnosis** — explains “Hung load” + “First Snapshot — Never arrived” + “Interactive — Not reached” while the page still buffers. |

Dashboard copy is in `src/engineering/dashboard/perfViews.js` 69–118.

### A3. Same INTERNAL ASSERTION can drive **two** recovery machines

| | |
|---|---|
| **Files** | `trackedFirestore.js` `reportListenerError` / `scheduleAutoRetry` (261–300, 443–447); `listenerRecovery.js` `installListenerRecoveryHooks` / `attemptAssertionRecovery` (129–147, 153–168) |
| **Execution path** | Listener `onError` **and/or** `window` `error`/`unhandledrejection` |
| **Problem** | Auto-retry **recreates the inner listen** on the existing wrapper; assertion recovery **remounts the whole triad** via `recoverGen`. Those two were deliberately de-duplicated vs `retryWaitingPageListeners`, but **not** vs each other. |
| **Evidence** | `isLikelyNetworkFirestoreError` already returns true for assertions (66–69). `reportListenerError` still `scheduleAutoRetry` for assertions (443–447). Window handler also `notifyListenerRecovery("assertion")` → `useMasterDeptSnapshots` `setRecoverGen` (61–64, 327–335). Comments at `listenerRecovery.js` 28–31 and 133–134 only prevent `retryWaiting` + remount, not `scheduleAutoRetry` + remount. |
| **Severity** | **P1** — brief double-subscribe is certain if both fire before React cleanup; leaked duplicates if `unsubInner()` is a no-op (SDK-unhealthy). Not proven as a permanent leak. |

### A4. Retry exhaustion leaves the page loading with a live waiter

| | |
|---|---|
| **File** | `trackedFirestore.js` |
| **Function** | `scheduleAutoRetry` |
| **Lines** | 261–277, 349–350 |
| **Problem** | After 3 auto-retries, no ERROR UI, no further recreate, listener still `waiting`. |
| **Evidence** | `if (autoRetryCount >= maxAutoRetries()) { … return; }` does not `unsubInner`, does not set `closed`, does not notify the hook. |
| **Severity** | **P0** for “retry happened but still hung.” |

### A5. Nested Hormones on Biochemistry keeps a second triad after tab return

| | |
|---|---|
| **Files** | `BiochemistryMain.jsx` 126–133, 694–701; `HormonesMain.jsx` 102–116; `useVisitedTabs.jsx` 18–27 |
| **Execution path** | Biochem triad `enabled: activeTab === "biochem"` → visit Hormones (`StickyTabPanel` keeps `HormonesMain` mounted) → return to Biochem |
| **Problem** | Parent triad **re-subscribes** (3 listeners). Nested `HormonesMain` has **no `enabled`** so its 3 listeners **never pause**. Six clinical listens on one page. |
| **Evidence** | `StickyTabPanel` uses `display:none`, not unmount. Hormones hook always runs. Parent `enabled` only false while Hormones tab is active. |
| **Severity** | **P1** — extra WebChannel/IndexedDB load on the same client; can worsen first-snapshot starvation. Not the same query duplicated, but two full triads. |

### A6. Clinical `initializeFirestore` errors are all treated as “already initialized”

| | |
|---|---|
| **File** | `src/firebaseConfig.js` |
| **Lines** | 33–44 |
| **Problem** | Any throw (quota, IndexedDB, already-initialized) falls back to `getFirestore(app)` and logs success-ish reuse. |
| **Evidence** | `catch (err)` does not inspect `err`. Persistence failure vs HMR cannot be distinguished. |
| **Severity** | **P2** for diagnosis (hides the real init failure); fallback *might* still yield a usable `db`. |

### A7. Page cannot distinguish LOADING vs hung vs reconnecting vs ERROR

Clinical UI: spinner while `loading`; `masterError` only after master `onError` (and only after `loading` is already false). Dept/critical errors are `console.error` only (`useMasterDeptSnapshots.js` 240–245, 306–311). Watchdog overlay is engineering-only (`FirstSnapshotWatchdog.jsx` 53).

**Severity:** **P1** (operators see buffer forever; “Reconnecting…” is the watchdog, not a Firestore reconnect event).

---

## B. PROBABLE PROBLEMS

Strongly supported but requiring runtime confirmation.

### B1. First snapshot never arrives because the **clinical Firestore client / WebChannel** stalls

**Evidence:** Telemetry language and timeout design assume this (`perfViews.js` 74–75 “WebChannel hung (iPad Wi‑Fi pattern)”; `trackedFirestore.js` 30s then recreate). Errors classified: `unavailable`, `deadline`, `network`, `offline`, `failed to fetch`, `webchannel`, `transport` (`listenerRecovery.js` 66–75). Auto-retry exists **because** `onError` is not guaranteed.

**Why probable:** Matches intermittent success, long loads, and “Never arrived” on **all** tracked listeners (page `noteFirstSnapshot` is first *any* listen — hung page-load means **no** wrapper got `wrapNext`). That is a client/transport symptom, not a single React flag.

**Runtime test:** Chrome/Safari Network + Firestore debug logs; correlate `listener_open` vs `first_snapshot` vs `unavailable` / assertion on the **clinical** app (`vasundhara-4c6e5`), not `mango-engineering`.

**Severity:** **P0** if confirmed on device.

### B2. `INTERNAL ASSERTION FAILED` is clinical SDK, then recovery remounts while the client is still sick

**Evidence:** Assertion detector is generic (`listenerRecovery.js` 52–59). Hooks are installed from clinical `trackedFirestore.js` (58–63) and window-level. Remount creates **new** `onSnapshot`s against the **same** `db` (`firebaseConfig.js` `db`). If the SDK instance is poisoned, new listens also never snapshot → hang continues after “Reconnecting…”.

**Runtime test:** Stack projectId / `firestore.googleapis.com` vs eng project; whether assertions cluster with IndexedDB `QuotaExceededError`.

**Severity:** **P0** when it occurs.

### B3. Multi-tab `persistentMultipleTabManager` + Safari/iPad IndexedDB contention

**Evidence:** Clinical cache is explicitly multi-tab (`firebaseConfig.js` 35–38). Many MPA HTML entries share origin IndexedDB. Architecture **can** produce lease/init issues; the repo does **not** log lease failures.

**Runtime test:** One vs many tabs; `indexedDB.databases()` / Firestore persistence logs; compare hang rate.

**Severity:** **P1** (probable contributor, not proven root).

---

## C. POSSIBLE PROBLEMS

Plausible but not demonstrated. Do not overstate these.

- **IndexedDB `QuotaExceededError` on clinical persistence** — SDK may surface as assertion. Repo never names `QuotaExceededError` on the clinical path. Engineering `RESOURCE_EXHAUSTED` (`engWriteHealth.js`) is a **different** quota (Spark writes), not DOM `QuotaExceededError`.
- **sessionStorage quota** (`buffer.js` `spillToSession`, `performanceStore.js` persist) — usually `try/catch` / `safeRun`. Unlikely to stop `onSnapshot`. `usePersistedObjectState` catches and `console.error`s.
- **Two Firebase apps per page** (clinical DEFAULT + named eng) — extra `getFirestore` client (`firebaseEngConfig.js` 171–191). Possible network/CPU contention on iPad; not shown to block clinical snapshots.
- **StrictMode double subscribe** — `mountEngApp.jsx` 42–43, **DEV only**. Production iPads: **not** this.
- **HMR leftover Firestore** — `getFirestore` fallback after `initializeFirestore` throw. DEV. Production: **not** this.
- **Telemetry `noteFirstSnapshot` from dept/critical before master** — page load would **not** look hung while table still shows “Loading…” if only master is stuck. Observed “Never arrived” implies **no** listen snapped, so this mismatch is **not** the usual reported incident.
- **`retryWaitingPageListeners` + remount** — authors blocked this for `online` vs `assertion`. Still possible if a human Retry (`FirstSnapshotWatchdog` 85) overlaps `recoverGen` from assertion.

---

## D. RULED-OUT CAUSES

Explicitly listed hypotheses the repository evidence does **NOT** support.

| Hypothesis | Why ruled out |
|---|---|
| Engineering telemetry **is** the hang | Wrappers are fire-and-forget (`safeRun`); 15s hung is classify-only; watchdog Retry only calls `recreate` on **waiting** tracked listens. |
| Eng Firebase init **replaces** clinical app | Clinical is `[DEFAULT]` / `vasundhara-4c6e5`; eng is named `mango-engineering__{projectId}` and blocklists clinical project (`firebaseEngConfig.js` 19, 175–186). |
| Clinical DEFAULT app double-`initializeApp` in one page | Guarded by `getApps().find(name === "[DEFAULT]")` (`firebaseConfig.js` 21–27). |
| `critical_alerts` or dept listen **blocks** the table | Comments + `setLoading(false)` only on master; Biochem only shows “Loading critical flags…” **after** `loading` is false (525–528). |
| Missing composite index as the **indefinite** hang | Index failures hit `onError` → `setLoading(false)` + `masterError`. Fast fail, not eternal spinner. |
| Unstable `dateFrom` object identity causing listen storms | `useRegisterFilters.js` stores **strings**; triad deps are primitives + `recoverGen`. |
| `retryWaitingPageListeners` **always** runs with `notifyListenerRecovery` | Online: retry waiting only (`listenerRecovery.js` 33–45, 179–180). Assertion: notify only (133–135). |
| Persistence **proven** as the root cause | Configured, but no repo path that logs persistence init failure or ties hangs to IndexedDB. **Not confirmed.** |
| Query shape change / cost as hang | Day-scoped triad is stable; hang is missing **callback**, not empty results (empty snapshot still clears loading). |
| Watchdog string exactly `"Reconnecting to listeners"` | Code says `"Reconnecting…"` / `"Firestore still not responding"` / `"Still loading…"` (`FirstSnapshotWatchdog.jsx` 129–135). Same feature, paraphrased in reports. |

---

## E. ROOT-CAUSE CHAIN

**Primary chain (most consistent with code + telemetry):**

```
Clinical Firestore listen armed (master + dept + critical)
        ↓
SDK never delivers first snapshot (WebChannel / unavailable / assertion / client unhealthy)
        ↓
useMasterDeptSnapshots.loading stays true  →  “Loading Biochemistry data…”
        ↓
15s page-load finalize: firstSnapshotMs null → HUNG / “Never arrived” / Interactive not reached
        ↓
10s/30s watch timeouts (telemetry); 30s scheduleAutoRetry (same query, max 3)
        ↓
Optional: INTERNAL ASSERTION → recreate() AND recoverGen remount
        ↓
Watchdog: “Reconnecting…” / “Firestore still not responding”
        ↓
If client still unhealthy or retries exhausted: still no snapshot → still loading
```

**Independent amplifier (Biochem after Hormones tab):**

```
Visit Hormones (sticky mount) → return to Biochem
        ↓
6 triad listeners on one Firestore client
        ↓
Higher chance of first-snapshot delay / client stress
```

**Independent diagnostic artifact (not a second hang mechanism):**

```
Listeners still waiting
        ↓
Telemetry already classified HUNG at 15s
```

---

## F. EXACT FILES / FUNCTIONS RESPONSIBLE

| File | Function | Lines | Problem | Evidence | Severity |
|------|----------|-------|---------|----------|----------|
| `useMasterDeptSnapshots.js` | `useMasterDeptSnapshots` | 53, 97–99, 138–158 | Indefinite `loading` | Only master next/error clear it | P0 |
| `BiochemistryMain.jsx` (and Haem/Coag/Hormones) | render | ~512 | Spinner gated on that flag | `{loading ? ( <p>Loading…` | P0 |
| `trackedFirestore.js` | `trackedOnSnapshot` | 261–300, 349–350, 650–695 | Retry doesn’t unblock UI; exhaustion leaves waiter | `if (closed \|\| !first)`; max 3 then return | P0 |
| `bootstrap.js` | `capturePageLoad`/`finish` | 151–237 | Hung telemetry ≠ cancel listen | `timeout15` only tracks | P0 |
| `listenerRecovery.js` | `attemptAssertionRecovery` + hooks | 129–190 | Remount on assertion | `setRecoverGen` subscribers | P1 |
| `trackedFirestore.js` | `reportListenerError` | 443–447 | Same failure also auto-retries | Overlaps remount | P1 |
| `BiochemistryMain.jsx` + `HormonesMain.jsx` | tab + hook | 133, 102–116, 694–701 | Second triad stays live | Sticky + no `enabled` | P1 |
| `firebaseConfig.js` | init | 33–44 | Persistence errors swallowed | empty `catch` | P2 |
| `FirstSnapshotWatchdog.jsx` | UI | 37–40, 129–135 | “Reconnecting…” from **our** recovery hint | `subscribeListenerRecovery` | P2 (UX) |
| `perfViews.js` | `buildWaterfall` | 69–118 | Labels for Never arrived / hung | Presentation of `finish()` | — |
| `listenerWatch.js` | `retryWaitingPageListeners` | 279–300 | Recreate waiting only; `unsub` then `attach` in `recreate` | Does not remount triad | OK if used alone |

---

## G. DUPLICATE LISTENER ANALYSIS

**CAN duplicate listeners occur?** **YES** (several meanings).

### 1. Same wrapper, sequential (intended, not stacked if `unsub` works)

```
fbOnSnapshot A
    ↓
timeout_30 / Retry / auto-retry
    ↓
recreate(): unsubInner() → attach() → fbOnSnapshot B
```

`recreate` always unsubscribes first (`trackedFirestore.js` 651–657, 691). **Permanent stack: UNCERTAIN** (depends on SDK `unsub`).

### 2. Recovery race (confirmed paths, brief overlap almost certain)

```
INTERNAL ASSERTION
    ↓
scheduleAutoRetry → recreate() → listen B on wrapper L1
    ↓
notifyListenerRecovery → recoverGen++ → effect cleanup: closed=true, unsub L1
    ↓
new effect → wrapper L2 → listen C
```

After React commit, **one triad of wrappers** should remain. Overlap of B and C is a real window. Leak only if cleanup `unsubInner` fails.

### 3. Biochem + Hormones sticky (confirmed, different queries, concurrent)

```
HormonesMain triad created
    ↓
activeTab back to biochem (Hormones stays mounted)
    ↓
parent triad created again
    ↓
6 listeners (not 3)
```

### 4. StrictMode DEV

Effect → cleanup → effect. `listenGenRef` prevents second `setLoading(true)`. Production: no.

### 5. `retryWaitingPageListeners` + `notifyListenerRecovery` for the same failure

**Not** the online/assertion design. **Can** still happen: assertion remount + user Retry, or assertion + 30s auto-retry (G2).

**`retryWaitingPageListeners` recreating before old listen closed?** It calls `e.recreate()`, which unsubs then attaches **synchronously**. It does **not** wait for SDK close. **Same-wrapper replace: YES. Two wrappers: NO** unless remount races (G2).

---

## H. FIRST-SNAPSHOT HANG ANALYSIS

**WHY CAN THE FIRST SNAPSHOT FAIL TO ARRIVE?**

| Layer | Verdict |
|---|---|
| **Firestore/client** | **PROBABLE.** Hung page-load requires **zero** `wrapNext` on any tracked listen. That is SDK/transport/client, not a single React flag. |
| **Listener lifecycle** | **CONFIRMED** that a missing callback ⇒ eternal loading. Lifecycle does not *prevent* the snapshot; it *fails open*. |
| **Recovery** | **CONFIRMED** it can remount/retry without healing a dead client; **CONFIRMED** exhaustion does not enter ERROR. |
| **React** | **Ruled out** as the usual identity-storm. **Confirmed** `enabled`/date/`recoverGen` recreate the triad **after** cleanup. Nested Hormones is extra load, not “snapshot callback swallowed.” |
| **Persistence** | **POSSIBLE** (IndexedDB / multi-tab). **Not confirmed.** Do not treat as the finding. |
| **Query** | **Ruled out** as silent hang (empty snap still fires `onNext`; bad index fires `onError`). |
| **UI/loading** | **CONFIRMED** master-only gate + no hung timeout in the hook = spinner until death of the tab. |

---

## I. MOST LIKELY ROOT CAUSE

**Ranked (A–J from the original audit prompt):**

| Rank | Cause | Confidence |
|---|---|---|
| **#1** | **J = C + E/I:** Clinical client never delivers first snapshot **and** UI/recovery have no terminal ERROR — page buffers indefinitely. Telemetry hung at 15s is accurate *as “no snapshot yet”*, not as “listener cancelled.” | **HIGH** that this pairing is what you observe |
| **#2** | **A/B (client unhealthy / assertion / IndexedDB)** keeping new listens dead after reconnect/retry; persistence is a **hypothesis**, not a proof | **MEDIUM** |
| **#3** | **F + G:** extra/overlapping listens (Hormones sticky; assertion remount + auto-retry) stressing an already slow client | **MEDIUM** |

**Not #1:** D query, H identity loops, engineering telemetry as the blocker.

**Why #1 is high:** The repository **proves** the wait-forever UI and **proves** hung telemetry without teardown. It **cannot** prove *why* the SDK is silent; that needs runtime. Intermittency + `unavailable` / assertion / iPad notes point at **C/A**, not a deterministic React bug.

---

## J. RECOMMENDED FIX ARCHITECTURE

**Do not write code here; order of change:**

1. **First-snapshot indefinite hang (UI contract)**  
   Give `useMasterDeptSnapshots` a terminal state: after N timeouts/retries, `loading=false` and `masterError` or `status=TIMEOUT` so the table/filter bar is usable and Retry is visible on the **clinical** page, not only the eng watchdog.

2. **Single recovery owner**  
   One trigger → one action: either `recreate()` **or** `recoverGen` remount, never both. Stop treating INTERNAL ASSERTION as both `scheduleAutoRetry` and `notifyListenerRecovery`.

3. **Retry exhaustion**  
   On max retries: close the listen, set ERROR/TIMEOUT, stop `waiting`. Do not leave a zombie waiter.

4. **Duplicate / extra listens**  
   Pass `enabled: activeTab === "hormones"` (or unmount Hormones) so sticky tabs cannot keep a second triad. Audit other sticky+nested hooks the same way.

5. **Loading vs reconnecting**  
   Clinical states: LOADING / RECOVERING / ERROR / OFFLINE / READY. Watchdog copy should match those, not imply a Firestore reconnect that did not happen.

6. **Unrecoverable client**  
   If assertion repeats on the same `db`, remounting hooks is not enough — you need a defined “client dead” policy (reload **as last resort**, or re-init Firestore). **Do not** flip persistence off as the first experiment without measuring IndexedDB/assertion correlation.

7. **Init errors**  
   Log the real `initializeFirestore` catch (already-initialized vs quota vs IDB). Fallback to `getFirestore` only for the already-initialized case.

8. **Telemetry**  
   Keep hung = “no `noteFirstSnapshot` before finalize.” Optionally attribute hung to **master** specifically so dept-only snaps cannot mark the page healthy while the table still loads.

---

## K. VALIDATION PLAN

| Test | Expected (healthy) | Current likely | Telemetry | Fix proven |
|---|---|---|---|---|
| 1. Fresh Biochemistry | Master snap; spinner ends; 3 waits → 0 | Sometimes never; spinner stays | `first_snapshot` on master; page not hung | Spinner ends; `firstSnapshotMs` set |
| 2. Fresh Haematology | Same, 3 listens | Same class of hang | Same | Same |
| 3. Biochem → Haem → Biochem (full navigation) | Old page dies; new 3 listens | New page can hang independently; IndexedDB shared | New `loadId` | No leftover waits from previous HTML |
| 4. Date A → B → A | Cleanup then 3 new; **no** full-page spinner (`isFirstListen`) | Stale rows if B hangs; `waiting` > 0 | `deps_change` / `date_change` | Waits drop; dates match data |
| 5. Multiple tabs | Multi-tab manager; all get snaps | Possible starve / assertion | Hung clustered on multi-tab? | Hung rate vs 1 tab |
| 6. Disconnect during first snap | OFFLINE / error / retry; not silent forever | Spinner + watchdog offline | `online: false`, incomplete vs hung | Distinct OFFLINE vs HUNG |
| 7. Reconnect | `retryWaitingPageListeners` only (no remount) | Recreate waiting; `reconnecting` track if `hadError` | `auto_retry` / retry events | Snap after online; still 3 listens |
| 8. `unavailable` | Master `onError` → `loading=false` + `masterError` **or** auto-retry then snap | If no `onError`, eternal loading | `firestore_listener_error` | Error or recovery, not infinite spinner |
| 9. INTERNAL ASSERTION | One recovery path; new triad; snap or ERROR | Recreate **and** remount; “Reconnecting…” | `assertion_auto_retry` + `listener_recreate` | Count of active listens stays 3 (or 6 if Hormones visited—should be 3 after fix) |
| 10. Repeated navigation | Unsub on leave | OK per page | close events | `activeCount` 0 after leave |
| 11. StrictMode (DEV) | Double effect, cleanup, 3 listens | Brief 6 then 3; `listenGenRef` skips second loading true | Two opens, one close, one open | Steady 3 |
| 12. HMR | Same `db` via `getFirestore` | Possible odd init log | — | Listeners from latest module only |
| 13. Failed first snap then recovery | Snap or ERROR | Retry 3× then still loading | `retry_exhausted` + still waiting | Exhaustion → ERROR, `waiting=0` |
| 14. Unsub of old listens | Effect cleanup always `unsubMaster/Dept/Critical` | Race window during remount+recreate | `triad_unsubscribe` then subscribe | No growing `activeCount` |
| 15. Expected listen count | Biochem register: **3**. After Hormones visit **today: 6**. Haem register: **3** (+ inventory if that tab visited) | 6 on Biochem after Hormones | `getActiveListenerCount` | Biochem register **3** after hormones visit |

---

## A–J ranking (repository evidence)

From the original audit prompt categories:

| Code | Role in hang | Rank |
|---|---|---|
| **C** Network/WebChannel | Likely why snapshot never comes | #1 (with I) |
| **I** Loading-state/UI | Why that becomes an infinite buffer | #1 (with C) |
| **E** Listener lifecycle | Wait-forever; cleanup generally correct | Tied to #1 |
| **A** Client/persistence | Possible SDK death / IDB; not proven | #2 |
| **B** IndexedDB/storage | Possible; QuotaExceededError origin **unproven** | #2 |
| **G** Recovery/retry race | Confirmed dual path; leak unproven | #3 |
| **F** Duplicate listeners | Confirmed extra triad on Biochem; same-query leak unproven | #3 |
| **H** React deps/remount | Intentional remount on `recoverGen`; no identity storm | Low as root |
| **D** Query | Ruled out for silent hang | — |

---

## Bottom line

Clinical pages hang because **readiness is “master `onSnapshot` fired,” and nothing in the hook ends that wait if Firestore never calls back.** Telemetry hung is that same wait, measured at 15s, **without stopping the listen.** Why the SDK is silent is **not fully provable from the repo**; the strongest remaining hypotheses are **client/transport (and possibly persistence/IndexedDB)**, made worse by **overlapping recovery** and **a second live triad on Biochemistry after visiting Hormones.**

---

## Ops follow-up (iPad quota — not part of the original diagnosis-only pass)

If Timeline hung with `QuotaExceededError` / Firestore `addLocalQueryTarget` / assertion **b815**, IndexedDB for this origin is already full. After shipping `memoryLocalCache()` on iPad/iPhone, **clear Safari website data once** for the mango-ui origin on **ipad-biochem**. See [Ipad_Safari_Origin_Quota_Clear.md](./Ipad_Safari_Origin_Quota_Clear.md).

---

*End of diagnostic audit. No implementation was performed in the original pass.*
