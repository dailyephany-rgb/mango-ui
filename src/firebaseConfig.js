import { initializeApp, getApps, getApp } from "firebase/app";
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

// Ensure only one Firebase app instance (Vite MPA / HMR safe)
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  console.log("🔥 Firebase initialized");
} else {
  app = getApp();
  console.log("♻️ Firebase already initialized — using existing app");
}

/**
 * Modern multi-tab persistent cache.
 * Falls back to getFirestore if Firestore was already initialized (HMR / second entry).
 */
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
  console.log("🗄 Firestore persistentLocalCache (multi-tab) enabled");
} catch (err) {
  db = getFirestore(app);
  console.log("♻️ Firestore already initialized — using existing instance");
}

export { db };

// Passive Performance & Diagnostics → local + Firestore collection perf_daily
// Disable: localStorage.setItem("mango.perf.monitor","0")
import("./performance/bootstrap.js").catch(() => {});

// Engineering Operations telemetry → separate Engineering Firebase only
// Disable: localStorage.setItem("mango.eng.telemetry","0")
// Failure here must never affect clinical Firebase.
import("./engineering/telemetry/bootstrap.js").catch(() => {});
