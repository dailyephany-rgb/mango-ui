
// AuthGuard.js

export function requireLogin() {

  const user =
    sessionStorage.getItem("loggedUser");

  if (!user) {

    window.location.href = "/login.html";

    return false;
  }

  return true;
}