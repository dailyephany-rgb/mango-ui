
import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import { OwnerProvider } from "./owner/OwnerContext.jsx";
import LabAnalytics from "./analytics/LabAnalytics.jsx";
import "./owner/OwnerUI.css";
import "./mango.css";

console.log("LAB ANALYTICS MODULE LOADED");

mountEngApp(document.getElementById("root"),
  <OwnerProvider>
      <LabAnalytics />
    </OwnerProvider>
);
