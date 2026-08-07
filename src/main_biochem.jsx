
import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import BiochemistryMain from "./biochem_main/BiochemistryMain.jsx";

mountEngApp(document.getElementById("root"),
  <BiochemistryMain />
);

