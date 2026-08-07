
// src/main_master_admin.jsx
import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";

import { OwnerProvider } from "./owner/OwnerContext.jsx";
import MasterAdmin from "./master_admin/MasterAdmin.jsx"; // The UI component we created

import "./master_admin/MasterAdmin.css";
import "./mango.css";

console.log("MASTER ADMIN INTERFACE LOADED!");

mountEngApp(document.getElementById("root"),
  <OwnerProvider>
      <MasterAdmin />
    </OwnerProvider>
);
