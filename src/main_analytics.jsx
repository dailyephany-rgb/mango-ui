
import React from "react";
import ReactDOM from "react-dom/client";
import { OwnerProvider } from "./owner/OwnerContext.jsx";
import LabAnalytics from "./analytics/LabAnalytics.jsx";
import "./owner/OwnerUI.css";
import "./mango.css";

console.log("LAB ANALYTICS MODULE LOADED");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <LabAnalytics />
    </OwnerProvider>
  </React.StrictMode>
);