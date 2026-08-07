

import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import ValidatorDashboard from "./ValidatorUI/ValidatorDashboard.jsx";
import "./ValidatorUI/ValidatorDashboard.css";

mountEngApp(document.getElementById("root"),
  <ValidatorDashboard />
);
