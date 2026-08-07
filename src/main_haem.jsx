

import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";
import Haematology from "./haem/Haematology.jsx";

// 🩸 This is the entry point for Haematology Department UI
createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Haematology />
  </React.StrictMode>
);