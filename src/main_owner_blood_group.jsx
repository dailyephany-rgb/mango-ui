

import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";

import { OwnerProvider } from "./owner/OwnerContext.jsx";
import OwnerBloodGroupPage from "./owner/OwnerBloodGroup.jsx";

import "./owner/OwnerUI.css";
import "./mango.css";

createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <OwnerBloodGroupPage />
    </OwnerProvider>
  </React.StrictMode>
);