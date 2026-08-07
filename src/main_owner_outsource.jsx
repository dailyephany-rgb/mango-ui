


import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";
import OwnerOutsourcePage from "./owner/OwnerOutsourcePage.jsx";
import { OwnerProvider } from "./owner/OwnerContext.jsx";
import "./owner/OwnerUI.css";

createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <OwnerOutsourcePage />
    </OwnerProvider>
  </React.StrictMode>
);
