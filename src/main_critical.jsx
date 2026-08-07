
import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";
import CriticalAlertDashboard from "./critical/CriticalAlertDashboard.jsx";

createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <CriticalAlertDashboard />
  </React.StrictMode>
);