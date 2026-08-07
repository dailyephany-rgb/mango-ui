/**
 * Optional Engineering Firebase options.
 * Set to a Firebase web config object for project `mango-engineering` (or equivalent).
 * Leave `null` to rely on VITE_ENG_* env vars, or local-only buffering.
 *
 * NEVER put clinical (vasundhara-4c6e5) credentials here for telemetry writes.
 *
 * @type {import('firebase/app').FirebaseOptions | null}
 */
export const engFirebaseOptions = null;
