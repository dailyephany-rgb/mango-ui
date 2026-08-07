

import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import CoagulationMain from "./coagulation/CoagulationMain.jsx";

mountEngApp(document.getElementById("root"),
  <CoagulationMain />
);
