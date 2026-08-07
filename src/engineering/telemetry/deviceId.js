/**
 * Stable workstation identity (EDS deviceId).
 */

import { ENG_DEVICE_ID_KEY, ENG_DEVICE_LABEL_KEY } from "../constants.js";
import { safeCall } from "./safeRun.js";

function uuid() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @returns {string}
 */
export function getDeviceId() {
  return safeCall(() => {
    let id = localStorage.getItem(ENG_DEVICE_ID_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(ENG_DEVICE_ID_KEY, id);
    }
    return id;
  }, "unknown-device");
}

/**
 * @returns {string}
 */
export function getDeviceLabel() {
  return safeCall(() => localStorage.getItem(ENG_DEVICE_LABEL_KEY) || "", "");
}

/**
 * @param {string} label
 */
export function setDeviceLabel(label) {
  safeCall(() => {
    localStorage.setItem(ENG_DEVICE_LABEL_KEY, String(label || ""));
  }, undefined);
}
