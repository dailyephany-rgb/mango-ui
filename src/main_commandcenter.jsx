
import React from "react";

import ReactDOM from "react-dom/client";

import {
  OwnerProvider
} from "./owner/OwnerContext.jsx";

import InventoryCommandCenter
from "./inventory-command-center/InventoryCommandCenter.jsx";

import "./owner/OwnerUI.css";

import "./mango.css";

import "./inventory-command-center/commandcenter.css";

console.log(
  "INVENTORY COMMAND CENTER LOADED"
);

ReactDOM
  .createRoot(
    document.getElementById("root")
  )
  .render(

    <React.StrictMode>

      <OwnerProvider>

        <InventoryCommandCenter />

      </OwnerProvider>

    </React.StrictMode>

  );