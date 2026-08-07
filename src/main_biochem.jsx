
import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";
import BiochemistryMain from "./biochem_main/BiochemistryMain.jsx";

createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BiochemistryMain />
  </React.StrictMode>
);
