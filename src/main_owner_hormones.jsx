

// src/main_owner_hormones.jsx

import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";

import { OwnerProvider } from "./owner/OwnerContext.jsx";
import OwnerHormonesPage from "./owner/OwnerHormones.jsx";

import "./owner/OwnerUI.css";
import "./mango.css";

console.log("OWNER HORMONES ENTRY LOADED!");

createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <OwnerHormonesPage />
    </OwnerProvider>
  </React.StrictMode>
);