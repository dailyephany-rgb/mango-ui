import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import PerformanceDashboard from "./performance/PerformanceDashboard.jsx";

mountEngApp(document.getElementById("root"),
  <PerformanceDashboard />
);

