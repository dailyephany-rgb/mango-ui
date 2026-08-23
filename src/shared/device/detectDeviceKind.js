/**
 * Browser device kind — leaf module (no Firebase / telemetry imports).
 * Used by firebaseConfig before Engineering telemetry loads.
 */

/**
 * @returns {"ipad"|"mac"|"iphone"|"android"|"windows"|"desktop"}
 */
export function detectDeviceKind() {
  try {
    const ua = String(navigator.userAgent || "").toLowerCase();
    const platform = String(navigator.platform || "").toLowerCase();
    const maxTouch = navigator.maxTouchPoints || 0;
    // iPadOS 13+ may report as Mac with touch
    if (/ipad/.test(ua) || (platform === "macintel" && maxTouch > 1)) {
      return "ipad";
    }
    if (/iphone|ipod/.test(ua)) return "iphone";
    if (/android/.test(ua)) return "android";
    if (/mac/.test(ua) || platform.startsWith("mac")) return "mac";
    if (/win/.test(ua) || platform.startsWith("win")) return "windows";
  } catch {
    /* ignore */
  }
  return "desktop";
}

/** Safari iPad/iPhone share origin quota between localStorage and IndexedDB. */
export function isIosSafariDevice() {
  const kind = detectDeviceKind();
  return kind === "ipad" || kind === "iphone";
}
