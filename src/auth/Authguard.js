// AuthGuard.js — require Firebase Auth

import { waitForAuthUser, syncSessionFromAuthUser } from "./firebaseAuth.js";

export async function requireLogin() {
  const user = await waitForAuthUser();
  if (!user) {
    window.location.href = "/login.html";
    return false;
  }
  syncSessionFromAuthUser(user);
  return true;
}

export function requireLoginSync() {
  const uid = sessionStorage.getItem("authUid");
  const name = sessionStorage.getItem("loggedUser");
  if (!uid && !name) {
    window.location.href = "/login.html";
    return false;
  }
  return true;
}
