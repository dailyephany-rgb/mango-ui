

import React from "react";
import { createEngRoot } from "./engineering/telemetry/createEngRoot.js";
import InsideLabRegister from "./inside_lab/InsideLab.jsx";
import "./inside_lab/InsideLab.css"; 

createEngRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <div className="backroom-container">
       <InsideLabRegister />
    </div>
  </React.StrictMode>
);
