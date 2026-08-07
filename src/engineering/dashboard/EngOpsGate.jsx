/**
 * Engineering Dashboard ops gate (EDS §13 auth — Phase 1 client allowlist).
 * Engineering-only. Does not touch clinical login or users.js.
 *
 * Unlock rules (any one):
 * 1. settings/global.opsGateDisabled === true (lab LAN open mode)
 * 2. sessionStorage mango.eng.opsUnlock === "1" after PIN match
 * 3. loggedUser is in settings/global.opsAllowlist (string[])
 *
 * Default when settings missing: allow if loggedUser present OR PIN "eng-ops"
 * is entered once (documented default for first boot; change in Settings).
 */

import React, { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { getEngDb, isEngFirebaseConfigured } from "../firebaseEngConfig.js";
import { ENG_COLLECTIONS } from "../constants.js";

const UNLOCK_KEY = "mango.eng.opsUnlock";
const DEFAULT_PIN = "eng-ops";

function readLoggedUser() {
  try {
    return sessionStorage.getItem("loggedUser") || "";
  } catch {
    return "";
  }
}

function isUnlockedLocal() {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

function setUnlockedLocal() {
  try {
    sessionStorage.setItem(UNLOCK_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * @param {{ children: React.ReactNode }} props
 */
export default function EngOpsGate({ children }) {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [expectedPin, setExpectedPin] = useState(DEFAULT_PIN);
  const [allowlist, setAllowlist] = useState([]);
  const [gateDisabled, setGateDisabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isUnlockedLocal()) {
        if (!cancelled) {
          setAllowed(true);
          setReady(true);
        }
        return;
      }

      const user = readLoggedUser();
      let pinFromSettings = DEFAULT_PIN;
      let list = [];
      let disabled = false;

      const db = getEngDb();
      if (db && isEngFirebaseConfigured()) {
        try {
          const snap = await getDoc(doc(db, ENG_COLLECTIONS.settings, "global"));
          if (snap.exists()) {
            const d = snap.data() || {};
            if (d.opsGateDisabled === true) disabled = true;
            if (typeof d.opsPin === "string" && d.opsPin.length > 0) {
              pinFromSettings = d.opsPin;
            }
            if (Array.isArray(d.opsAllowlist)) list = d.opsAllowlist.map(String);
          }
        } catch {
          /* ignore — fail closed to PIN */
        }
      }

      if (cancelled) return;
      setExpectedPin(pinFromSettings);
      setAllowlist(list);
      setGateDisabled(disabled);

      if (disabled) {
        setAllowed(true);
      } else if (user && list.length > 0 && list.includes(user)) {
        setUnlockedLocal();
        setAllowed(true);
      } else if (user && list.length === 0 && !isEngFirebaseConfigured()) {
        // Local-only mode without eng Firebase: allow viewing buffer UI
        setAllowed(true);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="eng-app" style={{ display: "grid", placeItems: "center" }}>
        <p className="eng-muted">Checking ops access…</p>
      </div>
    );
  }

  if (allowed) return children;

  return (
    <div className="eng-app" style={{ display: "grid", placeItems: "center" }}>
      <div className="eng-panel eng-form" style={{ maxWidth: 420, width: "90%" }}>
        <h1 style={{ fontSize: "1.2rem", marginTop: 0 }}>Engineering Ops Gate</h1>
        <p className="eng-muted">
          Observer dashboard only. Enter the ops PIN or use an allowlisted clinical
          username (configured in settings/global). Clinical workflows are unaffected.
        </p>
        <label>
          Ops PIN
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoComplete="off"
          />
        </label>
        {error && <p style={{ color: "var(--eng-bad)" }}>{error}</p>}
        <div className="eng-actions">
          <button
            type="button"
            className="eng-btn"
            onClick={() => {
              if (pin === expectedPin) {
                setUnlockedLocal();
                setAllowed(true);
                setError("");
              } else {
                setError("Invalid PIN");
              }
            }}
          >
            Unlock
          </button>
        </div>
        <p className="eng-muted" style={{ fontSize: "0.75rem" }}>
          User: {readLoggedUser() || "(none)"} · allowlist size: {allowlist.length}
          {gateDisabled ? " · gate disabled remotely" : ""}
        </p>
      </div>
    </div>
  );
}
