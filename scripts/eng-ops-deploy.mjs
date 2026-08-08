#!/usr/bin/env node
/**
 * LEGACY: Safe eng_* merge into shared clinical project vasundhara-4c6e5.
 *
 * Prefer the dedicated project path instead:
 *   npm run eng:deploy       → mango-engineering
 *   npm run eng:pull-config
 *
 * This script remains for emergency shared-project ops only.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PROJECT = "vasundhara-4c6e5";
const DRY = process.argv.includes("--dry-run");
const INDEXES_ONLY = process.argv.includes("--indexes-only");
const RULES_ONLY = process.argv.includes("--rules-only");

const ENG_INDEXES = path.join(
  ROOT,
  "src/engineering/firestore.indexes.engineering.json"
);
const ENG_RULES_FRAGMENT = path.join(
  ROOT,
  "src/engineering/firestore.rules.engineering"
);
const OUT_INDEXES = path.join(ROOT, "firestore.indexes.json");
const OUT_RULES = path.join(ROOT, "firestore.rules");
const FIREBASE_JSON = path.join(ROOT, "firebase.json");
const FIREBASERC = path.join(ROOT, ".firebaserc");

const BEGIN = "// ===== BEGIN ENG MERGE BLOCK (mango-ui) =====";
const END = "// ===== END ENG MERGE BLOCK (mango-ui) =====";

/** Public Firebase CLI OAuth client (same as firebase-tools) */
const FB_CLIENT_ID =
  "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const FB_CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: false,
    ...opts,
  });
}

function firebase(args, opts = {}) {
  return run("npx", ["firebase-tools", "--project", PROJECT, ...args], opts);
}

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

function extractEngBlock(rulesSrc) {
  const text = fs.readFileSync(rulesSrc, "utf8");
  const i = text.indexOf(BEGIN);
  const j = text.indexOf(END);
  if (i < 0 || j < 0 || j <= i) {
    fail(`Could not find ENG MERGE BLOCK markers in ${rulesSrc}`);
  }
  return text.slice(i, j + END.length);
}

function mergeRules(liveRules, engBlock) {
  if (liveRules.includes(BEGIN) && liveRules.includes(END)) {
    const i = liveRules.indexOf(BEGIN);
    const j = liveRules.indexOf(END) + END.length;
    return liveRules.slice(0, i) + engBlock + liveRules.slice(j);
  }

  const marker = "match /databases/{database}/documents {";
  const idx = liveRules.indexOf(marker);
  if (idx >= 0) {
    const insertAt = idx + marker.length;
    return (
      liveRules.slice(0, insertAt) +
      "\n\n" +
      engBlock +
      "\n" +
      liveRules.slice(insertAt)
    );
  }

  fail(
    "Could not locate `match /databases/{database}/documents {` in live rules — aborting (clinical safety)."
  );
}

function indexKey(ix) {
  const fields = (ix.fields || [])
    .map(
      (f) =>
        `${f.fieldPath}:${f.order || ""}:${f.arrayConfig || ""}:${f.vectorConfig || ""}`
    )
    .join("|");
  return `${ix.collectionGroup}::${ix.queryScope || "COLLECTION"}::${fields}`;
}

function mergeIndexes(live, eng) {
  const map = new Map();
  for (const ix of live.indexes || []) map.set(indexKey(ix), ix);
  let added = 0;
  for (const ix of eng.indexes || []) {
    const k = indexKey(ix);
    if (!map.has(k)) {
      map.set(k, ix);
      added += 1;
    }
  }
  return {
    indexes: [...map.values()],
    fieldOverrides: [...(live.fieldOverrides || [])],
    added,
  };
}

function readFirebaseToolsTokens() {
  const candidates = [
    path.join(process.env.HOME || "", ".config/configstore/firebase-tools.json"),
    path.join(process.env.HOME || "", "Library/Preferences/firebase-tools.json"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function getAccessToken() {
  if (process.env.FIREBASE_TOKEN) {
    // login:ci tokens work as refresh tokens for Google OAuth in some setups;
    // try as Bearer first, then as refresh.
    return { accessToken: process.env.FIREBASE_TOKEN, fromEnv: true };
  }
  const cfg = readFirebaseToolsTokens();
  const tokens = cfg?.tokens || cfg?.user?.tokens;
  if (tokens?.access_token && tokens.expires_at && Date.now() < tokens.expires_at) {
    return { accessToken: tokens.access_token };
  }
  const refresh =
    tokens?.refresh_token ||
    cfg?.tokens?.refresh_token ||
    null;
  if (!refresh) return null;

  const body = new URLSearchParams({
    client_id: FB_CLIENT_ID,
    client_secret: FB_CLIENT_SECRET,
    refresh_token: refresh,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`token refresh failed: ${JSON.stringify(json)}`);
  }
  return { accessToken: json.access_token };
}

async function fetchLiveRules(accessToken) {
  const relRes = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const rel = await relRes.json();
  if (!relRes.ok) {
    throw new Error(`rules release: ${JSON.stringify(rel)}`);
  }
  const rulesetName = rel.rulesetName;
  if (!rulesetName) throw new Error("No rulesetName on cloud.firestore release");
  const rsRes = await fetch(`https://firebaserules.googleapis.com/v1/${rulesetName}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const rs = await rsRes.json();
  if (!rsRes.ok) throw new Error(`ruleset: ${JSON.stringify(rs)}`);
  const files = rs.source?.files || [];
  const main =
    files.find((f) => f.name === "firestore.rules") ||
    files.find((f) => String(f.name || "").endsWith(".rules")) ||
    files[0];
  if (!main?.content) throw new Error("Ruleset has no content");
  return main.content;
}

function ensureFirebaseConfig() {
  fs.writeFileSync(
    FIREBASERC,
    JSON.stringify({ projects: { default: PROJECT } }, null, 2) + "\n"
  );
  fs.writeFileSync(
    FIREBASE_JSON,
    JSON.stringify(
      {
        firestore: {
          rules: "firestore.rules",
          indexes: "firestore.indexes.json",
        },
      },
      null,
      2
    ) + "\n"
  );
  ok("Wrote .firebaserc + firebase.json (MERGED artifacts only)");
}

async function main() {
  console.log(`\nEngineering ops deploy → ${PROJECT}${DRY ? " (dry-run)" : ""}\n`);

  const login = firebase(["login:list"]);
  const loginOut = `${login.stdout || ""}${login.stderr || ""}`;
  if (login.status !== 0 || /No authorized accounts/i.test(loginOut)) {
    console.log("No Firebase login — starting browser login…");
    const lr = firebase(["login", "--reauth"], { stdio: "inherit" });
    if (lr.status !== 0) fail("firebase login failed");
  } else {
    ok("Firebase CLI authenticated");
  }

  ensureFirebaseConfig();

  console.log("\n— Indexes —");
  const ixExport = firebase(["firestore:indexes"]);
  if (ixExport.status !== 0) {
    fail(`Could not export live indexes:\n${ixExport.stderr || ixExport.stdout}`);
  }
  let liveIndexes;
  try {
    liveIndexes = JSON.parse(ixExport.stdout);
  } catch {
    fail("Live indexes JSON parse failed");
  }
  const engIndexes = JSON.parse(fs.readFileSync(ENG_INDEXES, "utf8"));
  const mergedIx = mergeIndexes(liveIndexes, engIndexes);
  if ((mergedIx.indexes || []).length < (liveIndexes.indexes || []).length) {
    fail("Index merge would shrink live index set — aborting");
  }
  fs.writeFileSync(
    OUT_INDEXES,
    JSON.stringify(
      { indexes: mergedIx.indexes, fieldOverrides: mergedIx.fieldOverrides },
      null,
      2
    ) + "\n"
  );
  ok(
    `Merged indexes (live ${liveIndexes.indexes?.length || 0} + added ${mergedIx.added} eng) → firestore.indexes.json`
  );

  if (!INDEXES_ONLY) {
  console.log("\n— Rules —");
  const engBlock = extractEngBlock(ENG_RULES_FRAGMENT);
  let tokenInfo;
  try {
    tokenInfo = await getAccessToken();
  } catch (e) {
    fail(`Access token error: ${e.message || e}`);
  }
  if (!tokenInfo?.accessToken) {
    fail(
      "No access token. Run: npm run eng:login\nThen: npm run eng:ops-deploy"
    );
  }

  let liveRules;
  try {
    liveRules = await fetchLiveRules(tokenInfo.accessToken);
    ok(`Fetched live rules (${liveRules.length} chars)`);
  } catch (e) {
    fail(
      `Failed to fetch live rules: ${e.message || e}\n` +
        "Try: npm run eng:login && npm run eng:ops-deploy\n" +
        "Or deploy indexes first: npm run eng:ops-deploy -- --indexes-only"
    );
  }

  if (!liveRules.includes("service cloud.firestore")) {
    fail("Live rules missing service cloud.firestore — abort");
  }
  const mergedRules = mergeRules(liveRules, engBlock);
  if (!mergedRules.includes(BEGIN) || !mergedRules.includes("isEngCol")) {
    fail("Merged rules missing eng block — abort");
  }
  if (mergedRules.length < liveRules.length * 0.9) {
    fail("Merged rules shrank >10% vs live — abort (clinical safety)");
  }
  fs.writeFileSync(
    OUT_RULES,
    mergedRules.endsWith("\n") ? mergedRules : `${mergedRules}\n`
  );
  ok("Wrote firestore.rules (live + eng merge)");

  // Backup live originals for audit
  const backupDir = path.join(ROOT, "src/engineering/.ops-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(backupDir, `live-rules-${stamp}.rules`), liveRules);
  fs.writeFileSync(
    path.join(backupDir, `live-indexes-${stamp}.json`),
    JSON.stringify(liveIndexes, null, 2)
  );
  ok(`Backed up live rules/indexes → ${backupDir}`);
  } else {
    ok("Skipping rules merge (--indexes-only)");
  }

  console.log("\n— Deploy —");
  let only = "firestore:rules,firestore:indexes";
  if (INDEXES_ONLY) only = "firestore:indexes";
  if (RULES_ONLY) only = "firestore:rules";
  if (INDEXES_ONLY) {
    fs.writeFileSync(
      FIREBASE_JSON,
      JSON.stringify(
        { firestore: { indexes: "firestore.indexes.json" } },
        null,
        2
      ) + "\n"
    );
  } else {
    fs.writeFileSync(
      FIREBASE_JSON,
      JSON.stringify(
        {
          firestore: {
            rules: "firestore.rules",
            indexes: "firestore.indexes.json",
          },
        },
        null,
        2
      ) + "\n"
    );
  }
  const deployArgs = ["deploy", "--only", only, "--non-interactive"];
  if (DRY) deployArgs.push("--dry-run");
  const dep = firebase(deployArgs, { stdio: "inherit" });
  if (dep.status !== 0) {
    fail("Deploy failed");
  }
  ok(DRY ? "Dry-run OK" : `Deployed ${only}`);

  console.log(`
Ops retention (after rules deploy):
  Engineering Dashboard → Settings → Run retention cleanup
  Only eng_* docs past expireAt can be deleted (legacy docs are stamped then deleted).
`);
}

main().catch((e) => fail(e.message || String(e)));
