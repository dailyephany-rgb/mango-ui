
import React from "react";
import ReactDOM from "react-dom/client";
// Added the missing import for OwnerProvider
import { OwnerProvider } from "./owner/OwnerContext.jsx"; 
// Updated to match your folder structure
import InventoryIntake from "./inventory/InventoryIntake.jsx"; 
import "./owner/OwnerUI.css";
import "./mango.css"; 

console.log("LAB INVENTORY MODULE LOADED");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <InventoryIntake />
    </OwnerProvider>
  </React.StrictMode>
);