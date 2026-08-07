

// src/main_owner_esr.jsx
import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";

import { OwnerProvider } from "./owner/OwnerContext.jsx";
import OwnerESRPage from "./owner/OwnerESRPage.jsx";

import "./owner/OwnerUI.css";
import "./mango.css";

console.log("OWNER ESR ENTRY LOADED!");

mountEngApp(document.getElementById("root"),
  <OwnerProvider>
      <OwnerESRPage />
    </OwnerProvider>
);
