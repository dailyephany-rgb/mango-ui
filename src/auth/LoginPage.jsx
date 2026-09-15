
// LoginPage.jsx — users.js check + Firebase Auth

import React, { useState } from "react";
import { departments } from "./users";
import { signInWithStaffUsername } from "./firebaseAuth.js";
import "./LoginPage.css";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [department, setDepartment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const login = async () => {
    setError("");
    if (!String(username).trim() || !password) {
      setError("Enter username and password");
      return;
    }
    if (department === "") {
      setError("Please select a department");
      return;
    }

    const selectedDept = departments[department];
    if (!selectedDept?.url) {
      setError("Invalid department");
      return;
    }

    setBusy(true);
    try {
      await signInWithStaffUsername(username, password);

      sessionStorage.setItem("department", selectedDept.name || "");
      sessionStorage.removeItem("loginMode");
      if (selectedDept.loginMode) {
        sessionStorage.setItem("loginMode", selectedDept.loginMode);
      }

      window.location.href = selectedDept.url;
    } catch (err) {
      console.error(err);
      const code = String(err?.code || "");
      if (
        code.includes("staff/invalid") ||
        code.includes("user-not-found") ||
        code.includes("wrong-password") ||
        code.includes("invalid-credential") ||
        code.includes("invalid-email")
      ) {
        setError("Invalid username or password");
      } else if (code.includes("weak-password")) {
        setError("Password setup failed — refresh and try again");
      } else if (code.includes("too-many-requests")) {
        setError("Too many attempts — try again later");
      } else {
        setError(err?.message || "Login failed");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h2>Vasundhara Lab</h2>

        <input
          placeholder="Username"
          value={username}
          autoComplete="username"
          disabled={busy}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && login()}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          autoComplete="current-password"
          disabled={busy}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && login()}
        />

        <select
          value={department}
          disabled={busy}
          onChange={(e) => setDepartment(e.target.value)}
        >
          <option value="">Select Department</option>
          {departments.map((dept, index) => (
            <option key={dept.name} value={index}>
              {dept.name}
            </option>
          ))}
        </select>

        {error ? (
          <p style={{ color: "#b91c1c", fontSize: 13, margin: "8px 0 0" }}>
            {error}
          </p>
        ) : null}

        <button type="button" onClick={login} disabled={busy}>
          {busy ? "Signing in…" : "Login"}
        </button>
      </div>
    </div>
  );
}
