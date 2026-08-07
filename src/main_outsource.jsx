

import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import OutsourceRegister from "./outsource/Outsource.jsx";
import "./outsource/Outsource.css"; // Using the new separate CSS

mountEngApp(document.getElementById("root"),
  <div className="backroom-container">
       <OutsourceRegister />
    </div>
);

