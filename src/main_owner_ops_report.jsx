import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import { OwnerProvider } from "./owner/OwnerContext.jsx";
import OperationsPerformanceReport from "./owner/ops/OperationsPerformanceReport.jsx";
import "./owner/OwnerUI.css";
import "./mango.css";
import "./firebaseConfig.js";

mountEngApp(
  document.getElementById("root"),
  <OwnerProvider>
    <OperationsPerformanceReport />
  </OwnerProvider>
);
