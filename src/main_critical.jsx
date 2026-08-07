
import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import CriticalAlertDashboard from "./critical/CriticalAlertDashboard.jsx";

mountEngApp(document.getElementById("root"),
  <CriticalAlertDashboard />
);
