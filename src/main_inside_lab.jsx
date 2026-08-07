

import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import InsideLabRegister from "./inside_lab/InsideLab.jsx";
import "./inside_lab/InsideLab.css"; 

mountEngApp(document.getElementById("root"),
  <div className="backroom-container">
       <InsideLabRegister />
    </div>
);

