import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import { OwnerProvider } from "./owner/OwnerContext.jsx";
import InventoryCommandCenter from "./inventory-command-center/InventoryCommandCenter.jsx";
import "./owner/OwnerUI.css";
import "./mango.css";
import "./inventory-command-center/commandcenter.css";

mountEngApp(
  document.getElementById("root"),
  <OwnerProvider>
    <InventoryCommandCenter />
  </OwnerProvider>
);
