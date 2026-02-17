

import React from "react";
import ReactDOM from "react-dom/client";
import OutsourceRegister from "./outsource/Outsource.jsx";
import "./outsource/Outsource.css"; // Using the new separate CSS

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <div className="backroom-container">
       <OutsourceRegister />
    </div>
  </React.StrictMode>
);
