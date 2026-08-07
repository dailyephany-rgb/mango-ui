/**
 * Hooks for Engineering Dashboard — Engineering Firebase only.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
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
  where,
} from "firebase/firestore";
import { getEngDb, isEngFirebaseConfigured } from "../firebaseEngConfig.js";
import { ENG_COLLECTIONS } from "../constants.js";
import { peekEvents, bufferSize } from "../telemetry/buffer.js";
import { getDeviceId, getDeviceLabel } from "../telemetry/deviceId.js";
import {
  isEngTelemetryEnabled,
  setEngTelemetryEnabled,
} from "../telemetry/killSwitch.js";
import { useEngFiltersOptional } from "./EngFilterContext.jsx";

/**
 * Live collection snapshot from Engineering Firebase.
 * Optional day/ts range uses single-field where (auto-indexed) — no new composite indexes.
 * @param {string} collectionName
 * @param {{
 *   orderByField?: string,
 *   limitN?: number,
 *   enabled?: boolean,
 *   dayGte?: string,
 *   dayLte?: string,
 *   tsGte?: number,
 *   tsLte?: number,
 *   refreshKey?: number,
 * }} [opts]
 */
export function useEngCollection(collectionName, opts = {}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const enabled = opts.enabled !== false;
  const {
    orderByField,
    limitN,
    dayGte,
    dayLte,
    tsGte,
    tsLte,
    refreshKey = 0,
  } = opts;

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

    const buildQuery = (useRange) => {
      const colRef = collection(db, collectionName);
      const constraints = [];
      if (useRange && tsGte != null && tsLte != null) {
        constraints.push(where("ts", ">=", tsGte));
        constraints.push(where("ts", "<=", tsLte));
        constraints.push(orderBy("ts", "desc"));
      } else if (useRange && dayGte && dayLte) {
        constraints.push(where("day", ">=", dayGte));
        constraints.push(where("day", "<=", dayLte));
        if (orderByField === "day") {
          constraints.push(orderBy("day", "desc"));
        }
      } else if (orderByField) {
        constraints.push(orderBy(orderByField, "desc"));
      }
      if (limitN) constraints.push(limit(limitN));
      return constraints.length ? query(colRef, ...constraints) : colRef;
    };

    let unsub = null;
    let cancelled = false;

    const attach = (useRange) => {
      try {
        const qRef = buildQuery(useRange);
        unsub = onSnapshot(
          qRef,
          (snap) => {
            if (cancelled) return;
            setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
            setLoading(false);
            setError(null);
          },
          (err) => {
            // Missing index / bad range → fall back to unbounded listen (client filter still applies)
            if (useRange) {
              try {
                unsub?.();
              } catch {
                /* ignore */
              }
              attach(false);
              return;
            }
            if (cancelled) return;
            setError(err?.message || String(err));
            setLoading(false);
          }
        );
      } catch {
        if (useRange) attach(false);
        else {
          setLoading(false);
          setError("query-failed");
        }
      }
    };

    const wantRange =
      (tsGte != null && tsLte != null) || (dayGte && dayLte);
    attach(!!wantRange);

    return () => {
      cancelled = true;
      try {
        unsub?.();
      } catch {
        /* ignore */
      }
    };
  }, [
    collectionName,
    orderByField,
    limitN,
    enabled,
    dayGte,
    dayLte,
    tsGte,
    tsLte,
    refreshKey,
  ]);

  return { rows, loading, error };
}

/**
 * Collection listen + global filter (client-side dimensions + optional server day/ts range).
 * @param {string} collectionName
 * @param {{
 *   limitN?: number,
 *   timeMode?: 'day' | 'ts' | 'none',
 *   live?: boolean,
 *   skipTime?: boolean,
 *   orderByField?: string,
 *   enabled?: boolean,
 * }} [opts]
 */
export function useFilteredEngCollection(collectionName, opts = {}) {
  const ctx = useEngFiltersOptional();
  const timeMode = opts.timeMode || "day";
  const range = ctx?.range;
  const refreshKey = ctx?.refreshKey ?? 0;

  const queryOpts = useMemo(() => {
    const base = {
      limitN: opts.limitN,
      orderByField: opts.orderByField,
      enabled: opts.enabled,
      refreshKey,
    };
    if (!range || timeMode === "none") return base;
    if (timeMode === "ts") {
      return {
        ...base,
        tsGte: range.startMs,
        tsLte: range.endMs,
        orderByField: opts.orderByField || "ts",
      };
    }
    // day
    return {
      ...base,
      dayGte: range.startDay,
      dayLte: range.endDay,
    };
  }, [
    opts.limitN,
    opts.orderByField,
    opts.enabled,
    refreshKey,
    range,
    timeMode,
  ]);

  const { rows, loading, error } = useEngCollection(collectionName, queryOpts);

  const filtered = useMemo(() => {
    if (!ctx) return rows;
    return ctx.filterRows(rows, {
      live: opts.live,
      skipTime: opts.skipTime || timeMode === "none",
      ignoreDepartment: opts.ignoreDepartment,
    });
  }, [rows, ctx, opts.live, opts.skipTime, opts.ignoreDepartment, timeMode]);

  return { rows: filtered, rawRows: rows, loading, error };
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
