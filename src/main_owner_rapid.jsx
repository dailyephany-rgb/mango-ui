

import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";

import { OwnerProvider } from "./owner/OwnerContext.jsx";
import OwnerRapidPage from "./owner/OwnerRapidPage.jsx";

import "./owner/OwnerUI.css";
import "./mango.css";

createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <OwnerRapidPage />
    </OwnerProvider>
  </React.StrictMode>
);