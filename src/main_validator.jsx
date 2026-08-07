

import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";
import ValidatorDashboard from "./ValidatorUI/ValidatorDashboard.jsx";
import "./ValidatorUI/ValidatorDashboard.css";

createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ValidatorDashboard />
  </React.StrictMode>
);