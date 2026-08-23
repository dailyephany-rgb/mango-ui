# iPad Safari: one-time origin data clear

**Device:** ipad-biochem (and any other iPad/iPhone that hung Biochemistry ~15s with no first snapshot)

Safari shares **one origin quota** for `localStorage` + IndexedDB + Cache Storage. Firestore `persistentLocalCache` stores in IndexedDB. When that quota is already full, new app code cannot shrink it.

After deploying memory-only Firestore cache on iPad/iPhone, **clear website data once** on that iPad so `addLocalQueryTarget` / assertion **b815** / `QuotaExceededError` stop.

## Steps (Safari on the iPad)

1. Open **Settings → Safari → Advanced → Website Data** (wording varies by iOS version; look for **Website Data** under Safari).
2. Find the mango-ui origin (the clinic host that serves this app).
3. **Delete** that origin’s data (or **Remove All Website Data** if this iPad is used only for this app).
4. Reopen mango-ui, load **Biochemistry**, confirm a first snapshot arrives (not hung at ~15s).

## After clear + deploy

- Biochemistry on ipad-biochem should get a first snapshot (not hung).
- Engineering Timeline: hung/incomplete on that device should drop; `b815` / quota errors should stop.
- Desktop Master/Biochem still uses persistent cache (multi-tab).
- iPad still shows a stable device label (cookie fallback if localStorage is full). Tiny keys (device name, kill switches, edit-patient) are still written; large perf daily/health/read counters are not.
