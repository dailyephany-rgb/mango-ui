
import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";
import { OwnerProvider } from "./owner/OwnerContext.jsx";
import LabAnalytics from "./analytics/LabAnalytics.jsx";
import "./owner/OwnerUI.css";
import "./mango.css";

console.log("LAB ANALYTICS MODULE LOADED");

createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <LabAnalytics />
    </OwnerProvider>
  </React.StrictMode>
);