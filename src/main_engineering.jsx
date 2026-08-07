import React from "react";
import ReactDOM from "react-dom/client";
import EngineeringApp from "./engineering/dashboard/EngineeringApp.jsx";
// Eng telemetry bootstrap (does not import clinical firebaseConfig)
import "./engineering/telemetry/bootstrap.js";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <EngineeringApp />
  </React.StrictMode>
);
