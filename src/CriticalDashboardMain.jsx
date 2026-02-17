


import React from "react";
import ReactDOM from "react-dom/client";
// Since this file is in 'src', we look into the 'critical' subfolder
import CriticalAlertDashboard from './critical/CriticalAlertDashboard';
import './critical/CriticalDashboard.css';

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <div className="main-wrapper" style={{ width: '100%', minHeight: '100vh' }}>
      <CriticalAlertDashboard />
    </div>
  </React.StrictMode>
);
