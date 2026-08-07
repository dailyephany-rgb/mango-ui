
import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";
import BackroomMain from "./backroom/BackroomMain.jsx";
import "./backroom/Backroom.css";

createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BackroomMain />
  </React.StrictMode>
);