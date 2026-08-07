

import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import OwnerBloodGroup from "./owner/OwnerBloodGroup.jsx";
import { OwnerProvider } from "./owner/OwnerContext.jsx";
import "./owner/OwnerUI.css";

mountEngApp(document.getElementById("root"),
  <OwnerProvider>
      <OwnerBloodGroup />
    </OwnerProvider>
);
