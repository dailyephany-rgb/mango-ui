import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import EngineeringApp from "./engineering/dashboard/EngineeringApp.jsx";
// Eng telemetry bootstrap (does not import clinical firebaseConfig)
import "./engineering/telemetry/bootstrap.js";

mountEngApp(document.getElementById("root"),
  <EngineeringApp />
);

