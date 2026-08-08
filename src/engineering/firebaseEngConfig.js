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

import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { engFirebaseOptions } from "./engFirebase.options.js";

const ENG_APP_NAME = "mango-engineering";
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

let engDb = null;
let initAttempted = false;

/** @returns {boolean} */
export function isEngFirebaseConfigured() {
  return Boolean(readEngOptions()?.projectId);
}

/**
 * Lazy init Engineering Firestore. Never throws to callers.
 * @returns {import('firebase/firestore').Firestore | null}
 */
export function getEngDb() {
  try {
    if (engDb) return engDb;
    if (initAttempted && !engDb) return null;
    initAttempted = true;

    const options = readEngOptions();
    if (!options) return null;

    const existing = getApps().find((a) => a.name === ENG_APP_NAME);
    const engApp = existing || initializeApp(options, ENG_APP_NAME);
    const databaseId = readDatabaseId();
    engDb = databaseId
      ? getFirestore(engApp, databaseId)
      : getFirestore(engApp);
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
