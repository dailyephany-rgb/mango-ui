


import React from "react";
import ReactDOM from "react-dom/client";
import OwnerOutsourcePage from "./owner/OwnerOutsourcePage.jsx";
import { OwnerProvider } from "./owner/OwnerContext.jsx";
import "./owner/OwnerUI.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <OwnerOutsourcePage />
    </OwnerProvider>
  </React.StrictMode>
);
