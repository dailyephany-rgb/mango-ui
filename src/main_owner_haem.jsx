

// ----------------------------------------------------------
// src/main_owner_haem.jsx
// Entry point for Owner Haematology Analytics
// ----------------------------------------------------------

import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";

import { OwnerProvider } from "./owner/OwnerContext.jsx";
import OwnerHaemPage from "./owner/OwnerHaemPage.jsx";

import "./owner/OwnerUI.css";
import "./mango.css";

console.log("OWNER HAEM ENTRY LOADED!");

createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <OwnerHaemPage />
    </OwnerProvider>
  </React.StrictMode>
);