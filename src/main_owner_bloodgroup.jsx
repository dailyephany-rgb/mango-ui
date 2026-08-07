

import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";
import OwnerBloodGroup from "./owner/OwnerBloodGroup.jsx";
import { OwnerProvider } from "./owner/OwnerContext.jsx";
import "./owner/OwnerUI.css";

createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <OwnerBloodGroup />
    </OwnerProvider>
  </React.StrictMode>
);