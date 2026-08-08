
import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import CoagulationMain from "./coagulation/CoagulationMain.jsx";
// Ensure eng telemetry boots even if CoagulationMain import order changes.
import "./firebaseConfig.js";

mountEngApp(document.getElementById("root"),
  <CoagulationMain />
);
