import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";
import EngineeringApp from "./engineering/dashboard/EngineeringApp.jsx";
// Eng telemetry bootstrap (does not import clinical firebaseConfig)
import "./engineering/telemetry/bootstrap.js";

createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <EngineeringApp />
  </React.StrictMode>
);
