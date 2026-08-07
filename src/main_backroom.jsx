
import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import BackroomMain from "./backroom/BackroomMain.jsx";
import "./backroom/Backroom.css";

mountEngApp(document.getElementById("root"),
  <BackroomMain />
);
