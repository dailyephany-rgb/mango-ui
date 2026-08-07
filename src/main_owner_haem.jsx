

// ----------------------------------------------------------
// src/main_owner_haem.jsx
// Entry point for Owner Haematology Analytics
// ----------------------------------------------------------

import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";

import { OwnerProvider } from "./owner/OwnerContext.jsx";
import OwnerHaemPage from "./owner/OwnerHaemPage.jsx";

import "./owner/OwnerUI.css";
import "./mango.css";

console.log("OWNER HAEM ENTRY LOADED!");

mountEngApp(document.getElementById("root"),
  <OwnerProvider>
      <OwnerHaemPage />
    </OwnerProvider>
);
