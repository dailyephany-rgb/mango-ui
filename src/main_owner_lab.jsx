

import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";
import OwnerLabPage from "./owner/OwnerLabPage.jsx";
import { OwnerProvider } from "./owner/OwnerContext.jsx";
import "./owner/OwnerUI.css";

createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <OwnerLabPage />
    </OwnerProvider>
  </React.StrictMode>
);
