
import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";

import OwnerBiochem from "./owner/OwnerBiochem.jsx";
import { OwnerProvider } from "./owner/OwnerContext.jsx";

import "./owner/OwnerUI.css";

createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <OwnerBiochem />
    </OwnerProvider>
  </React.StrictMode>
);