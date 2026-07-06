
import React, { useState } from "react";

export default function UserMenu() {
  const [open, setOpen] = useState(false);

  const user =
    sessionStorage.getItem("loggedUser") || "User";

  const logout = () => {
    sessionStorage.clear();
    window.location.href = "/login.html";
  };

  return (
    <div
      style={{
        position: "relative",
        display: "inline-block"
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: "#fff",
          border: "1px solid #ccc",
          padding: "8px 12px",
          borderRadius: "6px",
          cursor: "pointer"
        }}
      >
        Hi, {user} ▼
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            background: "white",
            border: "1px solid #ddd",
            minWidth: "120px",
            zIndex: 9999
          }}
        >
          <button
            onClick={logout}
            style={{
              width: "100%",
              padding: "10px",
              border: "none",
              background: "white",
              cursor: "pointer"
            }}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}