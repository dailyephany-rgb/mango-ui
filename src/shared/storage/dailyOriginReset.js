/**
 * Once per local calendar day, wipe Firestore IndexedDB + large mango telemetry
 * storage — only when it will not interrupt an active clinician.
 *
 * Midnight only arms "pending". Wipe runs on: cold boot of a new day, hidden tab,
 * or 10 minutes idle with focus not in an input. Device labels and kill switches stay.
 * Clinical draft keys (*_localScans, outsource buffers) are not removed.
 */

import {
  terminate,
  clearIndexedDbPersistence,
} from "firebase/firestore";
import { db } from "../../firebaseConfig.js";
import { getLocalDateString } from "../utils/dates.js";
import {
  ENG_DEVICE_ID_KEY,
  ENG_DEVICE_LABEL_KEY,
  ENG_TELEMETRY_KEY,
} from "../../engineering/constants.js";

const LAST_RESET_KEY = "mango.storage.lastResetDate";
const LOCK_KEY = "mango.storage.resetLock";
const CHANNEL = "mango-storage-reset";
const IDLE_MS = 10 * 60 * 1000;
const MONITOR_KEY = "mango.perf.monitor";
const EDIT_PATIENT_KEY = "editPatientData";

const KEEP_LOCAL = new Set([
  LAST_RESET_KEY,
  ENG_DEVICE_ID_KEY,
  ENG_DEVICE_LABEL_KEY,
  ENG_TELEMETRY_KEY,
  MONITOR_KEY,
  EDIT_PATIENT_KEY,
]);

const DROP_LOCAL_EXACT = [
  "mango.perf.health.v1",
  "mango.perf.daily.v1",
  "mango.perf.readsCounted.v1",
  "mango.eng.buffer.v1",
  "mango.eng.settings.cache",
];

const DROP_LOCAL_PREFIX = ["mango.sqc.v1:"];
const DROP_SESSION_EXACT = ["mango.perf.v1"];

let started = false;
let lastActivityAt = Date.now();
let running = false;
let midnightTimer = 0;

function todayKey() {
  return getLocalDateString();
}

function lastResetDate() {
  try {
    return localStorage.getItem(LAST_RESET_KEY) || "";
  } catch {
    return "";
  }
}

function isPending() {
  const last = lastResetDate();
  return !last || last !== todayKey();
}

function stampResetDate() {
  try {
    localStorage.setItem(LAST_RESET_KEY, todayKey());
  } catch {
    /* ignore */
  }
}

function isTypingTarget(el) {
  if (!el || el === document.body) return false;
  const tag = String(el.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  try {
    return Boolean(el.isContentEditable);
  } catch {
    return false;
  }
}

function clinicianBusy() {
  if (typeof document === "undefined") return true;
  if (document.visibilityState === "hidden") return false;
  if (isTypingTarget(document.activeElement)) return true;
  return Date.now() - lastActivityAt < IDLE_MS;
}

function markActivity() {
  lastActivityAt = Date.now();
}

function stripStorage() {
  try {
    const ls = localStorage;
    for (const key of DROP_LOCAL_EXACT) {
      try {
        ls.removeItem(key);
      } catch {
        /* ignore */
      }
    }
    const toDrop = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (!k || KEEP_LOCAL.has(k)) continue;
      if (DROP_LOCAL_PREFIX.some((p) => k.startsWith(p))) toDrop.push(k);
    }
    toDrop.forEach((k) => {
      try {
        ls.removeItem(k);
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
  try {
    DROP_SESSION_EXACT.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

async function clearCacheStorage() {
  try {
    if (typeof caches === "undefined" || !caches.keys) return;
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
  } catch {
    /* ignore */
  }
}

async function wipeFirestoreIdb() {
  try {
    await terminate(db);
  } catch (err) {
    console.warn("[storage] terminate skipped:", err?.message || err);
  }
  try {
    await clearIndexedDbPersistence(db);
  } catch (err) {
    const code = String(err?.code || err?.message || "");
    if (/failed-precondition/i.test(code)) {
      console.warn("[storage] clearIndexedDbPersistence: other tabs open");
    } else {
      console.warn("[storage] clearIndexedDbPersistence:", err?.message || err);
    }
  }
}

function announceWiping() {
  try {
    sessionStorage.setItem(LOCK_KEY, "1");
  } catch {
    /* ignore */
  }
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage({ type: "wiping" });
    ch.close();
  } catch {
    /* ignore */
  }
}

function otherTabWiping() {
  try {
    return sessionStorage.getItem(LOCK_KEY) === "1";
  } catch {
    return false;
  }
}

async function tryRun(reason) {
  if (running || !isPending()) return;
  if (otherTabWiping()) return;
  // Cold boot of a new day: user is already loading; one extra reload is OK.
  if (reason !== "cold-boot" && clinicianBusy()) return;
  running = true;
  announceWiping();
  stampResetDate();
  console.log("[storage] daily origin reset:", reason, todayKey());
  stripStorage();
  await clearCacheStorage();
  await wipeFirestoreIdb();
  try {
    sessionStorage.removeItem(LOCK_KEY);
  } catch {
    /* ignore */
  }
  try {
    window.location.reload();
  } catch {
    running = false;
  }
}

function msUntilNextLocalMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(1000, next.getTime() - now.getTime());
}

function armMidnight() {
  if (midnightTimer) clearTimeout(midnightTimer);
  midnightTimer = window.setTimeout(() => {
    midnightTimer = 0;
    tryRun("local-midnight");
    armMidnight();
  }, msUntilNextLocalMidnight());
}

/** Idempotent. Safe to call from every MPA mount. */
export function startDailyOriginReset() {
  if (started || typeof window === "undefined") return;
  started = true;
  lastActivityAt = Date.now();

  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (ev) => {
      if (ev?.data?.type === "wiping") {
        try {
          sessionStorage.setItem(LOCK_KEY, "1");
        } catch {
          /* ignore */
        }
      }
    };
  } catch {
    /* ignore */
  }

  window.addEventListener("pointerdown", markActivity, true);
  window.addEventListener("keydown", markActivity, true);
  window.addEventListener("input", markActivity, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      tryRun("tab-hidden");
    } else {
      markActivity();
    }
  });
  window.addEventListener("focus", markActivity);

  armMidnight();
  tryRun("cold-boot");
}
