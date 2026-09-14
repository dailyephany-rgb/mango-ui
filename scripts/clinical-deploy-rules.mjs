#!/usr/bin/env node
/**
 * Deploy clinical Firestore rules (rules only).
 * Accepts deny-all OR auth != null reopen.
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
const isDenyAll = /allow\s+read\s*,\s*write\s*:\s*if\s+false\s*;/.test(
  rulesText
);
const isAuthOnly =
  /request\.auth\s*!=\s*null/.test(rulesText) &&
  !/allow\s+read\s*,\s*write\s*:\s*if\s+true\s*;/.test(rulesText);

if (!isDenyAll && !isAuthOnly) {
  fail("firestore.rules must be deny-all OR request.auth != null — abort");
}

if (/allow\s+read\s*,\s*write\s*:\s*if\s+true\s*;/.test(rulesText)) {
  fail("Refusing to deploy wide-open rules (if true)");
}

const mode = isAuthOnly ? "AUTH REQUIRED" : "DENY ALL";
console.log(`\nClinical rules deploy → ${PROJECT} (${mode})\n`);

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
ok(`${mode} deployed on ${PROJECT}`);
