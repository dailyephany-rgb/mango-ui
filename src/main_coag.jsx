

import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";
import CoagulationMain from "./coagulation/CoagulationMain.jsx";

createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <CoagulationMain />
  </React.StrictMode>
);