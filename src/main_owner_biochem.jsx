
import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";

import OwnerBiochem from "./owner/OwnerBiochem.jsx";
import { OwnerProvider } from "./owner/OwnerContext.jsx";

import "./owner/OwnerUI.css";

mountEngApp(document.getElementById("root"),
  <OwnerProvider>
      <OwnerBiochem />
    </OwnerProvider>
);
