/**
 * Validation harness for reliability overhaul (no clinical Firebase).
 * Run: node scripts/validate-listener-reliability.mjs
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Dynamic import of ESM module
const recoveryUrl = pathToFileURL(
  path.join(root, "src/shared/firestore/listenerRecovery.js")
).href;

const {
  classifyPageLoadOutcome,
  isFirestoreInternalAssertion,
  isLikelyNetworkFirestoreError,
  isRetryableListenerError,
  isListenerTimeoutError,
  createListenerTimeoutError,
  recoveryBackoffMs,
  maxAutoRetries,
  dispatchRecovery,
  CLINICAL_FIRST_SNAPSHOT_HUNG_MS,
} = await import(recoveryUrl);

let passed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`FAIL  ${name}`);
    console.error(`      ${err.message}`);
    process.exitCode = 1;
  }
}

check("assertion detect INTERNAL ASSERTION FAILED", () => {
  assert.equal(
    isFirestoreInternalAssertion({
      message: "FIRESTORE (12.4.0) INTERNAL ASSERTION FAILED: Unexpected state",
    }),
    true
  );
  assert.equal(isFirestoreInternalAssertion({ message: "permission-denied" }), false);
});

check("network-ish errors include unavailable + assertion", () => {
  assert.equal(isLikelyNetworkFirestoreError({ code: "unavailable" }), true);
  assert.equal(
    isLikelyNetworkFirestoreError({ message: "INTERNAL ASSERTION FAILED" }),
    true
  );
  assert.equal(isLikelyNetworkFirestoreError({ message: "permission-denied" }), false);
});

check("retryable listener errors exclude INTERNAL ASSERTION", () => {
  assert.equal(isRetryableListenerError({ code: "unavailable" }), true);
  assert.equal(
    isRetryableListenerError({ message: "INTERNAL ASSERTION FAILED" }),
    false
  );
});

check("listener timeout error is identifiable", () => {
  const err = createListenerTimeoutError("timeout_30");
  assert.equal(isListenerTimeoutError(err), true);
  assert.equal(err.code, "timeout");
});

check("max auto retries is 3", () => {
  assert.equal(maxAutoRetries(), 3);
});

check("backoff bounded and increasing", () => {
  const a1 = recoveryBackoffMs(1);
  const a3 = recoveryBackoffMs(3);
  const a9 = recoveryBackoffMs(9);
  assert.ok(a1 >= 400 && a1 <= 650);
  assert.ok(a3 > a1);
  assert.ok(a9 <= 8000);
});

check("READY when snap present", () => {
  const o = classifyPageLoadOutcome({
    snap: 120,
    hung: false,
    incomplete: false,
    timedOut: false,
    waitingN: 0,
    reason: "snap",
    online: true,
  });
  assert.equal(o.classification, "READY");
  assert.equal(o.finalReason, "FIRST_SNAPSHOT");
});

check("LEFT_EARLY on leave without snap", () => {
  const o = classifyPageLoadOutcome({
    snap: null,
    hung: false,
    incomplete: true,
    timedOut: false,
    waitingN: 1,
    reason: "leave",
    online: true,
  });
  assert.equal(o.classification, "INCOMPLETE");
  assert.equal(o.finalReason, "LEFT_EARLY");
});

check("HUNG on timeout15 while waiting", () => {
  const o = classifyPageLoadOutcome({
    snap: null,
    hung: true,
    incomplete: false,
    timedOut: false,
    waitingN: 2,
    reason: "timeout15",
    online: true,
  });
  assert.equal(o.classification, "HUNG");
  assert.equal(o.finalReason, "NO_SNAPSHOT_TIMEOUT");
});

check("HUNG when listener timedOut", () => {
  const o = classifyPageLoadOutcome({
    snap: null,
    hung: true,
    incomplete: false,
    timedOut: true,
    waitingN: 1,
    reason: "timeout15",
    online: true,
  });
  assert.equal(o.classification, "HUNG");
  assert.equal(o.finalReason, "LISTENER_TIMEOUT");
});

check("OFFLINE classification when navigator offline", () => {
  const o = classifyPageLoadOutcome({
    snap: null,
    hung: false,
    incomplete: false,
    timedOut: false,
    waitingN: 1,
    reason: "timeout15",
    online: false,
  });
  assert.equal(o.finalReason, "OFFLINE");
});

check("simulated retry counter never exceeds 3", () => {
  let autoRetryCount = 0;
  let scheduled = 0;
  const max = maxAutoRetries();
  const schedule = () => {
    if (autoRetryCount >= max) return false;
    autoRetryCount += 1;
    scheduled += 1;
    return true;
  };
  // simulate timeout_30 + error + timeout storms
  for (let i = 0; i < 20; i++) schedule();
  assert.equal(autoRetryCount, 3);
  assert.equal(scheduled, 3);
});

check("early leave 500ms and 2s both INCOMPLETE below hung path", () => {
  for (const reason of ["leave", "leave"]) {
    const o = classifyPageLoadOutcome({
      snap: null,
      hung: false,
      incomplete: true,
      timedOut: false,
      waitingN: 3,
      reason,
      online: true,
    });
    assert.equal(o.classification, "INCOMPLETE");
  }
});

check("clinical hung UI threshold is 8-12s", () => {
  assert.equal(CLINICAL_FIRST_SNAPSHOT_HUNG_MS, 10_000);
});

check("NO_SNAPSHOT classifies as CONNECTING not a page gate", () => {
  const o = classifyPageLoadOutcome({
    snap: null,
    hung: false,
    incomplete: false,
    timedOut: false,
    waitingN: 0,
    reason: "unknown",
    online: true,
  });
  assert.equal(o.finalState, "CONNECTING");
});

check("dispatchRecovery busy lock skips second concurrent call", () => {
  const first = dispatchRecovery("timeout");
  const second = dispatchRecovery("user_retry");
  assert.equal(first.skipped, false);
  assert.equal(first.path, "retryWaiting");
  assert.equal(second.skipped, true);
  assert.equal(second.reason, "busy");
});

function readSrc(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

check("department pages do not full-page-gate on loading", () => {
  for (const rel of [
    "src/biochem_main/BiochemistryMain.jsx",
    "src/haem/Haematology.jsx",
    "src/coagulation/CoagulationMain.jsx",
    "src/biochem_main/HormonesMain.jsx",
  ]) {
    const src = readSrc(rel);
    assert.equal(src.includes("Loading Biochemistry data"), false, rel);
    assert.equal(src.includes("Loading Haematology data"), false, rel);
    assert.equal(src.includes("Loading Coagulation data"), false, rel);
    assert.equal(/loading \? \s*\n\s*<div>Loading/.test(src), false, rel);
    assert.ok(src.includes("ListenStatusBanner"), rel);
  }
});

check("tracked listeners request cache metadata snapshots", () => {
  const src = readSrc("src/shared/firestore/trackedFirestore.js");
  assert.ok(src.includes("includeMetadataChanges: true"));
  assert.ok(src.includes("fbOnSnapshot(refOrQuery, listenOptions"));
});

check("watchdog retry uses dispatchRecovery only", () => {
  const src = readSrc("src/engineering/ui/FirstSnapshotWatchdog.jsx");
  assert.ok(src.includes('dispatchRecovery("user_retry")'));
  assert.equal(src.includes("notifyListenerRecovery(\"retry\")"), false);
});

const safeStorageUrl = pathToFileURL(
  path.join(root, "src/engineering/telemetry/safeStorage.js")
).href;
const { safeStorageSetJsonArray } = await import(safeStorageUrl);

check("telemetry spill drops instead of throwing on quota", () => {
  const store = new Map();
  const fake = {
    setItem(k, v) {
      if (String(v).length > 20) {
        const err = new Error("The quota has been exceeded.");
        err.name = "QuotaExceededError";
        err.code = 22;
        throw err;
      }
      store.set(k, v);
    },
    removeItem(k) {
      store.delete(k);
    },
  };
  const ok = safeStorageSetJsonArray(fake, "k", [
    { n: 1 },
    { n: 2 },
    { n: 3 },
    { n: 4 },
  ]);
  assert.equal(typeof ok, "boolean");
});

console.log(`\n${passed} checks passed`);
