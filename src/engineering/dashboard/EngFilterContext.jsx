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
import { collection, getDocs, limit, query } from "firebase/firestore";
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

async function loadFilterOptions() {
  const db = getEngDb();
  if (!db) return { devices: [], builds: [] };
  try {
    const [devSnap, buildSnap] = await Promise.all([
      getDocs(query(collection(db, ENG_COLLECTIONS.deviceStatus), limit(200))),
      getDocs(query(collection(db, ENG_COLLECTIONS.builds), limit(100))),
    ]);
    const devices = devSnap.docs.map((d) => {
      const data = d.data() || {};
      return {
        id: data.deviceId || d.id,
        label: data.label || data.deviceId || d.id,
      };
    });
    const builds = buildSnap.docs
      .map((d) => d.data()?.buildId || d.id)
      .filter(Boolean);
    return {
      devices: [...new Map(devices.map((x) => [x.id, x])).values()].sort(
        (a, b) => String(a.label).localeCompare(String(b.label))
      ),
      builds: [...new Set(builds)].sort(),
    };
  } catch {
    return { devices: [], builds: [] };
  }
}

export function EngFilterProvider({ children }) {
  const [filters, setFiltersState] = useState(() => ({ ...DEFAULT_FILTERS }));
  const [refreshKey, setRefreshKey] = useState(0);
  const [devices, setDevices] = useState([]);
  const [builds, setBuilds] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(false);

  const range = useMemo(() => resolveFilterRange(filters), [filters]);

  const reloadOptions = useCallback(async () => {
    setOptionsLoading(true);
    const opts = await loadFilterOptions();
    setDevices(opts.devices);
    setBuilds(opts.builds);
    setOptionsLoading(false);
  }, []);

  useEffect(() => {
    void reloadOptions();
  }, [reloadOptions, refreshKey]);

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
    setRefreshKey((k) => k + 1);
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

  /** Resolve friendly name from eng_device_status label; fall back to short id */
  const formatDeviceName = useCallback(
    (deviceId) => {
      if (!deviceId) return "—";
      const label = deviceLabelById.get(deviceId);
      if (label && label !== deviceId) return label;
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
