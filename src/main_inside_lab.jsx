

import React from "react";
import ReactDOM from "react-dom/client";
import InsideLabRegister from "./inside_lab/InsideLab.jsx";
import "./inside_lab/InsideLab.css"; 

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <div className="backroom-container">
       <InsideLabRegister />
    </div>
  </React.StrictMode>
);
