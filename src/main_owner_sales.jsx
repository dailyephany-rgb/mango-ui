import React from "react";
import { mountEngApp } from "./shared/mountEngApp.jsx";
import { OwnerProvider } from "./owner/OwnerContext.jsx";
import SalesDataPage from "./owner/sales/SalesDataPage.jsx";
import "./owner/OwnerUI.css";
import "./mango.css";
import "./firebaseConfig.js";

mountEngApp(
  document.getElementById("root"),
  <OwnerProvider>
    <SalesDataPage />
  </OwnerProvider>
);
