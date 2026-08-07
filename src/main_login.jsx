
import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";
import LoginPage from "./auth/LoginPage";

createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LoginPage />
  </React.StrictMode>
);