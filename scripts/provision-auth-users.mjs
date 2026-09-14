#!/usr/bin/env node
/**
 * Provision Firebase Auth users + auth_allowlist/{uid} docs.
 *
 * Prerequisites:
 * 1. Firebase Console → Authentication → Sign-in method → Email/Password ENABLED
 * 2. Service account JSON with Firebase Admin rights:
 *      export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
 *    Or place file at: secrets/clinical-admin.json (gitignored)
 * 3. Copy secrets/staff-bootstrap.example.json → secrets/staff-bootstrap.json
 *    Fill real passwords (rotate old PINs — they were public in JS).
 *
 * Usage:
 *   npm run auth:provision-clinical
 *   npm run auth:provision-eng
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const EMAIL_DOMAIN = "staff.vasundhara-lab.local";

function usernameToEmail(username) {
  const local = String(username || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `${local}@${EMAIL_DOMAIN}`;
}

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function loadAdmin() {
  try {
    return require("firebase-admin");
  } catch {
    fail(
      "firebase-admin not installed. Run:\n  npm install -D firebase-admin"
    );
  }
}

function resolveCredPath(project) {
  const env = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (env && fs.existsSync(env)) return env;
  const named =
    project === "mango-engineering"
      ? path.join(ROOT, "secrets/eng-admin.json")
      : path.join(ROOT, "secrets/clinical-admin.json");
  if (fs.existsSync(named)) return named;
  return null;
}

async function main() {
  const which = process.argv.includes("--eng")
    ? "eng"
    : process.argv.includes("--clinical")
      ? "clinical"
      : "clinical";

  const projectId =
    which === "eng" ? "mango-engineering" : "vasundhara-4c6e5";

  const bootstrapPath = path.join(ROOT, "secrets/staff-bootstrap.json");
  if (!fs.existsSync(bootstrapPath)) {
    fail(
      `Missing ${bootstrapPath}\nCopy secrets/staff-bootstrap.example.json and fill passwords.`
    );
  }

  const bootstrap = JSON.parse(fs.readFileSync(bootstrapPath, "utf8"));
  const staff = Array.isArray(bootstrap.staff) ? bootstrap.staff : [];
  if (!staff.length) fail("staff-bootstrap.json has no staff[] entries");

  const credPath = resolveCredPath(projectId);
  if (!credPath) {
    fail(
      `No service account JSON found.\n` +
        `Set GOOGLE_APPLICATION_CREDENTIALS or add secrets/${
          which === "eng" ? "eng" : "clinical"
        }-admin.json`
    );
  }

  const admin = loadAdmin();
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(fs.readFileSync(credPath, "utf8"))),
      projectId,
    });
  }

  const auth = admin.auth();
  const db = admin.firestore();

  console.log(`\nProvisioning ${staff.length} users → ${projectId}\n`);

  for (const row of staff) {
    const username = String(row.username || "").trim();
    const password = String(row.password || "");
    const displayName = String(row.displayName || username).trim();
    const role = String(row.role || "staff").trim();
    const email = usernameToEmail(username);

    if (!username || password.length < 6) {
      console.warn(`⏭  Skip ${username || "(empty)"} — need username + password ≥ 6 chars`);
      continue;
    }
    if (password === "CHANGE_ME") {
      console.warn(`⏭  Skip ${username} — still CHANGE_ME`);
      continue;
    }

    let user;
    try {
      user = await auth.getUserByEmail(email);
      await auth.updateUser(user.uid, { password, displayName });
      console.log(`↻ updated ${email}`);
    } catch (err) {
      if (err?.code === "auth/user-not-found") {
        user = await auth.createUser({
          email,
          password,
          displayName,
          emailVerified: true,
        });
        console.log(`+ created ${email}`);
      } else {
        console.error(`✗ ${email}:`, err?.message || err);
        continue;
      }
    }

    await auth.setCustomUserClaims(user.uid, { staff: true, role, lab: true });

    await db
      .collection("auth_allowlist")
      .doc(user.uid)
      .set(
        {
          uid: user.uid,
          email,
          username,
          displayName,
          role,
          projectId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    console.log(`  allowlist ✓ ${user.uid} (${role})`);
  }

  console.log(`
Done.
Staff login with their username + new password (not the old public PIN).
Email used internally: <username>@${EMAIL_DOMAIN}
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
