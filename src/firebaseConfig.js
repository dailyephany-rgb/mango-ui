import { initializeApp, getApps } from "firebase/app";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBS-JGY1X6GLM7YVXVSJuYvti_utJXMS5I",
  authDomain: "vasundhara-4c6e5.firebaseapp.com",
  projectId: "vasundhara-4c6e5",
  storageBucket: "vasundhara-4c6e5.appspot.com",
  messagingSenderId: "544519199327",
  appId: "1:544519199327:web:7e3f4cf69bef3954f2bea9",
  measurementId: "G-H8J28B9B44",
};

// Ensure clinical DEFAULT app exists. Do NOT use getApps().length — eng telemetry
// may already have created a named mango-engineering app, which is not DEFAULT.
let app = getApps().find((a) => a.name === "[DEFAULT]");
if (!app) {
  app = initializeApp(firebaseConfig);
  console.log("🔥 Firebase initialized");
} else {
  console.log("♻️ Firebase already initialized — using existing app");
}

/**
 * Modern multi-tab persistent cache.
 * getFirestore() fallback is only for "already initialized" (HMR / second entry).
 * Other init failures are logged with the real error before a last-ditch getFirestore
 * so the app can still boot — persistence is not disabled as a strategy.
 */
function isAlreadyInitializedFirestoreError(err) {
  const msg = String(err?.message || err || "");
  const code = String(err?.code || "").toLowerCase();
  return (
    /already been started/i.test(msg) ||
    /already initialized/i.test(msg) ||
    /settings can no longer be changed/i.test(msg) ||
    code.includes("failed-precondition")
  );
}

let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
    // Safari/iPad WebChannel can sit forever with neither snapshot nor error.
    // Auto-detect switches to long polling only when the streaming transport fails.
    // Does not disable persistence and does not change clinical queries.
    experimentalAutoDetectLongPolling: true,
  });
  console.log("🗄 Firestore persistentLocalCache (multi-tab) enabled");
} catch (err) {
  if (isAlreadyInitializedFirestoreError(err)) {
    db = getFirestore(app);
    console.log("♻️ Firestore already initialized — using existing instance");
  } else {
    console.error(
      "[firestore] initializeFirestore failed:",
      err?.code || "",
      err?.name || "",
      err?.message || err
    );
    try {
      db = getFirestore(app);
      console.warn(
        "[firestore] last-ditch getFirestore() after init failure — cache settings may differ"
      );
    } catch (err2) {
      console.error("[firestore] getFirestore also failed:", err2?.message || err2);
      throw err;
    }
  }
}

export { db };

// Passive Performance & Diagnostics → local + Firestore collection perf_daily
// Disable: localStorage.setItem("mango.perf.monitor","0")
import("./performance/bootstrap.js").catch(() => {});

// Engineering Operations telemetry → separate Engineering Firebase only.
// Imported after clinical DEFAULT exists (static import is hoisted and would
// create the eng named app first — safe now that we key off [DEFAULT] above).
// Disable: localStorage.setItem("mango.eng.telemetry","0")
import "./engineering/telemetry/bootstrap.js";
