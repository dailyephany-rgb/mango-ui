


import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import OwnerOutsourcePage from "./owner/OwnerOutsourcePage.jsx";
import { OwnerProvider } from "./owner/OwnerContext.jsx";
import "./owner/OwnerUI.css";

mountEngApp(document.getElementById("root"),
  <OwnerProvider>
      <OwnerOutsourcePage />
    </OwnerProvider>
);

