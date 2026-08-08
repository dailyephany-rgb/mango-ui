/**
 * Engineering Firebase config — DEDICATED project (mango-engineering).
 *
 * Never points at clinical vasundhara-4c6e5 for telemetry.
 *
 * Configure (first match wins):
 * 1. Vite env: VITE_ENG_API_KEY, VITE_ENG_PROJECT_ID, …
 * 2. engFirebase.options.js export
 *
 * Optional named DB: VITE_ENG_DATABASE_ID
 */

import { initializeApp, getApps, deleteApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { engFirebaseOptions } from "./engFirebase.options.js";

/** Logical name prefix — actual app name includes projectId (see engAppName). */
const ENG_APP_PREFIX = "mango-engineering";
const CLINICAL_PROJECT_BLOCKLIST = new Set(["vasundhara-4c6e5"]);

/**
 * @param {import('firebase/app').FirebaseOptions | null | undefined} opts
 */
function isUsableEngOptions(opts) {
  if (!opts?.projectId || !opts?.apiKey) return false;
  if (CLINICAL_PROJECT_BLOCKLIST.has(String(opts.projectId))) return false;
  if (String(opts.apiKey).startsWith("REPLACE_")) return false;
  return true;
}

/**
 * App name tied to projectId so a stale named app that once pointed at clinical
 * cannot be reused after options move to mango-engineering.
 * @param {string} projectId
 */
function engAppName(projectId) {
  return `${ENG_APP_PREFIX}__${projectId}`;
}

/**
 * @returns {import('firebase/app').FirebaseOptions | null}
 */
function readEngOptions() {
  try {
    const env = typeof import.meta !== "undefined" ? import.meta.env : {};
    if (env?.VITE_ENG_PROJECT_ID && env?.VITE_ENG_API_KEY) {
      const fromEnv = {
        apiKey: env.VITE_ENG_API_KEY,
        authDomain: env.VITE_ENG_AUTH_DOMAIN || "",
        projectId: env.VITE_ENG_PROJECT_ID,
        storageBucket: env.VITE_ENG_STORAGE_BUCKET || "",
        messagingSenderId: env.VITE_ENG_MESSAGING_SENDER_ID || "",
        appId: env.VITE_ENG_APP_ID || "",
      };
      if (isUsableEngOptions(fromEnv)) return fromEnv;
      try {
        console.warn(
          "[eng] VITE_ENG_* points at blocked/clinical project — ignored"
        );
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }

  try {
    if (isUsableEngOptions(engFirebaseOptions)) {
      return { ...engFirebaseOptions };
    }
  } catch {
    /* ignore */
  }

  return null;
}

function readDatabaseId() {
  try {
    const env = typeof import.meta !== "undefined" ? import.meta.env : {};
    return env?.VITE_ENG_DATABASE_ID || engFirebaseOptions?.databaseId || null;
  } catch {
    return null;
  }
}

/**
 * Drop legacy / wrong-project eng apps (e.g. name "mango-engineering" that
 * still holds vasundhara-4c6e5 options from the shared-project era).
 * @param {string} expectedProjectId
 */
function disposeStaleEngApps(expectedProjectId) {
  const expectedName = engAppName(expectedProjectId);
  for (const app of getApps()) {
    const name = String(app?.name || "");
    const projectId = String(app?.options?.projectId || "");
    const isEngNamed =
      name === ENG_APP_PREFIX ||
      name === expectedName ||
      name.startsWith(`${ENG_APP_PREFIX}__`);
    if (!isEngNamed) continue;
    if (projectId === expectedProjectId && name === expectedName) continue;
    try {
      void deleteApp(app);
    } catch {
      /* ignore */
    }
  }
}

/**
 * @param {import('firebase/firestore').Firestore | null | undefined} db
 * @returns {boolean}
 */
export function isEngDbSafe(db) {
  try {
    const projectId = db?.app?.options?.projectId;
    if (!projectId) return false;
    if (CLINICAL_PROJECT_BLOCKLIST.has(String(projectId))) return false;
    const expected = readEngOptions()?.projectId;
    if (expected && String(projectId) !== String(expected)) return false;
    return true;
  } catch {
    return false;
  }
}

let engDb = null;
let initAttempted = false;

/** @returns {boolean} */
export function isEngFirebaseConfigured() {
  return Boolean(readEngOptions()?.projectId);
}

/**
 * Lazy init Engineering Firestore. Never throws to callers.
 * Never returns clinical (vasundhara-4c6e5) Firestore.
 * @returns {import('firebase/firestore').Firestore | null}
 */
export function getEngDb() {
  try {
    if (engDb) {
      if (isEngDbSafe(engDb)) return engDb;
      engDb = null;
      initAttempted = false;
    }
    if (initAttempted && !engDb) return null;
    initAttempted = true;

    const options = readEngOptions();
    if (!options) return null;

    disposeStaleEngApps(options.projectId);

    const name = engAppName(options.projectId);
    const existing = getApps().find((a) => a.name === name);
    let engApp = existing;
    if (
      engApp &&
      String(engApp.options?.projectId || "") !== String(options.projectId)
    ) {
      try {
        void deleteApp(engApp);
      } catch {
        /* ignore */
      }
      engApp = null;
    }
    if (!engApp) {
      engApp = initializeApp(options, name);
    }

    if (CLINICAL_PROJECT_BLOCKLIST.has(String(engApp.options?.projectId || ""))) {
      try {
        console.error(
          "[eng] refusing Engineering Firestore on clinical project",
          engApp.options?.projectId
        );
      } catch {
        /* ignore */
      }
      engDb = null;
      return null;
    }

    const databaseId = readDatabaseId();
    engDb = databaseId
      ? getFirestore(engApp, databaseId)
      : getFirestore(engApp);

    if (!isEngDbSafe(engDb)) {
      engDb = null;
      return null;
    }
    return engDb;
  } catch (err) {
    try {
      console.debug("[eng] Firebase init failed:", err?.message || err);
    } catch {
      /* ignore */
    }
    engDb = null;
    return null;
  }
}

/** @returns {string | null} */
export function getEngProjectId() {
  return readEngOptions()?.projectId || null;
}

/** @returns {string | null} */
export function getEngDatabaseId() {
  return readDatabaseId();
}
