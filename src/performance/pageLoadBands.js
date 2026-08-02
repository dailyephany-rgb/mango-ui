/**
 * Page load performance bands (totalMs).
 * Green  < 2s
 * Yellow 2s – 30s
 * Orange 30s – 1 min
 * Red    1 min+  (includes 1–2 min and slower)
 */

export const PAGE_LOAD_GREEN_MS = 2000;
export const PAGE_LOAD_YELLOW_MS = 30000; // yellow until 30s
export const PAGE_LOAD_ORANGE_MS = 60000; // orange 30s–1min; red from 1min
/** @deprecated use PAGE_LOAD_ORANGE_MS — kept as alias for “entered orange+” */
export const PAGE_LOAD_SLOW_MS = 30000;
/** Red band starts here (1 minute). */
export const PAGE_LOAD_RED_MS = 60000;

export function loadBand(totalMs) {
  if (totalMs == null || Number.isNaN(totalMs)) {
    return { cls: "", label: "—" };
  }
  if (totalMs < PAGE_LOAD_GREEN_MS) {
    return { cls: "band-green", label: "Green" };
  }
  if (totalMs < PAGE_LOAD_YELLOW_MS) {
    return { cls: "band-yellow", label: "Yellow" };
  }
  if (totalMs < PAGE_LOAD_ORANGE_MS) {
    return { cls: "band-orange", label: "Orange" };
  }
  return { cls: "band-red", label: "Red" };
}

export function loadBandLabel(totalMs) {
  return loadBand(totalMs).label;
}

export const PAGE_LOAD_BAND_LEGEND =
  "Bands: Green <2s · Yellow 2–30s · Orange 30s–1min · Red ≥1min";
