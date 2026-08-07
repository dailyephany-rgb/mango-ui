

// src/main_owner_serology.jsx
import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";

import { OwnerProvider } from "./owner/OwnerContext.jsx";
import OwnerSerologyPage from "./owner/OwnerSerology.jsx";

import "./owner/OwnerUI.css";
import "./mango.css";

console.log("OWNER SEROLOGY ENTRY LOADED!");

mountEngApp(document.getElementById("root"),
  <OwnerProvider>
      <OwnerSerologyPage />
    </OwnerProvider>
);
