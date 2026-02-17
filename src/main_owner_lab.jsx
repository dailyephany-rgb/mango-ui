

import React from "react";
import ReactDOM from "react-dom/client";
import OwnerLabPage from "./owner/OwnerLabPage.jsx";
import { OwnerProvider } from "./owner/OwnerContext.jsx";
import "./owner/OwnerUI.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <OwnerLabPage />
    </OwnerProvider>
  </React.StrictMode>
);
