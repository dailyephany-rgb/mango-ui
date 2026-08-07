

// src/main_owner_hormones.jsx

import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";

import { OwnerProvider } from "./owner/OwnerContext.jsx";
import OwnerHormonesPage from "./owner/OwnerHormones.jsx";

import "./owner/OwnerUI.css";
import "./mango.css";

console.log("OWNER HORMONES ENTRY LOADED!");

mountEngApp(document.getElementById("root"),
  <OwnerProvider>
      <OwnerHormonesPage />
    </OwnerProvider>
);
