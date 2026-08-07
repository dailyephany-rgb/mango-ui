/**
 * Hooks for Engineering Dashboard — Engineering Firestore only.
 */

import { useEffect, useState, useCallback } from "react";
import {
  collection,
  onSnapshot,
  getDocs,
  doc,
  getDoc,
  setDoc,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { getEngDb, isEngFirebaseConfigured } from "../firebaseEngConfig.js";
import { ENG_COLLECTIONS } from "../constants.js";
import { peekEvents, bufferSize } from "../telemetry/buffer.js";
import { getDeviceId, getDeviceLabel } from "../telemetry/deviceId.js";
import {
  isEngTelemetryEnabled,
  setEngTelemetryEnabled,
} from "../telemetry/killSwitch.js";

/**
 * Live collection snapshot from Engineering Firebase.
 * @param {string} collectionName
 * @param {{ orderByField?: string, limitN?: number, enabled?: boolean }} [opts]
 */
export function useEngCollection(collectionName, opts = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const enabled = opts.enabled !== false;

  useEffect(() => {
    if (!enabled) {
      setRows([]);
      setLoading(false);
      return undefined;
    }
    const db = getEngDb();
    if (!db) {
      setRows([]);
      setLoading(false);
      setError(isEngFirebaseConfigured() ? "Eng DB unavailable" : "not-configured");
      return undefined;
    }
    setLoading(true);
    let qRef = collection(db, collectionName);
    try {
      if (opts.orderByField) {
        qRef = query(
          collection(db, collectionName),
          orderBy(opts.orderByField, "desc"),
          ...(opts.limitN ? [limit(opts.limitN)] : [])
        );
      } else if (opts.limitN) {
        qRef = query(collection(db, collectionName), limit(opts.limitN));
      }
    } catch {
      qRef = collection(db, collectionName);
    }

    const unsub = onSnapshot(
      qRef,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err?.message || String(err));
        setLoading(false);
      }
    );
    return () => {
      try {
        unsub();
      } catch {
        /* ignore */
      }
    };
  }, [collectionName, opts.orderByField, opts.limitN, enabled]);

  return { rows, loading, error };
}

export function useEngConfigured() {
  return isEngFirebaseConfigured();
}

export function useLocalEngBuffer(pollMs = 2000) {
  const [size, setSize] = useState(0);
  const [events, setEvents] = useState([]);
  useEffect(() => {
    const tick = () => {
      setSize(bufferSize());
      setEvents(peekEvents().slice(-40).reverse());
    };
    tick();
    const t = setInterval(tick, pollMs);
    return () => clearInterval(t);
  }, [pollMs]);
  return { size, events, deviceId: getDeviceId(), label: getDeviceLabel() };
}

/**
 * Read/write settings/global on Engineering Firebase.
 */
export function useEngSettings() {
  const [settings, setSettings] = useState(null);
  const [localEnabled, setLocalEnabled] = useState(isEngTelemetryEnabled());
  const configured = isEngFirebaseConfigured();

  const refresh = useCallback(async () => {
    setLocalEnabled(isEngTelemetryEnabled());
    const db = getEngDb();
    if (!db) {
      setSettings(null);
      return;
    }
    try {
      const snap = await getDoc(doc(db, ENG_COLLECTIONS.settings, "global"));
      setSettings(snap.exists() ? snap.data() : null);
    } catch {
      setSettings(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveSettings = useCallback(
    async (partial) => {
      const db = getEngDb();
      if (!db) return false;
      try {
        await setDoc(
          doc(db, ENG_COLLECTIONS.settings, "global"),
          { ...partial, updatedAt: serverTimestamp() },
          { merge: true }
        );
        await addDoc(collection(db, ENG_COLLECTIONS.audit), {
          ts: Date.now(),
          actor: sessionStorage.getItem("loggedUser") || "ops",
          action: "settings.update",
          detail: JSON.stringify(partial).slice(0, 500),
          createdAt: serverTimestamp(),
        });
        await refresh();
        return true;
      } catch {
        return false;
      }
    },
    [refresh]
  );

  const setKillSwitch = useCallback(
    (enabled) => {
      setEngTelemetryEnabled(enabled);
      setLocalEnabled(enabled);
      const db = getEngDb();
      if (db) {
        void addDoc(collection(db, ENG_COLLECTIONS.audit), {
          ts: Date.now(),
          actor: sessionStorage.getItem("loggedUser") || "ops",
          action: enabled ? "telemetry.enable" : "telemetry.disable",
          detail: "localStorage mango.eng.telemetry",
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }
    },
    []
  );

  return {
    settings,
    localEnabled,
    configured,
    refresh,
    saveSettings,
    setKillSwitch,
  };
}

/**
 * One-shot fetch helper for pages that prefer getDocs over live listen.
 */
export async function fetchEngCollection(collectionName, max = 200) {
  const db = getEngDb();
  if (!db) return [];
  try {
    const snap = await getDocs(
      query(collection(db, collectionName), limit(max))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

export { ENG_COLLECTIONS };
