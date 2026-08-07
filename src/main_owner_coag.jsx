
// src/main_owner_coag.jsx
import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";

import { OwnerProvider } from "./owner/OwnerContext.jsx";
import OwnerCoagPage from "./owner/OwnerCoag.jsx";

import "./owner/OwnerUI.css";
import "./mango.css";

console.log("OWNER COAG ENTRY LOADED!");

mountEngApp(document.getElementById("root"),
  <OwnerProvider>
      <OwnerCoagPage />
    </OwnerProvider>
);

