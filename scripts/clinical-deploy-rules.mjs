#!/usr/bin/env node
/**
 * Deploy clinical Firestore rules to vasundhara-4c6e5 (rules only).
 *
 * ROE-MANGO-UI-2026-0913: currently expects deny-all lockdown.
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
const isDenyAll =
  /allow\s+read\s*,\s*write\s*:\s*if\s+false\s*;/.test(rulesText) &&
  !/allow\s+read\s*,\s*write\s*:\s*if\s+!col\.matches/.test(rulesText);

if (!isDenyAll) {
  fail(
    "firestore.rules is not deny-all lockdown (ROE-MANGO-UI-2026-0913) — abort"
  );
}

console.log(`\nClinical rules deploy → ${PROJECT} (DENY ALL / rules only)\n`);

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
ok(`DENY ALL deployed on ${PROJECT}`);
console.log(`
Lab app Firestore client access is blocked until Auth + scoped rules.
Confirm in Firebase Console → Firestore → Rules.
`);
