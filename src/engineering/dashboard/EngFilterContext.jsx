/**
 * Global filter state for Engineering Dashboard (presentation only).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  query,
} from "firebase/firestore";
import { getEngDb } from "../firebaseEngConfig.js";
import { ENG_COLLECTIONS } from "../constants.js";
import {
  DEFAULT_FILTERS,
  DATE_PRESETS,
  DEPARTMENT_OPTIONS,
  resolveFilterRange,
  filterRowsByGlobal,
} from "./engFilters.js";

const EngFilterContext = createContext(null);

function mapDeviceDocs(snap) {
  const devices = snap.docs.map((d) => {
    const data = d.data() || {};
    return {
      id: data.deviceId || d.id,
      label: data.label || data.deviceId || d.id,
    };
  });
  return [...new Map(devices.map((x) => [x.id, x])).values()].sort((a, b) =>
    String(a.label).localeCompare(String(b.label))
  );
}

async function loadBuilds() {
  const db = getEngDb();
  if (!db) return [];
  try {
    const buildSnap = await getDocs(
      query(collection(db, ENG_COLLECTIONS.builds), limit(100))
    );
    return [
      ...new Set(
        buildSnap.docs.map((d) => d.data()?.buildId || d.id).filter(Boolean)
      ),
    ].sort();
  } catch {
    return [];
  }
}

export function EngFilterProvider({ children }) {
  const [filters, setFiltersState] = useState(() => ({ ...DEFAULT_FILTERS }));
  const [refreshKey, setRefreshKey] = useState(0);
  /** Bumps so open-ended ranges re-resolve (midnight rollover / Refresh). */
  const [rangeTick, setRangeTick] = useState(0);
  const [devices, setDevices] = useState([]);
  const [builds, setBuilds] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(false);

  const range = useMemo(() => {
    void rangeTick;
    return resolveFilterRange(filters);
  }, [filters, rangeTick]);

  // Keep open-ended "through now" windows fresh across midnight without
  // forcing the user to hit Refresh.
  useEffect(() => {
    if (!range.openEnded) return undefined;
    const t = setInterval(() => setRangeTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, [range.openEnded]);

  // When returning to the Engineering tab, remount eng_* listeners so Timeline
  // picks up clinical page_loads written while this tab was backgrounded.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        setRangeTick((n) => n + 1);
        setRefreshKey((k) => k + 1);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Live device labels — Timeline/Devices/filters all share this map.
  // One-shot getDocs left Timeline stuck on old names (mac-3) after rename.
  useEffect(() => {
    const db = getEngDb();
    if (!db) {
      setDevices([]);
      return undefined;
    }
    setOptionsLoading(true);
    const q = query(collection(db, ENG_COLLECTIONS.deviceStatus), limit(300));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setDevices(mapDeviceDocs(snap));
        setOptionsLoading(false);
      },
      () => {
        setOptionsLoading(false);
      }
    );
    return () => unsub();
  }, [refreshKey]);

  useEffect(() => {
    void loadBuilds().then(setBuilds);
  }, [refreshKey]);

  const reloadOptions = useCallback(async () => {
    setRangeTick((n) => n + 1);
    setRefreshKey((k) => k + 1);
    setBuilds(await loadBuilds());
  }, []);

  const setFilters = useCallback((patch) => {
    setFiltersState((prev) => ({
      ...prev,
      ...(typeof patch === "function" ? patch(prev) : patch),
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState({ ...DEFAULT_FILTERS });
  }, []);

  const refresh = useCallback(() => {
    void reloadOptions();
  }, [reloadOptions]);

  const filterRows = useCallback(
    (rows, opts = {}) => filterRowsByGlobal(rows, filters, range, opts),
    [filters, range]
  );

  const deviceLabelById = useMemo(() => {
    const m = new Map();
    for (const d of devices) {
      if (d?.id) m.set(d.id, d.label || d.id);
    }
    return m;
  }, [devices]);

  /** Resolve friendly name from live eng_device_status label */
  const formatDeviceName = useCallback(
    (deviceId) => {
      if (!deviceId) return "—";
      const label = deviceLabelById.get(deviceId);
      if (label && label !== deviceId && !/^[0-9a-f]{8}-/i.test(label)) {
        return label;
      }
      return `${String(deviceId).slice(0, 8)}…`;
    },
    [deviceLabelById]
  );

  const value = useMemo(
    () => ({
      filters,
      setFilters,
      range,
      resetFilters,
      refresh,
      refreshKey,
      filterRows,
      deviceOptions: devices,
      buildOptions: builds,
      optionsLoading,
      deviceLabelById,
      formatDeviceName,
      DATE_PRESETS,
      DEPARTMENT_OPTIONS,
    }),
    [
      filters,
      setFilters,
      range,
      resetFilters,
      refresh,
      refreshKey,
      filterRows,
      devices,
      builds,
      optionsLoading,
      deviceLabelById,
      formatDeviceName,
    ]
  );

  return (
    <EngFilterContext.Provider value={value}>
      {children}
    </EngFilterContext.Provider>
  );
}

export function useEngFilters() {
  const ctx = useContext(EngFilterContext);
  if (!ctx) {
    throw new Error("useEngFilters must be used within EngFilterProvider");
  }
  return ctx;
}

/** Safe hook when outside provider (should not happen in app) */
export function useEngFiltersOptional() {
  return useContext(EngFilterContext);
}
