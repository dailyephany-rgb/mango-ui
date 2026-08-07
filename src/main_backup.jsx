
import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";
import BackupEntry from "./backup/BackupEntry.jsx"; // Adjust the path based on your folder structure

createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BackupEntry />
  </React.StrictMode>
);