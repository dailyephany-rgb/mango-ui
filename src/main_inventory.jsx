
import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
// Added the missing import for OwnerProvider
import { OwnerProvider } from "./owner/OwnerContext.jsx"; 
// Updated to match your folder structure
import InventoryIntake from "./inventory/InventoryIntake.jsx"; 
import "./owner/OwnerUI.css";
import "./mango.css"; 

console.log("LAB INVENTORY MODULE LOADED");

mountEngApp(document.getElementById("root"),
  <OwnerProvider>
      <InventoryIntake />
    </OwnerProvider>
);
