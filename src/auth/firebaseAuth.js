/**
 * Clinical Firebase Auth — simple staff login.
 * 1) Username/password must match users.js
 * 2) Then Firebase Auth sign-in (creates Auth user on first login)
 */
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as fbSignOut,
} from "firebase/auth";
import { app } from "../firebaseConfig.js";
import { usernameToEmail } from "./staffEmail.js";
import { users } from "./users.js";

export const auth = getAuth(app);

export function waitForAuthUser(timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }
    let done = false;
    const finish = (user) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsub();
      resolve(user || null);
    };
    const unsub = onAuthStateChanged(auth, (user) => finish(user));
    const timer = setTimeout(() => finish(auth.currentUser), timeoutMs);
  });
}

function findStaffUser(username, password) {
  const u = String(username || "").trim().toLowerCase();
  const p = String(password || "");
  return users.find(
    (row) =>
      String(row.username).trim().toLowerCase() === u &&
      String(row.password) === p
  );
}

function writeSession(user, displayName) {
  sessionStorage.setItem("loggedUser", displayName || user.displayName || "User");
  sessionStorage.setItem("authUid", user.uid);
  if (user.email) sessionStorage.setItem("authEmail", user.email);
}

/**
 * Firebase Auth requires passwords ≥ 6 chars. Staff still type short PINs from
 * users.js; we only expand the secret used with Firebase.
 */
function firebaseAuthPassword(pin) {
  const raw = String(pin || "");
  if (raw.length >= 6) return raw;
  return `mango_${raw}`;
}

export async function signInWithStaffUsername(username, password) {
  const staff = findStaffUser(username, password);
  if (!staff) {
    const err = new Error("Invalid username or password");
    err.code = "staff/invalid-credentials";
    throw err;
  }

  const email = usernameToEmail(staff.username);
  const displayName = staff.username;
  const authPassword = firebaseAuthPassword(password);

  try {
    const cred = await signInWithEmailAndPassword(auth, email, authPassword);
    writeSession(cred.user, displayName);
    return cred.user;
  } catch (err) {
    const code = String(err?.code || "");
    const maybeMissing =
      code.includes("user-not-found") ||
      code.includes("invalid-credential") ||
      code.includes("wrong-password");

    if (!maybeMissing) throw err;

    try {
      const created = await createUserWithEmailAndPassword(
        auth,
        email,
        authPassword
      );
      try {
        await updateProfile(created.user, { displayName });
      } catch {
        /* ignore */
      }
      writeSession(created.user, displayName);
      return created.user;
    } catch (createErr) {
      if (String(createErr?.code || "").includes("email-already-in-use")) {
        const cred = await signInWithEmailAndPassword(auth, email, authPassword);
        writeSession(cred.user, displayName);
        return cred.user;
      }
      throw createErr;
    }
  }
}

export async function signOutStaff() {
  try {
    await fbSignOut(auth);
  } finally {
    sessionStorage.clear();
  }
}

export function syncSessionFromAuthUser(user) {
  if (!user) return;
  writeSession(
    user,
    user.displayName ||
      (user.email ? user.email.split("@")[0] : "") ||
      "User"
  );
}
