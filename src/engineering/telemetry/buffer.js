/**
 * In-memory ring buffer + sessionStorage spill for Engineering events.
 */

import { BUFFER_CAPACITY, ENG_BUFFER_KEY } from "../constants.js";
import { safeRun, safeCall } from "./safeRun.js";

/** @type {object[]} */
let ring = [];

/**
 * @param {object} event
 */
export function pushEvent(event) {
  safeRun(() => {
    ring.push(event);
    if (ring.length > BUFFER_CAPACITY) {
      // Drop oldest non-error first
      let dropIdx = ring.findIndex((e) => e?.domain !== "errors");
      if (dropIdx < 0) dropIdx = 0;
      ring.splice(dropIdx, 1);
    }
  }, "eng.buffer");
}

/**
 * @returns {object[]}
 */
export function drainEvents() {
  return safeCall(() => {
    const out = ring.slice();
    ring = [];
    return out;
  }, []);
}

/**
 * @returns {object[]}
 */
export function peekEvents() {
  return ring.slice();
}

/**
 * @returns {number}
 */
export function bufferSize() {
  return ring.length;
}

export function spillToSession() {
  safeRun(() => {
    if (typeof sessionStorage === "undefined") return;
    const existing = safeCall(() => {
      const raw = sessionStorage.getItem(ENG_BUFFER_KEY);
      return raw ? JSON.parse(raw) : [];
    }, []);
    const merged = [...(Array.isArray(existing) ? existing : []), ...ring].slice(
      -BUFFER_CAPACITY
    );
    sessionStorage.setItem(ENG_BUFFER_KEY, JSON.stringify(merged));
  }, "eng.spill");
}

/**
 * @returns {object[]}
 */
export function loadSpill() {
  return safeCall(() => {
    if (typeof sessionStorage === "undefined") return [];
    const raw = sessionStorage.getItem(ENG_BUFFER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }, []);
}

export function clearSpill() {
  safeRun(() => {
    sessionStorage.removeItem(ENG_BUFFER_KEY);
  }, "eng.clearSpill");
}
