/**
 * Engineering Firebase options — same GCP project as clinical (vasundhara-4c6e5).
 *
 * Uses a separately named Firebase app (`mango-engineering`) so clinical `db`
 * and eng `getEngDb()` stay isolated in code, while sharing project quotas.
 *
 * Writes ONLY go to `eng_*` collections (see constants.js). Clinical collections
 * are never written by the Engineering SDK.
 *
 * Override anytime with VITE_ENG_* in `.env.local` (takes precedence).
 *
 * @type {import('firebase/app').FirebaseOptions | null}
 */
export const engFirebaseOptions = {
  apiKey: "AIzaSyBS-JGY1X6GLM7YVXVSJuYvti_utJXMS5I",
  authDomain: "vasundhara-4c6e5.firebaseapp.com",
  projectId: "vasundhara-4c6e5",
  storageBucket: "vasundhara-4c6e5.appspot.com",
  messagingSenderId: "544519199327",
  appId: "1:544519199327:web:7e3f4cf69bef3954f2bea9",
};
