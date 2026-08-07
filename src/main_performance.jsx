import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";
import PerformanceDashboard from "./performance/PerformanceDashboard.jsx";

createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PerformanceDashboard />
  </React.StrictMode>
);
