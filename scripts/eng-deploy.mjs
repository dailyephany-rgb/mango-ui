#!/usr/bin/env node
/**
 * Deploy Engineering Firestore rules + indexes to dedicated project
 * `mango-engineering` (never clinical vasundhara).
 *
 * Usage:
 *   npm run eng:login
 *   npm run eng:deploy
 *   npm run eng:deploy -- --dry-run
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROJECT = process.env.ENG_FIREBASE_PROJECT || "mango-engineering";
const DRY = process.argv.includes("--dry-run");
const CONFIG = path.join(ROOT, "firebase.engineering.json");

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
    ...opts,
  });
}

function firebase(args, opts = {}) {
  return run(
    "npx",
    ["firebase-tools", "--config", CONFIG, "--project", PROJECT, ...args],
    opts
  );
}

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

function main() {
  if (PROJECT === "vasundhara-4c6e5") {
    fail("Refusing to deploy eng rules/indexes to clinical project");
  }
  if (!fs.existsSync(CONFIG)) fail(`Missing ${CONFIG}`);

  console.log(`\nEngineering deploy → ${PROJECT}${DRY ? " (dry-run)" : ""}\n`);

  const login = firebase(["login:list"]);
  const loginOut = `${login.stdout || ""}${login.stderr || ""}`;
  if (login.status !== 0 || /No authorized accounts/i.test(loginOut)) {
    console.log("No Firebase login — starting browser login…");
    const lr = firebase(["login", "--reauth"], { stdio: "inherit" });
    if (lr.status !== 0) fail("firebase login failed");
  } else {
    ok("Firebase CLI authenticated");
  }

  const deployArgs = [
    "deploy",
    "--only",
    "firestore:rules,firestore:indexes",
    "--non-interactive",
  ];
  if (DRY) deployArgs.push("--dry-run");

  const dep = firebase(deployArgs, { stdio: "inherit" });
  if (dep.status !== 0) fail("Deploy failed");
  ok(DRY ? "Dry-run OK" : `Deployed rules + indexes → ${PROJECT}`);
  console.log(`
Next:
  1) npm run eng:pull-config   # write engFirebase.options.js web credentials
  2) Hard-refresh clinical + Engineering pages
  3) Confirm dashboard meta shows project: mango-engineering
`);
}

main();
