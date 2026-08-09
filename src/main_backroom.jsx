
import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import BackroomMain from "./backroom/BackroomMain.jsx";
import "./backroom/Backroom.css";
// Boot eng telemetry before lazy register chunks (otherwise page_load can miss).
import "./firebaseConfig.js";

mountEngApp(document.getElementById("root"),
  <BackroomMain />
);
