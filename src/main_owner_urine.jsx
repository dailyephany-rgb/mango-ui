
import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import { OwnerProvider } from "./owner/OwnerContext.jsx";
import OwnerUrinePage from "./owner/OwnerUrine.jsx";
import "./owner/OwnerUI.css";
import "./mango.css";

mountEngApp(document.getElementById("root"),
  <OwnerProvider>
      <OwnerUrinePage />
    </OwnerProvider>
);
