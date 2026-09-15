import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebaseAuth.js";

/**
 * Wait for Firebase Auth to finish restoring the session.
 * ready=false while Auth is still initializing.
 */
export function useAuthReady() {
  const [ready, setReady] = useState(() => auth.currentUser != null);
  const [user, setUser] = useState(() => auth.currentUser);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (next) => {
      setUser(next);
      setReady(true);
    });
    return unsub;
  }, []);

  return { ready, user, signedIn: ready && !!user };
}
