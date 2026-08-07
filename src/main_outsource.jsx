

import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";
import OutsourceRegister from "./outsource/Outsource.jsx";
import "./outsource/Outsource.css"; // Using the new separate CSS

createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <div className="backroom-container">
       <OutsourceRegister />
    </div>
  </React.StrictMode>
);
