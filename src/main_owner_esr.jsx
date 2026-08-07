

// src/main_owner_esr.jsx
import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";

import { OwnerProvider } from "./owner/OwnerContext.jsx";
import OwnerESRPage from "./owner/OwnerESRPage.jsx";

import "./owner/OwnerUI.css";
import "./mango.css";

console.log("OWNER ESR ENTRY LOADED!");

createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <OwnerESRPage />
    </OwnerProvider>
  </React.StrictMode>
);