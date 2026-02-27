
// src/main_master_admin.jsx
import React from "react";
import ReactDOM from "react-dom/client";

import { OwnerProvider } from "./owner/OwnerContext.jsx";
import MasterAdmin from "./master_admin/MasterAdmin.jsx"; // The UI component we created

import "./master_admin/MasterAdmin.css";
import "./mango.css";

console.log("MASTER ADMIN INTERFACE LOADED!");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerProvider>
      <MasterAdmin />
    </OwnerProvider>
  </React.StrictMode>
);