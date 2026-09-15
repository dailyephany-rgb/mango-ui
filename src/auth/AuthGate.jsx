import React from "react";
import { useAuthReady } from "./useAuthReady.js";
import { syncSessionFromAuthUser } from "./firebaseAuth.js";

/**
 * Blocks children until Firebase Auth is ready.
 * Redirects to login if there is no signed-in user.
 */
export default function AuthGate({ children }) {
  const { ready, user, signedIn } = useAuthReady();

  React.useEffect(() => {
    if (!ready) return;
    if (user) {
      syncSessionFromAuthUser(user);
      return;
    }
    const path = window.location.pathname || "";
    if (!path.includes("login")) {
      window.location.href = "/login.html";
    }
  }, [ready, user]);

  if (!ready) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui", color: "#475569" }}>
        Checking login…
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui", color: "#475569" }}>
        Redirecting to login…
      </div>
    );
  }

  return children;
}
