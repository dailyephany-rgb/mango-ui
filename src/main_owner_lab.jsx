

import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import OwnerLabPage from "./owner/OwnerLabPage.jsx";
import { OwnerProvider } from "./owner/OwnerContext.jsx";
import "./owner/OwnerUI.css";

mountEngApp(document.getElementById("root"),
  <OwnerProvider>
      <OwnerLabPage />
    </OwnerProvider>
);

