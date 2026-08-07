

import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import Haematology from "./haem/Haematology.jsx";

// 🩸 This is the entry point for Haematology Department UI
mountEngApp(document.getElementById("root"),
  <Haematology />
);
