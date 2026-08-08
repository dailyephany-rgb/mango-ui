#!/usr/bin/env node
/**
 * Deploy clinical Firestore rules (eng_* denied) to vasundhara-4c6e5.
 * Does NOT deploy indexes (avoids clobbering live clinical indexes).
 *
 * Usage: npm run clinical:deploy-rules
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROJECT = "vasundhara-4c6e5";
const CONFIG = path.join(ROOT, "firebase.clinical.json");
const RULES = path.join(ROOT, "firestore.rules");

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

if (!fs.existsSync(CONFIG)) fail(`Missing ${CONFIG}`);
if (!fs.existsSync(RULES)) fail(`Missing ${RULES}`);

const rulesText = fs.readFileSync(RULES, "utf8");
if (!rulesText.includes("!col.matches('eng_.*')")) {
  fail("firestore.rules missing eng_* deny — abort (clinical safety)");
}
if (rulesText.includes("BEGIN ENG MERGE BLOCK")) {
  fail("firestore.rules still has ENG MERGE BLOCK — abort");
}

console.log(`\nClinical rules deploy → ${PROJECT} (rules only)\n`);

const dep = spawnSync(
  "npx",
  [
    "firebase-tools",
    "--config",
    CONFIG,
    "--project",
    PROJECT,
    "deploy",
    "--only",
    "firestore:rules",
    "--non-interactive",
  ],
  { cwd: ROOT, encoding: "utf8", stdio: "inherit", shell: false }
);

if (dep.status !== 0) fail("Clinical rules deploy failed");
ok(`Denied eng_* on ${PROJECT}`);
console.log(`
Next: hard-refresh all open lab + Engineering tabs.
Telemetry must only appear under project mango-engineering.
`);
