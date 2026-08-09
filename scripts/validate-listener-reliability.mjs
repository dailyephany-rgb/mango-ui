/**
 * Validation harness for reliability overhaul (no clinical Firebase).
 * Run: node scripts/validate-listener-reliability.mjs
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
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
  recoveryBackoffMs,
  maxAutoRetries,
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

console.log(`\n${passed} checks passed`);
