

// src/owner/main_owner.jsx
import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import { OwnerProvider } from "./owner/OwnerContext.jsx";
import OwnerApp from "./owner/OwnerApp.jsx";
import "./owner/OwnerUI.css";
import "./mango.css";
import "./firebaseConfig.js";

console.log("OWNER MAIN ENTRY LOADED!");

mountEngApp(document.getElementById("root"),
  <OwnerProvider>
      <OwnerApp />
    </OwnerProvider>
);
