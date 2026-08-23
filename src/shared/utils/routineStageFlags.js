/**
 * Routine workflow stage cascade:
 * Validated ⇒ Saved ⇒ Scanned
 * Used for Master Register display and report_details write repair.
 */

import {
  doc,
  updateDoc,
  setDoc,
  deleteField,
  FieldPath,
} from "firebase/firestore";
import { trackedGetDoc as getDoc } from "../firestore/trackedFirestore.js";

const STAGE_MAPS = [
  "routineReportsScanned",
  "routineReportsSaved",
  "routineReportsValidated",
];

/**
 * @param {{ scanned?: boolean|string, saved?: boolean|string, validated?: boolean }} raw
 * @returns {{ scanned: "Yes"|"No", saved: "Yes"|"No", validated: boolean }}
 */
export function cascadeRoutineStages(raw = {}) {
  const validated = !!raw.validated;
  const saved =
    raw.saved === true ||
    raw.saved === "Yes" ||
    validated;
  const scanned =
    raw.scanned === true ||
    raw.scanned === "Yes" ||
    saved;

  return {
    scanned: scanned ? "Yes" : "No",
    saved: saved ? "Yes" : "No",
    validated,
  };
}

/**
 * Nested map flag, or leftover literal dotted field from setDoc merge.
 * @param {object} rec
 * @param {"routineReportsScanned"|"routineReportsSaved"|"routineReportsValidated"} mapName
 * @param {string} deptKey
 */
export function readRoutineMapFlag(rec, mapName, deptKey) {
  if (!rec || !mapName || !deptKey) return false;
  const nested = rec[mapName]?.[deptKey];
  if (nested === true || nested === "Yes") return true;
  const dotted = rec[`${mapName}.${deptKey}`];
  return dotted === true || dotted === "Yes";
}

/**
 * Firestore update fields for report_details when a stage is reached.
 * Uses dotted paths so sibling dept keys are preserved (updateDoc only).
 *
 * @param {string} dept — e.g. "Haematology"
 * @param {"scanned"|"saved"|"validated"} stage
 * @returns {Record<string, true>}
 */
export function reportDetailsStageCascadeFields(dept, stage) {
  if (!dept) return {};

  if (stage === "validated") {
    return {
      [`routineReportsScanned.${dept}`]: true,
      [`routineReportsSaved.${dept}`]: true,
      [`routineReportsValidated.${dept}`]: true,
    };
  }

  if (stage === "saved") {
    return {
      [`routineReportsScanned.${dept}`]: true,
      [`routineReportsSaved.${dept}`]: true,
    };
  }

  if (stage === "scanned") {
    return {
      [`routineReportsScanned.${dept}`]: true,
    };
  }

  return {};
}

function nestedMapsForNewDoc(dept, stage) {
  if (!dept) return {};
  if (stage === "validated") {
    return {
      routineReportsScanned: { [dept]: true },
      routineReportsSaved: { [dept]: true },
      routineReportsValidated: { [dept]: true },
    };
  }
  if (stage === "saved") {
    return {
      routineReportsScanned: { [dept]: true },
      routineReportsSaved: { [dept]: true },
    };
  }
  if (stage === "scanned") {
    return {
      routineReportsScanned: { [dept]: true },
    };
  }
  return {};
}

function flagsToUpdatePaths(dept, flags = {}) {
  const u = {};
  if (flags.scanned != null) {
    u[`routineReportsScanned.${dept}`] = !!flags.scanned;
  }
  if (flags.saved != null) {
    u[`routineReportsSaved.${dept}`] = !!flags.saved;
  }
  if (flags.validated != null) {
    u[`routineReportsValidated.${dept}`] = !!flags.validated;
  }
  return u;
}

function flagsToNestedCreate(dept, flags = {}) {
  const o = {};
  if (flags.scanned != null) {
    o.routineReportsScanned = { [dept]: !!flags.scanned };
  }
  if (flags.saved != null) {
    o.routineReportsSaved = { [dept]: !!flags.saved };
  }
  if (flags.validated != null) {
    o.routineReportsValidated = { [dept]: !!flags.validated };
  }
  return o;
}

/**
 * Delete top-level fields named "map.Dept" (literal dots from setDoc merge).
 * @param {string} dept
 * @returns {unknown[]}
 */
export function literalDotFieldDeletePairs(dept) {
  if (!dept) return [];
  const pairs = [];
  for (const mapName of STAGE_MAPS) {
    pairs.push(new FieldPath(`${mapName}.${dept}`), deleteField());
  }
  return pairs;
}

/**
 * Write routine stage flags into nested maps. Never setDoc dotted keys.
 * @param {import("firebase/firestore").Firestore} db
 * @param {string} docId
 * @param {string} dept
 * @param {{ scanned?: boolean, saved?: boolean, validated?: boolean }} flags
 * @param {Record<string, unknown>} [extra]
 */
export async function patchReportDetailsRoutineMaps(
  db,
  docId,
  dept,
  flags,
  extra = {}
) {
  if (!docId || !dept) return;
  const ref = doc(db, "report_details", docId);
  const snap = await getDoc(ref);
  const extraSafe = extra && typeof extra === "object" ? extra : {};
  const nested = { ...flagsToUpdatePaths(dept, flags), ...extraSafe };
  const deletes = literalDotFieldDeletePairs(dept);

  if (snap.exists()) {
    if (Object.keys(nested).length === 0 && deletes.length === 0) return;
    if (deletes.length) {
      await updateDoc(ref, ...Object.entries(nested).flat(), ...deletes);
    } else {
      await updateDoc(ref, nested);
    }
    return;
  }

  await setDoc(
    ref,
    { ...flagsToNestedCreate(dept, flags), ...extraSafe },
    { merge: true }
  );
}

/**
 * Batch variant for validator (same nested vs create rules).
 * @param {import("firebase/firestore").WriteBatch} batch
 * @param {import("firebase/firestore").DocumentReference} reportRef
 * @param {boolean} exists
 * @param {string} dept
 * @param {"scanned"|"saved"|"validated"} stage
 * @param {Record<string, unknown>} [extra]
 */
export function applyReportDetailsStageToBatch(
  batch,
  reportRef,
  exists,
  dept,
  stage,
  extra = {}
) {
  const extraSafe = extra && typeof extra === "object" ? extra : {};
  if (exists) {
    const nested = {
      ...reportDetailsStageCascadeFields(dept, stage),
      ...extraSafe,
    };
    if (Object.keys(nested).length) {
      batch.update(reportRef, nested);
    }
    const deletes = literalDotFieldDeletePairs(dept);
    if (deletes.length) {
      batch.update(reportRef, ...deletes);
    }
    return;
  }
  batch.set(
    reportRef,
    { ...nestedMapsForNewDoc(dept, stage), ...extraSafe },
    { merge: true }
  );
}
